// 模块化主入口示例
// 这是一个使用新模块系统的示例文件

import { api } from './api.js';
import { player } from './player.js';
import { playlistManager, renderPlaylistUI } from './playlist.js';
import { playlistsManagement } from './playlists-management.js';
import { volumeControl } from './volume.js';
import { searchManager } from './search.js';
import { rankingManager } from './ranking.js';
import { debug } from './debug.js';
import { Toast, loading, formatTime } from './ui.js';
import { isMobile } from './utils.js';
import { localFiles } from './local.js';

// ==========================================
// 应用初始化
// ==========================================

class MusicPlayerApp {
    constructor() {
        this.initialized = false;
        this.currentPlaylistId = 'default';  // 跟踪当前选择的歌单ID
    }

    async init() {
        if (this.initialized) return;
        
        console.log('🎵 初始化音乐播放器...');
        
        try {
            // 1. 初始化 UI 元素
            this.initUIElements();
            
            // 2. 初始化播放器
            this.initPlayer();
            
            // 3. 初始化音量控制
            this.initVolumeControl();
            
            // 4. 初始化播放列表
            await this.initPlaylist();
            
            // 4.5 初始化本地歌曲
            await localFiles.init({
                treeEl: this.elements.tree,
                getCurrentPlaylistId: () => this.currentPlaylistId
            });
            
            // 5. 绑定事件监听器
            this.bindEventListeners();
            
            // 6. 初始化歌单管理
            playlistsManagement.init(() => {
                this.renderPlaylist();
            });

            // 6.5 歌单标题点击打开歌单管理
            if (this.elements.playListTitle) {
                this.elements.playListTitle.style.cursor = 'pointer';
                this.elements.playListTitle.addEventListener('click', () => {
                    playlistsManagement.show();
                });
            }
            
            // 7. 立即获取一次播放状态
            try {
                const status = await api.getStatus();
                player.updateStatus(status);
            } catch (err) {
                console.warn('首次获取状态失败:', err);
            }
            
            // 7.5 初始化排行榜
            await rankingManager.init();
            
            // 8. 启动状态轮询（每200ms更新一次）
            player.startPolling(2000);
            
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            Toast.error('初始化失败: ' + error.message);
        }
    }

    // 初始化 UI 元素引用
    initUIElements() {
        this.elements = {
            // 播放控制 - 底部播放栏
            playPauseBtn: document.getElementById('playPauseBtn'),
            nextBtn: document.getElementById('nextBtn'),
            prevBtn: document.getElementById('prevBtn'),
            loopBtn: document.getElementById('loopBtn'),
            
            // 迷你播放器
            miniPlayPauseBtn: document.getElementById('miniPlayPauseBtn'),
            miniNextBtn: document.getElementById('miniNextBtn'),
            miniPlayerTitle: document.getElementById('miniPlayerTitle'),
            miniPlayerCover: document.getElementById('miniPlayerCover'),
            
            // 全屏播放器
            fullPlayer: document.getElementById('fullPlayer'),
            fullPlayerBack: document.getElementById('fullPlayerBack'),
            fullPlayerPlayPause: document.getElementById('fullPlayerPlayPause'),
            fullPlayerPrev: document.getElementById('fullPlayerPrev'),
            fullPlayerNext: document.getElementById('fullPlayerNext'),
            fullPlayerTitle: document.getElementById('fullPlayerTitle'),
            fullPlayerCover: document.getElementById('fullPlayerCover'),
            fullPlayerProgressBar: document.getElementById('fullPlayerProgressBar'),
            fullPlayerProgressFill: document.getElementById('fullPlayerProgressFill'),
            fullPlayerCurrentTime: document.getElementById('fullPlayerCurrentTime'),
            fullPlayerDuration: document.getElementById('fullPlayerDuration'),
            
            // 音量控制
            volumePopupBtn: document.getElementById('volumePopupBtn'),
            volumePopup: document.getElementById('volumePopup'),
            volumeSliderTrack: document.getElementById('volumeSliderTrack'),
            volumeSliderFill: document.getElementById('volumeSliderFill'),
            volumeSliderThumb: document.getElementById('volumeSliderThumb'),
            
            // 播放进度
            playerProgress: document.getElementById('playerProgress'),
            playerProgressFill: document.getElementById('playerProgressFill'),
            playerProgressThumb: document.getElementById('playerProgressThumb'),
            
            // 播放列表
            playListContainer: document.getElementById('playListContainer'),
            playListTitle: document.getElementById('playListTitle'),
            playerBar: document.getElementById('playerBar'),
            footerExpandBtn: document.getElementById('footerExpandBtn'),
            footerContent: document.getElementById('footerContent'),
            
            // 现在播放
            nowPlayingPlayBtn: document.getElementById('nowPlayingPlayBtn'),
            nowPlayingPrevBtn: document.getElementById('nowPlayingPrevBtn'),
            nowPlayingNextBtn: document.getElementById('nowPlayingNextBtn'),
            nowPlayingShuffleBtn: document.getElementById('nowPlayingShuffleBtn'),
            nowPlayingRepeatBtn: document.getElementById('nowPlayingRepeatBtn'),
            
            // 模态框
            historyModal: document.getElementById('historyModal'),
            historyList: document.getElementById('historyList'),
            youtubeSearchResults: document.getElementById('youtubeSearchResults'),
            youtubeSearchList: document.getElementById('youtubeSearchList'),
            
            // 标签导航
            bottomNav: document.getElementById('bottomNav'),
            playlist: document.getElementById('playlist'),
            tree: document.getElementById('tree')
        };
    }

