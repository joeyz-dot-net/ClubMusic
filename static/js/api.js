// API 调用封装模块
export class MusicAPI {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
    }

    async get(endpoint) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`);
            return await response.json();
        } catch (err) {
            console.warn(`[API] GET ${endpoint} failed:`, err);
            return {}; // 保证调用方不会得到 undefined 导致读取属性时报错
        }
    }

    async post(endpoint, data) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (err) {
            console.warn(`[API] POST ${endpoint} failed:`, err);
            return {};
        }
    }

    async postForm(endpoint, formData) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'POST',
                body: formData
            });
            return await response.json();
        } catch (err) {
            console.warn(`[API] POST-FORM ${endpoint} failed:`, err);
            return {};
        }
    }

    async delete(endpoint) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'DELETE'
            });
            return await response.json();
        } catch (err) {
            console.warn(`[API] DELETE ${endpoint} failed:`, err);
            return {};
        }
    }

    async put(endpoint, data) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
        } catch (err) {
            console.warn(`[API] PUT ${endpoint} failed:`, err);
            return {};
        }
    }

    // 播放器相关 API
    async getStatus() {
        return this.get('/status');
    }

    async play(url, title, type = 'local', duration = 0) {
        const formData = new FormData();
        formData.append('url', url);
        formData.append('title', title);
        formData.append('type', type);
        formData.append('duration', duration);
        
        return this.postForm('/play', formData);
    }

    async pause() {
        return this.post('/pause', {});
    }

    async next() {
        return this.post('/next', {});
    }

    async prev() {
        return this.post('/prev', {});
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

    // KTV功能：刷新视频URL（当视频直链过期时）
    async refreshVideoUrl() {
        const response = await fetch('/refresh_video_url', { method: 'POST' });
        return response.json();
    }
}

// 导出单例
export const api = new MusicAPI();
