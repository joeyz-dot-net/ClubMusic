/**
 * KTV视频同步模块 - YouTube IFrame Player API 版本
 * 负责在全屏播放器中显示YouTube视频，并与服务器音频同步
 */

import { api } from './api.js?v=5';
import { player } from './player.js?v=24';
import { Toast } from './ui.js?v=2';
import { i18n } from './i18n.js';
import { unavailableSongs } from './unavailable.js';
import { recordTrace } from './requestTrace.js?v=2';

function dismissSuccessToastsForTitle(title) {
    if (!title) {
        return;
    }

    document.querySelectorAll('.toast.toast-success').forEach((toast) => {
        const message = toast.querySelector('.toast-message')?.textContent || '';
        if (message.includes(title)) {
            toast.remove();
        }
    });
}

export class KTVSync {
    constructor() {
        this.videoContainer = document.getElementById('fullPlayerVideoContainer');
        this.playerHost = document.getElementById('fullPlayerYouTubeHost');
        this.coverElement = document.getElementById('fullPlayerCover');
        this.placeholderElement = document.getElementById('fullPlayerPlaceholder');
        this.audioOnlyNoticeElement = document.getElementById('fullPlayerAudioOnlyNotice');
        this.artworkContainer = document.querySelector('.full-player-artwork-container');

        this.player = null;
        this.playerCreationPromise = null;
        this.playerCreateStartedAt = 0;
        this.currentVideoId = null;
        this.pendingVideoId = null;
        this.pendingMpvState = null;
        this.lastSyncTime = 0;
        this.syncThreshold = 0.3;  // 300ms同步阈值
        this.isVideoMode = false;
        this.playerReady = false;
        this.isSyncing = false;  // 防止同步循环
        this._failedVideoId = null;  // 记录播放失败的视频ID，避免无限重试
        this._fallbackNoticePrefix = 'clubmusic.ktvFallbackNotice:';
        this.videoOffset = 0;  // 视频时间偏移量（秒），正值=视频提前，负值=视频延迟
        this.loadOffset();
        this.videoLoadSettlingUntil = 0;
        this.videoPendingSince = 0;
        this.lastPendingRecoveryAt = 0;
        this.trustedResumeTraceToken = null;
        this.trustedResumeTraceTimers = [];
        this.controlsRestoreWaitInterval = null;
        this.controlsRestoreWaitTimeout = null;
        this.controlsRestoreWaitToken = null;

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

    getMpvState(status) {
        return status?.mpv_state || status?.mpv || {};
    }

    getReferencePlaybackTime(mpvState = {}) {
        const rawServerTime = Number(mpvState.time_pos ?? mpvState.time ?? 0);
        const isPaused = mpvState.paused !== false;
        if (isPaused) {
            return Number.isFinite(rawServerTime) ? rawServerTime : 0;
        }

        const interpolatedTime = Number(player.getInterpolatedTime?.());
        if (Number.isFinite(interpolatedTime)) {
            return interpolatedTime;
        }

        return Number.isFinite(rawServerTime) ? rawServerTime : 0;
    }

    getPlayerStateLabel(state) {
        const states = {
            '-1': 'unstarted',
            '0': 'ended',
            '1': 'playing',
            '2': 'paused',
            '3': 'buffering',
            '5': 'cued'
        };
        return states[String(state)] || String(state);
    }

    capturePlayerStateSnapshot(context) {
        let playerState = null;
        let currentTime = null;
        try {
            playerState = this.player?.getPlayerState?.() ?? null;
            currentTime = Number(this.player?.getCurrentTime?.());
        } catch (error) {
            currentTime = null;
        }

        return {
            context,
            currentVideoId: this.currentVideoId,
            traceToken: this.trustedResumeTraceToken,
            playerState,
            playerStateLabel: this.getPlayerStateLabel(playerState),
            currentTime: Number.isFinite(currentTime) ? currentTime : null,
        };
    }

    clearTrustedResumeTraceTimers() {
        this.trustedResumeTraceTimers.forEach((timerId) => clearTimeout(timerId));
        this.trustedResumeTraceTimers = [];
    }

    clearControlsRestoreWait() {
        if (this.controlsRestoreWaitInterval !== null) {
            clearInterval(this.controlsRestoreWaitInterval);
            this.controlsRestoreWaitInterval = null;
        }

        if (this.controlsRestoreWaitTimeout !== null) {
            clearTimeout(this.controlsRestoreWaitTimeout);
            this.controlsRestoreWaitTimeout = null;
        }

        this.controlsRestoreWaitToken = null;
    }

    scheduleControlsRestoreWait(videoId, currentTime, wasPaused) {
        if (!videoId) {
            return;
        }

        this.clearControlsRestoreWait();

        const restoreToken = `controls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        this.controlsRestoreWaitToken = restoreToken;

        this.controlsRestoreWaitInterval = setInterval(() => {
            if (this.controlsRestoreWaitToken !== restoreToken) {
                return;
            }

            if (!this.playerReady || !this.player) {
                return;
            }

            this.clearControlsRestoreWait();

            try {
                this.currentVideoId = videoId;
                if (wasPaused) {
                    this.player.cueVideoById({
                        videoId,
                        startSeconds: currentTime
                    });
                } else {
                    this.player.loadVideoById({
                        videoId,
                        startSeconds: currentTime
                    });
                }

                console.log('[KTV] 视频已恢复');
            } catch (error) {
                console.error('[KTV] 恢复视频失败:', error);
            }
        }, 100);

        this.controlsRestoreWaitTimeout = setTimeout(() => {
            if (this.controlsRestoreWaitToken !== restoreToken) {
                return;
            }

            console.warn(`[KTV] 等待播放器就绪恢复视频超时: ${videoId}`);
            this.clearControlsRestoreWait();
        }, 10000);
    }

    cancelTrustedResumePlayback() {
        this.clearTrustedResumeTraceTimers();
        this.trustedResumeTraceToken = null;
        if (!this.player || !this.playerReady) {
            return false;
        }

        try {
            const playerState = this.player.getPlayerState();
            if (playerState === YT.PlayerState.PLAYING || playerState === YT.PlayerState.BUFFERING || playerState === YT.PlayerState.UNSTARTED) {
                this.player.pauseVideo();
            }
            recordTrace('ktv.trusted_resume.cancelled', {
                currentVideoId: this.currentVideoId,
                playerState,
                playerStateLabel: this.getPlayerStateLabel(playerState),
            }, { includeStack: false });
            return true;
        } catch (error) {
            console.warn('[KTV] trusted resume 回滚失败:', error);
            recordTrace('ktv.trusted_resume.cancel_failed', {
                currentVideoId: this.currentVideoId,
                error: String(error),
            }, { includeStack: false });
            return false;
        }
    }

    requestTrustedResume() {
        if (!this.player || !this.playerReady || !this.currentVideoId) {
            return false;
        }

        try {
            const playerState = this.player.getPlayerState();
            const canForcePlayback = playerState === YT.PlayerState.PAUSED
                || playerState === YT.PlayerState.CUED
                || playerState === YT.PlayerState.UNSTARTED
                || playerState === YT.PlayerState.BUFFERING;

            if (!canForcePlayback) {
                recordTrace('ktv.trusted_resume.skipped', this.capturePlayerStateSnapshot('skipped'), { includeStack: false, verboseOnly: true });
                return false;
            }

            this.clearTrustedResumeTraceTimers();
            this.trustedResumeTraceToken = `resume_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            recordTrace('ktv.trusted_resume.requested', this.capturePlayerStateSnapshot('before-playVideo'), { includeStack: false });
            this.player.playVideo();
            recordTrace('ktv.trusted_resume.after_call', this.capturePlayerStateSnapshot('after-playVideo'), { includeStack: false, verboseOnly: true });
            const traceToken = this.trustedResumeTraceToken;
            this.trustedResumeTraceTimers.push(setTimeout(() => {
                if (this.trustedResumeTraceToken !== traceToken) {
                    return;
                }
                recordTrace('ktv.trusted_resume.after_250ms', this.capturePlayerStateSnapshot('after-250ms'), { includeStack: false, verboseOnly: true });
            }, 250));
            this.trustedResumeTraceTimers.push(setTimeout(() => {
                if (this.trustedResumeTraceToken !== traceToken) {
                    return;
                }
                recordTrace('ktv.trusted_resume.after_1000ms', this.capturePlayerStateSnapshot('after-1000ms'), { includeStack: false, verboseOnly: true });
            }, 1000));
            return true;
        } catch (error) {
            console.warn('[KTV] trusted resume 触发失败:', error);
            recordTrace('ktv.trusted_resume.failed', {
                currentVideoId: this.currentVideoId,
                error: String(error),
            }, { includeStack: false });
            return false;
        }
    }

