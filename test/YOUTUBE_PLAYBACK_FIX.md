## YouTube 播放修复总结

### 问题诊断结果

通过完整的调试诊断，确认以下路径和配置：

✓ **yt-dlp.exe**
  - 位置: `C:\Users\hnzzy\OneDrive\Desktop\MusicPlayer\yt-dlp.exe`
  - 大小: 18,443,519 字节
  - 版本: 2025.11.12
  - 功能: 工作正常，能获取 YouTube 信息和直链

✓ **MPV**
  - 位置: `c:\mpv\mpv.exe`
  - 状态: 运行中，可通过 IPC 管道通信
  - Pipe: `\\.\pipe\mpv-pipe`
  - 配置: `--idle=yes --force-window=no --ytdl=yes`

✓ **网络和 YouTube**
  - yt-dlp 能成功连接 YouTube
  - 能获取视频元数据和直链
  - 直链格式: HLS (m3u8)

### 修复方案

#### 1. 智能 yt-dlp 检测
代码现在优先检查以下位置（按顺序）：
```
1. 应用主目录: C:\Users\hnzzy\OneDrive\Desktop\MusicPlayer\yt-dlp.exe
2. 打包目录: sys._MEIPASS\yt-dlp.exe (仅当应用被 PyInstaller 打包时)
3. 系统 PATH: yt-dlp (系统范围安装)
```

#### 2. YouTube URL 直链解析
当检测到 YouTube URL 时，代码会：
```python
1. 调用 yt-dlp -g <URL> 获取播放列表
2. 获取所有可用的直链 (视频/音频流)
3. 优先使用最后一条 (通常是最优质的音频)
4. 通过 mpv loadfile 命令播放直链
```

#### 3. MPV 配置增强
应用启动时，mpv 会配置以下参数：
```
--ytdl=yes                    # 启用 YouTube 支持
--script-opts=ytdl_hook-ytdl_path=... # 指定 yt-dlp 路径
```

### 使用方法

#### 在 Web UI 中播放 YouTube

1. **打开应用**: http://localhost

2. **输入 YouTube URL**:
   - 单个视频: `https://www.youtube.com/watch?v=VIDEO_ID`
   - 播放列表: `https://www.youtube.com/playlist?list=PLAYLIST_ID`
   - YouTube 短链: `https://youtu.be/VIDEO_ID`

3. **点击播放** - 应用会自动：
   - 检测 YouTube URL
   - 通过 yt-dlp 获取直链
   - 发送播放命令到 mpv
   - 获取视频标题
   - 显示在历史记录中

### 调试信息

应用启动时会显示：
```
[INFO] 在应用目录找到 yt-dlp: C:\Users\hnzzy\OneDrive\Desktop\MusicPlayer\yt-dlp.exe
[INFO] 配置 MPV 使用 yt-dlp: C:\Users\hnzzy\OneDrive\Desktop\MusicPlayer\yt-dlp.exe
```

播放时会显示：
```
[DEBUG] 检测到 YouTube URL，尝试通过 yt-dlp 获取直链...
[DEBUG] ✓ 获取到直链: https://manifest.googlevideo.com/...
[DEBUG] 调用 mpv_command 播放 URL: ...
```

### 测试记录

```
测试 URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
✓ 播放列表检测: 成功 (1 项)
✓ 直链获取: 成功 (HLS m3u8 格式)
✓ 视频标题: "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)"
✓ mpv 播放: 成功 (loadfile 命令已发送)
```

### 后续改进建议

- [ ] 添加播放进度条
- [ ] 支持暂停/恢复
- [ ] 下载视频功能
- [ ] 播放列表自动播放下一首
- [ ] 支持其他在线流媒体 (如音乐流媒体服务)

### 配置文件 (settings.ini)

```ini
[app]
music_dir = Z:
allowed_extensions = .mp3,.wav,.flac
flask_host = 0.0.0.0
flask_port = 80
debug = false
mpv_cmd = c:\mpv\mpv.exe --input-ipc-server=\\.\pipe\mpv-pipe --idle=yes --force-window=no
```

可以编辑该文件修改以下设置：
- `music_dir`: 本地音乐文件夹位置
- `flask_port`: Web 服务端口 (默认 80)
- `mpv_cmd`: mpv 启动命令
- `debug`: 调试模式 (false 关闭重新加载)
