import { api } from './api.js?v=2';
import { playlistManager } from './playlist.js?v=34';
import { Toast } from './ui.js';
import { i18n } from './i18n.js';

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

const createInteractiveElement = ({ tag = 'div', className, dataset = {}, label }) => {
    const element = document.createElement(tag);
    element.className = className;
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    if (label) {
        element.setAttribute('aria-label', label);
    }

    Object.entries(dataset).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            element.dataset[key] = value;
        }
    });

    return element;
};

const createCoverImage = ({ src, placeholderText, placeholderClass }) => {
    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement('div');
    placeholder.className = placeholderClass;
    placeholder.textContent = placeholderText;
    placeholder.style.display = src ? 'none' : 'flex';

    if (src) {
        const image = document.createElement('img');
        image.src = src;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            image.style.display = 'none';
            placeholder.style.display = 'flex';
        });
        fragment.appendChild(image);
    }

    fragment.appendChild(placeholder);
    return fragment;
};

const createBreadcrumbElement = (path) => {
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'local-breadcrumb';

    const home = createInteractiveElement({
        tag: 'span',
        className: 'breadcrumb-home',
        dataset: { navTo: 'root' },
        label: i18n.t('local.home')
    });
    home.textContent = `🏠 ${i18n.t('local.home')}`;
    breadcrumb.appendChild(home);

    path.forEach((name, index) => {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-sep';
        separator.textContent = '›';
        breadcrumb.appendChild(separator);

        const item = createInteractiveElement({
            tag: 'span',
            className: 'breadcrumb-item',
            dataset: { navTo: path.slice(0, index + 1).join('/') },
            label: name
        });
        item.textContent = name;
        breadcrumb.appendChild(item);
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'local-return-btn';
    closeButton.id = 'localCloseBtn';
    closeButton.title = i18n.t('local.backToPlaylist');
    closeButton.setAttribute('aria-label', i18n.t('local.backToPlaylist'));
    closeButton.textContent = '✕';
    breadcrumb.appendChild(closeButton);

    return breadcrumb;
};

const createEmptyStateElement = (message) => {
    const empty = document.createElement('div');
    empty.className = 'local-empty';
    empty.textContent = message;
    return empty;
};

const createDirectoryCardElement = (dir, path) => {
    const card = createInteractiveElement({
        className: 'local-album-card',
        dataset: { dirPath: [...path, dir.name].join('/') },
        label: dir.name
    });

    const cover = document.createElement('div');
    cover.className = 'local-album-cover';
    cover.appendChild(createCoverImage({
        src: getDirCoverUrl(dir),
        placeholderText: '📁',
        placeholderClass: 'local-album-cover-placeholder'
    }));

    const info = document.createElement('div');
    info.className = 'local-album-info';

    const title = document.createElement('div');
    title.className = 'local-album-title';
    title.textContent = dir.name;

    const count = document.createElement('div');
    count.className = 'local-album-count';
    count.textContent = i18n.t('local.songCount', { count: countFiles(dir) });

    info.appendChild(title);
    info.appendChild(count);
    card.appendChild(cover);
    card.appendChild(info);

    return card;
};

const createSongItemElement = (file, seq) => {
    const songItem = createInteractiveElement({
        className: 'playlist-track-item local-song-item',
        dataset: { filePath: file.rel, fileName: file.name },
        label: file.name
    });

    const trackLeft = document.createElement('div');
    trackLeft.className = 'track-left';

    const trackCover = document.createElement('div');
    trackCover.className = 'track-cover';
    trackCover.appendChild(createCoverImage({
        src: `/cover/${file.rel.split('/').map(encodeURIComponent).join('/')}`,
        placeholderText: '🎵',
        placeholderClass: 'track-cover-placeholder'
    }));

    const trackType = document.createElement('div');
    trackType.className = 'track-type';
    trackType.textContent = i18n.t('local.musicType');

    trackLeft.appendChild(trackCover);
    trackLeft.appendChild(trackType);

    const trackInfo = document.createElement('div');
    trackInfo.className = 'track-info';

    const trackTitle = document.createElement('div');
    trackTitle.className = 'track-title';
    trackTitle.textContent = file.name;
    trackInfo.appendChild(trackTitle);

    const trackSeq = document.createElement('div');
    trackSeq.className = 'track-seq';
    trackSeq.textContent = String(seq);

    songItem.appendChild(trackLeft);
    songItem.appendChild(trackInfo);
    songItem.appendChild(trackSeq);

    return songItem;
};

const createCurrentDirContent = (node, path) => {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createBreadcrumbElement(path));

    if (!node) {
        fragment.appendChild(createEmptyStateElement(i18n.t('local.empty')));
        return fragment;
    }

    const dirs = node.dirs || [];
    const files = node.files || [];

    if (!dirs.length && !files.length) {
        fragment.appendChild(createEmptyStateElement(i18n.t('local.dirEmpty')));
        return fragment;
    }

    if (dirs.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'local-album-grid';
        dirs.forEach((dir) => {
            grid.appendChild(createDirectoryCardElement(dir, path));
        });
        fragment.appendChild(grid);
    }

    if (files.length > 0) {
        const songs = document.createElement('div');
        songs.className = 'local-songs-list';
        files.forEach((file, index) => {
            songs.appendChild(createSongItemElement(file, index + 1));
        });
        fragment.appendChild(songs);
    }

    return fragment;
};

export const localFiles = {
    treeEl: null,
    contentEl: null,
    searchInput: null,
    getPlaylistId: () => window.app?.modules?.playlistManager?.getActiveDefaultId?.() || 'default',
    fullTree: null,
    searchQuery: '',
    onSongAdded: null,
    hasBoundContentEvents: false,

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
                this.searchQuery = e.target.value.trim();
                this.renderCurrentLevel();
            });
        }

        this.bindContentEvents();
        
        await this.loadTree();
    },

    async loadTree() {
        if (!this.contentEl) return;
        try {
            const data = await api.getFileTree();
            if (data?._error) {
                console.warn('获取本地文件树失败');
                return;
            }
            if (data.status === 'OK' && data.tree) {
                this.fullTree = data.tree;
                currentNavPath = [];
                this.renderCurrentLevel();
            } else {
                this.contentEl.replaceChildren(createEmptyStateElement(i18n.t('local.empty')));
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

        const normalizedQuery = query.toLowerCase();
        const nodeName = typeof node.name === 'string' ? node.name.toLowerCase() : '';

        if (nodeName.includes(normalizedQuery)) {
            return node;
        }

        const filteredDirs = (node.dirs || [])
            .map((dir) => this.filterNode(dir, normalizedQuery))
            .filter((dir) => dir && ((dir.dirs || []).length > 0 || (dir.files || []).length > 0));

        const filteredFiles = (node.files || []).filter((file) =>
            file.name.toLowerCase().includes(normalizedQuery)
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

        this.contentEl.replaceChildren(createCurrentDirContent(displayNode, currentNavPath));
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

    bindContentEvents() {
        if (!this.contentEl || this.hasBoundContentEvents) {
            return;
        }

        this.contentEl.addEventListener('click', (event) => {
            void this.handleContentInteraction(event);
        });

        this.contentEl.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            const interactive = event.target.closest(
                '.breadcrumb-home, .breadcrumb-item, .local-album-card, .local-song-item'
            );

            if (!interactive || !this.contentEl.contains(interactive)) {
                return;
            }

            event.preventDefault();
            interactive.click();
        });

        this.hasBoundContentEvents = true;
    },

    async handleContentInteraction(event) {
        if (!this.contentEl) {
            return;
        }

        const closeButton = event.target.closest('#localCloseBtn');
        if (closeButton && this.contentEl.contains(closeButton)) {
            event.preventDefault();
            this.closeLocalView();
            return;
        }

        const breadcrumb = event.target.closest('.breadcrumb-home, .breadcrumb-item');
        if (breadcrumb && this.contentEl.contains(breadcrumb)) {
            event.preventDefault();
            const navTo = breadcrumb.dataset.navTo;
            this.navigateTo(navTo === 'root' ? [] : navTo.split('/').filter(Boolean));
            return;
        }

        const directoryCard = event.target.closest('.local-album-card');
        if (directoryCard && this.contentEl.contains(directoryCard)) {
            event.preventDefault();
            const dirPath = directoryCard.dataset.dirPath;
            if (dirPath !== undefined) {
                this.navigateTo(dirPath ? dirPath.split('/').filter(Boolean) : []);
            }
            return;
        }

        const songItem = event.target.closest('.local-song-item');
        if (songItem && this.contentEl.contains(songItem)) {
            event.preventDefault();
            const filePath = songItem.dataset.filePath;
            const fileName = songItem.dataset.fileName;
            if (filePath) {
                await this.addFileToPlaylist(filePath, fileName);
            }
        }
    },

    closeLocalView() {
        const playlistNavBtn = document.querySelector('.nav-item[data-tab="playlists"]');
        if (playlistNavBtn) {
            playlistNavBtn.click();
        }
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

            const response = await playlistManager.addSong(playlistId, songData, insertIndex);

            if (response?.status === 'OK') {
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
            } else if (response?.duplicate) {
                Toast.warning(`${fileName} ${i18n.t('search.alreadyInList')}`);
            }
        } catch (error) {
            console.error('添加文件失败:', error);
            Toast.error(i18n.t('search.addFailed') + ': ' + error.message);
        } finally {
            // 延迟移除防抖标记，防止快速连续点击
            setTimeout(() => {
                pendingAdds.delete(filePath);
            }, 1000);
        }
    }
};
