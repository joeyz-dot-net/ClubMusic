/**
 * 用户设置管理模块
 */

import { Toast } from '../ui.js';

export const settingsManager = {
    settings: {},
    schema: {},
    
    /**
     * 初始化设置管理器
     */
    async init() {
        try {
            console.log('[设置] 初始化设置管理器...');
            
            // 加载设置和schema
            await this.loadSettings();
            await this.loadSchema();
            
            // 应用主题
            this.applyTheme();
            
            // 绑定事件
            this.bindEvents();
            
            console.log('✓ 设置管理器已初始化');
        } catch (error) {
            console.error('[设置] 初始化失败:', error);
        }
    },
    
    /**
     * 加载设置
     */
    async loadSettings() {
        try {
            const response = await fetch('/settings');
            const result = await response.json();
            
            if (result.status === 'OK') {
                this.settings = result.data;
                this.updateUI();
                console.log('[设置] 已加载:', this.settings);
            }
        } catch (error) {
            console.error('[设置] 加载失败:', error);
        }
    },
    
    /**
     * 加载设置schema
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
     * 更新UI - 将设置值同步到表单
     */
    updateUI() {
        // 主题
        const themeSelect = document.getElementById('themeSetting');
        if (themeSelect) {
            themeSelect.value = this.settings.theme || 'dark';
        }
        
        // 语言
        const langSelect = document.getElementById('languageSetting');
        if (langSelect) {
            langSelect.value = this.settings.language || 'zh';
        }
        
        // 自动推流
        const autoStreamCheck = document.getElementById('autoStreamSetting');
        if (autoStreamCheck) {
            autoStreamCheck.checked = this.settings.auto_stream !== false;
        }
        
        // 推流音量
        const streamVolumeSlider = document.getElementById('streamVolumeSetting');
        const streamVolumeValue = document.getElementById('streamVolumeValue');
        if (streamVolumeSlider) {
            streamVolumeSlider.value = this.settings.stream_volume || 50;
            if (streamVolumeValue) {
                streamVolumeValue.textContent = `${streamVolumeSlider.value}%`;
            }
        }
    },
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 推流音量滑块实时更新
        const streamVolumeSlider = document.getElementById('streamVolumeSetting');
        const streamVolumeValue = document.getElementById('streamVolumeValue');
        if (streamVolumeSlider) {
            streamVolumeSlider.addEventListener('input', (e) => {
                if (streamVolumeValue) {
                    streamVolumeValue.textContent = `${e.target.value}%`;
                }
            });
        }
        
        // 主题切换
        const themeSelect = document.getElementById('themeSetting');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                this.applyTheme(e.target.value);
            });
        }
        
        // 保存按钮
        const saveBtn = document.getElementById('saveSettingsBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }
        
        // 重置按钮
        const resetBtn = document.getElementById('resetSettingsBtn');
        console.log('[DEBUG] resetBtn element:', resetBtn);
        if (resetBtn) {
            console.log('[DEBUG] 绑定重置按钮事件...');
            resetBtn.addEventListener('click', () => this.resetSettings());
        } else {
            console.error('[DEBUG] 未找到 resetBtn 元素!');
        }
        
        // 关闭按钮
        const closeBtn = document.getElementById('settingsCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closePanel());
        }
        
        // 点击遮罩关闭
        const mask = document.getElementById('settingsMask');
        if (mask) {
            mask.addEventListener('click', (e) => {
                if (e.target === mask) {
                    this.closePanel();
                }
            });
        }
    },
    
    /**
     * 应用主题
     */
    applyTheme(theme = null) {
        if (theme === null) {
            theme = this.settings.theme || 'dark';
        }
        
        document.documentElement.setAttribute('data-theme', theme);
        console.log(`[设置] 应用主题: ${theme}`);
    },
    
    /**
     * 保存设置
     */
    async saveSettings() {
        try {
            // 显示保存中的提示
            this.showNotification('正在保存设置...', 'info');
            
            // 收集表单数据
            const updates = {
                theme: document.getElementById('themeSetting')?.value || 'dark',
                language: document.getElementById('languageSetting')?.value || 'zh',
                auto_stream: document.getElementById('autoStreamSetting')?.checked !== false,
                stream_volume: parseInt(document.getElementById('streamVolumeSetting')?.value || 50)
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
                
                // 显示保存成功提示
                this.showNotification('设置已保存成功', 'success');
                console.log('[设置] 已保存');
                
                // 延迟 1.5 秒后刷新页面，让用户看到成功消息
                console.log('[设置] 将在 1.5 秒后刷新页面...');
                setTimeout(() => {
                    location.reload();
                }, 1500);
            } else {
                this.showNotification('保存失败: ' + result.error, 'error');
                console.error('[设置] 保存失败:', result.error);
            }
        } catch (error) {
            console.error('[设置] 保存失败:', error);
            this.showNotification('保存失败: ' + error.message, 'error');
        }
    },
    
    /**
     * 重置设置
     */
    async resetSettings() {
        console.log('[DEBUG] resetSettings() 被调用了');
        if (!confirm('确定要重置所有设置为默认值吗？')) {
            console.log('[DEBUG] 用户取消了重置');
            return;
        }
        
        try {
            console.log('[DEBUG] 开始重置为默认值...');
            
            // 默认设置值
            const defaults = {
                theme: 'dark',
                language: 'zh',
                auto_stream: true,
                stream_volume: 50
            };
            
            // 设置表单元素为默认值
            const themeEl = document.getElementById('themeSetting');
            const languageEl = document.getElementById('languageSetting');
            const autoStreamEl = document.getElementById('autoStreamSetting');
            const streamVolumeEl = document.getElementById('streamVolumeSetting');
            const streamVolumeValueEl = document.getElementById('streamVolumeValue');
            
            if (themeEl) themeEl.value = defaults.theme;
            if (languageEl) languageEl.value = defaults.language;
            if (autoStreamEl) autoStreamEl.checked = defaults.auto_stream;
            if (streamVolumeEl) {
                streamVolumeEl.value = defaults.stream_volume;
                if (streamVolumeValueEl) streamVolumeValueEl.textContent = defaults.stream_volume + '%';
            }
            
            console.log('[DEBUG] 表单元素已重置为默认值');
            
            // 显示重置中的提示
            this.showNotification('正在重置设置...', 'info');
            
            // 保存到服务器
            const updates = {
                theme: defaults.theme,
                language: defaults.language,
                auto_stream: defaults.auto_stream,
                stream_volume: defaults.stream_volume
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
                
                // 显示重置成功提示
                this.showNotification('设置已重置为默认值', 'success');
                console.log('[设置] 已重置');
                
                // 延迟 1.5 秒后刷新页面，让用户看到成功消息
                console.log('[设置] 将在 1.5 秒后刷新页面...');
                setTimeout(() => {
                    location.reload();
                }, 1500);
            } else {
                this.showNotification('重置失败: ' + result.error, 'error');
                console.error('[设置] 重置失败:', result.error);
            }
        } catch (error) {
            console.error('[设置] 重置失败:', error);
            this.showNotification('重置失败: ' + error.message, 'error');
        }
    },
    
    /**
     * 显示设置面板
     */
    openPanel() {
        const panel = document.getElementById('settingsPanel');
        if (panel) {
            panel.style.display = 'block';
            document.body.style.overflow = 'hidden';
            console.log('[设置] 打开设置面板');
        }
    },
    
    /**
     * 关闭设置面板
     */
    closePanel() {
        const panel = document.getElementById('settingsPanel');
        if (panel) {
            panel.style.display = 'none';
            document.body.style.overflow = '';
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
    },
    
    /**
     * 显示通知 - 使用 Toast 保持和播放页面风格一致
     */
    showNotification(message, type = 'success') {
        // 使用统一的 Toast 组件
        if (type === 'error') {
            Toast.error(message, 3000);
        } else if (type === 'success') {
            Toast.success(message, 3000);
        } else {
            Toast.info(message, 3000);
        }
    }
};