    // 初始化播放器
    initPlayer() {
        // 监听播放状态更新
        player.on('statusUpdate', ({ status }) => {
            // 更新当前歌单ID
            if (status && status.current_playlist_id) {
                this.currentPlaylistId = status.current_playlist_id;
                console.log('📂 当前歌单已切换:', this.currentPlaylistId);
            }
            this.updatePlayerUI(status);
            // 更新播放列表显示（以反映当前播放状态）
            this.renderPlaylist();
        });

        // 监听播放事件
        player.on('play', ({ url, title }) => {
            Toast.success(`正在播放: ${title}`);
        });

        // 监听暂停事件
        player.on('pause', () => {
            console.log('播放已暂停');
        });
    }

    // 初始化音量控制
    initVolumeControl() {
        // 音量控制已在modules中初始化，这里可以添加额外的UI绑定
        if (this.elements.volumeSliderTrack) {
            volumeControl.init(this.elements.volumeSliderTrack);
        }
    }

    // 初始化播放列表
    async initPlaylist() {
        try {
            await playlistManager.loadCurrent();
            await playlistManager.loadAll();
            
            // 确保playlist可见
            if (this.elements.playlist) {
                this.elements.playlist.style.display = 'flex';
                console.log('✅ 设置playlist为可见');
            }
            
            // 初始化时隐藏本地文件，点击本地标签时显示
            if (this.elements.tree) {
                this.elements.tree.style.display = 'none';
                console.log('✅ 隐藏tree');
            }
            
            this.renderPlaylist();
            console.log('✅ 播放列表初始化完成');
        } catch (error) {
            console.error('加载播放列表失败:', error);
        }
    }

