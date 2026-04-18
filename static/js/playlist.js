// 播放列表管理模块
import { api } from './api.js?v=6';
import { Toast, loading, ConfirmModal } from './ui.js?v=3';
import { operationLock } from './operationLock.js?v=2';
import { thumbnailManager, escapeHTML, focusFirstFocusable, openOverlayActionMenu, restoreFocus, trapFocusInContainer } from './utils.js?v=2';
import { i18n } from './i18n.js?v=2';
import { player } from './player.js?v=27';
import { unavailableSongs } from './unavailable.js';
import { executePlayNow, rerenderQueueWithCurrentMeta } from './playNow.js?v=22';
import { getCurrentPlaybackStatus } from './playbackState.js?v=20';

export class PlaylistManager {
    constructor() {
        this.currentPlaylist = [];
        this.playlists = [];
        this.urlSet = new Set();
        this.currentPlaylistName = i18n.t('playlist.current'); // 添加歌单名称
        this.roomPlaylist = null;
        this._storageKeyCache = '';
        this._storageKeyContext = null;
        // ✅ 从 localStorage 恢复当前选择的歌单ID，默认为 'default'
        const storageKey = this._getStorageKey();
        const storedSelectedPlaylistId = this._readStoredSelectedPlaylistId(storageKey);
        this.selectedPlaylistId = this._loadSelectedPlaylistFromStorage(storageKey, storedSelectedPlaylistId);
        console.log('[PlaylistManager] ✓ 初始化完成，selectedPlaylistId:', this.selectedPlaylistId);
        console.log('[PlaylistManager] ℹ localStorage 中的完整值:', storedSelectedPlaylistId);
    }

    _getApiErrorMessage(result, fallbackMessage) {
        if (!result) {
            return fallbackMessage;
        }

        return result.error || result.message || result.detail || fallbackMessage;
    }

    _assertStatusOk(result, fallbackMessage) {
        if (!result || result._error || result.status !== 'OK') {
            throw new Error(this._getApiErrorMessage(result, fallbackMessage));
        }

        return result;
    }

    _assertPlaylistCreated(result, fallbackMessage) {
        if (!result || result._error || !result.id || !result.name) {
            throw new Error(this._getApiErrorMessage(result, fallbackMessage));
        }

        return result;
    }

    _hasRoomContext() {
        return Boolean(api.roomId);
    }

    _getRoomRuntimePlaylistId() {
        return api.roomId ? `room_${api.roomId}` : 'default';
    }

    _getStorageContextKey() {
        return api.roomId || '';
    }

    _getStorageKey() {
        const storageContextKey = this._getStorageContextKey();
        if (this._storageKeyContext !== storageContextKey) {
            this._storageKeyContext = storageContextKey;
            this._storageKeyCache = storageContextKey
                ? `selectedPlaylistId:${storageContextKey}`
                : 'selectedPlaylistId';
        }

        return this._storageKeyCache;
    }

    _getDefaultSelectedPlaylistId() {
        return this._hasRoomContext() ? this._getRoomRuntimePlaylistId() : 'default';
    }

    _readStoredSelectedPlaylistId(storageKey = this._getStorageKey()) {
        try {
            return localStorage.getItem(storageKey);
        } catch (e) {
            console.warn('[歌单管理] 读取 localStorage 失败:', e);
            return null;
        }
    }

    // ✅ 新增：从 localStorage 读取保存的歌单ID
    _loadSelectedPlaylistFromStorage(storageKey = this._getStorageKey(), saved = this._readStoredSelectedPlaylistId(storageKey)) {
        console.log('[PlaylistManager] localStorage中的值:', saved);
        if (saved && saved !== 'undefined' && saved !== '') {
            console.log('[歌单管理] 从本地存储恢复选择歌单:', saved);
            return saved;
        }

        const defaultPlaylistId = this._getDefaultSelectedPlaylistId();
        console.log('[歌单管理] 使用默认歌单:', defaultPlaylistId);
        return defaultPlaylistId;
    }

    // 加载当前播放队列（用户隔离：使用前端保存的 selectedPlaylistId）
    async loadCurrent() {
        // 使用前端独立维护的 selectedPlaylistId，每个浏览器独立
        const result = this._assertStatusOk(
            await api.getPlaylist(this.selectedPlaylistId),
            '加载播放列表失败（后端响应无效）'
        );

        if (Array.isArray(result.playlist)) {
            this.currentPlaylist = result.playlist;
            this.currentPlaylistName = result.playlist_name || i18n.t('playlist.current'); // 获取歌单名称
            // 如果返回的歌单ID与请求不同（例如歌单被删除），同步更新
            if (result.playlist_id && result.playlist_id !== this.selectedPlaylistId) {
                console.log('[歌单管理] 歌单已不存在，切换到:', result.playlist_id);
                this.setSelectedPlaylist(result.playlist_id);
            }
            this.updateUrlSet();
            return result;
        }
        throw new Error('加载播放列表失败');
    }

    // 加载所有歌单
    async loadAll() {
        const result = this._assertStatusOk(await api.getPlaylists(), '加载歌单列表失败');

        if (!Array.isArray(result.playlists)) {
            throw new Error('加载歌单列表失败（数据格式无效）');
        }

        this.playlists = result.playlists;
        this.roomPlaylist = this.playlists.find(p => p.is_room) || null;
        return this.playlists;
    }

    // 并行刷新当前播放列表和所有歌单
    async refreshAll() {
        await Promise.all([this.loadCurrent(), this.loadAll()]);
    }

    syncSelectedPlaylistFromCache() {
        const activeDefaultId = this.getActiveDefaultId();
        let targetPlaylist = this.playlists.find((playlist) => playlist.id === this.selectedPlaylistId);

        if (!targetPlaylist && this.selectedPlaylistId !== activeDefaultId) {
            this.setSelectedPlaylist(activeDefaultId);
            targetPlaylist = this.playlists.find((playlist) => playlist.id === activeDefaultId) || null;
        }

        const nextSongs = Array.isArray(targetPlaylist?.songs) ? [...targetPlaylist.songs] : [];
        this.currentPlaylist = nextSongs;
        this.currentPlaylistName = targetPlaylist?.name || i18n.t('playlist.current');
        this.updateUrlSet();

        return targetPlaylist;
    }

    replacePlaylistSongsInCache(playlistId, songs = []) {
        const nextSongs = Array.isArray(songs) ? songs : [];
        let nextPlaylistName = null;

        this.playlists = this.playlists.map((playlist) => {
            if (playlist.id !== playlistId) {
                return playlist;
            }

            nextPlaylistName = playlist.name || null;
            return {
                ...playlist,
                songs: [...nextSongs],
            };
        });

        this.roomPlaylist = this.playlists.find((playlist) => playlist.is_room) || null;

        if (this.selectedPlaylistId === playlistId) {
            this.currentPlaylist = [...nextSongs];
            if (nextPlaylistName) {
                this.currentPlaylistName = nextPlaylistName;
            }
            this.updateUrlSet();
        }
    }

    insertSongIntoPlaylistCache(playlistId, song, insertIndex = null) {
        const targetPlaylist = this.playlists.find((playlist) => playlist.id === playlistId);
        const baseSongs = Array.isArray(targetPlaylist?.songs)
            ? [...targetPlaylist.songs]
            : (this.selectedPlaylistId === playlistId ? [...this.currentPlaylist] : []);
        const nextSong = song ? { ...song } : song;
        const nextIndex = Number.isFinite(insertIndex)
            ? Math.max(0, Math.min(insertIndex, baseSongs.length))
            : baseSongs.length;

        baseSongs.splice(nextIndex, 0, nextSong);
        this.replacePlaylistSongsInCache(playlistId, baseSongs);
    }

    findSongIndexInCache(playlistId, url) {
        if (!url) {
            return -1;
        }

        const playlist = this.playlists.find((item) => item.id === playlistId);
        const songs = Array.isArray(playlist?.songs)
            ? playlist.songs
            : (this.selectedPlaylistId === playlistId ? this.currentPlaylist : []);

        return songs.findIndex((song) => song?.url === url);
    }

    async ensureSongAtTop(playlistId, url) {
        let songIndex = this.findSongIndexInCache(playlistId, url);

        if (songIndex < 0) {
            await this.loadAll();
            songIndex = this.findSongIndexInCache(playlistId, url);
        }

        if (songIndex < 0) {
            throw new Error('未能在队列中找到已存在的歌曲');
        }

        if (songIndex === 0) {
            return { moved: false, index: 0 };
        }

        this._assertStatusOk(
            await api.reorderPlaylist(playlistId, songIndex, 0),
            '移动歌曲到队列顶部失败'
        );

        const playlist = this.playlists.find((item) => item.id === playlistId);
        const songs = Array.isArray(playlist?.songs)
            ? [...playlist.songs]
            : (this.selectedPlaylistId === playlistId ? [...this.currentPlaylist] : []);
        const [song] = songs.splice(songIndex, 1);

        if (!song) {
            throw new Error('移动歌曲到队列顶部失败');
        }

        songs.unshift(song);
        this.replacePlaylistSongsInCache(playlistId, songs);

        return { moved: true, index: 0 };
    }

    // 创建新歌单
    async create(name) {
        const result = this._assertPlaylistCreated(await api.createPlaylist(name), '创建歌单失败');
        const newPlaylist = {
            id: result.id,
            name: result.name,
            songs: Array.isArray(result.songs) ? result.songs : []
        };

        if (!this.playlists.some((playlist) => playlist.id === newPlaylist.id)) {
            this.playlists.push(newPlaylist);
        }

        try {
            await this.loadAll(); // 重新加载
        } catch (error) {
            result.refreshError = error;
            console.warn('[歌单管理] 创建后刷新歌单列表失败:', error);
        }

        return result;
    }

    // 删除歌单
    async delete(id) {
        const result = this._assertStatusOk(await api.deletePlaylist(id), '删除歌单失败');
        this.playlists = this.playlists.filter((playlist) => playlist.id !== id);
        // ✅ 如果删除的是当前选择的歌单，重置为播放队列
        if (this.selectedPlaylistId === id) {
            console.log('[歌单管理] 被删除的歌单是当前选择，重置为播放队列');
            this.setSelectedPlaylist(this.getActiveDefaultId());
        }

        try {
            await this.loadAll(); // 重新加载
        } catch (error) {
            result.refreshError = error;
            console.warn('[歌单管理] 删除后刷新歌单列表失败:', error);
        }

        return result;
    }

    // 更新歌单
    async update(id, data) {
        const result = this._assertStatusOk(await api.updatePlaylist(id, data), '更新歌单失败');
        const nextName = data?.name;
        if (nextName) {
            this.playlists = this.playlists.map((playlist) => {
                if (playlist.id !== id) {
                    return playlist;
                }

                return {
                    ...playlist,
                    name: nextName
                };
            });

            if (this.selectedPlaylistId === id) {
                this.currentPlaylistName = nextName;
            }
        }

        try {
            await this.loadAll(); // 重新加载
        } catch (error) {
            result.refreshError = error;
            console.warn('[歌单管理] 更新后刷新歌单列表失败:', error);
        }

        return result;
    }

    // 切换歌单（用户隔离：只验证后端歌单存在，不修改后端全局状态）
    async switch(id) {
        const previousPlaylistId = this.selectedPlaylistId;
        const result = this._assertStatusOk(await api.switchPlaylist(id), '切换歌单失败');

        this.setSelectedPlaylist(id);

        try {
            await this.loadCurrent(); // 重新加载当前队列
            return result;
        } catch (error) {
            this.setSelectedPlaylist(previousPlaylistId);

            try {
                await this.loadCurrent();
            } catch (rollbackError) {
                console.warn('[歌单管理] 回滚歌单选择失败:', rollbackError);
            }

            throw error;
        }
    }

