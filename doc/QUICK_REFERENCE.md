# 🚀 快速参考指南

## 📌 核心文件一览表

### 必须存在的 5 个文件
```
✓ main.py                   ← 应用启动 (Uvicorn)
✓ app.py                    ← API 服务器 (891 行)
✓ templates/index.html        ← 网页界面 (451 行)
✓ static/js/main-modular.js   ← 前端入口 (314 行)
✓ settings.ini                ← 配置文件
```

### 后端 7 个模型文件
```
✓ models/__init__.py           ← 导出所有类
✓ models/player.py            ← 播放器 (1500+ 行) ⭐ 最重要
✓ models/song.py              ← 歌曲类型
✓ models/playlist.py          ← 队列管理
✓ models/playlists.py         ← 歌单管理
✓ models/rank.py              ← 排行榜
```

### 前端 7 个模块文件
```
✓ static/js/modules/api.js      ← API 调用
✓ static/js/modules/player.js   ← 播放控制
✓ static/js/modules/playlist.js ← 队列操作
✓ static/js/modules/volume.js   ← 音量控制
✓ static/js/modules/search.js   ← 搜索功能
✓ static/js/modules/ui.js       ← UI 组件
✓ static/js/modules/utils.js    ← 工具函数
```

### 样式和资源
```
✓ static/css/style.css        ← 所有样式
✓ static/images/              ← 图片资源
```

### 配置和文档
```
✓ requirements.txt            ← Python 依赖
✓ README.md                   ← 项目文档
✓ doc/                        ← 14+ 个文档
```

### 数据文件（自动生成）
```
✓ playback_history.json       ← 播放历史
✓ playlist.json               ← 当前队列
✓ playlists.json              ← 所有歌单
```

---

## 🔍 快速查找文件

### "我想改播放功能"
→ 修改 `models/player.py` 和 `app.py` 中的 `/play` 路由

### "我想改界面样式"
→ 修改 `static/css/style.css`

### "我想添加新功能"
```
1. 后端：models/ 中添加业务逻辑
2. 后端：app.py 中添加路由
3. 前端：static/js/modules/ 中添加模块
4. 前端：main-modular.js 中导入和使用
```

### "我想改配置"
→ 编辑 `settings.ini`，重启应用

### "应用无法启动"
→ 检查 `main.py` 能否找到 `app.py` 和 `settings.ini`

### "页面无法显示"
→ 检查 `templates/index.html` 能否加载 CSS 和 JS

### "API 返回 404"
→ 检查 `app.py` 中是否有对应的 `@app.post()`/`@app.get()` 路由

---

## 💻 常用命令

### 启动应用
```bash
python main.py
```

### 安装依赖
```bash
pip install -r requirements.txt
```

### 生成可执行文件
```bash
pyinstaller fastapi_app.spec
```

### 测试 API（打开浏览器开发者工具）
```javascript
// 在 Console 中
fetch('/status').then(r => r.json()).then(console.log)
```

### 查看配置
```bash
cat settings.ini
```

---

## 📊 文件大小一览

| 文件 | 行数 | 大小 |
|------|------|------|
| main.py | 56 | 2 KB |
| app.py | 891 | 32 KB |
| models/player.py | 1500+ | 55 KB |
| templates/index.html | 451 | 18 KB |
| main-modular.js | 314 | 10 KB |
| static/css/style.css | 1000+ | 35 KB |
| 所有 modules/ | ~730 | 25 KB |
| 其他文件 | ~600 | 30 KB |
| **总计** | **~5400** | **~200 KB** |

---

## 🎯 工作流清单

### 添加播放控制按钮

```
1. templates/index.html
   └─ 添加 <button id="myButton">

2. static/css/style.css
   └─ 添加样式 #myButton { ... }

3. static/js/modules/player.js
   └─ 添加处理方法 export function myControl() { ... }

4. static/js/main-modular.js
   └─ 导入模块并绑定事件
       document.getElementById('myButton').onclick = () => {
           player.myControl();
       }
```

### 添加 API 端点

```
1. models/player.py (或其他 models/)
   └─ 添加业务逻辑方法

2. app.py
   └─ 添加路由
       @app.post("/my_endpoint")
       async def my_endpoint(request):
           ...
           return {"status": "OK"}

3. static/js/modules/api.js
   └─ 添加调用方法
       export async function myEndpoint(data) {
           return fetch('/my_endpoint', ...)
       }

4. main-modular.js 或其他模块
   └─ 调用 api.myEndpoint(data)
```

### 修复 Bug

```
1. 确定 Bug 位置：后端还是前端
   └─ 打开浏览器 F12，Network 查看 API 响应
   └─ 查看浏览器 Console 是否有 JS 错误

2. 如果是后端 Bug
   └─ 修改 fastapi_app.py 或 models/

3. 如果是前端 Bug
   └─ 修改 main-modular.js 或 modules/
   └─ 刷新浏览器（Ctrl+Shift+R 清缓存）

4. 重新启动应用
   └─ Ctrl+C 停止
   └─ python main.py 重启
```

---

## 🔗 API 路由速查

