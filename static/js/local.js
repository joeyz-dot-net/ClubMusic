import { api } from './api.js';
import { Toast } from './ui.js';
import { i18n } from './i18n.js';
import { escapeHTML } from './utils.js';

// 当前导航路径
let currentNavPath = [];

// 防抖：记录正在添加的歌曲
const pendingAdds = new Set();

// 获取目录的封面URL（使用目录中第一个歌曲的封面）
export const getDirCoverUrl = (dir) => {
    // 优先使用目录中的第一个文件
    if (dir.files && dir.files.length > 0) {
        return `/cover/${dir.files[0].rel.split('/').map(encodeURIComponent).join('/')}`;
    }
    // 或者递归查找子目录中的第一个文件
    if (dir.dirs && dir.dirs.length > 0) {
        for (const subDir of dir.dirs) {
            const url = getDirCoverUrl(subDir);
            if (url) return url;
        }
    }
    return '';
};

// 统计目录中的文件数量
export const countFiles = (dir) => {
    let count = (dir.files || []).length;
    (dir.dirs || []).forEach(subDir => {
        count += countFiles(subDir);
    });
    return count;
};

// 根据路径获取节点
export const getNodeByPath = (root, path) => {
    let node = root;
    for (const dirName of path) {
        if (!node || !node.dirs) return null;
        node = node.dirs.find(d => d.name === dirName);
        if (!node) return null;
    }
    return node;
};

// 构建面包屑导航HTML
const buildBreadcrumbHTML = (path) => {
    let html = '<div class="local-breadcrumb">';
    html += `<span class="breadcrumb-home" data-nav-to="root">🏠 ${i18n.t('local.home')}</span>`;
    
    path.forEach((name, index) => {
        const navPath = path.slice(0, index + 1).join('/');
        html += `<span class="breadcrumb-sep">›</span>`;
        html += `<span class="breadcrumb-item" data-nav-to="${escapeHTML(navPath)}">${escapeHTML(name)}</span>`;
    });
    
    // 添加返回按钮
    html += `<button class="local-return-btn" id="localCloseBtn" title="${i18n.t('local.backToPlaylist')}">✕</button>`;
    
    html += '</div>';
    return html;
};