    async addSong(playlistId, song, insertIndex = null) {
        const result = await api.addToPlaylist({
            playlist_id: playlistId,
            song,
            insert_index: insertIndex
        });

        if (result?.duplicate) {
            return result;
        }

        return this._assertStatusOk(result, '添加到歌单失败');
    }

    // ✅ 新增：设置当前选择的歌单（并保存到 localStorage）
    setSelectedPlaylist(playlistId) {
        const normalizedPlaylistId = playlistId || this.getActiveDefaultId();
        this.selectedPlaylistId = normalizedPlaylistId;
        try {
            localStorage.setItem(this._getStorageKey(), normalizedPlaylistId);
            console.log('[歌单管理] 设置当前选择歌单:', normalizedPlaylistId);
        } catch (e) {
            console.warn('[歌单管理] 保存到 localStorage 失败:', e);
        }
        return this.selectedPlaylistId;
    }

    // ✅ 新增：获取当前选择的歌单ID
    getSelectedPlaylistId() {
        return this.selectedPlaylistId;
    }

    // 从当前播放列表删除指定索引的歌曲
    async removeAt(index) {
        // 索引验证
        if (typeof index !== 'number' || index < 0) {
            throw new Error(`无效的索引: ${index}`);
        }
        
        // 检查当前播放列表长度
        if (!this.currentPlaylist || index >= this.currentPlaylist.length) {
            throw new Error(`索引超出范围: ${index} >= ${this.currentPlaylist?.length || 0}`);
        }
        
        const songTitle = this.currentPlaylist[index]?.title || '未知歌曲';
        console.log(`[删除歌曲] 歌单: ${this.selectedPlaylistId}, 索引: ${index}, 歌曲: ${songTitle}`);
        
        // 根据当前选择的歌单使用不同的API
        let result;
        try {
            const isDefaultPlaylist = this.selectedPlaylistId === this.getActiveDefaultId();

            if (isDefaultPlaylist) {
                // 默认歌单使用旧的API (针对当前播放的歌单)
                result = await api.removeFromPlaylist(index);
            } else {
                // 非默认歌单使用新的API (针对特定歌单)
                result = await api.removeFromSpecificPlaylist(this.selectedPlaylistId, index);
            }
            
            if (result.status === 'OK') {
                console.log(`[删除成功] ${songTitle} 已从歌单删除`);
                if (isDefaultPlaylist) {
                    await this.loadCurrent();
                } else {
                    const nextSongs = this.currentPlaylist.filter((_, currentIndex) => currentIndex !== index);
                    this.replacePlaylistSongsInCache(this.selectedPlaylistId, nextSongs);
                }
            } else {
                throw new Error(result.error || result.message || '删除操作失败');
            }
            
            return result;
        } catch (error) {
            console.error(`[删除失败] 歌单: ${this.selectedPlaylistId}, 索引: ${index}`, error);
            throw error;
        }
    }

    // 调整当前播放列表顺序
    async reorder(fromIndex, toIndex) {
        const result = this._assertStatusOk(
            await api.reorderPlaylist(this.selectedPlaylistId, fromIndex, toIndex),
            '调整歌单顺序失败'
        );

        // 后端已更新，重新加载以保持一致
        await this.loadCurrent();

        return result;
    }

    // 检查URL是否已存在
    hasUrl(url) {
        return this.urlSet.has(url);
    }

    // 更新URL集合
    updateUrlSet() {
        this.urlSet.clear();
        this.currentPlaylist.forEach(song => {
            if (song.url) {
                this.urlSet.add(song.url);
            }
        });
    }

    // 获取当前播放列表
    getCurrent() {
        return this.currentPlaylist;
    }

    // 获取当前歌单名称
    getCurrentName() {
        return this.currentPlaylistName;
    }

    // 获取当前上下文的"播放队列"歌单ID
    // 房间上下文返回房间歌单ID，否则返回 'default'
    getActiveDefaultId() {
        if (this.roomPlaylist) {
            return this.roomPlaylist.id;
        }
        return this._getDefaultSelectedPlaylistId();
    }

    // 获取当前歌单图标
    getCurrentPlaylistIcon() {
        const selectedId = this.selectedPlaylistId;

        // 默认歌单（或房间歌单作为播放队列）使用星星图标
        if (selectedId === this.getActiveDefaultId()) {
            return '⭐';
        }

        // 房间歌单使用独立图标
        if (selectedId.startsWith('room_')) {
            return '🎤';
        }

        // 查找当前歌单在列表中的索引
        const index = this.playlists.findIndex(p => p.id === selectedId);

        // 如果未找到，返回默认图标
        if (index === -1) {
            return '📋';
        }

        // 使用与 playlists-management.js 相同的图标数组
        const icons = ['🎵', '🎧', '🎸', '🎹', '🎤', '🎼', '🎺', '🥁'];
        return icons[index % icons.length];
    }

    // 获取所有歌单
    getAll() {
        return this.playlists;
    }
}

// 导出单例
export const playlistManager = new PlaylistManager();

// ✅ 点击歌曲：移动到队列顶部并播放
async function moveToTopAndPlay(song, currentIndex, onPlay, rerenderArgs) {
    try {
        const selectedPlaylistId = playlistManager.getSelectedPlaylistId();
        
        console.log('[播放列表] 点击歌曲，移动到顶部并播放:', {
            title: song.title,
            currentIndex: currentIndex,
            selectedPlaylistId: selectedPlaylistId
        });
        
        // 如果不是第一首，先移动到顶部
        if (currentIndex > 0) {
            const result = await api.reorderPlaylist(selectedPlaylistId, currentIndex, 0);
            if (result.status !== 'OK') {
                console.error('[播放列表] 移动失败:', result);
                Toast.error(i18n.t('playlist.opFailed'));
                return;
            }
            console.log('[播放列表] ✓ 已移动到队列顶部');
        }
        
        // 仅当前歌单顺序变化，无需刷新全部歌单元数据
        await playlistManager.loadCurrent();
        
        // 播放歌曲（现在已经在索引0）
        if (onPlay) {
            await onPlay(song);
            return;
        }

        if (rerenderArgs) {
            renderPlaylistUI({ ...rerenderArgs, currentMeta: song });
        }

    } catch (error) {
        console.error('[播放列表] 操作失败:', error);
        Toast.error('操作失败: ' + error.message);
    }
}

