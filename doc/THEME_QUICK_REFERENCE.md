# 主题系统快速参考

## 📁 文件结构
```
MusicPlayer/
├── templates/
│   └── index.html              # 修改：CSS link标签调整
├── static/
│   ├── css/
│   │   ├── base.css           # 基础样式（不变）
│   │   ├── theme-dark.css     # 暗色主题（独立）
│   │   ├── theme-light.css    # 亮色主题（独立）
│   │   └── responsive.css     # 响应式（不变）
│   └── js/
│       ├── main.js            # 修改：导入themeManager，等待初始化
│       ├── debug.js           # 修改：使用ThemeManager
│       └── themeManager.js    # 新建：主题管理器
└── doc/
    └── THEME_DYNAMIC_LOADING.md  # 新建：详细文档
```

## 🎯 核心改变

### 1. HTML（templates/index.html）
```html
<!-- 之前：静态加载4个CSS -->
<link rel="stylesheet" href="/static/css/base.css?v=1" />
<link rel="stylesheet" href="/static/css/theme-dark.css?v=1" />
<link rel="stylesheet" href="/static/css/theme-light.css?v=1" />
<link rel="stylesheet" href="/static/css/responsive.css?v=1" />

<!-- 之后：动态加载主题 -->
<link rel="stylesheet" href="/static/css/base.css?v=1" />
<!-- 主题 CSS 将由 themeManager 动态加载 -->
<link rel="stylesheet" href="/static/css/responsive.css?v=1" />
```

### 2. main.js
```javascript
// 导入themeManager
import { themeManager } from './themeManager.js';

// 应用启动时等待主题加载
await themeManager.init();
app.init();
```

### 3. debug.js
```javascript
// 导入ThemeManager
import { themeManager } from './themeManager.js';

// 使用ThemeManager而不是本地逻辑
setTheme(theme) {
    this.themeManager.switchTheme(theme);
    this.updateThemeButtons();
}
```

### 4. themeManager.js（新建）
```javascript
export class ThemeManager {
    init()                      // 初始化并加载默认主题
    loadTheme(theme, callback)  // 加载指定主题
    switchTheme(newTheme)       // 切换主题
    getCurrentTheme()           // 获取当前主题
    getAvailableThemes()        // 获取可用主题列表
    applyThemeClass(theme)      // 应用body类名
}

export const themeManager = new ThemeManager();
```

## 🔄 使用示例

### 在调试面板中切换主题
```
打开调试面板（点击🐛按钮）
   ↓
点击"☀️ 亮色"或"🌙 暗色"按钮
   ↓
自动加载对应的CSS文件
   ↓
页面主题改变
```

### 在代码中切换主题
```javascript
// 方式1：使用themeManager
import { themeManager } from './themeManager.js';
themeManager.switchTheme('light');

// 方式2：获取当前主题
const current = themeManager.getCurrentTheme();  // 返回 'dark' 或 'light'

// 方式3：检查可用主题
const available = themeManager.getAvailableThemes();  // ['dark', 'light']
```

## 💾 数据持久化

### localStorage
```
key: 'theme'
value: 'dark' | 'light'
自动保存于: localStorage
自动恢复于: 页面刷新/再次访问
```

### 例子
```javascript
// 存储
localStorage.setItem('theme', 'light');

// 读取
const theme = localStorage.getItem('theme') || 'dark';

// themeManager自动处理这些
```

## 📊 HTTP请求流程

### 初次加载页面
```
1. GET /               → 获取HTML
2. GET /static/css/base.css         → 基础样式（静态）
3. GET /static/css/responsive.css   → 响应式样式（静态）
4. GET /static/js/main.js           → 主应用脚本
5. GET /static/js/themeManager.js   → 主题管理器（动态导入）
6. GET /static/css/theme-dark.css?v=1765760005199  → 主题样式（动态）
```

### 切换主题（亮色）
```
1. GET /static/css/theme-light.css?v=1765760006234  → 新主题样式
   （旧的theme-dark.css自动卸载）
```

## 🎨 主题色值

### 暗色主题（theme-dark.css）
```css
:root {
    --bg-primary: #0a0a0a;
    --text-primary: #ffffff;
    --accent-color: #4a9eff;
    /* ... 更多变量 ... */
}
```

### 亮色主题（theme-light.css）
```css
body.theme-light {
    --bg-primary: #ffffff;
    --text-primary: #000000;
    --accent-color: #0066cc;
    /* ... 更多变量 ... */
}
```

## 🐛 调试技巧

### 浏览器开发者工具
```javascript
// 在控制台查看当前主题
window.modules.themeManager.getCurrentTheme()

// 切换主题
window.modules.themeManager.switchTheme('light')

// 查看可用主题
window.modules.themeManager.getAvailableThemes()

// 查看localStorage
localStorage.getItem('theme')
```

### 网络标签
- 查看theme-*.css的加载
- 验证时间戳查询字符串（防缓存）
- 检查HTTP状态码（200=成功, 304=缓存）

### 元素检查
```html
<!-- 查看动态加载的link标签 -->
<link id="theme-stylesheet" rel="stylesheet" 
      href="/static/css/theme-dark.css?v=1765760005199" />

<!-- 查看body类名 -->
<body class="theme-dark">
```

## ⚡ 性能优化

### 缓存策略
```
base.css         → 版本号固定（?v=1）
responsive.css   → 版本号固定（?v=1）
theme-*.css      → 时间戳（?v={timestamp}）防止缓存
```

### 加载优化
- 主题CSS异步加载
- 其他CSS同步加载（保证初始渲染）
- 使用Promise支持顺序执行

## 📝 常见问题

### Q: 添加新主题怎么做？
A: 
1. 创建 `static/css/theme-newname.css`
2. 定义CSS变量或样式规则
3. 该主题自动可用，无需修改代码

### Q: 主题CSS加载失败怎么办？
A: 自动回退到暗色主题（theme-dark.css）

### Q: 页面刷新会丢失主题选择吗？
A: 不会，主题保存在localStorage中

### Q: 可以同时加载多个主题吗？
A: 不行，同时只能加载一个主题CSS，新主题加载时自动移除旧的

### Q: 移动设备上主题切换有问题吗？
A: 没有，完全兼容iOS和Android浏览器

## 🔗 相关文件链接

- [详细实现文档](THEME_DYNAMIC_LOADING.md)
- [themeManager源码](../static/js/themeManager.js)
- [debug.js源码](../static/js/debug.js)
- [main.js源码](../static/js/main.js)
- [HTML模板](../templates/index.html)

---
**最后更新**: 2025-12-14
**版本**: 1.0