    hasEmbeddedPlayer() {
        return Boolean(this.player && this.playerHost?.querySelector('iframe'));
    }

    isVideoSurfaceVisible() {
        const fullPlayer = document.getElementById('fullPlayer');
        if (!fullPlayer || !this.artworkContainer) {
            return false;
        }

        if (getComputedStyle(fullPlayer).display === 'none') {
            return false;
        }

        const artworkRect = this.artworkContainer.getBoundingClientRect();
        return artworkRect.width > 0 && artworkRect.height > 0;
    }

    ensurePlayerMount() {
        if (!this.playerHost) {
            return null;
        }

        let mount = this.playerHost.querySelector('#fullPlayerYouTube');
        if (mount && mount.tagName !== 'DIV') {
            mount = null;
        }

        if (!mount) {
            mount = document.createElement('div');
            mount.id = 'fullPlayerYouTube';
            this.playerHost.replaceChildren(mount);
        }

        return mount;
    }

    resetPlayerInstance() {
        this.clearControlsRestoreWait();

        if (this.player && typeof this.player.destroy === 'function') {
            try {
                this.player.destroy();
            } catch (error) {
                console.warn('[KTV] 销毁旧播放器失败:', error);
            }
        }

        if (this.playerHost) {
            this.playerHost.replaceChildren();
            const mount = document.createElement('div');
            mount.id = 'fullPlayerYouTube';
            this.playerHost.appendChild(mount);
        }

        this.player = null;
        this.playerReady = false;
        this.playerCreationPromise = null;
        this.playerCreateStartedAt = 0;
        this.pendingMpvState = null;
        this.videoLoadSettlingUntil = 0;
        this.clearTrustedResumeTraceTimers();
        this.trustedResumeTraceToken = null;
    }

