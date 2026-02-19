# 飞猪音乐 (ClubMusic) v1.2.0

> 基于浏览器的全栈网页音乐播放器，支持本地音乐与 YouTube 流媒体，可在浏览器中后台持续播放。

---

## 功能列表

- **本地 + YouTube 双源播放**：支持本地音乐文件（.mp3/.wav/.flac/.aac/.m4a）及 YouTube 流媒体
- **KTV 视频同步**：播放 YouTube 歌曲时同步显示视频画面，视频与服务端音频精准同步（误差阈值 300ms）
- **多歌单管理**：创建、重命名、删除歌单，支持拖拽排序
- **用户隔离**：每个浏览器/标签页独立维护播放队列，互不影响
- **自动播放/自动下一曲**：完全由后端 MPV 事件监听控制，无需前端干预
- **随机填充队列**：队列为空时一键随机添加 10 首歌并自动播放
- **歌单 UI 增强**：
  - 已选歌单高亮显示
  - 可点击区域打开歌单管理弹窗
  - 歌单标签切换时无需刷新页面
- **搜索与批量添加**：支持本地文件搜索与 YouTube 搜索，支持批量添加到歌单
- **播放排行榜**：自动记录历史播放次数，展示热播榜单
- **中英双语界面**：自动检测浏览器语言，支持手动切换
- **主题切换**：支持深色 / 浅色主题
- **Windows 优化**：使用 WASAPI 音频输出，支持 PyInstaller 单文件打包

---

## 快速启动

### 环境要求

- Python 3.6+
- Windows（推荐，使用 WASAPI 音频引擎）
- `mpv.exe`：放置于 `bin/` 目录或系统 PATH 中
- `yt-dlp.exe`：放置于 `bin/` 目录（YouTube 功能需要）

### 安装依赖

```bash
pip install -r requirements.txt
```

### 启动服务

```bash
python run.py
```

启动时会交互式选择音频输出设备，10 秒内未操作则自动使用系统默认设备。

### 访问界面

打开浏览器，访问：

```
http://localhost:9000
```

---

## 配置说明

配置文件：`settings.ini`

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `music_dir` | `Z:` | 本地音乐根目录 |
| `allowed_extensions` | `.mp3,.wav,.flac,.aac,.m4a` | 支持的音频格式 |
| `server_host` | `0.0.0.0` | 服务监听地址 |
| `server_port` | `9000` | 服务端口 |
| `local_volume` | `50` | 默认音量（0-100） |
| `local_search_max_results` | `20` | 本地搜索最大结果数 |
| `youtube_search_max_results` | `20` | YouTube 搜索最大结果数 |
| `playback_history_max` | `9999` | 最大历史记录条数 |
| `startup_timeout` | `10` | 音频设备选择超时（秒） |
| `youtube_controls` | `false` | 是否显示 YouTube 原生控件 |
| `expand_button` | `true` | 是否显示自定义放大按钮 |
| `level` | `DEBUG` | 日志级别 |

---

## 关键架构

### 1. 用户隔离与歌单管理

- 当前歌单选择保存在浏览器 `localStorage.selectedPlaylistId`，每个浏览器/标签页互不影响
- 歌单数据由后端持久化（`playlists.json`），前端通过 API 读写
- 歌单修改后必须调用 `PLAYLISTS_MANAGER.save()`，否则数据不会持久化

### 2. 自动播放与队列管理

- **自动下一曲**：后端 MPV 监听 `end-file` 事件，自动删除已播曲目并播放下一首（见 `models/player.py`）
- 前端只负责 UI 状态展示，**不主动控制自动播放**
- 队列为空时，前端显示"🎲 随机添加10首歌"按钮，用户可一键填充并自动播放

### 3. KTV 视频同步

- 播放 YouTube 歌曲时，KTV 模块（`static/js/ktv.js`）加载 YouTube IFrame 播放器
- YouTube 视频静音，音频由服务端 MPV 播放
- 每秒检测一次视频与音频的时间偏差，偏差超过 300ms 时自动重新同步
- 错误时自动降级为纯音乐模式（只显示专辑封面）

### 4. API 设计规范

- **播放器控制**（`/play`、`/seek`、`/volume` 等）：使用 `FormData`
- **歌单/数据 CRUD**（`/playlists`、`/playlist_add` 等）：使用 JSON
- 所有 API 路由必须前后端同步，字段名、数据结构严格一致

---

## 关键文件说明

| 文件 | 说明 |
|------|------|
| `run.py` | 启动器，音频设备选择，启动 FastAPI |
| `app.py` | FastAPI 主应用，所有 API 路由 |
| `models/player.py` | 播放器核心，MPV IPC、自动播放、事件监听 |
| `models/playlists.py` | 多歌单管理，持久化 |
| `models/song.py` | 歌曲数据结构，支持本地/YouTube |
| `models/rank.py` | 播放排行榜系统 |
| `static/js/main.js` | 前端主入口，UI 状态管理 |
| `static/js/playlist.js` | 歌单管理与渲染，随机添加逻辑 |
| `static/js/playlists-management.js` | 多歌单管理弹窗 UI |
| `static/js/api.js` | 前端 API 封装，需与后端同步 |
| `static/js/ktv.js` | KTV 视频同步模块 |
| `static/js/i18n.js` | 多语言支持 |
| `playlists.json` | 歌单持久化数据 |
| `playback_history.json` | 播放历史记录 |
| `settings.ini` | 应用配置文件 |

---

## 开发注意事项

- **新增/修改 API 路由时，务必同步更新前端 `api.js` 和后端 `app.py`**
- **所有歌单操作后必须调用 `PLAYLISTS_MANAGER.save()`**
- **多语言文本需同时添加 `zh` 和 `en` 键到 `i18n.js`**
- **不要在前端实现自动下一曲逻辑**，避免与后端冲突
- **`default` 歌单不可删除或重命名**，是系统关键默认歌单
- **不要创建新的单例实例**，使用已有的 `PLAYER`、`PLAYLISTS_MANAGER`、`RANK_MANAGER`
- 每个 `.py` 入口文件需包含 UTF-8 Windows 兼容处理

更多开发规范请参阅 `.github/copilot-instructions.md`。

---

## 常见问题

**自动下一曲有时不生效？**
确保后端 MPV 事件监听线程正常运行，且未有多实例在同时运行。

**添加歌曲后队列没有变化？**
检查前后端 API 字段是否完全一致，并确认每次操作后调用了 `PLAYLISTS_MANAGER.save()`。

**不同浏览器的队列为何不同？**
这是设计特性，每个浏览器/标签页通过 `localStorage` 独立保存当前歌单 ID，互不影响。

**KTV 视频与音频不同步？**
KTV 模块每秒自动检测偏差并纠正，若持续不同步请检查网络状况和 YouTube 可访问性。

**如何打包为单文件 exe？**
运行 `build_exe.bat`，输出位于 `dist/` 目录。注意 `mpv.exe` 和 `yt-dlp.exe` 需与 exe 放在同一目录，不会被打包进 exe。

---

## 版本历史

- **2026-02-19 v1.2.0**：新增 KTV 视频同步功能；歌单 UI 全面优化（选中高亮、可点击区域、无刷新切换）；队列导航图标更新
- **2026-01-05 v1.0.0**：完善随机填充队列、自动下一曲、用户隔离等说明
- **2025-12-28**：补充多语言、API 同步、后端事件监听等关键规则