// ✅ 新增：批量添加歌单中的所有歌曲到默认歌单
async function addAllSongsToDefault(playlist, selectedPlaylistId) {
    if (!playlist || playlist.length === 0) {
        Toast.error('❌ 歌单为空，无法添加');
        return;
    }
    
    if (selectedPlaylistId === playlistManager.getActiveDefaultId()) {
        Toast.error('❌ 当前已是默认歌单');
        return;
    }
    
    try {
        loading.show(i18n.t('playlist.addingAll', { count: playlist.length }));
        
        // 获取默认歌单以检查重复
        const defaultPlaylist = playlistManager.playlists.find(p => p.id === playlistManager.getActiveDefaultId());
        if (!defaultPlaylist) {
            Toast.error('❌ 默认歌单不存在');
            loading.hide();
            return;
        }
        
        const existingUrls = new Set(defaultPlaylist.songs.map(s => s.url));
        let addedCount = 0;
        let skippedCount = 0;
        const failedSongs = [];
        
        // ✅ 获取后端当前播放位置，确保与 PLAYER.current_index 同步
        let insertIndex = 1;  // 🔧 默认插入位置改为 1（第一首之后，而不是顶部）
        try {
            const status = await api.getStatus();
            if (status?._error) {
                throw new Error(status.error || status.message || 'status unavailable');
            }
            const currentIndex = status?.current_index ?? -1;
            insertIndex = Math.max(1, currentIndex + 1);  // 最小插入位置是 1
            console.log('[批量添加] 从后端获取当前播放索引:', {currentIndex, insertIndex});
        } catch (err) {
            console.warn('[批量添加] 无法获取后端状态，使用默认值 1:', err);
            // 回退：如果无法获取后端状态，使用歌单数据中的索引
            const defaultCurrentIndex = defaultPlaylist.current_playing_index ?? -1;
            insertIndex = Math.max(1, defaultCurrentIndex + 1);  // 最小插入位置是 1
            console.log('[批量添加] 使用歌单数据中的索引:', insertIndex);
        }
        
        console.log('[批量添加] 开始添加歌曲:', {
            totalCount: playlist.length,
            selectedPlaylistId: selectedPlaylistId,
            insertBaseIndex: insertIndex,
            existingCount: existingUrls.size
        });
        
        // 逐首歌曲添加到默认歌单
        for (let i = 0; i < playlist.length; i++) {
            const song = playlist[i];
            
            try {
                // 检查歌曲是否已存在于默认歌单
                if (existingUrls.has(song.url)) {
                    console.log(`[批量添加] 歌曲已存在，跳过: ${song.title}`);
                    skippedCount++;
                    continue;
                }
                
                // 调用 API 添加到默认歌单
                const result = await playlistManager.addSong(
                    playlistManager.getActiveDefaultId(),
                    song,
                    insertIndex + addedCount  // 按顺序插入
                );
                
                if (result.status === 'OK') {
                    console.log(`[批量添加] [${addedCount + 1}/${playlist.length}] ✓ ${song.title}`);
                    addedCount++;
                    existingUrls.add(song.url);  // 标记为已添加
                    
                    // 更新UI提示进度
                    const progress = Math.round((addedCount + skippedCount) / playlist.length * 100);
                    loading.show(i18n.t('playlist.addProgress', { done: addedCount, total: playlist.length - skippedCount, pct: progress }));
                } else {
                    console.error(`[批量添加] ✗ 添加失败: ${song.title}`, result.error);
                    failedSongs.push(song.title);
                }
            } catch (error) {
                console.error(`[批量添加] ✗ 添加异常: ${song.title}`, error);
                failedSongs.push(song.title);
            }
            
            // 避免请求过于频繁，每添加一首稍作延迟
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // 当前查看的是非默认歌单，这里只需刷新歌单元数据（数量/列表）
        loading.hide();
        await playlistManager.loadAll();
        
        // 显示完成结果
        console.log('[批量添加] 完成:', {
            addedCount: addedCount,
            skippedCount: skippedCount,
            failedCount: failedSongs.length
        });
        
        // 构建结果消息
        let message = i18n.t('playlist.addSuccess', { count: addedCount });
        if (skippedCount > 0) {
            message += i18n.t('playlist.addSkipped', { count: skippedCount });
        }
        if (failedSongs.length > 0) {
            message += i18n.t('playlist.addFailed', { count: failedSongs.length });
        }
        
        Toast.success(message);
        
        // 如果有失败的歌曲，显示详情
        if (failedSongs.length > 0) {
            console.warn('[批量添加] 失败的歌曲:', failedSongs.slice(0, 5).join(', '));
        }
        
    } catch (error) {
        console.error('[批量添加] 操作异常:', error);
        Toast.error('❌ 操作失败: ' + error.message);
        loading.hide();
    }
}

// ✅ 新增：从当前选择歌单点击歌曲播放
export async function playSongFromSelectedPlaylist(song, onPlay) {
    try {
        const selectedPlaylistId = playlistManager.getSelectedPlaylistId();
        
        console.log('[播放列表] 从当前选择歌单点击歌曲:', {
            title: song.title,
            url: song.url,
            selectedPlaylistId: selectedPlaylistId
        });
        
        // ✅ 情况 A: 当前选择 === 播放队列 → 直接播放
        if (selectedPlaylistId === playlistManager.getActiveDefaultId()) {
            console.log('[播放列表] ✓ 当前选择是播放队列，直接播放');
            if (onPlay) {
                onPlay(song);
            }
        } else {
            // ✅ 情况 B: 当前选择 ≠ 播放队列 → 仅添加到播放队列下一曲位置，不播放
            console.log('[播放列表] ⚠️ 当前选择不是播放队列，添加到队列但不播放');

            // 获取播放队列歌单
            const defaultPlaylist = playlistManager.playlists.find(p => p.id === playlistManager.getActiveDefaultId());
            if (!defaultPlaylist) {
                Toast.error('❌ 播放队列不存在');
                return;
            }
            
            // 检查歌曲是否已在默认歌单
            const songExists = defaultPlaylist.songs.some(s => s.url === song.url);
            
            if (!songExists) {
                console.log('[播放列表] 歌曲不在默认歌单，添加到下一曲位置');
                
                // ✅ 从后端获取当前播放索引，确保与 PLAYER.current_index 同步
                let insertIndex = 1;  // 🔧 默认插入位置改为 1（第一首之后，而不是顶部）
                try {
                    const status = await api.getStatus();
                    if (status?._error) {
                        throw new Error(status.error || status.message || 'status unavailable');
                    }
                    const currentIndex = status?.current_index ?? -1;
                    insertIndex = Math.max(1, currentIndex + 1);  // 最小插入位置是 1
                    console.log('[播放列表] 从后端获取当前播放索引:', { currentIndex, insertIndex });
                } catch (err) {
                    console.warn('[播放列表] 无法获取后端状态，使用默认值 1:', err);
                    // 回退：如果无法获取后端状态，使用歌单数据中的索引
                    const currentIndex = defaultPlaylist.current_playing_index ?? -1;
                    insertIndex = Math.max(1, currentIndex + 1);  // 最小插入位置是 1
                    console.log('[播放列表] 使用歌单数据中的索引:', insertIndex);
                }
                
                // 调用 API 添加到默认歌单
                const result = await playlistManager.addSong(
                    playlistManager.getActiveDefaultId(),
                    song,
                    insertIndex
                );

                if (result?.duplicate) {
                    console.log('[播放列表] 歌曲已在默认歌单，跳过添加');
                    return;
                }
                
                console.log('[播放列表] ✓ 已添加到默认歌单下一曲位置');
            } else {
                console.log('[播放列表] 歌曲已在默认歌单，跳过添加');
            }
            
            // 通知用户，但不播放（显示完整的歌单名称）
            Toast.success(i18n.t('playlist.addToQueue', { title: song.title }));
            console.log('[播放列表] ⚠️ 歌曲已添加，但未播放（非默认歌单）');
        }
        
    } catch (error) {
        console.error('[播放列表] 播放错误:', error);
        Toast.error('操作失败: ' + error.message);
    }
}

// 获取当前应用的主题（深色/浅色）
function getCurrentAppTheme() {
    const theme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'dark';
    return theme;
}

// 根据应用主题返回对应颜色
function getThemeColors(theme) {
    if (theme === 'light') {
        return {
            bgGradient: 'linear-gradient(135deg, #f5f7ff 0%, #e8eaff 100%)',
            textColor: '#1a1a2e',
            secondaryText: 'rgba(26, 26, 46, 0.7)',
            buttonBg: 'rgba(102, 126, 234, 0.15)',
            buttonBorder: 'rgba(102, 126, 234, 0.4)',
            buttonHover: 'rgba(102, 126, 234, 0.25)',
            buttonText: '#2c2d57',
            shadow: 'rgba(102, 126, 234, 0.2)'
        };
    } else {
        // dark theme
        return {
            bgGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            textColor: '#ffffff',
            secondaryText: 'rgba(255, 255, 255, 0.75)',
            buttonBg: 'rgba(255, 255, 255, 0.15)',
            buttonBorder: 'rgba(255, 255, 255, 0.4)',
            buttonHover: 'rgba(255, 255, 255, 0.25)',
            buttonText: '#ffffff',
            shadow: 'rgba(0, 0, 0, 0.3)'
        };
    }
}

function createToolbarHeaderContainer(appTheme, colors) {
    const headerContainer = document.createElement('div');
    headerContainer.className = 'playlist-toolbar-header';
    const isLightTheme = appTheme === 'light';
    const headerBg = isLightTheme
        ? 'rgba(255, 255, 255, 0.7)'
        : 'rgba(26, 26, 26, 0.6)';
    const headerBorder = isLightTheme
        ? 'rgba(224, 224, 224, 0.5)'
        : 'rgba(51, 51, 51, 0.5)';

    headerContainer.style.setProperty('--playlist-toolbar-header-bg', headerBg);
    headerContainer.style.setProperty('--playlist-toolbar-header-border', headerBorder);
    headerContainer.style.setProperty('--playlist-toolbar-header-shadow', colors.shadow);

    return headerContainer;
}

function createToolbarInfoSection(playlistName, playlistLength, colors) {
    const infoSection = document.createElement('div');
    infoSection.className = 'playlist-toolbar-info';

    const playlistTitle = document.createElement('div');
    playlistTitle.className = 'playlist-toolbar-title';
    playlistTitle.style.setProperty('--playlist-toolbar-title-color', colors.textColor);
    playlistTitle.textContent = playlistName;

    const songCount = document.createElement('div');
    songCount.className = 'playlist-toolbar-count';
    songCount.style.setProperty('--playlist-toolbar-count-color', colors.secondaryText);
    songCount.textContent = i18n.t('playlist.songCount', { count: playlistLength });

    infoSection.appendChild(playlistTitle);
    infoSection.appendChild(songCount);
    return infoSection;
}

function createToolbarLeadSection(icon, infoSection) {
    const iconEl = document.createElement('div');
    iconEl.className = 'playlist-toolbar-icon';
    iconEl.textContent = icon;

    const leadSection = document.createElement('div');
    leadSection.className = 'playlist-toolbar-lead';
    leadSection.appendChild(iconEl);
    leadSection.appendChild(infoSection);
    leadSection.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('open-playlists-modal'));
    });

    return leadSection;
}

function createToolbarActionButton({
    content,
    title,
    fontSize = '18px',
    skin,
    onClick
}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('playlist-toolbar-action-btn');
    button.style.setProperty('--playlist-toolbar-action-font-size', fontSize);
    applyToolbarButtonSkin(button, skin);
    if (content instanceof Node) {
        button.replaceChildren(content);
    } else {
        button.textContent = content;
    }
    button.title = title;
    bindGuardedActionClick(button, onClick);
    return button;
}