    rememberPendingVideo(videoId, mpvState = {}) {
        if (!videoId) {
            return;
        }
        this.pendingVideoId = videoId;
        this.pendingMpvState = mpvState;
    }

    clearPendingVideo() {
        this.pendingVideoId = null;
        this.pendingMpvState = null;
    }

    hasShownFallbackNotice(videoId) {
        if (!videoId) {
            return false;
        }
        try {
            return sessionStorage.getItem(`${this._fallbackNoticePrefix}${videoId}`) === '1';
        } catch (error) {
            return false;
        }
    }

    markFallbackNoticeShown(videoId) {
        if (!videoId) {
            return;
        }
        try {
            sessionStorage.setItem(`${this._fallbackNoticePrefix}${videoId}`, '1');
        } catch (error) {
            // Ignore storage failures; warning dedupe is best-effort only.
        }
    }

    showAudioOnlyNotice() {
        if (!this.audioOnlyNoticeElement) {
            return;
        }

        const titleElement = this.audioOnlyNoticeElement.querySelector('.full-player-audio-only-title');
        const bodyElement = this.audioOnlyNoticeElement.querySelector('.full-player-audio-only-body');
        if (titleElement) {
            titleElement.textContent = i18n.t('player.youtubeAudioOnlyTitle');
        }
        if (bodyElement) {
            bodyElement.textContent = i18n.t('player.youtubeAudioOnlyBody');
        }
        this.audioOnlyNoticeElement.classList.add('visible');
    }

