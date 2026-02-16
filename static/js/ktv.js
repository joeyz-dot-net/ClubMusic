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
        window.onYouTubeIframeAPIReady = async () => {
            console.log('[KTV] YouTube IFrame API 已加载');
            await this.createPlayer();
        };

        // 如果 API 已经加载（热重载情况）
        if (window.YT && window.YT.Player) {
            console.log('[KTV] YouTube API 已存在，直接创建播放器');
            this.createPlayer();  // 不需要 await，因为在构造函数中
        }
    }

    /**
     * 创建 YouTube 播放器实例
     */
    async createPlayer() {
        if (this.player) {
            console.log('[KTV] 播放器已存在，跳过创建');
            return;
        }

        try {
            // 从服务器读取控件配置
            const controlsEnabled = await this.getYouTubeControlsSetting();
            console.log(`[KTV] 创建播放器，控件配置: ${controlsEnabled ? '启用' : '禁用'}`);

            this.player = new YT.Player('fullPlayerYouTube', {
                height: '100%',
                width: '100%',
                videoId: '',  // 初始为空，后续通过 loadVideoById 加载
                playerVars: {
                    autoplay: 0,
                    controls: controlsEnabled ? 1 : 0,  // 根据配置显示/隐藏 YouTube 控件
                    disablekb: controlsEnabled ? 0 : 1,  // 根据配置启用/禁用键盘控制
                    fs: 1,  // 启用全屏按钮
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
     * 更新 YouTube 控件可见性
     * @param {boolean} enabled - 是否启用控件
     */
    async updateControlsVisibility(enabled) {
        if (!this.player) {
            console.log('[KTV] 播放器未初始化，无法更新控件');
            return;
        }

        try {
            console.log(`[KTV] 准备${enabled ? '启用' : '禁用'}YouTube控件，需要重建播放器`);

            // 保存当前播放状态
            const wasPlaying = this.isVideoMode;
            const currentVideoId = this.currentVideoId;
            let currentTime = 0;
            let wasPaused = true;

            if (this.playerReady && currentVideoId) {
                try {
                    currentTime = this.player.getCurrentTime() || 0;
                    const playerState = this.player.getPlayerState();
                    wasPaused = playerState !== YT.PlayerState.PLAYING;
                } catch (e) {
                    console.warn('[KTV] 无法获取播放状态:', e);
                }
            }

            // 销毁旧播放器
            if (this.player && typeof this.player.destroy === 'function') {
                try {
                    this.player.destroy();
                    console.log('[KTV] 旧播放器已销毁');
                } catch (e) {
                    console.warn('[KTV] 销毁播放器失败:', e);
                }
            }

            // 重置状态
            this.player = null;
            this.playerReady = false;
            this.currentVideoId = null;

            // 重新创建播放器（会自动读取新配置）
            await this.createPlayer();

            // 如果之前在播放视频，等待播放器就绪后恢复
            if (wasPlaying && currentVideoId) {
                console.log(`[KTV] 等待播放器就绪后恢复视频: ${currentVideoId}, 时间: ${currentTime.toFixed(2)}s`);

                // 等待播放器就绪
                const waitForReady = setInterval(() => {
                    if (this.playerReady) {
                        clearInterval(waitForReady);

                        // 恢复视频
                        try {
                            this.currentVideoId = currentVideoId;
                            this.player.cueVideoById({
                                videoId: currentVideoId,
                                startSeconds: currentTime
                            });

                            if (!wasPaused) {
                                setTimeout(() => {
                                    this.player.playVideo();
                                }, 500);
                            }

                            console.log('[KTV] 视频已恢复');
                        } catch (e) {
                            console.error('[KTV] 恢复视频失败:', e);
                        }
                    }
                }, 100);

                // 10秒超时
                setTimeout(() => clearInterval(waitForReady), 10000);
            }

            console.log(`[KTV] YouTube控件已${enabled ? '启用' : '禁用'}`);
        } catch (error) {
            console.error('[KTV] 更新控件失败:', error);
        }
    }

    /**
     * 从服务器读取 YouTube 控件配置
     * @returns {Promise<boolean>} 是否启用YouTube控件
     */
    async getYouTubeControlsSetting() {
        try {
            const response = await fetch('/ui-config');
            const result = await response.json();
            if (result.status === 'OK') {
                return result.data.youtube_controls !== false;
            }
        } catch (error) {
            console.error('[KTV] 读取配置失败:', error);
        }
        return true;  // 默认启用
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