function bindGuardedActionClick(button, onClick) {
    button.addEventListener('click', async (event) => {
        if (button._actionInFlight) {
            return;
        }

        button._actionInFlight = true;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');

        try {
            await onClick?.(event);
        } finally {
            button._actionInFlight = false;
            if (button.isConnected) {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        }
    });
}

// 播放列表顶部工具栏渲染（独立于列表容器，支持 sticky 定位）
export function renderPlaylistToolbar({ toolbarContainer, playlist, playlistName, selectedPlaylistId, container, onPlay, currentMeta }) {
    if (!toolbarContainer) return;
    toolbarContainer.replaceChildren();

    const appTheme = getCurrentAppTheme();
    const colors = getThemeColors(appTheme);
    const isDefaultPlaylist = selectedPlaylistId === playlistManager.getActiveDefaultId();
    const headerContainer = createToolbarHeaderContainer(appTheme, colors);
    const infoSection = createToolbarInfoSection(playlistName, playlist.length, colors);

    headerContainer.appendChild(createToolbarLeadSection(playlistManager.getCurrentPlaylistIcon(), infoSection));

    if (isDefaultPlaylist) {
        const clearBtn = createToolbarActionButton({
            content: '🗑️',
            title: i18n.t('playlist.clearQueue'),
            skin: {
                background: colors.buttonBg,
                border: colors.buttonBorder,
                color: colors.buttonText,
                hoverBackground: colors.buttonHover,
                shadow: `0 4px 12px ${colors.shadow}`,
                hoverTransform: 'scale(1.1)'
            },
            onClick: async (e) => {
                e.stopPropagation();
                const confirmed = await ConfirmModal.show({ title: i18n.t('playlist.clearQueueConfirm'), type: 'danger' });
                if (confirmed) {
                    try {
                        const response = await api.clearQueue();
                        if (response?._error || response?.status !== 'OK') {
                            throw new Error(response?.error || response?.message || i18n.t('playlist.clearFailed'));
                        }
                        try {
                            await playlistManager.loadCurrent();
                            renderPlaylistUI({ container, onPlay, currentMeta });
                            Toast.success(i18n.t('playlist.clearSucceed'));
                        } catch (refreshError) {
                            console.warn('[歌单] 队列已清空，但刷新失败:', refreshError);
                            Toast.warning(`${i18n.t('playlist.clearSucceed')} (${i18n.t('playlist.opFailed')})`);
                        }
                    } catch (err) {
                        console.error('清空队列失败:', err);
                        Toast.error(i18n.t('playlist.clearFailed') + ': ' + (err.message || err));
                    }
                }
            }
        });

        headerContainer.appendChild(clearBtn);
        toolbarContainer.appendChild(headerContainer);
        return;
    }

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'playlist-toolbar-actions';

    const returnBtn = createToolbarActionButton({
        content: '←',
        title: i18n.t('playlist.returnToQueue'),
        fontSize: '20px',
        skin: {
            background: colors.buttonBg,
            border: colors.buttonBorder,
            color: colors.buttonText,
            hoverBackground: colors.buttonHover,
            shadow: `0 4px 12px ${colors.shadow}`,
            hoverTransform: 'scale(1.1) translateX(-2px)'
        },
        onClick: async (e) => {
            e.stopPropagation();
            try {
                await playlistManager.switch(playlistManager.getActiveDefaultId());
                renderPlaylistUI({ container, onPlay, currentMeta });
                console.log('[歌单切换] 已返回默认歌单（队列）');
                Toast.success(i18n.t('playlist.returnedToQueue'));
            } catch (error) {
                console.error('[歌单切换] 返回队列失败:', error);
                Toast.error(i18n.t('player.switchFailed') + ': ' + (error.message || error));
            }
        }
    });

    const addAllBtn = createToolbarActionButton({
        content: '➕',
        title: i18n.t('playlist.addAll'),
        fontSize: '20px',
        skin: {
            background: colors.buttonBg,
            border: colors.buttonBorder,
            color: colors.buttonText,
            hoverBackground: colors.buttonHover,
            shadow: `0 4px 12px ${colors.shadow}`,
            hoverTransform: 'scale(1.1) rotate(90deg)'
        },
        onClick: async (e) => {
            e.stopPropagation();
            await addAllSongsToDefault(playlist, selectedPlaylistId);
        }
    });

    buttonGroup.appendChild(returnBtn);
    buttonGroup.appendChild(addAllBtn);

    if (!selectedPlaylistId.startsWith('room_')) {
        const clearBtn = createToolbarActionButton({
            content: '🗑️',
            title: i18n.t('playlist.clearPlaylist'),
            skin: {
                background: colors.buttonBg,
                border: colors.buttonBorder,
                color: colors.buttonText,
                hoverBackground: colors.buttonHover,
                hoverTransform: 'translateY(-1px)'
            },
            onClick: async (e) => {
                e.stopPropagation();
                const confirmed = await ConfirmModal.show({ title: i18n.t('playlist.clearPlaylistConfirm', { name: playlistName }), type: 'danger' });
                if (confirmed) {
                    try {
                        const response = await api.clearPlaylist(selectedPlaylistId);
                        if (response?._error || response?.status !== 'OK') {
                            throw new Error(response?.error || response?.message || i18n.t('playlist.clearFailed'));
                        }
                        try {
                            playlistManager.replacePlaylistSongsInCache(selectedPlaylistId, []);
                            renderPlaylistUI({ container, onPlay, currentMeta });
                            Toast.success(i18n.t('playlist.clearPlaylistSucceed', { name: playlistName }));
                        } catch (refreshError) {
                            console.warn('[歌单] 歌单已清空，但刷新失败:', refreshError);
                            Toast.warning(`${i18n.t('playlist.clearPlaylistSucceed', { name: playlistName })} (${i18n.t('playlist.opFailed')})`);
                        }
                    } catch (err) {
                        console.error('清空歌单失败:', err);
                        Toast.error(i18n.t('playlist.clearFailed') + ': ' + (err.message || err));
                    }
                }
            }
        });

        buttonGroup.appendChild(clearBtn);
    }

    headerContainer.appendChild(buttonGroup);
    toolbarContainer.appendChild(headerContainer);
}

function getRenderedPlaylistState() {
    const selectedPlaylistId = playlistManager.getSelectedPlaylistId();
    let playlist = [];
    let playlistName = i18n.t('playlist.current');

    if (selectedPlaylistId === playlistManager.getActiveDefaultId()) {
        playlist = playlistManager.getCurrent();
        playlistName = playlistManager.getCurrentName();
    } else {
        const selectedPlaylist = playlistManager.playlists.find((playlistItem) => playlistItem.id === selectedPlaylistId);
        if (selectedPlaylist) {
            playlist = selectedPlaylist.songs || [];
            playlistName = selectedPlaylist.name || i18n.t('playlist.unnamed');
        } else {
            console.warn('[渲染列表] 找不到歌单:', selectedPlaylistId, '，回退到默认歌单');
            playlist = playlistManager.getCurrent();
            playlistName = playlistManager.getCurrentName();
        }
    }

    return { selectedPlaylistId, playlist, playlistName };
}

function getPlaylistToolbarContainer(container) {
    const cachedToolbar = container?._playlistToolbarContainer;
    if (cachedToolbar?.isConnected) {
        return cachedToolbar;
    }

    const toolbarContainer = document.getElementById('playlistToolbar');
    if (container) {
        container._playlistToolbarContainer = toolbarContainer || null;
    }

    return toolbarContainer;
}

const playlistDomCache = {
    playListContainer: null,
    historyModal: null,
    historyList: null,
    historyContent: null,
    historyCloseBtn: null,
    selectPlaylistModal: null,
    selectPlaylistModalBody: null,
    selectPlaylistCloseBtn: null,
    selectPlaylistCancelBtn: null,
};

function getCachedPlaylistElement(cacheKey, resolver) {
    const cachedElement = playlistDomCache[cacheKey];
    if (cachedElement?.isConnected) {
        return cachedElement;
    }

    const element = resolver();
    playlistDomCache[cacheKey] = element || null;
    return playlistDomCache[cacheKey];
}

function getPlaylistContainerElement() {
    return getCachedPlaylistElement('playListContainer', () => document.getElementById('playListContainer'));
}

function getHistoryModalRefs() {
    const historyModal = getCachedPlaylistElement('historyModal', () => document.getElementById('historyModal'));
    const historyList = getCachedPlaylistElement('historyList', () => document.getElementById('historyList'));
    const historyContent = historyModal
        ? getCachedPlaylistElement('historyContent', () => historyModal.querySelector('.history-modal-content'))
        : null;
    const historyCloseBtn = historyModal
        ? getCachedPlaylistElement('historyCloseBtn', () => (
            historyModal.querySelector('.history-modal-close')
            || historyModal.querySelector('.modal-close-btn')
            || historyModal.querySelector('[data-close]')
            || historyModal.querySelector('[data-icon]')
        ))
        : null;

    return {
        historyModal,
        historyList,
        historyContent,
        historyCloseBtn,
    };
}

function getSelectPlaylistModalRefs() {
    const selectPlaylistModal = getCachedPlaylistElement('selectPlaylistModal', () => document.getElementById('selectPlaylistModal'));
    const selectPlaylistModalBody = getCachedPlaylistElement('selectPlaylistModalBody', () => document.getElementById('selectPlaylistModalBody'));
    const selectPlaylistCloseBtn = getCachedPlaylistElement('selectPlaylistCloseBtn', () => document.getElementById('selectPlaylistCloseBtn'));
    const selectPlaylistCancelBtn = getCachedPlaylistElement('selectPlaylistCancelBtn', () => document.getElementById('selectPlaylistCancelBtn'));

    return {
        selectPlaylistModal,
        selectPlaylistModalBody,
        selectPlaylistCloseBtn,
        selectPlaylistCancelBtn,
    };
}

function setElementAttribute(element, name, value) {
    if (!element) {
        return;
    }

    const nextValue = String(value);
    if (element.getAttribute(name) !== nextValue) {
        element.setAttribute(name, nextValue);
    }
}

function setElementStyle(styleTarget, property, value) {
    if (!styleTarget || styleTarget[property] === value) {
        return;
    }

    styleTarget[property] = value;
}

function setElementClassState(element, className, enabled) {
    if (!element) {
        return;
    }

    const hasClass = element.classList.contains(className);
    if (enabled && !hasClass) {
        element.classList.add(className);
    } else if (!enabled && hasClass) {
        element.classList.remove(className);
    }
}

function applyToolbarButtonSkin(button, {
    background,
    border,
    color,
    hoverBackground,
    shadow = 'none',
    hoverTransform = 'scale(1.05)',
    activeTransform = 'scale(0.96)'
} = {}) {
    button.classList.add('playlist-toolbar-btn');
    button.style.setProperty('--toolbar-btn-bg', background);
    button.style.setProperty('--toolbar-btn-border', border);
    button.style.setProperty('--toolbar-btn-color', color);
    button.style.setProperty('--toolbar-btn-hover-bg', hoverBackground || background);
    button.style.setProperty('--toolbar-btn-hover-shadow', shadow);
    button.style.setProperty('--toolbar-btn-hover-transform', hoverTransform);
    button.style.setProperty('--toolbar-btn-active-transform', activeTransform);
}

function applyEmptyActionButtonSkin(button, {
    background,
    color,
    shadow,
    hoverShadow,
    hoverTransform = 'translateY(-2px)',
    activeTransform = 'translateY(0) scale(0.98)'
} = {}) {
    button.classList.add('playlist-empty-action-btn');
    button.style.setProperty('--empty-action-bg', background);
    button.style.setProperty('--empty-action-color', color);
    button.style.setProperty('--empty-action-shadow', shadow);
    button.style.setProperty('--empty-action-hover-shadow', hoverShadow || shadow);
    button.style.setProperty('--empty-action-hover-transform', hoverTransform);
    button.style.setProperty('--empty-action-active-transform', activeTransform);
}

function createEmptyActionButton({
    content,
    title,
    background,
    shadow,
    hoverShadow,
    onClick
}) {
    const button = document.createElement('button');
    button.type = 'button';
    applyEmptyActionButtonSkin(button, {
        background,
        color: 'white',
        shadow,
        hoverShadow
    });
    if (content instanceof Node) {
        button.replaceChildren(content);
    } else {
        button.textContent = content;
    }
    button.title = title;
    bindGuardedActionClick(button, onClick);
    return button;
}

function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });
    return element;
}

function createTrackControlIcon({ width, height, viewBox, circles }) {
    const icon = createSvgElement('svg', {
        width: String(width),
        height: String(height),
        viewBox,
        fill: 'currentColor'
    });

    circles.forEach(({ cx, cy, r }) => {
        icon.appendChild(createSvgElement('circle', {
            cx: String(cx),
            cy: String(cy),
            r: String(r)
        }));
    });

    return icon;
}

const PLAYLIST_OPTION_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
];

const PLAYLIST_OPTION_ICONS = ['🎵', '🎧', '🎸', '🎹', '🎤', '🎼', '🎺', '🥁'];
const HISTORY_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

function createCenteredGlyph(glyph = '🎵') {
    const element = document.createElement('div');
    element.className = 'playlist-centered-glyph';
    element.textContent = glyph;
    return element;
}

function formatHistoryTimestamp(timestamp) {
    const adjustedTimestamp = (Number(timestamp) + player.clockOffset) * 1000;
    return HISTORY_DATE_FORMATTER.format(new Date(adjustedTimestamp));
}

function createPrimarySecondaryInfo({ title, subtitle, colors, titleWeight = 600, titleSize = '14px', subtitleSize = '12px', applyThemeVars = true }) {
    const info = document.createElement('div');
    info.className = 'playlist-item-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'playlist-item-title';
    if (applyThemeVars && colors) {
        titleEl.style.setProperty('--playlist-item-title-color', colors.textColor);
        titleEl.style.setProperty('--playlist-item-title-weight', titleWeight);
        titleEl.style.setProperty('--playlist-item-title-size', titleSize);
    }
    titleEl.textContent = title;

    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'playlist-item-subtitle';
    if (applyThemeVars && colors) {
        subtitleEl.style.setProperty('--playlist-item-subtitle-color', colors.secondaryText);
        subtitleEl.style.setProperty('--playlist-item-subtitle-size', subtitleSize);
    }
    subtitleEl.textContent = subtitle;

    info.appendChild(titleEl);
    info.appendChild(subtitleEl);
    return info;
}

function getThumbnailFallbacks(url) {
    if (url && url.includes('img.youtube.com/vi/')) {
        const baseUrl = url.substring(0, url.lastIndexOf('/'));
        const normalizedFirst = (url.endsWith('/sddefault.jpg') || url.endsWith('/maxresdefault.jpg'))
            ? baseUrl + '/hqdefault.jpg'
            : url;
        return [normalizedFirst, baseUrl + '/mqdefault.jpg', baseUrl + '/default.jpg'];
    }
    return [url];
}

function createHistoryCover(thumbnailUrl, colors) {
    const coverContainer = document.createElement('div');
    coverContainer.className = 'history-cover';
    if (colors?.buttonBg) {
        coverContainer.style.setProperty('--history-cover-bg', colors.buttonBg);
    }

    const hasValidThumbnail = thumbnailUrl && thumbnailUrl !== 'null' && thumbnailUrl !== 'undefined' && thumbnailUrl.trim() !== '';
    if (!hasValidThumbnail) {
        coverContainer.appendChild(createCenteredGlyph('🎵'));
        return coverContainer;
    }

    const cover = document.createElement('img');
    cover.crossOrigin = 'anonymous';

    const fallbackUrls = getThumbnailFallbacks(thumbnailUrl);
    let currentFallbackIndex = 0;

    cover.onerror = function() {
        currentFallbackIndex++;
        if (currentFallbackIndex < fallbackUrls.length) {
            this.src = fallbackUrls[currentFallbackIndex];
        } else {
            this.style.display = 'none';
            coverContainer.appendChild(createCenteredGlyph('🎵'));
        }
    };

    cover.src = fallbackUrls[0];
    coverContainer.appendChild(cover);
    return coverContainer;
}

function createHistoryListItemElement(item, { appTheme, colors }) {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-list-item';
    historyItem.dataset.url = item.url || '';
    historyItem.dataset.ts = String(item.ts ?? '');
    historyItem.role = 'button';
    historyItem.tabIndex = 0;

    const info = createPrimarySecondaryInfo({
        title: item.title || i18n.t('track.unknown'),
        subtitle: item.type === 'youtube' ? i18n.t('history.typeYoutube') : i18n.t('history.typeLocal'),
        colors,
        titleWeight: 500,
        applyThemeVars: false
    });
    const timeEl = document.createElement('div');
    timeEl.className = 'history-list-time';
    timeEl.textContent = formatHistoryTimestamp(item.ts);

    historyItem.appendChild(createHistoryCover(item.thumbnail_url));
    historyItem.appendChild(info);
    historyItem.appendChild(timeEl);
    return historyItem;
}