    hideAudioOnlyNotice() {
        if (!this.audioOnlyNoticeElement) {
            return;
        }

        const titleElement = this.audioOnlyNoticeElement.querySelector('.full-player-audio-only-title');
        const bodyElement = this.audioOnlyNoticeElement.querySelector('.full-player-audio-only-body');
        if (titleElement) {
            titleElement.textContent = '';
        }
        if (bodyElement) {
            bodyElement.textContent = '';
        }
        this.audioOnlyNoticeElement.classList.remove('visible');
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
        if (window.YT) {
            if (typeof window.YT.ready === 'function') {
                console.log('[KTV] YouTube API 已存在，等待 ready 后创建播放器');
                window.YT.ready(() => {
                    void this.createPlayer();
                });
            } else if (window.YT.Player) {
                console.log('[KTV] YouTube API 已存在，直接创建播放器');
                void this.createPlayer();
            }
        }
    }

    /**
     * 创建 YouTube 播放器实例
     */
    async createPlayer() {
        if (this.hasEmbeddedPlayer()) {
            console.log('[KTV] 播放器已存在，跳过创建');
            return;
        }

        const mount = this.ensurePlayerMount();
        if (!mount) {
            console.error('[KTV] 未找到 YouTube 播放器挂载点');
            return;
        }

        if (this.player && !this.hasEmbeddedPlayer()) {
            console.warn('[KTV] 检测到播放器实例存在但 iframe 缺失，重建播放器');
            this.resetPlayerInstance();
        }

        if (this.playerCreationPromise) {
            return this.playerCreationPromise;
        }

        this.playerCreationPromise = (async () => {
            try {
                this.playerCreateStartedAt = Date.now();
                // 从服务器读取控件配置
                const controlsEnabled = await this.getYouTubeControlsSetting();
                console.log(`[KTV] 创建播放器，控件配置: ${controlsEnabled ? '启用' : '禁用'}`);

                const nextMount = this.ensurePlayerMount();
                if (!nextMount) {
                    throw new Error('YouTube 播放器挂载点不存在');
                }

                this.player = new YT.Player(nextMount, {
                    height: '100%',
                    width: '100%',
                    playerVars: {
                        autoplay: 0,
                        controls: controlsEnabled ? 1 : 0,
                        disablekb: controlsEnabled ? 0 : 1,
                        fs: 1,
                        modestbranding: 1,
                        rel: 0,
                        showinfo: 0,
                        iv_load_policy: 3,
                        mute: 1
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
                this.player = null;
            } finally {
                this.playerCreationPromise = null;
            }
        })();

        return this.playerCreationPromise;
    }

    /**
     * 播放器就绪回调
     */
    onPlayerReady(event) {
        console.log('[KTV] YouTube 播放器就绪');
        this.playerReady = true;

        const currentStatus = player.getStatus();
        if (currentStatus?.current_meta?.type === 'youtube') {
            console.log('[KTV] 播放器就绪后恢复当前 YouTube 状态');
            this.updateStatus(currentStatus);
            return;
        }

        if (this.pendingVideoId && this.isVideoSurfaceVisible()) {
            console.log('[KTV] 播放器就绪后恢复待处理视频状态');
            this.enableVideoMode(this.pendingVideoId, this.pendingMpvState || {});
        }
    }

    /**
     * 播放器状态变化回调
     */
    onPlayerStateChange(event) {
        console.log('[KTV] 播放器状态:', this.getPlayerStateLabel(event.data));
        recordTrace('ktv.player_state_change', {
            ...this.capturePlayerStateSnapshot('on-state-change'),
            eventState: event.data,
            eventStateLabel: this.getPlayerStateLabel(event.data),
        }, { includeStack: false, verboseOnly: true });

        if (event.data === YT.PlayerState.PLAYING) {
            this.videoPendingSince = 0;
            this.lastPendingRecoveryAt = 0;
            this.videoLoadSettlingUntil = 0;
            this.lastSyncTime = 0;
            const currentStatus = player.getStatus();
            const currentMeta = currentStatus?.current_meta || {};
            if (currentMeta.type === 'youtube' && currentMeta.video_id === this.currentVideoId) {
                this.syncPlayback(this.getMpvState(currentStatus));
            }
        } else if (event.data === YT.PlayerState.BUFFERING || event.data === YT.PlayerState.UNSTARTED) {
            if (!this.videoPendingSince) {
                this.videoPendingSince = Date.now();
            }
        } else {
            this.videoPendingSince = 0;
        }
    }

    /**
     * 播放器错误回调
     */
    onPlayerError(event) {
        // 错误码: 2=无效ID, 5=HTML5播放器错误, 100=视频不存在, 101/150=不允许嵌入
        if (event.data === 2 || event.data === 100 || event.data === 101 || event.data === 150) {
            const currentMeta = player.getStatus()?.current_meta || {};
            const failedVideoId = this.currentVideoId || currentMeta.video_id || null;
            if (failedVideoId && failedVideoId === this._failedVideoId) {
                return;
            }

            const currentTitle = currentMeta.title || currentMeta.name || '';
            console.warn('[KTV] YouTube 播放器错误（切换为纯音频模式）:', event.data);
            this._failedVideoId = failedVideoId;  // 记住失败的ID，防止重试
            recordTrace('ktv.video_error_audio_fallback', {
                errorCode: event.data,
                failedVideoId: failedVideoId || null,
                currentTrackUrl: currentMeta.url || null,
                currentTrackTitle: currentTitle || null,
            }, { includeStack: false });
            dismissSuccessToastsForTitle(currentTitle);
            if (!this.hasShownFallbackNotice(failedVideoId)) {
                Toast.warning(i18n.t('player.youtubeVideoSkipped', { title: currentTitle || i18n.t('track.unknown') }));
                this.markFallbackNoticeShown(failedVideoId);
            }
            this.showAudioOnlyNotice();
            this.disableVideoMode();  // 立即清理视频模式状态
            return;
        }

        console.error('[KTV] YouTube 播放器错误:', event.data);
    }

    _markSkippedSongs(result) {
        const payload = result?.result || result;
        if (!payload?.skipped_songs?.length) {
            return;
        }
        payload.skipped_songs.forEach((song) => {
            if (song?.url) {
                unavailableSongs.add(song.url);
            }
        });
    }

    /**
     * 更新KTV状态（每次状态轮询时调用）
     */
    updateStatus(status) {
        const currentMeta = status?.current_meta || {};
        const mpvState = this.getMpvState(status);

        const videoId = currentMeta.video_id;
        const isYouTube = currentMeta.type === 'youtube' && videoId;

        if (!isYouTube) {
            this.hideAudioOnlyNotice();
        } else if (videoId === this._failedVideoId) {
            this.showAudioOnlyNotice();
        } else {
            this.hideAudioOnlyNotice();
        }

        // 判断是否需要切换视频模式
        if (isYouTube) {
            if (!this.isVideoSurfaceVisible()) {
                return;
            }

            this.rememberPendingVideo(videoId, mpvState);

            const playerCreationTimedOut = this.player && !this.playerReady
                && this.playerCreateStartedAt > 0
                && (Date.now() - this.playerCreateStartedAt) > 2500;

            if (playerCreationTimedOut) {
                console.warn('[KTV] 播放器创建超时，重建 YouTube 播放器');
                this.resetPlayerInstance();
            }

            if ((!this.player || !this.hasEmbeddedPlayer()) && window.YT) {
                console.log('[KTV] 检测到 YouTube 播放状态但播放器未创建，开始补建播放器');
                if (typeof window.YT.ready === 'function') {
                    window.YT.ready(() => {
                        void this.createPlayer();
                    });
                } else if (window.YT.Player) {
                    void this.createPlayer();
                }
                return;
            }
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

            this.resetPlayerInstance();
            this.currentVideoId = null;
            console.log('[KTV] 旧播放器已销毁');

            // 重新创建播放器（会自动读取新配置）
            await this.createPlayer();

            // 如果之前在播放视频，等待播放器就绪后恢复
            if (wasPlaying && currentVideoId) {
                console.log(`[KTV] 等待播放器就绪后恢复视频: ${currentVideoId}, 时间: ${currentTime.toFixed(2)}s`);
                this.scheduleControlsRestoreWait(currentVideoId, currentTime, wasPaused);
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
            const result = await api.getUIConfig();
            if (result?._error || result?.status !== 'OK') {
                throw new Error(result?.error || result?.message || '读取配置失败');
            }

            return result.data.youtube_controls !== false;
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
            this.rememberPendingVideo(videoId, mpvState);
            console.log('[KTV] 播放器未就绪，等待...');
            return;
        }

        // 该视频之前加载失败，跳过避免无限重试；新歌曲加载时自动解除
        if (videoId === this._failedVideoId) {
            this.clearPendingVideo();
            return;
        }
        // 不同视频加载时清除失败记录
        this._failedVideoId = null;
        this.clearPendingVideo();
        this.hideAudioOnlyNotice();

        // 如果视频ID改变，加载新视频
        if (videoId !== this.currentVideoId) {
            this.loadVideo(videoId, mpvState);
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
        const wasVideoMode = this.isVideoMode;

        this.clearControlsRestoreWait();

        if (wasVideoMode && this.player && this.playerReady) {
            try {
                this.player.stopVideo();
            } catch (e) {
                console.warn('[KTV] 停止播放失败:', e);
            }
        }

        this.currentVideoId = null;
        this.clearPendingVideo();
        this.clearTrustedResumeTraceTimers();
        this.trustedResumeTraceToken = null;
        if (this.artworkContainer) {
            this.artworkContainer.classList.remove('video-mode');
        }
        this.isVideoMode = false;
        this.lastSyncTime = 0;
        this.isSyncing = false;
        this.videoLoadSettlingUntil = 0;
        this.resetMetrics();

        if (wasVideoMode) {
            console.log('[KTV] 已切换到音乐模式');
        }
    }

    /**
     * 加载视频
     */
    loadVideo(videoId, mpvState = {}) {
        if (!this.player || !this.playerReady) {
            console.error('[KTV] 播放器未就绪');
            return;
        }

        if (!videoId || typeof videoId !== 'string' || videoId.trim() === '') {
            console.error('[KTV] 无效的视频ID，跳过加载:', videoId);
            return;
        }

        this.lastSyncTime = 0;
        this.isSyncing = false;
        this.resetMetrics();
        this.currentVideoId = videoId;
        this.videoLoadSettlingUntil = Date.now() + 1500;
        this.videoPendingSince = Date.now();
        console.log('[KTV] 加载视频:', videoId);

        try {
            const serverTime = this.getReferencePlaybackTime(mpvState);
            const startSeconds = Number.isFinite(serverTime)
                ? Math.max(0, serverTime + this.videoOffset)
                : 0;
            const shouldPlay = mpvState.paused === false;

            if (shouldPlay) {
                this.player.loadVideoById({
                    videoId,
                    startSeconds
                });
            } else {
                this.player.cueVideoById({
                    videoId,
                    startSeconds
                });
            }
        } catch (e) {
            console.error('[KTV] 加载视频失败:', e);
        }
    }

    /**
     * 从 localStorage 加载视频偏移量
     */
    loadOffset() {
        const saved = localStorage.getItem('ktvVideoOffset');
        if (saved !== null) this.videoOffset = parseFloat(saved) || 0;
    }

    /**
     * 调整视频偏移量
     * @param {number} delta - 偏移变化量（秒），正值提前，负值延迟
     * @returns {number} 新的偏移量
     */
    adjustOffset(delta) {
        this.videoOffset = Math.round((this.videoOffset + delta) * 10) / 10;
        this.videoOffset = Math.max(-5.0, Math.min(5.0, this.videoOffset));
        localStorage.setItem('ktvVideoOffset', this.videoOffset.toString());
        return this.videoOffset;
    }

    /**
     * 重置视频偏移量为零
     * @returns {number} 0
     */
    resetOffset() {
        this.videoOffset = 0;
        localStorage.removeItem('ktvVideoOffset');
        return 0;
    }

    /**
     * 同步播放状态（核心同步逻辑）
     */
    syncPlayback(mpvState) {
        if (!this.player || !this.playerReady || this.isSyncing) return;

        try {
            const serverTime = this.getReferencePlaybackTime(mpvState);
            if (!Number.isFinite(serverTime)) {
                return;
            }

            const isPaused = mpvState.paused !== false;
            const targetTime = Math.max(0, serverTime + this.videoOffset);  // 应用视频偏移量
            if (!Number.isFinite(targetTime)) {
                return;
            }

            // 获取当前播放器状态
            const playerState = this.player.getPlayerState();
            const isPlayerPlaying = playerState === YT.PlayerState.PLAYING;
            const isPlayerPaused = playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED;
            const isPlayerPending = playerState === YT.PlayerState.UNSTARTED || playerState === YT.PlayerState.BUFFERING;
            const now = Date.now();

            // 同步暂停/播放状态
            if (isPaused && isPlayerPlaying) {
                console.log('[KTV] 服务器已暂停，暂停视频');
                this.player.pauseVideo();
            } else if (!isPaused && isPlayerPaused) {
                console.log('[KTV] 服务器正在播放，播放视频');
                this.player.playVideo();
            }

            if (isPlayerPending) {
                const pendingSince = this.videoPendingSince || now;
                const pendingDuration = now - pendingSince;
                const videoTime = Number(this.player.getCurrentTime());
                const hasVideoTime = Number.isFinite(videoTime);
                const driftWhilePending = hasVideoTime ? Math.abs(videoTime - targetTime) : null;
                const shouldRecoverPendingPlayer = Boolean(
                    this.currentVideoId
                    && pendingDuration > 3000
                    && (now - this.lastPendingRecoveryAt) > 3000
                    && (!hasVideoTime || driftWhilePending == null || driftWhilePending > 1.0)
                );

                if (shouldRecoverPendingPlayer) {
                    console.warn(`[KTV] 播放器卡在 pending ${Math.round(pendingDuration)}ms，按当前音频时间重载视频`);
                    this.lastPendingRecoveryAt = now;
                    this.videoLoadSettlingUntil = now + 1500;
                    this.player.loadVideoById({
                        videoId: this.currentVideoId,
                        startSeconds: targetTime,
                    });
                }

                this.lastSyncTime = now;
                return;
            }

            if (now < this.videoLoadSettlingUntil) {
                this.lastSyncTime = now;
                return;
            }

            // 同步时间位置（每1秒最多同步一次）
            if (now - this.lastSyncTime > 1000) {
                const videoTime = Number(this.player.getCurrentTime());
                if (!Number.isFinite(videoTime)) {
                    this.lastSyncTime = now;
                    return;
                }

                const drift = Math.abs(videoTime - targetTime);
                if (!Number.isFinite(drift)) {
                    this.lastSyncTime = now;
                    return;
                }

                // 记录偏差指标
                this.metrics.driftSum += drift;
                this.metrics.driftCount++;
                this.metrics.maxDrift = Math.max(this.metrics.maxDrift, drift);

                // 如果偏差超过阈值，校准时间
                if (drift > this.syncThreshold) {
                    const offsetInfo = this.videoOffset !== 0 ? `（偏移 ${this.videoOffset > 0 ? '+' : ''}${this.videoOffset.toFixed(1)}s）` : '';
                    console.log(`[KTV] 时间偏差 ${drift.toFixed(2)}s，校准到 ${targetTime.toFixed(2)}s${offsetInfo}`);
                    this.isSyncing = true;
                    this.player.seekTo(targetTime, true);
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
        const avgDrift = this.metrics.driftCount > 0
            ? (this.metrics.driftSum / this.metrics.driftCount)
            : 0;
        const maxDrift = Number.isFinite(this.metrics.maxDrift) ? this.metrics.maxDrift : 0;

        return {
            avgDrift: Number.isFinite(avgDrift) ? avgDrift.toFixed(3) : '0.000',
            maxDrift: maxDrift.toFixed(3),
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
