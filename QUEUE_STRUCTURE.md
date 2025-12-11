# play_queue.json 数据结构说明

## 新的结构设计

### 格式

```json
{
  "songs": [
    {
      "url": "path/to/song1.mp3",
      "title": "歌曲标题",
      "name": "歌曲标题",
      "type": "local",
      "duration": 180.5,
      "ts": 1702123456,
      "file_name": "song1.mp3",
      "file_extension": ".mp3",
      "file_size": 1024000
    },
    {
      "url": "https://www.youtube.com/watch?v=xyz123",
      "title": "YouTube 视频标题",
      "name": "YouTube 视频标题",
      "type": "youtube",
      "duration": 0,
      "ts": 1702123457,
      "stream_type": "youtube",
      "video_id": "xyz123",
      "thumbnail_url": "https://img.youtube.com/vi/xyz123/default.jpg"
    }
  ],
  "current_index": 0
}
```

## 关键点

### URL 字段
- **本地歌曲**: 原始的相对路径或绝对路径（如 `path/to/song.mp3`）
- **YouTube 歌曲**: 完整的 YouTube URL（如 `https://www.youtube.com/watch?v=xyz123`）
- ✅ 不包含 `StreamSong` 对象序列化字符串

### Type 字段
- **本地歌曲**: `"local"`
- **YouTube 视频**: `"youtube"`
- **其他串流**: 相应的类型标识符（如 `"stream"`）

### 字段说明

| 字段 | 本地歌曲 | YouTube | 说明 |
|------|---------|---------|------|
| url | ✅ | ✅ | 原始URL/路径 |
| title | ✅ | ✅ | 歌曲标题 |
| name | ✅ | ✅ | 标题别名（兼容前端） |
| type | ✅ | ✅ | 歌曲类型标识符 |
| duration | ✅ | ✅ | 时长（秒） |
| ts | ✅ | ✅ | 时间戳 |
| file_name | ✅ | ❌ | 文件名 |
| file_extension | ✅ | ❌ | 文件扩展名 |
| file_size | ✅ | ❌ | 文件大小（字节） |
| stream_type | ❌ | ✅ | 串流类型 |
| video_id | ❌ | ✅ | YouTube 视频ID |
| thumbnail_url | ❌ | ✅ | 缩略图URL |

## 加载和保存

### 保存逻辑
```python
# 通过 Song.to_dict() 自动生成正确的字典
data = play_queue.to_dict()
# 输出: {"songs": [...], "current_index": -1}
```

### 加载逻辑
```python
# 通过 Song.from_dict() 自动识别类型并创建正确的对象
play_queue.from_dict(data)
```

## 优点

1. ✅ **清晰的类型区分** - 通过 `type` 字段明确区分本地和串流
2. ✅ **原始URL保存** - 直接保存原始URL，无需解析对象字符串
3. ✅ **自动反序列化** - `Song.from_dict()` 自动创建正确的 Song 子类对象
4. ✅ **向后兼容** - 保留所有必需字段，支持旧版本升级
5. ✅ **易于扩展** - 支持添加新的流媒体类型

