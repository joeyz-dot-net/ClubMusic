/**
 * 【新增】StreamManager - 推流格式管理器
 * 职责：
 * - 支持mp3/aac/flac多格式推流
 * - 格式特定的缓冲策略（AAC: 1.5x队列）
 * - 浏览器×格式组合优化
 * - 自动格式落选（若不支持则降级）
 */

class StreamManager {
    constructor() {
        this.currentFormat = 'mp3'; // 默认格式
        this.audioContext = null;
        this.audioWorklet = null;
        this.isStreaming = false;
        this.streamStatus = 'idle';
        this.clientId = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.streamAudio = document.getElementById('browserStreamAudio');
        this.formatConfig = {
            'mp3': {
                mimeType: 'audio/mpeg',
                codec: 'mp3',
                bitrate: '128k',
                chunkSize: 192 * 1024,
                heartbeatInterval: 1.0,
                description: 'MP3 (高兼容性)'
            },
            'aac': {
                mimeType: 'audio/aac',
                codec: 'aac',
                bitrate: '96k',
                chunkSize: 128 * 1024,
                heartbeatInterval: 0.5,
                description: 'AAC (更优质量)'
            },
            'flac': {
                mimeType: 'audio/flac',
                codec: 'flac',
                bitrate: '无损',
                chunkSize: 256 * 1024,
                heartbeatInterval: 1.0,
                description: 'FLAC (无损音质)'
            }
        };
        
        this.browserConfig = {
            'safari': {
                'mp3': { queueBlocks: 512, timeout: 20 },
                'aac': { queueBlocks: 768, timeout: 15 },
                'flac': { queueBlocks: 256, timeout: 20 }
            },
            'chrome': {
                'mp3': { queueBlocks: 64, timeout: 40 },
                'aac': { queueBlocks: 96, timeout: 35 },
                'flac': { queueBlocks: 32, timeout: 40 }
            },
            'firefox': {
                'mp3': { queueBlocks: 64, timeout: 40 },
                'aac': { queueBlocks: 96, timeout: 35 },
                'flac': { queueBlocks: 32, timeout: 40 }
            },
            'edge': {
                'mp3': { queueBlocks: 64, timeout: 40 },
                'aac': { queueBlocks: 96, timeout: 35 },
                'flac': { queueBlocks: 32, timeout: 40 }
            }
        };
    }

    /**
     * 检测浏览器是否支持指定格式
     */
    canPlayFormat(format) {
        const config = this.formatConfig[format];
        if (!config) return false;

        const audio = document.createElement('audio');
        const canPlay = audio.canPlayType(config.mimeType);
        
        // 返回: '' (不支持), 'maybe' (可能), 'probably' (可能)
        return canPlay === 'probably' || canPlay === 'maybe';
    }

    /**
     * 获取最佳推流格式（带降级）
     */
    getBestFormat(preferredFormat = 'aac') {
        if (this.canPlayFormat(preferredFormat)) {
            return preferredFormat;
        }

        // 降级顺序：aac -> mp3 -> flac
        const fallbackOrder = ['mp3', 'aac', 'flac'];
        for (const fmt of fallbackOrder) {
            if (fmt !== preferredFormat && this.canPlayFormat(fmt)) {
                console.log(`[STREAM] 格式 ${preferredFormat} 不支持，降级到 ${fmt}`);
                return fmt;
            }
        }

        console.log('[STREAM] 未找到支持的音频格式，使用默认 mp3');
        return 'mp3';
    }

    /**
     * 获取浏览器×格式特定配置
     */
    getBrowserFormatConfig(format) {
        const browserName = this.detectBrowser();
        const browserCfg = this.browserConfig[browserName] || this.browserConfig['chrome'];
        return browserCfg[format] || browserCfg['mp3'];
    }