// 构建当前目录内容HTML
const buildCurrentDirHTML = (node, path) => {
    let html = '';
    
    // 始终显示面包屑导航（包括根目录和空目录时）
    html += buildBreadcrumbHTML(path);

    if (!node) {
        return html + `<div class="local-empty">${i18n.t('local.empty')}</div>`;
    }

    const dirs = node.dirs || [];
    const files = node.files || [];

    if (!dirs.length && !files.length) {
        return html + `<div class="local-empty">${i18n.t('local.dirEmpty')}</div>`;
    }

    // 子目录 - 使用专辑卡片方式展示
    if (dirs.length > 0) {
        html += '<div class="local-album-grid">';
        dirs.forEach(dir => {
            const coverUrl = getDirCoverUrl(dir);
            const fileCount = countFiles(dir);
            
            html += `
                <div class="local-album-card" data-dir-name="${escapeHTML(dir.name)}">
                    <div class="local-album-cover">
                        ${coverUrl ? `<img src="${escapeHTML(coverUrl)}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" loading="lazy" />` : ''}
                        <div class="local-album-cover-placeholder" ${coverUrl ? '' : 'style="display:flex"'}>📁</div>
                    </div>
                    <div class="local-album-info">
                        <div class="local-album-title">${escapeHTML(dir.name)}</div>
                        <div class="local-album-count">${i18n.t('local.songCount', { count: fileCount })}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }

    // 文件项 - 使用播放列表样式展示
    if (files.length > 0) {
        html += '<div class="local-songs-list">';
        files.forEach((file, index) => {
            const coverUrl = `/cover/${file.rel.split('/').map(encodeURIComponent).join('/')}`;
            html += buildSongItemHTML(file, coverUrl, index + 1);
        });
        html += '</div>';
    }

    return html;
};

// 构建歌曲项HTML（播放列表样式）
const buildSongItemHTML = (file, coverUrl, seq) => {
    return `
        <div class="playlist-track-item local-song-item" data-file-path="${escapeHTML(file.rel)}" data-file-name="${escapeHTML(file.name)}">
            <div class="track-left">
                <div class="track-cover">
                    <img src="${escapeHTML(coverUrl)}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" loading="lazy" />
                    <div class="track-cover-placeholder">🎵</div>
                </div>
                <div class="track-type">${i18n.t('local.musicType')}</div>
            </div>
            <div class="track-info">
                <div class="track-title">${escapeHTML(file.name)}</div>
            </div>
            <div class="track-seq">${seq}</div>
        </div>
    `;
};

// 保持原来的函数名用于兼容性
const buildFileCardsHTML = (node, path = []) => {
    return buildCurrentDirHTML(node, path);
};

export const localFiles = {
    treeEl: null,
    contentEl: null,
    searchInput: null,
    getPlaylistId: () => window.app?.modules?.playlistManager?.getActiveDefaultId?.() || 'default',
    fullTree: null,
    searchQuery: '',
    onSongAdded: null,

    async init({ treeEl, getCurrentPlaylistId, onSongAdded }) {
        this.treeEl = treeEl;
        this.contentEl = treeEl.querySelector('#localContent');
        this.searchInput = treeEl.querySelector('#localSearchInput');
        this.onSongAdded = onSongAdded;
        
        if (typeof getCurrentPlaylistId === 'function') {
            this.getPlaylistId = getCurrentPlaylistId;
        }
        
        // 绑定搜索输入事件
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderCurrentLevel();
            });
        }
        
        await this.loadTree();
    },

    async loadTree() {
        if (!this.contentEl) return;
        try {
            const response = await fetch('/tree');
            if (!response.ok) {
                console.warn('获取本地文件树失败');
                return;
            }

            const data = await response.json();
            if (data.status === 'OK' && data.tree) {
                this.fullTree = data.tree;
                currentNavPath = [];
                this.renderCurrentLevel();
            } else {
                this.contentEl.innerHTML = `<div class="local-empty">${i18n.t('local.empty')}</div>`;
            }
        } catch (error) {
            console.error('加载本地文件树失败:', error);
        }
    },

    getCurrentNode() {
        return getNodeByPath(this.fullTree, currentNavPath);
    },

    filterNode(node, query) {
        if (!node || !query) {
            return node;
        }
        
        const filteredDirs = (node.dirs || []).filter(dir => {
            if (dir.name.toLowerCase().includes(query)) {
                return true;
            }
            const filteredFiles = (dir.files || []).filter(file =>
                file.name.toLowerCase().includes(query)
            );
            return filteredFiles.length > 0;
        });
        
        const filteredFiles = (node.files || []).filter(file =>
            file.name.toLowerCase().includes(query)
        );
        
        return {
            ...node,
            dirs: filteredDirs,
            files: filteredFiles
        };
    },

    renderCurrentLevel() {
        if (!this.contentEl) return;
        const currentNode = this.getCurrentNode();
        
        const displayNode = this.searchQuery ? this.filterNode(currentNode, this.searchQuery) : currentNode;
        
        this.contentEl.innerHTML = buildFileCardsHTML(displayNode, currentNavPath);
        this.bindClicks();
    },

    // 导航到指定目录
    navigateTo(path) {
        currentNavPath = path;
        this.renderCurrentLevel();
    },

    // 重置到根目录
    resetToRoot() {
        currentNavPath = [];
        this.searchQuery = '';
        if (this.searchInput) {
            this.searchInput.value = '';
        }
        this.renderCurrentLevel();
    },

    bindClicks() {
        if (!this.contentEl) return;
        
        // 绑定返回按钮（关闭本地歌曲页面，返回歌单）
        const localCloseBtn = this.contentEl.querySelector('#localCloseBtn');
        if (localCloseBtn) {
            localCloseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // 触发导航到歌单页面
                const playlistNavBtn = document.querySelector('.nav-item[data-tab="playlists"]');
                if (playlistNavBtn) {
                    playlistNavBtn.click();
                }
            });
        }
        
        // 绑定面包屑导航点击
        this.contentEl.querySelectorAll('.breadcrumb-home, .breadcrumb-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const navTo = el.getAttribute('data-nav-to');
                if (navTo === 'root') {
                    this.navigateTo([]);
                } else {
                    this.navigateTo(navTo.split('/'));
                }
            });
        });

        // 绑定专辑卡片（目录）点击 - 进入目录
        this.contentEl.querySelectorAll('.local-album-card').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const dirName = el.getAttribute('data-dir-name');
                if (dirName) {
                    // 进入子目录
                    this.navigateTo([...currentNavPath, dirName]);
                }
            });
        });

        // 绑定歌曲项点击
        this.contentEl.querySelectorAll('.local-song-item').forEach(el => {
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const filePath = el.getAttribute('data-file-path');
                const fileName = el.getAttribute('data-file-name');
                if (filePath) {
                    await this.addFileToPlaylist(filePath, fileName);
                }
            });
        });
    },

    async addFileToPlaylist(filePath, fileName) {
        // 防抖：如果正在添加此歌曲，忽略重复点击
        if (pendingAdds.has(filePath)) {
            return;
        }
        
        pendingAdds.add(filePath);
        
        const playlistId = this.getPlaylistId();
        const songData = { url: filePath, title: fileName, type: 'local' };

        try {
            // ✅ 计算正确的插入位置：从后端获取当前播放索引
            let insertIndex = 0;  // 默认插入位置为顶部
            try {
                const status = await api.getStatus();
                if (status?._error) {
                    throw new Error(status.error || status.message || 'status unavailable');
                }
                const currentIndex = status?.current_index ?? -1;
                insertIndex = Math.max(0, currentIndex + 1);
                console.log('[本地文件] 从后端获取当前播放索引:', { currentIndex, insertIndex });
            } catch (err) {
                console.warn('[本地文件] 无法获取后端状态，使用默认值:', err);
                insertIndex = 0;
            }

            const response = await api.addToPlaylist({
                playlist_id: playlistId,
                song: songData,
                insert_index: insertIndex
            });

            if (!response?._error && response?.status === 'OK') {
                // 获取歌单名称以显示在toast中
                let playlistName = i18n.t('nav.queue');
                const _localActiveDefault = window.app?.modules?.playlistManager?.getActiveDefaultId?.() || 'default';
                if (playlistId === _localActiveDefault) {
                    playlistName = i18n.t('nav.queue');
                } else if (window.app && window.app.modules && window.app.modules.playlistManager) {
                    const playlist = window.app.modules.playlistManager.playlists.find(p => p.id === playlistId);
                    if (playlist) {
                        playlistName = playlist.name;
                    }
                }
                Toast.success(i18n.t('search.addSuccess', { name: playlistName, title: fileName }));
                if (this.onSongAdded && typeof this.onSongAdded === 'function') {
                    setTimeout(() => {
                        this.onSongAdded();
                    }, 500);
                }
            } else {
                // 重复歌曲使用警告提示而不是错误
                if (response?.duplicate) {
                    Toast.warning(`${fileName} ${i18n.t('search.alreadyInList')}`);
                } else {
                    Toast.error(i18n.t('search.addFailed') + ': ' + (response?.error || response?.message || i18n.t('search.loadMoreFailed')));
                }
            }
        } catch (error) {
            console.error('添加文件失败:', error);
            Toast.error(i18n.t('search.addFailed'));
        } finally {
            // 延迟移除防抖标记，防止快速连续点击
            setTimeout(() => {
                pendingAdds.delete(filePath);
            }, 1000);
        }
    }
};
