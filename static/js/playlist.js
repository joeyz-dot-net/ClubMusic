// 播放列表管理模块
import { api } from './api.js';
import { Toast, loading, ConfirmModal } from './ui.js';
import { operationLock } from './operationLock.js';
import { thumbnailManager, escapeHTML } from './utils.js';
import { i18n } from './i18n.js';
import { player } from './player.js';

export class PlaylistManager {
    constructor() {
        this.currentPlaylist = [];
        this.playlists = [];
        this.urlSet = new Set();
        this.currentPlaylistName = i18n.t('playlist.current'); // 添加歌单名称
        // ✅ 从 localStorage 恢复当前选择的歌单ID，默认为 'default'
        this.selectedPlaylistId = this._loadSelectedPlaylistFromStorage();
        console.log('[PlaylistManager] ✓ 初始化完成，selectedPlaylistId:', this.selectedPlaylistId);
        console.log('[PlaylistManager] ℹ localStorage 中的完整值:', localStorage.getItem('selectedPlaylistId'));
    }

    // ✅ 新增：从 localStorage 读取保存的歌单ID
    _loadSelectedPlaylistFromStorage() {
        try {
            const saved = localStorage.getItem('selectedPlaylistId');
            console.log('[PlaylistManager] localStorage中的值:', saved);
            if (saved && saved !== 'undefined' && saved !== '') {
                console.log('[歌单管理] 从本地存储恢复选择歌单:', saved);
                return saved;
            }
        } catch (e) {
            console.warn('[歌单管理] 读取 localStorage 失败:', e);
        }
        console.log('[歌单管理] 使用默认歌单: default');
        return 'default';
    }

    // 加载当前播放队列（用户隔离：使用前端保存的 selectedPlaylistId）
    async loadCurrent() {
        // 使用前端独立维护的 selectedPlaylistId，每个浏览器独立
        const result = await api.getPlaylist(this.selectedPlaylistId);
        if (!result || result.status !== 'OK') {
            console.warn('[歌单管理] loadCurrent: 无效的后端响应', result);
            throw new Error('加载播放列表失败（后端响应无效）');
        }
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
        const result = await api.getPlaylists();
        if (result.status === 'OK') {
            this.playlists = result.playlists || [];
            return this.playlists;
        }
        throw new Error('加载歌单列表失败');
    }

    // 并行刷新当前播放列表和所有歌单
    async refreshAll() {
        await Promise.all([this.loadCurrent(), this.loadAll()]);
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
        // ✅ 如果删除的是当前选择的歌单，重置为 'default'
        if (this.selectedPlaylistId === id) {
            console.log('[歌单管理] 被删除的歌单是当前选择，重置为 default');
            this.setSelectedPlaylist('default');
        }
        return result;
    }

    // 更新歌单
    async update(id, data) {
        const result = await api.updatePlaylist(id, data);
        await this.loadAll(); // 重新加载
        return result;
    }

    // 切换歌单（用户隔离：只验证后端歌单存在，不修改后端全局状态）
    async switch(id) {
        // 先更新本地状态（确保 loadCurrent 使用正确的 ID）
        this.setSelectedPlaylist(id);
        const result = await api.switchPlaylist(id);
        await this.loadCurrent(); // 重新加载当前队列
        return result;
    }