    /**
     * 检测浏览器类型
     */
    detectBrowser() {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('safari') && !ua.includes('chrome')) {
            return 'safari';
        } else if (ua.includes('firefox')) {
            return 'firefox';
        } else if (ua.includes('edg')) {
            return 'edge';
        } else if (ua.includes('chrome')) {
            return 'chrome';
        }
        return 'default';
    }

    /**
     * 启动推流（指定格式）
     */
    async startStream(format = null) {
        if (!format) {
            format = this.getBestFormat();
        } else {
            format = this.getBestFormat(format);
        }

        this.currentFormat = format;
        const config = this.formatConfig[format];
        const browserCfg = this.getBrowserFormatConfig(format);

        console.log(
            `[STREAM] 启动推流: 格式=${format} (${config.description}), ` +
            `浏览器=${this.detectBrowser()}, 队列=${browserCfg.queueBlocks}块`
        );

        // 向后端请求指定格式的推流
        return {
            format: format,
            config: config,
            browserConfig: browserCfg,
            url: `/stream/play?format=${format}`
        };
    }

    /**
     * 获取格式统计信息
     */
    getFormatStats() {
        return {
            currentFormat: this.currentFormat,
            config: this.formatConfig[this.currentFormat],
            browserConfig: this.getBrowserFormatConfig(this.currentFormat),
            browser: this.detectBrowser()
        };
    }

    /**
     * AAC ADTS帧检测工具
     */
    isADTSFrame(data, offset = 0) {
        if (offset + 2 > data.length) return false;
        // ADTS 同步字：0xFFF...（前11位全1）
        return (data[offset] === 0xFF) && ((data[offset + 1] & 0xF0) === 0xF0);
    }

    /**
     * 解析AAC ADTS帧长度
     */
    parseADTSFrameLength(data, offset = 0) {
        if (offset + 4 > data.length) return null;
        // 字节3-4（共13位）含有帧长度
        const len = ((data[offset + 3] & 0x03) << 11) | 
                    (data[offset + 4] << 3) | 
                    ((data[offset + 5] >> 5) & 0x07);
        return len > 0 ? len : null;
    }

    /**
     * 设置音频元素事件监听
     */
    setupAudioEventListeners() {
        if (!this.streamAudio) {
            return;
        }

        // 监听音频错误 - 捕捉网络错误
        this.streamAudio.addEventListener('error', (e) => {
            const error = this.streamAudio.error;
            if (error && error.code === error.MEDIA_ERR_NETWORK) {
                const errorMsg = `Code ${error.code}: 网络错误`;
                console.error(`[STREAM] 网络错误: ${errorMsg}`);
                this.onStreamDisconnected();
            }
        }, { once: false });

        // 监听 abort 事件 - 连接被中止
        this.streamAudio.addEventListener('abort', () => {
            console.warn('[STREAM] 连接已中止');
            this.onStreamDisconnected();
        }, { once: false });

        // 监听 stalled 事件 - 数据停止流入
        this.streamAudio.addEventListener('stalled', () => {
            // stalled 通常不必立即断开，只在持续超时时才处理
            console.debug('[STREAM] 连接停滞，等待数据恢复...');
        }, { once: false });
    }

    /**
     * 处理流断开连接
     */
    onStreamDisconnected() {
        this.isStreaming = false;
        this.streamStatus = 'disconnected';
        this.reconnectAttempts = 0; // 重置重连计数
        
        console.warn('[STREAM] 推流已断开连接');

        // 更新导航栏按钮状态为红色（断开）
        if (window.MusicPlayerApp && window.MusicPlayerApp.updateStreamNavButton) {
            window.MusicPlayerApp.updateStreamNavButton(false);
        }

        // 动态导入 Toast 显示通知
        import('./ui.js').then(({ Toast }) => {
            Toast.show('推流已断开，请刷新页面重新连接', 'error', 5000);
        }).catch(e => {
            console.error('[STREAM] 导入 Toast 失败:', e);
        });
    }
}

// 导出为ES6模块
export const streamManager = new StreamManager();
