// 搜索功能模块
import { api } from './api.js?v=2';
import { Toast, formatTime, searchLoading } from './ui.js';
import { buildTrackItemElement } from './templates.js';
import { localFiles, getNodeByPath, getDirCoverUrl, countFiles } from './local.js?v=20';
import { playlistManager, renderPlaylistUI } from './playlist.js?v=22';
import { i18n } from './i18n.js';
import { escapeHTML, openOverlayActionMenu, restoreFocus, trapFocusInContainer } from './utils.js';
import { executePlayNow } from './playNow.js?v=17';
import { getCurrentPlaybackMeta } from './playbackState.js?v=16';

const SEARCH_SUCCESS_ICON_MARKUP = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>';

function createMarkupFragment(markup) {
    return document.createRange().createContextualFragment(markup);
}

function snapshotElementChildren(element) {
    return Array.from(element.childNodes).map((node) => node.cloneNode(true));
}

function restoreElementChildren(element, snapshot) {
    element.replaceChildren(...snapshot.map((node) => node.cloneNode(true)));
}

function setElementText(element, text) {
    element.replaceChildren(document.createTextNode(text));
}

function setElementMarkup(element, markup) {
    element.replaceChildren(createMarkupFragment(markup));
}

function createSearchEmptyState(message) {
    const emptyState = document.createElement('div');
    emptyState.className = 'search-empty-state';

    const icon = document.createElement('div');
    icon.className = 'search-empty-icon';
    icon.textContent = '🔍';

    const text = document.createElement('p');
    text.className = 'search-empty-text';
    text.textContent = message;

    emptyState.appendChild(icon);
    emptyState.appendChild(text);
    return emptyState;
}

function createSearchErrorState(message) {
    const errorState = document.createElement('div');
    errorState.className = 'search-error-state';
    errorState.textContent = message;
    return errorState;
}

function createSearchHistoryHeader(count) {
    const header = document.createElement('div');
    header.className = 'search-history-header';
    header.appendChild(document.createTextNode(i18n.t('search.history.title') + ' '));

    const countEl = document.createElement('span');
    countEl.className = 'search-history-count';
    countEl.textContent = `(${count})`;
    header.appendChild(countEl);

    return header;
}

function createSearchHistoryItem(query) {
    const item = document.createElement('div');
    item.className = 'search-history-item';

    const icon = document.createElement('div');
    icon.className = 'search-history-icon';
    icon.textContent = '🔍';

    const text = document.createElement('span');
    text.className = 'search-history-text';
    text.dataset.query = query;
    text.textContent = query;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'search-history-delete';
    deleteButton.dataset.query = query;
    deleteButton.title = i18n.t('search.history.delete');
    deleteButton.setAttribute('aria-label', i18n.t('search.history.delete'));
    deleteButton.textContent = '×';

    item.appendChild(icon);
    item.appendChild(text);
    item.appendChild(deleteButton);
    return item;
}

function createSearchActionMenuHeader(title) {
    const header = document.createElement('div');
    header.className = 'search-action-menu-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'search-action-menu-title';
    titleEl.textContent = title;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'search-action-menu-close';
    closeButton.textContent = '✕';

    header.appendChild(titleEl);
    header.appendChild(closeButton);
    return header;
}

function createPlayNowConfirmView() {
    const fragment = document.createDocumentFragment();

    fragment.appendChild(createSearchActionMenuHeader(i18n.t('search.confirmPlayNow')));

    const body = document.createElement('div');
    body.className = 'search-action-menu-body';

    const message = document.createElement('p');
    message.className = 'play-now-confirm-msg';
    message.textContent = i18n.t('search.confirmPlayNowMsg');

    const buttonRow = document.createElement('div');
    buttonRow.className = 'play-now-confirm-buttons';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'search-action-menu-item play-now-cancel';
    cancelButton.dataset.action = 'confirm-cancel';
    cancelButton.textContent = i18n.t('modal.cancel');

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'search-action-menu-item play-now-confirm';
    confirmButton.dataset.action = 'confirm-play-now';
    confirmButton.textContent = i18n.t('search.confirmPlayNowBtn');

    buttonRow.appendChild(cancelButton);
    buttonRow.appendChild(confirmButton);
    body.appendChild(message);
    body.appendChild(buttonRow);
    fragment.appendChild(body);

    return fragment;
}

function createSearchActionMenuButton({ action, icon, label }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-action-menu-item';
    button.dataset.action = action;

    const iconEl = document.createElement('span');
    iconEl.className = 'icon';
    iconEl.textContent = icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label;

    button.appendChild(iconEl);
    button.appendChild(labelEl);
    return button;
}

function createSearchActionMenuContent({ title, addToPlaylistLabel, showAddToPlaylist, addAllLabel, playlistIcon }) {
    const fragment = document.createDocumentFragment();

    const content = document.createElement('div');
    content.className = 'search-action-menu-content';

    content.appendChild(createSearchActionMenuHeader(title));

    const body = document.createElement('div');
    body.className = 'search-action-menu-body';
    body.appendChild(createSearchActionMenuButton({
        action: 'play-now',
        icon: '▶️',
        label: i18n.t('search.actionMenu.playNow')
    }));
    body.appendChild(createSearchActionMenuButton({
        action: 'add-to-queue',
        icon: '➕',
        label: i18n.t('search.actionMenu.addToQueue')
    }));

    if (showAddToPlaylist) {
        body.appendChild(createSearchActionMenuButton({
            action: 'add-to-playlist',
            icon: '📋',
            label: addToPlaylistLabel
        }));
    }

    body.appendChild(createSearchActionMenuButton({
        action: 'add-all-to-playlist',
        icon: playlistIcon,
        label: addAllLabel
    }));

    content.appendChild(body);
    fragment.appendChild(content);
    return fragment;
}

function createSearchBreadcrumbElement(breadcrumb) {
    const breadcrumbContainer = document.createElement('div');
    breadcrumbContainer.className = 'search-dir-breadcrumb';

    breadcrumb.forEach((item, index) => {
        if (index > 0) {
            const separator = document.createElement('span');
            separator.className = 'search-breadcrumb-sep';
            separator.textContent = '›';
            breadcrumbContainer.appendChild(separator);
        }

        const crumb = document.createElement('span');
        const isLast = index === breadcrumb.length - 1;
        crumb.className = isLast
            ? 'search-breadcrumb-item search-breadcrumb-item--current'
            : 'search-breadcrumb-item';
        crumb.textContent = item.name;
        if (!isLast) {
            crumb.dataset.breadcrumbIndex = String(index);
        }

        breadcrumbContainer.appendChild(crumb);
    });

    return breadcrumbContainer;
}

function createSearchDirCardElement(dir) {
    const card = document.createElement('div');
    card.className = 'search-dir-card';
    card.dataset.dirUrl = dir.rel;
    card.dataset.dirName = dir.name;

    const coverUrl = getDirCoverUrl(dir);
    const cover = document.createElement('div');
    cover.className = 'search-dir-card-cover';

    const placeholder = document.createElement('div');
    placeholder.className = 'search-dir-card-cover-placeholder';
    placeholder.textContent = '📁';
    placeholder.style.display = coverUrl ? 'none' : 'flex';

    if (coverUrl) {
        const image = document.createElement('img');
        image.src = coverUrl;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            image.style.display = 'none';
            placeholder.style.display = 'flex';
        });
        cover.appendChild(image);
    }
    cover.appendChild(placeholder);

    const info = document.createElement('div');
    info.className = 'search-dir-card-info';

    const title = document.createElement('div');
    title.className = 'search-dir-card-title';
    title.textContent = dir.name;

    const count = document.createElement('div');
    count.className = 'search-dir-card-count';
    count.textContent = i18n.t('local.songCount', { count: countFiles(dir) });

    info.appendChild(title);
    info.appendChild(count);

    card.appendChild(cover);
    card.appendChild(info);
    return card;
}

