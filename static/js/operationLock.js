/**
 * 操作锁管理模块
 * 用于在用户进行拖拽、编辑等操作时暂停轮询
 * 防止其他用户的操作刷新当前用户的界面
 */

class OperationLock {
    constructor() {
        this.locks = new Map(); // 存储多个锁：{ lockName: { active: boolean, startTime: number } }
        this.pollingPaused = false;
        this.pauseCallbacks = [];
        this.resumeCallbacks = [];
        this.lockTimeout = 30000; // 30秒超时自动释放锁
        this.checkInterval = null;
        
        // 启动超时检查
        this.startTimeoutCheck();
    }

    /**
     * 获取锁（暂停轮询）
     * @param {string} lockName - 锁名称（如 'drag', 'edit', 'modal'）
     * @returns {boolean} 是否成功获取锁
     */
    acquire(lockName) {
        const wasEmpty = this.locks.size === 0;
        
        this.locks.set(lockName, {
            active: true,
            startTime: Date.now()
        });
        
        console.log(`[操作锁] 获取锁: ${lockName}, 当前锁数量: ${this.locks.size}`);
        
        // 如果这是第一个锁，暂停轮询
        if (wasEmpty && !this.pollingPaused) {
            this.pausePolling();
        }
        
        return true;
    }

    /**
     * 释放锁（如果没有其他锁，恢复轮询）
     * @param {string} lockName - 锁名称
     */
    release(lockName) {
        if (this.locks.has(lockName)) {
            this.locks.delete(lockName);
            console.log(`[操作锁] 释放锁: ${lockName}, 剩余锁数量: ${this.locks.size}`);
            
            // 如果没有其他锁了，恢复轮询
            if (this.locks.size === 0 && this.pollingPaused) {
                this.resumePolling();
            }
        }
    }

    /**
     * 检查是否有活跃的锁
     */
    hasActiveLocks() {
        return this.locks.size > 0;
    }

    /**
     * 检查特定锁是否存在
     */
    isLocked(lockName) {
        return this.locks.has(lockName);
    }

    /**
     * 暂停轮询
     */
    pausePolling() {
        this.pollingPaused = true;
        console.log('[操作锁] ⏸️ 轮询已暂停');
        
        // 触发暂停回调
        this.pauseCallbacks.forEach(cb => {
            try {
                cb();
            } catch (e) {
                console.error('[操作锁] 暂停回调错误:', e);
            }
        });
    }

    /**
     * 恢复轮询
     */
    resumePolling() {
        this.pollingPaused = false;
        console.log('[操作锁] ▶️ 轮询已恢复');
        
        // 触发恢复回调
        this.resumeCallbacks.forEach(cb => {
            try {
                cb();
            } catch (e) {
                console.error('[操作锁] 恢复回调错误:', e);
            }
        });
    }

    /**
     * 注册暂停回调
     */
    onPause(callback) {
        if (typeof callback === 'function') {
            this.pauseCallbacks.push(callback);
        }
    }

    /**
     * 注册恢复回调
     */
    onResume(callback) {
        if (typeof callback === 'function') {
            this.resumeCallbacks.push(callback);
        }
    }

    /**
     * 检查轮询是否暂停
     */
    isPollingPaused() {
        return this.pollingPaused;
    }

    /**
     * 启动超时检查（防止锁被遗忘）
     */
    startTimeoutCheck() {
        this.checkInterval = setInterval(() => {
            if (this.locks.size === 0) {
                return;
            }

            const now = Date.now();
            const expiredLocks = [];
            
            this.locks.forEach((lockInfo, lockName) => {
                if (now - lockInfo.startTime > this.lockTimeout) {
                    expiredLocks.push(lockName);
                }
            });
            
            // 释放过期的锁
            expiredLocks.forEach(lockName => {
                console.warn(`[操作锁] ⚠️ 锁超时自动释放: ${lockName}`);
                this.release(lockName);
            });
        }, 5000); // 每5秒检查一次
    }

    /**
     * 停止超时检查
     */
    stopTimeoutCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * 强制释放所有锁
     */
    releaseAll() {
        const lockNames = Array.from(this.locks.keys());
        lockNames.forEach(name => this.release(name));
        console.log('[操作锁] 所有锁已强制释放');
    }

    /**
     * 获取当前锁状态（用于调试）
     */
    getStatus() {
        return {
            pollingPaused: this.pollingPaused,
            activeLocks: Array.from(this.locks.keys()),
            lockCount: this.locks.size
        };
    }
}

// 导出单例
export const operationLock = new OperationLock();
