// 音量控制模块
import { api } from './api.js';

export class VolumeControl {
    constructor() {
        this.currentVolume = 50;
        this.isDragging = false;
        this.pendingValue = null;
        this.throttleTimer = null;
    }

    // 初始化音量控制
    init(sliderElement, displayElement) {
        this.slider = sliderElement;
        this.display = displayElement;
        
        if (this.slider) {
            this.attachEventListeners();
            this.loadVolume();
        }
    }

    // 附加事件监听器
    attachEventListeners() {
        // 鼠标事件
        this.slider.addEventListener('input', (e) => {
            this.updateDisplay(e.target.value);
            this.pendingValue = e.target.value;
        });

        this.slider.addEventListener('change', (e) => {
            this.setVolume(e.target.value);
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
            this.display.textContent = value;
        }
        if (this.slider) {
            this.slider.value = value;
        }
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
                    console.log('音量已设置:', value);
                }
            } catch (error) {
                console.error('设置音量失败:', error);
            }
        }, 200);
    }

    // 从服务器加载当前音量
    async loadVolume() {
        try {
            const result = await api.getVolume();
            if (result.status === 'OK' && result.volume !== undefined) {
                this.updateDisplay(result.volume);
            }
        } catch (error) {
            console.error('获取音量失败:', error);
        }
    }

    // 增加音量
    async increase(step = 5) {
        const newVolume = Math.min(100, this.currentVolume + step);
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
