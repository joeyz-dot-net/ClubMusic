import json
import re
import os

def extract_video_id(url):
    # 支持 youtube.com/watch?v=xxx 和 youtu.be/xxx
    m = re.search(r'(?:v=|be/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else None

def fix_youtube_song(song):
    if not isinstance(song, dict):
        return False
    if song.get('type') != 'youtube':
        return False
    url = song.get('url', '')
    vid = extract_video_id(url)
    if not vid:
        return False
    song['video_id'] = vid
    song['stream_type'] = 'youtube'
    # 优先 maxresdefault，前端会自动降级
    song['thumbnail_url'] = f'https://img.youtube.com/vi/{vid}/maxresdefault.jpg'
    return True

def fix_file(path, key='songs'):
    print(f'处理: {path}')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    changed = False

    # playlists.json: data['playlists'][i]['songs']
    if 'playlists' in data:
        for pl in data['playlists']:
            for song in pl.get('songs', []):
                if fix_youtube_song(song):
                    changed = True
    else:
        # playback_history.json: list of dict
        for song in data:
            if fix_youtube_song(song):
                changed = True

    if changed:
        backup = path + '.bak'
        os.rename(path, backup)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'已修复并备份原文件为: {backup}')
    else:
        print('没有需要修复的内容')

if __name__ == '__main__':
    fix_file('playlists.json')
    fix_file('playback_history.json')