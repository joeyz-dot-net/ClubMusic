# 推流状态指示器实现文档

## 功能概述
在导航栏增加了一个推流状态指示器，用来表达当前推流的四种状态，各状态用不同的颜色表示。

## 四种状态

### 1. 推流禁止 (disabled)
- **颜色**: 红色 (#f44336)
- **含义**: 服务器已禁用推流功能
- **触发条件**: 
  - 服务器 `settings.ini` 中 `enable_stream=false`
  - 或 `/config/streaming-enabled` 返回 `streaming_enabled=false`
- **UI反应**: 推流开关被禁用，用户无法启用

### 2. 推流关闭 (closed)
- **颜色**: 灰色 (#9e9e9e)
- **含义**: 服务器允许推流，但客户端未启用
- **触发条件**:
  - 服务器允许推流
  - 用户未启用推流，或推流已停止
  - 推流出错
  - 推流暂停
- **UI反应**: 推流开关可用，用户可选择启用

### 3. 推流缓冲 (buffering)
- **颜色**: 黄色 (#ffc107)，带脉冲动画
- **含义**: 推流正在加载/连接
- **触发条件**: 
  - 用户刚启用推流
  - 调用 `startBrowserStream()` 后
- **UI反应**: 指示器有脉冲动画效果

### 4. 推流播放 (playing)
- **颜色**: 绿色 (#4caf50)，带脉冲动画
- **含义**: 推流正在播放音频
- **触发条件**:
  - 音频元素 `onplay` 事件触发
  - 推流成功启动并正在播放
- **UI反应**: 指示器有脉冲动画效果

## 文件修改

### 1. 后端 (app.py)
**已在之前的工作中完成**
- 添加 `is_streaming_enabled()` 函数
- 添加 `/config/streaming-enabled` 端点
- 修改 `/stream/play`, `/play`, `/stream/control` 路由

### 2. 前端 - HTML (templates/index.html)
**添加推流状态指示器元素**:
```html
<!-- 推流状态指示器 -->
<div id="streamStatusIndicator" class="stream-status-indicator" title="推流状态：禁止">
    <div class="stream-status-dot stream-status-disabled"></div>
    <span class="stream-status-text">推流禁止</span>
</div>
```

**位置**: 在导航栏 `</nav>` 标签后面

### 3. 前端 - CSS (static/css/base.css)
**添加样式** (约60行):
```css
/* 推流状态指示器 */
.stream-status-indicator {
    position: fixed;
    bottom: 70px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.1);
}

.stream-status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    transition: all 0.3s ease;
}

/* 4种状态样式 */
.stream-status-disabled { /* 红色 */ }
.stream-status-closed { /* 灰色 */ }
.stream-status-buffering { /* 黄色 + 脉冲 */ }
.stream-status-playing { /* 绿色 + 脉冲 */ }

/* 脉冲动画 */
@keyframes stream-pulse { ... }
```

### 4. 前端 - JavaScript (static/js/settingsManager.js)
**主要改动**:

#### a) `updateStreamStatusIndicator(status)` 方法 (新增)
```javascript
updateStreamStatusIndicator(status) {
    // 根据status值更新指示器样式和文本
    // 支持的值: 'disabled', 'closed', 'buffering', 'playing'
}
```

#### b) `checkServerStreamingStatus()` 方法 (增强)
在3个地方调用 `updateStreamStatusIndicator()`:
- 服务器禁用时: `updateStreamStatusIndicator('disabled')`
- 服务器启用、客户端未启用时: `updateStreamStatusIndicator('closed')`
- 错误发生时: `updateStreamStatusIndicator('disabled')`

#### c) 推流开关变更事件 (增强)
```javascript
// 当用户启用推流时
if (isEnabled) {
    // 先显示缓冲状态
    this.updateStreamStatusIndicator('buffering');
    // 成功启动后更新为播放状态
    this.updateStreamStatusIndicator('playing');
}

// 当用户禁用推流时
else {
    // 更新为关闭状态
    this.updateStreamStatusIndicator('closed');
}
```

### 5. 前端 - JavaScript (static/js/player.js)
**添加状态更新到音频事件**:

#### a) `onplay` 事件
```javascript
freshAudioElement.onplay = () => {
    // 音频开始播放时，更新指示器为"播放"状态
    if (window.settingsManager) {
        window.settingsManager.updateStreamStatusIndicator('playing');
    }
};
```

#### b) `onerror` 事件
```javascript
freshAudioElement.onerror = (e) => {
    // 播放出错时，更新指示器为"关闭"状态
    if (window.settingsManager) {
        window.settingsManager.updateStreamStatusIndicator('closed');
    }
};
```

#### c) `onpause` 事件
```javascript
freshAudioElement.onpause = () => {
    // 暂停时，更新指示器为"关闭"状态
    if (window.settingsManager) {
        window.settingsManager.updateStreamStatusIndicator('closed');
    }
};
```

## 状态转换流程

```
用户启用推流
  ↓
检查服务器是否允许
  ├─ 不允许 → 指示器设为"禁止" → 无法继续
  └─ 允许
      ↓
    指示器设为"缓冲"（黄色脉冲）
      ↓
    调用 startBrowserStream()
      ↓
    音频 onplay 事件触发
      ↓
    指示器设为"播放"（绿色脉冲）
      ↓
    音频播放...
      ↓
    用户暂停/停止或出错
      ↓
    音频 onpause/onerror 事件触发
      ↓
    指示器设为"关闭"（灰色）


页面加载
  ↓
checkServerStreamingStatus() 初始化
  ├─ 服务器禁用 → 指示器设为"禁止"（红色）
  └─ 服务器允许 → 指示器设为"关闭"（灰色）
```

## 测试方法

### 1. 测试服务器禁用推流
```bash
# 编辑 settings.ini
[app]
enable_stream=false

# 重启应用
python main.py

# 观察：
# - 推流指示器为红色"推流禁止"
# - 推流开关被禁用
# - 无法启用推流
```

### 2. 测试用户启用推流
```bash
# settings.ini
enable_stream=true

# 打开应用，启用推流
# 观察状态转换：灰色 → 黄色（缓冲）→ 绿色（播放）
```

### 3. 测试推流出错
```bash
# 停止 FFmpeg 进程（模拟音频源不可用）
# 启用推流
# 观察：指示器显示黄色缓冲，然后切换到灰色（出错恢复）
```

## 依赖关系

- **后端**: `/config/streaming-enabled` 端点
- **前端**: 
  - `window.settingsManager` 全局对象必须存在
  - `window.settingsManager.updateStreamStatusIndicator()` 方法
  - HTML 元素 ID: `streamStatusIndicator`

## 浏览器兼容性

支持所有现代浏览器，包括：
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- 移动浏览器

## 样式定制

如需修改颜色或动画速度，编辑 `static/css/base.css`:

```css
.stream-status-disabled { /* 修改红色 */ }
.stream-status-closed { /* 修改灰色 */ }
.stream-status-buffering { /* 修改黄色和动画速度 */ }
.stream-status-playing { /* 修改绿色和动画速度 */ }

@keyframes stream-pulse {
    /* 修改动画效果 */
}
```

## 已知限制

1. 指示器位置固定在右下角（距底部70px）
2. 动画速度固定（缓冲1.5s循环，播放1s循环）
3. 文本标签为中文，国际化支持需要进一步开发

## 未来改进方向

1. 支持多语言的状态文本
2. 可配置的指示器位置和样式
3. 连接质量指示（基于网络延迟）
4. 详细的推流统计信息（码率、延迟等）
