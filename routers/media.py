# -*- coding: utf-8 -*-
"""
routers/media.py - 媒体资源、封面、视频代理和音量路由

路由：
  GET  /static/images/preview.png
  GET  /cover/{file_path:path}
  GET  /video_proxy
  POST /refresh_video_url
  POST /volume
  GET  /volume/defaults
"""

import os
import sys
import subprocess
import logging
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse, Response

from routers.state import PLAYER, _get_resource_path

logger = logging.getLogger(__name__)

router = APIRouter()

# ==================== 封面辅助函数 ====================

COVER_FILENAMES = [
    "cover.jpg", "cover.png", "cover.jpeg",
    "folder.jpg", "folder.png", "folder.jpeg",
    "album.jpg", "album.png", "album.jpeg",
    "front.jpg", "front.png", "front.jpeg",
    "albumart.jpg", "albumart.png", "albumart.jpeg",
    "Cover.jpg", "Cover.png", "Folder.jpg", "Folder.png",
]


def _get_cover_from_directory(file_path: str) -> str:
    """从音频文件所在目录查找封面文件"""
    directory = os.path.dirname(file_path)
    for cover_name in COVER_FILENAMES:
        cover_path = os.path.join(directory, cover_name)
        if os.path.isfile(cover_path):
            return cover_path
    return None


def _extract_embedded_cover_bytes(file_path: str) -> bytes:
    """使用 mutagen 提取音频文件内嵌封面，返回字节数据（不保存文件）

    支持格式：MP3 (ID3)、FLAC、M4A/AAC (MP4)、OGG/Opus
    """
    try:
        from mutagen import File
        from mutagen.id3 import ID3
        from mutagen.flac import FLAC
        from mutagen.mp4 import MP4
        from mutagen.oggvorbis import OggVorbis
        from mutagen.oggopus import OggOpus

        audio = File(file_path)
        if audio is None:
            return None

        # MP3: ID3 标签中的 APIC 帧
        if hasattr(audio, 'tags') and audio.tags:
            if isinstance(audio.tags, ID3):
                for key in audio.tags:
                    if key.startswith('APIC'):
                        apic = audio.tags[key]
                        return apic.data

            if isinstance(audio, MP4):
                if 'covr' in audio.tags:
                    covers = audio.tags['covr']
                    if covers:
                        return bytes(covers[0])

        if isinstance(audio, FLAC):
            if audio.pictures:
                return audio.pictures[0].data

        if isinstance(audio, (OggVorbis, OggOpus)):
            if hasattr(audio, 'pictures') and audio.pictures:
                return audio.pictures[0].data

    except Exception as e:
        logger.debug(f"提取内嵌封面失败: {e}")
    return None


# ==================== 路由 ====================

@router.get("/static/images/preview.png")
async def get_preview_image():
    """获取预览图片（优先程序运行目录，回退到 static 目录）"""
    local_preview = os.path.join(os.getcwd(), "preview.png")
    if os.path.isfile(local_preview):
        return FileResponse(local_preview, media_type="image/png")

    static_preview = _get_resource_path("static/images/preview.png")
    if os.path.isfile(static_preview):
        return FileResponse(static_preview, media_type="image/png")

    raise HTTPException(status_code=404, detail="Preview image not found")


