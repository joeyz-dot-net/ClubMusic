# -*- coding: utf-8 -*-
"""
routers/settings.py - 用户设置和 UI 配置路由

路由：
  GET  /settings
  POST /settings
  POST /settings/{key}
  POST /settings/reset
  GET  /settings/schema
  GET  /ui-config
  POST /ui-config
  GET  /diagnostic/ytdlp
"""

import os
import sys
import subprocess
import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from routers.state import PLAYER

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/settings")
async def get_user_settings():
    """获取默认设置（用户设置由浏览器 localStorage 管理）"""
    try:
        return {
            "status": "OK",
            "data": {
                "theme": "dark",
                "language": "auto"
            }
        }
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/settings")
async def update_user_settings(request: Request):
    """设置已由浏览器 localStorage 管理，此接口仅返回成功响应"""
    try:
        data = await request.json()
        logger.info(f"[设置] 浏览器端发送的设置: {data}（已由客户端保存到 localStorage）")
        return {
            "status": "OK",
            "message": "设置已保存到浏览器本地存储",
            "data": data
        }
    except Exception as e:
        logger.error(f"[设置] 处理失败: {e}")
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/settings/reset")
async def reset_settings():
    """重置设置为默认值（浏览器 localStorage）"""
    try:
        logger.info("[API] 重置设置请求（浏览器 localStorage）")
        default_settings = {
            "theme": "dark",
            "language": "auto"
        }
        return JSONResponse(
            {
                "status": "OK",
                "message": "已重置为默认设置（请清空 localStorage 重新加载）",
                "data": default_settings
            },
            status_code=200
        )
    except Exception as e:
        logger.exception(f"[API] 重置设置异常: {e}")
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/settings/{key}")
async def update_single_setting(key: str, request: Request):
    """更新单个设置（由浏览器 localStorage 管理）"""
    try:
        data = await request.json()
        value = data.get("value")

        default_settings = {
            "theme": "dark",
            "language": "auto"
        }

        if key not in default_settings:
            return JSONResponse(
                {"status": "ERROR", "error": f"未知的设置项: {key}"},
                status_code=400
            )

        logger.info(f"[设置] 客户端更新 {key} = {value}（已保存到localStorage）")
        return {
            "status": "OK",
            "message": f"已更新 {key}（客户端存储）",
            "data": {key: value}
        }
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.get("/settings/schema")
async def get_settings_schema():
    """获取设置项的描述和可选值"""
    return {
        "status": "OK",
        "schema": {
            "theme": {
                "type": "select",
                "label": "主题样式",
                "options": [
                    {"value": "light", "label": "浅色"},
                    {"value": "dark", "label": "深色"},
                    {"value": "auto", "label": "自动"}
                ],
                "default": "dark"
            },
            "language": {
                "type": "select",
                "label": "语言",
                "options": [
                    {"value": "auto", "label": "自动选择"},
                    {"value": "zh", "label": "中文"},
                    {"value": "en", "label": "English"}
                ],
                "default": "auto"
            }
        }
    }


@router.get("/ui-config")
async def get_ui_config():
    """获取 UI 配置（从 settings.ini）"""
    try:
        import configparser
        from pathlib import Path

        config = configparser.ConfigParser()
        config_file = Path("settings.ini")

        default_config = {
            "youtube_controls": True,
            "expand_button": True,
            "url_cache_enabled": True,
        }

        if config_file.exists():
            config.read(config_file, encoding="utf-8")
            youtube_controls = config.getboolean('ui', 'youtube_controls', fallback=True)
            expand_button = config.getboolean('ui', 'expand_button', fallback=True)
            url_cache_enabled = config.getboolean('cache', 'url_cache_enabled', fallback=True)
            return {
                "status": "OK",
                "data": {
                    "youtube_controls": youtube_controls,
                    "expand_button": expand_button,
                    "url_cache_enabled": url_cache_enabled,
                }
            }

        return {
            "status": "OK",
            "data": default_config
        }
    except Exception as e:
        logger.error(f"[UI配置] 读取失败: {e}")
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/ui-config")
async def update_ui_config(request: Request):
    """更新 UI 配置（写入 settings.ini）"""
    try:
        import configparser
        from pathlib import Path

        data = await request.json()
        youtube_controls = data.get("youtube_controls", True)
        expand_button = data.get("expand_button", True)
        url_cache_enabled = data.get("url_cache_enabled", True)

        config = configparser.ConfigParser()
        config_file = Path("settings.ini")

        if config_file.exists():
            config.read(config_file, encoding="utf-8")

        if not config.has_section('ui'):
            config.add_section('ui')
        if not config.has_section('cache'):
            config.add_section('cache')

        config.set('ui', 'youtube_controls', str(youtube_controls).lower())
        config.set('ui', 'expand_button', str(expand_button).lower())
        config.set('cache', 'url_cache_enabled', str(url_cache_enabled).lower())

        with open(config_file, 'w', encoding='utf-8') as f:
            config.write(f)

        try:
            from models.url_cache import url_cache as _url_cache
            _url_cache.reload_config()
        except Exception as e:
            logger.warning(f"[UI配置] 重载缓存配置失败（无害）: {e}")

        logger.info(f"[UI配置] 已更新: YouTube控件={youtube_controls}, 放大按钮={expand_button}, URL缓存={url_cache_enabled}")
        return {
            "status": "OK",
            "message": "UI配置已保存到 settings.ini",
            "data": {
                "youtube_controls": youtube_controls,
                "expand_button": expand_button,
                "url_cache_enabled": url_cache_enabled,
            }
        }
    except Exception as e:
        logger.error(f"[UI配置] 保存失败: {e}")
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.get("/diagnostic/ytdlp")
async def diagnostic_ytdlp():
    """诊断 yt-dlp 配置状态（用于排查网络歌曲播放问题）"""
    try:
        if getattr(sys, 'frozen', False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        bin_yt_dlp = os.path.join(app_dir, "bin", "yt-dlp.exe")

        result = {
            "status": "OK",
            "yt_dlp_path": bin_yt_dlp,
            "exists": os.path.exists(bin_yt_dlp),
            "executable": os.access(bin_yt_dlp, os.X_OK) if os.path.exists(bin_yt_dlp) else False,
            "mpv_running": PLAYER.mpv_pipe_exists(),
            "mpv_cmd": PLAYER.mpv_cmd,
            "env_yt_dlp_path": os.environ.get('YT_DLP_PATH', 'Not Set'),
        }

        if result["exists"]:
            try:
                test_result = subprocess.run(
                    [bin_yt_dlp, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                result["version"] = test_result.stdout.strip()
                result["working"] = test_result.returncode == 0
            except Exception as e:
                result["test_error"] = str(e)
                result["working"] = False

        return result
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )
