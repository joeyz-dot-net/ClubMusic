# 配置系统更新说明

## 问题描述
启动时仍然显示过时的 FLASK_* 配置标签：
```
[INFO]   FLASK_HOST: 0.0.0.0
[INFO]   FLASK_PORT: 9000
```

## 根本原因
Flask 框架已完全移除，但配置系统中仍在使用 `FLASK_HOST` 和 `FLASK_PORT` 名称。这造成：
1. 混淆：名称与实际框架（FastAPI）不符
2. 难以维护：新开发者可能误认为仍在使用 Flask

## 完成的修复

### 1. 配置常量更新 (models/player.py)
```python
# 旧配置
DEFAULT_CONFIG = {
    "FLASK_HOST": "0.0.0.0",
    "FLASK_PORT": "9000",
    ...
}

# 新配置
DEFAULT_CONFIG = {
    "SERVER_HOST": "0.0.0.0",
    "SERVER_PORT": "80",
    ...
}
```

### 2. 初始化参数更新 (models/player.py)
```python
# 旧签名
def __init__(self, flask_host="0.0.0.0", flask_port=9000, ...):
    self.flask_host = flask_host
    self.flask_port = int(flask_port)

# 新签名
def __init__(self, server_host="0.0.0.0", server_port=80, ...):
    self.server_host = server_host
    self.server_port = int(server_port)
    # 向后兼容性别名
    self.flask_host = server_host
    self.flask_port = int(server_port)
```

### 3. 配置文件读取更新 (models/player.py)
```python
# from_ini_file() 方法中的配置读取
server_host = cfg.get("SERVER_HOST", cls.DEFAULT_CONFIG["SERVER_HOST"])
server_port_str = cfg.get("SERVER_PORT", cls.DEFAULT_CONFIG["SERVER_PORT"])

# 输出也相应更新
print(f"[INFO]   SERVER_HOST: {server_host}")
print(f"[INFO]   SERVER_PORT: {server_port_str}")
```

### 4. 配置文件格式 (settings.ini)
```ini
[app]
music_dir = Z:
allowed_extensions = .mp3,.wav,.flac
server_host = 0.0.0.0
server_port = 80
debug = false
mpv_cmd = c:\mpv\mpv.exe --input-ipc-server=\\.\pipe\mpv-pipe --idle=yes --force-window=no
```

### 5. 启动脚本已支持 (run_fastapi.py)
```python
# 已正确读取新的配置名
host = config.get("app", "server_host", fallback="0.0.0.0")
port = config.getint("app", "server_port", fallback=80)
```

## 向后兼容性
为了不破坏任何可能仍在使用 `PLAYER.flask_host` 和 `PLAYER.flask_port` 的代码，已添加别名属性：
```python
self.flask_host = server_host       # 别名，不推荐使用
self.flask_port = int(server_port)  # 别名，不推荐使用
```

## 验证清单
- [x] DEFAULT_CONFIG 中更新常量名
- [x] __init__() 参数名更新
- [x] 配置读取逻辑更新
- [x] 日志输出更新
- [x] settings.ini 配置格式更新
- [x] 向后兼容性别名添加
- [x] run_fastapi.py 已正确使用新名称

## 预期改进
启动日志现在应该显示：
```
[INFO]   SERVER_HOST: 0.0.0.0
[INFO]   SERVER_PORT: 80
[INFO]   DEBUG: false
```

而不是过时的 FLASK_* 标签。

## 迁移检查清单
- FastAPI 框架 ✅
- 配置系统 ✅
- 日志输出 ✅
- 启动脚本 ✅
- 向后兼容性 ✅

**整个 Flask → FastAPI 迁移现已完全对齐！**
