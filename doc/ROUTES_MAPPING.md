# API 路由映射表

## 后端路由完整列表

### 播放控制
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| POST | `/play` | 播放指定歌曲 | `path`, `title` (JSON) |
| POST | `/play_song` | 播放指定歌曲（别名） | 同 `/play` |
| POST | `/pause` | 暂停/继续播放 | 无 |
| POST | `/toggle_pause` | 暂停/继续播放（别名） | 无 |
| POST | `/next` | 下一曲 | 无 |
| POST | `/prev` | 上一曲 | 无 |
| POST | `/seek` | 跳转到指定位置 | `percent` (form) |
| POST | `/loop` | 切换循环模式 | `mode` (form) |
| GET | `/status` | 获取播放状态 | 无 |

### 音量控制
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| POST | `/volume` | 设置音量 | `volume` (form) |

### 播放队列
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| GET | `/playlist` | 获取当前播放队列 | 无 |
| POST | `/playlist_add` | 添加歌曲到队列 | `path`, `title` (form) |
| POST | `/playlist_play` | 播放队列中指定索引的歌曲 | `index` (form) |
| POST | `/playlist_reorder` | 重新排序播放队列 | `from_index`, `to_index` (JSON) |
| POST | `/playlist_remove` | 从队列移除歌曲 | `index` (form) |
| POST | `/playlist_clear` | 清空播放队列 | 无 |

### 歌单管理
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| GET | `/playlists` | 获取所有歌单列表 | 无 |
| POST | `/playlists` | 创建新歌单 | `name` (JSON) |
| DELETE | `/playlists/{id}` | 删除歌单 | `id` (路径参数) |
| POST | `/playlists/{id}/switch` | 切换到指定歌单 | `id` (路径参数) |
| POST | `/playlist_create` | 创建新歌单（别名） | `name` (form) |

### 搜索功能
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| GET | `/search_song` | 搜索本地歌曲 | `keyword` (query) |
| POST | `/search_youtube` | 搜索YouTube视频 | `keyword` (form) |

### YouTube功能
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| POST | `/youtube_extract_playlist` | 提取YouTube播放列表 | `url` (form) |
| POST | `/play_youtube_playlist` | 播放YouTube播放列表 | `videos` (JSON) |

### 播放历史
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| GET | `/playback_history` | 获取播放历史 | 无 |
| POST | `/song_add_to_history` | 添加到播放历史 | `url`, `title`, `type`, `thumbnail_url` |

### 文件浏览
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| GET | `/tree` | 获取音乐文件树 | 无 |
| GET | `/playlist_songs` | 获取播放列表歌曲信息 | 无 |

### 其他
| 方法 | 路由 | 说明 | 参数 |
|------|------|------|------|
| GET | `/` | 主页 | 无 |
| GET | `/debug/mpv` | MPV调试信息 | 无 |

## 前端fetch调用对照

### main.js 中的所有fetch调用
以下是前端代码中使用的所有API调用，现在都已有对应的后端路由：

```javascript
// ✅ 播放控制
fetch('/play', {method: 'POST', body: JSON.stringify({path, title})})
fetch('/play_song', {method: 'POST', ...})
fetch('/pause', {method: 'POST'})
fetch('/toggle_pause', {method: 'POST'})
fetch('/next', {method: 'POST'})
fetch('/prev', {method: 'POST'})
fetch('/seek', {method: 'POST', body: formData})
fetch('/loop', {method: 'POST', body: formData})
fetch('/status')

// ✅ 音量控制
fetch('/volume', {method: 'POST', body: formData})

// ✅ 播放队列
fetch('/playlist')
fetch('/playlist_add', {method: 'POST', body: formData})
fetch('/playlist_play', {method: 'POST', body: formData})
fetch('/playlist_reorder', {method: 'POST', body: JSON.stringify({from_index, to_index})})
fetch('/playlist_remove', {method: 'POST', body: formData})
fetch('/playlist_clear', {method: 'POST'})

// ✅ 歌单管理
fetch('/playlists')
fetch('/playlists', {method: 'POST', body: JSON.stringify({name})})
fetch(`/playlists/${id}`, {method: 'DELETE'})
fetch(`/playlists/${id}/switch`, {method: 'POST'})
fetch('/playlist_create', {method: 'POST', body: formData})

// ✅ 搜索功能
fetch(`/search_song?keyword=${encodeURIComponent(keyword)}`)
fetch('/search_youtube', {method: 'POST', body: formData})

// ✅ YouTube功能
fetch('/youtube_extract_playlist', {method: 'POST', body: formData})
fetch('/play_youtube_playlist', {method: 'POST', body: JSON.stringify({videos})})

// ✅ 播放历史
fetch('/playback_history')
fetch('/playback_history', {method: 'DELETE'})

// ✅ 文件浏览
fetch('/tree')
fetch('/playlist_songs')
```

## 响应格式规范

### 成功响应
```json
{
  "status": "OK",
  "message": "操作成功",
  "data": { ... }
}
```

### 错误响应
```json
{
  "status": "ERROR",
  "error": "错误详情"
}
```

## 参数传递规范

- **JSON格式**: `Content-Type: application/json`
  - 使用场景: `/play`, `/playlists` (POST), `/playlist_reorder`, `/play_youtube_playlist`
  - 前端代码: `fetch('/api', {body: JSON.stringify({...})})`

- **表单格式**: `Content-Type: multipart/form-data`
  - 使用场景: `/playlist_add`, `/search_youtube`, `/volume`, `/seek`, `/loop`
  - 前端代码: `fetch('/api', {body: formData})`

- **URL参数**: Query String
  - 使用场景: `/search_song?keyword=xxx`
  - 前端代码: `fetch('/search_song?keyword=' + encodeURIComponent(keyword))`

- **路径参数**: RESTful风格
  - 使用场景: `/playlists/{id}`, `/playlists/{id}/switch`
  - 前端代码: `fetch('/playlists/' + id, {method: 'DELETE'})`

## 最近更新记录

### 2025-01-XX 新增路由
1. ✅ `/toggle_pause` - `/pause` 的别名
2. ✅ `/seek` - 进度条跳转
3. ✅ `/play_song` - `/play` 的别名
4. ✅ `/playlist_play` - 播放队列指定索引
5. ✅ `/playlist_reorder` - 重新排序队列
6. ✅ `/playlist_remove` - 移除队列歌曲
7. ✅ `/playlist_clear` - 清空队列
8. ✅ `/playback_history` (GET) - 获取播放历史
9. ✅ `/youtube_extract_playlist` - 提取YouTube播放列表
10. ✅ `/play_youtube_playlist` - 播放YouTube播放列表

所有前端调用现已完全对齐后端路由！
