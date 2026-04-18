// 调试面板模块
import { themeManager } from './themeManager.js?v=2';
import { i18n } from './i18n.js?v=2';

function stringifyDebugValue(value) {
    if (typeof value !== 'object' || value === null) {
        return String(value);
    }

    try {
        return JSON.stringify(value);
    } catch {
        return '[Unserializable Object]';
    }
}

function createDebugTextLine(text, color) {
    const line = document.createElement('div');
    line.style.color = color;
    line.textContent = text;
    return line;
}

function normalizeDebugEntryText(text) {
    return String(text).replace(/^\[[^\]]+\]\s*/, '');
}

export class Debug {
    constructor() {
        this.debugLogHistory = [];
        this.logEnabled = localStorage.getItem('debugLogEnabled') !== 'false'; // 默认启用
        this.elements = {};
        this.consoleCaptureSetup = false;
        this.eventListenersBound = false;
        this.renderSignatureCache = new WeakMap();
        this.refreshElements();
        this.themeManager = themeManager;
    }

    setStyleValue(styleTarget, property, value) {
        if (!styleTarget) {
            return;
        }

        const nextValue = value ?? '';
        if (styleTarget[property] !== nextValue) {
            styleTarget[property] = nextValue;
        }
    }

    setAttributeValue(element, name, value) {
        if (!element) {
            return;
        }

        const nextValue = String(value);
        if (element.getAttribute(name) !== nextValue) {
            element.setAttribute(name, nextValue);
        }
    }

    refreshElements() {
        this.elements = {
            debugBtn: document.getElementById('playlistsDebugBtn') || document.getElementById('debugBtn'),
            debugModal: document.getElementById('debugModal'),
            debugModalClose: document.getElementById('debugModalClose'),
            debugRefresh: document.getElementById('debugRefresh'),
            debugClearLogs: document.getElementById('debugClearLogs'),
            debugPlayer: document.getElementById('debugPlayer'),
            debugInstance: document.getElementById('debugInstance'),
            debugPlaylist: document.getElementById('debugPlaylist'),
            debugStorage: document.getElementById('debugStorage'),
            debugLogs: document.getElementById('debugLogs'),
            themeDarkBtn: document.getElementById('themeDarkBtn'),
            themeLightBtn: document.getElementById('themeLightBtn'),
            logToggle: document.getElementById('debugLogToggle') || document.getElementById('logToggle')
        };

        return this.elements;
    }

    hasDebugPanel() {
        return Boolean(this.elements.debugModal);
    }

    // 初始化调试面板
    init(player, playlistManager, api) {
        this.player = player;
        this.refreshElements();
        this.updateThemeButtons();
        this.playlistManager = playlistManager;
        this.api = api;
        this.setupConsoleCapture();
        this.setupEventListeners();
    }