function applyHistoryThemeVars(target, { appTheme, colors }) {
    if (!target) {
        return;
    }

    const defaultBorder = appTheme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
    target.style.setProperty('--history-item-border', defaultBorder);
    target.style.setProperty('--item-hover-bg', colors.buttonHover);
    target.style.setProperty('--history-time-color', colors.secondaryText);
    target.style.setProperty('--history-cover-bg', colors.buttonBg);
    target.style.setProperty('--playlist-item-title-color', colors.textColor);
    target.style.setProperty('--playlist-item-title-weight', '500');
    target.style.setProperty('--playlist-item-title-size', '14px');
    target.style.setProperty('--playlist-item-subtitle-color', colors.secondaryText);
    target.style.setProperty('--playlist-item-subtitle-size', '12px');
    target.style.setProperty('--history-search-border', appTheme === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)');
    target.style.setProperty('--history-search-bg', appTheme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)');
    target.style.setProperty('--history-search-color', colors.textColor);
}

function createSelectPlaylistItemElement(playlist, index, { appTheme, colors }) {
    const playlistItem = document.createElement('div');
    playlistItem.className = 'select-playlist-item';
    playlistItem.dataset.playlistId = playlist.id;
    playlistItem.setAttribute('role', 'button');
    playlistItem.setAttribute('tabindex', '0');
    playlistItem.style.setProperty('--select-playlist-item-border', appTheme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)');
    playlistItem.style.setProperty('--item-hover-bg', colors.buttonHover);

    const gradient = PLAYLIST_OPTION_GRADIENTS[index % PLAYLIST_OPTION_GRADIENTS.length];
    const icon = playlist.id === playlistManager.getActiveDefaultId() ? '⭐' : PLAYLIST_OPTION_ICONS[index % PLAYLIST_OPTION_ICONS.length];

    const iconEl = document.createElement('div');
    iconEl.className = 'select-playlist-item-icon';
    iconEl.style.setProperty('--select-playlist-icon-bg', gradient);
    iconEl.textContent = icon;

    const info = createPrimarySecondaryInfo({
        title: playlist.name,
        subtitle: `📊 ${playlist.count || 0} 首歌曲`,
        colors
    });

    const checkMark = document.createElement('div');
    checkMark.className = 'select-playlist-checkmark';
    checkMark.dataset.role = 'playlist-checkmark';
    checkMark.textContent = '✅';

    playlistItem.appendChild(iconEl);
    playlistItem.appendChild(info);
    playlistItem.appendChild(checkMark);
    return playlistItem;
}

function createHistorySearchInput({ appTheme, colors }) {
    const searchInput = document.createElement('input');
    const defaultBorder = appTheme === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';
    searchInput.type = 'text';
    searchInput.className = 'history-search-input';
    searchInput.placeholder = i18n.t('history.search.placeholder');
    searchInput.style.setProperty('--history-search-border', defaultBorder);
    searchInput.style.setProperty('--history-search-bg', appTheme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)');
    searchInput.style.setProperty('--history-search-color', colors.textColor);
    return searchInput;
}

function createCenteredEmptyMessage(message) {
    const empty = document.createElement('div');
    empty.style.padding = '20px';
    empty.style.textAlign = 'center';
    empty.style.color = '#999';
    empty.textContent = message;
    return empty;
}

function createHistoryActionMenuContent(song) {
    const fragment = document.createDocumentFragment();

    const content = document.createElement('div');
    content.className = 'search-action-menu-content';

    const header = document.createElement('div');
    header.className = 'search-action-menu-header';

    const title = document.createElement('div');
    title.className = 'search-action-menu-title';
    title.textContent = song.title || '---';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'search-action-menu-close';
    closeButton.textContent = '✕';

    header.appendChild(title);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'search-action-menu-body';

    const actions = [
        { action: 'play-now', icon: '▶️', label: i18n.t('history.actionMenu.playNow') },
        { action: 'add-to-next', icon: '⏭️', label: i18n.t('history.actionMenu.addToNext') },
        { action: 'add-to-playlist', icon: '📋', label: i18n.t('history.actionMenu.addToPlaylist') },
        { action: 'delete-record', icon: '🗑️', label: i18n.t('history.actionMenu.deleteRecord'), color: '#ff6b6b' }
    ];

    actions.forEach(({ action, icon, label, color }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-action-menu-item';
        button.dataset.action = action;
        if (color) {
            button.style.color = color;
        }

        const iconEl = document.createElement('span');
        iconEl.className = 'icon';
        iconEl.textContent = icon;

        const labelEl = document.createElement('span');
        labelEl.className = 'label';
        labelEl.textContent = label;

        button.appendChild(iconEl);
        button.appendChild(labelEl);
        body.appendChild(button);
    });

    content.appendChild(header);
    content.appendChild(body);
    fragment.appendChild(content);
    return fragment;
}

function bindPlaylistItemDelegates(container) {
    if (!container || container._playlistItemClickHandler) {
        return;
    }

    container._playlistItemClickHandler = async (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const item = target?.closest('.playlist-track-item');
        if (!item || !container.contains(item)) {
            return;
        }

        if (target?.closest('.drag-handle')) {
            return;
        }

        const index = parseInt(item.dataset.index, 10);
        if (Number.isNaN(index)) {
            return;
        }

        const renderContext = container._playlistRenderContext;
        if (!renderContext) {
            return;
        }

        const { selectedPlaylistId, playlist } = getRenderedPlaylistState();
        const song = playlist[index];
        if (!song) {
            return;
        }

        const deleteBtn = target?.closest('.track-menu-btn');
        if (deleteBtn) {
            event.stopPropagation();

            if (item.classList.contains('current-playing') || deleteBtn.disabled) {
                return;
            }

            const confirmed = await ConfirmModal.show({
                title: i18n.t('playlist.deleteConfirm', { title: song.title }),
                type: 'danger'
            });
            if (!confirmed) {
                return;
            }

            try {
                deleteBtn.disabled = true;
                deleteBtn.style.opacity = '0.5';

                await playlistManager.removeAt(index);

                Toast.success(i18n.t('playlist.deleted'));
                renderPlaylistUI(renderContext);
            } catch (err) {
                console.error(`删除歌曲失败 (索引: ${index}):`, err);
                Toast.error(i18n.t('playlist.deleteFailed') + ': ' + (err.message || err));
                deleteBtn.disabled = false;
                deleteBtn.style.opacity = '1';
            }
            return;
        }

        if (item.classList.contains('current-playing')) {
            if (typeof window.app?.showFullPlayer === 'function') {
                window.app.showFullPlayer();
            } else {
                const fullPlayer = document.getElementById('fullPlayer');
                if (fullPlayer) {
                    fullPlayer.style.display = 'flex';
                    setTimeout(() => {
                        fullPlayer.classList.add('show');
                        const status = window.app?.player?.getStatus?.();
                        if (status) {
                            window.app?.ktvSync?.updateStatus?.(status);
                        }
                    }, 10);
                }
            }
            return;
        }

        if (selectedPlaylistId === playlistManager.getActiveDefaultId()) {
            await moveToTopAndPlay(song, index, renderContext.onPlay, renderContext);
            return;
        }

        await playSongFromSelectedPlaylist(song, renderContext.onPlay);
    };

    container.addEventListener('click', container._playlistItemClickHandler);
}

function getPlaylistTrackBaseKey(song) {
    return [song?.type || '', song?.url || '', song?.title || ''].join('::');
}

function getPlaylistTrackRenderKey(song, occurrenceCounts) {
    const baseKey = getPlaylistTrackBaseKey(song);
    const occurrence = occurrenceCounts.get(baseKey) || 0;
    occurrenceCounts.set(baseKey, occurrence + 1);
    return `${baseKey}::${occurrence}`;
}

function getPlaylistTrackRenderSignature({ song, isCurrentPlaying, isUnavailable, playlistName, playlistLength }) {
    return JSON.stringify({
        title: song?.title || '',
        url: song?.url || '',
        type: song?.type || '',
        thumbnailUrl: song?.thumbnail_url || '',
        current: isCurrentPlaying,
        unavailable: isUnavailable,
        playlistName: isCurrentPlaying ? playlistName || '' : '',
        playlistLength: isCurrentPlaying ? playlistLength : 0,
    });
}

function createPlaylistTrackItem({ song, index, playlistLength, playlistName, isCurrentPlaying, isUnavailable }) {
    const item = document.createElement('div');
    item.className = 'playlist-track-item';

    if (isCurrentPlaying) {
        item.classList.add('current-playing');
    }

    item.dataset.index = index;

    let coverUrl = '';
    if (song.type !== 'youtube' && song.url) {
        coverUrl = `/cover/${song.url.split('/').map(encodeURIComponent).join('/')}`;
    } else {
        coverUrl = song.thumbnail_url || '';
    }

    const cover = document.createElement('div');
    cover.className = 'track-cover';
    const imgEl = document.createElement('img');
    imgEl.alt = '';
    const coverPlaceholder = document.createElement('div');
    coverPlaceholder.className = 'track-cover-placeholder';
    coverPlaceholder.textContent = '🎵';
    cover.appendChild(imgEl);
    cover.appendChild(coverPlaceholder);
    if (coverUrl) {
        thumbnailManager.setupFallback(imgEl, coverUrl);
    } else {
        imgEl.style.display = 'none';
        coverPlaceholder.style.display = 'flex';
    }

    const leftContainer = document.createElement('div');
    leftContainer.className = 'track-left';

    const typeEl = document.createElement('div');
    typeEl.className = 'track-type';
    typeEl.textContent = song.type === 'youtube' ? 'YouTube' : i18n.t('local.musicType');

    leftContainer.appendChild(cover);
    leftContainer.appendChild(typeEl);

    const info = document.createElement('div');
    info.className = 'track-info';

    const songTitleEl = document.createElement('div');
    songTitleEl.className = 'track-title';
    songTitleEl.textContent = song.title || i18n.t('track.unknown');

    const metaEl = document.createElement('div');
    metaEl.className = 'track-meta';
    const playlistNameEl = document.createElement('div');
    playlistNameEl.className = 'track-playlist-name';
    playlistNameEl.textContent = isCurrentPlaying ? playlistName : '';
    metaEl.appendChild(playlistNameEl);

    info.appendChild(songTitleEl);
    info.appendChild(metaEl);

    if (isCurrentPlaying) {
        item.appendChild(leftContainer);
        item.appendChild(info);

        const seqEl = document.createElement('div');
        seqEl.className = 'track-seq';
        seqEl.textContent = `${index + 1}/${playlistLength}`;
        item.appendChild(seqEl);
    } else {
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.appendChild(createTrackControlIcon({
            width: 16,
            height: 16,
            viewBox: '0 0 24 24',
            circles: [
                { cx: 9, cy: 5, r: 2 },
                { cx: 15, cy: 5, r: 2 },
                { cx: 9, cy: 12, r: 2 },
                { cx: 15, cy: 12, r: 2 },
                { cx: 9, cy: 19, r: 2 },
                { cx: 15, cy: 19, r: 2 }
            ]
        }));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'track-menu-btn';
        deleteBtn.type = 'button';
        deleteBtn.appendChild(createTrackControlIcon({
            width: 20,
            height: 20,
            viewBox: '0 0 24 24',
            circles: [
                { cx: 12, cy: 5, r: 2 },
                { cx: 12, cy: 12, r: 2 },
                { cx: 12, cy: 19, r: 2 }
            ]
        }));

        item.appendChild(deleteBtn);
        item.appendChild(leftContainer);
        item.appendChild(info);
        item.appendChild(dragHandle);
    }

    if (isUnavailable) {
        item.classList.add('song-unavailable');
        const warnIcon = document.createElement('div');
        warnIcon.className = 'track-unavailable-badge';
        warnIcon.title = i18n.t('playlist.songUnavailable');
        warnIcon.textContent = '\u26A0';
        item.appendChild(warnIcon);
    }

    return item;
}

