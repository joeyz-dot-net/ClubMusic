// 播放器控制模块
import { api } from './api.js?v=4';
import { settingsManager } from './settingsManager.js?v=6';
import { operationLock } from './operationLock.js';
import { recordTrace } from './requestTrace.js?v=2';

const STATUS_TIME_EPSILON = 0.001;

export class Player {
    constructor() {
        this.status = null;
        this.pollInterval = null;
        this.listeners = new Map();
        this.currentPlayingUrl = null;  // 追踪当前播放的歌曲URL
        this.pollingPaused = false;  // 轮询暂停标志
        this._hiddenByVisibility = false;  // 标签页隐藏标志
        this._lastPollIntervalMs = 5000;  // 记住轮询间隔以便恢复
        this.clockOffset = 0; // 客户端与服务器的时钟偏移（秒）: client_time - server_time
        this._lastServerTime = 0;
        this._minAcceptedServerTime = 0;
        this._isShuttingDown = false;

        window.__clubMusicPageUnloading = false;

        // WebSocket 相关
        this.ws = null;
        this.wsConnected = false;
        this.wsReconnectDelay = 1000;
        this.wsReconnectTimer = null;
        this.wsHeartbeatInterval = null;

        // 监听标签页可见性变化，隐藏时暂停轮询以节省带宽
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._pauseForHidden();
            } else {
                this._resumeFromHidden();
            }
        });

        const handlePageUnload = () => {
            this.shutdown();
        };
        window.addEventListener('pagehide', handlePageUnload);
        window.addEventListener('beforeunload', handlePageUnload);

        // 注册操作锁回调
        operationLock.onPause(() => {
            this.pollingPaused = true;
            console.log('[Player] 轮询已被操作锁暂停');
        });
        operationLock.onResume(() => {
            this.pollingPaused = false;
            console.log('[Player] 轮询已被操作锁恢复');
        });
    }

    _getMpvData(status = this.status) {
        return status?.mpv_state || status?.mpv || {};
    }
    
    // 事件监听
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach((callback) => {
            try {
                const result = callback(data);
                if (result && typeof result.then === 'function') {
                    result.catch((error) => {
                        console.error(`[Player] ${event} 监听器异常:`, error);
                    });
                }
            } catch (error) {
                console.error(`[Player] ${event} 监听器异常:`, error);
            }
        });
    }

    _createApiError(result, fallbackMessage) {
        const message = result?.error || result?.message || fallbackMessage;
        const error = new Error(message);
        if (result && typeof result === 'object') {
            error.result = result;
        }
        return error;
    }

    _ensureSuccess(result, fallbackMessage, { allowStatuses = [] } = {}) {
        const status = result?.status;
        if (!result || result?._error || (status && status !== 'OK' && !allowStatuses.includes(status))) {
            throw this._createApiError(result, fallbackMessage);
        }
        return result;
    }

    _applyStatus(status, fallbackMessage = '获取播放器状态失败') {
        const validStatus = this._ensureSuccess(status, fallbackMessage);
        this.updateStatus(validStatus, { source: 'poll' });
        return validStatus;
    }

    _estimateServerNow() {
        return Date.now() / 1000 - this.clockOffset;
    }

    _markLocalStatusBarrier() {
        this._minAcceptedServerTime = Math.max(
            this._minAcceptedServerTime,
            this._estimateServerNow()
        );
    }

    _buildLocalStatusWithMpvPatch(mpvPatch) {
        if (!this.status) {
            return null;
        }

        const currentStatus = this.status;
        const currentMpvState = this._getMpvData(currentStatus);
        const nextMpvState = {
            ...currentMpvState,
            ...mpvPatch,
        };

        const nextStatus = {
            ...currentStatus,
            mpv_state: nextMpvState,
        };

        if (currentStatus.mpv) {
            nextStatus.mpv = {
                ...currentStatus.mpv,
                ...mpvPatch,
            };
        }

        return nextStatus;
    }

    _buildLocalStatusPatch(statusPatch) {
        if (!this.status) {
            return null;
        }

        return {
            ...this.status,
            ...statusPatch,
        };
    }

    _applyLocalStatusPatch(statusPatch) {
        const nextStatus = this._buildLocalStatusPatch(statusPatch);
        if (!nextStatus) {
            return null;
        }

        this._markLocalStatusBarrier();
        this.updateStatus(nextStatus, { source: 'local' });
        return nextStatus;
    }

    _applyLocalMpvStatePatch(mpvPatch) {
        return this._applyLocalStatusPatch(this._buildLocalStatusWithMpvPatch(mpvPatch));
    }

    _createPlayEventPayload(status = this.status) {
        const meta = status?.current_meta || {};
        return {
            url: meta.url || meta.rel,
            title: meta.title || meta.name,
            type: meta.type,
        };
    }

    _buildStatusUiSignature(status) {
        if (!status) {
            return '';
        }

        const meta = status.current_meta || {};
        const mpvState = this._getMpvData(status);
        return JSON.stringify({
            url: meta.url || meta.rel || meta.raw_url || '',
            title: meta.title || meta.name || '',
            artist: meta.artist || status.artist || '',
            type: meta.type || '',
            thumbnailUrl: status.thumbnail_url || meta.thumbnail_url || '',
            videoId: meta.video_id || '',
            paused: mpvState.paused ?? true,
            volume: Number.isFinite(mpvState.volume) ? Math.round(mpvState.volume) : null,
            duration: Number.isFinite(mpvState.duration) ? Math.round(mpvState.duration) : 0,
            loopMode: status.loop_mode ?? null,
            shuffleMode: status.shuffle_mode ?? null,
            pitchShift: status.pitch_shift ?? null,
            playlistId: status.current_playlist_id || '',
            playlistIndex: status.current_index ?? null,
            playlistUpdatedAt: status.playlist_updated_at ?? 0,
        });
    }

    _shouldAcceptServerStatus(status, source) {
        if (!status?.server_time || source === 'local') {
            return true;
        }

        const serverTime = status.server_time;
        if (serverTime < this._lastServerTime - STATUS_TIME_EPSILON) {
            console.warn(`[Player] 忽略过期${source}状态:`, {
                serverTime,
                lastServerTime: this._lastServerTime,
            });
            return false;
        }

        if (serverTime < this._minAcceptedServerTime - STATUS_TIME_EPSILON) {
            console.warn(`[Player] 忽略早于本地操作的${source}状态:`, {
                serverTime,
                minAcceptedServerTime: this._minAcceptedServerTime,
            });
            return false;
        }

        return true;
    }

    async refreshStatus(fallbackMessage = '获取播放器状态失败') {
        const status = await api.getStatus();
        return this._applyStatus(status, fallbackMessage);
    }

    // 播放控制
    async play(url, title, type = 'local', duration = 0) {
        try {
            recordTrace('player.play', {
                url,
                title,
                type,
                duration,
                currentUrl: this.status?.current_meta?.url || null,
            });
            const result = this._ensureSuccess(
                await api.play(url, title, type, duration),
                '播放失败'
            );

            // 记录当前播放的URL
            this.currentPlayingUrl = url;

            // 立即更新状态缓存（与 next/prev 保持一致），无需等待下次轮询或 WebSocket
            if (result?.status === 'OK' && result?.current && this.status) {
                this._markLocalStatusBarrier();
                this.updateStatus({
                    ...this.status,
                    current_meta: result.current,
                    current_index: result.current_index ?? this.status?.current_index ?? -1,
                }, { source: 'local' });
            }

            this.emit('play', { url, title, type });

            return result;
        } catch (error) {
            console.error('[Player.play] 播放异常:', error);
            throw error;
        }
    }
    
    async pause() {
        const result = this._ensureSuccess(await api.pause(), '暂停失败');
        this._applyLocalMpvStatePatch({ paused: !!result?.paused });
        this.emit(result?.paused ? 'pause' : 'resume', result?.paused ? undefined : this._createPlayEventPayload());
        return result;
    }

    async next() {
        const applyNextResultLocally = (result) => {
            if (!result?.current || !this.status) {
                return;
            }

            this._markLocalStatusBarrier();
            const currentMpvState = this.status?.mpv_state || this.status?.mpv || {};
            const nextStatus = {
                ...this.status,
                current_meta: result.current,
                current_index: result.current_index ?? this.status?.current_index ?? -1,
            };

            if (result.status === 'EMPTY' || result.status === 'ERROR') {
                nextStatus.mpv_state = {
                    ...currentMpvState,
                    paused: true,
                    time_pos: 0,
                    duration: 0,
                };

                if (this.status?.mpv) {
                    nextStatus.mpv = {
                        ...this.status.mpv,
                        paused: true,
                        time_pos: 0,
                        duration: 0,
                    };
                }
            }

            this.updateStatus(nextStatus, { source: 'local' });
        };

        try {
            recordTrace('player.next', {
                currentUrl: this.status?.current_meta?.url || null,
                currentTitle: this.status?.current_meta?.title || this.status?.current_meta?.name || null,
                currentIndex: this.status?.current_index ?? null,
            });
            const result = this._ensureSuccess(await api.next(), '下一首播放失败', { allowStatuses: ['EMPTY'] });
            this.emit('next', result);
            // 利用响应中的 current_meta 立即更新 UI，无需等待下次 1000ms 轮询
            if ((result?.status === 'OK' || result?.status === 'EMPTY')) {
                applyNextResultLocally(result);
            }
            return result;
        } catch (error) {
            if (error?.result?.status === 'ERROR') {
                applyNextResultLocally(error.result);
            }
            throw error;
        }
    }

    async prev() {
        recordTrace('player.prev', {
            currentUrl: this.status?.current_meta?.url || null,
            currentTitle: this.status?.current_meta?.title || this.status?.current_meta?.name || null,
            currentIndex: this.status?.current_index ?? null,
        });
        const result = this._ensureSuccess(await api.prev(), '上一首播放失败');
        // 利用响应中的 current_meta 立即更新 UI，无需等待下次 1000ms 轮询
        if (result?.status === 'OK' && result?.current && this.status) {
            this._markLocalStatusBarrier();
            this.updateStatus({
                ...this.status,
                current_meta: result.current,
                current_index: result.current_index ?? this.status?.current_index ?? -1,
            }, { source: 'local' });
        }
        this.emit('prev', result);
        return result;
    }

    async togglePlayPause() {
        // 后端 /pause 已是切换语义
        const result = this._ensureSuccess(await api.pause(), '播放状态切换失败');
        this._applyLocalMpvStatePatch({ paused: !!result?.paused });
        this.emit(result?.paused ? 'pause' : 'resume', result?.paused ? undefined : this._createPlayEventPayload());
        return result;
    }

    // 音量控制
    async setVolume(value) {
        const result = this._ensureSuccess(await api.setVolume(value), '设置音量失败');
        if (result?.volume !== undefined) {
            this._applyLocalMpvStatePatch({ volume: result.volume });
        }
        this.emit('volumeChange', value);
        return result;
    }

    // 进度控制
    async seek(percent) {
        const result = this._ensureSuccess(await api.seek(percent), '跳转失败');
        const currentMpvState = this._getMpvData();
        const duration = currentMpvState.duration ?? 0;
        const nextTimePos = result?.position !== undefined
            ? result.position
            : (duration > 0 ? (percent / 100) * duration : currentMpvState.time_pos ?? currentMpvState.time);

        if (nextTimePos !== undefined && nextTimePos !== null) {
            this._applyLocalMpvStatePatch({
                time_pos: nextTimePos,
                time: nextTimePos,
            });
        }
        this.emit('seek', percent);
        return result;
    }

    // 循环模式
    async cycleLoop() {
        const result = this._ensureSuccess(await api.loop(), '循环模式切换失败');
        const loopMode = result.loop_mode !== undefined ? result.loop_mode : result;
        if (loopMode !== undefined && loopMode !== null) {
            this._applyLocalStatusPatch({ loop_mode: loopMode });
        }
        this.emit('loopChange', loopMode);
        return result;
    }

    // 随机播放模式
    async toggleShuffle() {
        const result = this._ensureSuccess(await api.shuffle(), '随机播放切换失败');
        const shuffleMode = result.shuffle_mode !== undefined ? result.shuffle_mode : false;
        this._applyLocalStatusPatch({ shuffle_mode: shuffleMode });
        this.emit('shuffleChange', shuffleMode);
        return result;
    }

    // 音调控制（KTV升降调）
    async setPitch(semitones) {
        const result = this._ensureSuccess(await api.setPitch(semitones), '音调调整失败');
        const pitchShift = result.pitch_shift !== undefined ? result.pitch_shift : semitones;
        this._applyLocalStatusPatch({ pitch_shift: pitchShift });
        this.emit('pitchChange', pitchShift);
        return result;
    }

    async pitchUp() {
        const current = this.status?.pitch_shift ?? 0;
        if (current >= 6) return;
        return this.setPitch(current + 1);
    }

    async pitchDown() {
        const current = this.status?.pitch_shift ?? 0;
        if (current <= -6) return;
        return this.setPitch(current - 1);
    }

    // 状态轮询
    startPolling(interval = 5000) {
        if (this._isShuttingDown) return;
        if (this.pollInterval) return;
        this._lastPollIntervalMs = interval;

        this.pollInterval = setInterval(async () => {
            // 检查操作锁：如果有活跃的锁，跳过本次轮询
            if (this.pollingPaused || operationLock.isPollingPaused()) {
                console.log('[Player] 轮询被操作锁暂停，跳过本次更新');
                return;
            }

            try {
                await this.refreshStatus();
            } catch (error) {
                if (!this._isShuttingDown) {
                    console.error('状态轮询失败:', error);
                }
            }
        }, interval);

        // 【关键修复】启动轮询监控防止意外暂停
        this.startPollingMonitor();

        // 建立 WebSocket 连接（首次调用时）
        if (this.ws === null) {
            this.connectWebSocket();
        }
    }

    // 【新增】轮询监控：防止轮询被意外暂停
    startPollingMonitor() {
        if (this.monitorInterval) return;
        
        this.monitorInterval = setInterval(() => {
            // 检查是否轮询被暂停但没有活跃的锁
            if ((this.pollingPaused || operationLock.isPollingPaused()) && 
                !operationLock.hasActiveLocks()) {
                console.warn('[Player] ⚠️ 轮询被暂停但无活跃锁，这可能导致播放停止！');
                console.warn('[Player] 锁状态:', operationLock.getStatus());
                console.warn('[Player] 强制恢复轮询...');
                
                // 强制恢复轮询
                try {
                    operationLock.resumePolling();
                    this.pollingPaused = false;
                    console.log('[Player] ✓ 轮询已强制恢复');
                } catch (err) {
                    console.error('[Player] 恢复轮询失败:', err);
                }
            }
        }, 5000);  // 每5秒检查一次
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        // 清理 WebSocket 资源
        if (this.wsHeartbeatInterval) {
            clearInterval(this.wsHeartbeatInterval);
            this.wsHeartbeatInterval = null;
        }
        if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
            this.wsReconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // 标签页隐藏时暂停轮询和监控（WebSocket 保持活跃）
    _pauseForHidden() {
        if (this._hiddenByVisibility) return;
        this._hiddenByVisibility = true;
        console.log('[Player] 标签页隐藏，暂停轮询');
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }

    // 标签页恢复可见时重启轮询并立即刷新状态
    async _resumeFromHidden() {
        if (this._isShuttingDown) return;
        if (!this._hiddenByVisibility) return;
        this._hiddenByVisibility = false;
        console.log('[Player] 标签页恢复可见，重启轮询');
        // 立即获取最新状态
        try {
            await this.refreshStatus();
        } catch (err) {
            console.warn('[Player] 恢复时获取状态失败:', err);
        }
        // 重启轮询
        this.startPolling(this._lastPollIntervalMs);
    }

    shutdown() {
        if (this._isShuttingDown) return;
        this._isShuttingDown = true;
        window.__clubMusicPageUnloading = true;
        this.stopPolling();
    }

    // ==================== WebSocket 实时同步 ====================

    /**
     * 建立 WebSocket 连接，实现跨客户端实时状态推送
     */
    connectWebSocket() {
        if (this._isShuttingDown) return;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = `${protocol}//${location.host}/ws`;
        // 将 room_id 传递给 WebSocket，确保只接收本房间的状态推送
        if (api.roomId) {
            wsUrl += `?room_id=${encodeURIComponent(api.roomId)}`;
        }
        console.log(`[WS] 连接到 ${wsUrl}`);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                if (this._isShuttingDown) {
                    this.ws?.close();
                    return;
                }
                console.log('[WS] 连接成功');
                this.wsConnected = true;
                this.wsReconnectDelay = 1000;  // 重置退避时间
                // WS 连接后降低轮询频率（保留轮询作为进度条更新和 fallback）
                this._reducePollingForWS();
                // 启动心跳保活（防止代理/NAT 超时）
                this.wsHeartbeatInterval = setInterval(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send('ping');
                    }
                }, 20000);
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this._handleWebSocketMessage(msg);
                } catch (e) {
                    // 忽略非 JSON 消息（如服务器的 pong 回复）
                }
            };

            this.ws.onclose = (event) => {
                this.wsConnected = false;
                if (this._isShuttingDown) {
                    return;
                }
                console.log(`[WS] 连接断开 (code=${event.code})，${this.wsReconnectDelay}ms 后重连`);
                // 断开后恢复正常轮询频率
                this._restorePollingForWS();
                // 清理心跳
                if (this.wsHeartbeatInterval) {
                    clearInterval(this.wsHeartbeatInterval);
                    this.wsHeartbeatInterval = null;
                }
                // 指数退避重连（上限 30s）
                this.wsReconnectTimer = setTimeout(() => {
                    this.wsReconnectDelay = Math.min(30000, this.wsReconnectDelay * 2);
                    this.connectWebSocket();
                }, this.wsReconnectDelay);
            };

            this.ws.onerror = () => {
                // onerror 后会触发 onclose，由 onclose 处理重连
            };

        } catch (e) {
            console.error('[WS] 创建连接失败:', e);
        }
    }

    /**
     * 处理服务端推送的状态消息
     */
    _handleWebSocketMessage(msg) {
        if (msg.type !== 'state_update') return;
        console.log('[WS] 收到状态更新');

        // 构造兼容现有 updateStatus() 的状态对象
        const newStatus = {
            status: 'OK',
            current_meta: msg.current_meta,
            current_playlist_id: msg.current_playlist_id,
            current_index: msg.current_index,
            playlist_updated_at: msg.playlist_updated_at,
            loop_mode: msg.loop_mode,
            shuffle_mode: msg.shuffle_mode,
            pitch_shift: msg.pitch_shift,
            mpv_state: msg.mpv_state,
            playlist_updated: msg.playlist_updated === true,
            server_time: msg.server_time,
        };
        this.updateStatus(newStatus, { source: 'ws' });

        // 若歌单有变更，触发歌单刷新事件（避免在用户操作期间刷新）
        if (msg.playlist_updated) {
            if (!operationLock.hasActiveLocks()) {
                this.emit('playlistChanged', msg.current_playlist_id);
            }
        }
    }

    /** WS 连接时将轮询降至 5000ms（节省资源，保留进度条刷新） */
    _reducePollingForWS() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.startPolling(5000);
    }

    /** WS 断开时恢复 1000ms 轮询（完整 fallback） */
    _restorePollingForWS() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.startPolling(1000);
    }

    // ==================== 状态管理 ====================

    updateStatus(status, { source = 'unknown' } = {}) {
        if (!this._shouldAcceptServerStatus(status, source)) {
            return this.status;
        }

        const oldStatus = this.status;
        const oldUiSignature = this._buildStatusUiSignature(oldStatus);
        this.status = status;

        if (status?.server_time && source !== 'local') {
            this._lastServerTime = Math.max(this._lastServerTime, status.server_time);
            if (status.server_time >= this._minAcceptedServerTime - STATUS_TIME_EPSILON) {
                this._minAcceptedServerTime = 0;
            }
        }

        // 计算客户端与服务器的时钟偏移（用于修正历史记录时间戳显示）
        if (status?.server_time) {
            this.clockOffset = Date.now() / 1000 - status.server_time;
        }

        // 记录插值参考点，供前端 RAF 循环推算当前进度
        const mpvData = this._getMpvData(status);
        const timePos = mpvData.time_pos ?? mpvData.time ?? null;
        const paused  = mpvData.paused ?? true;
        if (timePos !== null) {
            this._interpTime    = timePos;
            this._interpStamp   = Date.now();
            this._interpPlaying = !paused;
        }

        // KTV 同步需要每次已接受的服务器时间戳，不能依赖 UI 去重后的 statusUpdate。
        this.emit('statusTick', { status, oldStatus, source });

        const newUiSignature = this._buildStatusUiSignature(status);
        if (oldStatus && oldUiSignature === newUiSignature) {
            return status;
        }

        this.emit('statusUpdate', { status, oldStatus });
        return status;
    }

    // 获取当前状态
    getStatus() {
        return this.status;
    }

    // 获取插值后的当前播放位置（秒），供进度条 RAF 循环使用
    getInterpolatedTime() {
        if (!this._interpPlaying || this._interpTime == null) {
            return this._interpTime ?? 0;
        }
        const elapsed  = (Date.now() - this._interpStamp) / 1000;
        const mpvData  = this._getMpvData();
        const duration = mpvData.duration ?? 0;
        const result   = this._interpTime + elapsed;
        return duration > 0 ? Math.min(result, duration) : result;
    }

    // 判断是否正在播放
    isPlaying() {
        const mpvData = this._getMpvData();
        return mpvData.paused === false;
    }
}

// 导出单例
export const player = new Player();
