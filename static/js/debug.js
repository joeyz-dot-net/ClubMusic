// 调试面板模块
import { themeManager } from './themeManager.js';

export class Debug {
    constructor() {
        this.debugLogHistory = [];
        this.elements = {
            debugBtn: document.getElementById('debugBtn'),
            debugModal: document.getElementById('debugModal'),
            debugModalClose: document.getElementById('debugModalClose'),
            debugRefresh: document.getElementById('debugRefresh'),
            debugClearLogs: document.getElementById('debugClearLogs'),
            debugPlayer: document.getElementById('debugPlayer'),
            debugPlaylist: document.getElementById('debugPlaylist'),
            debugStorage: document.getElementById('debugStorage'),
            debugLogs: document.getElementById('debugLogs'),
            themeDarkBtn: document.getElementById('themeDarkBtn'),
            themeLightBtn: document.getElementById('themeLightBtn')
        };
        this.themeManager = themeManager;
    }

    // 初始化调试面板
    init(player, playlistManager) {
        this.player = player;
        this.updateThemeButtons();
        this.playlistManager = playlistManager;
        this.setupConsoleCapture();
        this.setupEventListeners();
    }

    // 捕获console日志
    setupConsoleCapture() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        const addLog = (type, args) => {
            const timestamp = new Date().toLocaleTimeString();
            const message = Array.from(args).map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            this.debugLogHistory.push({ timestamp, type, message });

            // 只保留最近100条日志
            if (this.debugLogHistory.length > 100) {
                this.debugLogHistory.shift();
            }
        };

        console.log = function(...args) {
            originalLog.apply(console, args);
            addLog('LOG', args);
        };

        console.error = function(...args) {
            originalError.apply(console, args);
            addLog('ERROR', args);
        };

