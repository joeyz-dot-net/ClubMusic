/**
 * 不可用歌曲 URL 集合（session-only，刷新页面后清除）
 * 当后端跳过播放失败的歌曲时，将其 URL 添加到此集合中
 * playlist.js 会检查此集合来标记不可用歌曲
 *
 * 独立模块，避免 main.js ↔ playlist.js 循环依赖
 */
export const unavailableSongs = new Set();
