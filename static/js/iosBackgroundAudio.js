/**
 * iOS Safari 后台播放优化模块
 * 
 * 功能：
 * 1. Media Session API - 锁屏显示正在播放的歌曲信息和控制按钮
 * 2. 静音音频循环 - 防止 iOS 暂停页面（使用极低比特率静音音频）
 * 3. 可见性 API - 页面恢复前台时立即刷新状态
 * 4. 心跳保活 - 后台时维持与服务器的连接
 */

class iOSBackgroundAudio {
    constructor() {
        this.silentAudio = null;
        this.isIOS = this._detectIOS();
        this.isBackgrounded = false;
        this.mediaSessionSupported = 'mediaSession' in navigator;
        this.heartbeatInterval = null;
        this.onStatusRefresh = null;  // 状态刷新回调
        this.onPlayPause = null;       // 播放/暂停回调
        this.onNext = null;            // 下一首回调
        this.onPrev = null;            // 上一首回调
        
        console.log(`[iOS后台] 初始化 - iOS: ${this.isIOS}, MediaSession: ${this.mediaSessionSupported}`);
    }
    
    /**
     * 检测是否为 iOS 设备
     */
    _detectIOS() {
        const ua = navigator.userAgent;
        return /iPad|iPhone|iPod/.test(ua) || 
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    
    /**
     * 初始化模块
     * @param {Object} callbacks - 回调函数对象
     * @param {Function} callbacks.onStatusRefresh - 刷新状态的回调
     * @param {Function} callbacks.onPlayPause - 播放/暂停回调
     * @param {Function} callbacks.onNext - 下一首回调
     * @param {Function} callbacks.onPrev - 上一首回调
     */
    init(callbacks = {}) {
        this.onStatusRefresh = callbacks.onStatusRefresh;
        this.onPlayPause = callbacks.onPlayPause;
        this.onNext = callbacks.onNext;
        this.onPrev = callbacks.onPrev;
        
        // 设置页面可见性监听
        this._setupVisibilityListener();
        
        // 设置 Media Session API（所有支持的浏览器）
        if (this.mediaSessionSupported) {
            this._setupMediaSession();
        }
        
        // iOS 特定优化
        if (this.isIOS) {
            this._setupSilentAudio();
            this._setupHeartbeat();
        }
        
        console.log('[iOS后台] 模块初始化完成');
    }
    
    /**
     * 创建静音音频元素（防止 iOS 暂停页面）
     */
    _setupSilentAudio() {
        // 创建一个极短的静音音频（Base64 编码的 0.1秒 静音 MP3）
        // 这是一个最小的有效 MP3 文件
        const silentMP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNBqSsAAAAAAAAAAAAAAAAAAAA//tQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//tQZB8P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==';
        
        this.silentAudio = new Audio(silentMP3);
        this.silentAudio.loop = true;
        this.silentAudio.volume = 0.01;  // 极低音量
        this.silentAudio.muted = false;  // 不能完全静音，否则 iOS 会停止
        
        // iOS 需要用户交互才能播放音频
        const startSilentAudio = () => {
            if (this.silentAudio) {
                this.silentAudio.play().catch(e => {
                    console.log('[iOS后台] 静音音频需要用户交互');
                });
            }
        };
        
        // 在用户首次交互时启动静音音频
        document.addEventListener('touchstart', startSilentAudio, { once: true });
        document.addEventListener('click', startSilentAudio, { once: true });
        
        console.log('[iOS后台] 静音音频已设置');
    }
    
    /**
     * 设置 Media Session API（锁屏控制）
     */
    _setupMediaSession() {
        // 设置媒体控制按钮的处理函数
        navigator.mediaSession.setActionHandler('play', () => {
            console.log('[MediaSession] 播放按钮');
            if (this.onPlayPause) this.onPlayPause();
        });
        
        navigator.mediaSession.setActionHandler('pause', () => {
            console.log('[MediaSession] 暂停按钮');
            if (this.onPlayPause) this.onPlayPause();
        });
        
        navigator.mediaSession.setActionHandler('previoustrack', () => {
            console.log('[MediaSession] 上一首');
            if (this.onPrev) this.onPrev();
        });
        
        navigator.mediaSession.setActionHandler('nexttrack', () => {
            console.log('[MediaSession] 下一首');
            if (this.onNext) this.onNext();
        });
        
        // 尝试设置快进快退（某些设备支持）
        try {
            navigator.mediaSession.setActionHandler('seekbackward', () => {
                console.log('[MediaSession] 快退');
            });
            navigator.mediaSession.setActionHandler('seekforward', () => {
                console.log('[MediaSession] 快进');
            });
        } catch (e) {
            // 不支持的操作，忽略
        }
        
        console.log('[iOS后台] Media Session 已设置');
    }
    
    /**
     * 更新 Media Session 显示的歌曲信息
     * @param {Object} songInfo - 歌曲信息
     * @param {string} songInfo.title - 歌曲标题
     * @param {string} songInfo.artist - 艺术家
     * @param {string} songInfo.album - 专辑名
     * @param {string} songInfo.artwork - 封面图 URL
     */
    updateNowPlaying(songInfo) {
        if (!this.mediaSessionSupported) return;
        
        const { title, artist, album, artwork } = songInfo;
        
        // 构建 artwork 数组
        const artworkList = [];
        if (artwork) {
            // 提供多种尺寸
            artworkList.push(
                { src: artwork, sizes: '96x96', type: 'image/png' },
                { src: artwork, sizes: '128x128', type: 'image/png' },
                { src: artwork, sizes: '192x192', type: 'image/png' },
                { src: artwork, sizes: '256x256', type: 'image/png' },
                { src: artwork, sizes: '384x384', type: 'image/png' },
                { src: artwork, sizes: '512x512', type: 'image/png' }
            );
        }
        
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title || '未知歌曲',
                artist: artist || 'ClubMusic',
                album: album || '',
                artwork: artworkList
            });
            