    // 绑定事件监听器
    bindEventListeners() {
        // 播放/暂停 - 主播放按钮
        if (this.elements.playPauseBtn) {
            this.elements.playPauseBtn.addEventListener('click', () => {
                player.togglePlayPause();
            });
        }

        // 迷你播放器控制
        if (this.elements.miniPlayPauseBtn) {
            this.elements.miniPlayPauseBtn.addEventListener('click', () => {
                player.togglePlayPause();
            });
        }

        // 全屏播放器控制
        if (this.elements.fullPlayerPlayPause) {
            this.elements.fullPlayerPlayPause.addEventListener('click', () => {
                player.togglePlayPause();
            });
        }

        if (this.elements.fullPlayerBack) {
            this.elements.fullPlayerBack.addEventListener('click', () => {
                if (this.elements.fullPlayer) {
                    this.elements.fullPlayer.style.display = 'none';
                }
            });
        }

        // 下一首
        if (this.elements.nextBtn) {
            this.elements.nextBtn.addEventListener('click', () => {
                player.next();
            });
        }
        if (this.elements.fullPlayerNext) {
            this.elements.fullPlayerNext.addEventListener('click', () => {
                player.next();
            });
        }
        if (this.elements.miniNextBtn) {
            this.elements.miniNextBtn.addEventListener('click', () => {
                player.next();
            });
        }

        // 上一首
        if (this.elements.prevBtn) {
            this.elements.prevBtn.addEventListener('click', () => {
                player.prev();
            });
        }
        if (this.elements.fullPlayerPrev) {
            this.elements.fullPlayerPrev.addEventListener('click', () => {
                player.prev();
            });
        }

        // 循环模式
        if (this.elements.loopBtn) {
            this.elements.loopBtn.addEventListener('click', () => {
                player.cycleLoop();
            });
        }
        if (this.elements.nowPlayingRepeatBtn) {
            this.elements.nowPlayingRepeatBtn.addEventListener('click', () => {
                player.cycleLoop();
            });
        }

        // 展开/收起播放栏
        if (this.elements.footerExpandBtn && this.elements.playerBar) {
            this.elements.footerExpandBtn.addEventListener('click', () => {
                this.elements.playerBar.classList.toggle('footer-collapsed');
            });
        }

        // 进度条控制
        if (this.elements.playerProgress) {
            this.elements.playerProgress.addEventListener('click', (e) => {
                this.handleProgressClick(e);
            });
        }
        if (this.elements.fullPlayerProgressBar) {
            this.elements.fullPlayerProgressBar.addEventListener('click', (e) => {
                this.handleFullPlayerProgressClick(e);
            });
        }

        // 音量控制
        if (this.elements.volumePopupBtn && this.elements.volumePopup) {
            this.elements.volumePopupBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.elements.volumePopup.style.display = 
                    this.elements.volumePopup.style.display === 'none' ? 'block' : 'none';
            });
            // 点击页面其他地方关闭音量弹窗
            document.addEventListener('click', () => {
                this.elements.volumePopup.style.display = 'none';
            });
        }
        if (this.elements.volumeSliderTrack) {
            this.elements.volumeSliderTrack.addEventListener('click', (e) => {
                this.handleVolumeChange(e);
            });
        }

        // 初始化调试面板模块
        debug.init(player, playlistManager);
        
        // 标签页切换
        this.setupTabNavigation();
    }
    
    // 更新播放器 UI
    updatePlayerUI(status) {
        if (!status) return;

        // 更新标题和信息
        const title = status.current_title || status.title || '未播放';
        
        // 更新迷你播放器标题
        if (this.elements.miniPlayerTitle) {
            this.elements.miniPlayerTitle.textContent = title;
        }
        
        // 更新全屏播放器标题
        if (this.elements.fullPlayerTitle) {
            this.elements.fullPlayerTitle.textContent = title;
        }

        // 更新进度信息（支持两种字段名）
        const mpvData = status.mpv || status.mpv_state || {};
        if (mpvData) {
            const currentTime = mpvData.time_pos || mpvData.time || 0;
            const duration = mpvData.duration || 0;

            // 更新全屏播放器时间
            if (this.elements.fullPlayerCurrentTime) {
                this.elements.fullPlayerCurrentTime.textContent = formatTime(currentTime);
            }
            if (this.elements.fullPlayerDuration) {
                this.elements.fullPlayerDuration.textContent = formatTime(duration);
            }

            // 更新播放进度条
            if (this.elements.playerProgressFill && duration > 0) {
                const percent = (currentTime / duration) * 100;
                if (this.elements.playerProgress) {
                    this.elements.playerProgressFill.style.width = percent + '%';
                }
            }

            // 更新全屏播放器进度条
            if (this.elements.fullPlayerProgressFill && duration > 0) {
                const percent = (currentTime / duration) * 100;
                if (this.elements.fullPlayerProgressBar) {
                    this.elements.fullPlayerProgressFill.style.width = percent + '%';
                }
            }

            // 更新迷你播放器进度条
            if (duration > 0) {
                const percent = (currentTime / duration) * 100;
                // 查找迷你播放器进度条（如果没有缓存元素）
                const miniProgressFill = document.getElementById('miniPlayerProgressFill');
                if (miniProgressFill) {
                    miniProgressFill.style.width = percent + '%';
                }
            }
        }

        // 更新播放/暂停按钮状态
        const isPlaying = (status.mpv?.paused || status.mpv_state?.paused) === false;
        
        // 更新按钮文本/图标
        if (this.elements.playPauseBtn) {
            this.elements.playPauseBtn.textContent = isPlaying ? '⏸' : '▶';
            this.elements.playPauseBtn.title = isPlaying ? '暂停' : '播放';
        }
        if (this.elements.miniPlayPauseBtn) {
            this.elements.miniPlayPauseBtn.textContent = isPlaying ? '⏸' : '▶';
        }
        if (this.elements.fullPlayerPlayPause) {
            this.elements.fullPlayerPlayPause.innerHTML = isPlaying ? 
                '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>' : 
                '<path d="M8 5v14l11-7z"/>';
        }

        // 更新封面
        if (status.thumbnail_url) {
            if (this.elements.miniPlayerCover) {
                this.elements.miniPlayerCover.src = status.thumbnail_url;
                this.elements.miniPlayerCover.style.display = 'block';
            }
            if (this.elements.fullPlayerCover) {
                this.elements.fullPlayerCover.src = status.thumbnail_url;
                this.elements.fullPlayerCover.style.display = 'block';
            }
        }
    }

    // 渲染播放列表
    renderPlaylist() {
        const status = player.getStatus();
        renderPlaylistUI({
            container: this.elements.playListContainer,
            titleEl: this.elements.playListTitle,
            onPlay: (song) => this.playSong(song),
            currentMeta: status?.current_meta || null
        });
    }

    // 播放歌曲
    async playSong(song) {
        try {
            loading.show('正在播放...');
            await player.play(song.url, song.title, song.type);
        } catch (error) {
            Toast.error('播放失败: ' + error.message);
        } finally {
            loading.hide();
        }
    }

    // 播放/暂停
    togglePlayPause() {
        player.togglePlayPause();
    }

    // 下一首
    playNext() {
        player.next();
    }

    // 上一首
    playPrev() {
        player.prev();
    }

    // 处理音量改变
    handleVolumeChange(e) {
        if (!this.elements.volumeSliderTrack) return;
        
        const rect = this.elements.volumeSliderTrack.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        volumeControl.setVolume(percent);
        
        // 更新显示
        if (this.elements.volumeSliderFill) {
            this.elements.volumeSliderFill.style.width = percent + '%';
        }
    }

    // 处理进度条点击
    handleProgressClick(e) {
        if (!this.elements.playerProgress) return;
        
        const rect = this.elements.playerProgress.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        // 获取当前歌曲时长并seek
        const status = player.getStatus();
        if (status?.mpv?.duration) {
            const seekTime = (percent / 100) * status.mpv.duration;
            player.seek(seekTime);
        }
    }

    // 处理全屏播放器进度条点击
    handleFullPlayerProgressClick(e) {
        if (!this.elements.fullPlayerProgressBar) return;
        
        const rect = this.elements.fullPlayerProgressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        const status = player.getStatus();
        if (status?.mpv?.duration) {
            const seekTime = (percent / 100) * status.mpv.duration;
            player.seek(seekTime);
        }
    }

    // 处理搜索
    async handleSearch() {
        // 搜索功能由search模块处理
        // 这里可以作为备用接口
        console.log('搜索功能已集成到search模块');
    }

    // 设置标签页切换
    setupTabNavigation() {
        if (!this.elements.bottomNav) {
            console.warn('❌ 底部导航栏未找到');
            return;
        }

        console.log('✅ 初始化标签页切换');
        const navItems = this.elements.bottomNav.querySelectorAll('.nav-item');
        console.log('🔍 找到', navItems.length, '个导航项');
        
        const tabContents = {
            'playlists': this.elements.playlist,
            'local': this.elements.tree
        };

        // 跟踪当前显示的标签页
        let currentTab = 'playlists';

        navItems.forEach((item, index) => {
            const tabName = item.getAttribute('data-tab');
            console.log(`📌 导航项${index}: data-tab="${tabName}"`);
            
            item.addEventListener('click', (e) => {
                console.log('🖱️ 点击导航项:', tabName);
                
                // 队列按钮：显示默认歌单
                if (tabName === 'playlists') {
                    console.log('📋 显示默认歌单');
                    // 更新导航按钮状态
                    navItems.forEach(navItem => navItem.classList.remove('active'));
                    item.classList.add('active');
                    
                    // 隐藏所有标签内容
                    Object.values(tabContents).forEach(tab => {
                        if (tab) tab.style.display = 'none';
                    });
                    
                    // 切换到默认歌单并显示
                    if (this.elements.playlist) {
                        this.elements.playlist.style.display = 'flex';
                        // 先切换到默认歌单，再渲染
                        playlistManager.switch('default').then(() => {
                            this.currentPlaylistId = 'default';
                            this.renderPlaylist();
                        }).catch(err => {
                            console.error('切换到默认歌单失败:', err);
                            this.renderPlaylist();
                        });
                    }
                    currentTab = 'playlists';
                    return;
                }
                
                if (tabName === 'ranking') {
                    const rankingModal = document.getElementById('rankingModal');
                    if (rankingModal) {
                        rankingModal.style.display = 'block';
                        // 这里可以触发加载排行榜数据
                    }
                    return;
                }
                
                if (tabName === 'search') {
                    const searchModal = document.getElementById('searchModal');
                    if (searchModal) {
                        searchModal.style.display = 'block';
                        const searchInput = document.getElementById('searchModalInput');
                        if (searchInput) {
                            searchInput.focus();
                        }
                    }
                    return;
                }
                
                // 本地标签的切换逻辑：点击已显示的本地按钮会收起，再次点击会展开
                if (tabName === 'local') {
                    const localButton = item;
                    if (currentTab === 'local') {
                        // 已显示本地，点击则收起（回到歌单）
                        console.log('📁 收起本地歌曲，返回歌单');
                        this.switchTab('playlists', navItems[0], navItems, tabContents);
                        currentTab = 'playlists';
                    } else {
                        // 未显示本地，点击则展开
                        console.log('📁 展开本地歌曲');
                        this.switchTab(tabName, localButton, navItems, tabContents);
                        currentTab = 'local';
                    }
                    return;
                }
                
                // 常规标签切换（目前只有本地文件）
                this.switchTab(tabName, e.currentTarget, navItems, tabContents);
                currentTab = tabName;
            });
        });
        
        // 绑定模态框关闭事件
        this.setupModalClosing();
    }

    // 切换标签页
    switchTab(tabName, clickedItem, navItems, tabContents) {
        console.log('🔄 切换到标签:', tabName);
        
        // 更新导航按钮状态
        navItems.forEach(item => item.classList.remove('active'));
        clickedItem.classList.add('active');
        console.log('✅ 更新导航按钮状态');

        // 隐藏所有标签内容
        Object.entries(tabContents).forEach(([key, tab]) => {
            if (tab) {
                tab.style.display = 'none';
                console.log(`隐藏: ${key}`);
            }
        });

        // 显示选中的标签内容
        const selectedTab = tabContents[tabName];
        console.log('📂 选中的标签对象:', selectedTab ? '存在' : '不存在');
        
        if (selectedTab) {
            // 本地文件树特殊处理
            if (tabName === 'local') {
                selectedTab.style.display = 'block';
            } else {
                selectedTab.style.display = 'flex';
            }
            console.log(`✅ 显示: ${tabName}`);
            
            // 根据不同标签页刷新内容
            switch(tabName) {
                case 'playlists':
                    console.log('🎵 刷新歌单显示');
                    this.renderPlaylist();
                    break;
                case 'local':
                    console.log('📂 刷新本地文件树');
                    localFiles.loadTree();
                    break;
                case 'ranking':
                    console.log('🏆 刷新排行榜');
                    // 如果有排行榜刷新方法，在这里调用
                    break;
                case 'search':
                    console.log('🔍 显示搜索页面');
                    // 搜索页面不需要特殊刷新，用户输入时会自动搜索
                    break;
            }
        } else {
            console.warn(`❌ 标签内容不存在: ${tabName}`);
        }
    }

    // 设置模态框关闭事件
    setupModalClosing() {
        // 排行榜模态框关闭
        const rankingModalClose = document.getElementById('rankingModalClose');
        const rankingModal = document.getElementById('rankingModal');
        if (rankingModalClose && rankingModal) {
            rankingModalClose.addEventListener('click', () => {
                rankingModal.style.display = 'none';
            });
            
            // 点击背景关闭
            rankingModal.addEventListener('click', (e) => {
                if (e.target === rankingModal) {
                    rankingModal.style.display = 'none';
                }
            });
        }
        
        // 搜索模态框关闭
        // 初始化搜索功能
        searchManager.initUI(() => this.currentPlaylistId, () => this.renderPlaylist());
    }

    // 处理进度条点击（旧版本，已被上面的新版本替代）
    handleProgressClickOld(e) {
        const progressContainer = e.currentTarget.parentElement;
        const rect = progressContainer.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        
        const status = player.getStatus();
        if (status?.mpv?.duration) {
            const seekTime = (percent / 100) * status.mpv.duration;
            player.seek(seekTime);
        }
    }
}

// ==========================================
// 应用启动
// ==========================================

// 创建全局应用实例
const app = new MusicPlayerApp();

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// 导出供调试使用
window.MusicPlayerApp = app;
window.modules = {
    api,
    player,
    playlistManager,
    volumeControl,
    searchManager
};

console.log('💡 模块化音乐播放器已加载');
console.log('💡 可通过 window.modules 访问各个模块');