function createSearchDirContentElement(node) {
    const content = document.createDocumentFragment();
    const dirs = node.dirs || [];
    const files = node.files || [];

    if (!dirs.length && !files.length) {
        const empty = document.createElement('div');
        empty.className = 'search-dir-empty';
        empty.textContent = i18n.t('local.dirEmpty');
        content.appendChild(empty);
        return content;
    }

    if (dirs.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'search-dir-grid';
        dirs.forEach((dir) => {
            grid.appendChild(createSearchDirCardElement(dir));
        });
        content.appendChild(grid);
    }

    if (files.length > 0) {
        const songs = document.createElement('div');
        songs.className = 'search-dir-songs';
        files.forEach((file) => {
            songs.appendChild(buildTrackItemElement({
                song: { url: file.rel, title: file.name, type: 'local' },
                type: 'local',
                metaText: file.rel,
                actionButtonClass: 'track-menu-btn search-result-add',
                actionButtonIcon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
                isCover: false
            }));
        });
        content.appendChild(songs);
    }

    return content;
}

function createSearchTabButton(tabName, label, isActive) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-tab' + (isActive ? ' active' : '');
    button.dataset.tab = tabName;
    button.textContent = label;
    return button;
}

function createSearchResultsPanel(panelName, contentNode, isActive) {
    const panel = document.createElement('div');
    panel.className = 'search-results-panel' + (isActive ? ' active' : '');
    panel.dataset.panel = panelName;
    if (contentNode) {
        panel.appendChild(contentNode);
    }
    return panel;
}

function resetScrollPosition(container) {
    if (!container) {
        return;
    }

    if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: 0, behavior: 'auto' });
        return;
    }

    container.scrollTop = 0;
}

function createYoutubeLoadMoreControls() {
    const fragment = document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'search-load-more-container';
    container.id = 'youtubeLoadMoreContainer';

    const loadMoreButton = document.createElement('button');
    loadMoreButton.type = 'button';
    loadMoreButton.className = 'search-load-more-btn';
    loadMoreButton.id = 'youtubeLoadMoreBtn';

    const loadMoreIcon = document.createElement('span');
    loadMoreIcon.className = 'icon';
    loadMoreIcon.textContent = '⬇️';

    const loadMoreLabel = document.createElement('span');
    loadMoreLabel.className = 'label';
    loadMoreLabel.textContent = i18n.t('search.loadMore', { count: 20 });

    loadMoreButton.appendChild(loadMoreIcon);
    loadMoreButton.appendChild(loadMoreLabel);

    const loadAllButton = document.createElement('button');
    loadAllButton.type = 'button';
    loadAllButton.className = 'search-load-all-btn';
    loadAllButton.id = 'youtubeLoadAllBtn';

    const loadAllIcon = document.createElement('span');
    loadAllIcon.className = 'icon';
    loadAllIcon.textContent = '📥';

    const loadAllLabel = document.createElement('span');
    loadAllLabel.className = 'label';
    loadAllLabel.textContent = i18n.t('search.loadAll');

    loadAllButton.appendChild(loadAllIcon);
    loadAllButton.appendChild(loadAllLabel);
    container.appendChild(loadMoreButton);
    container.appendChild(loadAllButton);

    const loadStatus = document.createElement('div');
    loadStatus.className = 'search-load-status';
    loadStatus.id = 'youtubeLoadStatus';
    loadStatus.style.display = 'none';

    const statusText = document.createElement('span');
    statusText.className = 'status-text';
    statusText.textContent = i18n.t('search.loadingMore');
    loadStatus.appendChild(statusText);

    const noMore = document.createElement('div');
    noMore.className = 'search-no-more';
    noMore.id = 'youtubeNoMore';
    noMore.style.display = 'none';

    const noMoreIcon = document.createElement('span');
    noMoreIcon.className = 'icon';
    noMoreIcon.textContent = '✓';

    const noMoreText = document.createElement('span');
    noMoreText.className = 'text';
    noMoreText.textContent = i18n.t('search.allLoaded');

    noMore.appendChild(noMoreIcon);
    noMore.appendChild(noMoreText);

    fragment.appendChild(container);
    fragment.appendChild(loadStatus);
    fragment.appendChild(noMore);
    return fragment;
}

function formatSearchCount(count, limit) {
    if (typeof limit === 'number' && limit > 0 && count >= limit) {
        return `${limit}+`;
    }
    return String(count);
}

function updateSearchTabCounts({ localCount = 0, youtubeCount = 0, localLimit = 0, youtubeLimit = 0 } = {}) {
    const localTab = document.querySelector('.search-tab[data-tab="local"]');
    if (localTab) {
        localTab.textContent = i18n.t('search.localTab', { count: formatSearchCount(localCount, localLimit) });
    }

    const youtubeTab = document.querySelector('.search-tab[data-tab="youtube"]');
    if (youtubeTab) {
        youtubeTab.textContent = i18n.t('search.networkTab', { count: formatSearchCount(youtubeCount, youtubeLimit) });
    }
}

export class SearchManager {
    constructor() {
        this.searchHistory = [];
        this.maxHistory = 20;
        this.searchTimeout = null;
        this.currentPlaylistId = 'default';
        this.lastQuery = '';
        this.isSearching = false;
        this.lastSearchAt = 0;
        this.minInterval = 800; // ms, 降低频率防止抖动
        this.lastSavedQuery = '';
        this.lastSavedAt = 0;
        this.saveInterval = 3000; // ms, 降低输入记录频率
        // 存储当前搜索结果
        this.currentSearchResults = {
            local: [],
            youtube: []
        };
        this.totalSearchResults = {
            local: [],
            youtube: []
        };
        // YouTube搜索加载状态追踪
        this.youtubeLoadState = {
            query: '',               // 当前搜索词
            displayedCount: 0,       // 已显示数量
            totalLoaded: 0,          // 已加载数量
            hasMore: true,           // 是否可能有更多结果
            isLoading: false,        // 是否正在加载
            maxResultsStep: 20,      // 每次加载增量
            maxResultsLimit: 100     // 加载全部的最大值
        };
        this.localResultsLimit = 20;
        this.karaokeMode = false;  // 伴奏模式开关
        // 目录导航状态（在搜索弹窗内浏览目录时使用）
        this.dirNavState = {
            isActive: false,
            breadcrumb: []
            // breadcrumb 格式：[{name: '搜索结果', url: null}, {name: 'Jazz', url: 'Albums/Jazz'}, ...]
            // url: null 表示 sentinel（搜索结果入口）
        };
        this.bulkPlaylistActionInFlight = false;
        this.loadHistory();

        // 异步加载搜索配置，供首次搜索前等待
        this.searchConfigPromise = this.loadYoutubeSearchConfig();
    }

    async runExclusiveBulkPlaylistAction(actionName, action) {
        if (this.bulkPlaylistActionInFlight) {
            console.log(`[搜索] ${actionName} 已在进行中，忽略重复触发`);
            return false;
        }

        this.bulkPlaylistActionInFlight = true;
        try {
            await action();
            return true;
        } finally {
            this.bulkPlaylistActionInFlight = false;
        }
    }

