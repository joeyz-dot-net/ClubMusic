"""
歌曲类及其子类
包括: Song(基类), LocalSong(本地歌曲), StreamSong(串流歌曲)
"""
import os
import time
from urllib.parse import urlparse, parse_qs


class Song:
	"""歌曲基类 - 可以是本地文件或串流媒体"""
	
	def __init__(self, url: str, title: str = None, song_type: str = 'local', duration: float = 0):
		"""
		初始化歌曲对象
		
		参数:
		  url: 歌曲URL或本地文件路径
		  title: 歌曲标题
		  song_type: 歌曲类型 ('local' 或 'youtube')
		  duration: 歌曲时长（秒）
		"""
		self.url = url
		self.title = title or self._extract_title_from_url(url)
		self.type = song_type
		self.duration = duration
		self.timestamp = int(time.time())
	
	def _extract_title_from_url(self, url: str) -> str:
		"""从URL提取标题"""
		if url.startswith('http'):
			return '加载中…'
		return os.path.basename(url)
	
	def is_local(self) -> bool:
		"""是否为本地文件"""
		return self.type == 'local'
	
	def is_stream(self) -> bool:
		"""是否为串流媒体"""
		return self.type in ('youtube', 'stream')
	
	def to_dict(self) -> dict:
		"""转换为字典"""
		return {
			'url': self.url,
			'title': self.title,
			'name': self.title,  # 别名，用于兼容前端
			'type': self.type,
			'duration': self.duration,
			'ts': self.timestamp
		}
	
	@classmethod
	def from_dict(cls, data: dict):
		"""从字典创建歌曲对象"""
		song_type = data.get('type', 'local')
		# 根据类型创建相应的子类实例
		if song_type == 'local':
			return LocalSong(
				file_path=data.get('url', ''),
				title=data.get('title'),
				duration=data.get('duration', 0)
			)
		else:
			return StreamSong(
				stream_url=data.get('url', ''),
				title=data.get('title'),
				stream_type=song_type,
				duration=data.get('duration', 0)
			)
	
	def __repr__(self):
		return f"Song(title='{self.title}', type='{self.type}', url='{self.url[:50]}...')"


class LocalSong(Song):
	"""本地歌曲类 - 代表本地文件系统中的音乐文件"""
	
	def __init__(self, file_path: str, title: str = None, duration: float = 0):
		"""
		初始化本地歌曲对象
		
		参数:
		  file_path: 本地文件路径（相对或绝对路径）
		  title: 歌曲标题（如果为空，从文件名提取）
		  duration: 歌曲时长（秒）
		"""
		super().__init__(url=file_path, title=title, song_type='local', duration=duration)
		self.file_path = file_path
		self.file_name = os.path.basename(file_path)
		self.file_extension = os.path.splitext(file_path)[1].lower()
	
	def _extract_title_from_url(self, url: str) -> str:
		"""从文件路径提取标题"""
		filename = os.path.basename(url)
		# 去除文件扩展名
		name_without_ext = os.path.splitext(filename)[0]
		return name_without_ext
	
	def exists(self) -> bool:
		"""检查文件是否存在"""
		return os.path.exists(self.file_path)
	
	def get_file_size(self) -> int:
		"""获取文件大小（字节）"""
		try:
			return os.path.getsize(self.file_path) if self.exists() else 0
		except Exception:
			return 0
	
	def get_absolute_path(self, base_dir: str = None) -> str:
		"""获取绝对路径"""
		if os.path.isabs(self.file_path):
			return self.file_path
		if base_dir:
			return os.path.join(base_dir, self.file_path)
		return os.path.abspath(self.file_path)
	
	def play(self, mpv_command_func, mpv_pipe_exists_func, ensure_mpv_func, 
	         add_to_history_func=None, save_to_history: bool = True, music_dir: str = None):
		"""播放本地歌曲
		
		参数:
		  mpv_command_func: mpv命令函数
		  mpv_pipe_exists_func: 检查mpv管道是否存在的函数
		  ensure_mpv_func: 确保mpv运行的函数
		  add_to_history_func: 添加到历史记录的函数（可选）
		  save_to_history: 是否保存到历史
		  music_dir: 音乐库目录（用于解析相对路径）
		"""
		abs_file = self.get_absolute_path(base_dir=music_dir)
		print(f"[DEBUG] LocalSong.play -> 播放本地文件: {abs_file}")
		
		try:
			# 确保 mpv 管道存在
			if not mpv_pipe_exists_func():
				print(f"[WARN] mpv 管道不存在，尝试启动 mpv...")
				if not ensure_mpv_func():
					raise RuntimeError("无法启动或连接到 mpv")
			
			mpv_command_func(['loadfile', abs_file, 'replace'])
			
			# 添加到播放历史
			if save_to_history and add_to_history_func:
				add_to_history_func(self.file_path, self.title, is_local=True)
			
			return True
		except Exception as e:
			print(f"[ERROR] LocalSong.play failed: {e}")
			return False
	
	def to_dict(self) -> dict:
		"""转换为字典"""
		data = super().to_dict()
		data.update({
			'file_name': self.file_name,
			'file_extension': self.file_extension,
			'file_size': self.get_file_size()
		})
		return data
	
	def __repr__(self):
		return f"LocalSong(title='{self.title}', file='{self.file_name}')"


