import asyncio

from models.api_contracts import UIConfigRequest
from models.player import MusicPlayer
from models.settings_ini import ensure_settings_defaults
from routers import settings as settings_router


def test_ensure_settings_defaults_adds_comments_for_missing_sections(tmp_path):
    settings_path = tmp_path / "settings.ini"
    settings_path.write_text(
        "[app]\n"
        "music_dir = Z:\n"
        "server_port = 9000\n",
        encoding="utf-8",
    )

    changed = ensure_settings_defaults(
        settings_path,
        {
            "backup": {
                "enabled": "true",
                "backup_dir": "backups",
            },
            "room": {
                "max_rooms": "10",
            },
        },
    )

    content = settings_path.read_text(encoding="utf-8")

    assert changed is True
    assert "# 应用运行配置。" in content
    assert "# 定时备份配置。" in content
    assert "# 是否启用定时备份。" in content
    assert "# 多房间播放配置。" in content
    assert "music_dir = Z:" in content
    assert "server_port = 9000" in content


def test_update_ui_config_rewrites_with_managed_comments(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    settings_path = tmp_path / "settings.ini"
    settings_path.write_text(
        "[ui]\n"
        "youtube_controls = false\n"
        "expand_button = true\n"
        "settings_nav_visible = false\n\n"
        "[cache]\n"
        "url_cache_enabled = true\n",
        encoding="utf-8",
    )

    payload = UIConfigRequest(
        youtube_controls=True,
        expand_button=False,
        settings_nav_visible=True,
        url_cache_enabled=False,
    )
    result = asyncio.run(settings_router.update_ui_config(payload))
    content = settings_path.read_text(encoding="utf-8")

    assert result["status"] == "OK"
    assert "# 界面开关配置。" in content
    assert "# 是否显示 YouTube 原生控件。" in content
    assert "youtube_controls = true" in content
    assert "expand_button = false" in content
    assert "settings_nav_visible = true" in content
    assert "# 缓存配置。" in content
    assert "url_cache_enabled = false" in content


def test_musicplayer_ensure_ini_exists_creates_commented_ini(tmp_path):
    settings_path = tmp_path / "settings.ini"

    MusicPlayer.ensure_ini_exists(str(settings_path))

    content = settings_path.read_text(encoding="utf-8")

    assert "# ClubMusic 配置文件。" in content
    assert "# 应用运行配置。" in content
    assert "# MPV 启动命令，包含 IPC 管道和音频输出参数。" in content
    assert "[app]" in content
    assert "mpv_cmd = " in content


def test_save_config_to_ini_preserves_other_sections(tmp_path):
    settings_path = tmp_path / "settings.ini"
    settings_path.write_text(
        "[ui]\n"
        "youtube_controls = false\n\n"
        "[app]\n"
        "music_dir = Z:\n"
        "server_port = 9000\n",
        encoding="utf-8",
    )

    MusicPlayer.save_config_to_ini(
        str(settings_path),
        {
            "music_dir": "D:\\Music",
            "server_port": 8080,
        },
    )

    content = settings_path.read_text(encoding="utf-8")

    assert "# 界面开关配置。" in content
    assert "[ui]" in content
    assert "youtube_controls = false" in content
    assert "music_dir = D:\\Music" in content
    assert "server_port = 8080" in content
