# 🎵 ClubMusic

一个功能完整的网页音乐播放器，支持本地文件和 YouTube 音乐串流播放，具有多歌单管理、播放历史追踪、排行榜统计等高级功能。

**技术栈**：Python 3.8+ FastAPI + JavaScript ES6 模块 + MPV IPC 引擎 + PyInstaller

[English Documentation](README_EN.md)

## ✨ 核心功能

### 🎼 音乐播放
- **本地播放**：支持 MP3、WAV、FLAC、AAC、M4A 等多种音频格式
- **YouTube 串流**：直接搜索和播放 YouTube 音乐
- **播放控制**：暂停/继续、进度条拖拽、音量调节
- **播放历史**：自动记录所有播放过的歌曲

### 📋 歌单管理
- **多歌单支持**：创建、编辑、删除自定义歌单
- **歌单持久化**：所有歌单数据自动保存
- **拖拽排序**：支持桌面和移动端拖拽重新排序

### 🏆 排行榜统计
- **播放次数追踪**：记录每首歌曲播放次数
- **时间段统计**：全部/本周/本月排行
- **快速播放**：点击排行榜歌曲直接播放

### 🎨 用户界面
- **响应式设计**：适配桌面、平板和手机
- **浅色/深色主题**：支持主题切换
- **多语言支持**：中文/英文界面
- **Toast 通知**：操作反馈居中显示

## 🚀 快速开始

### 系统要求
- **Python 3.8+** 或预编译的 **ClubMusic.exe**
- **MPV 0.34+** 音频播放引擎
- **yt-dlp** (包含于可执行文件)

### 源码开发启动

#### 1. 安装依赖
```bash
pip install -r requirements.txt
```

#### 2. 配置 settings.ini
```ini
[app]
music_dir=Z:\                      # 本地音乐目录
allowed_extensions=.mp3,.wav,.flac,.aac,.m4a
server_host=0.0.0.0
server_port=80
startup_timeout=15                 # 音频设备选择超时（秒）

[logging]
level=INFO                         # 日志级别: DEBUG, INFO, WARNING, ERROR
```

#### 3. 启动应用
```bash
python main.py
```

**交互式流程**：
- 弹出 WASAPI 音频设备选择对话框
- 自动优先选择 "CABLE-A Input" 设备
- 超时自动使用默认设备
- 启动 Uvicorn 服务器

#### 4. 访问播放器
打开浏览器：`http://localhost:80`

### 编译为可执行文件
```bash
.\build_exe.bat
```
**输出**：`dist/ClubMusic.exe`（包含 mpv、yt-dlp、静态资源）

## 📁 项目结构

```
ClubMusic/
├── app.py                 # FastAPI 主应用 (2300+ 行, 60+ 路由)
├── main.py                # 启动入口（交互式音频设备选择）
├── settings.ini           # 配置文件 [app] music_dir/mpv_cmd; [logging] level
├── models/
│   ├── __init__.py        # 模块入口 + UTF-8 包装
│   ├── player.py          # MusicPlayer 单例 (1500+ 行, MPV IPC)
│   ├── song.py            # Song/LocalSong/StreamSong 数据模型
│   ├── playlist.py        # 单个播放列表容器
│   ├── playlists.py       # 多歌单管理 + JSON 持久化
│   ├── rank.py            # HitRank 排行统计
│   ├── settings.py        # 配置文件解析
│   └── logger.py          # 日志记录模块
├── static/
│   ├── js/                # 17 个 ES6 模块，main.js 2061 行
│   ├── css/               # 主题/响应式样式
│   └── images/
├── templates/
│   └── index.html         # 主页面 HTML
├── bin/                   # 外部工具
│   ├── mpv.exe            # MPV 播放器
│   └── yt-dlp.exe         # YouTube 下载器
├── doc/                   # 文档目录
├── playlists.json         # 多歌单持久化数据
├── playback_history.json  # 播放历史（timestamps 逗号分隔）
├── app.spec               # PyInstaller 配置
├── build_exe.bat          # 构建脚本
└── requirements.txt       # Python 依赖
```

