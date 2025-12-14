# 前端模块化重构指南

## 📁 新的目录结构

```
static/
├── modules/
│   ├── api.js          # API 调用封装
│   ├── player.js       # 播放器控制
│   ├── playlist.js     # 播放列表管理
│   ├── volume.js       # 音量控制
│   ├── search.js       # 搜索功能
│   ├── ui.js           # UI 组件
│   └── utils.js        # 工具函数
├── main.js             # 主入口（使用模块）
└── style.css
```

## 🎯 使用方法

### 1. 在 HTML 中引入（模块方式）

```html
<!-- index.html -->
<script type="module" src="/static/main.js"></script>
```

### 2. 在 main.js 中使用模块

```javascript
// main.js
import { api } from './modules/api.js';
import { player } from './modules/player.js';
import { playlistManager } from './modules/playlist.js';

// 初始化
async function init() {
    // 开始状态轮询
    player.startPolling();
    
    // 监听播放状态变化
    player.on('statusUpdate', ({ status }) => {
        updateUI(status);
    });
    
    // 加载播放列表
    await playlistManager.loadCurrent();
    renderPlaylist();
}

init();
```

## 📦 已创建的模块

### api.js - API 调用封装
```javascript
import { api } from './modules/api.js';

// 使用
const status = await api.getStatus();
await api.play(url, title, 'youtube');
await api.setVolume(50);
```

### player.js - 播放器控制
```javascript
import { player } from './modules/player.js';

// 播放控制
await player.play(url, title);
await player.pause();
await player.next();

// 监听事件
player.on('statusUpdate', ({ status }) => {
    console.log('状态更新:', status);
});

// 开始轮询
player.startPolling(500);
```

### playlist.js - 播放列表管理
```javascript
import { playlistManager } from './modules/playlist.js';

// 加载列表
await playlistManager.loadCurrent();
await playlistManager.loadAll();

// 管理歌单
await playlistManager.create('我的歌单');
await playlistManager.switch(playlistId);
await playlistManager.delete(playlistId);

// 检查重复
if (playlistManager.hasUrl(url)) {
    console.log('歌曲已存在');
}
```

## 🔄 渐进式迁移步骤

### 阶段 1: 保持兼容（当前）
- ✅ 模块已创建在 `static/modules/`
- ✅ 原 `main.js` 保持不变
- ✅ 新旧代码可共存

### 阶段 2: 逐步替换
1. 在 `main.js` 顶部导入模块
2. 逐个功能替换为模块调用
3. 删除旧代码

### 阶段 3: 完全模块化
- 将 `main.js` 拆分为多个模块
- 只保留入口代码在 `main.js`

## 💡 示例：替换播放功能

### 旧代码（main.js）
```javascript
function play(url, title) {
    fetch('/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title })
    })
    .then(r => r.json())
    .then(data => {
        console.log('播放成功');
    });
}
```

### 新代码（使用模块）
```javascript
import { player } from './modules/player.js';

async function play(url, title) {
    const result = await player.play(url, title);
    console.log('播放成功');
}

// 或更简洁
await player.play(url, title);
```

## 🎨 推荐的进一步优化

### 1. 使用 Alpine.js（轻量级）
```html
<div x-data="{ volume: 50 }">
    <input type="range" x-model="volume" @change="setVolume()">
    <span x-text="volume"></span>
</div>
```

### 2. 使用 Petite-Vue（超轻量）
```html
<div v-scope="{ playing: false }">
    <button @click="togglePlay()">
        {{ playing ? '暂停' : '播放' }}
    </button>
</div>
```

## 📚 参考资源

- [ES6 模块](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Modules)
- [Alpine.js](https://alpinejs.dev/)
- [Petite-Vue](https://github.com/vuejs/petite-vue)

## 🚀 下一步建议

1. **立即可用**: 直接使用已创建的模块
2. **渐进替换**: 逐步将 main.js 功能迁移到模块
3. **考虑框架**: 如果需要更复杂的状态管理，考虑 Alpine.js
4. **构建工具**: 如需打包优化，可考虑 Vite 或 esbuild
