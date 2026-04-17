/**
 * 用户设置管理模块
 * 注意：用户设置存储在浏览器 localStorage 中，不依赖服务器存储
 */

import { Toast } from './ui.js?v=3';
import { themeManager } from './themeManager.js?v=2';
import { i18n } from './i18n.js';
import { api } from './api.js?v=5';
import { focusFirstFocusable, restoreFocus, trapFocusInContainer } from './utils.js?v=2';

export const settingsManager = {
    // 默认设置
    DEFAULT_SETTINGS: {
        'theme': 'auto',
        'language': 'auto'
    },

    // UI 配置（从服务器读取）
    uiConfig: {
        youtube_controls: true,
        expand_button: true
    },

    // 用于存储 player 实例引用
    player: null,
    schema: {},
    buttonGroupCache: new Map(),
    elementCache: new Map(),
    _cachedSettings: null,

    renderDiagnosticsStatus(container, lines, fallbackText) {
        if (!container) return;
        this.setElementText(container, lines && lines.length > 0 ? lines.join('\n') : fallbackText);
    },

    getButtonGroupRefs(groupId) {
        const cached = this.buttonGroupCache.get(groupId);
        if (cached?.group?.isConnected) {
            return cached;
        }

        const group = document.getElementById(groupId);
        if (!group) {
            this.buttonGroupCache.delete(groupId);
            return null;
        }

        const buttons = Array.from(group.querySelectorAll('.settings-btn'));
        const buttonByValue = new Map(
            buttons
                .map((button) => [button.dataset.value, button])
                .filter(([value]) => Boolean(value))
        );
        const labelByValue = new Map(
            buttons
                .map((button) => [button.dataset.value, button.querySelector('.btn-label') || null])
                .filter(([value]) => Boolean(value))
        );
        const refs = { group, buttons, buttonByValue, labelByValue };
        this.buttonGroupCache.set(groupId, refs);
        return refs;
    },

    getCachedElement(cacheKey, resolver = null) {
        const cached = this.elementCache.get(cacheKey);
        if (cached?.isConnected) {
            return cached;
        }

        const element = typeof resolver === 'function'
            ? resolver()
            : document.getElementById(cacheKey);
        if (!element) {
            this.elementCache.delete(cacheKey);
            return null;
        }

        this.elementCache.set(cacheKey, element);
        return element;
    },

    setElementText(element, value) {
        if (!element) {
            return;
        }

        const nextValue = String(value ?? '');
        if (element.textContent !== nextValue) {
            element.textContent = nextValue;
        }
    },

    setElementAttribute(element, name, value) {
        if (!element) {
            return;
        }

        const nextValue = String(value);
        if (element.getAttribute(name) !== nextValue) {
            element.setAttribute(name, nextValue);
        }
    },

    setStyleValue(styleTarget, property, value) {
        if (!styleTarget) {
            return;
        }

        const nextValue = value ?? '';
        if (styleTarget[property] !== nextValue) {
            styleTarget[property] = nextValue;
        }
    },

    applyThemeClass(element, themeClass) {
        if (!element) {
            return false;
        }

        let changed = false;
        ['theme-dark', 'theme-light', 'bright-theme', 'dark-theme'].forEach((className) => {
            if (className !== themeClass && element.classList.contains(className)) {
                element.classList.remove(className);
                changed = true;
            }
        });

        if (!element.classList.contains(themeClass)) {
            element.classList.add(themeClass);
            changed = true;
        }

        return changed;
    },

    setButtonGroupValue(groupId, value) {
        const refs = this.getButtonGroupRefs(groupId);
        if (!refs) return;

        refs.buttons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
    },

    getButtonGroupValue(groupId, fallback = null) {
        const refs = this.getButtonGroupRefs(groupId);
        if (!refs) return fallback;

        const activeButton = refs.buttons.find((button) => button.classList.contains('active')) || null;
        return activeButton?.dataset.value || fallback;
    },

    updateSettingsButtonTexts(groupId, translations) {
        const refs = this.getButtonGroupRefs(groupId);
        if (!refs) return;

        Object.entries(translations).forEach(([value, copy]) => {
            const button = refs.buttonByValue.get(value) || null;
            if (!button) return;

            const label = refs.labelByValue.get(value) || null;
            if (label) {
                this.setElementText(label, copy.label);
            }

            if (button.title !== copy.title) {
                button.title = copy.title;
            }
            this.setElementAttribute(button, 'aria-label', copy.title);
        });
    },
    
    /**
     * 获取设置对象（从 localStorage）
     */
    get settings() {
        return this.loadSettingsFromStorage();
    },

    set settings(value) {
        this.saveSettingsToStorage(value);
    },
    
    /**
     * 设置 player 实例
     */
    setPlayer(playerInstance) {
        this.player = playerInstance;
        console.log('[设置] player 实例已注册');
    },
    
    /**
     * 初始化设置管理器
     */
    async init() {
        try {
            console.log('[设置] 初始化设置管理器（使用浏览器 localStorage）...');
            
            // 从 localStorage 加载设置
            this.loadSettingsFromStorage();
            
            // 更新 UI 表单
            this.updateUI();
            
            // 加载 schema
            await this.loadSchema();

            // 加载 UI 配置（从服务器）
            await this.loadUIConfig();

            // 服务器 UI 配置返回后，重新同步一次表单状态
            this.updateUI();

            // 加载版本号
            await this.loadVersion();

            // 加载实例状态
            await this.loadInstanceStatus();

            // 应用主题
            this.applyTheme();
            
            // 应用语言
            this.applyLanguage();
            
            // 绑定事件
            this.bindEvents();
            
            console.log('✓ 设置管理器已初始化（localStorage）');
        } catch (error) {
            console.error('[设置] 初始化失败:', error);
        }
    },
    
    /**
     * 从 localStorage 加载设置
     */
    normalizeSettings(settings = {}) {
        const nextSettings = (settings && typeof settings === 'object') ? settings : {};
        return {
            ...this.DEFAULT_SETTINGS,
            ...nextSettings,
        };
    },

    loadSettingsFromStorage(forceReload = false) {
        if (!forceReload && this._cachedSettings) {
            return this._cachedSettings;
        }

        const stored = localStorage.getItem('musicPlayerSettings');
        
        if (stored) {
            try {
                const settings = this.normalizeSettings(JSON.parse(stored));
                this._cachedSettings = settings;
                console.log('[设置] 从 localStorage 加载设置:', settings);
                return settings;
            } catch (e) {
                console.error('[设置] 解析 localStorage 失败:', e);
                this._cachedSettings = this.normalizeSettings();
                return this._cachedSettings;
            }
        }
        
        console.log('[设置] localStorage 中无设置，使用默认值');
        this._cachedSettings = this.normalizeSettings();
        return this._cachedSettings;
    },
    
    /**
     * 保存设置到 localStorage
     */
    saveSettingsToStorage(settings) {
        try {
            const normalizedSettings = this.normalizeSettings(settings);
            localStorage.setItem('musicPlayerSettings', JSON.stringify(normalizedSettings));
            this._cachedSettings = normalizedSettings;
            console.log('[设置] 已保存到 localStorage:', normalizedSettings);
            return true;
        } catch (e) {
            console.error('[设置] 保存到 localStorage 失败:', e);
            return false;
        }
    },
    
    /**
     * 获取单个设置值
     */
    getSettings(key) {
        const settings = this.settings;
        return settings[key] !== undefined ? settings[key] : this.DEFAULT_SETTINGS[key];
    },
    
    /**
     * 设置单个值
     */
    setSetting(key, value) {
        const settings = {
            ...this.settings,
            [key]: value,
        };
        this.saveSettingsToStorage(settings);
        console.log(`[设置] ${key} = ${value}`);
        return true;
    },

    getApiErrorMessage(result, fallbackMessage) {
        if (!result) {
            return fallbackMessage;
        }

        return result.error || result.message || result.detail || fallbackMessage;
    },

    assertApiSuccess(result, fallbackMessage) {
        if (!result || result._error || result.status !== 'OK') {
            throw new Error(this.getApiErrorMessage(result, fallbackMessage));
        }

        return result;
    },

    /**
     * 加载设置 schema
     */
    async loadSchema() {
        try {
            const result = this.assertApiSuccess(
                await api.getSettingsSchema(),
                'Schema加载失败'
            );

            this.schema = result.schema;
            console.log('[设置] Schema已加载');
        } catch (error) {
            console.error('[设置] Schema加载失败:', error);
        }
    },

    /**
     * 从服务器加载版本号
     */
    async loadVersion() {
        try {
            const result = this.assertApiSuccess(
                await api.getVersion(),
                '版本号加载失败'
            );
            if (result.version) {
                const el = document.getElementById('appVersionText');
                if (el) el.textContent = `ClubMusic v${result.version}`;
            }
        } catch (error) {
            console.error('[设置] 版本号加载失败:', error);
        }
    },

    async loadInstanceStatus() {
        const container = document.getElementById('settingsInstanceStatus');
        if (!container) {
            return null;
        }

        this.renderDiagnosticsStatus(container, [i18n.t('debug.loading')], i18n.t('debug.noData'));

        try {
            const result = this.assertApiSuccess(
                await api.getInstanceStatus(),
                i18n.t('debug.loadFailed')
            );
            const status = result.data || {};
            const lines = Object.entries(status).map(([key, value]) => {
                const serializedValue = typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value);
                return `${key}: ${serializedValue}`;
            });
            this.renderDiagnosticsStatus(container, lines, i18n.t('debug.noData'));
            return status;
        } catch (error) {
            console.error('[设置] 实例状态加载失败:', error);
            this.renderDiagnosticsStatus(
                container,
                [`${i18n.t('debug.loadFailed')}: ${error.message}`],
                i18n.t('debug.noData')
            );
            return null;
        }
    },

    /**
     * 从服务器加载 UI 配置
     */
    async loadUIConfig() {
        try {
            const result = this.assertApiSuccess(
                await api.getUIConfig(),
                'UI配置加载失败'
            );

            this.uiConfig = result.data;
            console.log('[设置] UI配置已加载:', this.uiConfig);
            return this.uiConfig;
        } catch (error) {
            console.error('[设置] UI配置加载失败:', error);
            // 使用默认值
            return this.uiConfig;
        }
    },

    /**
     * 保存 UI 配置到服务器
     */
    async saveUIConfig(config) {
        try {
            const result = this.assertApiSuccess(
                await api.saveUIConfig(config),
                'UI配置保存失败'
            );

            this.uiConfig = result.data;
            console.log('[设置] UI配置已保存:', this.uiConfig);
            return true;
        } catch (error) {
            console.error('[设置] UI配置保存失败:', error);
            return false;
        }
    },

    /**
     * 更新UI - 将设置值同步到表单
     */
    updateUI() {
        const settings = this.settings;
        
        // 主题按钮组
        const themeGroup = document.getElementById('themeSetting');
        if (themeGroup) {
            const currentTheme = settings.theme || 'auto';
            this.setButtonGroupValue('themeSetting', currentTheme);
        }
        
        // 语言按钮组
        const langGroup = document.getElementById('languageSetting');
        if (langGroup) {
            const currentLang = settings.language || 'auto';
            this.setButtonGroupValue('languageSetting', currentLang);
        }
    },
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 主题按钮组
        const themeGroupRefs = this.getButtonGroupRefs('themeSetting');
        if (themeGroupRefs) {
            themeGroupRefs.buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const value = btn.dataset.value;
                    // 更新按钮状态
                    themeGroupRefs.buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    // 保存并应用
                    this.setSetting('theme', value);
                    this.applyTheme(value);
                });
            });
        }
        
        // 语言按钮组
        const langGroupRefs = this.getButtonGroupRefs('languageSetting');
        if (langGroupRefs) {
            langGroupRefs.buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const value = btn.dataset.value;
                    // 更新按钮状态
                    langGroupRefs.buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    // 保存并应用
                    this.setSetting('language', value);
                    this.applyLanguage(value);
                });
            });
        }

        // 关闭按钮 - 使用 settingsManager 对象引用，确保调用最新的方法（兼容 main.js 的重写）
        const closeBtn = document.getElementById('settingsCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => settingsManager.closePanel());
        }
        
        // 点击遮罩关闭 - 使用 settingsManager 对象引用，确保调用最新的方法（兼容 main.js 的重写）
        const mask = document.getElementById('settingsMask');
        if (mask) {
            mask.addEventListener('click', (e) => {
                if (e.target === mask) {
                    settingsManager.closePanel();
                }
            });
        }
    },
    
    /**
     * 应用主题
     */
    applyTheme(theme = null) {
        if (theme === null) {
            theme = this.getSettings('theme') || 'dark';
        }
        
        // 如果是自动模式，根据时间决定主题
        let actualTheme = theme;
        if (theme === 'auto') {
            const hour = new Date().getHours();
            // 6:00 - 18:00 使用亮色主题，其他时间使用暗色主题
            actualTheme = (hour >= 6 && hour < 18) ? 'light' : 'dark';
            console.log(`[设置] 自动主题模式: 当前时间 ${hour}:00, 使用 ${actualTheme} 主题`);
        }
        
        console.log(`[设置] 准备应用主题: ${actualTheme}`);

        const themeManagerWillReload = Boolean(themeManager)
            && (!themeManager.initialized || themeManager.getCurrentTheme?.() !== actualTheme);
        let shouldRerenderPlaylist = themeManagerWillReload;
        
        // 调用 themeManager 加载主题 CSS 和应用主题 class
        if (themeManager) {
            themeManager.loadTheme(actualTheme, () => {
                console.log(`[设置] themeManager 已应用主题: ${actualTheme}`);
            });
        }
        
        // 应用 data-theme 属性
        if (document.documentElement.getAttribute('data-theme') !== actualTheme) {
            document.documentElement.setAttribute('data-theme', actualTheme);
            shouldRerenderPlaylist = true;
        }
        
        // 统一的主题类名
        const themeClass = actualTheme === 'light' ? 'theme-light' : 'theme-dark';
        
        // 应用 body 类名
        const body = document.body;
        shouldRerenderPlaylist = this.applyThemeClass(body, themeClass) || shouldRerenderPlaylist;
        console.log(`[设置] body 类名已更新: ${body.className}`);
        
        // 应用歌单类名
        const applyThemeToPlaylist = () => {
            const playlistEl = this.getCachedElement('playlist');
            if (!playlistEl) {
                return false;
            }

            this.applyThemeClass(playlistEl, themeClass);
            return true;
        };

        const playlistEl = this.getCachedElement('playlist');
        if (playlistEl) {
            shouldRerenderPlaylist = this.applyThemeClass(playlistEl, themeClass) || shouldRerenderPlaylist;
            console.log(`[设置] playlist 类名已更新: ${playlistEl.className}`);
        } else {
            shouldRerenderPlaylist = true;
            setTimeout(() => {
                if (applyThemeToPlaylist()) {
                    const playlistEl = this.getCachedElement('playlist');
                    console.log(`[设置] playlist 类名已更新（重试）: ${playlistEl.className}`);
                }
            }, 100);
        }
        
        // 仅在实际主题状态发生变化时重绘歌单抬头，避免同态调用造成无效刷新
        if (shouldRerenderPlaylist) {
            setTimeout(() => {
                if (window.app && typeof window.app.renderPlaylist === 'function') {
                    console.log(`[设置] 重新渲染播放列表抬头（主题切换到 ${actualTheme}）`);
                    window.app.renderPlaylist();
                } else {
                    console.log('[设置] 无法找到 window.app.renderPlaylist 方法');
                }
            }, 200);
        }
    },
    
    /**
     * 应用语言设置
     */
    applyLanguage(language = null) {
        if (language === null) {
            language = this.getSettings('language') || i18n.currentLanguage || 'zh';
        }
        
        // 如果选择"自动"，则自动检测浏览器语言
        if (language === 'auto') {
            language = i18n.detectBrowserLanguage();
            console.log(`[设置] 自动选择语言: ${language}`);
        }
        
        console.log(`[设置] 准备应用语言: ${language}`);
        
        // 设置 i18n 语言
        i18n.setLanguage(language);
        
        // 更新设置页面的文本内容
        this.updateSettingsUIText(language);
    },

    /**
     * 应用全屏控件设置
     */
    async applyFullscreenControls() {
        const youtubeEnabled = this.uiConfig.youtube_controls;
        const expandEnabled = this.uiConfig.expand_button;

        // 通知 ktvSync 更新 YouTube 控件
        // 注意：如果播放器还未创建，会跳过更新（播放器创建时会自动读取配置）
        if (window.ktvSync && window.ktvSync.player) {
            await window.ktvSync.updateControlsVisibility(youtubeEnabled);
        } else {
            console.log('[设置] YouTube 播放器未创建，跳过控件更新（创建时将自动读取配置）');
        }

        // 更新放大按钮显示
        const expandBtn = this.getCachedElement('fullPlayerExpand');
        if (expandBtn) {
            expandBtn.classList.toggle('hidden', !expandEnabled);
        }

        console.log(`[设置] 全屏控件已更新：YouTube=${youtubeEnabled}, 放大按钮=${expandEnabled}`);
    },

    /**
     * 更新设置页面的 UI 文本
     */
    updateSettingsUIText(language) {
        console.log(`[设置] 更新 UI 文本为语言: ${language}`);
        
        // 更新设置标题
        const title = this.getCachedElement('settingsTitle', () => document.querySelector('.settings-title'));
        if (title) this.setElementText(title, i18n.t('settings.title', language));

        const closeBtn = this.getCachedElement('settingsCloseBtn');
        if (closeBtn) {
            const closeText = i18n.t('modal.close', language);
            if (closeBtn.title !== closeText) {
                closeBtn.title = closeText;
            }
            this.setElementAttribute(closeBtn, 'aria-label', closeText);
        }
        
        // 更新外观设置章节
        const appearanceSection = this.getCachedElement('appearanceSectionTitle');
        if (appearanceSection) this.setElementText(appearanceSection, i18n.t('settings.appearance', language));

        const diagnosticsSection = this.getCachedElement('diagnosticsSectionTitle');
        if (diagnosticsSection) this.setElementText(diagnosticsSection, i18n.t('settings.diagnostics', language));

        const instanceStatusLabel = this.getCachedElement('instanceStatusLabel');
        if (instanceStatusLabel) this.setElementText(instanceStatusLabel, i18n.t('settings.instanceStatus', language));

        const themeLabel = this.getCachedElement('themeLabel');
        if (themeLabel) this.setElementText(themeLabel, i18n.t('settings.theme', language));

        this.updateSettingsButtonTexts('themeSetting', {
            auto: {
                label: i18n.t('settings.theme.auto', language),
                title: i18n.t('settings.theme.auto', language)
            },
            dark: {
                label: i18n.t('settings.theme.dark', language),
                title: i18n.t('settings.theme.dark', language)
            },
            light: {
                label: i18n.t('settings.theme.light', language),
                title: i18n.t('settings.theme.light', language)
            }
        });
        
        // 更新语言标签
        const langLabel = this.getCachedElement('languageLabel');
        if (langLabel) this.setElementText(langLabel, i18n.t('settings.language', language));

        this.updateSettingsButtonTexts('languageSetting', {
            auto: {
                label: i18n.t('settings.language.auto', language),
                title: i18n.t('settings.language.auto', language)
            },
            zh: {
                label: i18n.t('settings.language.zh', language),
                title: i18n.t('settings.language.zh', language)
            },
            'zh-TW': {
                label: i18n.t('settings.language.zh-TW', language),
                title: i18n.t('settings.language.zh-TW', language)
            },
            en: {
                label: i18n.t('settings.language.en', language),
                title: i18n.t('settings.language.en', language)
            }
        });

    },
    
    /**
     * 保存设置
     */
    async saveSettings() {
        try {
            // 显示保存中的提示
            this.showNotification(i18n.t('settings.saving'), 'info');
            
            // 收集表单数据
            const updates = {
                theme: this.getButtonGroupValue('themeSetting', 'dark'),
                language: this.getButtonGroupValue('languageSetting', 'auto')
            };
            
            // 发送到服务器
            const result = this.assertApiSuccess(
                await api.saveSettings(updates),
                '保存设置失败'
            );

            this.settings = result.data;
            this.applyTheme(updates.theme);
            
            // 应用语言设置
            this.applyLanguage(updates.language);
            
            // 显示保存成功提示
            this.showNotification(i18n.t('settings.saveSuccess'), 'success');
            console.log('[设置] 已保存');
            
            // 延迟 1.5 秒后关闭设置面板 - 使用 settingsManager 对象引用确保调用最新的方法
            console.log('[设置] 将在 1.5 秒后关闭设置面板...');
            setTimeout(() => {
                settingsManager.closePanel();
            }, 1500);
        } catch (error) {
            console.error('[设置] 保存失败:', error);
            this.showNotification(i18n.t('settings.saveFailed') + ': ' + error.message, 'error');
        }
    },
    
    /**
     * 重置设置
     */
    async resetSettings() {
        console.log('[DEBUG] resetSettings() 被调用了');
        if (!confirm(i18n.t('settings.resetConfirm'))) {
            console.log('[DEBUG] 用户取消了重置');
            return;
        }
        
        try {
            console.log('[DEBUG] 开始重置为默认值...');
            
            // 默认设置值
            const defaults = {
                theme: 'dark',
                language: 'zh'
            };
            
            // 设置表单元素为默认值
            const themeEl = document.getElementById('themeSetting');
            const languageEl = document.getElementById('languageSetting');
            
            if (themeEl) this.setButtonGroupValue('themeSetting', defaults.theme);
            if (languageEl) this.setButtonGroupValue('languageSetting', defaults.language);
            
            console.log('[DEBUG] 表单元素已重置为默认值');
            
            // 显示重置中的提示
            this.showNotification(i18n.t('settings.resetting'), 'info');
            
            // 保存到服务器
            const updates = {
                theme: defaults.theme,
                language: defaults.language
            };
            
            console.log('[DEBUG] 发送保存请求...');
            const result = this.assertApiSuccess(
                await api.saveSettings(updates),
                '重置设置失败'
            );
            console.log('[DEBUG] 保存结果:', result);

            this.settings = result.data;
            this.applyTheme(defaults.theme);
            this.applyLanguage(defaults.language);
            
            // 显示重置成功提示
            this.showNotification(i18n.t('settings.resetSuccess'), 'success');
            console.log('[设置] 已重置');
            
            // 不关闭面板，不刷新页面，用户可继续调整设置
        } catch (error) {
            console.error('[设置] 重置失败:', error);
            this.showNotification(i18n.t('settings.resetFailed') + ': ' + error.message, 'error');
        }
    },
    
    /**
     * 显示设置面板
     */
    openPanel() {
        const panel = this.getCachedElement('settingsPanel');
        if (panel) {
            const isAlreadyVisible = panel.getAttribute('aria-hidden') === 'false'
                && panel.style.display === 'block';

            if (!isAlreadyVisible) {
                panel._previousActiveElement = document.activeElement;
            }

            this.setElementAttribute(panel, 'aria-modal', 'true');
            this.setElementAttribute(panel, 'aria-hidden', 'false');
            if (!panel.hasAttribute('tabindex')) {
                this.setElementAttribute(panel, 'tabindex', '-1');
            }
            this.setStyleValue(panel.style, 'display', 'block');
            this.setStyleValue(document.body.style, 'overflow', 'hidden');

            if (!panel._keydownHandler) {
                panel._keydownHandler = (event) => {
                    if (panel.style.display === 'none') {
                        return;
                    }

                    if (event.key === 'Escape') {
                        event.preventDefault();
                        this.closePanel();
                        return;
                    }

                    trapFocusInContainer(event, panel);
                };
            }

            document.addEventListener('keydown', panel._keydownHandler);
            if (!isAlreadyVisible) {
                void this.loadInstanceStatus();
            }
            setTimeout(() => {
                focusFirstFocusable(panel, '#settingsCloseBtn');
            }, 10);
            if (!isAlreadyVisible) {
                console.log('[设置] 打开设置面板');
            }
        }
    },

    hidePanel({ shouldRestoreFocus = false, log = false } = {}) {
        const panel = this.getCachedElement('settingsPanel');
        if (!panel) {
            return;
        }

        const isAlreadyHidden = panel.getAttribute('aria-hidden') === 'true'
            && panel.style.display === 'none';

        if (panel._keydownHandler) {
            document.removeEventListener('keydown', panel._keydownHandler);
        }

        this.setStyleValue(panel.style, 'display', 'none');
        this.setElementAttribute(panel, 'aria-hidden', 'true');
        this.setStyleValue(document.body.style, 'overflow', '');

        if (shouldRestoreFocus) {
            restoreFocus(panel._previousActiveElement);
        }

        if (log && !isAlreadyHidden) {
            console.log('[设置] 关闭设置面板');
        }
    },
    
    /**
     * 关闭设置面板
     */
    closePanel() {
        this.hidePanel({ shouldRestoreFocus: true, log: true });
    },
    
    /**
     * 获取单个设置
     */
    get(key, defaultValue = null) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
    },
    
    /**
     * 设置单个值
     */
    async set(key, value) {
        try {
            this.assertApiSuccess(
                await api.updateSetting(key, value),
                `设置 ${key} 失败`
            );

            this.settings[key] = value;
            console.log(`[设置] ${key} = ${value}`);
            return true;
        } catch (error) {
            console.error(`[设置] 设置 ${key} 失败:`, error);
            return false;
        }
    }
};
