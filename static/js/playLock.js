/**
 * 播放准备锁模块
 * 在 YouTube 歌曲加载期间锁定所有播放入口，防止覆盖操作
 */

import { i18n } from './i18n.js';
import { Toast } from './ui.js';

class PlayPreparationLock {
    constructor() {
        this.preparing = false;
        this.preparingSongTitle = '';
        this.prepareStartTime = 0;
        this.timeoutTimer = null;
        this.TIMEOUT_MS = 30000; // 30秒安全超时
    }

    /**
     * 尝试获取锁。已锁定时显示 Toast 提示并返回 false。
     * @param {string} songTitle - 正在准备的歌曲标题
     * @returns {boolean} 是否成功获取锁
     */
    acquire(songTitle = '') {
        if (this.preparing) {
            Toast.warning(i18n.t('player.preparingBusy', { title: this.preparingSongTitle }));
            console.log(`[PlayLock] 已锁定，拒绝新请求: ${songTitle}`);
            return false;
        }

        this.preparing = true;
        this.preparingSongTitle = songTitle;
        this.prepareStartTime = Date.now();

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
    }

    /**
     * 查询是否正在准备播放
     */
    isPreparing() {
        return this.preparing;
    }
}

export const playLock = new PlayPreparationLock();
