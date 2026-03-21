/**
 * 主题管理器 - 动态加载和切换CSS主题文件
 * 一个主题一个CSS文件，通过动态加载实现主题切换
 */

export class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.themeCssId = 'theme-stylesheet';
        this.baseUrl = '/static/css';
        this.initialized = false;
        this.loadingPromise = null;
    }

    /**
     * 初始化主题管理器 - 动态加载初始主题
     * 返回一个Promise，当主题加载完成时resolved
     */
    init() {
        if (this.initialized) {
            return Promise.resolve();
        }

        if (!this.loadingPromise) {
            this.loadingPromise = new Promise((resolve) => {
                // 确保DOM已准备好
                if (document.head) {
                    this.loadTheme(this.currentTheme, resolve);
                } else {
                    // 等待DOM准备好
                    document.addEventListener('DOMContentLoaded', () => {
                        this.loadTheme(this.currentTheme, resolve);
                    });
                }
            });
        }

        return this.loadingPromise;
    }

    /**
     * 加载指定主题的CSS文件
     * @param {string} theme - 主题名称 (dark, light 等)
     * @param {function} callback - 加载完成时的回调函数
     */
    loadTheme(theme, callback) {
        // 移除旧的主题CSS
        const oldLink = document.getElementById(this.themeCssId);
        if (oldLink) {
            oldLink.remove();
        }

        // 创建新的主题CSS link标签
        const link = document.createElement('link');
        link.id = this.themeCssId;
        link.rel = 'stylesheet';
        link.href = `${this.baseUrl}/theme-${theme}.css?v=${Date.now()}`;
        
        // 加载完成回调
        link.onload = () => {
            console.log(`[主题加载] 成功加载 ${theme} 主题`);
            this.applyThemeClass(theme);
            this.currentTheme = theme;
            localStorage.setItem('theme', theme);
            this.initialized = true;
            if (callback) callback();
        };

        // 加载失败回调
        link.onerror = () => {
            console.error(`[主题加载] 加载 ${theme} 主题失败，使用默认主题`);
            // 如果加载失败，回退到暗色主题
            if (theme !== 'dark') {
                this.loadTheme('dark', callback);
            } else {
                this.initialized = true;
                if (callback) callback();
            }
        };

        // 添加到文档head中
        if (document.head) {
            document.head.appendChild(link);
        }
    }

    /**
     * 应用主题相关的body类名
     * @param {string} theme - 主题名称
     */
    applyThemeClass(theme) {
        const body = document.body;
        
        // 移除所有主题类
        body.classList.remove('theme-dark', 'theme-light', 'theme-dark-class');
        
        // 添加对应主题类
        if (theme === 'light') {
            body.classList.add('theme-light');
        } else {
            body.classList.add('theme-dark');
        }
    }

    /**
     * 获取当前主题
     * @returns {string} 当前主题名称
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * 切换主题
     * @param {string} newTheme - 新主题名称
     */
    switchTheme(newTheme) {
        if (newTheme !== this.currentTheme) {
            return new Promise((resolve) => {
                this.loadTheme(newTheme, resolve);
            });
        }
        return Promise.resolve();
    }

    /**
     * 获取可用主题列表
     * @returns {array} 主题列表
     */
    getAvailableThemes() {
        return ['auto', 'dark', 'light'];
    }
    
    /**
     * 根据时间获取实际主题
     * @param {string} theme - 主题设置 (auto/dark/light)
     * @returns {string} 实际主题 (dark/light)
     */
    getActualTheme(theme) {
        if (theme === 'auto') {
            const hour = new Date().getHours();
            // 6:00 - 18:00 使用亮色主题，其他时间使用暗色主题
            return (hour >= 6 && hour < 18) ? 'light' : 'dark';
        }
        return theme;
    }
}

// 创建全局实例
export const themeManager = new ThemeManager();