## 🎮 使用指南

### 播放本地音乐
1. 确保 `settings.ini` 中的 `music_dir` 指向正确的音乐目录
2. 点击底部导航栏的 "本地" 标签
3. 浏览文件夹树形结构，点击歌曲名称播放
4. 本地歌曲模态框以全屏显示

### 播放 YouTube 音乐
1. 点击底部导航栏的 "搜索" 标签
2. 输入歌曲名称或 URL
3. 从搜索结果中选择
4. 歌曲将自动添加到队列并播放

### 管理歌单
1. **创建歌单**：点击歌单管理界面的 "+" 按钮
2. **添加歌曲**：从播放队列中选择歌曲，添加到歌单
3. **切换歌单**：点击歌单名称切换播放歌单
4. **删除歌单**：（默认歌单不可删除）
5. **固定标题**：滚动时歌单名称始终显示在顶部

### 队列操作
- **拖拽排序**：鼠标拖拽或触摸手柄 (☰) 重新排列（包括当前播放歌曲）
- **左滑删除**：移动端向右滑动显示删除按钮
- **删除单项**：点击删除按钮或左滑选中删除
- **当前歌曲**：支持拖拽排序和左滑删除，与其他队列项交互逻辑完全相同

### 播放控制
- **暂停/继续**：点击中央播放按钮
- **调整进度**：点击或拖拽进度条
- **调整音量**：使用音量控制器
- **快速搜索**：点击搜索按钮快速查找歌曲

### 排行榜使用
1. **打开排行榜**：点击底部导航栏的 "排行" 标签
2. **切换时间段**：选择 "全部"、"本周" 或 "本月"
3. **查看排名**：歌曲按播放次数降序显示（显示所有记录，不限10首）
4. **快速播放**：点击排行榜中的歌曲直接播放
5. **关闭排行榜**：点击左上角关闭按钮或背景区域
6. **全屏显示**：排行榜覆盖整个屏幕（包括底部导航栏）

### 底部导航
- **📚 歌单**：查看和管理播放队列
- **🎵 本地**：浏览本地音乐文件（全屏模态框）
- **🏆 排行**：查看播放排行榜（全屏显示）
- **🔍 搜索**：搜索 YouTube 和本地音乐（不遮挡底部导航栏）

## 🔧 API 文档

### 核心概念

**请求格式**：
- **FormData**: 简单值字段 (`/play`, `/seek`, `/pause`, `/volume`, `/playlist_remove`)
- **JSON**: 复杂对象 (`/playlists`, `/playlist_add`, `/search_song`)
- ⚠️ **错误的格式将返回 "form required" 400 错误**

**播放状态轮询**：
```javascript
// 前端每 1000ms（1秒）轮询一次
GET /status
响应: { paused: boolean, time_pos: number, duration: number, volume: number, current_meta: {...} }
```

### 播放控制接口

| 端点 | 方法 | 请求格式 | 说明 |
|------|------|---------|------|
| `/play` | POST | FormData | 播放歌曲 (url, title, type) |
| `/pause` | POST | FormData | 暂停/继续 |
| `/next` | POST | FormData | 下一首 |
| `/prev` | POST | FormData | 上一首 |
| `/seek` | POST | FormData | 跳转进度 (percent: 0-100) |
| `/loop` | POST | FormData | 循环模式切换 (0=无, 1=单曲, 2=全部) |
| `/volume` | POST | FormData | 设置音量 (value: 0-130) |
| `/status` | GET | - | 获取播放状态 (1000ms轮询) |

### 歌单管理接口

