import json
import yt_dlp
import re

# 读取播放历史
with open('playback_history.json', 'r', encoding='utf-8') as f:
    history = json.load(f)

# 提取所有YouTube视频ID或链接
def extract_youtube_ids(history):
    ids = set()
    url_pattern = re.compile(r'(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11})')
    for item in history:
        # 假设每个item有url或videoId字段
        url = item.get('url') or item.get('videoUrl') or ''
        video_id = item.get('videoId')
        if video_id:
            ids.add(video_id)
        else:
            match = url_pattern.search(url)
            if match:
                ids.add(match.group(1))
    return list(ids)

video_ids = extract_youtube_ids(history)

print(f"共检测 {len(video_ids)} 个视频...")

# 检查视频是否可用
def check_video_available(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        'quiet': True,
        'skip_download': True,
        'ignoreerrors': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                return False
            # 检查是否有unavailable等字段
            if info.get('is_unavailable') or info.get('extractor_key') == 'YoutubeUnavailable':
                return False
            return True
    except Exception as e:
        return False

# 检查所有视频
unavailable = []
for vid in video_ids:
    available = check_video_available(vid)
    if not available:
        unavailable.append(vid)
        print(f"失效: https://www.youtube.com/watch?v={vid}")
    else:
        print(f"可用: https://www.youtube.com/watch?v={vid}")

print("\n失效视频列表：")
for vid in unavailable:
    print(f"https://www.youtube.com/watch?v={vid}")

print(f"\n共失效 {len(unavailable)} 个视频。")