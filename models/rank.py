"""
排行榜模块 - 提供不同类型的排行榜功能
"""

import time
from abc import ABC, abstractmethod
from typing import List, Dict, Any


class Rank(ABC):
    """排行榜基类 - 抽象基类"""

    def __init__(self, max_size: int = 100):
        """初始化排行榜

        参数:
          max_size: 排行榜最大显示条数（默认 100）
        """
        self._max_size = max_size

    @abstractmethod
    def calculate(self, items: List[Dict[str, Any]], period: str = 'all') -> List[Dict[str, Any]]:
        """计算排行榜数据

        参数:
          items: 原始数据项列表
          period: 时间周期 ('all', 'week', 'month')

        返回:
          排序后的排行榜列表
        """
        pass

    @abstractmethod
    def get_rankings(self, items: List[Dict[str, Any]], period: str = 'all', limit: int = 10) -> List[Dict[str, Any]]:
        """获取排行榜

        参数:
          items: 原始数据项列表
          period: 时间周期
          limit: 返回的最大条数

        返回:
          排行榜列表（带排名）
        """
        pass

    def _filter_by_period(self, items: List[Dict[str, Any]], period: str) -> List[Dict[str, Any]]:
        """根据时间周期过滤项目

        参数:
          items: 数据项列表
          period: 时间周期 ('all', 'day', 'week', 'month', 'quarter', 'year')

        返回:
          过滤后的列表
        """
        if period == 'all':
            return items

        import datetime
        now = time.time()
        
        if period == 'day':
            # 获取今天 00:00:00 的时间戳
            today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            cutoff_time = today_start.timestamp()
        elif period == 'week':
            # 最近7天 - 从今天00:00往前推7天
            today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = today_start - datetime.timedelta(days=7)
            cutoff_time = week_start.timestamp()
        elif period == 'month':
            # 最近30天
            cutoff_time = now - (30 * 24 * 60 * 60)
        elif period == 'quarter':
            # 最近90天
            cutoff_time = now - (90 * 24 * 60 * 60)
        elif period == 'year':
            # 最近365天
            cutoff_time = now - (365 * 24 * 60 * 60)
        else:
            return items

        return [item for item in items if item.get('ts', 0) >= cutoff_time]

    def __repr__(self):
        return f"{self.__class__.__name__}(max_size={self._max_size})"


class HitRank(Rank):
    """播放点击排行 - 统计歌曲播放次数排行

    根据歌曲的播放次数进行排序，支持按时间周期过滤。
    """

    def __init__(self, max_size: int = 100):
        """初始化播放排行

        参数:
          max_size: 排行榜最大显示条数（默认 100）
        """
        super().__init__(max_size=max_size)

    def _get_cutoff_time(self, period: str) -> float:
        """获取指定时间周期的截止时间戳

        参数:
          period: 时间周期 ('day', 'week', 'month', 'quarter', 'year')

        返回:
          截止时间戳（Unix秒），早于此时间的播放不计入
        """
        import datetime
        now = time.time()

        if period == 'day':
            today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            return today_start.timestamp()
        elif period == 'week':
            today_start = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = today_start - datetime.timedelta(days=7)
            return week_start.timestamp()
        elif period == 'month':
            return now - (30 * 24 * 60 * 60)
        elif period == 'quarter':
            return now - (90 * 24 * 60 * 60)
        elif period == 'year':
            return now - (365 * 24 * 60 * 60)
        return 0

    def calculate(self, items: List[Dict[str, Any]], period: str = 'all') -> List[Dict[str, Any]]:
        """计算播放排行

        参数:
          items: 播放历史项列表，每项应包含 'url', 'title', 'play_count', 'ts', 'timestamps' 等字段
          period: 时间周期 ('all', 'day', 'week', 'month', 'quarter', 'year')

        返回:
          按播放次数排序的列表
        """
        if not items:
            return []

        rankings_dict = {}

        if period == 'all':
            # 全部时间：直接使用 play_count
            for item in items:
                url = item.get('url')
                if not url:
                    continue
                if url not in rankings_dict:
                    rankings_dict[url] = {
                        'url': url,
                        'title': item.get('title') or item.get('name') or '未知歌曲',
                        'type': item.get('type', 'local'),
                        'thumbnail_url': item.get('thumbnail_url'),
                        'ts': item.get('ts', 0),
                        'play_count': 0,
                    }
                rankings_dict[url]['play_count'] += item.get('play_count', 1)
        else:
            # 按周期过滤：解析 timestamps 字段，只统计周期内的播放次数
            cutoff_time = self._get_cutoff_time(period)
            for item in items:
                url = item.get('url')
                if not url:
                    continue

                # 解析逗号分隔的时间戳列表
                timestamps_str = item.get('timestamps', '')
                if timestamps_str:
                    try:
                        all_ts = [int(t) for t in str(timestamps_str).split(',')]
                    except (ValueError, TypeError):
                        all_ts = []
                else:
                    ts = item.get('ts', 0)
                    all_ts = [ts] if ts else []

                # 只统计截止时间之后的播放次数
                period_count = sum(1 for t in all_ts if t >= cutoff_time)
                if period_count == 0:
                    continue

                if url not in rankings_dict:
                    rankings_dict[url] = {
                        'url': url,
                        'title': item.get('title') or item.get('name') or '未知歌曲',
                        'type': item.get('type', 'local'),
                        'thumbnail_url': item.get('thumbnail_url'),
                        'ts': item.get('ts', 0),
                        'play_count': 0,
                    }
                rankings_dict[url]['play_count'] += period_count

        # 转换为列表并按播放次数排序
        rankings = list(rankings_dict.values())
        rankings.sort(key=lambda x: x['play_count'], reverse=True)

        return rankings

    def get_rankings(self, items: List[Dict[str, Any]], period: str = 'all', limit: int = 10) -> List[Dict[str, Any]]:
        """获取播放排行

        参数:
          items: 播放历史项列表
          period: 时间周期
          limit: 返回的最大条数

        返回:
          排行榜列表，每项带有 'rank' 字段
        """
        # 计算排行
        rankings = self.calculate(items, period)

        # 限制条数
        rankings = rankings[:min(limit, self._max_size)]

        # 添加排名
        for idx, item in enumerate(rankings, 1):
            item['rank'] = idx

        return rankings

    def get_top_n(self, items: List[Dict[str, Any]], n: int = 3, period: str = 'all') -> List[Dict[str, Any]]:
        """获取前N名

        参数:
          items: 播放历史项列表
          n: 前N名
          period: 时间周期

        返回:
          前N名排行榜
        """
        return self.get_rankings(items, period, n)

    def is_in_top_n(self, items: List[Dict[str, Any]], url: str, n: int = 3, period: str = 'all') -> bool:
        """检查某个URL是否在前N名中

        参数:
          items: 播放历史项列表
          url: 要检查的URL
          n: 前N名
          period: 时间周期

        返回:
          True 如果在前N名中，否则 False
        """
        top_n = self.get_top_n(items, n, period)
        return any(item['url'] == url for item in top_n)
