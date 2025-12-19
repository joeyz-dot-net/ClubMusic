// 播放列表管理模块
import { api } from './api.js';
import { Toast } from './ui.js';

export class PlaylistManager {
    constructor() {
        this.currentPlaylist = [];
        this.playlists = [];
        this.urlSet = new Set();
        this.currentPlaylistName = '当前播放列表'; // 添加歌单名称
    }

    // 加载当前播放队列
    async loadCurrent() {
        const result = await api.getPlaylist();
        if (result.status === 'OK' && Array.isArray(result.playlist)) {
            this.currentPlaylist = result.playlist;
            this.currentPlaylistName = result.playlist_name || '当前播放列表'; // 获取歌单名称
            this.updateUrlSet();
            return result;
        }
        throw new Error('加载播放列表失败');
    }

    // 加载所有歌单
    async loadAll() {
        const result = await api.getPlaylists();
        if (result.status === 'OK') {
            this.playlists = result.playlists || [];
            return this.playlists;
        }
        throw new Error('加载歌单列表失败');
    }

    // 创建新歌单
    async create(name) {
        const result = await api.createPlaylist(name);
        await this.loadAll(); // 重新加载
        return result;
    }

    // 删除歌单
    async delete(id) {
        const result = await api.deletePlaylist(id);
        await this.loadAll(); // 重新加载
        return result;
    }

    // 更新歌单
    async update(id, data) {
        const result = await api.updatePlaylist(id, data);
        await this.loadAll(); // 重新加载
        return result;
    }

    // 切换歌单
    async switch(id) {
        const result = await api.switchPlaylist(id);
        await this.loadCurrent(); // 重新加载当前队列
        return result;
    }

    // 从当前播放列表删除指定索引的歌曲
    async removeAt(index) {
        const result = await api.removeFromPlaylist(index);
        if (result.status === 'OK') {
            await this.loadCurrent();
        }
        return result;
    }

    // 调整当前播放列表顺序
    async reorder(fromIndex, toIndex) {
        const result = await api.reorderPlaylist(fromIndex, toIndex);
        if (result.status === 'OK') {
            // 后端已更新，重新加载以保持一致
            await this.loadCurrent();
        }
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

    // 获取所有歌单
    getAll() {
        return this.playlists;
    }
}

// 导出单例
export const playlistManager = new PlaylistManager();

// UI 渲染：当前播放列表
export function renderPlaylistUI({ container, titleEl, onPlay, currentMeta }) {
    if (!container) return;

    const playlist = playlistManager.getCurrent();
    const playlistName = playlistManager.getCurrentName();

    if (titleEl) {
        titleEl.textContent = `${playlistName} (${playlist.length} 首)`;
    }

    container.innerHTML = '';

    if (!playlist || playlist.length === 0) {
        container.innerHTML = `
            <div class="playlist-empty">暂无歌曲</div>
        `;
        return;
    }

    // 获取当前播放歌曲的URL（用于匹配）
    // 对于本地文件使用 rel，对于 YouTube 使用 raw_url
    const currentPlayingUrl = currentMeta?.rel || currentMeta?.raw_url || currentMeta?.url || null;

    // 播放队列列表 - 统一样式
    playlist.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-track-item';
        
        // 根据URL匹配当前播放的歌曲，而不是简单地标记第一首
        const isCurrentPlaying = currentPlayingUrl && song.url === currentPlayingUrl;
        
        if (isCurrentPlaying) {
            item.classList.add('current-playing');
        }
        
        item.dataset.index = index;

        const cover = document.createElement('div');
        cover.className = 'track-cover';
        cover.innerHTML = `
            <img src="${song.thumbnail_url || ''}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div class="track-cover-placeholder">🎵</div>
        `;

        // 左侧：cover + type
        const leftContainer = document.createElement('div');
        leftContainer.className = 'track-left';
        
        const typeEl = document.createElement('div');
        typeEl.className = 'track-type';
        const songType = song.type === 'youtube' ? 'YouTube' : '本地音乐';
        typeEl.textContent = songType;
        
        leftContainer.appendChild(cover);
        leftContainer.appendChild(typeEl);

        // 中间：title + meta
        const info = document.createElement('div');
        info.className = 'track-info';
        
        const songTitleEl = document.createElement('div');
        songTitleEl.className = 'track-title';
        songTitleEl.textContent = song.title || '未知歌曲';
        
        const metaEl = document.createElement('div');
        metaEl.className = 'track-meta';
        
        if (isCurrentPlaying) {
            const playlistNameEl = document.createElement('div');
            playlistNameEl.className = 'track-playlist-name';
            playlistNameEl.textContent = playlistName;
            metaEl.appendChild(playlistNameEl);
        } else {
            const playlistNameEl = document.createElement('div');
            playlistNameEl.className = 'track-playlist-name';
            playlistNameEl.textContent = playlistName;
            metaEl.appendChild(playlistNameEl);
        }
        
        info.appendChild(songTitleEl);
        info.appendChild(metaEl);

        // 右侧：删除按钮或序列号
        if (isCurrentPlaying) {
            item.appendChild(leftContainer);
            item.appendChild(info);

            // 序列号放在右下角，与类型垂直对齐
            const seqEl = document.createElement('div');
            seqEl.className = 'track-seq';
            seqEl.textContent = `${index + 1}/${playlist.length}`;
            item.appendChild(seqEl);
        } else {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'track-menu-btn';
            deleteBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                </svg>
            `;
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`确定删除《${song.title}》吗？`)) {
                    try {
                        await playlistManager.removeAt(index);
                        Toast.success('已删除');
                        renderPlaylistUI({ container, titleEl, onPlay, currentMeta });
                    } catch (err) {
                        Toast.error('删除失败');
                    }
                }
            });
            
            item.appendChild(leftContainer);
            item.appendChild(info);
            item.appendChild(deleteBtn);
        }

        item.addEventListener('click', () => {
            if (onPlay) onPlay(song);
        });

        container.appendChild(item);
    });

    // 拖拽排序已关闭
}

// 兼容性导出，确保可被按名导入
export { renderPlaylistUI as playlistRenderer };
