# 飞猪音乐 (ClubMusic) v2.0.0

> 基于浏览器的全栈网页音乐播放器，支持本地音乐与 YouTube 流媒体，可在浏览器中后台持续播放。

---

## 功能列表

- **本地 + YouTube 双源播放**：支持本地音乐文件（.mp3/.wav/.flac/.aac/.m4a）及 YouTube 流媒体
- **KTV 视频同步**：播放 YouTube 歌曲时同步显示视频画面，视频与服务端音频精准同步（误差阈值 300ms）
- **多歌单管理**：创建、重命名、删除歌单，支持拖拽排序
- **用户隔离**：每个浏览器/标签页独立维护播放队列，互不影响
- **自动播放/自动下一曲**：完全由后端 MPV 事件监听控制，无需前端干预
- **空闲自动填充**：播放器空闲 60 秒且队列为空时，自动随机添加 10 首歌并开始播放
- **随机填充队列**：队列为空时一键随机添加 10 首歌并自动播放
- **歌单 UI 增强**：
  - 已选歌单高亮显示
  - 可点击区域打开歌单管理弹窗
  - 歌单标签切换时无需刷新页面
- **搜索与批量添加**：支持本地文件搜索与 YouTube 搜索，支持批量添加到歌单
- **卡拉OK搜索模式**：YouTube 搜索支持切换卡拉OK/伴奏搜索模式
- **播放排行榜**：自动记录历史播放次数，展示热播榜单（支持全部/日/周/月/季/年筛选）
- **中英繁三语界面**：支持简体中文、英文、繁體中文，自动检测浏览器语言，支持手动切换
- **主题切换**：支持深色 / 浅色主题，支持按时间自动切换（6:00-18:00 浅色）
- **Windows 优化**：使用 WASAPI 音频输出，支持 PyInstaller 单文件打包
- **WebSocket 实时推送**：通过 WebSocket 推送播放状态更新，支持房间隔离
- **多房间 (RoomPlayer)**：支持创建独立 MPV 进程的房间，每房间独立播放和音量控制，通过 PCM Named Pipe 中继音频
- **播放历史管理**：完整历史记录，支持搜索、删除、重新播放
- **自动备份系统**：定时备份歌单和播放历史，可配置间隔和保留天数
- **KTV 增强**：音调控制 (pitch shift)、视频偏移控制、卡拉OK模式切换
- **YouTube URL 缓存**：预获取 YouTube 直链，切歌速度大幅提升
- **YouTube 缩略图优化**：自动归一化缩略图 URL，多级降级（hqdefault → mqdefault → default）
- **文件日志系统**：按日轮转、可配置保留天数、高频路由采样过滤
- **播放准备锁**：YouTube 歌曲加载期间防止重复操作，30 秒安全超时
- **操作锁机制**：拖拽/编辑/弹窗操作期间暂停轮询，防止 UI 刷新冲突
- **不可用歌曲标记**：播放失败的歌曲自动标记并在列表中显示
- **iPad/平板布局**：响应式 iPad 横屏布局及 Now Playing 面板
- **搜索目录导航**：搜索支持进入子目录浏览本地文件
- **自定义弹窗**：现代化确认/输入弹窗，替代浏览器原生 confirm/prompt
- **防抖播放控制**：播放/上下曲等操作前端 leading debounce，防止触摸设备连点
- **标签页智能轮询**：浏览器标签页不可见时暂停轮询，可见时立即恢复并刷新
- **轮询恢复监控**：检测并自动恢复异常停滞的轮询
- **匿名用户会话**：基于 Cookie 的匿名用户标识，30 天有效期
- **模块化路由**：后端路由拆分为独立模块（player、playlist、search、history、media、settings、websocket、room），支持依赖注入

---

## 快速启动

### 环境要求

- Python 3.8+
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

启动时会交互式选择音频输出设备（带实时倒计时显示），10 秒内未操作则自动使用系统默认设备。

### 访问界面

打开浏览器，访问：

```
http://localhost:9000
```

---

## 配置说明

配置文件：`settings.ini`

### `[paths]` 路径配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `bin_dir` | `bin` | 可执行文件目录（mpv、yt-dlp），相对于应用根目录或绝对路径 |

### `[app]` 应用配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `music_dir` | `Z:` | 本地音乐根目录 |
| `allowed_extensions` | `.mp3,.wav,.flac,.aac,.m4a` | 支持的音频格式 |
| `server_host` | `0.0.0.0` | 服务监听地址 |
| `server_port` | `9000` | 服务端口 |
| `debug` | `false` | 调试模式开关 |
| `mpv_cmd` | *(见 settings.ini)* | MPV 完整启动命令（含 IPC 管道路径和音频设备） |
| `local_volume` | `50` | 默认音量（0-100） |
| `local_search_max_results` | `20` | 本地搜索最大结果数 |
| `youtube_search_max_results` | `20` | YouTube 搜索最大结果数 |
| `youtube_url_extra_max` | `500` | YouTube URL 额外缓存最大条数 |
| `playback_history_max` | `9999` | 最大历史记录条数 |
| `startup_timeout` | `10` | 音频设备选择超时（秒） |

