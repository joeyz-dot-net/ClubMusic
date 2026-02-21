// 工具函数模块

// 深拷贝对象
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    
    const clonedObj = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            clonedObj[key] = deepClone(obj[key]);
        }
    }
    return clonedObj;
}

// 生成唯一ID
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 安全的 JSON 解析
export function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (error) {
        console.error('JSON 解析失败:', error);
        return defaultValue;
    }
}

// 本地存储工具
export const storage = {
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('存储数据失败:', error);
            return false;
        }
    },

    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('读取数据失败:', error);
            return defaultValue;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('删除数据失败:', error);
            return false;
        }
    },

    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('清空存储失败:', error);
            return false;
        }
    }
};

// URL 参数解析
export function parseUrlParams(url = window.location.href) {
    const params = {};
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
    });
    return params;
}

// 格式化文件大小
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 获取文件扩展名
export function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
}

// 检查是否为移动设备
export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 复制文本到剪贴板
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        // 降级方案
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    }
}

// 延迟函数
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 重试函数
export async function retry(fn, options = {}) {
    const {
        maxAttempts = 3,
        delay = 1000,
        onRetry = null
    } = options;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            
            if (onRetry) {
                onRetry(attempt, error);
            }
            
            await sleep(delay * attempt);
        }
    }
}

// 事件发射器
export class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
        return () => this.off(event, listener);
    }

    off(event, listenerToRemove) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(
            listener => listener !== listenerToRemove
        );
    }

    emit(event, ...args) {
        if (!this.events[event]) return;
        this.events[event].forEach(listener => {
            listener(...args);
        });
    }

    once(event, listener) {
        const onceWrapper = (...args) => {
            listener(...args);
            this.off(event, onceWrapper);
        };
        this.on(event, onceWrapper);
    }
}

// ==========================================
// 缩略图管理器 - 统一处理 YouTube 缩略图降级
// ==========================================

/**
 * ThumbnailManager - 缩略图降级与失败缓存管理
 *
 * YouTube 缩略图质量选项:
 *   - maxresdefault.jpg (1280x720) - 仅高清视频存在
 *   - hqdefault.jpg (480x360)     - 推荐默认，几乎所有视频都有
 *   - sddefault.jpg (640x480)     - 仅旧版 4:3 视频存在，现代 16:9 视频无此文件
 *   - mqdefault.jpg (320x180)     - 中等质量，可靠性极高
 *   - default.jpg (120x90)        - 最低质量，总是存在
 */
export class ThumbnailManager {
    constructor() {
        // 缓存失败的 URL，避免重复请求
        this._failedUrls = new Set();
    }

    /**
     * 检查 URL 是否已知失败
     * @param {string} url - 缩略图 URL
     * @returns {boolean}
     */
    isKnownFailed(url) {
        return this._failedUrls.has(url);
    }

    /**
     * 标记 URL 为失败
     * @param {string} url - 缩略图 URL
     */
    markAsFailed(url) {
        if (url) {
            this._failedUrls.add(url);
        }
    }

    /**
     * 获取 YouTube 缩略图的降级 URL 列表
     * @param {string} url - 原始缩略图 URL
     * @returns {string[]} - 降级 URL 列表（按质量从高到低）
     */
    getFallbackUrls(url) {
        if (!url || typeof url !== 'string') {
            return [];
        }

        // 检查是否是 YouTube 缩略图
        if (url.includes('img.youtube.com/vi/')) {
            const baseUrl = url.substring(0, url.lastIndexOf('/'));
            // 规范化：sddefault.jpg 仅存在于旧版 4:3 视频，历史数据中大量存在
            // 将其重定向到 hqdefault.jpg（几乎所有视频都有）以消除 404
            const normalizedFirst = url.endsWith('/sddefault.jpg')
                ? baseUrl + '/hqdefault.jpg'
                : url;
            return [
                normalizedFirst,            // hqdefault.jpg（或其他原始质量）
                baseUrl + '/mqdefault.jpg', // 320x180，可靠性极高
                baseUrl + '/default.jpg'    // 120x90，100% 存在
            ];
        }

        // 非 YouTube URL，直接返回原始 URL
        return [url];
    }

    /**
     * 为图片元素设置降级处理
     * @param {HTMLImageElement} imgElement - 图片元素
     * @param {string} originalUrl - 原始缩略图 URL
     * @param {string} placeholderEmoji - 失败时显示的占位符 emoji（默认 '🎵'）
     */
    setupFallback(imgElement, originalUrl, placeholderEmoji = '🎵') {
        if (!imgElement || !originalUrl) return;

        // 如果已知失败，直接隐藏
        if (this.isKnownFailed(originalUrl)) {
            imgElement.style.display = 'none';
            this._showPlaceholder(imgElement, placeholderEmoji);
            return;
        }

        const fallbackUrls = this.getFallbackUrls(originalUrl);
        let currentIndex = 0;

        // 设置初始 src
        imgElement.crossOrigin = 'anonymous';
        imgElement.src = fallbackUrls[0] || originalUrl;

        // 设置 onerror 处理
        imgElement.onerror = () => {
            currentIndex++;
            if (currentIndex < fallbackUrls.length) {
                // 尝试下一个降级版本
                imgElement.src = fallbackUrls[currentIndex];
            } else {
                // 所有降级都失败，标记并显示占位符
                this.markAsFailed(originalUrl);
                imgElement.style.display = 'none';
                this._showPlaceholder(imgElement, placeholderEmoji);
            }
        };
    }

    /**
     * 批量为容器内的所有图片设置降级处理
     * @param {HTMLElement} container - 容器元素
     * @param {string} selector - 图片选择器（默认 'img[data-original-url]'）
     * @param {string} placeholderEmoji - 占位符 emoji
     */
    setupFallbackForContainer(container, selector = 'img[data-original-url]', placeholderEmoji = '🎵') {
        if (!container) return;

        const images = container.querySelectorAll(selector);
        images.forEach(img => {
            const originalUrl = img.getAttribute('data-original-url') || img.src;
            this.setupFallback(img, originalUrl, placeholderEmoji);
        });
    }

    /**
     * 显示占位符
     * @private
     */
    _showPlaceholder(imgElement, emoji) {
        const placeholder = imgElement.nextElementSibling;
        if (placeholder && placeholder.classList.contains('track-cover-placeholder')) {
            placeholder.style.display = 'flex';
        }
    }

    /**
     * 清除失败缓存（用于测试或重试）
     */
    clearFailedCache() {
        this._failedUrls.clear();
    }

    /**
     * 获取失败缓存大小
     * @returns {number}
     */
    getFailedCacheSize() {
        return this._failedUrls.size;
    }
}

// 导出单例
export const thumbnailManager = new ThumbnailManager();