// UI 渲染：当前播放列表
export function renderPlaylistUI({ container, onPlay, currentMeta }) {
    if (!container) return;

    const { selectedPlaylistId, playlist, playlistName } = getRenderedPlaylistState();
    container._playlistRenderContext = { container, onPlay, currentMeta };
    bindPlaylistItemDelegates(container);
    renderPlaylistToolbar({ toolbarContainer: getPlaylistToolbarContainer(container), playlist, playlistName, selectedPlaylistId, container, onPlay, currentMeta });

    if (!playlist || playlist.length === 0) {
        container._playlistItemNodes = new Map();
        container._playlistEmptyStateVisible = true;
        // 播放列表为空时，显示空状态提示和历史按钮
        const emptyContainer = document.createElement('div');
        emptyContainer.className = 'playlist-empty-state';
        
        // 空状态文本
        const emptyText = document.createElement('div');
        emptyText.className = 'playlist-empty-text';
        emptyText.textContent = i18n.t('playlist.noSongs');
        
        // 历史按钮
        const appTheme = getCurrentAppTheme();
        const colors = getThemeColors(appTheme);

        const historyBtn = createEmptyActionButton({
            content: '📜 播放历史',
            title: '查看播放历史',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            shadow: '0 4px 16px rgba(102, 126, 234, 0.4)',
            hoverShadow: '0 8px 24px rgba(102, 126, 234, 0.6)',
            onClick: async (e) => {
                e.stopPropagation();
                await showPlaybackHistory();
            }
        });
        
        // 添加10首随即歌曲
        if (selectedPlaylistId === playlistManager.getActiveDefaultId()) {
            const randomBtn = createEmptyActionButton({
                content: '🎲 随机添加10首歌',
                title: '从所有歌单和本地歌曲中随机添加10首到队列',
                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                shadow: '0 4px 16px rgba(67, 233, 123, 0.3)',
                hoverShadow: '0 8px 24px rgba(67, 233, 123, 0.45)',
                onClick: async (e) => {
                    e.stopPropagation();
                    try {
                        loading.show('🎲 正在随机添加10首歌...');
                        await playlistManager.loadAll();
                        let allSongs = [];
                        playlistManager.playlists.forEach(pl => {
                            if (pl.id !== playlistManager.getActiveDefaultId() && Array.isArray(pl.songs)) {
                                allSongs = allSongs.concat(pl.songs);
                            }
                        });
                        const collectLocalSongs = (node, arr) => {
                            if (!node) return;
                            if (node.files) {
                                node.files.forEach(f => arr.push({
                                    url: f.rel,
                                    title: f.name.replace(/\.[^/.]+$/, ''),
                                    type: 'local'
                                }));
                            }
                            if (node.dirs) {
                                node.dirs.forEach(dir => collectLocalSongs(dir, arr));
                            }
                        };
                        let fileTree = null;
                        try {
                            const treeResult = await api.getFileTree();
                            if (!treeResult?._error && treeResult?.status === 'OK') {
                                fileTree = treeResult.tree;
                            } else {
                                console.warn('[随机添加] 获取本地文件树失败:', treeResult?.error || treeResult?.message || treeResult);
                            }
                        } catch (err) {
                            console.warn('[随机添加] 获取本地文件树异常:', err);
                        }
                        if (fileTree) {
                            collectLocalSongs(fileTree, allSongs);
                        }

                        const urlSet = new Set();
                        allSongs = allSongs.filter(song => {
                            if (!song.url || urlSet.has(song.url)) return false;
                            urlSet.add(song.url);
                            return true;
                        });

                        const shuffled = allSongs.sort(() => Math.random() - 0.5);
                        const randomSongs = shuffled.slice(0, 10);

                        if (randomSongs.length === 0) {
                            loading.hide();
                            Toast.error('没有可用的歌曲可添加');
                            return;
                        }

                        const addedSongs = [];
                        let failedCount = 0;

                        for (let i = 0; i < randomSongs.length; i++) {
                            const response = await playlistManager.addSong(
                                playlistManager.getActiveDefaultId(),
                                randomSongs[i],
                                i
                            );

                            if (!response?._error && response?.status === 'OK') {
                                addedSongs.push(randomSongs[i]);
                            } else {
                                failedCount += 1;
                                console.warn('[随机添加] 添加歌曲失败:', randomSongs[i]?.title, response?.error || response?.message || response);
                            }
                        }

                        await playlistManager.loadCurrent();
                        loading.hide();

                        if (addedSongs.length === 0) {
                            Toast.error('随机添加失败: 没有歌曲成功加入队列');
                            renderPlaylistUI({ container, onPlay, currentMeta });
                            return;
                        }

                        if (failedCount > 0) {
                            Toast.warning(`已随机添加${addedSongs.length}首歌到队列，${failedCount}首添加失败`);
                        } else {
                            Toast.success(`已随机添加${addedSongs.length}首歌到队列`);
                        }

                        if (addedSongs[0]) {
                            await window.app?.playSong(addedSongs[0]);
                            return;
                        }

                        renderPlaylistUI({ container, onPlay, currentMeta });
                    } catch (err) {
                        loading.hide();
                        Toast.error('随机添加失败: ' + (err.message || err));
                    }
                }
            });

            emptyContainer.appendChild(randomBtn);
        }
        // ...existing code...


        emptyContainer.appendChild(emptyText);
        emptyContainer.appendChild(historyBtn);
        container.replaceChildren(emptyContainer);
        return;
    }

    if (container._playlistEmptyStateVisible) {
        container.replaceChildren();
        container._playlistEmptyStateVisible = false;
    }

    const previousItemNodes = container._playlistItemNodes instanceof Map
        ? container._playlistItemNodes
        : new Map();
    const nextItemNodes = new Map();
    const occurrenceCounts = new Map();

    // 获取当前播放歌曲的URL（用于匹配）
    // 对于本地文件使用 rel，对于 YouTube 使用 raw_url
    const currentPlayingUrl = currentMeta?.rel || currentMeta?.raw_url || currentMeta?.url || null;

    // 播放队列列表 - 统一样式
    playlist.forEach((song, index) => {
        const isCurrentPlaying = currentPlayingUrl && song.url === currentPlayingUrl;
        const isUnavailable = unavailableSongs.has(song.url);
        const renderKey = getPlaylistTrackRenderKey(song, occurrenceCounts);
        const renderSignature = getPlaylistTrackRenderSignature({
            song,
            isCurrentPlaying,
            isUnavailable,
            playlistName,
            playlistLength: playlist.length,
        });

        let item = previousItemNodes.get(renderKey) || null;
        if (!item || item._playlistRenderSignature !== renderSignature) {
            const nextItem = createPlaylistTrackItem({
                song,
                index,
                playlistLength: playlist.length,
                playlistName,
                isCurrentPlaying,
                isUnavailable,
            });
            nextItem._playlistRenderSignature = renderSignature;

            if (item?.parentNode === container) {
                container.replaceChild(nextItem, item);
            }

            item = nextItem;
        }

        item.dataset.index = index;
        item.dataset.renderKey = renderKey;

        const currentChild = container.children[index];
        if (currentChild !== item) {
            container.insertBefore(item, currentChild || null);
        }

        nextItemNodes.set(renderKey, item);
    });

    previousItemNodes.forEach((item, renderKey) => {
        if (nextItemNodes.has(renderKey)) {
            return;
        }

        item.remove();
    });

    container._playlistItemNodes = nextItemNodes;

    // 初始化触摸拖拽排序
    initTouchDragSort(container, renderPlaylistUI, { container, onPlay, currentMeta });
}

// 触摸拖拽排序 - 移动端优化
function initTouchDragSort(container, rerenderFn, rerenderArgs) {
    let draggedItem = null;
    let draggedIndex = -1;
    let placeholder = null;
    let dragSiblingItems = [];
    let touchStartY = 0;
    let touchStartTime = 0;
    let isDragging = false;
    let longPressTimer = null;
    const LONG_PRESS_DURATION = 300; // 长按300ms触发拖拽
    const DRAG_THRESHOLD = 10; // 拖拽阈值（像素）

    // 创建占位符
    function createPlaceholder() {
        const el = document.createElement('div');
        el.className = 'drag-placeholder';
        return el;
    }

    // 获取拖拽手柄
    container.querySelectorAll('.drag-handle').forEach((handle, idx) => {
        if (handle.dataset.touchDragBound === 'true') {
            return;
        }

        handle.dataset.touchDragBound = 'true';
        const item = handle.closest('.playlist-track-item');
        if (!item) return;

        // 触摸开始
        handle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            touchStartY = e.touches[0].clientY;
            touchStartTime = Date.now();
            draggedItem = item;
            draggedIndex = parseInt(item.dataset.index);

            // 长按检测
            longPressTimer = setTimeout(() => {
                startDrag(e);
            }, LONG_PRESS_DURATION);
        }, { passive: false });

        // 触摸移动
        handle.addEventListener('touchmove', (e) => {
            if (!draggedItem) return;

            const touch = e.touches[0];
            const moveDistance = Math.abs(touch.clientY - touchStartY);

            // 如果移动距离超过阈值，立即开始拖拽
            if (!isDragging && moveDistance > DRAG_THRESHOLD) {
                clearTimeout(longPressTimer);
                startDrag(e);
            }

            if (isDragging) {
                e.preventDefault();
                moveDrag(e);
            }
        }, { passive: false });

        // 触摸结束
        handle.addEventListener('touchend', (e) => {
            clearTimeout(longPressTimer);
            if (isDragging) {
                endDrag(e);
            }
            resetDragState();
        }, { passive: true });

        // 触摸取消
        handle.addEventListener('touchcancel', () => {
            clearTimeout(longPressTimer);
            cancelDrag();
            resetDragState();
        });
    });

    function startDrag(e) {
        if (isDragging || !draggedItem) return;
        isDragging = true;

        // 获取操作锁，暂停轮询
        operationLock.acquire('drag');

        // 添加拖拽中样式
        draggedItem.classList.add('dragging');
        document.body.style.overflow = 'hidden'; // 禁止滚动

        // 创建占位符
        placeholder = createPlaceholder();
        placeholder.style.height = draggedItem.offsetHeight + 'px';
        draggedItem.parentNode.insertBefore(placeholder, draggedItem);
        dragSiblingItems = Array.from(container.querySelectorAll('.playlist-track-item:not(.dragging)'));

        // 设置拖拽元素样式
        const rect = draggedItem.getBoundingClientRect();
        draggedItem.style.position = 'fixed';
        draggedItem.style.left = rect.left + 'px';
        draggedItem.style.top = rect.top + 'px';
        draggedItem.style.width = rect.width + 'px';
        draggedItem.style.zIndex = '9999';

        // 触觉反馈（如果支持）
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    function moveDrag(e) {
        if (!isDragging || !draggedItem) return;

        const touch = e.touches[0];
        const deltaY = touch.clientY - touchStartY;
        
        // 移动拖拽元素
        const originalTop = parseFloat(draggedItem.dataset.originalTop || draggedItem.style.top);
        if (!draggedItem.dataset.originalTop) {
            draggedItem.dataset.originalTop = draggedItem.style.top;
        }
        draggedItem.style.top = (parseFloat(draggedItem.dataset.originalTop) + deltaY) + 'px';

        // 检测放置位置
        let insertBefore = null;
        
        for (const item of dragSiblingItems) {
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            
            if (touch.clientY < midY) {
                insertBefore = item;
                break;
            }
        }

        // 移动占位符
        if (insertBefore && insertBefore !== placeholder.nextSibling) {
            container.insertBefore(placeholder, insertBefore);
        } else if (!insertBefore && placeholder.nextSibling) {
            container.appendChild(placeholder);
        }
    }

    async function endDrag(e) {
        if (!isDragging || !draggedItem || !placeholder) return;

        try {
            // 计算新位置
            const items = Array.from(container.querySelectorAll('.playlist-track-item:not(.dragging)'));
            let newIndex = items.indexOf(placeholder.nextSibling ? 
                items.find(item => item === placeholder.nextSibling) : null);
            
            if (newIndex === -1) {
                newIndex = items.length;
            }
            
            // 调整索引（考虑占位符位置）
            const placeholderIndex = Array.from(container.children).indexOf(placeholder);
            const draggedItemOriginalIndex = draggedIndex;
            
            // 计算实际的新索引
            let actualNewIndex = 0;
            const allChildren = Array.from(container.children);
            for (let i = 0; i < allChildren.length; i++) {
                if (allChildren[i] === placeholder) {
                    actualNewIndex = i;
                    break;
                }
            }
            
            // 移除占位符，恢复拖拽元素
            placeholder.remove();
            draggedItem.classList.remove('dragging');
            draggedItem.style.position = '';
            draggedItem.style.left = '';
            draggedItem.style.top = '';
            draggedItem.style.width = '';
            draggedItem.style.zIndex = '';
            delete draggedItem.dataset.originalTop;

            // 如果位置变化了，调用 API 更新顺序
            if (actualNewIndex !== draggedItemOriginalIndex) {
                try {
                    const selectedPlaylistId = playlistManager.getSelectedPlaylistId();
                    const result = await api.reorderPlaylist(selectedPlaylistId, draggedItemOriginalIndex, actualNewIndex);
                    
                    if (result.status === 'OK') {
                        Toast.success(i18n.t('playlist.reordered'));
                        // 先刷新数据，再重新渲染列表
                        await playlistManager.loadCurrent();
                        rerenderFn(rerenderArgs);
                    } else {
                        Toast.error(i18n.t('playlist.reorderFailed') + ': ' + (result.error || result.message));
                        await playlistManager.loadCurrent();
                        rerenderFn(rerenderArgs);
                    }
                } catch (err) {
                    console.error('调整顺序失败:', err);
                    Toast.error(i18n.t('playlist.reorderFailed'));
                    await playlistManager.loadCurrent();
                    rerenderFn(rerenderArgs);
                }
            }
        } finally {
            // 【关键修复】确保在任何情况下都释放操作锁
            // 这防止了拖拽失败导致的轮询永久暂停
            operationLock.release('drag');
            console.log('[拖拽] ✓ 操作锁已释放');
        }
    }

    function cancelDrag() {
        if (placeholder) {
            placeholder.remove();
        }
        dragSiblingItems = [];
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem.style.position = '';
            draggedItem.style.left = '';
            draggedItem.style.top = '';
            draggedItem.style.width = '';
            draggedItem.style.zIndex = '';
            delete draggedItem.dataset.originalTop;
        }
        // 释放操作锁，恢复轮询
        operationLock.release('drag');
    }

    function resetDragState() {
        dragSiblingItems = [];
        draggedItem = null;
        draggedIndex = -1;
        placeholder = null;
        isDragging = false;
        document.body.style.overflow = '';
        // 确保释放操作锁
        operationLock.release('drag');
    }
}