| 端点 | 方法 | 请求格式 | 说明 |
|------|------|---------|------|
| `/playlists` | GET | - | 获取所有歌单 |
| `/playlists` | POST | JSON | 创建新歌单 ({name: string}) |
| `/playlists/{id}` | PUT | JSON | 更新歌单 ({name: string}) |
| `/playlists/{id}` | DELETE | - | 删除歌单 |
| `/playlists/{id}/switch` | POST | JSON | 切换歌单（验证存在） |
| `/playlists/{id}/add_next` | POST | FormData | 添加到下一曲 |
| `/playlists/{id}/remove` | POST | FormData | 从歌单删除歌曲 (index) |
| `/playlist` | GET | - | 获取当前歌单 (playlist_id参数) |
| `/playlist_add` | POST | JSON | 添加歌曲 ({playlist_id, song, insert_index?}) |
| `/playlist_remove` | POST | FormData | 从默认歌单删除 (index) |
| `/playlist_reorder` | POST | JSON | 重新排序 ({playlist_id, from_index, to_index}) |
| `/playlist_clear` | POST | - | 清空播放队列 |

### 搜索接口

| 端点 | 方法 | 请求格式 | 说明 |
|------|------|---------|------|
| `/search_song` | POST | JSON | **统一搜索**（本地+YouTube） ({query}) |
| `/search_youtube` | POST | FormData | 搜索 YouTube 视频 (query) |
| `/youtube_extract_playlist` | POST | FormData | 提取 YouTube 播放列表 (url) |
| `/play_youtube_playlist` | POST | JSON | 播放 YouTube 播放列表 ({videos: []}) |

### 覆盖查询接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/cover/{file_path}` | GET | 获取音乐封面（内嵌或目录） |

### 播放历史接口

| 端点 | 方法 | 请求格式 | 说明 |
|------|------|---------|------|
| `/playback_history` | GET | - | 获取播放历史 |
| `/song_add_to_history` | POST | FormData | 添加到历史 (url, title, type) |

### 设置接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/settings` | GET | 获取默认设置 |
| `/settings` | POST | 保存用户设置（localStorage） |
| `/settings/schema` | GET | 获取设置项描述 |

## 📊 数据存储架构

### JSON 数据文件格式

**playlists.json** - 所有歌单及其歌曲
```json
{
  "order": ["default", "playlist_id_1", "playlist_id_2"],
  "playlists": [
    {
      "id": "default",
      "name": "正在播放",
      "songs": [
        {
          "url": "相对路径或URL",
          "title": "歌曲名",
          "type": "local|youtube",
          "duration": 0,
          "thumbnail_url": "可选的封面URL"
        }
      ],
      "created_at": 1234567890.0,
      "updated_at": 1234567890.0,
      "current_playing_index": -1
    }
  ]
}
```

**playback_history.json** - 播放历史记录
```json
[
  {
    "url": "歌曲URL",
    "title": "歌曲标题",
    "type": "local|youtube",
    "timestamps": "1234567890,1234567891",
    "thumbnail_url": "可选的封面URL"
  }
]
```

**settings.ini** - 应用配置
```ini
[app]
music_dir = Z:\                    # 本地音乐目录
allowed_extensions = .mp3,.wav,.flac,.aac,.m4a
server_host = 0.0.0.0
server_port = 80
mpv_cmd = bin\mpv.exe --input-ipc-server=\\.\pipe\mpv-pipe --audio-device={WASAPI_GUID}
local_search_max_results = 20
youtube_search_max_results = 20
local_volume = 35
startup_timeout = 15               # 音频设备选择超时（秒）

[logging]
level = INFO                       # DEBUG, INFO, WARNING, ERROR
polling_sample_rate = 0.1
filtered_paths = /status,/volume
```

### localStorage 用户数据（浏览器本地）
```javascript
{
  "selectedPlaylistId": "default",  // 当前选择歌单（用户隔离）
  "theme": "dark|light",            // 主题选择
  "language": "zh|en",              // 语言设置
  "streamFormat": "mp3"             // 推流音频格式
}
```
  - 包含字段：`url`, `name`, `type`, `ts`, `thumbnail_url`, `play_count`
  - `play_count`：歌曲被播放的总次数（重复播放会递增）
  - 由 `models/rank.py` 中的 `HitRank` 类管理

