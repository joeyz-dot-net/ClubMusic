# FastAPI 音乐播放器 - 打包说明

## 📦 打包成 EXE 可执行文件

### 方法一：使用自动打包脚本（推荐）

**Windows 用户：**
```batch
build_exe.bat
```

脚本会自动：
1. 安装 PyInstaller（如果未安装）
2. 收集所有依赖
3. 打包应用
4. 复制必要文件到 `dist` 目录

### 方法二：手动打包

1. **安装 PyInstaller**
   ```bash
   pip install pyinstaller
   ```

2. **执行打包**
   ```bash
   pyinstaller fastapi_app.spec --clean --noconfirm
   ```

3. **复制额外文件到 `dist\MusicPlayer\` 目录**
   - `mpv.exe` - MPV 播放器（必需）
   - `yt-dlp.exe` - YouTube 下载器（可选）
   - `settings.ini` - 配置文件（首次运行自动创建）

## 📁 打包后的文件结构

```
dist/
└── MusicPlayer/
    ├── MusicPlayer.exe          # 主程序
    ├── mpv.exe                  # MPV 播放引擎
    ├── yt-dlp.exe               # YouTube 下载器
    ├── settings.ini             # 配置文件
    ├── static/                  # 前端资源
    ├── index.html               # 主页面
    ├── playback_history.json    # 播放历史（自动生成）
    ├── playlist.json            # 播放列表（自动生成）
    └── playlists.json           # 歌单数据（自动生成）
```

## 🚀 使用打包后的程序

1. **复制整个 `dist\MusicPlayer` 文件夹到目标位置**

2. **编辑 `settings.ini` 配置音乐目录**
   ```ini
   [app]
   music_dir = D:\Music          # 修改为你的音乐目录
   allowed_extensions = .mp3,.wav,.flac,.m4a
   flask_host = 0.0.0.0
   flask_port = 9000
   debug = false
   mpv_cmd = mpv.exe --input-ipc-server=\\.\pipe\mpv-pipe --idle=yes --force-window=no
   ```

3. **双击 `MusicPlayer.exe` 启动**
   - 程序会自动启动 Uvicorn 服务器
   - 浏览器访问：http://localhost:9000

4. **首次运行可能需要**
   - 允许防火墙访问
   - 确保 `mpv.exe` 在同一目录下

## ⚙️ 打包配置说明

### `fastapi_app.spec` 配置

关键配置项：

```python
# 控制台窗口
console=True         # True: 显示控制台（可看日志）
                    # False: 无窗口模式（适合发布）

# 压缩
upx=True            # 使用 UPX 压缩（减小体积）

# 图标
icon='icon.ico'     # 自定义图标（如果有）
```

### 包含的依赖

- FastAPI + Uvicorn（Web 服务器）
- Starlette（ASGI 框架）
- Pydantic（数据验证）
- yt-dlp（YouTube 支持）
- Pillow（图像处理）
- psutil（进程管理）

## 🔧 常见问题

### 问题 1：打包后运行报错 "No module named 'xxx'"

**解决**：在 `fastapi_app.spec` 的 `hiddenimports` 中添加缺失模块：
```python
hiddenimports = [
    'xxx',  # 添加缺失的模块
]
```

### 问题 2：打包后体积过大

**优化方法**：
1. 使用虚拟环境打包（只安装必需依赖）
2. 启用 UPX 压缩：`upx=True`
3. 排除不需要的模块：
   ```python
   excludes=['tkinter', 'matplotlib', 'numpy']
   ```

### 问题 3：MPV 无法启动

**检查**：
1. `mpv.exe` 是否在同一目录
2. `settings.ini` 中的 `mpv_cmd` 路径是否正确
3. 尝试绝对路径：`C:\path\to\mpv.exe`

### 问题 4：打包时间过长

**正常现象**：首次打包可能需要 5-10 分钟
- 后续打包使用 `--clean` 参数会更快
- 可以删除 `build` 目录加快重新打包

## 📝 打包前检查清单

- [ ] 所有依赖已安装：`pip install -r requirements.txt`
- [ ] 代码无语法错误：`python -m py_compile fastapi_app.py`
- [ ] `settings.ini` 配置正确
- [ ] `mpv.exe` 和 `yt-dlp.exe` 已准备好
- [ ] 已测试 FastAPI 应用可正常运行：`python run_fastapi.py`

## 🎯 高级打包选项

### 单文件模式（不推荐）

如果想打包成单个 .exe 文件：

```bash
pyinstaller run_fastapi.py --onefile --add-data "static;static" --add-data "index.html;." --hidden-import uvicorn
```

**缺点**：
- 启动速度较慢（需解压临时文件）
- 无法方便地修改 `settings.ini`
- 体积更大

### 无控制台窗口模式

适合发布给最终用户：

在 `fastapi_app.spec` 中设置：
```python
console=False  # 无控制台窗口
```

**注意**：无控制台模式下无法看到错误信息，建议调试完成后再使用。

## 📦 分发打包

打包完成后，压缩 `dist\MusicPlayer` 文件夹为 ZIP：

```batch
# PowerShell
Compress-Archive -Path dist\MusicPlayer -DestinationPath MusicPlayer_v1.0.zip
```

分发时提供：
- `MusicPlayer_v1.0.zip`
- `README.md`（使用说明）
- `settings.ini.example`（配置示例）

---

✅ **打包完成后即可在任何 Windows 电脑上运行，无需安装 Python！**