// 兼容性导出，确保可被按名导入
export { renderPlaylistUI as playlistRenderer };
export { showSelectPlaylistModal };

// ✅ 新增：显示播放历史模态框
export async function showPlaybackHistory() {
    try {
        loading.show(i18n.t('history.loading'));
        
        // 获取合并后的播放历史
        const result = await api.getPlaybackHistoryMerged();
        
        if (result.status !== 'OK') {
            Toast.error(i18n.t('history.loadFailed') + ': ' + (result.error || '未知错误'));
            loading.hide();
            return;
        }
        
        const history = result.history || [];
        loading.hide();
        
        // 获取历史模态框元素
        const { historyModal, historyList, historyContent, historyCloseBtn } = getHistoryModalRefs();
        if (!historyModal) {
            console.error('[历史] 找不到 historyModal 元素');
            Toast.error('历史模态框未找到');
            return;
        }
        
        // 填充历史列表
        if (!historyList) {
            console.error('[历史] 找不到 historyList 元素');
            Toast.error('历史列表未找到');
            return;
        }
        
        // 获取应用主题
        const appTheme = getCurrentAppTheme();
        const colors = getThemeColors(appTheme);
        applyHistoryThemeVars(historyModal, { appTheme, colors });

        // 插入搜索框
        const existingSearch = historyModal.querySelector('.history-search-container');
        if (existingSearch) existingSearch.remove();

        const searchContainer = document.createElement('div');
        searchContainer.className = 'history-search-container';

        const searchInput = createHistorySearchInput({ appTheme, colors });
        searchContainer.appendChild(searchInput);

        historyContent?.insertBefore(searchContainer, historyList);

        // 历史数据（可变，用于删除后更新）
        let allHistory = [...history];
        let currentHistoryFilter = '';

        // 从历史中移除指定URL的记录
        function removeFromHistory(url) {
            allHistory = allHistory.filter(item => item.url !== url);
        }

        // 渲染单个历史项
        function renderHistoryItem(item) {
            return createHistoryListItemElement(item, { appTheme, colors });
        }

        // 渲染过滤后的历史列表
        function renderFilteredHistory(filterText = currentHistoryFilter) {
            currentHistoryFilter = String(filterText || '');
            const query = currentHistoryFilter.trim().toLowerCase();
            const filtered = query
                ? allHistory.filter(item => (item.title || '').toLowerCase().includes(query))
                : allHistory;

            historyList._historyRenderToken = (historyList._historyRenderToken || 0) + 1;
            const renderToken = historyList._historyRenderToken;

            if (historyList._historyRenderFrame) {
                cancelAnimationFrame(historyList._historyRenderFrame);
                historyList._historyRenderFrame = null;
            }

            if (filtered.length === 0) {
                historyList.replaceChildren(createCenteredEmptyMessage(
                    query ? i18n.t('history.noResults') : i18n.t('history.empty')
                ));
            } else {
                historyList.replaceChildren();

                let index = 0;
                const chunkSize = 48;
                const renderChunk = () => {
                    if (historyList._historyRenderToken !== renderToken) {
                        historyList._historyRenderFrame = null;
                        return;
                    }

                    const fragment = document.createDocumentFragment();
                    const end = Math.min(index + chunkSize, filtered.length);
                    for (; index < end; index++) {
                        fragment.appendChild(renderHistoryItem(filtered[index]));
                    }

                    historyList.appendChild(fragment);

                    if (index < filtered.length) {
                        historyList._historyRenderFrame = requestAnimationFrame(renderChunk);
                    } else {
                        historyList._historyRenderFrame = null;
                    }
                };

                renderChunk();
            }
        }

        historyList._historyActionContext = {
            historyModal,
            getHistory: () => allHistory,
            removeFromHistory,
            renderFilteredHistory
        };

        if (!historyList._delegatedClickHandler) {
            historyList._delegatedClickHandler = async (event) => {
                const historyItem = event.target.closest('.history-list-item');
                if (!historyItem || !historyList.contains(historyItem)) {
                    return;
                }

                const context = historyList._historyActionContext;
                if (!context) {
                    return;
                }

                const match = context.getHistory().find((entry) => {
                    return entry.url === (historyItem.dataset.url || '') && String(entry.ts ?? '') === (historyItem.dataset.ts || '');
                });
                if (!match) {
                    return;
                }

                const song = {
                    url: match.url,
                    title: match.title,
                    type: match.type,
                    thumbnail_url: match.thumbnail_url
                };
                showHistoryActionMenu(song, context.historyModal, context.removeFromHistory, context.renderFilteredHistory);
            };

            historyList.addEventListener('click', historyList._delegatedClickHandler);
        }

        if (!historyList._delegatedKeydownHandler) {
            historyList._delegatedKeydownHandler = (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                const historyItem = event.target.closest('.history-list-item');
                if (!historyItem || !historyList.contains(historyItem)) {
                    return;
                }

                event.preventDefault();
                historyItem.click();
            };

            historyList.addEventListener('keydown', historyList._delegatedKeydownHandler);
        }

        // 初始渲染
        renderFilteredHistory('');

        // 搜索框事件
        searchInput.addEventListener('input', () => {
            renderFilteredHistory(searchInput.value);
        });
        
        // 显示模态框
        showManagedModal(historyModal, {
            display: 'block',
            preferredSelector: '.history-search-container input'
        });
        
        // 为历史模态框添加关闭事件处理
        // 点击背景关闭
        historyModal.onclick = function(e) {
            if (e.target === historyModal) {
                closeHistoryModal(historyModal);
            }
        };
        
        // 为历史模态框内的关闭按钮添加事件处理
        if (historyCloseBtn) {
            historyCloseBtn.onclick = (e) => {
                e.stopPropagation();
                closeHistoryModal(historyModal);
            };
        }

        installModalKeyHandler(historyModal, () => closeHistoryModal(historyModal));
        
        console.log('[历史] 显示了 ' + history.length + ' 条播放历史');
        
    } catch (error) {
        console.error('[历史] 加载失败:', error);
        Toast.error(i18n.t('history.loadFailed') + ': ' + error.message);
        loading.hide();
    }
}

function installModalKeyHandler(modal, onClose) {
    if (modal._keydownHandler) {
        document.removeEventListener('keydown', modal._keydownHandler);
    }

    modal._keydownHandler = (event) => {
        if (!modal.classList.contains('modal-visible')) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
        }

        trapFocusInContainer(event, modal);
    };

    document.addEventListener('keydown', modal._keydownHandler);
}

function showManagedModal(modal, { display = 'block', preferredSelector = null } = {}) {
    modal._previousActiveElement = document.activeElement;
    setElementAttribute(modal, 'aria-modal', 'true');
    setElementAttribute(modal, 'aria-hidden', 'false');
    if (!modal.hasAttribute('tabindex')) {
        setElementAttribute(modal, 'tabindex', '-1');
    }

    const isAlreadyVisible = modal.classList.contains('modal-visible')
        && modal.getAttribute('aria-hidden') === 'false'
        && modal.style.display === display;

    setElementStyle(modal.style, 'display', display);
    if (isAlreadyVisible) {
        focusFirstFocusable(modal, preferredSelector);
        return;
    }

    setTimeout(() => {
        setElementClassState(modal, 'modal-visible', true);
        focusFirstFocusable(modal, preferredSelector);
    }, 10);
}

