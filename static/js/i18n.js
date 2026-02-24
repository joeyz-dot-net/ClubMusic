/**
 * 多语言支持模块 (i18n)
 */

const translations = {
    zh: {
        // 设置面板 - 标题和按钮
        'settings.title': '⚙️ 设置',
        'settings.close': '✕',
        
        // 外观设置
        'settings.appearance': '🎨 外观设置',
        'settings.theme.dark': '深色主题',
        'settings.theme.light': '浅色主题',
        'settings.theme.auto': '自动',
        'settings.language': '语言',
        'settings.language.auto': '自动选择',
        'settings.language.zh': '中文 (Chinese)',
        'settings.language.zh-TW': '繁體中文 (Traditional Chinese)',
        'settings.language.en': 'English',
        
        // 按钮
        'settings.reset': '🔄 重置为默认',
        'settings.save': '✓ 保存设置',
        
        // 消息提示
        'settings.saving': '正在保存设置...',
        'settings.saveSuccess': '设置已保存成功',
        'settings.saveFailed': '保存失败',
        'settings.resetting': '正在重置设置...',
        'settings.resetSuccess': '设置已重置为默认值',
        'settings.resetConfirm': '确定要重置所有设置为默认值吗？',
        'settings.resetFailed': '重置失败',
        
        // 导航栏
        'nav.queue': '队列',
        'nav.local': '本地',
        'nav.search': '搜索',
        'search.history': '播放历史',
        'nav.settings': '设置',
        'nav.debug': '调试',

        // 播放历史 - 操作菜单
        'history.actionMenu.playNow': '立即播放',
        'history.actionMenu.addToNext': '添加到下一首',
        'history.actionMenu.addToPlaylist': '添加到歌单',
        'history.actionMenu.deleteRecord': '删除此记录',
        'history.search.placeholder': '搜索播放历史...',
        'history.empty': '暂无播放历史',
        'history.deleteSuccess': '已删除播放历史记录',
        'history.deleteFailed': '删除失败',
        'history.playNowSuccess': '正在播放',
        'history.addToNextSuccess': '已添加到下一首',
        'history.addToNextFailed': '添加失败',
        'history.noResults': '没有匹配的结果',
    },
    en: {
        // Settings panel - Titles and buttons
        'settings.title': '⚙️ Settings',
        'settings.close': '✕',
        
        // Appearance settings
        'settings.appearance': '🎨 Appearance',
        'settings.theme.dark': 'Dark Theme',
        'settings.theme.light': 'Light Theme',
        'settings.theme.auto': 'Auto',
        'settings.language': 'Language',
        'settings.language.auto': 'Auto Select',
        'settings.language.zh': '中文 (Chinese)',
        'settings.language.zh-TW': '繁體中文 (Traditional Chinese)',
        'settings.language.en': 'English',
        
        // Buttons
        'settings.reset': '🔄 Reset to Default',
        'settings.save': '✓ Save Settings',
        
        // Messages
        'settings.saving': 'Saving settings...',
        'settings.saveSuccess': 'Settings saved successfully',
        'settings.saveFailed': 'Save failed',
        'settings.resetting': 'Resetting settings...',
        'settings.resetSuccess': 'Settings have been reset to defaults',
        'settings.resetConfirm': 'Are you sure you want to reset all settings to defaults?',
        'settings.resetFailed': 'Reset failed',
        
        // Navigation
        'nav.queue': 'Queue',
        'nav.local': 'Local',
        'nav.search': 'Search',
        'search.history': 'Playback History',
        'nav.settings': 'Settings',
        'nav.debug': 'Debug',

        // Play history - Action menu
        'history.actionMenu.playNow': 'Play Now',
        'history.actionMenu.addToNext': 'Add to Next',
        'history.actionMenu.addToPlaylist': 'Add to Playlist',
        'history.actionMenu.deleteRecord': 'Delete Record',
        'history.search.placeholder': 'Search play history...',
        'history.empty': 'No playback history',
        'history.deleteSuccess': 'History record deleted',
        'history.deleteFailed': 'Delete failed',
        'history.playNowSuccess': 'Now playing',
        'history.addToNextSuccess': 'Added as next song',
        'history.addToNextFailed': 'Failed to add',
        'history.noResults': 'No matching results',
    },
    'zh-TW': {
        // 設定面板 - 標題和按鈕
        'settings.title': '⚙️ 設定',
        'settings.close': '✕',

        // 外觀設定
        'settings.appearance': '🎨 外觀設定',
        'settings.theme.dark': '深色主題',
        'settings.theme.light': '淺色主題',
        'settings.theme.auto': '自動',
        'settings.language': '語言',
        'settings.language.auto': '自動選擇',
        'settings.language.zh': '中文 (简体)',
        'settings.language.zh-TW': '繁體中文',
        'settings.language.en': 'English',

        // 按鈕
        'settings.reset': '🔄 重設為預設值',
        'settings.save': '✓ 儲存設定',

        // 訊息提示
        'settings.saving': '正在儲存設定...',
        'settings.saveSuccess': '設定已儲存成功',
        'settings.saveFailed': '儲存失敗',
        'settings.resetting': '正在重設設定...',
        'settings.resetSuccess': '設定已重設為預設值',
        'settings.resetConfirm': '確定要將所有設定重設為預設值嗎？',
        'settings.resetFailed': '重設失敗',

        // 導覽列
        'nav.queue': '播放佇列',
        'nav.local': '本機',
        'nav.search': '搜尋',
        'search.history': '播放記錄',
        'nav.settings': '設定',
        'nav.debug': '除錯',

        // 播放記錄 - 操作選單
        'history.actionMenu.playNow': '立即播放',
        'history.actionMenu.addToNext': '新增至下一首',
        'history.actionMenu.addToPlaylist': '新增至歌單',
        'history.actionMenu.deleteRecord': '刪除此記錄',
        'history.search.placeholder': '搜尋播放記錄...',
        'history.empty': '目前沒有播放記錄',
        'history.deleteSuccess': '已刪除播放記錄',
        'history.deleteFailed': '刪除失敗',
        'history.playNowSuccess': '正在播放',
        'history.addToNextSuccess': '已新增至下一首',
        'history.addToNextFailed': '新增失敗',
        'history.noResults': '沒有符合的結果',
    }
};