@router.get("/cover/{file_path:path}")
async def get_cover(file_path: str):
    """获取本地歌曲或目录的封面

    对于文件：1. 优先提取音频内嵌封面  2. 回退到目录封面文件
    对于目录：查找目录中的 cover.jpg/folder.jpg 等
    """
    try:
        from urllib.parse import unquote

        decoded_path = unquote(file_path)

        if os.path.isabs(decoded_path):
            abs_path = decoded_path
        else:
            abs_path = os.path.join(PLAYER.music_dir, decoded_path)

        # 目录：查找封面文件
        if os.path.isdir(abs_path):
            cover_path = _get_cover_from_directory(abs_path)
            if cover_path and os.path.isfile(cover_path):
                ext = os.path.splitext(cover_path)[1].lower()
                media_type = {
                    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".png": "image/png", ".webp": "image/webp",
                }.get(ext, "image/jpeg")
                return FileResponse(cover_path, media_type=media_type)
            raise HTTPException(status_code=404, detail="未找到目录封面")

        if not os.path.isfile(abs_path):
            raise HTTPException(status_code=404, detail="文件不存在")

        # 文件：1. 提取内嵌封面
        cover_bytes = _extract_embedded_cover_bytes(abs_path)
        if cover_bytes:
            return Response(content=cover_bytes, media_type="image/jpeg")

        # 2. 目录封面文件
        cover_path = _get_cover_from_directory(abs_path)
        if cover_path and os.path.isfile(cover_path):
            ext = os.path.splitext(cover_path)[1].lower()
            media_type = {
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".webp": "image/webp",
            }.get(ext, "image/jpeg")
            return FileResponse(cover_path, media_type=media_type)

        # 回退：默认占位图
        placeholder = _get_resource_path("static/images/preview.png")
        if os.path.isfile(placeholder):
            return FileResponse(placeholder, media_type="image/png")

        raise HTTPException(status_code=404, detail="未找到封面")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取封面失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/video_proxy")
async def video_proxy(url: str, request: Request):
    """代理YouTube视频流，绕过CORS限制"""
    logger.info(f"[KTV] 📥 代理请求: {url[:200]}...")

    try:
        import httpx
        import re
        from urllib.parse import urljoin, quote

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
        }

        if 'range' in request.headers:
            headers['Range'] = request.headers['range']
            logger.info(f"[KTV] 📍 转发Range请求: {request.headers['range']}")

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)

            if response.status_code != 200 and response.status_code != 206:
                logger.error(f"[KTV] 视频代理请求失败: {response.status_code}")
                return JSONResponse(
                    {"status": "ERROR", "error": f"视频请求失败: {response.status_code}"},
                    status_code=response.status_code
                )

            content_type = response.headers.get('content-type', '')

            is_manifest = (
                'mpegurl' in content_type or
                '.m3u8' in url or
                'playlist' in url or
                '/manifest/' in url
            )

            if is_manifest:
                logger.info(f"[KTV] ✅ 检测到HLS清单文件")
                content = response.text
                base_url = url.rsplit('/', 1)[0] + '/'
                lines = content.split('\n')
                new_lines = []
                url_replace_count = 0

                for line in lines:
                    stripped_line = line.strip()

                    if 'URI="' in line:
                        def replace_uri(match):
                            nonlocal url_replace_count
                            original_url = match.group(1)
                            if not original_url.startswith('http'):
                                original_url = urljoin(base_url, original_url)
                            encoded_url = quote(original_url, safe='')
                            proxy_url = f"/video_proxy?url={encoded_url}"
                            url_replace_count += 1
                            return f'URI="{proxy_url}"'

                        modified_line = re.sub(r'URI="([^"]+)"', replace_uri, line)
                        new_lines.append(modified_line)

                    elif stripped_line and not stripped_line.startswith('#'):
                        original_url = stripped_line
                        if not original_url.startswith('http'):
                            original_url = urljoin(base_url, original_url)
                        encoded_url = quote(original_url, safe='')
                        proxy_line = f"/video_proxy?url={encoded_url}"
                        new_lines.append(proxy_line)
                        url_replace_count += 1
                    else:
                        new_lines.append(line)

                content = '\n'.join(new_lines)
                logger.info(f"[KTV] ✅ URL替换完成，共替换 {url_replace_count} 个URL")

                return Response(
                    content=content,
                    media_type='application/vnd.apple.mpegurl',
                    headers={
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                        'Access-Control-Allow-Headers': 'Range',
                        'Cache-Control': 'no-cache',
                    }
                )
            else:
                response_headers = {
                    'Content-Type': content_type or 'video/mp2t',
                    'Accept-Ranges': 'bytes',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range',
                }

                content_length = response.headers.get('content-length')
                if content_length:
                    response_headers['Content-Length'] = content_length

                content_range = response.headers.get('content-range')
                if content_range:
                    response_headers['Content-Range'] = content_range

                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    media_type=content_type or 'video/mp2t',
                    headers=response_headers
                )

    except Exception as e:
        logger.error(f"[KTV] 视频代理异常: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/refresh_video_url")