    // 捕获console日志
    setupConsoleCapture() {
        if (this.consoleCaptureSetup) {
            return;
        }

        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;

        const addLog = (type, args) => {
            // 检查日志开关是否启用
            if (!this.logEnabled) {
                return;
            }

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

        this.consoleCaptureSetup = true;
    }

    // 设置事件监听器
    setupEventListeners() {
        if (this.eventListenersBound) {
            return;
        }

        // 调试按钮点击 - 使用事件委托，因为按钮现在在设置面板内
        document.addEventListener('click', (e) => {
            if (e.target.closest('#playlistsDebugBtn, #debugBtn')) {
                this.show();
            }
        });

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
                void this.updateInfo();
            });
        }

        // 清空日志
        if (this.elements.debugClearLogs) {
            this.elements.debugClearLogs.addEventListener('click', () => {
                this.clearLogs();
            });
        }

        // 日志开关
        if (this.elements.logToggle) {
            // 初始化复选框状态
            this.elements.logToggle.checked = this.logEnabled;
            
            this.elements.logToggle.addEventListener('change', (e) => {
                this.logEnabled = e.target.checked;
                localStorage.setItem('debugLogEnabled', this.logEnabled);
                console.log(`[日志] 控制台日志已${this.logEnabled ? '启用' : '禁用'}`);
            });
        }

        this.eventListenersBound = true;
    }

    // 显示调试面板
    show() {
        this.refreshElements();
        if (!this.hasDebugPanel()) {
            return;
        }

        const isAlreadyVisible = this.elements.debugModal.style.display === 'block'
            && this.elements.debugModal.getAttribute('aria-hidden') === 'false';
        if (isAlreadyVisible) {
            return;
        }

        this.setStyleValue(this.elements.debugModal.style, 'display', 'block');
        this.setAttributeValue(this.elements.debugModal, 'aria-hidden', 'false');
        void this.updateInfo();
    }

    // 隐藏调试面板
    hide() {
        this.refreshElements();
        if (!this.hasDebugPanel()) {
            return;
        }

        const isAlreadyHidden = this.elements.debugModal.style.display === 'none'
            && this.elements.debugModal.getAttribute('aria-hidden') === 'true';
        if (isAlreadyHidden) {
            return;
        }

        this.setStyleValue(this.elements.debugModal.style, 'display', 'none');
        this.setAttributeValue(this.elements.debugModal, 'aria-hidden', 'true');
    }

    // 更新调试信息
    async updateInfo() {
        this.refreshElements();
        if (!this.hasDebugPanel()) {
            return;
        }

        this.updatePlayerInfo();
        await this.updateInstanceInfo();
        this.updatePlaylistInfo();
        this.updateStorageInfo();
        this.updateLogs();
    }

    // 更新播放器信息
    updatePlayerInfo() {
        const playerStatus = this.player.getStatus();
        if (this.elements.debugPlayer) {
            const timestamp = new Date().toLocaleTimeString();
            this.renderDebugEntries(this.elements.debugPlayer, Object.entries(playerStatus || {}).map(([key, value]) => ({
                text: `[${timestamp}] ${key}: ${stringifyDebugValue(value)}`,
                color: '#51cf66'
            })), i18n.t('debug.noData'), { ignoreTimestamp: true });
        }
    }

    async updateInstanceInfo() {
        if (!this.elements.debugInstance) {
            return;
        }

        const timestamp = new Date().toLocaleTimeString();
        if (!this.renderSignatureCache.has(this.elements.debugInstance)) {
            this.renderDebugEntries(this.elements.debugInstance, [{
                text: `[${timestamp}] ${i18n.t('debug.loading')}`,
                color: '#ffd93d'
            }], i18n.t('debug.noData'), { ignoreTimestamp: true });
        }

        try {
            const result = await this.api?.getInstanceStatus();
            if (!result || result._error || result.status !== 'OK') {
                const errorMessage = result?.error || result?.message || i18n.t('debug.loadFailed');
                this.renderDebugEntries(this.elements.debugInstance, [{
                    text: `[${timestamp}] ${i18n.t('debug.loadFailed')}: ${errorMessage}`,
                    color: '#ff6b6b'
                }], i18n.t('debug.noData'), { ignoreTimestamp: true });
                return;
            }

            const status = result.data || {};
            const entries = Object.entries(status).map(([key, value]) => ({
                text: `[${timestamp}] ${key}: ${stringifyDebugValue(value)}`,
                color: '#51cf66'
            }));
            this.renderDebugEntries(this.elements.debugInstance, entries, i18n.t('debug.noData'), { ignoreTimestamp: true });
        } catch (error) {
            this.renderDebugEntries(this.elements.debugInstance, [{
                text: `[${timestamp}] ${i18n.t('debug.loadFailed')}: ${error.message}`,
                color: '#ff6b6b'
            }], i18n.t('debug.noData'), { ignoreTimestamp: true });
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
            this.renderDebugEntries(this.elements.debugPlaylist, Object.entries(playlistInfo || {}).map(([key, value]) => ({
                text: `[${timestamp}] ${key}: ${stringifyDebugValue(value)}`,
                color: '#51cf66'
            })), i18n.t('debug.noData'), { ignoreTimestamp: true });
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
            this.renderDebugEntries(this.elements.debugStorage, Object.entries(storageInfo || {}).map(([key, value]) => ({
                text: `[${timestamp}] ${key}: ${stringifyDebugValue(value)}`,
                color: '#51cf66'
            })), i18n.t('debug.noData'), { ignoreTimestamp: true });
        }
    }

    // 更新日志显示
    updateLogs() {
        if (this.elements.debugLogs) {
            const changed = this.renderDebugEntries(this.elements.debugLogs, this.debugLogHistory.map((log) => ({
                text: `[${log.timestamp}] ${log.type}: ${log.message}`,
                color: this.getLogColor(log.type)
            })), i18n.t('debug.noLogs'));
            if (changed) {
                this.elements.debugLogs.scrollTop = this.elements.debugLogs.scrollHeight;
            }
        }
    }

    renderDebugEntries(container, entries, emptyMessage, { ignoreTimestamp = false } = {}) {
        if (!container) {
            return false;
        }

        const normalizedEntries = (!entries || entries.length === 0)
            ? [{ text: emptyMessage, color: '#888' }]
            : entries.map((entry) => ({
                text: ignoreTimestamp ? normalizeDebugEntryText(entry.text) : entry.text,
                color: entry.color
            }));

        const signature = JSON.stringify(normalizedEntries);
        if (this.renderSignatureCache.get(container) === signature) {
            return false;
        }

        const fragment = document.createDocumentFragment();
        if (!entries || entries.length === 0) {
            fragment.appendChild(createDebugTextLine(emptyMessage, '#888'));
        } else {
            entries.forEach((entry) => {
                fragment.appendChild(createDebugTextLine(entry.text, entry.color));
            });
        }

        container.replaceChildren(fragment);
        this.renderSignatureCache.set(container, signature);
        return true;
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
    async setTheme(theme) {
        try {
            await this.themeManager.switchTheme(theme);
            this.updateThemeButtons();
            console.log(`[主题切换] 已切换到${theme === 'dark' ? '暗色' : '亮色'}主题`);
        } catch (err) {
            console.error(`[主题切换] 切换失败:`, err);
        }
    }

    // 更新主题按钮状态
    updateThemeButtons() {
        this.refreshElements();
        const currentTheme = this.themeManager.getCurrentTheme();
        if (this.elements.themeDarkBtn && this.elements.themeLightBtn) {
            if (currentTheme === 'dark') {
                this.setStyleValue(this.elements.themeDarkBtn.style, 'borderColor', '#667eea');
                this.setStyleValue(this.elements.themeDarkBtn.style, 'fontWeight', 'bold');
                this.setStyleValue(this.elements.themeLightBtn.style, 'borderColor', '#999');
                this.setStyleValue(this.elements.themeLightBtn.style, 'fontWeight', 'normal');
            } else {
                this.setStyleValue(this.elements.themeDarkBtn.style, 'borderColor', '#999');
                this.setStyleValue(this.elements.themeDarkBtn.style, 'fontWeight', 'normal');
                this.setStyleValue(this.elements.themeLightBtn.style, 'borderColor', '#667eea');
                this.setStyleValue(this.elements.themeLightBtn.style, 'fontWeight', 'bold');
            }
        }
    }


}

// 导出单例
export const debug = new Debug();