export const i18n = {
    currentLanguage: null,
    languageChangeListeners: [], // 语言改变时的回调列表
    
    /**
     * 初始化 i18n，自动检测语言
     */
    init() {
        // 优先使用已保存的语言偏好
        const savedLanguage = localStorage.getItem('language');
        if (savedLanguage && translations[savedLanguage]) {
            this.currentLanguage = savedLanguage;
        } else {
            // 自动检测浏览器语言
            this.currentLanguage = this.detectBrowserLanguage();
            // 保存自动检测的语言
            localStorage.setItem('language', this.currentLanguage);
        }
        console.log(`[i18n] 已初始化，当前语言: ${this.currentLanguage}`);
    },
    
    /**
     * 检测浏览器语言
     * @returns {string} 检测到的语言代码
     */
    detectBrowserLanguage() {
        // 获取浏览器语言
        const browserLanguages = navigator.languages 
            ? Array.from(navigator.languages) 
            : [navigator.language || navigator.userLanguage];
        
        console.log('[i18n] 浏览器语言列表:', browserLanguages);
        
        // 语言代码映射表
        const languageMap = {
            'zh': 'zh',
            'zh-CN': 'zh',
            'zh-Hans': 'zh',
            'zh-Hans-CN': 'zh',
            'zh-TW': 'zh-TW',
            'zh-HK': 'zh-TW',
            'zh-MO': 'zh-TW',
            'zh-Hant': 'zh-TW',
            'zh-Hant-TW': 'zh-TW',
            'zh-Hant-HK': 'zh-TW',
            'en': 'en',
            'en-US': 'en',
            'en-GB': 'en',
        };
        
        // 查找支持的语言
        for (const browserLang of browserLanguages) {
            // 精确匹配
            if (languageMap[browserLang]) {
                const mapped = languageMap[browserLang];
                console.log(`[i18n] 浏览器语言 "${browserLang}" 映射为 "${mapped}"`);
                return mapped;
            }
            
            // 前缀匹配（例如 "zh-TW" 匹配到 "zh"）
            const prefix = browserLang.split('-')[0];
            if (languageMap[prefix]) {
                const mapped = languageMap[prefix];
                console.log(`[i18n] 浏览器语言 "${browserLang}" 前缀匹配为 "${mapped}"`);
                return mapped;
            }
        }
        
        // 默认使用中文
        console.log('[i18n] 未找到匹配的语言，使用默认语言: zh');
        return 'zh';
    },
    
    /**
     * 获取翻译文本
     * @param {string} key - 翻译键
     * @param {string} language - 语言代码 (可选，使用当前语言)
     * @returns {string} 翻译后的文本
     */
    t(key, language = null) {
        const lang = language || this.currentLanguage;
        return translations[lang]?.[key] || translations['zh']?.[key] || key;
    },
    
    /**
     * 注册语言改变监听器
     * @param {function} callback - 当语言改变时调用的回调函数
     */
    onLanguageChange(callback) {
        if (typeof callback === 'function') {
            this.languageChangeListeners.push(callback);
        }
    },
    
    /**
     * 移除语言改变监听器
     * @param {function} callback - 要移除的回调函数
     */
    offLanguageChange(callback) {
        this.languageChangeListeners = this.languageChangeListeners.filter(
            listener => listener !== callback
        );
    },
    
    /**
     * 触发所有语言改变监听器
     */
    notifyLanguageChange() {
        this.languageChangeListeners.forEach(callback => {
            try {
                callback(this.currentLanguage);
            } catch (err) {
                console.error('[i18n] 语言改变回调出错:', err);
            }
        });
    },
    
    /**
     * 设置当前语言
     * @param {string} language - 语言代码
     */
    setLanguage(language) {
        if (translations[language]) {
            this.currentLanguage = language;
            localStorage.setItem('language', language);
            console.log(`[i18n] 已切换到语言: ${language}`);
            // 触发所有监听器
            this.notifyLanguageChange();
        }
    },
    
    /**
     * 获取可用语言列表
     * @returns {array} 语言代码数组
     */
    getAvailableLanguages() {
        return Object.keys(translations);
    },
    
    /**
     * 更新页面元素的文本内容
     * 查找所有带有 data-i18n 属性的元素并更新文本
     */
    updatePageText() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });
    }
};
