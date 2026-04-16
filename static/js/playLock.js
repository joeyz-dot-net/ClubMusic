/**
 * 播放准备锁模块
 * 在 YouTube 歌曲加载期间锁定所有播放入口，防止覆盖操作
 * 显示全屏遮罩阻止一切用户交互
 */

import { i18n } from './i18n.js';
import { Toast } from './ui.js?v=2';

class PlayPreparationLock {
    constructor() {
        this.preparing = false;
        this.preparingSongTitle = '';
        this.prepareStartTime = 0;
        this.timeoutTimer = null;
        this.overlay = null;
        this.TIMEOUT_MS = 30000; // 30秒安全超时
    }

    /**
     * 尝试获取锁。已锁定时返回 false。
     * 成功获取后显示全屏遮罩，阻止所有用户交互。
     * @param {string} songTitle - 正在准备的歌曲标题
     * @returns {boolean} 是否成功获取锁
     */
    acquire(songTitle = '') {
        if (this.preparing) {
            console.log(`[PlayLock] 已锁定，拒绝新请求: ${songTitle}`);
            return false;
        }

        this.preparing = true;
        this.preparingSongTitle = songTitle;
        this.prepareStartTime = Date.now();

        // 显示全屏遮罩
        this._showOverlay(songTitle);

        // 安全超时：防止死锁
        this.timeoutTimer = setTimeout(() => {
            console.warn('[PlayLock] 安全超时，强制释放锁');
            this.release();
            Toast.warning(i18n.t('player.prepareTimeout'));
        }, this.TIMEOUT_MS);

        console.log(`[PlayLock] 获取锁: ${songTitle}`);
        return true;
    }

    /**
     * 释放锁（幂等）
     */
    release() {
        if (this.preparing) {
            const elapsed = Date.now() - this.prepareStartTime;
            console.log(`[PlayLock] 释放锁: ${this.preparingSongTitle} (耗时 ${elapsed}ms)`);
        }

        this.preparing = false;
        this.preparingSongTitle = '';
        this.prepareStartTime = 0;

        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }

        this._hideOverlay();
    }

    /**
     * 查询是否正在准备播放
     */
    isPreparing() {
        return this.preparing;
    }

    /**
     * 显示全屏加载遮罩
     */
    _showOverlay(songTitle) {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'play-lock-overlay';
        Object.assign(this.overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '99999',
            backdropFilter: 'blur(2px)',
            webkitBackdropFilter: 'blur(2px)',
        });

        const content = document.createElement('div');
        Object.assign(content.style, {
            textAlign: 'center',
            color: 'white',
        });

        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        Object.assign(spinner.style, {
            width: '44px',
            height: '44px',
            border: '3px solid rgba(255,255,255,0.3)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            margin: '0 auto 16px',
            animation: 'play-lock-spin 0.8s linear infinite',
        });

        const msg = document.createElement('div');
        Object.assign(msg.style, {
            fontSize: '15px',
            fontWeight: '500',
            maxWidth: '280px',
            lineHeight: '1.5',
            padding: '0 20px',
        });
        msg.textContent = i18n.t('player.preparingBusy', { title: songTitle });

        content.appendChild(spinner);
        content.appendChild(msg);
        this.overlay.appendChild(content);

        // 注入 keyframes（仅一次）
        if (!document.getElementById('play-lock-keyframes')) {
            const style = document.createElement('style');
            style.id = 'play-lock-keyframes';
            style.textContent = '@keyframes play-lock-spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        document.body.appendChild(this.overlay);
    }

    /**
     * 隐藏全屏加载遮罩
     */
    _hideOverlay() {
        if (this.overlay && this.overlay.parentNode) {
            document.body.removeChild(this.overlay);
        }
        this.overlay = null;
    }
}

export const playLock = new PlayPreparationLock();