### `[logging]` 日志配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `level` | `INFO` | 日志级别 (DEBUG/INFO/WARNING/ERROR/CRITICAL) |
| `polling_sample_rate` | `0.1` | 高频请求日志采样率 (0.0-1.0) |
| `filtered_paths` | `/status,/volume` | 高频请求路由列表（逗号分隔） |
| `heartbeat_log_interval` | `10` | 心跳日志输出间隔（秒） |
| `log_dir` | `logs` | 日志文件目录，留空则不写文件 |
| `log_keep_days` | `7` | 日志文件保留天数（每日轮转） |

### `[ui]` 界面配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `youtube_controls` | `false` | 是否显示 YouTube 原生控件 |
| `expand_button` | `true` | 是否显示自定义放大按钮 |

### `[cache]` 缓存配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `url_cache_enabled` | `true` | YouTube 直链缓存开关 |

### `[backup]` 备份配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 是否启用定时备份 |
| `backup_dir` | `backups` | 备份文件目录 |
| `interval_hours` | `6` | 备份间隔（小时，支持小数） |
| `keep_days` | `7` | 备份保留天数 |

---

## 关键架构

### 1. 用户隔离与歌单管理

- 当前歌单选择保存在浏览器 `localStorage.selectedPlaylistId`，每个浏览器/标签页互不影响
- 歌单数据由后端持久化（`playlists.json`），前端通过 API 读写
- 歌单修改后必须调用 `PLAYLISTS_MANAGER.save()`，否则数据不会持久化

### 2. 自动播放与队列管理

- **自动下一曲**：后端 MPV 监听 `end-file` 事件，自动删除已播曲目并播放下一首（见 `models/player.py`）
- **空闲自动填充**：后台守护线程 (`AutoFillIdleThread`) 监测播放器状态，空闲 60 秒且队列为空时自动从所有歌单、历史记录和本地文件中随机填充 10 首歌并开始播放
- 前端只负责 UI 状态展示，**不主动控制自动播放**

### 3. KTV 视频同步

- 播放 YouTube 歌曲时，KTV 模块（`static/js/ktv.js`）加载 YouTube IFrame 播放器
- YouTube 视频静音，音频由服务端 MPV 播放
- 每秒检测一次视频与音频的时间偏差，偏差超过 300ms 时自动重新同步
- 错误时自动降级为纯音乐模式（只显示专辑封面）

### 4. API 设计规范

- **播放器控制**（`/play`、`/seek`、`/volume` 等）：使用 `FormData`
- **歌单/数据 CRUD**（`/playlists`、`/playlist_add` 等）：使用 JSON
- 所有 API 路由必须前后端同步，字段名、数据结构严格一致

### 5. 前端模块化架构

- 所有前端代码使用 ES6 模块，每个模块导出单例实例
- 主题系统通过动态加载 CSS 文件实现（`theme-dark.css` / `theme-light.css`）
- WebSocket 为主要通信通道，`/status` 轮询作为降级方案
- 轮询具备标签页可见性感知、操作锁暂停、异常恢复等智能行为

---

## 关键文件说明

### 后端

| 文件 | 说明 |
|------|------|
| `run.py` | 启动器，音频设备选择（带实时倒计时），启动 FastAPI |
| `app.py` | FastAPI 主应用，路由挂载、生命周期管理、中间件、空闲自动填充线程 |
| `main.py` | PyInstaller 入口点，UTF-8 编码包装 |
| `routers/state.py` | 全局单例状态、WebSocket 管理器、RoomPlayer 池 |
| `routers/dependencies.py` | 依赖注入提供函数（含多房间路由支持） |
| `routers/player.py` | 播放器控制路由（play、pause、seek、loop、pitch） |
| `routers/playlist.py` | 歌单管理路由（CRUD、排序、切换） |
| `routers/search.py` | 搜索路由（本地搜索、YouTube 搜索、目录浏览） |
| `routers/history.py` | 播放历史路由（查询、删除） |
| `routers/media.py` | 媒体资源路由（封面、视频代理、音量） |
| `routers/settings.py` | 设置路由（UI 配置、诊断） |
| `routers/websocket.py` | WebSocket 实时推送端点 |
| `routers/room.py` | 多房间管理路由（RoomPlayer 创建/销毁） |
| `models/player.py` | 播放器核心，MPV IPC、自动播放、事件监听 |
| `models/playlists.py` | 多歌单管理，持久化 |
| `models/song.py` | 歌曲数据结构，支持本地/YouTube |
| `models/local_playlist.py` | 本地歌单类，限制仅本地歌曲 |
| `models/rank.py` | 播放排行榜系统 |
| `models/backup.py` | 定时备份管理器 |
| `models/url_cache.py` | YouTube 直链 URL 缓存 |
| `models/logger.py` | 日志配置、彩色格式化、文件轮转 |
| `models/pcm_pipe.py` | PCM Named Pipe 服务端（音频中继） |
| `models/settings.py` | 用户设置默认值定义 |