    // ✅ 新增：设置当前选择的歌单（并保存到 localStorage）
    setSelectedPlaylist(playlistId) {
        this.selectedPlaylistId = playlistId;
        // 保存到 localStorage
        try {
            localStorage.setItem('selectedPlaylistId', playlistId);
            console.log('[歌单管理] 设置当前选择歌单:', playlistId, '(已保存到本地存储)');
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
            if (this.selectedPlaylistId === 'default') {
                // 默认歌单使用旧的API (针对当前播放的歌单)
                result = await api.removeFromPlaylist(index);
            } else {
                // 非默认歌单使用新的API (针对特定歌单)
                result = await api.removeFromSpecificPlaylist(this.selectedPlaylistId, index);
            }
            
            if (result.status === 'OK') {
                console.log(`[删除成功] ${songTitle} 已从歌单删除`);
                await this.loadCurrent();
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

    // 获取当前歌单图标
    getCurrentPlaylistIcon() {
        const selectedId = this.selectedPlaylistId;

        // 默认歌单使用星星图标
        if (selectedId === 'default') {
            return '⭐';
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
        
        // 刷新数据
        await playlistManager.refreshAll();
        
        // 播放歌曲（现在已经在索引0）
        if (onPlay) {
            onPlay(song);
        }
        
        // 重新渲染列表
        if (rerenderArgs) {
            renderPlaylistUI(rerenderArgs);
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
    
    if (selectedPlaylistId === 'default') {
        Toast.error('❌ 当前已是默认歌单');
        return;
    }
    
    try {
        loading.show(i18n.t('playlist.addingAll', { count: playlist.length }));
        
        // 获取默认歌单以检查重复
        const defaultPlaylist = playlistManager.playlists.find(p => p.id === 'default');
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
                const result = await api.addToPlaylist({
                    playlist_id: 'default',
                    song: song,
                    insert_index: insertIndex + addedCount  // 按顺序插入
                });
                
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
        
        // 完成后刷新播放列表数据
        loading.hide();
        await playlistManager.refreshAll();
        
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
        
        // ✅ 情况 A: 当前选择 === 默认歌单 → 直接播放
        if (selectedPlaylistId === 'default') {
            console.log('[播放列表] ✓ 当前选择是默认歌单，直接播放');
            if (onPlay) {
                onPlay(song);
            }
        } else {
            // ✅ 情况 B: 当前选择 ≠ 默认歌单 → 仅添加到默认歌单下一曲位置，不播放
            console.log('[播放列表] ⚠️ 当前选择不是默认歌单，添加到队列但不播放');
            
            // 获取默认歌单
            const defaultPlaylist = playlistManager.playlists.find(p => p.id === 'default');
            if (!defaultPlaylist) {
                Toast.error('❌ 默认歌单不存在');
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
                const result = await api.addToPlaylist({
                    playlist_id: 'default',
                    song: song,
                    insert_index: insertIndex
                });
                
                if (result.status !== 'OK') {
                    Toast.error('添加失败: ' + result.error);
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

// 播放列表顶部工具栏渲染（独立于列表容器，支持 sticky 定位）
export function renderPlaylistToolbar({ toolbarContainer, playlist, playlistName, selectedPlaylistId, container, onPlay, currentMeta }) {
    if (!toolbarContainer) return;
    toolbarContainer.innerHTML = '';

    if (selectedPlaylistId === 'default') {
        const appTheme = getCurrentAppTheme();
        const colors = getThemeColors(appTheme);

        const headerContainer = document.createElement('div');
        const isLightTheme = appTheme === 'light';
        const headerBg = isLightTheme
            ? 'rgba(255, 255, 255, 0.7)'
            : 'rgba(26, 26, 26, 0.6)';
        const headerBorder = isLightTheme
            ? 'rgba(224, 224, 224, 0.5)'
            : 'rgba(51, 51, 51, 0.5)';

        headerContainer.style.cssText = `
            background: ${headerBg};
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid ${headerBorder};
            border-radius: 12px;
            padding: 14px 16px;
            box-shadow: 0 4px 16px ${colors.shadow};
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
        `;

        const infoSection = document.createElement('div');
        infoSection.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
        `;

        const playlistTitle = document.createElement('div');
        playlistTitle.style.cssText = `
            font-size: 16px;
            font-weight: 700;
            color: ${colors.textColor};
            letter-spacing: 0.5px;
            line-height: 1.2;
        `;
        playlistTitle.textContent = playlistName;

        const songCount = document.createElement('div');
        songCount.style.cssText = `
            font-size: 12px;
            color: ${colors.secondaryText};
            font-weight: 500;
        `;
        songCount.textContent = i18n.t('playlist.songCount', { count: playlist.length });

        infoSection.appendChild(playlistTitle);
        infoSection.appendChild(songCount);

        const defaultIcon = playlistManager.getCurrentPlaylistIcon();
        const defaultIconEl = document.createElement('div');
        defaultIconEl.style.cssText = `font-size: 28px; line-height: 1; flex-shrink: 0;`;
        defaultIconEl.textContent = defaultIcon;

        const defaultLeftSection = document.createElement('div');
        defaultLeftSection.style.cssText = `display: flex; align-items: center; gap: 10px; flex: 1; cursor: pointer;`;
        defaultLeftSection.appendChild(defaultIconEl);
        defaultLeftSection.appendChild(infoSection);
        defaultLeftSection.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('open-playlists-modal'));
        });
        headerContainer.appendChild(defaultLeftSection);

        // 清空按钮
        const clearBtn = document.createElement('button');
        clearBtn.style.cssText = `
            background: ${colors.buttonBg};
            border: 1.5px solid ${colors.buttonBorder};
            color: ${colors.buttonText};
            width: 40px;
            height: 40px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 18px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        `;
        clearBtn.innerHTML = '🗑️';
        clearBtn.title = i18n.t('playlist.clearQueue');
        clearBtn.addEventListener('mouseover', () => {
            clearBtn.style.background = colors.buttonHover;
            clearBtn.style.transform = 'scale(1.1)';
            clearBtn.style.boxShadow = `0 4px 12px ${colors.shadow}`;
        });
        clearBtn.addEventListener('mouseout', () => {
            clearBtn.style.background = colors.buttonBg;
            clearBtn.style.transform = 'scale(1)';
            clearBtn.style.boxShadow = 'none';
        });
        clearBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = await ConfirmModal.show({ title: i18n.t('playlist.clearQueueConfirm'), type: 'danger' });
            if (confirmed) {
                try {
                    await api.post('/playlist_clear', {});
                    Toast.success(i18n.t('playlist.clearSucceed'));
                    await playlistManager.loadCurrent();
                    renderPlaylistUI({ container, onPlay, currentMeta });
                } catch (err) {
                    console.error('清空队列失败:', err);
                    Toast.error(i18n.t('playlist.clearFailed') + ': ' + (err.message || err));
                }
            }
        });

        headerContainer.appendChild(clearBtn);
        toolbarContainer.appendChild(headerContainer);
    }

    if (selectedPlaylistId !== 'default') {
        const appTheme = getCurrentAppTheme();
        const colors = getThemeColors(appTheme);

        const hasYoutube = playlist.some(song => {
            const isYoutube = song.type === 'youtube' || song.type === 'stream';
            const isUrl = song.url && (song.url.startsWith('http') || song.url.startsWith('youtu'));
            return isYoutube || isUrl;
        });

        const headerContainer = document.createElement('div');
        const isLightTheme = appTheme === 'light';
        const headerBg = isLightTheme
            ? 'rgba(255, 255, 255, 0.7)'
            : 'rgba(26, 26, 26, 0.6)';
        const headerBorder = isLightTheme
            ? 'rgba(224, 224, 224, 0.5)'
            : 'rgba(51, 51, 51, 0.5)';

        headerContainer.style.cssText = `
            background: ${headerBg};
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid ${headerBorder};
            border-radius: 12px;
            padding: 14px 16px;
            box-shadow: 0 4px 16px ${colors.shadow};
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
        `;

        const infoSection = document.createElement('div');
        infoSection.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
        `;

        const playlistTitle = document.createElement('div');
        playlistTitle.style.cssText = `
            font-size: 16px;
            font-weight: 700;
            color: ${colors.textColor};
            letter-spacing: 0.5px;
            line-height: 1.2;
        `;
        playlistTitle.textContent = playlistName;

        const songCount = document.createElement('div');
        songCount.style.cssText = `
            font-size: 12px;
            color: ${colors.secondaryText};
            font-weight: 500;
        `;
        songCount.textContent = i18n.t('playlist.songCount', { count: playlist.length });

        infoSection.appendChild(playlistTitle);
        infoSection.appendChild(songCount);

        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
            flex-shrink: 0;
        `;

        const returnBtn = document.createElement('button');
        returnBtn.style.cssText = `
            background: ${colors.buttonBg};
            border: 1.5px solid ${colors.buttonBorder};
            color: ${colors.buttonText};
            width: 40px;
            height: 40px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
        `;
        returnBtn.innerHTML = '←';
        returnBtn.title = i18n.t('playlist.returnToQueue');
        returnBtn.addEventListener('mouseover', () => {
            returnBtn.style.background = colors.buttonHover;
            returnBtn.style.transform = 'scale(1.1) translateX(-2px)';
            returnBtn.style.boxShadow = `0 4px 12px ${colors.shadow}`;
        });
        returnBtn.addEventListener('mouseout', () => {
            returnBtn.style.background = colors.buttonBg;
            returnBtn.style.transform = 'scale(1)';
            returnBtn.style.boxShadow = 'none';
        });
        returnBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            playlistManager.setSelectedPlaylist('default');
            await playlistManager.loadCurrent();
            renderPlaylistUI({ container, onPlay, currentMeta });
            console.log('[歌单切换] 已返回默认歌单（队列）');
            Toast.success(i18n.t('playlist.returnedToQueue'));
        });

        const addAllBtn = document.createElement('button');
        addAllBtn.style.cssText = `
            background: ${colors.buttonBg};
            border: 1.5px solid ${colors.buttonBorder};
            color: ${colors.buttonText};
            width: 40px;
            height: 40px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            flex-shrink: 0;
        `;
        addAllBtn.innerHTML = '➕';
        addAllBtn.title = i18n.t('playlist.addAll');
        addAllBtn.addEventListener('mouseover', () => {
            addAllBtn.style.background = colors.buttonHover;
            addAllBtn.style.transform = 'scale(1.1) rotate(90deg)';
            addAllBtn.style.boxShadow = `0 4px 12px ${colors.shadow}`;
        });
        addAllBtn.addEventListener('mouseout', () => {
            addAllBtn.style.background = colors.buttonBg;
            addAllBtn.style.transform = 'scale(1) rotate(0deg)';
            addAllBtn.style.boxShadow = 'none';
        });
        addAllBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await addAllSongsToDefault(playlist, selectedPlaylistId);
        });

        const clearBtn = document.createElement('button');
        clearBtn.style.cssText = `
            background: ${colors.buttonBg};
            border: 1.5px solid ${colors.buttonBorder};
            color: ${colors.buttonText};
            width: 40px;
            height: 40px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 18px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        `;
        clearBtn.innerHTML = '🗑️';
        clearBtn.title = i18n.t('playlist.clearPlaylist');
        clearBtn.addEventListener('mouseover', () => {
            clearBtn.style.background = colors.buttonHover;
            clearBtn.style.transform = 'translateY(-1px)';
        });
        clearBtn.addEventListener('mouseout', () => {
            clearBtn.style.background = colors.buttonBg;
            clearBtn.style.transform = 'translateY(0)';
        });
        clearBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = await ConfirmModal.show({ title: i18n.t('playlist.clearPlaylistConfirm', { name: playlistName }), type: 'danger' });
            if (confirmed) {
                try {
                    await api.delete(`/playlists/${selectedPlaylistId}`);
                    Toast.success(i18n.t('playlists.deleteSuccess'));
                    playlistManager.setSelectedPlaylist('default');
                    await playlistManager.refreshAll();
                    renderPlaylistUI({ container, onPlay, currentMeta });
                } catch (err) {
                    console.error('清空歌单失败:', err);
                    Toast.error(i18n.t('playlist.clearFailed') + ': ' + (err.message || err));
                }
            }
        });

        buttonGroup.appendChild(returnBtn);
        buttonGroup.appendChild(addAllBtn);
        buttonGroup.appendChild(clearBtn);

        const customIcon = playlistManager.getCurrentPlaylistIcon();
        const customIconEl = document.createElement('div');
        customIconEl.style.cssText = `font-size: 28px; line-height: 1; flex-shrink: 0;`;
        customIconEl.textContent = customIcon;

        const customLeftSection = document.createElement('div');
        customLeftSection.style.cssText = `display: flex; align-items: center; gap: 10px; flex: 1; cursor: pointer;`;
        customLeftSection.appendChild(customIconEl);
        customLeftSection.appendChild(infoSection);
        customLeftSection.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('open-playlists-modal'));
        });
        headerContainer.appendChild(customLeftSection);
        headerContainer.appendChild(buttonGroup);
        toolbarContainer.appendChild(headerContainer);
    }
}

// UI 渲染：当前播放列表
export function renderPlaylistUI({ container, onPlay, currentMeta }) {
    if (!container) return;

    const selectedPlaylistId = playlistManager.getSelectedPlaylistId();
    
    // ✅ 根据当前选择的歌单ID，获取对应的歌单数据
    let playlist = [];
    let playlistName = i18n.t('playlist.current');
    
    if (selectedPlaylistId === 'default') {
        // 显示默认歌单（当前播放队列）
        playlist = playlistManager.getCurrent();
        playlistName = playlistManager.getCurrentName();
    } else {
        // 显示用户选择的非默认歌单
        const selectedPlaylist = playlistManager.playlists.find(p => p.id === selectedPlaylistId);
        if (selectedPlaylist) {
            playlist = selectedPlaylist.songs || [];
            playlistName = selectedPlaylist.name || i18n.t('playlist.unnamed');
            console.log('[渲染列表] 显示非默认歌单:', selectedPlaylistId, '名称:', playlistName);
        } else {
            console.warn('[渲染列表] 找不到歌单:', selectedPlaylistId, '，回退到默认歌单');
            playlist = playlistManager.getCurrent();
            playlistName = playlistManager.getCurrentName();
        }
    }


    container.innerHTML = '';
    renderPlaylistToolbar({ toolbarContainer: document.getElementById('playlistToolbar'), playlist, playlistName, selectedPlaylistId, container, onPlay, currentMeta });

    if (!playlist || playlist.length === 0) {
        // 播放列表为空时，显示空状态提示和历史按钮
        const emptyContainer = document.createElement('div');
        emptyContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 24px;
            height: 60vh;
            color: #999;
        `;
        
        // 空状态文本
        const emptyText = document.createElement('div');
        emptyText.style.cssText = `
            font-size: 16px;
            text-align: center;
            color: #999;
        `;
        emptyText.innerHTML = i18n.t('playlist.noSongs');
        
        // 历史按钮
        const historyBtn = document.createElement('button');
        const appTheme = getCurrentAppTheme();
        const colors = getThemeColors(appTheme);
        
        historyBtn.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            color: white;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 18px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 600;
            white-space: nowrap;
        `;
        
        historyBtn.innerHTML = '📜 播放历史';
        historyBtn.title = '查看播放历史';
        
        historyBtn.addEventListener('mouseover', () => {
            historyBtn.style.transform = 'translateY(-2px)';
            historyBtn.style.boxShadow = '0 8px 24px rgba(102, 126, 234, 0.6)';
        });
        
        historyBtn.addEventListener('mouseout', () => {
            historyBtn.style.transform = 'translateY(0)';
            historyBtn.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)';
        });
        
        historyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await showPlaybackHistory();
        });
        
        // 添加10首随即歌曲
        if (selectedPlaylistId === 'default') {
            const randomBtn = document.createElement('button');
            randomBtn.style.cssText = `
                background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
                border: none;
                color: white;
                padding: 16px 32px;
                border-radius: 12px;
                font-size: 18px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 4px 16px rgba(67, 233, 123, 0.3);
                display: flex;
                align-items: center;
                gap: 12px;
                font-weight: 600;
                white-space: nowrap;
            `;
            randomBtn.innerHTML = '🎲 随机添加10首歌';
            randomBtn.title = '从所有歌单和本地歌曲中随机添加10首到队列';

            randomBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    loading.show('🎲 正在随机添加10首歌...');
                    // 1. 获取所有歌单和本地歌曲
                    await playlistManager.loadAll();
                    let allSongs = [];
                    // 从所有歌单收集（排除default）
                    playlistManager.playlists.forEach(pl => {
                        if (pl.id !== 'default' && Array.isArray(pl.songs)) {
                            allSongs = allSongs.concat(pl.songs);
                        }
                    });
                    // 从本地文件树收集
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
                    // 获取本地文件树
                    let fileTree = null;
                    try {
                        const treeResult = await api.get('/tree');
                        fileTree = treeResult?.tree;
                    } catch {}
                    if (fileTree) {
                        collectLocalSongs(fileTree, allSongs);
                    }

                    // 去重（按url）
                    const urlSet = new Set();
                    allSongs = allSongs.filter(song => {
                        if (!song.url || urlSet.has(song.url)) return false;
                        urlSet.add(song.url);
                        return true;
                    });

                    // 随机选10首
                    const shuffled = allSongs.sort(() => Math.random() - 0.5);
                    const randomSongs = shuffled.slice(0, 10);

                    if (randomSongs.length === 0) {
                        loading.hide();
                        Toast.error('没有可用的歌曲可添加');
                        return;
                    }

                    // 批量添加到默认歌单
                    for (let i = 0; i < randomSongs.length; i++) {
                        await api.addToPlaylist({
                            playlist_id: 'default',
                            song: randomSongs[i],
                            insert_index: i
                        });
                    }
                    await playlistManager.loadCurrent();
                    loading.hide();
                    Toast.success(`已随机添加${randomSongs.length}首歌到队列`);
                    // 自动播放第一首
                    if (randomSongs[0]) {
                        window.app?.playSong(randomSongs[0]);
                    }
                    // 刷新列表
                    renderPlaylistUI({ container, onPlay, currentMeta });
                } catch (err) {
                    loading.hide();
                    Toast.error('随机添加失败: ' + (err.message || err));
                }
            });

            emptyContainer.appendChild(randomBtn);
        }
        // ...existing code...


        emptyContainer.appendChild(emptyText);
        emptyContainer.appendChild(historyBtn);
        container.appendChild(emptyContainer);
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
            
            // 添加垂直进度条
            const progressBar = document.createElement('div');
            //progressBar.className = 'track-progress-bar';
            //progressBar.innerHTML = '<div class="track-progress-fill" id="currentTrackProgress"></div>';
            //item.appendChild(progressBar);
        }
        
        item.dataset.index = index;

        // 为本地歌曲生成封面URL
        let coverUrl = song.thumbnail_url || '';
        if (!coverUrl && song.type !== 'youtube' && song.url) {
            // 本地歌曲：使用 /cover/ 接口获取封面
            coverUrl = `/cover/${encodeURIComponent(song.url)}`;
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

        // 左侧：cover + type
        const leftContainer = document.createElement('div');
        leftContainer.className = 'track-left';
        
        const typeEl = document.createElement('div');
        typeEl.className = 'track-type';
        const songType = song.type === 'youtube' ? 'YouTube' : i18n.t('local.musicType');
        typeEl.textContent = songType;
        
        leftContainer.appendChild(cover);
        leftContainer.appendChild(typeEl);

        // 中间：title + meta
        const info = document.createElement('div');
        info.className = 'track-info';
        
        const songTitleEl = document.createElement('div');
        songTitleEl.className = 'track-title';
        songTitleEl.textContent = song.title || i18n.t('track.unknown');
        
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
            //playlistNameEl.textContent = playlistName;
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
            // 添加拖拽手柄（移动端触摸拖拽）
            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle';
            dragHandle.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="5" r="2"/>
                    <circle cx="15" cy="5" r="2"/>
                    <circle cx="9" cy="12" r="2"/>
                    <circle cx="15" cy="12" r="2"/>
                    <circle cx="9" cy="19" r="2"/>
                    <circle cx="15" cy="19" r="2"/>
                </svg>
            `;
            
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
                
                // 防止重复点击
                if (deleteBtn.disabled) {
                    return;
                }
                
                const confirmed = await ConfirmModal.show({ title: i18n.t('playlist.deleteConfirm', { title: song.title }), type: 'danger' });
                if (confirmed) {
                    try {
                        // 禁用按钮防止重复点击
                        deleteBtn.disabled = true;
                        deleteBtn.style.opacity = '0.5';

                        await playlistManager.removeAt(index);

                        // 确保所有歌单数据都是最新的
                        await playlistManager.loadAll();

                        Toast.success(i18n.t('playlist.deleted'));
                        renderPlaylistUI({ container, onPlay, currentMeta });
                    } catch (err) {
                        console.error(`删除歌曲失败 (索引: ${index}):`, err);
                        Toast.error(i18n.t('playlist.deleteFailed') + ': ' + (err.message || err));
                        
                        // 删除失败时重新启用按钮
                        deleteBtn.disabled = false;
                        deleteBtn.style.opacity = '1';
                    }
                }
            });
            
            // 左侧：删除按钮，右侧：拖拽手柄
            item.appendChild(deleteBtn);
            item.appendChild(leftContainer);
            item.appendChild(info);
            item.appendChild(dragHandle);
        }

        item.addEventListener('click', async (e) => {
            // 如果点击的是拖拽手柄，不触发播放
            if (e.target.closest('.drag-handle')) return;
            // 如果点击的是删除按钮，不触发播放
            if (e.target.closest('.track-menu-btn')) return;
            
            // 如果点击的是当前正在播放的歌曲，打开全屏播放器
            if (isCurrentPlaying) {
                const fullPlayer = document.getElementById('fullPlayer');
                if (fullPlayer) {
                    fullPlayer.style.display = 'flex';
                    setTimeout(() => {
                        fullPlayer.classList.add('show');
                    }, 10);
                }
                return;
            }
            
            // ✅ 点击歌曲：根据当前选择的歌单决定行为
            if (selectedPlaylistId === 'default') {
                // 默认歌单：移动到顶部并播放
                await moveToTopAndPlay(song, index, onPlay, { container, onPlay, currentMeta });
            } else {
                // 非默认歌单：添加到默认歌单但不播放
                await playSongFromSelectedPlaylist(song, onPlay);
            }
        });

        container.appendChild(item);
    });

    // 初始化触摸拖拽排序
    initTouchDragSort(container, renderPlaylistUI, { container, onPlay, currentMeta });
}

// 触摸拖拽排序 - 移动端优化
function initTouchDragSort(container, rerenderFn, rerenderArgs) {
    let draggedItem = null;
    let draggedIndex = -1;
    let placeholder = null;
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
        const items = Array.from(container.querySelectorAll('.playlist-track-item:not(.dragging)'));
        let insertBefore = null;
        
        for (const item of items) {
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
                        await playlistManager.refreshAll();
                        rerenderFn(rerenderArgs);
                    } else {
                        Toast.error(i18n.t('playlist.reorderFailed') + ': ' + (result.error || result.message));
                        await playlistManager.refreshAll();
                        rerenderFn(rerenderArgs);
                    }
                } catch (err) {
                    console.error('调整顺序失败:', err);
                    Toast.error(i18n.t('playlist.reorderFailed'));
                    await playlistManager.refreshAll();
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
        const historyModal = document.getElementById('historyModal');
        if (!historyModal) {
            console.error('[历史] 找不到 historyModal 元素');
            Toast.error('历史模态框未找到');
            return;
        }
        
        // 填充历史列表
        const historyList = document.getElementById('historyList');
        if (!historyList) {
            console.error('[历史] 找不到 historyList 元素');
            Toast.error('历史列表未找到');
            return;
        }
        
        historyList.innerHTML = '';

        // 获取应用主题
        const appTheme = getCurrentAppTheme();
        const colors = getThemeColors(appTheme);

        // 插入搜索框
        const existingSearch = historyModal.querySelector('.history-search-container');
        if (existingSearch) existingSearch.remove();

        const searchContainer = document.createElement('div');
        searchContainer.className = 'history-search-container';
        searchContainer.style.cssText = 'padding: 8px 16px 0; flex-shrink: 0;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = i18n.t('history.search.placeholder');
        searchInput.style.cssText = `
            width: 100%;
            padding: 10px 14px;
            border-radius: 8px;
            border: 1px solid ${appTheme === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)'};
            background: ${appTheme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)'};
            color: ${colors.textColor};
            font-size: 14px;
            outline: none;
            box-sizing: border-box;
        `;
        searchInput.addEventListener('focus', () => {
            searchInput.style.borderColor = '#667eea';
        });
        searchInput.addEventListener('blur', () => {
            searchInput.style.borderColor = appTheme === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';
        });
        searchContainer.appendChild(searchInput);

        const historyContent = historyModal.querySelector('.history-modal-content');
        historyContent.insertBefore(searchContainer, historyList);

        // 历史数据（可变，用于删除后更新）
        let allHistory = [...history];

        // 从历史中移除指定URL的记录
        function removeFromHistory(url) {
            allHistory = allHistory.filter(item => item.url !== url);
        }

        // 渲染单个历史项
        function renderHistoryItem(item) {
            const historyItem = document.createElement('div');
            historyItem.setAttribute('data-url', item.url);
            historyItem.style.cssText = `
                padding: 12px 16px;
                border-bottom: 1px solid ${appTheme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'};
                display: flex;
                align-items: center;
                gap: 12px;
                cursor: pointer;
                transition: background 0.2s;
            `;

            historyItem.addEventListener('mouseover', () => {
                historyItem.style.background = colors.buttonHover;
            });
            historyItem.addEventListener('mouseout', () => {
                historyItem.style.background = 'transparent';
            });

            // 封面
            const thumbnailUrl = item.thumbnail_url;
            const hasValidThumbnail = thumbnailUrl && thumbnailUrl !== 'null' && thumbnailUrl !== 'undefined' && thumbnailUrl.trim() !== '';

            const coverContainer = document.createElement('div');
            coverContainer.style.cssText = `
                width: 40px;
                height: 40px;
                border-radius: 4px;
                background: ${colors.buttonBg};
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            `;

            if (hasValidThumbnail) {
                const cover = document.createElement('img');
                cover.crossOrigin = 'anonymous';
                cover.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';

                const getThumbnailFallbacks = (url) => {
                    if (url && url.includes('img.youtube.com/vi/')) {
                        const baseUrl = url.substring(0, url.lastIndexOf('/'));
                        const normalizedFirst = url.endsWith('/sddefault.jpg')
                            ? baseUrl + '/hqdefault.jpg'
                            : url;
                        return [normalizedFirst, baseUrl + '/mqdefault.jpg', baseUrl + '/default.jpg'];
                    }
                    return [url];
                };

                const fallbackUrls = getThumbnailFallbacks(thumbnailUrl);
                let currentFallbackIndex = 0;

                cover.onerror = function() {
                    currentFallbackIndex++;
                    if (currentFallbackIndex < fallbackUrls.length) {
                        this.src = fallbackUrls[currentFallbackIndex];
                    } else {
                        this.style.display = 'none';
                        const placeholder = document.createElement('div');
                        placeholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 20px;';
                        placeholder.textContent = '🎵';
                        coverContainer.appendChild(placeholder);
                    }
                };

                cover.src = fallbackUrls[0];
                coverContainer.appendChild(cover);
            } else {
                const placeholder = document.createElement('div');
                placeholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 20px;';
                placeholder.textContent = '🎵';
                coverContainer.appendChild(placeholder);
            }

            // 信息
            const info = document.createElement('div');
            info.style.cssText = 'flex: 1; overflow: hidden;';

            const title = document.createElement('div');
            title.style.cssText = `
                color: ${colors.textColor};
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-size: 14px;
            `;
            title.textContent = item.title || i18n.t('track.unknown');

            const typeLabel = document.createElement('div');
            typeLabel.style.cssText = `
                color: ${colors.secondaryText};
                font-size: 12px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-top: 2px;
            `;
            typeLabel.textContent = item.type === 'youtube' ? i18n.t('history.typeYoutube') : i18n.t('history.typeLocal');

            info.appendChild(title);
            info.appendChild(typeLabel);

            // 时间戳
            const timeEl = document.createElement('div');
            timeEl.style.cssText = `
                color: ${colors.secondaryText};
                font-size: 12px;
                white-space: nowrap;
                flex-shrink: 0;
            `;
            const date = new Date((item.ts + player.clockOffset) * 1000);
            timeEl.textContent = date.toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            historyItem.appendChild(coverContainer);
            historyItem.appendChild(info);
            historyItem.appendChild(timeEl);

            // 点击歌曲卡片 - 显示操作菜单
            historyItem.addEventListener('click', async () => {
                const song = {
                    url: item.url,
                    title: item.title,
                    type: item.type,
                    thumbnail_url: item.thumbnail_url
                };
                showHistoryActionMenu(song, historyModal, removeFromHistory, renderFilteredHistory);
            });

            return historyItem;
        }

        // 渲染过滤后的历史列表
        function renderFilteredHistory(filterText) {
            historyList.innerHTML = '';
            const query = (filterText || '').trim().toLowerCase();
            const filtered = query
                ? allHistory.filter(item => (item.title || '').toLowerCase().includes(query))
                : allHistory;

            if (filtered.length === 0) {
                historyList.innerHTML = `<div style="padding: 20px; text-align: center; color: #999;">${
                    query ? i18n.t('history.noResults') : i18n.t('history.empty')
                }</div>`;
            } else {
                filtered.forEach(item => {
                    historyList.appendChild(renderHistoryItem(item));
                });
            }
        }

        // 初始渲染
        renderFilteredHistory('');

        // 搜索框事件
        searchInput.addEventListener('input', () => {
            renderFilteredHistory(searchInput.value);
        });
        
        // 显示模态框
        historyModal.style.display = 'block';
        setTimeout(() => {
            historyModal.classList.add('modal-visible');
        }, 10);
        
        // 为历史模态框添加关闭事件处理
        // 点击背景关闭
        historyModal.onclick = function(e) {
            if (e.target === historyModal) {
                closeHistoryModal(historyModal);
            }
        };
        
        // 为历史模态框内的关闭按钮添加事件处理
        const historyCloseBtn = historyModal.querySelector('.history-modal-close') || 
                               historyModal.querySelector('.modal-close-btn') || 
                               historyModal.querySelector('[data-close]') ||
                               historyModal.querySelector('[data-icon]');
        if (historyCloseBtn) {
            historyCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeHistoryModal(historyModal);
            });
        }

        // Escape 键关闭历史模态框
        const handleHistoryEsc = (e) => {
            if (e.key === 'Escape' && historyModal.classList.contains('modal-visible')) {
                closeHistoryModal(historyModal);
            }
        };
        document.addEventListener('keydown', handleHistoryEsc);
        
        console.log('[历史] 显示了 ' + history.length + ' 条播放历史');
        
    } catch (error) {
        console.error('[历史] 加载失败:', error);
        Toast.error(i18n.t('history.loadFailed') + ': ' + error.message);
        loading.hide();
    }
}

// ✅ 新增：显示歌单选择模态框
async function showSelectPlaylistModal(song, historyModal) {
    try {
        console.log('[歌单选择] 显示歌单选择模态框，歌曲:', song.title);
        
        const selectPlaylistModal = document.getElementById('selectPlaylistModal');
        const selectPlaylistModalBody = document.getElementById('selectPlaylistModalBody');
        
        if (!selectPlaylistModal || !selectPlaylistModalBody) {
            console.error('[歌单选择] 模态框元素未找到');
            Toast.error('❌ 歌单选择器未初始化');
            return;
        }
        
        // 获取应用主题
        const appTheme = getCurrentAppTheme();
        const colors = getThemeColors(appTheme);
        
        // 清空模态框内容
        selectPlaylistModalBody.innerHTML = '';
        
        // 获取所有歌单
        const playlists = playlistManager.getAll();
        
        if (!playlists || playlists.length === 0) {
            selectPlaylistModalBody.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无歌单</div>';
        } else {
            // 为每个歌单创建选项
            playlists.forEach((playlist, index) => {
                const playlistItem = document.createElement('div');
                playlistItem.style.cssText = `
                    padding: 16px;
                    border-bottom: 1px solid ${appTheme === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'};
                    cursor: pointer;
                    transition: background 0.2s;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                `;
                
                // 为不同歌单生成不同的渐变色（与歌单管理列表保持一致）
                const gradients = [
                    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
                    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
                    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
                ];
                const gradient = gradients[index % gradients.length];
                
                // 歌单图标（与歌单管理列表保持一致）
                const icons = ['🎵', '🎧', '🎸', '🎹', '🎤', '🎼', '🎺', '🥁'];
                const icon = playlist.id === 'default' ? '⭐' : icons[index % icons.length];
                
                // 创建图标容器
                const iconEl = document.createElement('div');
                iconEl.style.cssText = `
                    background: ${gradient};
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    flex-shrink: 0;
                `;
                iconEl.textContent = icon;
                playlistItem.appendChild(iconEl);
                
                const info = document.createElement('div');
                info.style.cssText = `
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                `;
                
                const name = document.createElement('div');
                name.style.cssText = `
                    color: ${colors.textColor};
                    font-weight: 600;
                    font-size: 14px;
                `;
                name.textContent = playlist.name;
                
                const count = document.createElement('div');
                count.style.cssText = `
                    color: ${colors.secondaryText};
                    font-size: 12px;
                `;
                count.textContent = `📊 ${playlist.count || 0} 首歌曲`;
                
                info.appendChild(name);
                info.appendChild(count);
                playlistItem.appendChild(info);
                
                // 添加选中标记容器（初始隐藏）
                const checkMark = document.createElement('div');
                checkMark.style.cssText = `
                    color: #4CAF50;
                    font-size: 20px;
                    margin-left: 12px;
                    min-width: 24px;
                    text-align: right;
                    opacity: 0;
                    transition: opacity 0.2s;
                `;
                checkMark.textContent = '✅';
                playlistItem.appendChild(checkMark);
                
                // 点击时选中歌单并添加歌曲
                playlistItem.addEventListener('click', async () => {
                    try {
                        console.log('[歌单选择] 用户选择歌单:', playlist.id, playlist.name);
                        
                        // 显示加载中
                        const originalBg = playlistItem.style.background;
                        playlistItem.style.background = colors.buttonHover;
                        playlistItem.style.opacity = '0.7';
                        playlistItem.style.pointerEvents = 'none';
                        
                        // 获取插入位置（从后端获取当前播放索引）
                        let insertIndex = 1;
                        try {
                            const status = await api.getStatus();
                            const currentIndex = status?.current_index ?? -1;
                            insertIndex = Math.max(1, currentIndex + 1);
                            console.log('[歌单选择] 从后端获取当前播放索引:', { currentIndex, insertIndex });
                        } catch (err) {
                            console.warn('[歌单选择] 无法获取后端状态，使用默认位置 1:', err);
                            insertIndex = 1;
                        }
                        
                        // 添加歌曲到选定歌单
                        const addResult = await api.addToPlaylist({
                            playlist_id: playlist.id,
                            song: song,
                            insert_index: insertIndex
                        });
                        
                        if (addResult.status !== 'OK') {
                            Toast.error('添加失败: ' + (addResult.error || addResult.message));
                            playlistItem.style.background = originalBg;
                            playlistItem.style.opacity = '1';
                            playlistItem.style.pointerEvents = 'auto';
                            return;
                        }
                        
                        // 显示成功动画
                        checkMark.style.opacity = '1';
                        
                        // 刷新歌单数据
                        await playlistManager.refreshAll();
                        
                        // ✅ 关闭歌单选择模态框，返回播放历史
                        selectPlaylistModal.classList.remove('modal-visible');
                        setTimeout(() => {
                            selectPlaylistModal.style.display = 'none';
                        }, 300);
                        
                        // 【修改】只关闭歌单选择框，保持播放历史开放（返回历史页面）
                        console.log('[歌单选择] ✓ 歌曲已添加，返回播放历史页面');
                        
                        Toast.success(`✅ 已添加到「${playlist.name}」`);
                        
                    } catch (error) {
                        console.error('[歌单选择] 添加失败:', error);
                        Toast.error('❌ 添加失败: ' + error.message);
                    }
                });
                
                // 悬停效果
                playlistItem.addEventListener('mouseover', () => {
                    playlistItem.style.background = colors.buttonHover;
                });
                
                playlistItem.addEventListener('mouseout', () => {
                    playlistItem.style.background = 'transparent';
                });
                
                selectPlaylistModalBody.appendChild(playlistItem);
            });
        }
        
        // 显示模态框
        selectPlaylistModal.style.display = 'flex';
        setTimeout(() => {
            selectPlaylistModal.classList.add('modal-visible');
        }, 10);
        
        // 绑定关闭按钮事件
        const closeBtn = document.getElementById('selectPlaylistCloseBtn');
        const cancelBtn = document.getElementById('selectPlaylistCancelBtn');
        
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                console.log('[歌单选择] 用户点击关闭按钮，取消选择');
                selectPlaylistModal.classList.remove('modal-visible');
                setTimeout(() => {
                    selectPlaylistModal.style.display = 'none';
                }, 300);
            };
        }
        
        if (cancelBtn) {
            cancelBtn.onclick = (e) => {
                e.stopPropagation();
                console.log('[歌单选择] 用户点击取消按钮，取消选择');
                selectPlaylistModal.classList.remove('modal-visible');
                setTimeout(() => {
                    selectPlaylistModal.style.display = 'none';
                }, 300);
            };
        }
        
        // 点击背景关闭
        selectPlaylistModal.onclick = (e) => {
            if (e.target === selectPlaylistModal) {
                console.log('[歌单选择] 用户点击背景，取消选择');
                selectPlaylistModal.classList.remove('modal-visible');
                setTimeout(() => {
                    selectPlaylistModal.style.display = 'none';
                }, 300);
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
    historyModal.classList.remove('modal-visible');
    setTimeout(async () => {
        historyModal.style.display = 'none';
        
        // ✅【修复】获取最新的播放状态，而不是使用缓存数据

        const container = document.getElementById('playListContainer');
        let currentStatus = { current_meta: null };
        try {
            const latestStatus = await api.getStatus();
            if (latestStatus && latestStatus.current_meta) {
                currentStatus = latestStatus;
            }
        } catch (err) {
            console.warn('[历史] 获取最新播放状态失败:', err);
            currentStatus = window.app?.lastPlayStatus || { current_meta: null };
        }
        
        if (container) {
            renderPlaylistUI({
                container,
                onPlay: (song) => window.app?.playSong(song),
                currentMeta: currentStatus.current_meta
            });
        }
        
        console.log('[历史] 已关闭，返回默认歌单列表');
    }, 300);
}

// 显示播放历史操作菜单（复用 search-action-menu 样式）
function showHistoryActionMenu(song, historyModal, removeFromHistoryFn, rerenderCallback) {
    // 移除已存在的菜单
    document.querySelectorAll('.search-action-menu').forEach(m => m.remove());

    const menu = document.createElement('div');
    menu.className = 'search-action-menu';
    menu.innerHTML = `
        <div class="search-action-menu-content">
            <div class="search-action-menu-header">
                <div class="search-action-menu-title">${escapeHTML(song.title || '---')}</div>
                <button class="search-action-menu-close">✕</button>
            </div>
            <div class="search-action-menu-body">
                <button class="search-action-menu-item" data-action="play-now">
                    <span class="icon">▶️</span>
                    <span class="label">${i18n.t('history.actionMenu.playNow')}</span>
                </button>
                <button class="search-action-menu-item" data-action="add-to-next">
                    <span class="icon">⏭️</span>
                    <span class="label">${i18n.t('history.actionMenu.addToNext')}</span>
                </button>
                <button class="search-action-menu-item" data-action="add-to-playlist">
                    <span class="icon">📋</span>
                    <span class="label">${i18n.t('history.actionMenu.addToPlaylist')}</span>
                </button>
                <button class="search-action-menu-item" data-action="delete-record" style="color: #ff6b6b;">
                    <span class="icon">🗑️</span>
                    <span class="label">${i18n.t('history.actionMenu.deleteRecord')}</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(menu);
    setTimeout(() => menu.classList.add('show'), 10);

    const closeMenu = () => {
        menu.classList.remove('show');
        setTimeout(() => menu.remove(), 300);
    };

    menu.querySelector('.search-action-menu-close').addEventListener('click', closeMenu);

    menu.addEventListener('click', (e) => {
        if (e.target === menu) closeMenu();
    });

    menu.querySelectorAll('.search-action-menu-item').forEach(menuItem => {
        menuItem.addEventListener('click', async (e) => {
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
        });
    });
}

// 立即播放：直接替换当前播放
async function handleHistoryPlayNow(song) {
    try {
        await api.play(song.url, song.title, song.type || 'local', 0);
        Toast.success(`▶️ ${i18n.t('history.playNowSuccess')}: ${song.title}`);
    } catch (error) {
        console.error('[历史-立即播放] 失败:', error);
        Toast.error('播放失败: ' + error.message);
    }
}

// 添加到下一首：插入到当前播放歌曲之后
async function handleHistoryAddToNext(song) {
    try {
        const currentPlaylistId = playlistManager.getSelectedPlaylistId() || 'default';

        const result = await api.addToPlaylist({
            playlist_id: currentPlaylistId,
            song: {
                url: song.url,
                title: song.title,
                type: song.type || 'local',
                thumbnail_url: song.thumbnail_url || ''
            }
        });

        if (result.status === 'OK') {
            Toast.success(`⏭️ ${i18n.t('history.addToNextSuccess')}: ${song.title}`);
            await playlistManager.loadCurrent();
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
            Toast.success(`🗑️ ${i18n.t('history.deleteSuccess')}`);
            // 从内存数组中移除
            removeFromHistoryFn(song.url);
            // 使用当前搜索条件重新渲染
            if (typeof rerenderCallback === 'function') {
                const searchInput = document.querySelector('.history-search-container input');
                const currentFilter = searchInput ? searchInput.value : '';
                rerenderCallback(currentFilter);
            }
        } else {
            Toast.error(`${i18n.t('history.deleteFailed')}: ${result.error || ''}`);
        }
    } catch (error) {
        console.error('[历史-删除记录] 失败:', error);
        Toast.error(`${i18n.t('history.deleteFailed')}: ${error.message}`);
    }
}