    async getQueueInsertIndex({ fallback = 1, minimum = 1, logPrefix = '[搜索]' } = {}) {
        try {
            const status = await api.getStatus();
            if (status?._error) {
                throw new Error(status.error || status.message || 'status unavailable');
            }

            const currentIndex = status?.current_index ?? -1;
            const insertIndex = Math.max(minimum, currentIndex + 1);
            console.log(`${logPrefix} 从后端获取当前播放索引:`, { currentIndex, insertIndex });
            return insertIndex;
        } catch (err) {
            console.warn(`${logPrefix} 无法获取后端状态，使用默认位置 ${fallback}:`, err);
            return fallback;
        }
    }

    async addSongToPlaylist(playlistId, song, insertIndex) {
        return playlistManager.addSong(playlistId, song, insertIndex);
    }

    getSearchResultsForBatchAction(tabName) {
        return this.totalSearchResults[tabName] || this.currentSearchResults[tabName] || [];
    }

    getAddableSearchSongs(tabName) {
        return this.getSearchResultsForBatchAction(tabName).filter((item) => !item.is_directory && item.type !== 'directory');
    }

    getPlaylistDisplayName(playlistId) {
        const activeDefaultId = window.app?.modules?.playlistManager?.getActiveDefaultId?.() || 'default';
        if (playlistId === activeDefaultId) {
            return i18n.t('nav.queue');
        }

        const playlist = window.app?.modules?.playlistManager?.playlists?.find((item) => item.id === playlistId);
        return playlist?.name || i18n.t('playlist.current');
    }

    notifyBulkAddResult({ successMessage, failureMessage, addedCount, skippedCount = 0, failedCount = 0 }) {
        const duplicatesOnly = addedCount === 0 && skippedCount > 0 && failedCount === 0;
        let message = (addedCount > 0 || duplicatesOnly) ? successMessage : failureMessage;

        if (skippedCount > 0) {
            message += i18n.t('playlist.addSkipped', { count: skippedCount });
        }
        if (failedCount > 0) {
            message += i18n.t('playlist.addFailed', { count: failedCount });
        }

        if (addedCount > 0 && skippedCount === 0 && failedCount === 0) {
            Toast.success(message);
            return;
        }

        if (addedCount === 0 && failedCount > 0 && skippedCount === 0) {
            Toast.error(message);
            return;
        }

        Toast.warning(message);
    }

    renderPlaylistFromCache() {
        const container = document.getElementById('playListContainer');
        if (!container) {
            return false;
        }

        renderPlaylistUI({
            container,
            onPlay: (song) => window.app?.playSong(song),
            currentMeta: getCurrentPlaybackMeta()
        });
        return true;
    }

    async refreshPlaylistView({ logPrefix = '[搜索]', successLogMessage = '' } = {}) {
        try {
            await playlistManager.refreshAll();
            if (!this.renderPlaylistFromCache()) {
                throw new Error('playlist container unavailable');
            }
            if (successLogMessage) {
                console.log(successLogMessage);
            }
            return true;
        } catch (err) {
            console.warn(`${logPrefix} 刷新播放列表失败:`, err);
        }

        try {
            if (this.refreshPlaylist) {
                await this.refreshPlaylist();
                console.log(`${logPrefix} 已通过应用回退刷新播放列表`);
                return true;
            }

            if (this.renderPlaylistFromCache()) {
                console.log(`${logPrefix} 已通过缓存回退重绘播放列表`);
                return true;
            }

            throw new Error('playlist container unavailable');
        } catch (fallbackErr) {
            console.warn(`${logPrefix} 回退刷新失败:`, fallbackErr);
            Toast.warning(i18n.t('playlist.opFailed'));
            return false;
        }
    }

    setActiveSearchTab(container, tabName) {
        if (!container) return;

        container.querySelectorAll('.search-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        container.querySelectorAll('.search-results-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });

