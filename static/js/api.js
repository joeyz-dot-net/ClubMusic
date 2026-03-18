// API 调用封装模块

/**
 * Leading debounce（先到先得）：
 * 第一次调用立即执行，窗口期内的后续调用被忽略并返回第一次的 Promise。
 * @param {Function} fn - 要防抖的异步函数（已绑定 this）
 * @param {number} waitMs - 防抖窗口（毫秒）
 */
function makeLeadingDebounce(fn, waitMs) {
    let lastCallTime = 0;
    let lastPromise = null;
    return function(...args) {
        const now = Date.now();
        if (now - lastCallTime >= waitMs) {
            lastCallTime = now;
            lastPromise = fn(...args);
            return lastPromise;
        }
        console.log(`[Debounce] 操作在 ${waitMs}ms 内重复，已忽略`);
        return lastPromise || Promise.resolve({});
    };
}

export class MusicAPI {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.defaultTimeout = 15000;

        // 读取 URL 中的 room_id 或 pipe 参数（用于多房间 Player 路由）
        const urlParams = new URLSearchParams(window.location.search);
        this.roomId = urlParams.get('room_id') || '';
        this.pipeParam = urlParams.get('pipe') || '';

        // 防抖包装（先到先得 Leading Debounce）
        // next/prev/play: 1000ms — 切歌操作耗时较长，1 秒窗口防止堆叠
        // pause: 500ms — 响应快，但防触摸双击
        this._debouncedNext  = makeLeadingDebounce(this._rawNext.bind(this),  1000);
        this._debouncedPrev  = makeLeadingDebounce(this._rawPrev.bind(this),  1000);
        this._debouncedPlay  = makeLeadingDebounce(this._rawPlay.bind(this),  1000);
        this._debouncedPause = makeLeadingDebounce(this._rawPause.bind(this), 500);
    }

    // 将 room_id 或 pipe 参数附加到 URL（多房间支持）
    _appendPipe(url) {
        // 优先使用 room_id（URL 安全，无编码问题）
        if (this.roomId) {
            const sep = url.includes('?') ? '&' : '?';
            return `${url}${sep}room_id=${encodeURIComponent(this.roomId)}`;
        }
        // 向后兼容 pipe 参数
        if (!this.pipeParam) return url;
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}pipe=${encodeURIComponent(this.pipeParam)}`;
    }

    // 创建带超时的 fetch 请求
    _fetchWithTimeout(url, options = {}, timeout) {
        const ms = timeout || this.defaultTimeout;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        return fetch(url, { ...options, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    }

    async get(endpoint, { timeout } = {}) {
        try {
            const url = this._appendPipe(`${this.baseURL}${endpoint}`);
            const response = await this._fetchWithTimeout(url, {}, timeout);
            const data = await response.json();
            if (!response.ok) {
                console.warn(`[API] GET ${endpoint} HTTP ${response.status}:`, data);
                return { _error: true, status: response.status, ...data };
            }
            return data;
        } catch (err) {
            console.warn(`[API] GET ${endpoint} failed:`, err);
            return { _error: true, message: err.message };
        }
    }

    async post(endpoint, data, { timeout } = {}) {
        try {
            const url = this._appendPipe(`${this.baseURL}${endpoint}`);
            const response = await this._fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }, timeout);
            const result = await response.json();
            if (!response.ok) {
                console.warn(`[API] POST ${endpoint} HTTP ${response.status}:`, result);
                return { _error: true, status: response.status, ...result };
            }
            return result;
        } catch (err) {
            console.warn(`[API] POST ${endpoint} failed:`, err);
            return { _error: true, message: err.message };
        }
    }

    async postForm(endpoint, formData, { timeout } = {}) {
        try {
            const url = this._appendPipe(`${this.baseURL}${endpoint}`);
            const response = await this._fetchWithTimeout(url, {
                method: 'POST',
                body: formData
            }, timeout);
            const result = await response.json();
            if (!response.ok) {
                console.warn(`[API] POST-FORM ${endpoint} HTTP ${response.status}:`, result);
                return { _error: true, status: response.status, ...result };
            }
            return result;
        } catch (err) {
            console.warn(`[API] POST-FORM ${endpoint} failed:`, err);
            return { _error: true, message: err.message };
        }
    }

    async delete(endpoint, { timeout } = {}) {
        try {
            const url = this._appendPipe(`${this.baseURL}${endpoint}`);
            const response = await this._fetchWithTimeout(url, {
                method: 'DELETE'
            }, timeout);
            const result = await response.json();
            if (!response.ok) {
                console.warn(`[API] DELETE ${endpoint} HTTP ${response.status}:`, result);
                return { _error: true, status: response.status, ...result };
            }
            return result;
        } catch (err) {
            console.warn(`[API] DELETE ${endpoint} failed:`, err);
            return { _error: true, message: err.message };
        }
    }

    async put(endpoint, data, { timeout } = {}) {
        try {
            const url = this._appendPipe(`${this.baseURL}${endpoint}`);
            const response = await this._fetchWithTimeout(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }, timeout);
            const result = await response.json();
            if (!response.ok) {
                console.warn(`[API] PUT ${endpoint} HTTP ${response.status}:`, result);
                return { _error: true, status: response.status, ...result };
            }
            return result;
        } catch (err) {
            console.warn(`[API] PUT ${endpoint} failed:`, err);
            return { _error: true, message: err.message };
        }
    }

    // 播放器相关 API
    async getStatus() {
        return this.get('/status', { timeout: 10000 });
    }

    // 原始（未防抖）播放方法
    async _rawPlay(url, title, type = 'local', duration = 0) {
        const formData = new FormData();
        formData.append('url', url);
        formData.append('title', title);
        formData.append('type', type);
        formData.append('duration', duration);
        return this.postForm('/play', formData);
    }

    async _rawPause() {
        return this.post('/pause', {});
    }

    async _rawNext() {
        return this.post('/next', {});
    }

    async _rawPrev() {
        return this.post('/prev', {});
    }

    // 公开 API 使用防抖版本（先到先得）
    async play(url, title, type = 'local', duration = 0) {
        return this._debouncedPlay(url, title, type, duration);
    }

    async pause() {
        return this._debouncedPause();
    }

    async next() {
        return this._debouncedNext();
    }

    async prev() {
        return this._debouncedPrev();
    }

    async setVolume(value) {
        const formData = new FormData();
        formData.append('value', value);
        return this.postForm('/volume', formData);
    }

    async seek(percent) {
        const formData = new FormData();
        formData.append('percent', percent);
        return this.postForm('/seek', formData);
    }

    async loop() {
        return this.post('/loop', {});
    }

    async shuffle() {
        return this.post('/shuffle', {});
    }

    async setPitch(semitones) {
        return this.post('/pitch', { semitones });
    }

    async getVolume() {
        return this.post('/volume', {});
    }

    // 播放列表 API
    async getPlaylist(playlistId = null) {
        const url = playlistId ? `/playlist?playlist_id=${encodeURIComponent(playlistId)}` : '/playlist';
        return this.get(url);
    }

    async getPlaylists() {
        return this.get('/playlists');
    }

    async createPlaylist(name) {
        return this.post('/playlists', { name });
    }

    async deletePlaylist(id) {
        return this.delete(`/playlists/${id}`);
    }

    async updatePlaylist(id, data) {
        return this.put(`/playlists/${id}`, data);
    }

    async switchPlaylist(id) {
        return this.post(`/playlists/${id}/switch`, {});
    }

    async removeFromPlaylist(index) {
        const formData = new FormData();
        formData.append('index', index);
        return this.postForm('/playlist_remove', formData);
    }

    async removeFromSpecificPlaylist(playlistId, index) {
        const formData = new FormData();
        formData.append('index', index);
        return this.postForm(`/playlists/${playlistId}/remove`, formData);
    }

    async reorderPlaylist(playlistId, fromIndex, toIndex) {
        return this.post('/playlist_reorder', {
            playlist_id: playlistId,
            from_index: fromIndex,
            to_index: toIndex
        });
    }

    async addSongToPlaylistTop(playlistId, song) {
        const formData = new FormData();
        formData.append('url', song.url || '');
        formData.append('title', song.title || '');
        formData.append('type', song.type || 'local');
        if (song.thumbnail_url) formData.append('thumbnail_url', song.thumbnail_url);
        return this.postForm(`/playlists/${playlistId}/add_next`, formData);
    }

    // ✅ 新增：添加歌曲到歌单（支持指定插入位置）
    async addToPlaylist(data) {
        return this.post('/playlist_add', data);
    }

    // 搜索 API
    async searchSong(query, maxResults = null) {
        const data = { query };
        if (maxResults !== null) {
            data.max_results = maxResults;
        }
        return this.post('/search_song', data);
    }

    async searchYoutube(query) {
        const formData = new FormData();
        formData.append('query', query);
        return this.postForm('/search_youtube', formData);
    }

    async getYoutubeSearchConfig() {
        return this.get('/youtube_search_config');
    }

    // 播放历史 API
    async addSongToHistory({ url, title, type = 'local', thumbnail_url = '' }) {
        const formData = new FormData();
        formData.append('url', url || '');
        formData.append('title', title || url || '');
        formData.append('type', type || 'local');
        if (thumbnail_url) formData.append('thumbnail_url', thumbnail_url);
        return this.postForm('/song_add_to_history', formData);
    }

    // ✅ 新增：获取已合并的播放历史（相同歌曲仅显示最后播放时间）
    async getPlaybackHistoryMerged() {
        return this.get('/playback_history_merged');
    }

    // 删除单条播放历史记录
    async deleteHistoryRecord(url) {
        return this.post('/playback_history_delete', { url });
    }

    // KTV功能：刷新视频URL（当视频直链过期时）
    async refreshVideoUrl() {
        return this.post('/refresh_video_url', {});
    }
}

// 导出单例
export const api = new MusicAPI();