### 数据持久化
- 所有操作自动保存到本地 JSON 文件
- 应用重启时自动恢复上一次的播放状态
- 播放历史自动递增 play_count
- 排行榜数据实时更新

## 🌐 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- 移动浏览器（iOS Safari, Chrome Mobile）

## 🔐 安全性

- 所有 API 请求都通过 POST 方法进行验证
- YouTube URL 进行规范化处理防止重复
- 文件路径进行安全检查，防止目录遍历
- 队列 URL 集合追踪防止重复添加

## 🐛 已知限制

- YouTube 串流依赖于 yt-dlp，可能受到 YouTube 限制
- 某些受限国家的 YouTube 内容可能无法访问
- 本地音乐目录必须在应用启动前配置正确

## 📝 配置详解

### settings.ini
```ini
[music]
# 本地音乐库目录
music_dir=Z:\

# 支持的音频格式（逗号分隔）
extensions=.mp3,.wav,.flac

[server]
# 监听主机（0.0.0.0 表示所有接口）
host=0.0.0.0

# 监听端口
port=80
```

## 🎯 开发者信息

### 项目规模
- **前端代码**：3700+ 行 JavaScript，5600+ 行 CSS
- **后端代码**：2200+ 行 Python (app.py)
- **数据模型**：600+ 行 Python（模型定义）
- **总代码行数**：11,000+ 行

### 主要模块
- `app.py` -  应用主文件，包含 60+ API 端点
- `models/player.py` - mpv 播放器包装类，实现单例模式
- `models/playlists.py` - 多歌单管理系统
- `models/song.py` - 歌曲数据模型（LocalSong/StreamSong）
- `models/rank.py` - 播放统计与排行榜
- `static/js/main.js` - 前端入口，2061 行，17 个 ES6 模块

### 架构设计模式

#### 1. 单例模式 (Singleton Pattern)
```python
# models/player.py 第 29 行
class MusicPlayer:
    @classmethod
    def initialize(cls, data_dir: str = "."):
        """初始化播放器 - 全局唯一实例"""
        player = cls.from_ini_file(...)
        return player
```
- 使用 `@classmethod` 确保全局唯一实例
- 禁止直接调用 `__init__()`
- app.py 第 70-80 行全局初始化：`PLAYER = MusicPlayer.initialize()`

#### 2. 用户隔离模式 (User Isolation via localStorage)
```javascript
// static/js/playlist.js 第 15-25 行
// 每个浏览器标签独立维护选择歌单 ID
selectedPlaylistId = localStorage.getItem('selectedPlaylistId') || 'default';
localStorage.setItem('selectedPlaylistId', playlistId);
```
- **关键原理**：前端 localStorage 为状态来源，后端不维护全局歌单选择状态
- **效果**：同时打开多个浏览器标签时，每个标签可独立选择不同歌单
- **避免冲突**：用户 A 的操作不会影响用户 B 的界面

#### 3. 操作锁模式 (Operation Lock Pattern)
```javascript
// static/js/operationLock.js
operationLock.acquire('drag');    // 获取锁，暂停轮询
// ... 拖拽操作 ...
operationLock.release('drag');    // 释放锁，恢复轮询
```
- **目的**：防止轮询刷新干扰用户操作（拖拽、编辑）
- **实现**：Map 存储多个锁，计数器决定轮询暂停
- **关键调用点**：playlist.js 第 450-500 行的拖拽长按逻辑

#### 4. 轮询机制 (Polling Pattern)
```javascript
// static/js/player.js
setInterval(() => {
    api.getStatus().then(updateUI);
}, 1000);  // 每 1000ms 更新一次状态
```
- **频率**：1000ms（1 秒）
- **关键路由**：GET /status（app.py 第 ~500 行）
- **Safari 优化**：浏览器检测（app.py 第 95-125 行）设置心跳间隔和块大小
- **暂停条件**：operationLock.isPollingPaused() 为 true 时暂停

