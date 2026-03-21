// 播放器控制模块
import { api } from './api.js?v=2';
import { settingsManager } from './settingsManager.js?v=3';
import { operationLock } from './operationLock.js';

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
    
    // 事件监听
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => cb(data));
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
        this.updateStatus(validStatus);
        return validStatus;
    }

    async refreshStatus(fallbackMessage = '获取播放器状态失败') {
        const status = await api.getStatus();
        return this._applyStatus(status, fallbackMessage);
    }

    // 播放控制
    async play(url, title, type = 'local', duration = 0) {
        try {
            const result = this._ensureSuccess(
                await api.play(url, title, type, duration),
                '播放失败'
            );

            // 记录当前播放的URL
            this.currentPlayingUrl = url;

            // 立即更新状态缓存（与 next/prev 保持一致），无需等待下次轮询或 WebSocket
            if (result?.status === 'OK' && result?.current && this.status) {
                this.updateStatus({
                    ...this.status,
                    current_meta: result.current,
                });
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
        this.emit('pause');
        return result;
    }

    async next() {
        const result = this._ensureSuccess(await api.next(), '下一首播放失败');
        // 利用响应中的 current_meta 立即更新 UI，无需等待下次 1000ms 轮询
        if (result?.status === 'OK' && result?.current && this.status) {
            this.updateStatus({
                ...this.status,
                current_meta: result.current,
            });
        }
        this.emit('next', result);
        return result;
    }

    async prev() {
        const result = this._ensureSuccess(await api.prev(), '上一首播放失败');
        // 利用响应中的 current_meta 立即更新 UI，无需等待下次 1000ms 轮询
        if (result?.status === 'OK' && result?.current && this.status) {
            this.updateStatus({
                ...this.status,
                current_meta: result.current,
            });
        }
        this.emit('prev', result);
        return result;
    }

    async togglePlayPause() {
        // 后端 /pause 已是切换语义
        const result = this._ensureSuccess(await api.pause(), '播放状态切换失败');
        // 尽力刷新状态，避免UI卡住
        try {
            const status = await this.refreshStatus();
            // 恢复播放时，发送当前歌曲元数据
            if (!result?.paused) {
                const meta = status?.current_meta || {};
                this.emit('play', { 
                    url: meta.url || meta.rel, 
                    title: meta.title || meta.name,
                    type: meta.type 
                });
                return result;
            }
        } catch (err) {
            console.warn('刷新状态失败:', err);
        }

        if (!result?.paused) {
            const meta = this.status?.current_meta || {};
            this.emit('play', {
                url: meta.url || meta.rel,
                title: meta.title || meta.name,
                type: meta.type
            });
            return result;
        }

        this.emit(result?.paused ? 'pause' : 'play');
        return result;
    }

    // 音量控制
    async setVolume(value) {
        const result = this._ensureSuccess(await api.setVolume(value), '设置音量失败');
        this.emit('volumeChange', value);
        return result;
    }

    // 进度控制
    async seek(percent) {
        const result = this._ensureSuccess(await api.seek(percent), '跳转失败');
        this.emit('seek', percent);
        return result;
    }

    // 循环模式
    async cycleLoop() {
        const result = this._ensureSuccess(await api.loop(), '循环模式切换失败');
        const loopMode = result.loop_mode !== undefined ? result.loop_mode : result;
        this.emit('loopChange', loopMode);
        return result;
    }

    // 随机播放模式
    async toggleShuffle() {
        const result = this._ensureSuccess(await api.shuffle(), '随机播放切换失败');
        const shuffleMode = result.shuffle_mode !== undefined ? result.shuffle_mode : false;
        this.emit('shuffleChange', shuffleMode);
        return result;
    }

    // 音调控制（KTV升降调）
    async setPitch(semitones) {
        const result = this._ensureSuccess(await api.setPitch(semitones), '音调调整失败');
        const pitchShift = result.pitch_shift !== undefined ? result.pitch_shift : semitones;
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
                console.error('状态轮询失败:', error);
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

    // ==================== WebSocket 实时同步 ====================

    /**
     * 建立 WebSocket 连接，实现跨客户端实时状态推送
     */
    connectWebSocket() {
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
            loop_mode: msg.loop_mode,
            shuffle_mode: msg.shuffle_mode,
            pitch_shift: msg.pitch_shift,
            mpv_state: msg.mpv_state,
            server_time: msg.server_time,
        };
        this.updateStatus(newStatus);

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

    updateStatus(status) {
        const oldStatus = this.status;
        this.status = status;

        // 计算客户端与服务器的时钟偏移（用于修正历史记录时间戳显示）
        if (status?.server_time) {
            this.clockOffset = Date.now() / 1000 - status.server_time;
        }

        // 记录插值参考点，供前端 RAF 循环推算当前进度
        const mpvData = status?.mpv_state || status?.mpv || {};
        const timePos = mpvData.time_pos ?? mpvData.time ?? null;
        const paused  = mpvData.paused ?? true;
        if (timePos !== null) {
            this._interpTime    = timePos;
            this._interpStamp   = Date.now();
            this._interpPlaying = !paused;
        }

        this.emit('statusUpdate', { status, oldStatus });
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
        const mpvData  = this.status?.mpv_state || this.status?.mpv || {};
        const duration = mpvData.duration ?? 0;
        const result   = this._interpTime + elapsed;
        return duration > 0 ? Math.min(result, duration) : result;
    }

    // 判断是否正在播放
    isPlaying() {
        return this.status?.mpv?.paused === false;
    }
}

// 导出单例
export const player = new Player();