### 播放控制
| API | 路由 | 位置 |
|-----|------|------|
| 播放 | POST /play | app.py ~180 |
| 暂停 | POST /pause | app.py ~200 |
| 下一曲 | POST /next | app.py ~220 |
| 上一曲 | POST /prev | app.py ~240 |
| 进度 | POST /seek | app.py ~260 |

### 队列管理
| API | 路由 | 位置 |
|-----|------|------|
| 获取队列 | GET /playlist | app.py ~300 |
| 添加歌曲 | POST /playlist_add | app.py ~320 |
| 删除歌曲 | POST /playlist_remove | app.py ~350 |
| 重新排序 | POST /playlist_reorder | app.py ~370 |
| 清空队列 | POST /playlist_clear | app.py ~390 |

### 歌单管理
| API | 路由 | 位置 |
|-----|------|------|
| 获取歌单列表 | GET /playlists | app.py ~420 |
| 创建歌单 | POST /playlists | fastapi_app.py ~440 |
| 删除歌单 | DELETE /playlists/{id} | fastapi_app.py ~460 |

### 搜索和浏览
| API | 路由 | 位置 |
|-----|------|------|
| 本地搜索 | GET /search_song | fastapi_app.py ~500 |
| YouTube 搜索 | POST /search_youtube | fastapi_app.py ~520 |
| 本地文件树 | GET /tree | fastapi_app.py ~540 |
| 播放状态 | GET /status | fastapi_app.py ~560 |

完整列表见 [doc/ROUTES_MAPPING.md](ROUTES_MAPPING.md)

---

## ⚙️ 配置项速查

| 配置项 | 文件 | 作用 |
|-------|------|------|
| music_dir | settings.ini | 音乐库目录 |
| allowed_extensions | settings.ini | 支持的格式 |
| server_host | settings.ini | 服务器地址 |
| server_port | settings.ini | 服务器端口 |
| debug | settings.ini | 调试模式 |
| mpv_cmd | settings.ini | MPV 启动命令 |

---

## 🐛 常见问题速解

### Q: 应用启动但页面是空白
A: 检查 `templates/index.html` 是否存在；检查浏览器 F12 是否有 404 错误

### Q: 播放按钮点了没反应
A: 检查 `/play` API 是否返回 200；检查 mpv.exe 是否正常运行

### Q: 队列不显示
A: 检查 `/playlist` API 返回值；检查 `playlist.js` renderPlaylist() 函数

### Q: 搜索无结果
A: 检查 `music_dir` 配置是否正确；检查 `/tree` 和 `/search_song` API

### Q: 排行榜显示错误
A: 检查 `playback_history.json` 格式；检查 `/playback_history` API

### Q: YouTube 搜索失败
A: 检查 yt-dlp 是否安装；检查网络连接；查看浏览器 Console 错误信息

---

## 📚 深入学习

| 想了解... | 查看文档 |
|----------|---------|
| 应用启动流程 | [ARCHITECTURE_GUIDE.md](ARCHITECTURE_GUIDE.md) |
| 文件的具体作用 | [FILE_MANIFEST.md](FILE_MANIFEST.md) |
| API 完整说明 | [ROUTES_MAPPING.md](ROUTES_MAPPING.md) |
| 前端结构说明 | [FRONTEND_STRUCTURE.md](FRONTEND_STRUCTURE.md) |
| 配置系统详解 | [CONFIG_UPDATE.md](CONFIG_UPDATE.md) |
| 构建和部署 | [BUILD_GUIDE.md](BUILD_GUIDE.md) |
| Flask 迁移过程 | [FASTAPI_MIGRATION.md](FASTAPI_MIGRATION.md) |
| 整体迁移总结 | [MIGRATION_REPORT.md](MIGRATION_REPORT.md) |

---

## 🎨 UI 组件速查

| 组件 | 文件 | 用法 |
|------|------|------|
| Toast 提示 | modules/ui.js | Toast.show("消息", "success") |
| Loading 加载 | modules/ui.js | loading.show() / loading.hide() |
| Modal 弹窗 | modules/ui.js | showModal("标题", "内容") |
| 时间格式化 | modules/ui.js | formatTime(seconds) |

---

## 🚀 一分钟启动指南

```bash
# 1. 进入项目目录
cd MusicPlayer

# 2. 安装依赖（首次）
pip install -r requirements.txt

# 3. 启动应用
python main.py

# 4. 打开浏览器
# 访问 http://localhost/

# 5. 享受音乐！🎵
```

---

## 📞 获取帮助

1. **查看文档**
   - `doc/` 文件夹有 14+ 个详细说明文档
   - `README.md` 有快速开始指南

2. **查看代码注释**
   - fastapi_app.py 中每个路由都有说明
   - models/ 中每个类都有 docstring

3. **调试**
   - 打开浏览器 F12 看 Network 和 Console
   - 查看应用日志输出
   - 访问 `/debug/mpv` 诊断播放器问题

4. **常见问题**
   - 见本文档的"常见问题速解"部分
   - 见 [README.md](../README.md) 的 FAQ 部分