#### 5. 自动下一首逻辑 (Auto-Next Pattern)
```javascript
// static/js/main.js 第 410-530 行
if (duration > 0 && currentTime >= duration - 2.5) {
    // 歌曲即将结束（剩余 2.5 秒）
    removeCurrentSongFromPlaylist();
    playSong(nextSong);
}
```
- **触发条件**：`timeRemaining < 2.5 秒`
- **流程**：检测播放剩余时间 → 删除当前歌曲 → 播放下一首
- **防重复**：使用 `_autoNextTriggered` 标记防止重复触发

#### 6. 拖拽排序模式 (Drag-Sort Pattern)
```javascript
// static/js/playlist.js 第 350-500 行
// 长按 300ms 触发拖拽
longPressTimer = setTimeout(() => startDrag(e), 300);
// 移动 10px 阈值后激活拖拽
const moveDistance = Math.abs(touch.clientY - touchStartY);
if (moveDistance > DRAG_THRESHOLD) startDrag(e);
```
- **长按触发**：300ms 按压时间
- **移动阈值**：10px 移动距离激活
- **操作锁集成**：拖拽时调用 `operationLock.acquire('drag')` 暂停轮询
- **关键修复**：touchcancel 和 touchend 都要调用 `operationLock.release()` 防止轮询永久暂停

#### 7. 模态框导航模式 (Modal Navigation Stack)
```javascript
// static/js/main.js 第 1080-1170 行
let navigationStack = ['playlists'];  // 导航历史栈

// 导航到新模态框
navigationStack.push(tabName);
showTab(tabName);

// 返回上一个模态框
navigationStack.pop();
showTab(navigationStack[navigationStack.length - 1]);
```
- **栈式导航**：每个模态框入栈，关闭时出栈
- **非阻塞**：模态框可重叠显示，高 z-index 模态框在最前
- **返回逻辑**：自动恢复前一个显示的内容

### API 设计约定

#### FormData 类型（简单值）
```javascript
// 用于播放控制类 API
const formData = new FormData();
formData.append('url', song.url);
formData.append('title', song.title);
await fetch('/play', { method: 'POST', body: formData });
```
- 适用场景：/play, /seek, /pause, /volume, /playlist_remove

#### JSON 类型（复杂对象）
```javascript
// 用于数据 CRUD 类 API
const response = await fetch('/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '新歌单' })
});
```
- 适用场景：/playlists, /playlist_add, /search_song, /playlist_reorder

### 测试与调试

#### 启用调试模式
```bash
# 设置环境变量
set DEBUG_MODE=1

# 或在前端控制台
localStorage.setItem('DEBUG_MODE', '1');

# 查看调试信息
console.log(window.app.player.getStatus());
```

#### 常见调试命令
```javascript
// 检查播放器状态
app.player.getStatus()

// 检查歌单管理器
app.playlistManager.currentPlaylist
app.playlistManager.playlists

// 手动触发更新
app.updatePlayerUI(status)

// 查看操作锁状态
operationLock.getStatus()

// 清空本地存储
localStorage.clear()
```

#### 集成新功能的检查清单
- [ ] 后端 API 路由已添加到 app.py（同时支持 FormData/JSON）
- [ ] 前端 API 方法已添加到 static/js/api.js
- [ ] UI 事件监听器已绑定到 static/js/main.js
- [ ] 如有需要，添加 i18n 词条到 static/js/i18n.js
- [ ] 数据持久化逻辑已实现（JSON 文件或 localStorage）
- [ ] 如有拖拽操作，已正确集成 operationLock
- [ ] 如有轮询相关变化，已考虑性能影响

### 常见问题排查

**问题**：页面长时间拖拽后，状态不更新
- **原因**：operationLock 未正确释放
- **解决**：检查 touchcancel 和 touchend 事件处理器是否调用了 `operationLock.release()`

**问题**：歌曲播放中途卡顿
- **原因**：轮询频率可能过高，或 MPV 命令执行失败
- **解决**：检查 get_status 响应时间，使用 `/debug` 面板查看 MPV 进程状态

