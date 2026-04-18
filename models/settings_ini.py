# -*- coding: utf-8 -*-
"""settings.ini schema and persistence helpers."""

import configparser
from pathlib import Path

_SETTINGS_HEADER = (
    "ClubMusic 配置文件。",
    "大多数配置修改后需要重启应用生效；界面设置项会在运行时自动写回此文件。",
)

_SETTINGS_SCHEMA = {
    "paths": {
        "section_comment": "外部工具与资源路径配置。",
        "options": {
            "bin_dir": "外部工具目录，支持相对路径或绝对路径。",
        },
    },
    "app": {
        "section_comment": "应用运行配置。",
        "options": {
            "music_dir": "本地音乐库根目录。",
            "allowed_extensions": "允许扫描的音频扩展名列表，使用逗号分隔。",
            "server_host": "服务监听地址。",
            "server_port": "服务监听端口。",
            "debug": "是否启用调试模式。",
            "mpv_cmd": "MPV 启动命令，包含 IPC 管道和音频输出参数。",
            "local_search_max_results": "本地搜索单次返回的最大结果数。",
            "youtube_search_max_results": "YouTube 搜索单次返回的最大结果数。",
            "youtube_url_extra_max": "YouTube URL 解析时允许补充缓存的结果上限。",
            "local_volume": "默认本地播放音量，范围 0 到 100。",
            "startup_timeout": "启动时音频设备选择的超时时间，单位秒。",
            "playback_history_max": "播放历史保留的最大条数。",
        },
    },
    "logging": {
        "section_comment": "日志输出配置。",
        "options": {
            "level": "日志级别，可选 DEBUG、INFO、WARNING、ERROR、CRITICAL。",
            "polling_sample_rate": "高频轮询接口的日志采样率，范围 0.0 到 1.0。",
            "filtered_paths": "按采样规则处理的高频请求路径，使用逗号分隔。",
            "heartbeat_log_interval": "心跳日志输出间隔，单位秒。",
            "log_dir": "日志目录；留空时不写入日志文件。",
            "log_keep_days": "日志文件保留天数。",
        },
    },
    "ui": {
        "section_comment": "界面开关配置。",
        "options": {
            "youtube_controls": "是否显示 YouTube 原生控件。",
            "expand_button": "是否显示自定义放大按钮。",
            "settings_nav_visible": "是否在底部导航栏显示 Settings 按钮。",
        },
    },
    "cache": {
        "section_comment": "缓存配置。",
        "options": {
            "url_cache_enabled": "是否启用 YouTube 直链缓存。",
        },
    },
    "backup": {
        "section_comment": "定时备份配置。",
        "options": {
            "enabled": "是否启用定时备份。",
            "backup_dir": "备份目录，支持相对路径或绝对路径。",
            "interval_hours": "备份间隔，单位小时，可使用小数。",
            "keep_days": "备份保留天数。",
        },
    },
    "auto_fill": {
        "section_comment": "空闲自动填充队列配置。",
        "options": {
            "enabled": "是否启用空闲自动填充。",
            "source_playlists": "是否从歌单中抽取候选歌曲。",
            "source_history": "是否从播放历史中抽取候选歌曲。",
            "source_local": "是否从本地文件树中抽取候选歌曲。",
        },
    },
    "room": {
        "section_comment": "多房间播放配置。",
        "options": {
            "max_rooms": "允许同时存在的房间数量上限。",
            "idle_timeout": "房间空闲超时时间，单位秒。",
        },
    },
}


def load_settings_parser(config_file) -> configparser.ConfigParser:
    """Load settings.ini without interpolation side effects."""
    parser = _new_parser()
    config_path = Path(config_file)
    if config_path.exists():
        parser.read(config_path, encoding="utf-8")
    return parser


def ensure_settings_defaults(config_file, defaults) -> bool:
    """Add missing sections and keys, then persist with managed comments."""
    parser = load_settings_parser(config_file)
    changed = _apply_section_values(parser, defaults, missing_only=True, replace_sections=False)
    if changed:
        write_settings_parser(config_file, parser)
    return changed


def update_settings_values(config_file, values) -> bool:
    """Update selected settings values while preserving other sections."""
    parser = load_settings_parser(config_file)
    changed = _apply_section_values(parser, values, missing_only=False, replace_sections=False)
    if changed:
        write_settings_parser(config_file, parser)
    return changed


def replace_section_values(config_file, section_values) -> bool:
    """Replace selected sections with the provided values and preserve the rest."""
    parser = load_settings_parser(config_file)
    changed = _apply_section_values(parser, section_values, missing_only=False, replace_sections=True)
    if changed:
        write_settings_parser(config_file, parser)
    return changed


def write_settings_parser(config_file, parser: configparser.ConfigParser) -> None:
    """Serialize settings.ini with managed comments."""
    config_path = Path(config_file)
    sections = _ordered_sections(parser)
    lines = []

    if sections:
        _append_comment_lines(lines, _SETTINGS_HEADER)
        lines.append("")

    for index, section in enumerate(sections):
        meta = _SETTINGS_SCHEMA.get(section)
        if meta:
            _append_comment_lines(lines, (meta["section_comment"],))
        lines.append(f"[{section}]")
        _append_section_lines(lines, parser, section, meta)
        if index < len(sections) - 1:
            lines.append("")

    content = "\n".join(lines).rstrip() + "\n"
    config_path.write_text(content, encoding="utf-8")


def _new_parser() -> configparser.ConfigParser:
    parser = configparser.ConfigParser(interpolation=None)
    parser.optionxform = str.lower
    return parser


def _stringify_value(value) -> str:
    if isinstance(value, bool):
        return str(value).lower()
    if value is None:
        return ""
    return str(value)


def _apply_section_values(
    parser: configparser.ConfigParser,
    section_values,
    *,
    missing_only: bool,
    replace_sections: bool,
) -> bool:
    changed = False
    for section, values in section_values.items():
        normalized_section = str(section).lower()
        normalized_values = {
            str(key).lower(): _stringify_value(value)
            for key, value in values.items()
        }

        if not parser.has_section(normalized_section):
            parser.add_section(normalized_section)
            changed = True

        if replace_sections:
            for existing_key in list(parser[normalized_section].keys()):
                if existing_key not in normalized_values:
                    parser.remove_option(normalized_section, existing_key)
                    changed = True

        for key, value in normalized_values.items():
            if missing_only and parser.has_option(normalized_section, key):
                continue
            current_value = parser.get(normalized_section, key, raw=True, fallback=None)
            if current_value != value:
                parser.set(normalized_section, key, value)
                changed = True

    return changed


def _ordered_sections(parser: configparser.ConfigParser):
    existing_sections = parser.sections()
    ordered = [section for section in _SETTINGS_SCHEMA if section in existing_sections]
    ordered.extend(section for section in existing_sections if section not in _SETTINGS_SCHEMA)
    return ordered


def _append_section_lines(lines, parser: configparser.ConfigParser, section: str, meta) -> None:
    seen = set()
    option_comments = meta["options"] if meta else {}

    for option in option_comments:
        if parser.has_option(section, option):
            _append_comment_lines(lines, (option_comments[option],))
            value = parser.get(section, option, raw=True, fallback="")
            lines.append(f"{option} = {value}")
            seen.add(option)

    for option in parser.options(section):
        if option in seen:
            continue
        value = parser.get(section, option, raw=True, fallback="")
        lines.append(f"{option} = {value}")


def _append_comment_lines(lines, comments) -> None:
    for comment in comments:
        lines.append(f"# {comment}")