async def refresh_video_url():
    """重新获取当前播放歌曲的视频直链（当直链过期时调用）"""
    try:
        current_song = PLAYER.current_meta
        if not current_song or current_song.get("type") != "youtube":
            return JSONResponse(
                {"status": "ERROR", "error": "当前不是YouTube歌曲"},
                status_code=400
            )

        stream_url = current_song.get("url")
        if not stream_url:
            return JSONResponse(
                {"status": "ERROR", "error": "无法获取歌曲URL"},
                status_code=400
            )

        if getattr(sys, 'frozen', False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        bin_yt_dlp = os.path.join(app_dir, "bin", "yt-dlp.exe")
        yt_dlp_exe = bin_yt_dlp if os.path.exists(bin_yt_dlp) else "yt-dlp"

        video_id = current_song.get("video_id")
        if video_id:
            from models.url_cache import url_cache
            url_cache.invalidate(video_id)
            logger.info(f"[KTV] 已失效旧缓存: {video_id}")

        try:
            video_cmd = [yt_dlp_exe, "-f", "bestvideo[height<=720][ext=mp4]", "-g", stream_url]
            logger.info(f"[KTV] 刷新视频URL: {stream_url}")
            video_result = subprocess.run(
                video_cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if video_result.returncode == 0:
                video_urls = video_result.stdout.strip().split("\n")
                if video_urls and video_urls[0]:
                    new_video_url = video_urls[0].strip()
                    PLAYER.current_meta["video_url"] = new_video_url
                    logger.info(f"[KTV] 视频URL已刷新: {new_video_url[:100]}...")

                    if video_id:
                        from models.url_cache import url_cache
                        existing = url_cache.get(video_id)
                        audio_url = existing["audio_url"] if existing else current_song.get("url", "")
                        if audio_url:
                            url_cache.set(video_id, audio_url, new_video_url)

                    return {
                        "status": "OK",
                        "video_url": new_video_url
                    }

            logger.warning(f"[KTV] 获取视频URL失败 (code={video_result.returncode})")
            return JSONResponse(
                {"status": "ERROR", "error": "获取视频URL失败"},
                status_code=500
            )

        except Exception as e:
            logger.error(f"[KTV] 刷新视频URL异常: {e}")
            return JSONResponse(
                {"status": "ERROR", "error": str(e)},
                status_code=500
            )

    except Exception as e:
        logger.error(f"[KTV] refresh_video_url 异常: {e}")
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/volume")
async def set_volume(request: Request):
    """设置或获取音量"""
    try:
        form = await request.form()
        volume_str = form.get("value", "").strip()

        if volume_str:
            try:
                volume = int(volume_str)
                volume = max(0, min(100, volume))
                PLAYER.mpv_command(["set_property", "volume", volume])
                return {"status": "OK", "volume": volume}
            except ValueError:
                return JSONResponse(
                    {"status": "ERROR", "error": f"无效的音量值: {volume_str}"},
                    status_code=400
                )
        else:
            try:
                current_volume = PLAYER.mpv_get("volume")
                if current_volume is None:
                    local_volume = PLAYER.config.get("LOCAL_VOLUME", "50")
                    try:
                        return {"status": "OK", "volume": int(local_volume)}
                    except (ValueError, TypeError):
                        return {"status": "OK", "volume": 50}
                return {"status": "OK", "volume": int(float(current_volume))}
            except (ValueError, TypeError) as e:
                logger.warning(f"[警告] 获取音量失败: {e}")
                return {"status": "OK", "volume": 50}
    except Exception as e:
        logger.error(f"[错误] /volume 路由异常: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.get("/volume/defaults")
async def get_volume_defaults():
    """获取默认音量配置（从settings.ini）"""
    try:
        config = getattr(PLAYER, 'config', {})
        local_vol = config.get("LOCAL_VOLUME", "50") if config else "50"
        try:
            local_volume = int(local_vol)
        except (ValueError, TypeError):
            local_volume = 50
        return {"status": "OK", "local_volume": local_volume}
    except Exception as e:
        logger.error(f"Failed to get volume defaults: {e}")
        return {"status": "OK", "local_volume": 50}
