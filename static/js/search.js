// 搜索功能模块
import { api } from './api.js';
import { Toast, formatTime, searchLoading } from './ui.js';
import { buildTrackItemHTML } from './templates.js';
import { localFiles, getNodeByPath, getDirCoverUrl, countFiles } from './local.js';
import { i18n } from './i18n.js';
import { escapeHTML } from './utils.js';

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
        this.karaokeMode = false;  // 伴奏模式开关
        // 目录导航状态（在搜索弹窗内浏览目录时使用）
        this.dirNavState = {
            isActive: false,
            breadcrumb: []
            // breadcrumb 格式：[{name: '搜索结果', url: null}, {name: 'Jazz', url: 'Albums/Jazz'}, ...]
            // url: null 表示 sentinel（搜索结果入口）
        };
        this.loadHistory();

        // 异步加载YouTube搜索配置
        this.loadYoutubeSearchConfig();
    }

    // 加载YouTube搜索配置
    async loadYoutubeSearchConfig() {
        try {
            const config = await api.getYoutubeSearchConfig();
            this.youtubeLoadState.maxResultsStep = config.page_size || 20;
            this.youtubeLoadState.maxResultsLimit = config.max_results || 100;
            console.log('[YouTube搜索配置] 加载成功:', config);
        } catch (error) {
            console.warn('[YouTube搜索配置] 加载失败，使用默认值:', error);
            // 保持默认值
        }
    }

    // 初始化搜索UI
    initUI(currentPlaylistIdGetter, refreshPlaylistCallback) {
        this.getCurrentPlaylistId = currentPlaylistIdGetter;
        this.refreshPlaylist = refreshPlaylistCallback;
        
        const searchModalBack = document.getElementById('searchModalBack');
        const searchModal = document.getElementById('searchModal');
        const searchModalInput = document.getElementById('searchModalInput');
        const searchModalBody = document.getElementById('searchModalBody');
        const searchModalHistory = document.getElementById('searchModalHistory');
        const searchModalHistoryList = document.getElementById('searchModalHistoryList');
        const searchModalHistoryClear = document.getElementById('searchModalHistoryClear');

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
                
                // 移除搜索栏目的active状态和样式
                searchModal.classList.remove('modal-visible');
                setTimeout(() => {
                    searchModal.style.display = 'none';
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
                        this.refreshPlaylist();
                    } else {
                        document.dispatchEvent(new CustomEvent('playlist:refresh'));
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

            // Escape 键关闭搜索模态框
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && searchModal.classList.contains('modal-visible')) {
                    closeAndRefresh();
                }
            });
            
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
            searchModalBody.innerHTML = `<div class="search-empty-state"><div class="search-empty-icon">🔍</div><p class="search-empty-text">${i18n.t('search.inputPrompt')}</p></div>`;
            return;
        }
        
        searchModalHistory.style.display = 'block';
        searchModalBody.innerHTML = '';
        
        // 创建历史记录标题
        const title = `${i18n.t('search.history.title')} <span class="search-history-count">(${history.length})</span>`;
        
        searchModalHistoryList.innerHTML = `
            <div class="search-history-header">${title}</div>
            ${history.map(item => `
                <div class="search-history-item">
                    <div class="search-history-icon">🔍</div>
                    <span class="search-history-text" data-query="${escapeHTML(item)}">${escapeHTML(item)}</span>
                    <button class="search-history-delete" data-query="${escapeHTML(item)}" title="${i18n.t('search.history.delete')}">×</button>
                </div>
            `).join('')}
        `;
        
        // 绑定历史记录点击事件
        searchModalHistoryList.querySelectorAll('.search-history-text').forEach(el => {
            el.addEventListener('click', async () => {
                const query = el.getAttribute('data-query');
                const searchModalInput = document.getElementById('searchModalInput');
                if (searchModalInput) {
                    searchModalInput.value = query;
                }
                await this.performSearch(query);
            });
        });
        
        // 绑定删除按钮
        searchModalHistoryList.querySelectorAll('.search-history-delete').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const query = el.getAttribute('data-query');
                this.removeFromHistory(query);
                this.showSearchHistory();
            });
        });
    }

    // 执行搜索
    async performSearch(query) {
        const searchModalBody = document.getElementById('searchModalBody');
        const searchModalHistory = document.getElementById('searchModalHistory');
        
        if (!searchModalBody) return;

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
            
            const localResults = result.local || [];
            const youtubeResults = result.youtube || [];

            this.renderSearchResults(localResults, youtubeResults);
            
        } catch (error) {
            console.error('搜索失败:', error);
            searchModalBody.innerHTML = `<div style="padding: 40px; text-align: center; color: #f44;">${escapeHTML(i18n.t('search.failed', { error: error.message }))}</div>`;
        } finally {
            // 隐藏全屏加载动画
            searchLoading.hide();
            this.isSearching = false;
            this.lastSearchAt = Date.now();
        }
    }

    // 渲染搜索结果
    renderSearchResults(localResults, youtubeResults) {
        const searchModalBody = document.getElementById('searchModalBody');
        if (!searchModalBody) return;

        // 保存当前搜索结果
        this.currentSearchResults = {
            local: localResults || [],
            youtube: youtubeResults || []
        };

        const buildList = (items, type) => {
            if (!items || items.length === 0) {
                return '<div class="search-empty">' + i18n.t('search.noResults') + '</div>';
            }
            return items.map(song => {
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

                return buildTrackItemHTML({
                    song,
                    type,
                    metaText: meta,
                    actionButtonClass: `track-menu-btn search-result-add ${isDirectory ? 'add-directory' : ''}`,
                    actionButtonIcon: icon,
                    isCover: song.is_directory || song.type === 'directory' // 标记是目录
                });
            }).join('');
        };

        // 为YouTube标签页构建带加载按钮的HTML
        const buildYoutubePanel = () => {
            const listHTML = buildList(youtubeResults, 'youtube');

            // 只在有结果的情况下添加加载按钮
            if (youtubeResults && youtubeResults.length > 0) {
                return listHTML + `
                    <div class="search-load-more-container" id="youtubeLoadMoreContainer">
                        <button class="search-load-more-btn" id="youtubeLoadMoreBtn">
                            <span class="icon">⬇️</span>
                            <span class="label">${i18n.t('search.loadMore', { count: 20 })}</span>
                        </button>
                        <button class="search-load-all-btn" id="youtubeLoadAllBtn">
                            <span class="icon">📥</span>
                            <span class="label">${i18n.t('search.loadAll')}</span>
                        </button>
                    </div>
                    <div class="search-load-status" id="youtubeLoadStatus" style="display:none;">
                        <span class="status-text">${i18n.t('search.loadingMore')}</span>
                    </div>
                    <div class="search-no-more" id="youtubeNoMore" style="display:none;">
                        <span class="icon">✓</span>
                        <span class="text">${i18n.t('search.allLoaded')}</span>
                    </div>
                `;
            }
            return listHTML;
        };

            // 选择默认标签：优先本地，其次网络
            const defaultTab = localResults.length > 0 ? 'local' : 'youtube';

        searchModalBody.innerHTML = `
            <div class="search-tabs">
                <button class="search-tab ${defaultTab === 'local' ? 'active' : ''}" data-tab="local">${i18n.t('search.localTab', { count: localResults.length })}</button>
                <button class="search-tab ${defaultTab === 'youtube' ? 'active' : ''}" data-tab="youtube">${i18n.t('search.networkTab', { count: youtubeResults.length })}</button>
            </div>
            <div class="search-tab-panels">
                <div class="search-results-panel ${defaultTab === 'local' ? 'active' : ''}" data-panel="local">
                    ${buildList(localResults, 'local')}
                </div>
                <div class="search-results-panel ${defaultTab === 'youtube' ? 'active' : ''}" data-panel="youtube">
                    ${buildYoutubePanel()}
                </div>
            </div>
        `;

        const tabs = searchModalBody.querySelectorAll('.search-tab');
        const panels = searchModalBody.querySelectorAll('.search-results-panel');

        const setActive = (tabName) => {
            tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
            panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tabName));
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => setActive(tab.dataset.tab));
        });

        // 绑定添加按钮 - 显示操作菜单
        searchModalBody.querySelectorAll('.search-result-add').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const item = e.target.closest('.search-result-item');
                const isDirectory = item.getAttribute('data-directory') === 'true' || item.getAttribute('data-type') === 'directory';

                // 显示操作菜单
                this.showSearchActionMenu(e.target, item, isDirectory);
            });
        });

        // 目录行整体点击 → 进入目录（操作按钮区域除外）
        searchModalBody.querySelectorAll('.search-result-item[data-directory="true"]').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.track-menu-btn')) return;
                const url = item.getAttribute('data-url');
                const title = item.getAttribute('data-title');
                this.enterDirectory(url, title);
            });
        });

        // 初始化YouTube加载状态
        if (youtubeResults && youtubeResults.length > 0) {
            this.youtubeLoadState.query = this.lastQuery;
            this.youtubeLoadState.displayedCount = youtubeResults.length;
            this.youtubeLoadState.totalLoaded = youtubeResults.length;
            this.youtubeLoadState.hasMore = youtubeResults.length >= this.youtubeLoadState.maxResultsStep;
            this.youtubeLoadState.isLoading = false;
        }

        // 绑定YouTube加载按钮事件
        const loadMoreBtn = document.getElementById('youtubeLoadMoreBtn');
        const loadAllBtn = document.getElementById('youtubeLoadAllBtn');

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadMoreYoutubeResults(false));
        }

        if (loadAllBtn) {
            loadAllBtn.addEventListener('click', () => this.loadMoreYoutubeResults(true));
        }

        this.updateYoutubeLoadUI();
    }
    
    /**
     * 显示搜索结果操作菜单（全屏模态框）
     */
    showSearchActionMenu(button, item, isDirectory) {
        // 移除已存在的菜单
        document.querySelectorAll('.search-action-menu').forEach(m => m.remove());

        const songData = {
            url: item.getAttribute('data-url'),
            title: item.getAttribute('data-title'),
            type: item.getAttribute('data-type'),
            thumbnail_url: item.getAttribute('data-thumbnail_url') || ''
        };

        // 获取当前激活的标签页
        const activeTab = document.querySelector('.search-tab.active');
        const currentTab = activeTab ? activeTab.getAttribute('data-tab') : 'local';
        const currentResults = this.currentSearchResults[currentTab] || [];
        const resultCount = currentResults.length;

        // 获取当前歌单信息用于显示
        let playlistName = i18n.t('playlist.current');
        let playlistIcon = '📥';
        let selectedPlaylistId = 'default';

        try {
            const playlistManager = window.app?.modules?.playlistManager;
            if (playlistManager) {
                playlistName = playlistManager.getCurrentName() || i18n.t('playlist.current');
                playlistIcon = playlistManager.getCurrentPlaylistIcon() || '📥';
                selectedPlaylistId = playlistManager.getSelectedPlaylistId() || 'default';
            }
        } catch (err) {
            console.warn('[搜索菜单] 获取歌单信息失败:', err);
        }

        // 根据当前选择的歌单决定"添加到歌单"按钮的标签
        const addToPlaylistLabel = selectedPlaylistId !== 'default'
            ? i18n.t('search.actionMenu.addToPlaylistNamed', { name: playlistName })
            : i18n.t('search.actionMenu.addToPlaylist');

        // 创建全屏模态框
        const menu = document.createElement('div');
        menu.className = 'search-action-menu';
        menu.innerHTML = `
            <div class="search-action-menu-content">
                <div class="search-action-menu-header">
                    <div class="search-action-menu-title">${escapeHTML(songData.title)}</div>
                    <button class="search-action-menu-close">✕</button>
                </div>
                <div class="search-action-menu-body">
                    <button class="search-action-menu-item" data-action="play-now">
                        <span class="icon">▶️</span>
                        <span class="label">${i18n.t('search.actionMenu.playNow')}</span>
                    </button>
                    <button class="search-action-menu-item" data-action="add-to-queue">
                        <span class="icon">➕</span>
                        <span class="label">${i18n.t('search.actionMenu.addToQueue')}</span>
                    </button>
                    ${!isDirectory ? `<button class="search-action-menu-item" data-action="add-to-playlist">
                        <span class="icon">📋</span>
                        <span class="label">${addToPlaylistLabel}</span>
                    </button>` : ''}
                    <button class="search-action-menu-item" data-action="add-all-to-playlist">
                        <span class="icon">${playlistIcon}</span>
                        <span class="label">${i18n.t('search.actionMenu.addAll', { count: resultCount, name: playlistName })}</span>
                    </button>
                </div>
            </div>
        `;
        
        // 添加到body
        document.body.appendChild(menu);
        
        // 延迟显示动画
        setTimeout(() => menu.classList.add('show'), 10);
        
        // 关闭菜单函数
        const closeMenu = () => {
            menu.classList.remove('show');
            setTimeout(() => menu.remove(), 300);
        };
        
        // 绑定关闭按钮
        const closeBtn = menu.querySelector('.search-action-menu-close');
        closeBtn.addEventListener('click', closeMenu);
        
        // 点击背景关闭
        menu.addEventListener('click', (e) => {
            if (e.target === menu) {
                closeMenu();
            }
        });
        
        // 绑定菜单项事件
        menu.querySelectorAll('.search-action-menu-item').forEach(menuItem => {
            menuItem.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = menuItem.getAttribute('data-action');

                if (action === 'play-now') {
                    // 立即播放需要确认，切换菜单内容为确认视图
                    this.showPlayNowConfirm(menu, songData, isDirectory, button, closeMenu);
                    return;
                }

                closeMenu();

                // 等待动画完成后执行操作
                setTimeout(async () => {
                    if (action === 'add-to-queue') {
                        await this.handleAddToQueue(songData, isDirectory, button);
                    } else if (action === 'add-to-playlist') {
                        const playlistManager = window.app?.modules?.playlistManager;
                        const selectedId = playlistManager?.getSelectedPlaylistId() || 'default';
                        if (selectedId !== 'default') {
                            // 当前选择的不是默认歌单，直接添加到当前歌单
                            try {
                                const result = await api.addToPlaylist({
                                    playlist_id: selectedId,
                                    song: songData
                                });
                                if (result.status === 'OK') {
                                    const name = playlistManager.getCurrentName() || selectedId;
                                    Toast.success(i18n.t('search.addSuccess', { name, title: songData.title }));
                                    await playlistManager.refreshAll();
                                } else if (result.duplicate) {
                                    Toast.warning(`${songData.title} ${i18n.t('search.alreadyInList')}`);
                                } else {
                                    Toast.error(i18n.t('search.addFailed'));
                                }
                            } catch (err) {
                                console.error('[搜索] 添加到歌单失败:', err);
                                Toast.error(i18n.t('search.addFailed'));
                            }
                        } else {
                            // 默认歌单，显示歌单选择器
                            const { showSelectPlaylistModal } = await import('./playlist.js');
                            await showSelectPlaylistModal(songData, null);
                        }
                    } else if (action === 'add-all-to-playlist') {
                        await this.handleAddAllToPlaylist(currentTab);
                    }
                }, 300);
            });
        });
    }

    /**
     * 立即播放确认视图：在现有菜单内切换为确认界面
     */
    showPlayNowConfirm(menu, songData, isDirectory, btn, closeMenu) {
        const content = menu.querySelector('.search-action-menu-content');
        content.innerHTML = `
            <div class="search-action-menu-header">
                <div class="search-action-menu-title">${i18n.t('search.confirmPlayNow')}</div>
                <button class="search-action-menu-close">✕</button>
            </div>
            <div class="search-action-menu-body">
                <p class="play-now-confirm-msg">${i18n.t('search.confirmPlayNowMsg')}</p>
                <div class="play-now-confirm-buttons">
                    <button class="search-action-menu-item play-now-cancel">${i18n.t('modal.cancel')}</button>
                    <button class="search-action-menu-item play-now-confirm">${i18n.t('search.confirmPlayNowBtn')}</button>
                </div>
            </div>
        `;
        content.querySelector('.search-action-menu-close').addEventListener('click', closeMenu);
        content.querySelector('.play-now-cancel').addEventListener('click', closeMenu);
        content.querySelector('.play-now-confirm').addEventListener('click', () => {
            closeMenu();
            setTimeout(() => this.handlePlayNow(songData, isDirectory, btn), 300);
        });
    }
    
    /**
     * 立即播放：将歌曲插入队列顶部并播放
     */
    async handlePlayNow(songData, isDirectory, btn) {
        try {
            const playlistId = this.getCurrentPlaylistId ? this.getCurrentPlaylistId() : this.currentPlaylistId;
            
            if (isDirectory) {
                Toast.warning(i18n.t('search.dirNotSupported'));
                return;
            }
            
            // 显示加载状态
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '⏳';
            btn.disabled = true;
            
            // 1. 将歌曲插入到队列顶部（index=0，当前播放的前面）
            const addResponse = await fetch('/playlist_add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playlist_id: playlistId,
                    song: songData,
                    insert_index: 0  // 插入到顶部
                })
            });
            
            if (!addResponse.ok) {
                throw new Error(i18n.t('search.addSongFailed'));
            }
            
            // 2. 刷新播放列表数据
            const playlistManager = window.app?.modules?.playlistManager;
            if (playlistManager) {
                await playlistManager.refreshAll();
            }
            
            // 3. 立即播放这首歌
            await window.app.modules.player.play(
                songData.url,
                songData.title,
                songData.type,
                0  // duration
            );
            
            // 4. 刷新UI显示
            const container = document.getElementById('playListContainer');
            const currentStatus = window.app?.lastPlayStatus || { current_meta: null };
            if (container) {
                const { renderPlaylistUI } = await import('./playlist.js');
                renderPlaylistUI({
                    container,
                    onPlay: (s) => window.app?.playSong(s),
                    currentMeta: currentStatus.current_meta
                });
            }
            
            Toast.success(i18n.t('search.nowPlaying', { title: songData.title }));
            btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>';
            
        } catch (error) {
            console.error('[立即播放] 失败:', error);
            Toast.error(i18n.t('search.playFailed') + ': ' + error.message);
            btn.innerHTML = originalHTML;
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
                // ✅ 目录处理：添加整个目录下的所有歌曲
                console.log('[搜索] 添加整个目录:', songData.url);
                
                // 显示加载状态
                const originalHTML = btn.innerHTML;
                btn.innerHTML = i18n.t('search.loadingDir');
                btn.disabled = true;
                
                try {
                    // 调用后端API获取目录下的所有歌曲
                    const response = await fetch('/get_directory_songs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ directory: songData.url })
                    });
                    
                    if (!response.ok) {
                        throw new Error(i18n.t('search.getDirFailed'));
                    }
                    
                    const result = await response.json();
                    if (result.status !== 'OK') {
                        throw new Error(result.error || i18n.t('search.getDirFailed'));
                    }
                    
                    const songs = result.songs || [];
                    if (songs.length === 0) {
                        Toast.warning(i18n.t('search.noMusicInDir'));
                        btn.innerHTML = originalHTML;
                        btn.disabled = false;
                        return;
                    }
                    
                    // 将所有歌曲添加到歌单（保持原有顺序）
                    let addedCount = 0;
                    let insertIndex = null;  // 第一首歌曲的插入位置
                    
                    for (let i = 0; i < songs.length; i++) {
                        const song = songs[i];
                        
                        try {
                            // 第一首歌曲时计算插入位置
                            if (i === 0) {
                                try {
                                    const status = await api.getStatus();
                                    const currentIndex = status?.current_index ?? -1;
                                    insertIndex = Math.max(1, currentIndex + 1);
                                    console.log('[搜索] 计算插入位置:', insertIndex);
                                } catch (err) {
                                    console.warn('[搜索] 无法获取当前位置，使用默认位置 1', err);
                                    insertIndex = 1;
                                }
                            }
                            
                            // 计算当前歌曲的插入位置（后续歌曲依次递增）
                            const currentInsertIndex = insertIndex + i;
                            
                            const addResponse = await fetch('/playlist_add', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    playlist_id: playlistId,
                                    song: song,
                                    insert_index: currentInsertIndex
                                })
                            });
                            
                            if (addResponse.ok) {
                                addedCount++;
                                console.log(`[搜索] ✓ 添加歌曲 (${i+1}/${songs.length}): ${song.title} 在位置 ${currentInsertIndex}`);
                            } else {
                                console.warn(`[搜索] ✗ 添加歌曲失败: ${song.title}`);
                            }
                        } catch (err) {
                            console.warn(`[搜索] 添加歌曲异常: ${err.message}`);
                        }
                    }
                    
                    // 获取歌单名称
                    let playlistName = i18n.t('nav.queue');
                    if (playlistId !== 'default' && window.app && window.app.modules && window.app.modules.playlistManager) {
                        const playlist = window.app.modules.playlistManager.playlists.find(p => p.id === playlistId);
                        if (playlist) {
                            playlistName = playlist.name;
                        }
                    }

                    Toast.success(i18n.t('search.addDirSuccess', { count: addedCount, name: playlistName }));
                    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>';
                    
                    // ✅【关键】刷新播放列表显示 - 直接调用 renderPlaylistUI 确保立即显示
                    try {
                        const playlistManager = window.app?.modules?.playlistManager;
                        if (playlistManager) {
                            await playlistManager.refreshAll();
                        }
                        
                        const container = document.getElementById('playListContainer');
                        const currentStatus = window.app?.lastPlayStatus || { current_meta: null };
                        if (container && playlistManager) {
                            const { renderPlaylistUI } = await import('./playlist.js');
                            renderPlaylistUI({
                                container,
                                onPlay: (s) => window.app?.playSong(s),
                                currentMeta: currentStatus.current_meta
                            });
                            console.log('[搜索] ✓ 播放列表已刷新 - ' + addedCount + ' 首歌曲');
                        }
                    } catch (err) {
                        console.warn('[搜索] 刷新播放列表失败:', err);
                        // 回退方案
                        if (this.refreshPlaylist) {
                            await this.refreshPlaylist();
                        } else {
                            document.dispatchEvent(new CustomEvent('playlist:refresh'));
                        }
                    }
                } catch (error) {
                    console.error('添加目录歌曲失败:', error);
                    Toast.error(i18n.t('search.addDirFailed') + ': ' + error.message);
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                }
            } else {
                // ✅ 文件处理：添加单个歌曲
                let insertIndex = 1; // 声明并默认初始化，防止 ReferenceError
                try {
                    const statusResponse = await fetch('/status');
                    const status = await statusResponse.json();
                    const currentIndex = status?.current_index ?? -1;
                    insertIndex = Math.max(1, currentIndex + 1);
                    console.log('[搜索-单文件] 从后端获取当前播放索引:', { currentIndex, insertIndex });
                } catch (err) {
                    console.warn('[搜索-单文件] 无法获取后端状态，使用默认位置 1:', err);
                    insertIndex = 1;
                }

                const response = await fetch('/playlist_add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        playlist_id: playlistId,
                        song: songData,
                        insert_index: insertIndex
                    })
                });
                
                if (response.ok) {
                    // 获取歌单名称以显示在toast中
                    let playlistName = i18n.t('nav.queue');
                    if (playlistId === 'default') {
                        playlistName = i18n.t('nav.queue');
                    } else if (window.app && window.app.modules && window.app.modules.playlistManager) {
                        const playlist = window.app.modules.playlistManager.playlists.find(p => p.id === playlistId);
                        if (playlist) {
                            playlistName = playlist.name;
                        }
                    }
                    Toast.success(i18n.t('search.addSuccess', { name: playlistName, title: songData.title }));
                    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>';
                    btn.disabled = true;
                    
                    // ✅【关键】刷新播放列表显示 - 直接调用 renderPlaylistUI 确保立即显示
                    try {
                        const playlistManager = window.app?.modules?.playlistManager;
                        if (playlistManager) {
                            await playlistManager.refreshAll();
                        }

                        const container = document.getElementById('playListContainer');
                        const currentStatus = window.app?.lastPlayStatus || { current_meta: null };
                        if (container && playlistManager) {
                            const { renderPlaylistUI } = await import('./playlist.js');
                            renderPlaylistUI({
                                container,
                                onPlay: (s) => window.app?.playSong(s),
                                currentMeta: currentStatus.current_meta
                            });
                            console.log('[搜索] ✓ 播放列表已刷新 - 已添加单曲');
                        }
                    } catch (err) {
                        console.warn('[搜索] 刷新播放列表失败:', err);
                        // 回退方案
                        if (this.refreshPlaylist) {
                            await this.refreshPlaylist();
                        } else {
                            document.dispatchEvent(new CustomEvent('playlist:refresh'));
                        }
                    }
                } else {
                    const error = await response.json();
                    // 重复歌曲使用警告提示
                    if (error.duplicate) {
                        Toast.warning(`${songData.title} ${i18n.t('search.alreadyInList')}`);
                    } else {
                        throw new Error(error.error || i18n.t('search.addFailed'));
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
            const results = this.currentSearchResults[currentTab] || [];

            if (results.length === 0) {
                Toast.warning(i18n.t('search.noResultsToAdd'));
                return;
            }

            // 过滤掉目录类型
            const songs = results.filter(item => !item.is_directory && item.type !== 'directory');

            if (songs.length === 0) {
                Toast.warning(i18n.t('search.noValidSongs'));
                return;
            }

            // 显示加载提示
            Toast.info(i18n.t('search.batchAddInfo', { count: songs.length }));
            searchLoading.show(i18n.t('search.batchAddLoading', { count: songs.length }));

            try {
                // 获取当前播放位置
                let insertIndex = 1;
                try {
                    const status = await api.getStatus();
                    const currentIndex = status?.current_index ?? -1;
                    insertIndex = Math.max(1, currentIndex + 1);
                } catch (err) {
                    console.warn('[批量添加] 无法获取当前位置，使用默认位置 1', err);
                }

                // 批量添加歌曲
                let addedCount = 0;
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

                        const response = await fetch('/playlist_add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                playlist_id: playlistId,
                                song: songData,
                                insert_index: currentInsertIndex
                            })
                        });

                        if (response.ok) {
                            addedCount++;
                            const progress = Math.round((addedCount / songs.length) * 100);
                            searchLoading.show(i18n.t('search.batchAddProgress', { done: addedCount, total: songs.length, pct: progress }));
                        } else {
                            console.warn('[批量添加] 添加失败:', songData.title);
                        }
                    } catch (err) {
                        console.warn('[批量添加] 添加歌曲异常:', err);
                    }

                    // 避免请求过于频繁
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                searchLoading.hide();

                // 获取歌单名称
                let playlistName = i18n.t('nav.queue');
                if (playlistId !== 'default' && window.app && window.app.modules && window.app.modules.playlistManager) {
                    const playlist = window.app.modules.playlistManager.playlists.find(p => p.id === playlistId);
                    if (playlist) {
                        playlistName = playlist.name;
                    }
                }

                Toast.success(i18n.t('search.batchAddSuccess', { done: addedCount, total: songs.length, name: playlistName }));

                // 刷新播放列表显示
                try {
                    const playlistManager = window.app?.modules?.playlistManager;
                    if (playlistManager) {
                        await playlistManager.refreshAll();
                    }

                    const container = document.getElementById('playListContainer');
                    const currentStatus = window.app?.lastPlayStatus || { current_meta: null };
                    if (container && playlistManager) {
                        const { renderPlaylistUI } = await import('./playlist.js');
                        renderPlaylistUI({
                            container,
                            onPlay: (s) => window.app?.playSong(s),
                            currentMeta: currentStatus.current_meta
                        });
                        console.log('[批量添加] ✓ 播放列表已刷新');
                    }
                } catch (err) {
                    console.warn('[批量添加] 刷新播放列表失败:', err);
                    // 回退方案
                    if (this.refreshPlaylist) {
                        await this.refreshPlaylist();
                    } else {
                        document.dispatchEvent(new CustomEvent('playlist:refresh'));
                    }
                }
            } catch (error) {
                searchLoading.hide();
                console.error('[批量添加] 添加失败:', error);
                Toast.error(i18n.t('search.batchAddFailed') + ': ' + error.message);
            }
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
            const result = await api.searchSong(query.trim());
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

        // 防重复加载
        if (state.isLoading || !state.hasMore) return;

        // 计算新的max_results
        const newMaxResults = loadAll
            ? state.maxResultsLimit
            : state.totalLoaded + state.maxResultsStep;

        if (newMaxResults <= state.totalLoaded) {
            state.hasMore = false;
            this.updateYoutubeLoadUI();
            return;
        }

        try {
            state.isLoading = true;
            this.updateYoutubeLoadUI();

            // 调用API
            const result = await api.searchSong(state.query, newMaxResults);

            if (result.status !== 'OK') {
                throw new Error(result.error || i18n.t('search.loadMoreFailed'));
            }

            const newResults = result.youtube || [];

            // 过滤出新结果
            const existingUrls = new Set(
                this.currentSearchResults.youtube.map(item => item.url)
            );
            const freshResults = newResults.filter(item => !existingUrls.has(item.url));

            if (freshResults.length === 0) {
                state.hasMore = false;
                Toast.info(i18n.t('search.allLoaded'));
            } else {
                // 追加新结果
                this.currentSearchResults.youtube.push(...freshResults);
                state.totalLoaded = newResults.length;
                state.displayedCount = this.currentSearchResults.youtube.length;

                if (newResults.length < newMaxResults) {
                    state.hasMore = false;
                }

                this.appendYoutubeResults(freshResults);
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

        const newHTML = newResults.map(song =>
            buildTrackItemHTML({
                song,
                type: 'youtube',
                metaText: song.duration ? formatTime(song.duration) : i18n.t('track.unknownDuration'),
                actionButtonClass: 'track-menu-btn search-result-add',
                actionButtonIcon: '<svg class="icon icon-plus"><use xlink:href="#icon-plus"></use></svg>'
            })
        ).join('');

        if (loadMoreContainer) {
            loadMoreContainer.insertAdjacentHTML('beforebegin', newHTML);
        }

        // 重新绑定事件
        this.bindSearchResultEvents(youtubePanel);
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
                const res = await fetch('/tree');
                if (!res.ok) throw new Error('获取文件树失败');
                const data = await res.json();
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

        const breadcrumbHTML = this.buildSearchBreadcrumbHTML(this.dirNavState.breadcrumb);
        const contentHTML = this.buildDirContentHTML(node);

        searchModalBody.innerHTML = `
            <div class="search-dir-view">
                <div class="search-dir-breadcrumb">${breadcrumbHTML}</div>
                ${contentHTML}
            </div>
        `;

        this.bindDirViewEvents(searchModalBody);
    }

    // 生成面包屑 HTML
    buildSearchBreadcrumbHTML(breadcrumb) {
        return breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;
            const sep = index > 0 ? '<span class="search-breadcrumb-sep">›</span>' : '';
            if (isLast) {
                return `${sep}<span class="search-breadcrumb-item search-breadcrumb-item--current">${escapeHTML(item.name)}</span>`;
            }
            return `${sep}<span class="search-breadcrumb-item" data-breadcrumb-index="${index}">${escapeHTML(item.name)}</span>`;
        }).join('');
    }

    // 生成目录内容 HTML（子目录卡片 + 歌曲列表）
    buildDirContentHTML(node) {
        const dirs = node.dirs || [];
        const files = node.files || [];

        if (!dirs.length && !files.length) {
            return '<div class="search-dir-empty">' + i18n.t('local.dirEmpty') + '</div>';
        }

        let html = '';

        // 子目录卡片网格
        if (dirs.length > 0) {
            html += '<div class="search-dir-grid">';
            dirs.forEach(dir => {
                const coverUrl = getDirCoverUrl(dir);
                const fileCount = countFiles(dir);
                html += `
                    <div class="search-dir-card" data-dir-url="${escapeHTML(dir.rel)}" data-dir-name="${escapeHTML(dir.name)}">
                        <div class="search-dir-card-cover">
                            ${coverUrl ? `<img src="${escapeHTML(coverUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy" />` : ''}
                            <div class="search-dir-card-cover-placeholder" ${coverUrl ? '' : 'style="display:flex"'}>📁</div>
                        </div>
                        <div class="search-dir-card-info">
                            <div class="search-dir-card-title">${escapeHTML(dir.name)}</div>
                            <div class="search-dir-card-count">${i18n.t('local.songCount', { count: fileCount })}</div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // 歌曲列表
        if (files.length > 0) {
            html += '<div class="search-dir-songs">';
            files.forEach(file => {
                html += buildTrackItemHTML({
                    song: { url: file.rel, title: file.name, type: 'local' },
                    type: 'local',
                    metaText: file.rel,
                    actionButtonClass: 'track-menu-btn search-result-add',
                    actionButtonIcon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
                    isCover: false
                });
            });
            html += '</div>';
        }

        return html;
    }

    // 绑定目录视图内的事件
    bindDirViewEvents(container) {
        // 面包屑点击（非末项）
        container.querySelectorAll('.search-breadcrumb-item[data-breadcrumb-index]').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.getAttribute('data-breadcrumb-index'), 10);
                this.navigateToBreadcrumb(index);
            });
        });

        // 子目录卡片点击 → 进入子目录
        container.querySelectorAll('.search-dir-card').forEach(card => {
            card.addEventListener('click', () => {
                const dirUrl = card.getAttribute('data-dir-url');
                const dirName = card.getAttribute('data-dir-name');
                this.enterDirectory(dirUrl, dirName);
            });
        });

        // 歌曲 add 按钮 → 复用现有操作菜单
        container.querySelectorAll('.search-result-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = e.target.closest('.search-result-item');
                if (!item) return;
                this.showSearchActionMenu(e.target, item, false);
            });
        });
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
        this.dirNavState = { isActive: false, breadcrumb: [] };
        this.renderSearchResults(
            this.currentSearchResults.local,
            this.currentSearchResults.youtube
        );
    }
}



// 导出单例
export const searchManager = new SearchManager();
