// UI 工具函数和组件模块

// 创建 DOM 元素的辅助函数
export function createElement(tag, className = '', textContent = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
}

// 格式化时间（秒转 mm:ss）
export function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 显示通知/Toast
export class Toast {
    static show(message, type = 'info', duration = 3000) {
        const toast = createElement('div', `toast toast-${type}`);
        toast.textContent = message;
        
        // 颜色映射
        const bgColors = {
            error: '#f44336',
            success: '#4caf50',
            warning: '#ff9800',
            info: '#2196f3'
        };
        
        // 样式 ✅ 垂直水平居中
        Object.assign(toast.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '12px 24px',
            borderRadius: '4px',
            backgroundColor: bgColors[type] || bgColors.info,
            color: 'white',
            zIndex: '10000',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            opacity: '0',
            transition: 'opacity 0.3s'
        });
        
        document.body.appendChild(toast);
        
        // 淡入
        setTimeout(() => toast.style.opacity = '1', 10);
        
        // 自动移除
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, duration);
    }

    static success(message, duration) {
        this.show(message, 'success', duration);
    }

    static error(message, duration) {
        this.show(message, 'error', duration);
    }

    static info(message, duration) {
        this.show(message, 'info', duration);
    }

    static warning(message, duration) {
        this.show(message, 'warning', duration);
    }
}

// 加载指示器
export class LoadingIndicator {
    constructor() {
        this.overlay = null;
    }

    show(message = '加载中...') {
        if (this.overlay) return;

        this.overlay = createElement('div', 'loading-overlay');
        Object.assign(this.overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '9999'
        });

        const spinner = createElement('div', 'spinner');
        spinner.innerHTML = `
            <div style="text-align: center; color: white;">
                <div class="loading-spinner"></div>
                <div style="margin-top: 12px;">${message}</div>
            </div>
        `;

        this.overlay.appendChild(spinner);
        document.body.appendChild(this.overlay);
    }

    hide() {
        if (this.overlay) {
            document.body.removeChild(this.overlay);
            this.overlay = null;
        }
    }
}

// 确认对话框
export function confirm(message, title = '确认') {
    return new Promise((resolve) => {
        const result = window.confirm(message);
        resolve(result);
    });
}

// 输入对话框
export function prompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        const result = window.prompt(message, defaultValue);
        resolve(result);
    });
}

// 防抖函数
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 节流函数
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 模态框管理
export class Modal {
    constructor(id) {
        this.element = document.getElementById(id);
    }

    show() {
        if (this.element) {
            this.element.style.display = 'block';
        }
    }

    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
    }

    toggle() {
        if (this.element) {
            const isVisible = this.element.style.display !== 'none';
            this.element.style.display = isVisible ? 'none' : 'block';
        }
    }
}

// 搜索专用全屏加载动画
export class SearchLoadingOverlay {
    constructor() {
        this.overlay = null;
    }

    show(message = '🔍 正在搜索...') {
        if (this.overlay) return;

        this.overlay = createElement('div', 'search-loading-overlay');
        this.overlay.innerHTML = `
            <div class="search-loading-content">
                <div class="search-loading-spinner">
                    <div class="spinner-ring"></div>
                    <div class="spinner-ring"></div>
                    <div class="spinner-ring"></div>
                    <svg class="search-icon" viewBox="0 0 24 24" width="48" height="48">
                        <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                    </svg>
                </div>
                <div class="search-loading-message">${message}</div>
                <div class="search-loading-submessage">正在检索本地和网络资源...</div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        // 触发动画
        setTimeout(() => this.overlay.classList.add('visible'), 10);
    }

    hide() {
        if (this.overlay) {
            this.overlay.classList.remove('visible');
            setTimeout(() => {
                if (this.overlay && this.overlay.parentNode) {
                    document.body.removeChild(this.overlay);
                }
                this.overlay = null;
            }, 300);
        }
    }
}

// 导出单例工具
export const loading = new LoadingIndicator();
export const searchLoading = new SearchLoadingOverlay();
