/**
 * KTV视频同步模块 - YouTube IFrame Player API 版本
 * 负责在全屏播放器中显示YouTube视频，并与服务器音频同步
 */

export class KTVSync {
    constructor() {
        this.videoContainer = document.getElementById('fullPlayerVideoContainer');
        this.coverElement = document.getElementById('fullPlayerCover');
        this.placeholderElement = document.getElementById('fullPlayerPlaceholder');
        this.artworkContainer = document.querySelector('.full-player-artwork-container');

        this.player = null;
        this.currentVideoId = null;
        this.lastSyncTime = 0;
        this.syncThreshold = 0.3;  // 300ms同步阈值
        this.isVideoMode = false;
        this.playerReady = false;
        this.isSyncing = false;  // 防止同步循环

        // 性能监控指标
        this.metrics = {
            driftSum: 0,
            driftCount: 0,
            maxDrift: 0,
            syncCount: 0
        };

        // 等待 YouTube API 加载完成
        this.initYouTubeAPI();
    }

    /**
     * 初始化 YouTube IFrame API
     */
    initYouTubeAPI() {
        // YouTube API 加载完成时会调用全局函数 onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => {
            console.log('[KTV] YouTube IFrame API 已加载');
            this.createPlayer();
        };

        // 如果 API 已经加载（热重载情况）
        if (window.YT && window.YT.Player) {
            console.log('[KTV] YouTube API 已存在，直接创建播放器');
            this.createPlayer();
        }
    }

    /**
     * 创建 YouTube 播放器实例
     */
    createPlayer() {
        if (this.player) {
            console.log('[KTV] 播放器已存在，跳过创建');
            return;
        }

        try {
            this.player = new YT.Player('fullPlayerYouTube', {
                height: '100%',
                width: '100%',
                videoId: '',  // 初始为空，后续通过 loadVideoById 加载
                playerVars: {
                    autoplay: 0,
                    controls: 0,  // 隐藏控件
                    disablekb: 1,  // 禁用键盘控制
                    fs: 0,  // 禁用全屏按钮
                    modestbranding: 1,  // 隐藏 YouTube logo
                    rel: 0,  // 不显示相关视频
                    showinfo: 0,  // 不显示视频信息
                    iv_load_policy: 3,  // 隐藏视频注释
                    mute: 1  // 静音（音频走服务器）
                },
                events: {
                    'onReady': (event) => this.onPlayerReady(event),
                    'onStateChange': (event) => this.onPlayerStateChange(event),
                    'onError': (event) => this.onPlayerError(event)
                }
            });
            console.log('[KTV] YouTube 播放器已创建');
        } catch (e) {
            console.error('[KTV] 创建播放器失败:', e);
        }
    }

    /**
     * 播放器就绪回调
     */
    onPlayerReady(event) {
        console.log('[KTV] YouTube 播放器就绪');
        this.playerReady = true;
    }

    /**
     * 播放器状态变化回调
     */
    onPlayerStateChange(event) {
        const states = {
            '-1': 'unstarted',
            '0': 'ended',
            '1': 'playing',
            '2': 'paused',
            '3': 'buffering',
            '5': 'cued'
        };
        console.log('[KTV] 播放器状态:', states[event.data] || event.data);
    }

    /**
     * 播放器错误回调
     */
    onPlayerError(event) {
        console.error('[KTV] YouTube 播放器错误:', event.data);
        // 错误码: 2=无效ID, 5=HTML5播放器错误, 100=视频不存在, 101/150=不允许嵌入
        if (event.data === 100 || event.data === 101 || event.data === 150) {
            console.error('[KTV] 视频无法播放，降级为音乐模式');
            this.disableVideoMode();
        }
    }

    /**
     * 更新KTV状态（每次状态轮询时调用）
     */
    updateStatus(status) {
        const currentMeta = status?.current_meta || {};
        const mpvState = status?.mpv_state || status?.mpv || {};

        const videoId = currentMeta.video_id;
        const isYouTube = currentMeta.type === 'youtube' && videoId;

        // 判断是否需要切换视频模式
        if (isYouTube) {
            this.enableVideoMode(videoId, mpvState);
        } else {
            this.disableVideoMode();
        }
    }

    /**
     * 启用视频模式
     */
    enableVideoMode(videoId, mpvState) {
        if (!this.playerReady) {
            console.log('[KTV] 播放器未就绪，等待...');
            return;
        }

        // 如果视频ID改变，加载新视频
        if (videoId !== this.currentVideoId) {
            this.loadVideo(videoId);
        }

        // 同步播放状态
        if (this.player && this.currentVideoId) {
            this.syncPlayback(mpvState);
        }

        // 显示视频，隐藏封面
        if (!this.isVideoMode && this.artworkContainer) {
            this.artworkContainer.classList.add('video-mode');
            this.isVideoMode = true;
            console.log('[KTV] 已切换到视频模式');
        }
    }

    /**
     * 禁用视频模式
     */
    disableVideoMode() {
        if (this.isVideoMode) {
            if (this.player && this.playerReady) {
                try {
                    this.player.stopVideo();
                } catch (e) {
                    console.warn('[KTV] 停止播放失败:', e);
                }
            }
            this.currentVideoId = null;
            if (this.artworkContainer) {
                this.artworkContainer.classList.remove('video-mode');
            }
            this.isVideoMode = false;
            console.log('[KTV] 已切换到音乐模式');
        }
    }

    /**
     * 加载视频
     */
    loadVideo(videoId) {
        if (!this.player || !this.playerReady) {
            console.error('[KTV] 播放器未就绪');
            return;
        }

        this.currentVideoId = videoId;
        console.log('[KTV] 加载视频:', videoId);

        try {
            // 使用 cueVideoById 预加载，不自动播放
            this.player.cueVideoById({
                videoId: videoId,
                startSeconds: 0
            });
        } catch (e) {
            console.error('[KTV] 加载视频失败:', e);
        }
    }

    /**
     * 同步播放状态（核心同步逻辑）
     */
    syncPlayback(mpvState) {
        if (!this.player || !this.playerReady || this.isSyncing) return;

        try {
            const serverTime = mpvState.time_pos || 0;
            const isPaused = mpvState.paused !== false;

            // 获取当前播放器状态
            const playerState = this.player.getPlayerState();
            const isPlayerPlaying = playerState === YT.PlayerState.PLAYING;
            const isPlayerPaused = playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED;

            // 同步暂停/播放状态
            if (isPaused && isPlayerPlaying) {
                console.log('[KTV] 服务器已暂停，暂停视频');
                this.player.pauseVideo();
            } else if (!isPaused && isPlayerPaused) {
                console.log('[KTV] 服务器正在播放，播放视频');
                this.player.playVideo();
            }

            // 同步时间位置（每1秒最多同步一次）
            const now = Date.now();
            if (now - this.lastSyncTime > 1000) {
                const videoTime = this.player.getCurrentTime();
                const drift = Math.abs(videoTime - serverTime);

                // 记录偏差指标
                this.metrics.driftSum += drift;
                this.metrics.driftCount++;
                this.metrics.maxDrift = Math.max(this.metrics.maxDrift, drift);

                // 如果偏差超过阈值，校准时间
                if (drift > this.syncThreshold) {
                    console.log(`[KTV] 时间偏差 ${drift.toFixed(2)}s，校准到 ${serverTime.toFixed(2)}s`);
                    this.isSyncing = true;
                    this.player.seekTo(serverTime, true);
                    this.metrics.syncCount++;

                    // 防止快速重复同步
                    setTimeout(() => {
                        this.isSyncing = false;
                    }, 500);
                }

                this.lastSyncTime = now;
            }
        } catch (e) {
            console.warn('[KTV] 同步失败:', e);
        }
    }

    /**
     * 获取同步指标（用于调试）
     */
    getMetrics() {
        return {
            avgDrift: this.metrics.driftCount > 0
                ? (this.metrics.driftSum / this.metrics.driftCount).toFixed(3)
                : 0,
            maxDrift: this.metrics.maxDrift.toFixed(3),
            syncCount: this.metrics.syncCount,
            totalChecks: this.metrics.driftCount
        };
    }

    /**
     * 重置指标
     */
    resetMetrics() {
        this.metrics = {
            driftSum: 0,
            driftCount: 0,
            maxDrift: 0,
            syncCount: 0
        };
    }
}

// 导出单例
export const ktvSync = new KTVSync();