        resetScrollPosition(container);
    }

    // 加载YouTube搜索配置
    async loadYoutubeSearchConfig() {
        try {
            const config = await api.getYoutubeSearchConfig();
            this.localResultsLimit = config.local_max_results || this.localResultsLimit;
            this.youtubeLoadState.maxResultsStep = config.page_size || 20;
            this.youtubeLoadState.maxResultsLimit = config.max_results || 100;
            console.log('[YouTube搜索配置] 加载成功:', config);
            return config;
        } catch (error) {
            console.warn('[YouTube搜索配置] 加载失败，使用默认值:', error);
            // 保持默认值
            return null;
        }
    }

    // 初始化搜索UI
    initUI(currentPlaylistIdGetter, refreshPlaylistCallback, closeModalCallback = null) {
        this.getCurrentPlaylistId = currentPlaylistIdGetter;
        this.refreshPlaylist = refreshPlaylistCallback;
        this.closeModalCallback = closeModalCallback;
        
        const searchModalBack = document.getElementById('searchModalBack');
        const searchModal = document.getElementById('searchModal');
        const searchModalInput = document.getElementById('searchModalInput');
        const searchModalBody = document.getElementById('searchModalBody');
        const searchModalHistory = document.getElementById('searchModalHistory');
        const searchModalHistoryList = document.getElementById('searchModalHistoryList');
        const searchModalHistoryClear = document.getElementById('searchModalHistoryClear');

        if (searchModalBody && !searchModalBody._delegatedClickHandler) {
            searchModalBody._delegatedClickHandler = async (event) => {
                const loadMoreArea = event.target.closest('.search-load-more-container, .search-load-status, .search-no-more');

                const tab = event.target.closest('.search-tab');
                if (tab && searchModalBody.contains(tab)) {
                    this.setActiveSearchTab(searchModalBody, tab.dataset.tab);
                    return;
                }

                const loadMoreBtn = event.target.closest('#youtubeLoadMoreBtn');
                if (loadMoreBtn && searchModalBody.contains(loadMoreBtn)) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.loadMoreYoutubeResults(false);
                    return;
                }

                const loadAllBtn = event.target.closest('#youtubeLoadAllBtn');
                if (loadAllBtn && searchModalBody.contains(loadAllBtn)) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.loadMoreYoutubeResults(true);
                    return;
                }

                if (loadMoreArea && searchModalBody.contains(loadMoreArea)) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                const breadcrumbItem = event.target.closest('.search-breadcrumb-item[data-breadcrumb-index]');
                if (breadcrumbItem && searchModalBody.contains(breadcrumbItem)) {
                    const index = parseInt(breadcrumbItem.getAttribute('data-breadcrumb-index'), 10);
                    this.navigateToBreadcrumb(index);
                    return;
                }

                const dirCard = event.target.closest('.search-dir-card');
                if (dirCard && searchModalBody.contains(dirCard)) {
                    const dirUrl = dirCard.getAttribute('data-dir-url');
                    const dirName = dirCard.getAttribute('data-dir-name');
                    this.enterDirectory(dirUrl, dirName);
                    return;
                }

                const addButton = event.target.closest('.search-result-add');
                if (addButton && searchModalBody.contains(addButton)) {
                    event.stopPropagation();
                    const item = addButton.closest('.search-result-item');
                    if (!item) return;

                    const isDirectory = item.getAttribute('data-directory') === 'true' || item.getAttribute('data-type') === 'directory';
                    this.showSearchActionMenu(addButton, item, isDirectory);
                    return;
                }

                const directoryItem = event.target.closest('.search-result-item[data-directory="true"]');
                if (directoryItem && searchModalBody.contains(directoryItem) && !event.target.closest('.track-menu-btn')) {
                    const url = directoryItem.getAttribute('data-url');
                    const title = directoryItem.getAttribute('data-title');
                    this.enterDirectory(url, title);
                }
            };

            searchModalBody.addEventListener('click', searchModalBody._delegatedClickHandler);
        }

        if (searchModalHistoryList && !searchModalHistoryList._delegatedClickHandler) {
            searchModalHistoryList._delegatedClickHandler = async (event) => {
                const deleteButton = event.target.closest('.search-history-delete');
                if (deleteButton) {
                    event.stopPropagation();
                    const query = deleteButton.getAttribute('data-query');
                    this.removeFromHistory(query);
                    this.showSearchHistory();
                    return;
                }

                const historyText = event.target.closest('.search-history-text');
                if (!historyText) {
                    return;
                }

                const query = historyText.getAttribute('data-query');
                const input = document.getElementById('searchModalInput');
                if (input) {
                    input.value = query;
                }
                await this.performSearch(query);
            };

            searchModalHistoryList.addEventListener('click', searchModalHistoryList._delegatedClickHandler);
        }

        // 伴奏模式开关
        const karaokeModeToggle = document.getElementById('karaokeModeToggle');
        if (karaokeModeToggle) {
            karaokeModeToggle.addEventListener('change', () => {
                this.karaokeMode = karaokeModeToggle.checked;
                const input = document.getElementById('searchModalInput');
                if (input && input.value.trim()) {
                    this.lastQuery = '';  // 绕过重复搜索检查，强制重新搜索
                    this.performSearch(input.value.trim());
                }
            });
        }

        if (searchModalBack && searchModal) {
            const closeAndRefresh = async () => {
                console.log('🔍 搜索关闭');

                const previousActiveElement = searchModal._previousActiveElement;
                
                // 移除搜索栏目的active状态和样式
                searchModal.classList.remove('modal-visible');
                searchModal.setAttribute('aria-hidden', 'true');
                setTimeout(() => {
                    searchModal.style.display = 'none';
                    restoreFocus(previousActiveElement);
                }, 300);
                
                const navItems = document.querySelectorAll('.nav-item');
                const searchNavItem = Array.from(navItems).find(item => item.getAttribute('data-tab') === 'search');
                if (searchNavItem) {
                    searchNavItem.classList.remove('active');
                }
                
                // 延迟后返回到当前选择的歌单（只刷新显示，不改变选择）
                setTimeout(() => {
                    // ✅ 仅刷新播放列表显示，保持当前选择的歌单
                    if (this.refreshPlaylist) {
                        void this.refreshPlaylist();
                    } else {
                        this.renderPlaylistFromCache();
                    }

                    if (typeof this.closeModalCallback === 'function') {
                        this.closeModalCallback();
                    }
                    
                    // ✅ 显示歌单区域（不点击队列按钮，这样能保持当前选择的歌单）
                    const playlistsNavItem = Array.from(navItems).find(item => item.getAttribute('data-tab') === 'playlists');
                    if (playlistsNavItem && !playlistsNavItem.classList.contains('active')) {
                        playlistsNavItem.classList.add('active');
                    }
                    // 显示歌单容器
                    const playlistEl = document.getElementById('playlist');
                    if (playlistEl) {
                        playlistEl.style.display = 'flex';
                    }
                }, 300);
            };

            searchModalBack.addEventListener('click', closeAndRefresh);

            if (!searchModal._keydownHandler) {
                searchModal._keydownHandler = (e) => {
                    if (!searchModal.classList.contains('modal-visible')) return;

                    if (e.key === 'Escape') {
                        e.preventDefault();
                        closeAndRefresh();
                        return;
                    }

                    trapFocusInContainer(e, searchModal);
                };
                document.addEventListener('keydown', searchModal._keydownHandler);
            }
            
            // 点击背景关闭
            const searchModalOverlay = searchModal.querySelector('.search-modal-overlay');
            if (searchModalOverlay) {
                searchModalOverlay.addEventListener('click', closeAndRefresh);
            }
        }
        
        // 搜索功能实现
        if (searchModalInput && searchModalBody) {
            // 实时搜索
            searchModalInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                
                // 清除之前的定时器
                if (this.searchTimeout) {
                    clearTimeout(this.searchTimeout);
                }
                
                // 如果输入为空，显示搜索历史
                if (!query) {
                    this.showSearchHistory();
                    return;
                }
                
                // 延迟搜索（防抖）
                this.searchTimeout = setTimeout(async () => {
                    await this.performSearch(query);
                }, 3000);
            });
            
            // 按下回车搜索
            searchModalInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) {
                        if (this.searchTimeout) {
                            clearTimeout(this.searchTimeout);
                        }
                        await this.performSearch(query);
                    }
                }
            });
            
            // 聚焦时显示搜索历史
            searchModalInput.addEventListener('focus', () => {
                if (!searchModalInput.value.trim()) {
                    this.showSearchHistory();
                }
            });
        }
        
        // 清空搜索历史
        if (searchModalHistoryClear) {
            searchModalHistoryClear.addEventListener('click', () => {
                this.clearHistory();
                this.showSearchHistory();
            });
        }
    }

    // 显示搜索历史
    showSearchHistory() {
        const searchModalHistory = document.getElementById('searchModalHistory');
        const searchModalHistoryList = document.getElementById('searchModalHistoryList');
        const searchModalBody = document.getElementById('searchModalBody');
        
        if (!searchModalHistory || !searchModalHistoryList || !searchModalBody) return;
        
        const history = this.getHistory();
        
        if (history.length === 0) {
            searchModalHistory.style.display = 'none';
            searchModalBody.replaceChildren(createSearchEmptyState(i18n.t('search.inputPrompt')));
            resetScrollPosition(searchModalBody);
            return;
        }
        
        searchModalHistory.style.display = 'block';
        searchModalBody.replaceChildren();

        const fragment = document.createDocumentFragment();
        fragment.appendChild(createSearchHistoryHeader(history.length));
        history.forEach((item) => {
            fragment.appendChild(createSearchHistoryItem(item));
        });

        searchModalHistoryList.replaceChildren(fragment);
        resetScrollPosition(searchModalBody);
    }

    // 执行搜索
    async performSearch(query) {
        const searchModalBody = document.getElementById('searchModalBody');
        const searchModalHistory = document.getElementById('searchModalHistory');
        
        if (!searchModalBody) return;

        if (this.searchConfigPromise) {
            await this.searchConfigPromise;
        }

        const now = Date.now();
        if (this.isSearching) return; // 正在搜索时不叠加
        if (query === this.lastQuery && now - this.lastSearchAt < this.minInterval) {
            return; // 相同关键词过快重复输入，直接忽略
        }
        this.lastQuery = query;
        this.lastSearchAt = now;
        this.isSearching = true;
        // 新搜索时退出目录视图模式
        this.dirNavState = { isActive: false, breadcrumb: [] };
        
        try {
            // 隐藏搜索历史
            if (searchModalHistory) {
                searchModalHistory.style.display = 'none';
            }
            
            // 显示全屏加载动画
            searchLoading.show(i18n.t('search.searching'));
            
            // 调用搜索API（伴奏模式时追加"伴奏"关键词）
            const actualQuery = this.karaokeMode ? `${query} 伴奏` : query;
            const result = await this.search(actualQuery);
            
            if (!result || result.status !== 'OK') {
                throw new Error(result?.error || i18n.t('search.loadMoreFailed'));
            }

            if (typeof result.local_max_results === 'number') {
                this.localResultsLimit = result.local_max_results;
            }
            if (typeof result.youtube_max_results === 'number') {
                this.youtubeLoadState.maxResultsLimit = result.youtube_max_results;
            }
            
            const localResults = result.local || [];
            const youtubeResults = result.youtube || [];

            this.renderSearchResults(localResults, youtubeResults, actualQuery);
            
        } catch (error) {
            console.error('搜索失败:', error);
            searchModalBody.replaceChildren(createSearchErrorState(i18n.t('search.failed', { error: error.message })));
            resetScrollPosition(searchModalBody);
        } finally {
            // 隐藏全屏加载动画
            searchLoading.hide();
            this.isSearching = false;
            this.lastSearchAt = Date.now();
        }
    }

    // 渲染搜索结果
    renderSearchResults(localResults, youtubeResults, searchQuery = this.lastQuery, options = {}) {
        const searchModalBody = document.getElementById('searchModalBody');
        if (!searchModalBody) return;

        const fullLocalResults = localResults || [];
        const fullYoutubeResults = youtubeResults || [];
        const requestedYoutubeDisplayCount = options.youtubeDisplayCount ?? this.youtubeLoadState.maxResultsStep;
        const displayedYoutubeCount = Math.max(0, Math.min(requestedYoutubeDisplayCount, fullYoutubeResults.length));
        const displayedYoutubeResults = fullYoutubeResults.slice(0, displayedYoutubeCount);

        // 保存当前显示结果与总结果
        this.currentSearchResults = {
            local: fullLocalResults,
            youtube: displayedYoutubeResults
        };
        this.totalSearchResults = {
            local: fullLocalResults,
            youtube: fullYoutubeResults
        };

        const buildList = (items, type) => {
            if (!items || items.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'search-empty';
                empty.textContent = i18n.t('search.noResults');
                return empty;
            }
            const fragment = document.createDocumentFragment();
            items.forEach((song) => {
                // ✅ 支持目录类型显示
                const isDirectory = song.is_directory || song.type === 'directory';
                const meta = isDirectory
                    ? i18n.t('search.typeDirectory')
                    : (type === 'local'
                        ? (song.url || i18n.t('track.unknownLocation'))
                        : (song.duration ? formatTime(song.duration) : i18n.t('track.unknownDuration')));

                const icon = isDirectory
                    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>'
                    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';

                fragment.appendChild(buildTrackItemElement({
                    song,
                    type,
                    metaText: meta,
                    actionButtonClass: `track-menu-btn search-result-add ${isDirectory ? 'add-directory' : ''}`,
                    actionButtonIcon: icon,
                    isCover: song.is_directory || song.type === 'directory' // 标记是目录
                }));
            });
            return fragment;
        };

        const defaultTab = options.preferredTab || (fullYoutubeResults.length > 0 ? 'youtube' : 'local');

        const tabs = document.createElement('div');
        tabs.className = 'search-tabs';
        tabs.appendChild(createSearchTabButton('local', i18n.t('search.localTab', { count: fullLocalResults.length }), defaultTab === 'local'));
        tabs.appendChild(createSearchTabButton('youtube', i18n.t('search.networkTab', { count: fullYoutubeResults.length }), defaultTab === 'youtube'));

        const panels = document.createElement('div');
        panels.className = 'search-tab-panels';

        const localPanel = createSearchResultsPanel('local', buildList(fullLocalResults, 'local'), defaultTab === 'local');
        const youtubePanel = createSearchResultsPanel('youtube', buildList(displayedYoutubeResults, 'youtube'), defaultTab === 'youtube');

        if (fullYoutubeResults.length > displayedYoutubeResults.length) {
            youtubePanel.appendChild(createYoutubeLoadMoreControls());
        }

        panels.appendChild(localPanel);
        panels.appendChild(youtubePanel);
        searchModalBody.replaceChildren(tabs, panels);
        resetScrollPosition(searchModalBody);

        updateSearchTabCounts({
            localCount: this.totalSearchResults.local.length,
            youtubeCount: this.totalSearchResults.youtube.length,
            localLimit: this.localResultsLimit,
            youtubeLimit: this.youtubeLoadState.maxResultsLimit
        });

        // 初始化YouTube加载状态，确保 load more 延续当前实际查询词
        this.youtubeLoadState.query = searchQuery;
        this.youtubeLoadState.displayedCount = displayedYoutubeResults.length;
        this.youtubeLoadState.totalLoaded = displayedYoutubeResults.length;
        this.youtubeLoadState.hasMore = displayedYoutubeResults.length < fullYoutubeResults.length;
        this.youtubeLoadState.isLoading = false;

        this.updateYoutubeLoadUI();
    }
    
    /**
     * 显示搜索结果操作菜单（全屏模态框）
     */
    showSearchActionMenu(button, item, isDirectory) {
        const songData = {
            url: item.getAttribute('data-url'),
            title: item.getAttribute('data-title'),
            type: item.getAttribute('data-type'),
            thumbnail_url: item.getAttribute('data-thumbnail_url') || ''
        };

        // 获取当前激活的标签页
        const activeTab = document.querySelector('.search-tab.active');
        const currentTab = activeTab ? activeTab.getAttribute('data-tab') : 'local';
        const resultCount = this.getAddableSearchSongs(currentTab).length;

        // 获取当前歌单信息用于显示
        let playlistName = i18n.t('playlist.current');
        let playlistIcon = '📥';
        let selectedPlaylistId = 'default';

        try {
            const playlistManager = window.app?.modules?.playlistManager;
            if (playlistManager) {
                playlistName = playlistManager.getCurrentName() || i18n.t('playlist.current');
                playlistIcon = playlistManager.getCurrentPlaylistIcon() || '📥';
                selectedPlaylistId = playlistManager.getSelectedPlaylistId() || playlistManager.getActiveDefaultId?.() || 'default';
            }
        } catch (err) {
            console.warn('[搜索菜单] 获取歌单信息失败:', err);
        }

        // 根据当前选择的歌单决定"添加到歌单"按钮的标签
        const activeDefaultId = window.app?.modules?.playlistManager?.getActiveDefaultId?.() || 'default';
        const addToPlaylistLabel = selectedPlaylistId !== activeDefaultId
            ? i18n.t('search.actionMenu.addToPlaylistNamed', { name: playlistName })
            : i18n.t('search.actionMenu.addToPlaylist');

        const { menu } = openOverlayActionMenu({
            content: createSearchActionMenuContent({
                title: songData.title,
                addToPlaylistLabel,
                showAddToPlaylist: !isDirectory,
                addAllLabel: i18n.t('search.actionMenu.addAll', { count: resultCount, name: playlistName }),
                playlistIcon
            }),
            onMenuClick: async (e, { menu, closeMenu }) => {
                const menuItem = e.target.closest('.search-action-menu-item');
                if (!menuItem || !menu.contains(menuItem)) {
                    return;
                }

                e.stopPropagation();
                const action = menuItem.getAttribute('data-action');

                if (action === 'play-now') {
                    this.showPlayNowConfirm(menu, songData, isDirectory, button, closeMenu);
                    return;
                }

                if (action === 'confirm-cancel') {
                    closeMenu();
                    return;
                }

                if (action === 'confirm-play-now') {
                    closeMenu();
                    setTimeout(() => this.handlePlayNow(songData, isDirectory, button), 300);
                    return;
                }

                closeMenu();

                setTimeout(async () => {
                    if (action === 'add-to-queue') {
                        await this.handleAddToQueue(songData, isDirectory, button);
                    } else if (action === 'add-to-playlist') {
                        const playlistManager = window.app?.modules?.playlistManager;
                        const selectedId = playlistManager?.getSelectedPlaylistId() || playlistManager?.getActiveDefaultId?.() || 'default';
                        const activeDefault = playlistManager?.getActiveDefaultId?.() || 'default';
                        if (selectedId !== activeDefault) {
                            try {
                                const result = await this.addSongToPlaylist(selectedId, songData, null);
                                if (result?.status === 'OK') {
                                    const name = playlistManager.getCurrentName() || selectedId;
                                    Toast.success(i18n.t('search.addSuccess', { name, title: songData.title }));
                                    await playlistManager.refreshAll();
                                } else if (result.duplicate) {
                                    Toast.warning(`${songData.title} ${i18n.t('search.alreadyInList')}`);
                                }
                            } catch (err) {
                                console.error('[搜索] 添加到歌单失败:', err);
                                Toast.error(i18n.t('search.addFailed') + ': ' + err.message);
                            }
                        } else {
                            const { showSelectPlaylistModal } = await import('./playlist.js?v=22');
                            await showSelectPlaylistModal(songData, null);
                        }
                    } else if (action === 'add-all-to-playlist') {
                        await this.handleAddAllToPlaylist(currentTab);
                    }
                }, 300);
            }
        });
    }

    /**
     * 立即播放确认视图：在现有菜单内切换为确认界面
     */
    showPlayNowConfirm(menu, songData, isDirectory, btn, closeMenu) {
        const content = menu.querySelector('.search-action-menu-content');
        content.replaceChildren(createPlayNowConfirmView());
    }
    
    /**
     * 立即播放：将歌曲插入队列顶部并播放
     */
    async handlePlayNow(songData, isDirectory, btn) {
        const originalContent = snapshotElementChildren(btn);
        try {
            const playlistId = this.getCurrentPlaylistId ? this.getCurrentPlaylistId() : this.currentPlaylistId;

            if (isDirectory) {
                Toast.warning(i18n.t('search.dirNotSupported'));
                return;
            }

            // 显示加载状态
            setElementText(btn, '⏳');
            btn.disabled = true;

            const playlistManager = window.app?.modules?.playlistManager;
            await executePlayNow({
                song: songData,
                addToQueueTop: () => this.addSongToPlaylist(playlistId, songData, 0),
                refreshPlaylist: playlistManager ? () => playlistManager.refreshAll() : null,
                addFailedMessage: i18n.t('search.addSongFailed')
            });
            setElementMarkup(btn, SEARCH_SUCCESS_ICON_MARKUP);

        } catch (error) {
            console.error('[立即播放] 失败:', error);
            Toast.error(i18n.t('search.playFailed') + ': ' + error.message);
            restoreElementChildren(btn, originalContent);
            btn.disabled = false;
        }
    }
    
    /**
     * 添加到队列：原有逻辑
     */
    async handleAddToQueue(songData, isDirectory, btn) {
        try {
            const playlistId = this.getCurrentPlaylistId ? this.getCurrentPlaylistId() : this.currentPlaylistId;
            
            if (isDirectory) {
                return this.runExclusiveBulkPlaylistAction('目录添加', async () => {
                    // ✅ 目录处理：添加整个目录下的所有歌曲
                    console.log('[搜索] 添加整个目录:', songData.url);
                    
                    // 显示加载状态
                    const originalContent = snapshotElementChildren(btn);
                    setElementText(btn, i18n.t('search.loadingDir'));
                    btn.disabled = true;
                    
                    try {
                        // 调用后端API获取目录下的所有歌曲
                        const result = await api.getDirectorySongs(songData.url);
                        if (result?._error) {
                            throw new Error(result.error || result.message || i18n.t('search.getDirFailed'));
                        }

                        if (result.status !== 'OK') {
                            throw new Error(result.error || i18n.t('search.getDirFailed'));
                        }
                        
                        const songs = result.songs || [];
                        if (songs.length === 0) {
                            Toast.warning(i18n.t('search.noMusicInDir'));
                            restoreElementChildren(btn, originalContent);
                            btn.disabled = false;
                            return;
                        }
                        
                        // 将所有歌曲添加到歌单（保持原有顺序）
                        let addedCount = 0;
                        let skippedCount = 0;
                        let failedCount = 0;
                        let insertIndex = null;  // 第一首歌曲的插入位置
                        
                        for (let i = 0; i < songs.length; i++) {
                            const song = songs[i];
                            
                            try {
                                // 第一首歌曲时计算插入位置
                                if (i === 0) {
                                    insertIndex = await this.getQueueInsertIndex({
                                        fallback: 1,
                                        minimum: 1,
                                        logPrefix: '[搜索]'
                                    });
                                }
                                
                                // 计算当前歌曲的插入位置（后续歌曲依次递增）
                                const currentInsertIndex = insertIndex + i;
                                
                                const addResponse = await this.addSongToPlaylist(playlistId, song, currentInsertIndex);
                                
                                if (!addResponse?._error && addResponse?.status === 'OK') {
                                    addedCount++;
                                    console.log(`[搜索] ✓ 添加歌曲 (${i+1}/${songs.length}): ${song.title} 在位置 ${currentInsertIndex}`);
                                } else if (addResponse?.duplicate) {
                                    skippedCount++;
                                    console.warn(`[搜索] 跳过重复歌曲: ${song.title}`);
                                } else {
                                    failedCount++;
                                    console.warn(`[搜索] ✗ 添加歌曲失败: ${song.title}`, addResponse?.error || addResponse?.message || addResponse);
                                }
                            } catch (err) {
                                failedCount++;
                                console.warn(`[搜索] 添加歌曲异常: ${err.message}`);
                            }
                        }

                        const playlistName = this.getPlaylistDisplayName(playlistId);
                        this.notifyBulkAddResult({
                            successMessage: i18n.t('search.addDirSuccess', { count: addedCount, name: playlistName }),
                            failureMessage: i18n.t('search.addDirFailed'),
                            addedCount,
                            skippedCount,
                            failedCount
                        });

                        if (addedCount > 0) {
                            setElementMarkup(btn, SEARCH_SUCCESS_ICON_MARKUP);
                        } else {
                            restoreElementChildren(btn, originalContent);
                            btn.disabled = false;
                        }
                        
                        await this.refreshPlaylistView({
                            logPrefix: '[搜索]',
                            successLogMessage: '[搜索] ✓ 播放列表已刷新 - ' + addedCount + ' 首歌曲'
                        });
                    } catch (error) {
                        console.error('添加目录歌曲失败:', error);
                        Toast.error(i18n.t('search.addDirFailed') + ': ' + error.message);
                        restoreElementChildren(btn, originalContent);
                        btn.disabled = false;
                    }
                });
            } else {
                // ✅ 文件处理：添加单个歌曲
                const insertIndex = await this.getQueueInsertIndex({
                    fallback: 1,
                    minimum: 1,
                    logPrefix: '[搜索-单文件]'
                });

                const response = await this.addSongToPlaylist(playlistId, songData, insertIndex);
                
                if (!response?._error && response?.status === 'OK') {
                    // 获取歌单名称以显示在toast中
                    let playlistName = i18n.t('nav.queue');
                    const _activeDefault2 = window.app?.modules?.playlistManager?.getActiveDefaultId?.() || 'default';
                    if (playlistId === _activeDefault2) {
                        playlistName = i18n.t('nav.queue');
                    } else if (window.app && window.app.modules && window.app.modules.playlistManager) {
                        const playlist = window.app.modules.playlistManager.playlists.find(p => p.id === playlistId);
                        if (playlist) {
                            playlistName = playlist.name;
                        }
                    }
                    Toast.success(i18n.t('search.addSuccess', { name: playlistName, title: songData.title }));
                    setElementMarkup(btn, SEARCH_SUCCESS_ICON_MARKUP);
                    btn.disabled = true;
                    
                    await this.refreshPlaylistView({
                        logPrefix: '[搜索]',
                        successLogMessage: '[搜索] ✓ 播放列表已刷新 - 已添加单曲'
                    });
                } else {
                    // 重复歌曲使用警告提示
                    if (response?.duplicate) {
                        Toast.warning(`${songData.title} ${i18n.t('search.alreadyInList')}`);
                    } else {
                        throw new Error(response?.error || response?.message || i18n.t('search.addFailed'));
                    }
                }
            }
        } catch (error) {
            console.error('添加歌曲失败:', error);
            Toast.error(i18n.t('search.addFailed'));
        }
    }

    /**
     * 添加全部搜索结果到当前歌单
     */
    async handleAddAllToPlaylist(currentTab) {
        try {
            const playlistId = this.getCurrentPlaylistId ? this.getCurrentPlaylistId() : this.currentPlaylistId;
            const results = this.getSearchResultsForBatchAction(currentTab);

            if (results.length === 0) {
                Toast.warning(i18n.t('search.noResultsToAdd'));
                return;
            }

            const songs = this.getAddableSearchSongs(currentTab);

            if (songs.length === 0) {
                Toast.warning(i18n.t('search.noValidSongs'));
                return;
            }

            await this.runExclusiveBulkPlaylistAction('批量添加', async () => {
                // 显示加载提示
                Toast.info(i18n.t('search.batchAddInfo', { count: songs.length }));
                searchLoading.show(i18n.t('search.batchAddLoading', { count: songs.length }));

                try {
                    // 获取当前播放位置
                    const insertIndex = await this.getQueueInsertIndex({
                        fallback: 1,
                        minimum: 1,
                        logPrefix: '[批量添加]'
                    });

                    // 批量添加歌曲
                    let addedCount = 0;
                    let skippedCount = 0;
                    let failedCount = 0;
                    for (let i = 0; i < songs.length; i++) {
                        const song = songs[i];
                        const currentInsertIndex = insertIndex + i;

                        try {
                            // 准备歌曲数据
                            const songData = {
                                url: song.url,
                                title: song.title || song.name || i18n.t('track.unknown'),
                                type: song.type || 'local',
                                duration: song.duration || 0,
                                thumbnail_url: song.thumbnail_url || ''
                            };

                            const response = await this.addSongToPlaylist(playlistId, songData, currentInsertIndex);

                            if (!response?._error && response?.status === 'OK') {
                                addedCount++;
                                const processedCount = addedCount + skippedCount + failedCount;
                                const progress = Math.round((processedCount / songs.length) * 100);
                                searchLoading.show(i18n.t('search.batchAddProgress', { done: addedCount, total: songs.length, pct: progress }));
                            } else if (response?.duplicate) {
                                skippedCount++;
                                const processedCount = addedCount + skippedCount + failedCount;
                                const progress = Math.round((processedCount / songs.length) * 100);
                                searchLoading.show(i18n.t('search.batchAddProgress', { done: addedCount, total: songs.length, pct: progress }));
                                console.warn('[批量添加] 跳过重复歌曲:', songData.title);
                            } else {
                                failedCount++;
                                const processedCount = addedCount + skippedCount + failedCount;
                                const progress = Math.round((processedCount / songs.length) * 100);
                                searchLoading.show(i18n.t('search.batchAddProgress', { done: addedCount, total: songs.length, pct: progress }));
                                console.warn('[批量添加] 添加失败:', songData.title, response?.error || response?.message || response);
                            }
                        } catch (err) {
                            failedCount++;
                            const processedCount = addedCount + skippedCount + failedCount;
                            const progress = Math.round((processedCount / songs.length) * 100);
                            searchLoading.show(i18n.t('search.batchAddProgress', { done: addedCount, total: songs.length, pct: progress }));
                            console.warn('[批量添加] 添加歌曲异常:', err);
                        }

                        // 避免请求过于频繁
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    searchLoading.hide();

                    // 获取歌单名称
                    const playlistName = this.getPlaylistDisplayName(playlistId);

                    this.notifyBulkAddResult({
                        successMessage: i18n.t('search.batchAddSuccess', { done: addedCount, total: songs.length, name: playlistName }),
                        failureMessage: i18n.t('search.batchAddFailed'),
                        addedCount,
                        skippedCount,
                        failedCount
                    });

                    await this.refreshPlaylistView({
                        logPrefix: '[批量添加]',
                        successLogMessage: '[批量添加] ✓ 播放列表已刷新'
                    });
                } catch (error) {
                    searchLoading.hide();
                    console.error('[批量添加] 添加失败:', error);
                    Toast.error(i18n.t('search.batchAddFailed') + ': ' + error.message);
                }
            });
        } catch (error) {
            console.error('[批量添加] 处理失败:', error);
            Toast.error(i18n.t('playlist.opFailed') + ': ' + error.message);
        }
    }

    // 搜索歌曲
    async search(query) {
        if (!query || !query.trim()) {
            throw new Error(i18n.t('search.queryEmpty'));
        }

        try {
            const result = await api.searchSong(query.trim(), this.youtubeLoadState.maxResultsLimit);

            if (result?._error || result?.status !== 'OK') {
                throw new Error(result?.error || result?.message || i18n.t('search.failed', { error: 'request failed' }));
            }

            this.addToHistory(query.trim());
            return result;
        } catch (error) {
            console.error('搜索失败:', error);
            throw error;
        }
    }

    // 添加到搜索历史
    addToHistory(query) {
        const now = Date.now();
        if (query === this.lastSavedQuery && now - this.lastSavedAt < this.saveInterval) {
            return; // 同一关键词短时间内不重复写入
        }
        // 移除重复项
        this.searchHistory = this.searchHistory.filter(item => item !== query);
        
        // 添加到开头
        this.searchHistory.unshift(query);
        
        // 限制历史记录数量
        if (this.searchHistory.length > this.maxHistory) {
            this.searchHistory = this.searchHistory.slice(0, this.maxHistory);
        }
        
        this.saveHistory();
        this.lastSavedQuery = query;
        this.lastSavedAt = now;
    }

    // 获取搜索历史
    getHistory() {
        return this.searchHistory;
    }

    // 清除搜索历史
    clearHistory() {
        this.searchHistory = [];
        this.saveHistory();
    }

    // 从本地存储加载历史
    loadHistory() {
        try {
            const saved = localStorage.getItem('search_history');
            if (saved) {
                this.searchHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.error('加载搜索历史失败:', error);
            this.searchHistory = [];
        }
    }

    // 保存历史到本地存储
    saveHistory() {
        try {
            localStorage.setItem('search_history', JSON.stringify(this.searchHistory));
        } catch (error) {
            console.error('保存搜索历史失败:', error);
        }
    }

    // 删除单条历史记录
    removeFromHistory(query) {
        this.searchHistory = this.searchHistory.filter(item => item !== query);
        this.saveHistory();
    }

    /**
     * 加载更多YouTube搜索结果
     * @param {boolean} loadAll - 是否加载全部
     */
    async loadMoreYoutubeResults(loadAll = false) {
        const state = this.youtubeLoadState;
        const allYoutubeResults = this.totalSearchResults.youtube || [];
        const totalAvailable = Math.min(allYoutubeResults.length, state.maxResultsLimit);

        // 防重复加载
        if (state.isLoading || !state.hasMore) return;

        const newDisplayCount = loadAll
            ? totalAvailable
            : Math.min(state.displayedCount + state.maxResultsStep, totalAvailable);

        if (newDisplayCount <= state.displayedCount) {
            state.hasMore = false;
            this.updateYoutubeLoadUI();
            return;
        }

        try {
            state.isLoading = true;
            this.updateYoutubeLoadUI();

            const freshResults = allYoutubeResults.slice(state.displayedCount, newDisplayCount);

            if (freshResults.length === 0) {
                state.hasMore = false;
                Toast.info(i18n.t('search.allLoaded'));
            } else {
                // 追加新结果
                this.currentSearchResults.youtube.push(...freshResults);
                state.totalLoaded = newDisplayCount;
                state.displayedCount = this.currentSearchResults.youtube.length;
                state.hasMore = state.displayedCount < totalAvailable;

                this.appendYoutubeResults(freshResults);
                updateSearchTabCounts({
                    localCount: this.totalSearchResults.local.length,
                    youtubeCount: this.totalSearchResults.youtube.length,
                    localLimit: this.localResultsLimit,
                    youtubeLimit: this.youtubeLoadState.maxResultsLimit
                });
                Toast.success(i18n.t('search.loadedMore', { count: freshResults.length }));
            }

        } catch (error) {
            console.error('[加载更多] 失败:', error);
            Toast.error(i18n.t('search.loadMoreFailed') + ': ' + error.message);
        } finally {
            state.isLoading = false;
            this.updateYoutubeLoadUI();
        }
    }

    /**
     * 追加YouTube搜索结果到列表
     */
    appendYoutubeResults(newResults) {
        const youtubePanel = document.querySelector('[data-panel="youtube"]');
        if (!youtubePanel) return;

        const loadMoreContainer = youtubePanel.querySelector('.search-load-more-container');
        const scrollContainer = document.getElementById('searchModalBody');
        const previousTop = loadMoreContainer ? loadMoreContainer.getBoundingClientRect().top : null;

        const fragment = document.createDocumentFragment();
        newResults.forEach((song) => {
            fragment.appendChild(buildTrackItemElement({
                song,
                type: 'youtube',
                metaText: song.duration ? formatTime(song.duration) : i18n.t('track.unknownDuration'),
                actionButtonClass: 'track-menu-btn search-result-add',
                actionButtonIcon: '<svg class="icon icon-plus"><use xlink:href="#icon-plus"></use></svg>'
            }));
        });

        if (loadMoreContainer) {
            loadMoreContainer.parentNode.insertBefore(fragment, loadMoreContainer);
            if (scrollContainer && previousTop !== null) {
                const nextTop = loadMoreContainer.getBoundingClientRect().top;
                scrollContainer.scrollTop += nextTop - previousTop;
            }
            return;
        }

        youtubePanel.appendChild(fragment);
    }

    /**
     * 更新YouTube加载按钮UI状态
     */
    updateYoutubeLoadUI() {
        const state = this.youtubeLoadState;
        const container = document.getElementById('youtubeLoadMoreContainer');
        const statusEl = document.getElementById('youtubeLoadStatus');
        const noMoreEl = document.getElementById('youtubeNoMore');

        if (!container) return;

        if (state.isLoading) {
            container.style.display = 'none';
            if (statusEl) statusEl.style.display = 'flex';
            if (noMoreEl) noMoreEl.style.display = 'none';
        } else if (!state.hasMore) {
            container.style.display = 'none';
            if (statusEl) statusEl.style.display = 'none';
            if (noMoreEl) noMoreEl.style.display = 'flex';
        } else {
            container.style.display = 'flex';
            if (statusEl) statusEl.style.display = 'none';
            if (noMoreEl) noMoreEl.style.display = 'none';

            // 动态更新"加载更多"按钮的文本，显示实际的page_size值
            const loadMoreBtn = document.getElementById('youtubeLoadMoreBtn');
            if (loadMoreBtn) {
                const label = loadMoreBtn.querySelector('.label');
                if (label) {
                    label.textContent = i18n.t('search.loadMore', { count: state.maxResultsStep });
                }
            }
        }
    }

    // ============================================================
    // 搜索弹窗内目录导航
    // ============================================================

    // 进入目录（统一入口）
    async enterDirectory(url, title) {
        // 首次进入时先压入 sentinel（搜索结果）
        if (!this.dirNavState.isActive) {
            this.dirNavState.breadcrumb = [{ name: i18n.t('search.breadcrumb'), url: null }];
            this.dirNavState.isActive = true;
        }
        // 压入当前目录
        this.dirNavState.breadcrumb.push({ name: title, url });

        // 确保树数据已加载
        if (!localFiles.fullTree) {
            try {
                const data = await api.getFileTree();
                if (data?._error || data.status !== 'OK') throw new Error('获取文件树失败');
                localFiles.fullTree = data.tree || null;
            } catch (e) {
                Toast.error(i18n.t('search.cannotLoadDir'));
                this.dirNavState.breadcrumb.pop();
                if (this.dirNavState.breadcrumb.length <= 1) {
                    this.dirNavState = { isActive: false, breadcrumb: [] };
                }
                return;
            }
        }

        const pathArr = url ? url.split('/').filter(Boolean) : [];
        const node = getNodeByPath(localFiles.fullTree, pathArr);
        if (!node) {
            Toast.error(i18n.t('search.dirNotFound'));
            this.dirNavState.breadcrumb.pop();
            if (this.dirNavState.breadcrumb.length <= 1) {
                this.dirNavState = { isActive: false, breadcrumb: [] };
            }
            return;
        }
        this.renderDirView(node);
    }

    // 将 searchModalBody 替换为目录视图
    renderDirView(node) {
        const searchModalBody = document.getElementById('searchModalBody');
        if (!searchModalBody) return;

        const dirView = document.createElement('div');
        dirView.className = 'search-dir-view';
        dirView.appendChild(createSearchBreadcrumbElement(this.dirNavState.breadcrumb));
        dirView.appendChild(createSearchDirContentElement(node));

        searchModalBody.replaceChildren(dirView);
        resetScrollPosition(searchModalBody);
    }

    // 点击面包屑回退
    navigateToBreadcrumb(index) {
        if (index === 0) {
            this.restoreSearchResults();
            return;
        }
        // 截断面包屑到指定层
        this.dirNavState.breadcrumb = this.dirNavState.breadcrumb.slice(0, index + 1);
        const item = this.dirNavState.breadcrumb[index];
        const pathArr = item.url ? item.url.split('/').filter(Boolean) : [];
        const node = getNodeByPath(localFiles.fullTree, pathArr);
        if (!node) {
            Toast.error(i18n.t('search.dirNotFound'));
            return;
        }
        this.renderDirView(node);
    }

    // 退出目录视图，恢复搜索结果
    restoreSearchResults() {
        const activeTab = document.querySelector('.search-tab.active');
        const preferredTab = activeTab?.getAttribute('data-tab') || 'local';
        this.dirNavState = { isActive: false, breadcrumb: [] };
        this.renderSearchResults(
            this.totalSearchResults.local,
            this.totalSearchResults.youtube,
            this.lastQuery,
            {
                preferredTab,
                youtubeDisplayCount: this.currentSearchResults.youtube.length
            }
        );
    }
}



// 导出单例
export const searchManager = new SearchManager();