class StreamSong(Song):
	"""串流歌曲类 - 代表在线串流媒体（如YouTube）"""
	
	def __init__(self, stream_url: str, title: str = None, stream_type: str = 'youtube', duration: float = 0):
		"""
		初始化串流歌曲对象
		
		参数:
		  stream_url: 串流媒体URL
		  title: 歌曲标题
		  stream_type: 串流类型 ('youtube', 'stream' 等)
		  duration: 歌曲时长（秒）
		"""
		super().__init__(url=stream_url, title=title, song_type=stream_type, duration=duration)
		self.stream_url = stream_url
		self.stream_type = stream_type
		self.video_id = self._extract_video_id(stream_url)
	
	def _extract_title_from_url(self, url: str) -> str:
		"""从URL提取标题（串流媒体需要从API获取）"""
		return '加载中…'
	
	def _extract_video_id(self, url: str) -> str:
		"""从YouTube URL提取视频ID"""
		if 'youtube.com/watch' in url:
			try:
				parsed = urlparse(url)
				video_id = parse_qs(parsed.query).get('v', [None])[0]
				return video_id or ''
			except Exception:
				return ''
		elif 'youtu.be/' in url:
			try:
				return url.split('youtu.be/')[1].split('?')[0]
			except Exception:
				return ''
		return ''
	
	def is_youtube(self) -> bool:
		"""是否为YouTube视频"""
		return self.stream_type == 'youtube' or 'youtube' in self.stream_url.lower()
	
	def get_thumbnail_url(self) -> str:
		"""获取缩略图URL（仅YouTube）"""
		if self.is_youtube() and self.video_id:
			return f"https://img.youtube.com/vi/{self.video_id}/default.jpg"
		return ''
	
	def get_watch_url(self) -> str:
		"""获取观看URL"""
		if self.is_youtube() and self.video_id:
			return f"https://www.youtube.com/watch?v={self.video_id}"
		return self.stream_url
	
	def play(self, mpv_command_func, mpv_pipe_exists_func, ensure_mpv_func, 
	         add_to_history_func=None, save_to_history: bool = True, music_dir: str = None):
		"""播放串流媒体
		
		参数:
		  mpv_command_func: mpv命令函数
		  mpv_pipe_exists_func: 检查mpv管道是否存在的函数
		  ensure_mpv_func: 确保mpv运行的函数
		  add_to_history_func: 添加到历史记录的函数（可选）
		  save_to_history: 是否保存到历史
		  music_dir: 音乐库目录（串流不需要此参数）
		"""
		print(f"[DEBUG] StreamSong.play -> 播放串流: {self.stream_url}")
		
		try:
			# 检查 mpv 进程是否运行
			if not mpv_pipe_exists_func():
				print(f"[WARN] mpv pipe 不存在，尝试启动 mpv...")
				if not ensure_mpv_func():
					raise RuntimeError("无法启动或连接到 mpv")
			
			# 设置 ytdl-format 为最佳音质
			print(f"[DEBUG] 设置 mpv 属性: ytdl-format=bestaudio")
			mpv_command_func(['set_property', 'ytdl-format', 'bestaudio'])
			
			print(f"[DEBUG] 加载文件: {self.stream_url}")
			mpv_command_func(['loadfile', self.stream_url, 'replace'])
			
			# 添加到播放历史
			if save_to_history and add_to_history_func:
				add_to_history_func(self.stream_url, self.title, is_local=False)
			
			return True
		except Exception as e:
			print(f"[ERROR] StreamSong.play failed: {e}")
			return False
	
	def to_dict(self) -> dict:
		"""转换为字典"""
		data = super().to_dict()
		data.update({
			'stream_type': self.stream_type,
			'video_id': self.video_id,
			'thumbnail_url': self.get_thumbnail_url()
		})
		return data
	
	@staticmethod
	def search(query: str, max_results: int = 10) -> dict:
		"""搜索 YouTube 视频
		
		参数:
		  query: 搜索关键字
		  max_results: 最大搜索结果数（默认10）
		
		返回:
		  {'status': 'OK'/'ERROR', 'results': [...]} 或 {'status': 'ERROR', 'error': '错误信息'}
		"""

		if not query or not query.strip():
			return {'status': 'ERROR', 'error': '搜索关键字不能为空'}
		
		try:
			import yt_dlp
			print(f"[DEBUG] 搜索 YouTube: {query}")
			
			# 使用 yt-dlp 搜索 YouTube
			ydl_opts = {
				'quiet': True,
				'no_warnings': True,
				'default_search': 'ytsearch',
				'extract_flat': 'in_playlist',
			}
			with yt_dlp.YoutubeDL(ydl_opts) as ydl:
				# 搜索结果
				result = ydl.extract_info(f'ytsearch{max_results}:{query}', download=False)
				results = []
				if result and 'entries' in result:
					for item in result['entries'][:max_results]:
						if item:
							results.append({
								'url': f"https://www.youtube.com/watch?v={item['id']}",
								'title': item.get('title', 'Unknown'),
								'duration': item.get('duration', 0),
								'uploader': item.get('uploader', 'Unknown'),
								'id': item.get('id', '')
							})
				print(f"[DEBUG] 搜索完成，找到 {len(results)} 个结果")
				return {'status': 'OK', 'results': results}
		except Exception as e:
			print(f'[ERROR] YouTube 搜索失败: {str(e)}')
			import traceback
			traceback.print_exc()
			return {'status': 'ERROR', 'error': f'搜索失败: {str(e)}'}
	
	@staticmethod
	def extract_playlist(url: str) -> dict:
		"""提取 YouTube 播放列表中的所有视频
		
		参数:
		  url: 播放列表 URL
		
		返回:
		  {'status': 'OK'/'ERROR', 'entries': [...]} 或 {'status': 'ERROR', 'error': '错误信息'}
		"""
		if not url or not url.strip():
			return {'status': 'ERROR', 'error': '播放列表 URL 不能为空'}
		
		try:
			import yt_dlp
			print(f"[DEBUG] 提取播放列表: {url}")
			
			# 使用 yt-dlp 提取播放列表
			ydl_opts = {
				'quiet': True,
				'no_warnings': True,
				'extract_flat': 'in_playlist',
			}
			with yt_dlp.YoutubeDL(ydl_opts) as ydl:
				result = ydl.extract_info(url, download=False)
				entries = []
				
				if result and 'entries' in result:
					for item in result['entries']:
						if item:
							entry_url = item.get('url') or item.get('id')
							# 构建完整的 YouTube URL
							if entry_url and not entry_url.startswith('http'):
								if len(entry_url) == 11:  # 可能是视频 ID
									entry_url = f'https://www.youtube.com/watch?v={entry_url}'
							
							entries.append({
								'url': entry_url,
								'title': item.get('title', '未知'),
								'id': item.get('id', '')
							})
					
					print(f"[DEBUG] 提取到 {len(entries)} 个视频")
					return {'status': 'OK', 'entries': entries}
				else:
					print(f"[WARN] 播放列表为空或无法解析")
					return {'status': 'ERROR', 'error': '播放列表为空或无法解析'}
		except Exception as e:
			print(f'[ERROR] 提取播放列表失败: {str(e)}')
			import traceback
			traceback.print_exc()
			return {'status': 'ERROR', 'error': f'提取播放列表失败: {str(e)}'}
	
	def __repr__(self):
		return f"StreamSong(title='{self.title}', type='{self.stream_type}', id='{self.video_id}')"