async function closeManagedModal(modal, { afterClose = null } = {}) {
    const isAlreadyHidden = !modal.classList.contains('modal-visible')
        && modal.getAttribute('aria-hidden') === 'true'
        && modal.style.display === 'none';

    if (isAlreadyHidden) {
        if (typeof afterClose === 'function') {
            await afterClose();
        }
        restoreFocus(modal._previousActiveElement);
        return;
    }

    setElementClassState(modal, 'modal-visible', false);
    if (modal._keydownHandler) {
        document.removeEventListener('keydown', modal._keydownHandler);
        modal._keydownHandler = null;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    setElementStyle(modal.style, 'display', 'none');
    setElementAttribute(modal, 'aria-hidden', 'true');

    if (typeof afterClose === 'function') {
        await afterClose();
    }

    restoreFocus(modal._previousActiveElement);
}

async function addSongToChosenPlaylist({ playlistId, song, playlistItem, playlistName, successMessage }) {
    const appTheme = getCurrentAppTheme();
    const colors = getThemeColors(appTheme);
    const checkMark = playlistItem?.querySelector('[data-role="playlist-checkmark"]');
    const originalBg = playlistItem?.style.background || '';

    try {
        console.log('[歌单选择] 用户选择歌单:', playlistId, playlistName);

        if (playlistItem) {
            playlistItem.style.background = colors.buttonHover;
            playlistItem.style.opacity = '0.7';
            playlistItem.style.pointerEvents = 'none';
        }

        let insertIndex = 1;
        try {
            const status = await api.getStatus();
            if (status?._error) {
                throw new Error(status.error || status.message || 'status unavailable');
            }
            const currentIndex = status?.current_index ?? -1;
            insertIndex = Math.max(1, currentIndex + 1);
            console.log('[歌单选择] 从后端获取当前播放索引:', { currentIndex, insertIndex });
        } catch (err) {
            console.warn('[歌单选择] 无法获取后端状态，使用默认位置 1:', err);
            insertIndex = 1;
        }

        const addResult = await playlistManager.addSong(playlistId, song, insertIndex);

        if (addResult?.duplicate) {
            throw new Error('该歌曲已存在于当前播放序列');
        }

        if (checkMark) {
            checkMark.style.opacity = '1';
        }

        let refreshError = null;
        try {
            const selectedPlaylistId = playlistManager.getSelectedPlaylistId();
            if (playlistId === selectedPlaylistId) {
                playlistManager.insertSongIntoPlaylistCache(playlistId, song, insertIndex);
            } else {
                await playlistManager.loadAll();
            }
        } catch (error) {
            refreshError = error;
            console.warn('[歌单选择] 刷新歌单缓存失败，但添加已成功:', error);
        }

        if (typeof successMessage === 'function') {
            successMessage(playlistName, { refreshError });
        }

        return { refreshError };
    } catch (error) {
        if (playlistItem) {
            playlistItem.style.background = originalBg;
            playlistItem.style.opacity = '1';
            playlistItem.style.pointerEvents = 'auto';
        }
        throw error;
    }
}

// ✅ 新增：显示歌单选择模态框
async function showSelectPlaylistModal(song, historyModal) {
    try {
        console.log('[歌单选择] 显示歌单选择模态框，歌曲:', song.title);
        
        const {
            selectPlaylistModal,
            selectPlaylistModalBody,
            selectPlaylistCloseBtn,
            selectPlaylistCancelBtn,
        } = getSelectPlaylistModalRefs();
        
        if (!selectPlaylistModal || !selectPlaylistModalBody) {
            console.error('[歌单选择] 模态框元素未找到');
            Toast.error('❌ 歌单选择器未初始化');
            return;
        }
        
        // 获取应用主题
        const appTheme = getCurrentAppTheme();
        const colors = getThemeColors(appTheme);
        
        // 清空模态框内容
        selectPlaylistModalBody.replaceChildren();
        
        // 获取所有歌单
        const playlists = playlistManager.getAll();
        
        if (!playlists || playlists.length === 0) {
            selectPlaylistModalBody.appendChild(createCenteredEmptyMessage(i18n.t('playlists.empty')));
        } else {
            // 为每个歌单创建选项
            playlists.forEach((playlist, index) => {
                const playlistItem = createSelectPlaylistItemElement(playlist, index, { appTheme, colors });
                selectPlaylistModalBody.appendChild(playlistItem);
            });
        }
        
        // 显示模态框
        showManagedModal(selectPlaylistModal, {
            display: 'flex',
            preferredSelector: '#selectPlaylistCloseBtn'
        });

        const closeSelectPlaylistModal = () => closeManagedModal(selectPlaylistModal);

        selectPlaylistModalBody._selectPlaylistContext = {
            song,
            closeSelectPlaylistModal,
            getPlaylists: () => playlistManager.getAll()
        };

        if (!selectPlaylistModalBody._delegatedClickHandler) {
            selectPlaylistModalBody._delegatedClickHandler = async (event) => {
                const playlistItem = event.target.closest('.select-playlist-item');
                if (!playlistItem || !selectPlaylistModalBody.contains(playlistItem)) {
                    return;
                }

                const context = selectPlaylistModalBody._selectPlaylistContext;
                if (!context) {
                    return;
                }

                const playlistId = playlistItem.dataset.playlistId;
                const playlist = context.getPlaylists().find((item) => item.id === playlistId);
                if (!playlist) {
                    Toast.error('❌ 歌单不存在');
                    return;
                }

                try {
                    await addSongToChosenPlaylist({
                        playlistId,
                        song: context.song,
                        playlistItem,
                        playlistName: playlist.name,
                        successMessage: (name, { refreshError } = {}) => {
                            context.closeSelectPlaylistModal();
                            console.log('[歌单选择] ✓ 歌曲已添加，返回播放历史页面');
                            const baseMessage = `✅ 已添加到「${name}」`;
                            if (refreshError) {
                                Toast.warning(`${baseMessage} (${i18n.t('playlist.opFailed')})`);
                                return;
                            }

                            Toast.success(baseMessage);
                        }
                    });
                } catch (error) {
                    console.error('[歌单选择] 添加失败:', error);
                    Toast.error('❌ 添加失败: ' + error.message);
                }
            };

            selectPlaylistModalBody.addEventListener('click', selectPlaylistModalBody._delegatedClickHandler);
        }

        if (!selectPlaylistModalBody._delegatedKeydownHandler) {
            selectPlaylistModalBody._delegatedKeydownHandler = (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                const playlistItem = event.target.closest('.select-playlist-item');
                if (!playlistItem || !selectPlaylistModalBody.contains(playlistItem)) {
                    return;
                }

                event.preventDefault();
                playlistItem.click();
            };

            selectPlaylistModalBody.addEventListener('keydown', selectPlaylistModalBody._delegatedKeydownHandler);
        }

        installModalKeyHandler(selectPlaylistModal, closeSelectPlaylistModal);
        
        // 绑定关闭按钮事件
        if (selectPlaylistCloseBtn) {
            selectPlaylistCloseBtn.onclick = (e) => {
                e.stopPropagation();
                console.log('[歌单选择] 用户点击关闭按钮，取消选择');
                closeSelectPlaylistModal();
            };
        }
        
        if (selectPlaylistCancelBtn) {
            selectPlaylistCancelBtn.onclick = (e) => {
                e.stopPropagation();
                console.log('[歌单选择] 用户点击取消按钮，取消选择');
                closeSelectPlaylistModal();
            };
        }
        
        // 点击背景关闭
        selectPlaylistModal.onclick = (e) => {
            if (e.target === selectPlaylistModal) {
                console.log('[歌单选择] 用户点击背景，取消选择');
                closeSelectPlaylistModal();
            }
        };
        
        console.log('[歌单选择] ✓ 歌单选择模态框已显示');
        
    } catch (error) {
        console.error('[歌单选择] 显示模态框失败:', error);
        Toast.error('❌ 显示歌单选择器失败: ' + error.message);
    }
}

// ✅ 新增：关闭历史模态框并返回默认歌单列表
async function closeHistoryModal(historyModal) {
    const { historyList } = getHistoryModalRefs();
    if (historyList) {
        historyList._historyRenderToken = (historyList._historyRenderToken || 0) + 1;
        if (historyList._historyRenderFrame) {
            cancelAnimationFrame(historyList._historyRenderFrame);
            historyList._historyRenderFrame = null;
        }
    }

    await closeManagedModal(historyModal, {
        afterClose: async () => {
            const container = getPlaylistContainerElement();
            const currentStatus = getCurrentPlaybackStatus();

            if (container) {
                renderPlaylistUI({
                    container,
                    onPlay: (song) => window.app?.playSong(song),
                    currentMeta: currentStatus.current_meta
                });
            }

            console.log('[历史] 已关闭，返回默认歌单列表');
        }
    });
}

// 显示播放历史操作菜单（复用 search-action-menu 样式）
function showHistoryActionMenu(song, historyModal, removeFromHistoryFn, rerenderCallback) {
    openOverlayActionMenu({
        content: createHistoryActionMenuContent(song),
        onMenuClick: (e, { menu, closeMenu }) => {
            const menuItem = e.target.closest('.search-action-menu-item');
            if (!menuItem || !menu.contains(menuItem)) {
                return;
            }

            e.stopPropagation();
            const action = menuItem.getAttribute('data-action');
            closeMenu();

            setTimeout(async () => {
                if (action === 'play-now') {
                    await handleHistoryPlayNow(song);
                } else if (action === 'add-to-next') {
                    await handleHistoryAddToNext(song);
                } else if (action === 'add-to-playlist') {
                    showSelectPlaylistModal(song, historyModal);
                } else if (action === 'delete-record') {
                    await handleHistoryDeleteRecord(song, removeFromHistoryFn, rerenderCallback);
                }
            }, 300);
        }
    });
}

// 立即播放：将歌曲插入队列顶部并播放
async function handleHistoryPlayNow(song) {
    try {
        const activeDefaultId = playlistManager.getActiveDefaultId();
        const songData = {
            url: song.url,
            title: song.title,
            type: song.type || 'local',
            thumbnail_url: song.thumbnail_url || ''
        };

        await executePlayNow({
            song: songData,
            addToQueueTop: () => {
                const existingIndex = playlistManager.findSongIndexInCache(activeDefaultId, songData.url);
                if (existingIndex >= 0) {
                    return { status: 'OK', duplicate: true };
                }

                return playlistManager.addSong(activeDefaultId, songData, 0);
            },
            ensureQueuedSongAtTop: () => playlistManager.ensureSongAtTop(activeDefaultId, songData.url),
            refreshPlaylist: () => playlistManager.insertSongIntoPlaylistCache(activeDefaultId, songData, 0),
            addFailedMessage: i18n.t('search.addSongFailed')
        });
    } catch (error) {
        console.error('[历史-立即播放] 失败:', error);
        Toast.error('播放失败: ' + error.message);
    }
}

// 添加到下一首：插入到当前播放歌曲之后
async function handleHistoryAddToNext(song) {
    try {
        const currentPlaylistId = playlistManager.getSelectedPlaylistId() || playlistManager.getActiveDefaultId();

        const result = await playlistManager.addSong(currentPlaylistId, {
            url: song.url,
            title: song.title,
            type: song.type || 'local',
            thumbnail_url: song.thumbnail_url || ''
        });

        if (result.status === 'OK') {
            const baseMessage = `⏭️ ${i18n.t('history.addToNextSuccess')}: ${song.title}`;
            try {
                await playlistManager.loadCurrent();
                rerenderQueueWithCurrentMeta(renderPlaylistUI);
                Toast.success(baseMessage);
            } catch (refreshError) {
                console.warn('[历史-添加到下一首] 队列刷新失败，但添加已成功:', refreshError);
                Toast.warning(`${baseMessage} (${i18n.t('playlist.opFailed')})`);
            }
        } else if (result.duplicate) {
            Toast.warning('该歌曲已在播放队列中');
        } else {
            Toast.error(`${i18n.t('history.addToNextFailed')}: ${result.error || result.message || ''}`);
        }
    } catch (error) {
        console.error('[历史-添加到下一首] 失败:', error);
        Toast.error(`${i18n.t('history.addToNextFailed')}: ${error.message}`);
    }
}

// 删除单条历史记录
async function handleHistoryDeleteRecord(song, removeFromHistoryFn, rerenderCallback) {
    try {
        const result = await api.deleteHistoryRecord(song.url);

        if (result.status === 'OK') {
            const baseMessage = `🗑️ ${i18n.t('history.deleteSuccess')}`;
            try {
                removeFromHistoryFn(song.url);
                if (typeof rerenderCallback === 'function') {
                    rerenderCallback();
                }
                Toast.success(baseMessage);
            } catch (refreshError) {
                console.warn('[历史-删除记录] 历史列表刷新失败，但删除已成功:', refreshError);
                Toast.warning(`${baseMessage} (${i18n.t('playlist.opFailed')})`);
            }
        } else {
            Toast.error(`${i18n.t('history.deleteFailed')}: ${result.error || ''}`);
        }
    } catch (error) {
        console.error('[历史-删除记录] 失败:', error);
        Toast.error(`${i18n.t('history.deleteFailed')}: ${error.message}`);
    }
}
