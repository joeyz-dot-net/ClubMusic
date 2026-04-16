// UI 工具函数和组件模块
import { i18n } from './i18n.js';
import { focusFirstFocusable, restoreFocus, trapFocusInContainer } from './utils.js';

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

// 显示通知/Toast - 现代化毛玻璃设计
export class Toast {
    static maxConcurrent = 3;

    static trimVisibleToasts(limit = this.maxConcurrent - 1) {
        const toasts = Array.from(document.querySelectorAll('.toast'));
        const overflow = toasts.length - limit;

        if (overflow <= 0) {
            return;
        }

        toasts.slice(0, overflow).forEach((toast) => toast.remove());
    }

    static show(message, type = 'info', duration = 3000) {
        this.trimVisibleToasts();

        const toast = createElement('div', `toast toast-${type}`);
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');
        
        // 图标映射（圆形徽章）
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        // 创建内容结构：图标 + 消息
        const icon = icons[type] || icons.info;
        const iconElement = createElement('div', 'toast-icon', icon);
        const messageElement = createElement('div', 'toast-message', String(message ?? ''));

        toast.appendChild(iconElement);
        toast.appendChild(messageElement);
        
        document.body.appendChild(toast);
        
        // 滑入并淡入
        setTimeout(() => {
            toast.classList.add('toast-visible');
        }, 10);
        
        // 自动移除（滑出并淡出）
        setTimeout(() => {
            toast.classList.remove('toast-visible');
            setTimeout(() => {
                if (toast.parentNode) {
                    document.body.removeChild(toast);
                }
            }, 400);
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

    show(message) {
        const msg = message || i18n.t('loading.default');
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
        const content = createElement('div');
        content.style.textAlign = 'center';
        content.style.color = 'white';

        const spinnerIndicator = createElement('div', 'loading-spinner');
        const messageElement = createElement('div', '', String(msg));
        messageElement.style.marginTop = '12px';

        content.appendChild(spinnerIndicator);
        content.appendChild(messageElement);
        spinner.appendChild(content);

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

// 自定义确认对话框（替代 window.confirm）
export class ConfirmModal {
    /**
     * 显示确认对话框
     * @param {Object} options - { title, message, type: 'danger'|'warning'|'info' }
     * @returns {Promise<boolean>}
     */
    static show({ title, message = '', type = 'info' } = {}) {
        return new Promise((resolve) => {
            const overlay = createElement('div', 'custom-modal-overlay');
            const container = createElement('div', 'custom-modal-container');
            const previousActiveElement = document.activeElement;
            let closed = false;

            const typeColors = {
                danger:  { btn: '#e53935', hover: '#c62828' },
                warning: { btn: '#fb8c00', hover: '#e65100' },
                info:    { btn: '#1e88e5', hover: '#1565c0' },
            };
            const colors = typeColors[type] || typeColors.info;

            overlay.setAttribute('role', 'presentation');
            container.setAttribute('role', 'dialog');
            container.setAttribute('aria-modal', 'true');
            container.setAttribute('aria-label', String(title || i18n.t('modal.confirm')));

            const body = createElement('div', 'custom-modal-body');
            const titleElement = createElement('div', 'custom-modal-title', String(title || ''));
            body.appendChild(titleElement);

            if (message) {
                const messageElement = createElement('div', 'custom-modal-message', String(message));
                body.appendChild(messageElement);
            }

            const footer = createElement('div', 'custom-modal-footer');
            const cancelButton = createElement('button', 'custom-modal-btn custom-modal-btn-cancel', i18n.t('modal.cancel'));
            cancelButton.type = 'button';

            const confirmButton = createElement('button', `custom-modal-btn custom-modal-btn-confirm ${type}`, i18n.t('modal.confirm'));
            confirmButton.type = 'button';
            confirmButton.style.background = colors.btn;
            confirmButton.addEventListener('mouseenter', () => {
                confirmButton.style.background = colors.hover;
            });
            confirmButton.addEventListener('mouseleave', () => {
                confirmButton.style.background = colors.btn;
            });

            footer.appendChild(cancelButton);
            footer.appendChild(confirmButton);
            container.appendChild(body);
            container.appendChild(footer);

            overlay.appendChild(container);
            document.body.appendChild(overlay);

            const close = (result) => {
                if (closed) return;
                closed = true;
                document.removeEventListener('keydown', handleKeydown);
                overlay.classList.remove('visible');
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                    restoreFocus(previousActiveElement);
                }, 300);
                resolve(result);
            };

            const handleKeydown = (event) => {
                if (!document.body.contains(overlay)) {
                    return;
                }

                if (event.key === 'Escape') {
                    event.preventDefault();
                    close(false);
                    return;
                }

                trapFocusInContainer(event, container);
            };

            cancelButton.addEventListener('click', () => close(false));
            confirmButton.addEventListener('click', () => close(true));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
            document.addEventListener('keydown', handleKeydown);
            setTimeout(() => {
                overlay.classList.add('visible');
                focusFirstFocusable(container, '.custom-modal-btn-cancel');
            }, 10);
        });
    }
}

// 自定义输入对话框（替代 window.prompt）
export class InputModal {
    /**
     * 显示输入对话框
     * @param {Object} options - { title, placeholder, defaultValue }
     * @returns {Promise<string|null>}
     */
    static show({ title, placeholder = '', defaultValue = '' } = {}) {
        return new Promise((resolve) => {
            const overlay = createElement('div', 'custom-modal-overlay');
            const container = createElement('div', 'custom-modal-container');
            const previousActiveElement = document.activeElement;
            let closed = false;

            overlay.setAttribute('role', 'presentation');
            container.setAttribute('role', 'dialog');
            container.setAttribute('aria-modal', 'true');
            container.setAttribute('aria-label', String(title || i18n.t('modal.confirm')));

            const body = createElement('div', 'custom-modal-body');
            const titleElement = createElement('div', 'custom-modal-title', String(title || ''));
            const input = createElement('input', 'custom-modal-input');
            input.type = 'text';
            input.placeholder = String(placeholder || '');
            input.value = String(defaultValue || '');

            body.appendChild(titleElement);
            body.appendChild(input);

            const footer = createElement('div', 'custom-modal-footer');
            const cancelButton = createElement('button', 'custom-modal-btn custom-modal-btn-cancel', i18n.t('modal.cancel'));
            cancelButton.type = 'button';
            const confirmButton = createElement('button', 'custom-modal-btn custom-modal-btn-confirm info', i18n.t('modal.confirm'));
            confirmButton.type = 'button';

            footer.appendChild(cancelButton);
            footer.appendChild(confirmButton);
            container.appendChild(body);
            container.appendChild(footer);

            overlay.appendChild(container);
            document.body.appendChild(overlay);

            const close = (result) => {
                if (closed) return;
                closed = true;
                document.removeEventListener('keydown', handleKeydown);
                overlay.classList.remove('visible');
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                    restoreFocus(previousActiveElement);
                }, 300);
                resolve(result);
            };

            const handleKeydown = (event) => {
                if (!document.body.contains(overlay)) {
                    return;
                }

                if (event.key === 'Escape') {
                    event.preventDefault();
                    close(null);
                    return;
                }

                if (event.key === 'Enter' && document.activeElement === input) {
                    event.preventDefault();
                    close(input.value);
                    return;
                }

                trapFocusInContainer(event, container);
            };

            cancelButton.addEventListener('click', () => close(null));
            confirmButton.addEventListener('click', () => close(input.value));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
            document.addEventListener('keydown', handleKeydown);
            setTimeout(() => {
                overlay.classList.add('visible');
                focusFirstFocusable(container, '.custom-modal-input');
                input.select();
            }, 10);
        });
    }
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

    show(message) {
        const msg = message || i18n.t('search.searching');
        if (this.overlay) return;

        this.overlay = createElement('div', 'search-loading-overlay');

        const content = createElement('div', 'search-loading-content');
        const spinner = createElement('div', 'search-loading-spinner');

        spinner.appendChild(createElement('div', 'spinner-ring'));
        spinner.appendChild(createElement('div', 'spinner-ring'));
        spinner.appendChild(createElement('div', 'spinner-ring'));

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('class', 'search-icon');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '48');
        icon.setAttribute('height', '48');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z');
        icon.appendChild(path);
        spinner.appendChild(icon);

        const messageElement = createElement('div', 'search-loading-message', String(msg));
        const submessageElement = createElement('div', 'search-loading-submessage', i18n.t('search.loadingRes'));

        content.appendChild(spinner);
        content.appendChild(messageElement);
        content.appendChild(submessageElement);
        this.overlay.appendChild(content);

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
