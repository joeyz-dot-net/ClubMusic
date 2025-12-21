// 音量控制模块
import { api } from './api.js';

// 调试模式检查
const isDebugMode = () => localStorage.getItem('DEBUG_MODE') === '1';

export class VolumeControl {
    constructor() {
        this.currentVolume = 50;  // 默认值，启动时会从服务器加载
        this.isDragging = false;
        this.pendingValue = null;
        this.throttleTimer = null;
        this.hideDisplayTimer = null;  // 添加隐藏显示的定时器
        this.silent = false;  // 静默模式标志
    }

    // 初始化音量控制
    init(sliderElement, displayElement = null, options = {}) {
        this.slider = sliderElement;
        this.display = displayElement;
        this.silent = options.silent || false;
        
        if (!this.slider) {
            console.error('[音量] 滑块元素不存在');
            return;
        }
        
        // 从服务器加载默认音量
        this.loadDefaultsFromServer().then(() => {
            // 初始化时加载音量
            this.loadVolume();
            
            // 绑定事件
            this.attachEventListeners();
            
            if (!this.silent && isDebugMode()) {
                console.log('[音量] 控制已初始化');
            }
        });
    }

    // 从服务器加载默认音量配置
    async loadDefaultsFromServer() {
        try {
            const response = await fetch('/volume/defaults');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.status === 'OK' && data.local_volume && data.stream_volume) {
                this.defaultLocalVolume = parseInt(data.local_volume) || 50;
                this.defaultStreamVolume = parseInt(data.stream_volume) || 50;
                this.currentVolume = this.defaultLocalVolume;
                console.log(`[音量] 从服务器加载默认值: 本地=${this.defaultLocalVolume}%, 推流=${this.defaultStreamVolume}%`);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.warn('[音量] 无法从服务器加载默认值，使用硬编码默认值:', error);
            // 使用硬编码默认值
            this.defaultLocalVolume = 50;
            this.defaultStreamVolume = 50;
            this.currentVolume = 50;
        }
    }

    // 附加事件监听器
    attachEventListeners() {
        if (!this.slider) return;
        
        // input 事件：实时更新（频繁触发）
        this.slider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value);
            this.updateDisplay(volume);
            this.pendingValue = e.target.value;
            
            // 不输出 input 事件日志，太频繁
        });

        // change 事件：完成调整时保存（较少触发）
        this.slider.addEventListener('change', (e) => {
            const volume = parseInt(e.target.value);
            this.setVolume(volume);
            
            if (!this.silent && isDebugMode()) {
                console.log('[音量] 已调整:', volume);
            }
        });

        // 触摸事件
        this.slider.addEventListener('touchstart', () => {
            this.isDragging = true;
        });

        this.slider.addEventListener('touchend', (e) => {
            if (this.isDragging) {
                this.setVolume(this.slider.value);
                this.isDragging = false;
            }
        });
    }

    // 更新显示
    updateDisplay(value) {
        this.currentVolume = parseInt(value);
        
        if (this.display) {
            if (this.display.textContent !== undefined) {
                this.display.textContent = value;
            }
        }
        
        if (this.slider && this.slider.value !== undefined) {
            this.slider.value = value;
        }
        
        // 同时更新完整播放器的音量显示
        const fullPlayerDisplay = document.getElementById('fullPlayerVolumeDisplay');
        if (fullPlayerDisplay) {
            const volumeValue = fullPlayerDisplay.querySelector('.volume-value');
            if (volumeValue) {
                volumeValue.textContent = `${Math.round(value)}`;
            }
            
            // 显示音量气泡
            fullPlayerDisplay.style.display = 'block';
            fullPlayerDisplay.style.opacity = '1';
            
            // 触发动画
            fullPlayerDisplay.classList.remove('show');
            void fullPlayerDisplay.offsetWidth; // 强制浏览器重排
            fullPlayerDisplay.classList.add('show');
            
            // 清除之前的隐藏定时器
            if (this.hideDisplayTimer) {
                clearTimeout(this.hideDisplayTimer);
            }
            
            // 3秒后自动隐藏
            this.hideDisplayTimer = setTimeout(() => {
                if (fullPlayerDisplay) {
                    fullPlayerDisplay.style.opacity = '0';
                    setTimeout(() => {
                        if (fullPlayerDisplay) {
                            fullPlayerDisplay.style.display = 'none';
                        }
                    }, 200);
                }
            }, 3000);
        }
        
        // 不输出 updateDisplay 日志，太频繁
    }

    // 设置音量（带节流）
    async setVolume(value) {
        this.updateDisplay(value);
        
        // 节流：避免频繁请求
        if (this.throttleTimer) {
            clearTimeout(this.throttleTimer);
        }

        this.throttleTimer = setTimeout(async () => {
            try {
                const result = await api.setVolume(value);
                if (result.status === 'OK') {
                    if (!this.silent && isDebugMode()) {
                        console.log('[音量] 已设置:', value);
                    }
                }
            } catch (error) {
                // 仅在非静默模式下输出错误
                if (!this.silent) {
                    console.error('[音量] 设置失败:', error.message);
                }
            }
        }, 200);
    }

    // 从服务器加载当前音量
    async loadVolume() {
        try {
            const result = await api.getVolume();
            if (result && result.status === 'OK' && result.volume !== undefined) {
                const volume = Math.max(0, Math.min(130, parseInt(result.volume)));
                this.updateDisplay(volume);
                
                if (!this.silent && isDebugMode()) {
                    console.log('[音量] 已从服务器加载:', volume);
                }
                return true;
            } else {
                if (!this.silent && isDebugMode()) {
                    console.warn('[音量] 获取音量返回无效响应:', result);
                }
                // 如果获取失败，保持默认值并再试一次
                this.retryLoadVolume();
                return false;
            }
        } catch (error) {
            if (!this.silent && isDebugMode()) {
                console.error('[音量] 获取失败:', error.message);
            }
            // 如果网络错误，延迟后重试
            this.retryLoadVolume();
            return false;
        }
    }
    
    // 重试加载音量（延迟后）
    async retryLoadVolume() {
        setTimeout(async () => {
            try {
                const result = await api.getVolume();
                if (result && result.status === 'OK' && result.volume !== undefined) {
                    const volume = Math.max(0, Math.min(130, parseInt(result.volume)));
                    this.updateDisplay(volume);
                    
                    if (!this.silent && isDebugMode()) {
                        console.log('[音量] 已从服务器加载（重试）:', volume);
                    }
                }
            } catch (error) {
                if (!this.silent && isDebugMode()) {
                    console.warn('[音量] 重试加载失败，使用默认值 50');
                }
            }
        }, 500);
    }

    // 增加音量
    async increase(step = 5) {
        const newVolume = Math.min(130, this.currentVolume + step);
        await this.setVolume(newVolume);
    }

    // 减少音量
    async decrease(step = 5) {
        const newVolume = Math.max(0, this.currentVolume - step);
        await this.setVolume(newVolume);
    }

    // 静音/恢复
    async toggleMute() {
        if (this.currentVolume > 0) {
            this.lastVolume = this.currentVolume;
            await this.setVolume(0);
        } else if (this.lastVolume) {
            await this.setVolume(this.lastVolume);
        }
    }

    // 获取当前音量
    getVolume() {
        return this.currentVolume;
    }
}

// 导出单例
export const volumeControl = new VolumeControl();

// 为完整播放器音量滑块添加显示功能
