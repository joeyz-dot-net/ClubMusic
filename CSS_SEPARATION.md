# CSS 文件分离说明

## 文件结构

CSS 已分离为以下模块化文件：

### 1. **base.css** (基础样式)
- 全局重置和通用样式
- 布局和组件结构
- 不包含任何主题相关的颜色变量
- 大小：约 14KB
- 用途：所有页面共享的基础样式

### 2. **theme-dark.css** (暗色主题)
- `:root` CSS 变量定义（暗色默认）
- 暗色主题的所有颜色定义
- 暗色主题特定的组件样式
- 包括深红色调的特殊样式 (dark-theme 类)
- 大小：约 8KB
- 用途：默认主题，支持暗色模式

### 3. **theme-light.css** (浅色主题)
- `body.theme-light` 的 CSS 变量定义
- 浅色主题的所有颜色定义
- 浅色主题特定的组件样式
- 包括深红色调的特殊样式 (dark-theme 类)
- 大小：约 7KB
- 用途：浅色主题和亮色模式

### 4. **responsive.css** (响应式设计)
- 所有媒体查询和响应式规则
- 四种断点优化：
  - `@media (max-width: 768px)` - 平板和小屏幕
  - `@media (max-width: 480px)` - 手机
  - `@media (max-width: 430px)` - iPhone 优化
  - `@media (min-width: 390px) and (max-width: 430px)` - iPhone 12+ 优化
- 大小：约 12KB
- 用途：确保所有设备上的最佳显示效果

## 加载顺序

HTML 中按以下顺序加载（在 `templates/index.html` 第 57-60 行）：

```html
<link rel="stylesheet" href="/static/css/base.css?v=1" />
<link rel="stylesheet" href="/static/css/theme-dark.css?v=1" />
<link rel="stylesheet" href="/static/css/theme-light.css?v=1" />
<link rel="stylesheet" href="/static/css/responsive.css?v=1" />
```

**加载顺序的重要性：**
1. `base.css` - 定义所有基础结构和布局
2. `theme-dark.css` - 应用暗色主题的变量和样式（默认）
3. `theme-light.css` - 提供浅色主题的覆盖样式
4. `responsive.css` - 应用媒体查询，可以覆盖前面的样式

## CSS 变量系统

### 暗色主题变量 (theme-dark.css)

```css
:root {
    --bg-primary: #0a0a0a;      /* 主背景 */
    --bg-secondary: #1a1a1a;    /* 次背景 */
    --bg-tertiary: #2a2a2a;     /* 三级背景 */
    --text-primary: #ffffff;    /* 主文本 */
    --text-secondary: #cccccc;  /* 次文本 */
    --text-tertiary: #888888;   /* 三级文本 */
    --border-color: #333333;    /* 边框 */
    --accent-color: #4a9eff;    /* 强调色 */
    /* ... 其他变量 ... */
}
```

### 浅色主题变量 (theme-light.css)

```css
body.theme-light {
    --bg-primary: #ffffff;      /* 主背景 */
    --bg-secondary: #f5f5f5;    /* 次背景 */
    --text-primary: #000000;    /* 主文本 */
    --text-secondary: #333333;  /* 次文本 */
    --accent-color: #0066cc;    /* 强调色 */
    /* ... 其他变量 ... */
}
```

## 主题切换方式

在 JavaScript 中切换主题：

```javascript
// 切换到浅色主题
document.body.classList.add('theme-light');

// 切换回暗色主题（默认）
document.body.classList.remove('theme-light');
```

## 优势

1. **模块化** - 每个文件职责清晰
2. **易于维护** - 修改主题只需编辑对应文件
3. **易于扩展** - 添加新主题只需创建新的 CSS 文件
4. **性能优化** - 可以按需加载主题样式
5. **代码复用** - base.css 中的样式被所有主题共享
6. **浏览器缓存** - 独立的文件可以被单独缓存

## 特殊类名

### 播放列表主题类
- `.bright-theme` - 浅色播放列表主题
- `.dark-theme` - 深红色播放列表主题

### 示例用法
```html
<!-- 使用浅色主题 -->
<div id="playlist" class="playlist-tab bright-theme"></div>

<!-- 使用深红色主题 -->
<div id="playlist" class="playlist-tab dark-theme"></div>
```

## 文件大小对比

| 文件 | 大小 | 说明 |
|------|------|------|
| 原 style.css | 约 100KB | 单一文件，包含所有样式 |
| base.css | 约 14KB | 基础样式 |
| theme-dark.css | 约 8KB | 暗色主题 |
| theme-light.css | 约 7KB | 浅色主题 |
| responsive.css | 约 12KB | 响应式设计 |
| **总计** | **约 41KB** | **分离后减少 59KB** ✓ |

> 注意：实际大小可能因为压缩而更小

## 后续优化建议

1. **分离 style.css.backup**
   - 旧的备份文件可以删除或归档

2. **添加 CSS 预处理**
   - 使用 SASS/LESS 进一步优化变量管理

3. **按需加载**
   - 可以考虑使用 JavaScript 动态加载主题 CSS

4. **主题配置文件**
   - 创建 JSON 文件定义所有主题，方便管理和扩展

## 维护提示

- 修改颜色时，在相应主题文件中编辑
- 添加新组件时，在 base.css 中添加结构，在主题文件中添加颜色
- 响应式样式应该放在 responsive.css 中
- 避免在 HTML 中使用内联样式