            console.log(`[MediaSession] 更新正在播放: ${title}`);
        } catch (e) {
            console.warn('[MediaSession] 更新失败:', e);
        }
    }
    
    /**
     * 设置播放状态（播放/暂停）
     * @param {boolean} isPlaying - 是否正在播放
     */
    setPlaybackState(isPlaying) {
        if (!this.mediaSessionSupported) return;
        
        try {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        } catch (e) {
            console.warn('[MediaSession] 设置播放状态失败:', e);
        }
    }
    
    /**
     * 设置页面可见性监听
     */
    _setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // 页面进入后台
                this.isBackgrounded = true;
                console.log('[iOS后台] 页面进入后台');
                
                // iOS: 启动更频繁的心跳
                if (this.isIOS) {
                    this._startIntensiveHeartbeat();
                }
            } else {
                // 页面恢复前台
                this.isBackgrounded = false;
                console.log('[iOS后台] 页面恢复前台，刷新状态...');
                
                // 停止密集心跳
                this._stopIntensiveHeartbeat();
                
                // 立即刷新状态
                if (this.onStatusRefresh) {
                    this.onStatusRefresh();
                }
            }
        });
        
        // iOS Safari: 监听 pageshow 事件（从 bfcache 恢复时触发）
        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                console.log('[iOS后台] 从缓存恢复，刷新状态...');
                if (this.onStatusRefresh) {
                    this.onStatusRefresh();
                }
            }
        });
    }
    
    /**
     * 设置常规心跳（保持连接）
     */
    _setupHeartbeat() {
        // 每 30 秒发送一次心跳（后台时会加速）
        this.heartbeatInterval = setInterval(() => {
            if (!this.isBackgrounded) {
                // 前台时不需要额外心跳
                return;
            }
            
            // 后台时发送轻量级请求保持连接
            this._sendHeartbeat();
        }, 30000);
    }
    
    /**
     * 启动密集心跳（后台时）
     */
    _startIntensiveHeartbeat() {
        if (this.intensiveHeartbeatInterval) return;
        
        // 后台时每 5 秒发送心跳
        this.intensiveHeartbeatInterval = setInterval(() => {
            this._sendHeartbeat();
        }, 5000);
        
        console.log('[iOS后台] 启动密集心跳');
    }
    
    /**
     * 停止密集心跳
     */
    _stopIntensiveHeartbeat() {
        if (this.intensiveHeartbeatInterval) {
            clearInterval(this.intensiveHeartbeatInterval);
            this.intensiveHeartbeatInterval = null;
            console.log('[iOS后台] 停止密集心跳');
        }
    }
    
    /**
     * 发送心跳请求
     */
    async _sendHeartbeat() {
        try {
            // 使用 status 接口作为心跳
            const response = await fetch('/status', {
                method: 'GET',
                cache: 'no-store'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // 更新 Media Session 显示的信息
                if (data.current_meta) {
                    this.updateNowPlaying({
                        title: data.current_meta.title || data.current_meta.name,
                        artist: data.current_meta.artist || 'ClubMusic',
                        artwork: data.current_meta.thumbnail_url
                    });
                    
                    // 更新播放状态
                    const isPlaying = data.mpv_state?.paused === false;
                    this.setPlaybackState(isPlaying);
                }
            }
        } catch (e) {
            console.warn('[iOS后台] 心跳失败:', e.message);
        }
    }
    
    /**
     * 销毁模块
     */
    destroy() {
        if (this.silentAudio) {
            this.silentAudio.pause();
            this.silentAudio = null;
        }
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        this._stopIntensiveHeartbeat();
        
        console.log('[iOS后台] 模块已销毁');
    }
}

// 导出单例
export const iosBackgroundAudio = new iOSBackgroundAudio();
