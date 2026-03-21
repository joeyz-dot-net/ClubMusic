/**
 * 用户设置管理模块
 * 注意：用户设置存储在浏览器 localStorage 中，不依赖服务器存储
 */

import { Toast } from './ui.js';
import { themeManager } from './themeManager.js';
import { i18n } from './i18n.js';
import { api } from './api.js';
import { focusFirstFocusable, restoreFocus, trapFocusInContainer } from './utils.js';

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
    uiConfigSaveInFlight: false,

    setButtonGroupValue(groupId, value) {
        const group = document.getElementById(groupId);
        if (!group) return;

        group.querySelectorAll('.settings-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.value === value);
        });
    },

    getButtonGroupValue(groupId, fallback = null) {
        const group = document.getElementById(groupId);
        if (!group) return fallback;

        const activeButton = group.querySelector('.settings-btn.active');
        return activeButton?.dataset.value || fallback;
    },

    updateSettingsButtonTexts(groupId, translations) {
        const group = document.getElementById(groupId);
        if (!group) return;

        Object.entries(translations).forEach(([value, copy]) => {
            const button = group.querySelector(`.settings-btn[data-value="${value}"]`);
            if (!button) return;

            const label = button.querySelector('.btn-label');
            if (label) {
                label.textContent = copy.label;
            }

            button.title = copy.title;
            button.setAttribute('aria-label', copy.title);
        });
    },
    
    /**
     * 获取设置对象（从 localStorage）
     */
    get settings() {
        return this.loadSettingsFromStorage();
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
    loadSettingsFromStorage() {
        const stored = localStorage.getItem('musicPlayerSettings');
        
        if (stored) {
            try {
                const settings = JSON.parse(stored);
                console.log('[设置] 从 localStorage 加载设置:', settings);
                return settings;
            } catch (e) {
                console.error('[设置] 解析 localStorage 失败:', e);
                return this.DEFAULT_SETTINGS;
            }
        }
        
        console.log('[设置] localStorage 中无设置，使用默认值');
        return this.DEFAULT_SETTINGS;
    },
    
    /**
     * 保存设置到 localStorage
     */
    saveSettingsToStorage(settings) {
        try {
            localStorage.setItem('musicPlayerSettings', JSON.stringify(settings));
            console.log('[设置] 已保存到 localStorage:', settings);
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
        const settings = this.loadSettingsFromStorage();
        return settings[key] !== undefined ? settings[key] : this.DEFAULT_SETTINGS[key];
    },
    
    /**
     * 设置单个值
     */
    setSetting(key, value) {
        const settings = this.loadSettingsFromStorage();
        settings[key] = value;
        this.saveSettingsToStorage(settings);
        console.log(`[设置] ${key} = ${value}`);
        return true;
    },

    /**
     * 加载设置 schema
     */
    async loadSchema() {
        try {
            const response = await fetch('/settings/schema');
            const result = await response.json();

            if (result.status === 'OK') {
                this.schema = result.schema;
                console.log('[设置] Schema已加载');
            }
        } catch (error) {
            console.error('[设置] Schema加载失败:', error);
        }
    },

    /**
     * 从服务器加载版本号
     */
    async loadVersion() {
        try {
            const response = await fetch('/version');
            const result = await response.json();
            if (result.status === 'OK' && result.version) {
                const el = document.getElementById('appVersionText');
                if (el) el.textContent = `ClubMusic v${result.version}`;
            }
        } catch (error) {
            console.error('[设置] 版本号加载失败:', error);
        }
    },

    /**
     * 从服务器加载 UI 配置
     */
    async loadUIConfig() {
        try {
            const response = await fetch('/ui-config');
            const result = await response.json();

            if (result.status === 'OK') {
                this.uiConfig = result.data;
                console.log('[设置] UI配置已加载:', this.uiConfig);
                return this.uiConfig;
            }
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
            const response = await fetch('/ui-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();

            if (result.status === 'OK') {
                this.uiConfig = result.data;
                console.log('[设置] UI配置已保存:', this.uiConfig);
                return true;
            } else {
                console.error('[设置] UI配置保存失败:', result.error);
                return false;
            }
        } catch (error) {
            console.error('[设置] UI配置保存失败:', error);
            return false;
        }
    },

    setUIConfigTogglesDisabled(disabled) {
        ['youtubeControlsToggle', 'expandButtonToggle'].forEach((id) => {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.disabled = disabled;
            }
        });
    },

    async handleUIConfigToggleChange(toggle, configKey, enabled, successMessage) {
        const previousConfig = { ...this.uiConfig };
        const previousValue = previousConfig[configKey];

        if (previousValue === enabled) {
            toggle.checked = enabled;
            return true;
        }

        if (this.uiConfigSaveInFlight) {
            toggle.checked = previousValue;
            return false;
        }

        this.uiConfigSaveInFlight = true;
        this.setUIConfigTogglesDisabled(true);

        try {
            const success = await this.saveUIConfig({
                ...previousConfig,
                [configKey]: enabled
            });

            if (!success) {
                this.uiConfig = previousConfig;
                toggle.checked = previousValue;
                Toast.error(i18n.t('settings.saveFailed'));
                return false;
            }

            toggle.checked = this.uiConfig[configKey];
            await this.applyFullscreenControls();
            console.log(successMessage);
            return true;
        } catch (error) {
            this.uiConfig = previousConfig;
            toggle.checked = previousValue;
            console.error('[设置] UI配置切换失败:', error);
            Toast.error(i18n.t('settings.saveFailed'));
            return false;
        } finally {
            this.uiConfigSaveInFlight = false;
            this.setUIConfigTogglesDisabled(false);
        }
    },

    /**
     * 更新UI - 将设置值同步到表单
     */
    updateUI() {
        const settings = this.loadSettingsFromStorage();
        
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

        // UI 配置 - YouTube控件开关
        const youtubeControlsToggle = document.getElementById('youtubeControlsToggle');
        if (youtubeControlsToggle) {
            youtubeControlsToggle.checked = this.uiConfig.youtube_controls;
        }

        // UI 配置 - 放大按钮开关
        const expandButtonToggle = document.getElementById('expandButtonToggle');
        if (expandButtonToggle) {
            expandButtonToggle.checked = this.uiConfig.expand_button;
        }
    },
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 主题按钮组
        const themeGroup = document.getElementById('themeSetting');
        if (themeGroup) {
            themeGroup.querySelectorAll('.settings-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const value = btn.dataset.value;
                    // 更新按钮状态
                    themeGroup.querySelectorAll('.settings-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    // 保存并应用
                    this.setSetting('theme', value);
                    this.applyTheme(value);
                });
            });
        }
        
        // 语言按钮组
        const langGroup = document.getElementById('languageSetting');
        if (langGroup) {
            langGroup.querySelectorAll('.settings-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const value = btn.dataset.value;
                    // 更新按钮状态
                    langGroup.querySelectorAll('.settings-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    // 保存并应用
                    this.setSetting('language', value);
                    this.applyLanguage(value);
                });
            });
        }

        // YouTube控件开关
        const youtubeControlsToggle = document.getElementById('youtubeControlsToggle');
        if (youtubeControlsToggle) {
            youtubeControlsToggle.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                await this.handleUIConfigToggleChange(
                    e.target,
                    'youtube_controls',
                    enabled,
                    `[设置] YouTube控件：${enabled ? '启用' : '禁用'}`
                );
            });
        }

        // 放大按钮开关
        const expandButtonToggle = document.getElementById('expandButtonToggle');
        if (expandButtonToggle) {
            expandButtonToggle.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                await this.handleUIConfigToggleChange(
                    e.target,
                    'expand_button',
                    enabled,
                    `[设置] 放大按钮：${enabled ? '显示' : '隐藏'}`
                );
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
        
        // 调用 themeManager 加载主题 CSS 和应用主题 class
        if (themeManager) {
            themeManager.loadTheme(actualTheme, () => {
                console.log(`[设置] themeManager 已应用主题: ${actualTheme}`);
            });
        }
        
        // 应用 data-theme 属性
        document.documentElement.setAttribute('data-theme', actualTheme);
        
        // 统一的主题类名
        const themeClass = actualTheme === 'light' ? 'theme-light' : 'theme-dark';
        
        // 应用 body 类名
        const body = document.body;
        body.classList.remove('theme-dark', 'theme-light');
        body.classList.add(themeClass);
        console.log(`[设置] body 类名已更新: ${body.className}`);
        
        // 应用歌单类名
        const playlistEl = document.getElementById('playlist');
        if (playlistEl) {
            playlistEl.classList.remove('theme-dark', 'theme-light', 'bright-theme', 'dark-theme');
            playlistEl.classList.add(themeClass);
            console.log(`[设置] playlist 类名已更新: ${playlistEl.className}`);
        } else {
            setTimeout(() => {
                const playlistEl = document.getElementById('playlist');
                if (playlistEl) {
                    playlistEl.classList.remove('theme-dark', 'theme-light', 'bright-theme', 'dark-theme');
                    playlistEl.classList.add(themeClass);
                    console.log(`[设置] playlist 类名已更新（重试）: ${playlistEl.className}`);
                }
            }, 100);
        }
        
        // ✅ 【新增】主题改变时重新渲染播放列表抬头
        // 延迟执行，确保DOM已更新
        setTimeout(() => {
            if (window.app && typeof window.app.renderPlaylist === 'function') {
                console.log(`[设置] 重新渲染播放列表抬头（主题切换到 ${actualTheme}）`);
                window.app.renderPlaylist();
            } else {
                console.log('[设置] 无法找到 window.app.renderPlaylist 方法');
            }
        }, 200);
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
        const expandBtn = document.getElementById('fullPlayerExpand');
        if (expandBtn) {
            if (expandEnabled) {
                expandBtn.classList.remove('hidden');
            } else {
                expandBtn.classList.add('hidden');
            }
        }

        console.log(`[设置] 全屏控件已更新：YouTube=${youtubeEnabled}, 放大按钮=${expandEnabled}`);
    },

    /**
     * 更新设置页面的 UI 文本
     */
    updateSettingsUIText(language) {
        console.log(`[设置] 更新 UI 文本为语言: ${language}`);
        
        // 更新设置标题
        const title = document.querySelector('.settings-title');
        if (title) title.textContent = i18n.t('settings.title', language);

        const closeBtn = document.getElementById('settingsCloseBtn');
        if (closeBtn) {
            const closeText = i18n.t('modal.close', language);
            closeBtn.title = closeText;
            closeBtn.setAttribute('aria-label', closeText);
        }
        
        // 更新外观设置章节
        const appearanceSection = document.getElementById('appearanceSectionTitle');
        if (appearanceSection) appearanceSection.textContent = i18n.t('settings.appearance', language);

        const themeLabel = document.getElementById('themeLabel');
        if (themeLabel) themeLabel.textContent = i18n.t('settings.theme', language);

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
        const langLabel = document.getElementById('languageLabel');
        if (langLabel) langLabel.textContent = i18n.t('settings.language', language);

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

        const playbackSection = document.getElementById('playbackSectionTitle');
        if (playbackSection) playbackSection.textContent = i18n.t('settings.playback', language);

        const youtubeControlsLabel = document.getElementById('youtubeControlsLabel');
        if (youtubeControlsLabel) youtubeControlsLabel.textContent = i18n.t('settings.youtubeControls', language);

        const expandButtonLabel = document.getElementById('expandButtonLabel');
        if (expandButtonLabel) expandButtonLabel.textContent = i18n.t('settings.expandButton', language);

        const toggleOnIds = ['youtubeControlsToggleOn', 'expandButtonToggleOn'];
        toggleOnIds.forEach((id) => {
            const element = document.getElementById(id);
            if (element) element.textContent = i18n.t('settings.toggleOn', language);
        });

        const toggleOffIds = ['youtubeControlsToggleOff', 'expandButtonToggleOff'];
        toggleOffIds.forEach((id) => {
            const element = document.getElementById(id);
            if (element) element.textContent = i18n.t('settings.toggleOff', language);
        });

        const youtubeToggle = document.getElementById('youtubeControlsToggle');
        if (youtubeToggle) {
            youtubeToggle.setAttribute('aria-label', i18n.t('settings.youtubeControls', language));
        }

        const expandToggle = document.getElementById('expandButtonToggle');
        if (expandToggle) {
            expandToggle.setAttribute('aria-label', i18n.t('settings.expandButton', language));
        }
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
            const response = await fetch('/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });
            
            const result = await response.json();
            
            if (result.status === 'OK') {
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
            } else {
                this.showNotification(i18n.t('settings.saveFailed') + ': ' + result.error, 'error');
                console.error('[设置] 保存失败:', result.error);
            }
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
            const response = await fetch('/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });
            
            const result = await response.json();
            console.log('[DEBUG] 保存结果:', result);
            
            if (result.status === 'OK') {
                this.settings = result.data;
                this.applyTheme(defaults.theme);
                this.applyLanguage(defaults.language);
                
                // 显示重置成功提示
                this.showNotification(i18n.t('settings.resetSuccess'), 'success');
                console.log('[设置] 已重置');
                
                // 不关闭面板，不刷新页面，用户可继续调整设置
            } else {
                this.showNotification(i18n.t('settings.resetFailed') + ': ' + result.error, 'error');
                console.error('[设置] 重置失败:', result.error);
            }
        } catch (error) {
            console.error('[设置] 重置失败:', error);
            this.showNotification(i18n.t('settings.resetFailed') + ': ' + error.message, 'error');
        }
    },
    
    /**
     * 显示设置面板
     */
    openPanel() {
        const panel = document.getElementById('settingsPanel');
        if (panel) {
            panel._previousActiveElement = document.activeElement;
            panel.setAttribute('aria-hidden', 'false');
            panel.style.display = 'block';
            document.body.style.overflow = 'hidden';

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
            setTimeout(() => {
                focusFirstFocusable(panel, '#settingsCloseBtn');
            }, 10);
            console.log('[设置] 打开设置面板');
        }
    },
    
    /**
     * 关闭设置面板
     */
    closePanel() {
        const panel = document.getElementById('settingsPanel');
        if (panel) {
            if (panel._keydownHandler) {
                document.removeEventListener('keydown', panel._keydownHandler);
            }
            panel.style.display = 'none';
            panel.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            restoreFocus(panel._previousActiveElement);
            console.log('[设置] 关闭设置面板');
        }
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
            const response = await fetch(`/settings/${key}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ value })
            });
            
            const result = await response.json();
            
            if (result.status === 'OK') {
                this.settings[key] = value;
                console.log(`[设置] ${key} = ${value}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`[设置] 设置 ${key} 失败:`, error);
            return false;
        }
    }
};
