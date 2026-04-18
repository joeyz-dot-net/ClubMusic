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
    GET  /diagnostic/instance-status
  GET  /diagnostic/ytdlp
"""

import os
import sys
import subprocess
import logging
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse

from models.api_contracts import (
    DiagnosticInstanceStatusResponse,
    DiagnosticYtDlpResponse,
    ErrorResponse,
    SettingsMutationResponse,
    SettingsSchemaResponse,
    SettingsValueRequest,
    UIConfigMutationResponse,
    UIConfigRequest,
    UIConfigResponse,
    UserSettingsResponse,
    UserSettingsUpdateRequest,
    VersionResponse,
)
from models.player import MusicPlayer
from routers.state import error_response
from routers.dependencies import get_player
from startup_cleanup import get_service_instance_status

logger = logging.getLogger(__name__)

router = APIRouter()

APP_VERSION = "2.0.0"

_SETTINGS_ERROR_RESPONSES = {
    500: {"model": ErrorResponse, "description": "Unexpected server error"},
}
_SETTINGS_KEY_ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Unknown setting key"},
    500: {"model": ErrorResponse, "description": "Unexpected server error"},
}


@router.get("/version", response_model=VersionResponse, response_model_exclude_none=True)
async def get_version():
    """返回应用版本号"""
    return {"status": "OK", "version": APP_VERSION}


@router.get(
    "/settings",
    response_model=UserSettingsResponse,
    response_model_exclude_none=True,
    responses=_SETTINGS_ERROR_RESPONSES,
)
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
        return error_response("[GET /settings] 获取设置异常", exc=e, _logger=logger)


@router.post(
    "/settings",
    response_model=SettingsMutationResponse,
    response_model_exclude_none=True,
    responses=_SETTINGS_ERROR_RESPONSES,
)
async def update_user_settings(payload: UserSettingsUpdateRequest):
    """设置已由浏览器 localStorage 管理，此接口仅返回成功响应"""
    try:
        data = payload.model_dump(exclude_none=True)
        logger.info(f"[设置] 浏览器端发送的设置: {data}（已由客户端保存到 localStorage）")
        return {
            "status": "OK",
            "message": "设置已保存到浏览器本地存储",
            "data": data
        }
    except Exception as e:
        return error_response("[POST /settings] 处理设置异常", exc=e, _logger=logger)


@router.post(
    "/settings/reset",
    response_model=SettingsMutationResponse,
    response_model_exclude_none=True,
    responses=_SETTINGS_ERROR_RESPONSES,
)
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
        return error_response("[POST /settings/reset] 重置设置异常", exc=e, _logger=logger)


@router.post(
    "/settings/{key}",
    response_model=SettingsMutationResponse,
    response_model_exclude_none=True,
    responses=_SETTINGS_KEY_ERROR_RESPONSES,
)
async def update_single_setting(key: str, payload: SettingsValueRequest):
    """更新单个设置（由浏览器 localStorage 管理）"""
    try:
        value = payload.value

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
        return error_response(f"[POST /settings/{key}] 更新设置异常", exc=e, _logger=logger)


@router.get("/settings/schema", response_model=SettingsSchemaResponse, response_model_exclude_none=True)
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


@router.get(
    "/ui-config",
    response_model=UIConfigResponse,
    response_model_exclude_none=True,
    responses=_SETTINGS_ERROR_RESPONSES,
)
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
            "settings_nav_visible": True,
            "url_cache_enabled": True,
        }

        if config_file.exists():
            config.read(config_file, encoding="utf-8")
            youtube_controls = config.getboolean('ui', 'youtube_controls', fallback=True)
            expand_button = config.getboolean('ui', 'expand_button', fallback=True)
            settings_nav_visible = config.getboolean('ui', 'settings_nav_visible', fallback=True)
            url_cache_enabled = config.getboolean('cache', 'url_cache_enabled', fallback=True)
            return {
                "status": "OK",
                "data": {
                    "youtube_controls": youtube_controls,
                    "expand_button": expand_button,
                    "settings_nav_visible": settings_nav_visible,
                    "url_cache_enabled": url_cache_enabled,
                }
            }

        return {
            "status": "OK",
            "data": default_config
        }
    except Exception as e:
        return error_response("[GET /ui-config] 读取UI配置异常", exc=e, _logger=logger)


@router.post(
    "/ui-config",
    response_model=UIConfigMutationResponse,
    response_model_exclude_none=True,
    responses=_SETTINGS_ERROR_RESPONSES,
)
async def update_ui_config(payload: UIConfigRequest):
    """更新 UI 配置（写入 settings.ini）"""
    try:
        import configparser
        from pathlib import Path

        youtube_controls = payload.youtube_controls
        expand_button = payload.expand_button
        settings_nav_visible = payload.settings_nav_visible
        url_cache_enabled = payload.url_cache_enabled

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
        config.set('ui', 'settings_nav_visible', str(settings_nav_visible).lower())
        config.set('cache', 'url_cache_enabled', str(url_cache_enabled).lower())

        with open(config_file, 'w', encoding='utf-8') as f:
            config.write(f)

        try:
            from models.url_cache import url_cache as _url_cache
            _url_cache.reload_config()
        except Exception as e:
            logger.warning(f"[UI配置] 重载缓存配置失败（无害）: {e}")

        logger.info(
            f"[UI配置] 已更新: YouTube控件={youtube_controls}, 放大按钮={expand_button}, "
            f"设置导航={settings_nav_visible}, URL缓存={url_cache_enabled}"
        )
        return {
            "status": "OK",
            "message": "UI配置已保存到 settings.ini",
            "data": {
                "youtube_controls": youtube_controls,
                "expand_button": expand_button,
                "settings_nav_visible": settings_nav_visible,
                "url_cache_enabled": url_cache_enabled,
            }
        }
    except Exception as e:
        return error_response("[POST /ui-config] 保存UI配置异常", exc=e, _logger=logger)


@router.get(
    "/diagnostic/instance-status",
    response_model=DiagnosticInstanceStatusResponse,
    response_model_exclude_none=True,
    responses=_SETTINGS_ERROR_RESPONSES,
)
async def diagnostic_instance_status():
    """诊断主服务实例锁和端口状态。"""
    try:
        import configparser
        from pathlib import Path

        config = configparser.ConfigParser()
        config_file = Path("settings.ini")
        if config_file.exists():
            config.read(config_file, encoding="utf-8")

        server_host = config.get("app", "server_host", fallback="0.0.0.0")
        server_port = config.getint("app", "server_port", fallback=80)
        status = get_service_instance_status(server_host, server_port)
        return {
            "status": "OK",
            "data": status,
        }
    except Exception as e:
        return error_response("[GET /diagnostic/instance-status] 诊断异常", exc=e, _logger=logger)


@router.get(
    "/diagnostic/ytdlp",
    response_model=DiagnosticYtDlpResponse,
    response_model_exclude_none=True,
    responses=_SETTINGS_ERROR_RESPONSES,
)
async def diagnostic_ytdlp(player: MusicPlayer = Depends(get_player)):
    """诊断 yt-dlp 配置状态（用于排查网络歌曲播放问题）"""
    try:
        bin_yt_dlp = MusicPlayer._get_yt_dlp_path()

        result = {
            "status": "OK",
            "yt_dlp_path": bin_yt_dlp,
            "exists": os.path.exists(bin_yt_dlp),
            "executable": os.access(bin_yt_dlp, os.X_OK) if os.path.exists(bin_yt_dlp) else False,
            "mpv_running": player.mpv_pipe_exists(),
            "mpv_cmd": player.mpv_cmd,
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
        return error_response("[GET /diagnostic/ytdlp] 诊断异常", exc=e, _logger=logger)