**问题**：YouTube 歌曲 403 错误
- **原因**：yt-dlp 版本过老
- **解决**：更新 yt-dlp：`pip install --upgrade yt-dlp`

**问题**：歌单在其他浏览器标签中未同步
- **这是正常行为**：用户隔离设计决定了每个标签独立维护歌单选择

### 贡献指南

1. 保持代码风格与现有代码一致
2. 新增功能必须同时更新前后端，并保持 API 同步
3. 使用 FormData 处理简单值，JSON 处理复杂对象
4. 如涉及并发操作，务必使用 operationLock
5. 新增翻译词条时，必须同时添加 zh 和 en 两种语言
6. 更新操作必须调用 `PLAYLISTS_MANAGER.save()` 保存数据

---

**最后更新**：2025-01-15 | **维护者**：ClubMusic Team
- `models/rank.py` - 播放历史和排行榜统计（HitRank 类）
- `models/playlists.py` - 多歌单管理
- `models/local_playlist.py` - 本地音乐浏览
- `static/main.js` - 完整的前端交互逻辑
- `static/style.css` - 响应式样式设计

### 关键特性实现
- **多歌单持久化**：使用 Playlists 类管理
- **播放队列重排序**：支持当前歌曲的拖拽排序
- **播放次数统计**：HitRank 类自动递增 play_count
- **全屏模态框**：排行榜和本地歌曲以全屏显示
- **固定标题栏**：歌单页面滚动时标题栏置顶
- **密码保护**：清除历史需要密码验证
- **左滑删除统一**：当前歌曲和队列项使用相同逻辑
- **状态轮询**：每 2 秒更新一次播放状态
- **响应式底部导航**：四个主要功能标签，适配移动端

### API 使用示例

**统一搜索接口示例：**
```javascript
// 搜索 YouTube
fetch('/search_song', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'query=周杰伦&type=youtube'
})
.then(r => r.json())
.then(data => console.log(data.results));

// 搜索本地
fetch('/search_song', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'query=周杰伦&type=local'
})
.then(r => r.json())
.then(data => console.log(data.results));

// 同时搜索
fetch('/search_song', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'query=周杰伦&type=all'
})
.then(r => r.json())
.then(data => {
    console.log('YouTube 结果:', data.youtube);
    console.log('本地结果:', data.local);
});
```

## 📦 依赖包

见 `requirements.txt` 获取完整依赖列表

关键依赖：
- **FastAOI** - Web 框架
- **yt-dlp** - YouTube 下载器
- **python-mpv** - mpv 播放器绑定
- **python-dotenv** - 环境变量管理

## 🎁 功能亮点

✅ 完整的播放控制（进度条、音量、暂停）  
✅ 本地 + YouTube 双源播放  
✅ 多歌单管理和持久化  
✅ 高级排行榜功能（时间段统计、play_count 追踪）  
✅ 拖拽排序支持当前歌曲  
✅ 左滑删除与传统交互统一  
✅ 完整的播放历史追踪（含播放次数统计）  
✅ 响应式设计完美适配所有设备  
✅ 全屏播放器沉浸式体验  
✅ 实时搜索本地和 YouTube  
✅ 播放次数统计和排行榜分析  
✅ 密码保护清除历史功能  
✅ 全屏模态框（排行榜、本地歌曲）  
✅ 固定标题栏（歌单页面）  
✅ 底部导航栏设计（歌单、本地、排行、搜索）  
✅ 无限制排行榜显示（最多100首）  
✅ 模块化代码结构（独立的 rank、local_playlist 模块）  

## 📜 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

遇到问题？请检查：
1. `settings.ini` 配置是否正确
2. 本地音乐目录是否存在
3. mpv 和 yt-dlp 是否正确安装
4. 浏览器控制台是否有错误信息


---

**版本**：6.0.0  
**更新时间**：2025年12月  
**许可证**：MIT License