        console.warn = function(...args) {
            originalWarn.apply(console, args);
            addLog('WARN', args);
        };
    }

    // 设置事件监听器
    setupEventListeners() {
        // 调试按钮点击
        if (this.elements.debugBtn) {
            this.elements.debugBtn.addEventListener('click', () => {
                this.show();
            });
        }

        // 关闭调试面板
        if (this.elements.debugModalClose) {
            this.elements.debugModalClose.addEventListener('click', () => {
                this.hide();
            });
        }

        // 点击背景关闭
        if (this.elements.debugModal) {
            this.elements.debugModal.addEventListener('click', (e) => {
                if (e.target === this.elements.debugModal) {
                    this.hide();
                }
            });
        }

        // 主题切换按钮
        if (this.elements.themeDarkBtn) {
            this.elements.themeDarkBtn.addEventListener('click', () => {
                this.setTheme('dark');
            });
        }
        if (this.elements.themeLightBtn) {
            this.elements.themeLightBtn.addEventListener('click', () => {
                this.setTheme('light');
            });
        }

        // 刷新调试信息
        if (this.elements.debugRefresh) {
            this.elements.debugRefresh.addEventListener('click', () => {
                this.updateInfo();
            });
        }

        // 清空日志
        if (this.elements.debugClearLogs) {
            this.elements.debugClearLogs.addEventListener('click', () => {
                this.clearLogs();
            });
        }
    }

    // 显示调试面板
    show() {
        if (this.elements.debugModal) {
            this.elements.debugModal.style.display = 'block';
            this.updateInfo();
        }
    }

    // 隐藏调试面板
    hide() {
        if (this.elements.debugModal) {
            this.elements.debugModal.style.display = 'none';
        }
    }

    // 更新调试信息
    updateInfo() {
        this.updatePlayerInfo();
        this.updatePlaylistInfo();
        this.updateStorageInfo();
        this.updateLogs();
    }

    // 更新播放器信息
    updatePlayerInfo() {
        const playerStatus = this.player.getStatus();
        if (this.elements.debugPlayer) {
            const timestamp = new Date().toLocaleTimeString();
            const logsHtml = Object.entries(playerStatus || {}).map(([key, value]) => {
                const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return `<div style="color: #51cf66;">[${timestamp}] ${key}: ${valueStr}</div>`;
            }).join('');
            this.elements.debugPlayer.innerHTML = logsHtml || '<div style="color: #888;">暂无数据</div>';
        }
    }

    // 更新歌单信息
    updatePlaylistInfo() {
        const playlistInfo = {
            currentPlaylistName: this.playlistManager.getCurrentName(),
            playlistCount: this.playlistManager.getCurrent().length,
            allPlaylists: this.playlistManager.getAll().map(p => ({
                id: p.id,
                name: p.name,
                songCount: p.songs?.length || 0
            }))
        };
        if (this.elements.debugPlaylist) {
            const timestamp = new Date().toLocaleTimeString();
            const logsHtml = Object.entries(playlistInfo || {}).map(([key, value]) => {
                const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return `<div style="color: #51cf66;">[${timestamp}] ${key}: ${valueStr}</div>`;
            }).join('');
            this.elements.debugPlaylist.innerHTML = logsHtml || '<div style="color: #888;">暂无数据</div>';
        }
    }

    // 更新本地存储信息
    updateStorageInfo() {
        const storageInfo = {
            localStorage: Object.keys(localStorage).reduce((obj, key) => {
                obj[key] = localStorage.getItem(key);
                return obj;
            }, {}),
            sessionStorage: Object.keys(sessionStorage).reduce((obj, key) => {
                obj[key] = sessionStorage.getItem(key);
                return obj;
            }, {})
        };
        if (this.elements.debugStorage) {
            const timestamp = new Date().toLocaleTimeString();
            const logsHtml = Object.entries(storageInfo || {}).map(([key, value]) => {
                const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return `<div style="color: #51cf66;">[${timestamp}] ${key}: ${valueStr}</div>`;
            }).join('');
            this.elements.debugStorage.innerHTML = logsHtml || '<div style="color: #888;">暂无数据</div>';
        }
    }

    // 更新日志显示
    updateLogs() {
        if (this.elements.debugLogs) {
            const logsHtml = this.debugLogHistory.map(log =>
                `<div style="color: ${this.getLogColor(log.type)};">[${log.timestamp}] ${log.type}: ${log.message}</div>`
            ).join('');
            this.elements.debugLogs.innerHTML = logsHtml || '<div style="color: #888;">暂无日志</div>';
            // 自动滚到底部
            this.elements.debugLogs.scrollTop = this.elements.debugLogs.scrollHeight;
        }
    }

    // 获取日志颜色
    getLogColor(type) {
        switch (type) {
            case 'ERROR':
                return '#ff6b6b';
            case 'WARN':
                return '#ffd93d';
            case 'LOG':
            default:
                return '#51cf66';
        }
    }

    // 清空日志
    clearLogs() {
        this.debugLogHistory = [];
        this.updateLogs();
    }

    // 设置主题
    setTheme(theme) {
        this.themeManager.switchTheme(theme);
        this.updateThemeButtons();
        console.log(`[主题切换] 已切换到${theme === 'dark' ? '暗色' : '亮色'}主题`);
    }

    // 更新主题按钮状态
    updateThemeButtons() {
        const currentTheme = this.themeManager.getCurrentTheme();
        if (this.elements.themeDarkBtn && this.elements.themeLightBtn) {
            if (currentTheme === 'dark') {
                this.elements.themeDarkBtn.style.borderColor = '#667eea';
                this.elements.themeDarkBtn.style.fontWeight = 'bold';
                this.elements.themeLightBtn.style.borderColor = '#999';
                this.elements.themeLightBtn.style.fontWeight = 'normal';
            } else {
                this.elements.themeDarkBtn.style.borderColor = '#999';
                this.elements.themeDarkBtn.style.fontWeight = 'normal';
                this.elements.themeLightBtn.style.borderColor = '#667eea';
                this.elements.themeLightBtn.style.fontWeight = 'bold';
            }
        }
    }
}

// 导出单例
export const debug = new Debug();