### 前端 JavaScript 模块

| 文件 | 导出 | 说明 |
|------|------|------|
| `static/js/main.js` | `MusicPlayerApp` | 前端主入口，UI 状态管理 |
| `static/js/api.js` | `api` | API 封装，需与后端路由同步，内置防抖 |
| `static/js/player.js` | `player` | 播放状态与控制，WebSocket 实时同步，智能轮询 |
| `static/js/playlist.js` | `playlistManager`, `renderPlaylistUI` | 歌单管理与渲染 |
| `static/js/playlists-management.js` | `playlistsManagement` | 多歌单管理弹窗 UI |
| `static/js/search.js` | `searchManager` | 搜索管理（本地 + YouTube，卡拉OK模式） |
| `static/js/ranking.js` | `RankingManager` | 播放排行榜（支持多时间段筛选） |
| `static/js/volume.js` | `volumeControl` | 音量控制，服务端同步，节流 API 调用 |
| `static/js/local.js` | `localFiles` | 本地文件浏览器，专辑卡片网格 |
| `static/js/ktv.js` | `ktv` | KTV 视频同步模块 |
| `static/js/i18n.js` | `i18n` | 多语言支持（zh/en/zh-TW） |
| `static/js/themeManager.js` | `themeManager` | 主题管理，动态 CSS 加载，按时间自动切换 |
| `static/js/settingsManager.js` | `settingsManager` | 设置面板，localStorage 持久化 |
| `static/js/ui.js` | `Toast`, `loading`, `ConfirmModal`, `InputModal` | UI 组件库（通知、加载、弹窗） |
| `static/js/templates.js` | `buildTrackItemHTML` | 统一曲目列表 HTML 模板 |
| `static/js/utils.js` | `escapeHTML`, `thumbnailManager` | 工具函数（XSS 防护、缩略图管理） |
| `static/js/operationLock.js` | `operationLock` | 操作锁，拖拽/编辑期间暂停轮询 |
| `static/js/playLock.js` | `playPreparationLock` | 播放准备锁，防止重复加载 |
| `static/js/unavailable.js` | `unavailableSongs` | 不可用歌曲 URL 追踪（会话级） |
| `static/js/userSession.js` | `userSession` | 匿名用户会话（Cookie，30 天） |
| `static/js/navManager.js` | `navManager` | 导航栏 i18n 管理 |
| `static/js/debug.js` | — | 调试面板（按 `` ` `` 键切换） |

### 前端 CSS

| 文件 | 说明 |
|------|------|
| `static/css/base.css` | 核心样式 |
| `static/css/responsive.css` | 响应式 / 平板布局 |
| `static/css/settings.css` | 设置面板样式 |
| `static/css/theme-dark.css` | 深色主题 |
| `static/css/theme-light.css` | 浅色主题 |

### 数据文件

| 文件 | 说明 |
|------|------|
| `playlists.json` | 歌单持久化数据 |
| `playback_history.json` | 播放历史记录 |
| `settings.ini` | 应用配置文件 |

---

## 开发注意事项

- **新增/修改 API 路由时，务必同步更新前端 `api.js` 和对应的 `routers/*.py`**
- **所有歌单操作后必须调用 `PLAYLISTS_MANAGER.save()`**
- **多语言文本需同时添加 `zh`、`en` 和 `zh-TW` 键到 `i18n.js`**
- **不要在前端实现自动下一曲逻辑**，避免与后端冲突
- **`default` 歌单不可删除或重命名**，是系统关键默认歌单
- **不要创建新的单例实例**，使用已有的 `PLAYER`、`PLAYLISTS_MANAGER`、`RANK_MANAGER`
- **不要直接实例化前端类**，始终使用导出的单例（多实例 = 状态不同步）
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

- **2026-03-13 v2.0.0**：空闲自动填充队列；YouTube 缩略图归一化与多级降级；卡拉OK搜索模式；操作锁机制；匿名用户会话；防抖播放控制；标签页智能轮询；轮询恢复监控；自定义弹窗组件；交互式音频设备选择倒计时；房间隔离 WebSocket；拖拽手柄；前端全面模块化
- **2026-02-28 v1.3.0**：模块化路由重构（app.py 拆分为 8 个独立路由模块 + 依赖注入）；WebSocket 实时推送；多房间 RoomPlayer / PCM 中继；播放历史管理；自动备份系统；KTV 音调/偏移控制；繁體中文支持；YouTube URL 缓存；文件日志轮转；播放准备锁；iPad 响应式布局
- **2026-02-19 v1.2.0**：新增 KTV 视频同步功能；歌单 UI 全面优化（选中高亮、可点击区域、无刷新切换）；队列导航图标更新
- **2026-01-05 v1.0.0**：完善随机填充队列、自动下一曲、用户隔离等说明
- **2025-12-28**：补充多语言、API 同步、后端事件监听等关键规则
