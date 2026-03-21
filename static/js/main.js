// 模块化主入口示例
// 这是一个使用新模块系统的示例文件

import { api } from './api.js?v=2';
import { player } from './player.js?v=3';
import { playlistManager, renderPlaylistUI, showPlaybackHistory } from './playlist.js?v=7';
import { playlistsManagement } from './playlists-management.js?v=6';
import { volumeControl } from './volume.js';
import { searchManager } from './search.js?v=10';
import { themeManager } from './themeManager.js';
import { debug } from './debug.js';
import { Toast, formatTime } from './ui.js';
import { focusFirstFocusable, isMobile, isIPad, restoreFocus, ThumbnailManager, trapFocusInContainer } from './utils.js';
import { localFiles } from './local.js?v=6';
import { settingsManager } from './settingsManager.js?v=3';
import { navManager } from './navManager.js';
import { i18n } from './i18n.js';
import { ktvSync } from './ktv.js?v=8';
import { playLock } from './playLock.js';
import { unavailableSongs } from './unavailable.js';

// ==========================================
// 应用初始化
// ==========================================

class MusicPlayerApp {
    constructor() {
        this.initialized = false;
        // 【用户隔离】从 localStorage 恢复歌单选择，默认为 'default'
        this.currentPlaylistId = localStorage.getItem('selectedPlaylistId') || 'default';
        this.lastPlayStatus = null;  // 追踪上一次的播放状态，用于检测播放停止

        // 状态追踪变量 - 用于只在改变时输出日志
        this.lastLoopMode = null;  // 循环模式
        this.lastVolume = null;    // 音量
        this.lastPlaybackStatus = null;  // 播放状态
        this.lastUILoopMode = null;  // UI更新中的循环模式跟踪，防止重复日志
        this.lastThumbnailUrl = null;  // 缩略图URL追踪
        this.lastPitchShift = null;   // 音调追踪，防止重复 UI 更新
        this._autoNextTriggered = false;  // 自动播放下一首的标记
        this._skipNextLoadCurrent = false;  // 手动切歌时跳过 loadCurrent() 网络请求

        // 初始化缩略图管理器 - 用于处理YouTube缩略图降级
        this.thumbnailManager = new ThumbnailManager();

        // 放大视图状态
        this.isArtworkExpanded = false;

        // ✅ playlistManager 会在 constructor 中自动从 localStorage 恢复选择歌单
    }

    async init() {
        if (this.initialized) return;
        
        console.log('🎵 初始化 ClubMusic...');
        
        try {
            // 0.1 初始化多语言系统
            i18n.init();
            
            // 1. 初始化 UI 元素
            this.initUIElements();
            
            // 2. 初始化播放器
            this.initPlayer();
            
            // 3. 初始化音量控制
            this.initVolumeControl();
            
            // 4. 初始化播放列表
            await this.initPlaylist();
            
            // 5. 初始化歌单管理模块
            playlistsManagement.init(
                async (playlistId) => {
                    await this.switchSelectedPlaylist(playlistId);
                },
                () => {
                    const navItems = document.querySelectorAll('#bottomNav .nav-item');
                    navItems.forEach(item => item.classList.remove('active'));

                    if (this.elements.playlist) {
                        this.elements.playlist.style.display = 'block';
                        setTimeout(() => {
                            this.elements.playlist.classList.add('tab-visible');
                        }, 10);
                    }

                    if (this.elements.tree) {
                        this.elements.tree.classList.remove('tab-visible');
                        this.elements.tree.style.display = 'none';
                    }

                    const playlistNavItem = document.querySelector('#bottomNav .nav-item[data-tab="playlists"]');
                    if (playlistNavItem) {
                        playlistNavItem.classList.add('active');
                    }
                }
            );
            
            // 5.5 初始化设置管理器（绑定关闭按钮等事件）
            await settingsManager.init();

            // 应用全屏控件设置
            await settingsManager.applyFullscreenControls();

            // 6. 绑定事件监听器
            this.bindEventListeners();

            // 初始化视频偏移量显示（从 localStorage 恢复）
            this.updateVideoOffsetUI(ktvSync.videoOffset);
            
            // 7. 恢复播放状态
            await this.restorePlayState();
            
            // 8. 启动状态轮询 - 生产环境优化：缩短间隔从 2000ms 到 1000ms
            // 改进原因：降低网络延迟对播放状态更新的影响
            player.startPolling(1000);

            // 9. 启动进度条 RAF 循环（~60fps 本地插值，与服务器轮询解耦）
            this._startProgressLoop();
            
            this.initialized = true;
            console.log('✅ ClubMusic 初始化完成');
            
        } catch (error) {
            console.error('❌ 初始化失败:', error);
            Toast.error(i18n.t('player.initFailed') + ': ' + error.message);
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
            miniPlayer: document.getElementById('miniPlayer'),
            miniPlayerCollapseBtn: document.getElementById('miniPlayerCollapseBtn'),
            miniPlayPauseBtn: document.getElementById('miniPlayPauseBtn'),
            miniNextBtn: document.getElementById('miniNextBtn'),
            miniPlayerTitle: document.getElementById('miniPlayerTitle'),
            miniPlayerArtist: document.getElementById('miniPlayerArtist'),
            miniPlayerPlaylist: document.getElementById('miniPlayerPlaylist'),
            miniPlayerCover: document.getElementById('miniPlayerCover'),
            
            // 全屏播放器
            fullPlayer: document.getElementById('fullPlayer'),
            fullPlayerBack: document.getElementById('fullPlayerBack'),
            fullPlayerPlayPause: document.getElementById('fullPlayerPlayPause'),
            fullPlayerPrev: document.getElementById('fullPlayerPrev'),
            fullPlayerNext: document.getElementById('fullPlayerNext'),
            fullPlayerTitle: document.getElementById('fullPlayerTitle'),
            fullPlayerArtist: document.getElementById('fullPlayerArtist'),
            fullPlayerPlaylist: document.getElementById('fullPlayerPlaylist'),
            fullPlayerCover: document.getElementById('fullPlayerCover'),
            fullPlayerProgressBar: document.getElementById('fullPlayerProgressBar'),
            fullPlayerProgressFill: document.getElementById('fullPlayerProgressFill'),
            fullPlayerProgressThumb: document.getElementById('fullPlayerProgressThumb'),
            fullPlayerCurrentTime: document.getElementById('fullPlayerCurrentTime'),
            fullPlayerDuration: document.getElementById('fullPlayerDuration'),
            fullPlayerExpand: document.getElementById('fullPlayerExpand'),
            fullPlayerShuffle: document.getElementById('fullPlayerShuffle'),
            fullPlayerLoop: document.getElementById('fullPlayerLoop'),
            fullPlayerPitchDown: document.getElementById('fullPlayerPitchDown'),
            fullPlayerPitchDisplay: document.getElementById('fullPlayerPitchDisplay'),
            fullPlayerPitchUp: document.getElementById('fullPlayerPitchUp'),
            fullPlayerOffsetControl: document.getElementById('fullPlayerVideoOffsetControl'),
            fullPlayerOffsetDown: document.getElementById('fullPlayerOffsetDown'),
            fullPlayerOffsetDisplay: document.getElementById('fullPlayerOffsetDisplay'),
            fullPlayerOffsetUp: document.getElementById('fullPlayerOffsetUp'),
            fullPlayerVolumeSlider: document.getElementById('fullPlayerVolumeSlider'),

            // 音量控制已移至 fullPlayerVolumeSlider
            
            // 播放进度
            playerProgress: document.getElementById('playerProgress'),
            playerProgressFill: document.getElementById('playerProgressFill'),
            playerProgressThumb: document.getElementById('playerProgressThumb'),
            
            // 播放列表
            playlistToolbar: document.getElementById('playlistToolbar'),
            playListContainer: document.getElementById('playListContainer'),
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
            tree: document.getElementById('tree'),

            // Now Playing Panel (iPad Landscape)
            nppPanel: document.getElementById('nowPlayingPanel'),
            nppCover: document.getElementById('nppCover'),
            nppPlaceholder: document.getElementById('nppPlaceholder'),
            nppTitle: document.getElementById('nppTitle'),
            nppArtist: document.getElementById('nppArtist'),
            nppProgressFill: document.getElementById('nppProgressFill'),
            nppCurrentTime: document.getElementById('nppCurrentTime'),
            nppDuration: document.getElementById('nppDuration'),
            nppPlayPause: document.getElementById('nppPlayPause'),
            nppPrev: document.getElementById('nppPrev'),
            nppNext: document.getElementById('nppNext'),
            nppArtworkSection: document.getElementById('nppArtworkSection'),
            nppProgressBar: document.getElementById('nppProgressBar')
        };
    }

    // 初始化播放器
    initPlayer() {
        // 监听播放状态更新
        player.on('statusUpdate', async ({ status }) => {
            // 【用户隔离】不再从后端同步 current_playlist_id
            // 歌单选择由前端 localStorage 独立管理，每个浏览器独立
            // status.current_playlist_id 只用于调试，不覆盖前端状态
            
            // ✅ 只在循环模式改变时输出日志
            if (status && status.loop_mode !== this.lastLoopMode) {
                const loopModes = {
                    0: '❌ 不循环',
                    1: '🔂 单曲循环',
                    2: '🔁 全部循环'
                };
                console.log(`%c[播放器] 循环模式改变: ${loopModes[this.lastLoopMode] || '?'} → ${loopModes[status.loop_mode] || '?'}`, 
                    'color: #2196F3; font-weight: bold');
                this.lastLoopMode = status.loop_mode;
            }

            const mpvData = status?.mpv_state || status?.mpv || {};
            const paused = mpvData.paused ?? true;
            const volume = mpvData.volume;
            
            // ✅ 只在播放状态改变时输出日志
            if (status && paused !== this.lastPlaybackStatus) {
                const statusText = paused ? '⏸️ 已暂停' : '▶️ 正在播放';
                console.log(`%c[播放器] ${statusText}`, 
                    `color: ${paused ? '#FF9800' : '#4CAF50'}; font-weight: bold`);
                this.lastPlaybackStatus = paused;
            }
            
            // ✅ 只在音量改变时输出日志（避免频繁输出）
            if (status && volume !== null && volume !== undefined && !isNaN(volume)) {
                const roundedVolume = Math.round(volume);
                if (roundedVolume !== Math.round(this.lastVolume || 0)) {
                    console.log(`%c[播放器] 🔊 音量: ${roundedVolume}%`, 
                        'color: #FF9800; font-weight: bold');
                    this.lastVolume = volume;
                }
            }
            
            // ✅【关键】自动播放完全由后端控制，前端只负责显示状态
            // 当歌曲播放完毕时，后端 handle_playback_end() 会：
            // 1. 通过 MPV 事件监听检测 end-file 事件
            // 2. 删除当前播放的歌曲（通过URL匹配）
            // 3. 播放删除后的 songs[0]
            // 前端只需等待后续 statusUpdate 中 current_meta 的变化即可
            
            this.lastPlayStatus = status;
            this.updatePlayerUI(status);

            // 同步音调状态（页面刷新后恢复，或换歌后自动重置为 0）
            if (status?.pitch_shift !== undefined && status.pitch_shift !== this.lastPitchShift) {
                this.lastPitchShift = status.pitch_shift;
                this.updatePitchUI(status.pitch_shift);
            }

            // 视频偏移控件：仅在 YouTube/KTV 模式下显示
            const isYouTube = status?.current_meta?.type === 'youtube';
            if (this.elements.fullPlayerOffsetControl) {
                this.elements.fullPlayerOffsetControl.classList.toggle('visible', !!isYouTube);
            }

            // ✅【关键修复】歌曲变化时：先刷新播放列表数据，再重新渲染
            // 这样才能显示后端删除当前歌曲后的最新列表
            const currentUrl = status?.current_meta?.url || status?.current_meta?.rel || null;
            if (currentUrl !== this._lastRenderedSongUrl) {
                if (this._skipNextLoadCurrent) {
                    // 由 next/prev 直接触发：跳过 loadCurrent() 请求，直接重渲染
                    this._skipNextLoadCurrent = false;
                    this._lastRenderedSongUrl = currentUrl;
                    this.renderPlaylist();
                    console.log('[歌曲变化] ✓ 手动切歌，直接重渲染（跳过 loadCurrent）');
                } else {
                    try {
                        // 由轮询发现的变化（自动续播等）：需要重新加载列表数据
                        await playlistManager.loadCurrent();
                        this._lastRenderedSongUrl = currentUrl;
                        this.renderPlaylist();
                        console.log('[歌曲变化] ✓ 已刷新播放列表数据');
                    } catch (error) {
                        console.warn('[歌曲变化] 刷新播放列表数据失败，保留待重试状态:', error);
                        this.renderPlaylist();
                    }
                }
            }
        });

        // 监听播放事件
        player.on('play', (data) => {
            const { url, title } = data || {};
            if (title) {
                Toast.success(i18n.t('player.nowPlaying', { title }));
            }
        });

        // 手动切歌时设置标志，避免重复的 loadCurrent() 网络请求
        player.on('prev', () => { this._skipNextLoadCurrent = true; });
        player.on('play', () => { this._skipNextLoadCurrent = true; });

        // 监听暂停事件
        player.on('pause', () => {
            console.log('播放已暂停');
        });

        // ✅【移除】自动播放完全由后端 handle_playback_end() 控制
        // 后端通过 MPV 事件监听器检测 end-file 事件并自动处理自动播放
        // 前端不应该在这里干涉自动播放流程，以避免竞态条件

        // 监听循环模式变化
        player.on('loopChange', (loopMode) => {
            this.updateLoopButtonUI(loopMode);
        });

        player.on('shuffleChange', (shuffleMode) => {
            this.updateShuffleButtonUI(shuffleMode);
        });

        // 监听音调变化
        player.on('pitchChange', (pitchShift) => {
            this.updatePitchUI(pitchShift);
        });

        // 监听 WebSocket 推送的歌单变更事件
        // 当其他用户操作（next/prev/删除歌曲）时，所有客户端都会收到此事件
        player.on('playlistChanged', async () => {
            console.log('[WS] 歌单已变更，刷新歌单列表');
            try {
                await playlistManager.loadCurrent();
                this.renderPlaylist();
            } catch (e) {
                console.warn('[WS] 刷新歌单失败:', e);
            }
        });
    }

    // 更新循环按钮的视觉状态
    updateLoopButtonUI(loopMode) {
        const buttons = [
            this.elements.loopBtn,
            this.elements.nowPlayingRepeatBtn,
            this.elements.fullPlayerLoop,
        ];

        // 循环模式: 0=不循环, 1=单曲循环, 2=全部循环
        const loopModeText = [i18n.t('player.loop.off'), i18n.t('player.loop.single'), i18n.t('player.loop.all')];
        const loopModeEmoji = ['↻', '🔂', '🔁'];

        // 只在循环模式实际改变时输出日志
        if (loopMode !== this.lastUILoopMode) {
            console.log('[循环模式] 已更新至:', loopModeText[loopMode]);
            this.lastUILoopMode = loopMode;
        }

        buttons.forEach(btn => {
            if (btn) {
                // 更新文本内容和样式
                const emoji = loopModeEmoji[loopMode] || '↻';

                // 处理文本按钮（底部loopBtn）
                if (btn.id === 'loopBtn') {
                    btn.textContent = emoji;
                } else {
                    // 处理SVG按钮，需要添加active类来改变颜色
                    const title = loopModeText[loopMode];
                    btn.setAttribute('data-mode', loopMode);
                }

                // 添加/移除active类以显示视觉反馈
                if (loopMode === 0) {
                    btn.classList.remove('loop-active');
                    btn.style.opacity = '0.6';
                } else {
                    btn.classList.add('loop-active');
                    btn.style.opacity = '1';
                }

                // 更新title属性
                btn.title = i18n.t('player.loop.title', { mode: loopModeText[loopMode] });

                // 全屏循环按钮：单曲循环时显示 "1" 徽章
                if (btn.id === 'fullPlayerLoop') {
                    let badge = btn.querySelector('.loop-badge');
                    if (loopMode === 1) {
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'loop-badge';
                            btn.appendChild(badge);
                        }
                        badge.textContent = '1';
                    } else if (badge) {
                        badge.remove();
                    }
                }
            }
        });
    }

    // 更新随机播放按钮的视觉状态
    updateShuffleButtonUI(shuffleMode) {
        const btn = this.elements.fullPlayerShuffle;
        if (!btn) return;

        if (shuffleMode) {
            btn.classList.add('shuffle-active');
            btn.style.opacity = '1';
            btn.title = i18n.t('player.shuffle.on');
        } else {
            btn.classList.remove('shuffle-active');
            btn.style.opacity = '0.5';
            btn.title = i18n.t('player.shuffle.off');
        }
    }

    // 更新升降调控件的视觉状态
    updatePitchUI(pitchShift) {
        const display = this.elements.fullPlayerPitchDisplay;
        if (!display) return;
        if (pitchShift === 0) {
            display.textContent = '0';
            display.classList.remove('pitch-active');
        } else {
            display.textContent = pitchShift > 0 ? `+${pitchShift}` : `${pitchShift}`;
            display.classList.add('pitch-active');
        }
        if (this.elements.fullPlayerPitchUp) {
            this.elements.fullPlayerPitchUp.disabled = pitchShift >= 6;
        }
        if (this.elements.fullPlayerPitchDown) {
            this.elements.fullPlayerPitchDown.disabled = pitchShift <= -6;
        }
    }

    // 更新视频同步偏移控件的视觉状态
    updateVideoOffsetUI(offset) {
        const display = this.elements.fullPlayerOffsetDisplay;
        if (!display) return;
        const rounded = Math.round(offset * 10) / 10;
        display.textContent = rounded === 0 ? '0.0s'
            : (rounded > 0 ? `+${rounded.toFixed(1)}s` : `${rounded.toFixed(1)}s`);
        display.classList.toggle('offset-active', rounded !== 0);
    }

    // Now Playing 侧边面板更新 (iPad 横屏)
    _updateNowPlayingPanel(status) {
        const panel = this.elements.nppPanel;
        if (!panel) return;

        const isLandscapeTablet = window.matchMedia(
            '(min-width: 1024px) and (orientation: landscape)'
        ).matches;
        const hasSong = !!(status?.current_meta?.title || status?.current_title);

        if (!isLandscapeTablet || !hasSong) {
            panel.style.display = 'none';
            document.body.classList.remove('npp-visible');
            return;
        }

        panel.style.display = '';
        document.body.classList.add('npp-visible');

        // 标题 / 艺术家
        const title = status.current_title || status.title || status.current_meta?.title || '';
        const artist = status.current_meta?.artist || status.artist || '--';

        if (this.elements.nppTitle) this.elements.nppTitle.textContent = title;
        if (this.elements.nppArtist) this.elements.nppArtist.textContent = artist;

        // 封面 (复用 ThumbnailManager)
        const thumbnailUrl = status.thumbnail_url || status.current_meta?.thumbnail_url || '';
        if (thumbnailUrl && this.elements.nppCover) {
            this.elements.nppCover.style.display = 'block';
            if (this.elements.nppPlaceholder) this.elements.nppPlaceholder.style.display = 'none';
            this.thumbnailManager.setupFallback(this.elements.nppCover, thumbnailUrl, '🎵');
        } else {
            if (this.elements.nppCover) this.elements.nppCover.style.display = 'none';
            if (this.elements.nppPlaceholder) this.elements.nppPlaceholder.style.display = 'flex';
        }

        // 播放/暂停按钮 SVG
        const isPlaying = (status?.mpv_state?.paused ?? status?.mpv?.paused ?? true) === false;
        if (this.elements.nppPlayPause) {
            const path = this.elements.nppPlayPause.querySelector('svg path');
            if (path) {
                path.setAttribute('d', isPlaying ?
                    'M6 4h4v16H6V4zm8 0h4v16h-4V4z' :
                    'M8 5v14l11-7z'
                );
            }
        }

        // 时长
        const mpvData = status?.mpv_state || status?.mpv || {};
        const duration = mpvData.duration || 0;
        if (this.elements.nppDuration) {
            this.elements.nppDuration.textContent = formatTime(duration);
        }
    }

    // RAF 进度循环：以每帧频率（~60fps）更新进度条，无需依赖服务器轮询
    _startProgressLoop() {
        if (this._progressRafId) return;
        const loop = () => {
            this._updateProgressBar();
            this._progressRafId = requestAnimationFrame(loop);
        };
        this._progressRafId = requestAnimationFrame(loop);
    }

    _stopProgressLoop() {
        if (this._progressRafId) {
            cancelAnimationFrame(this._progressRafId);
            this._progressRafId = null;
        }
    }

    _updateProgressBar() {
        const status = player.getStatus();
        const mpvData = status?.mpv_state || status?.mpv || {};
        const duration = mpvData.duration || 0;
        if (duration <= 0) return;

        const currentTime = player.getInterpolatedTime();
        const percent = (currentTime / duration) * 100;

        if (this.elements.fullPlayerCurrentTime)
            this.elements.fullPlayerCurrentTime.textContent = formatTime(currentTime);
        if (this.elements.fullPlayerProgressFill)
            this.elements.fullPlayerProgressFill.style.width = percent + '%';
        if (this.elements.fullPlayerProgressThumb)
            this.elements.fullPlayerProgressThumb.style.left = percent + '%';

        // Now Playing Panel 进度
        if (this.elements.nppProgressFill)
            this.elements.nppProgressFill.style.width = percent + '%';
        if (this.elements.nppCurrentTime)
            this.elements.nppCurrentTime.textContent = formatTime(currentTime);
    }


    initVolumeControl() {
        // 初始化音量控制
        const fullPlayerSlider = this.elements.fullPlayerVolumeSlider;
        
        if (fullPlayerSlider) {
            // 初始化 volumeControl，使用静默模式（默认仅在调试时输出日志）
            volumeControl.init(fullPlayerSlider, null, { silent: true });
            
            if (localStorage.getItem('DEBUG_MODE')) {
                console.log('✅ 音量控制已初始化');
            }
        }
    }

    /**
     * 恢复播放状态和推流激活状态
     * 页面刷新后恢复：
     * 1. 推流激活状态
     * 2. 正在播放的音乐
     */
    // [快速恢复] 页面刷新后立即恢复流连接（不等待其他初始化）

    async restorePlayState() {
        try {
            // 恢复播放状态
            try {
                const status = await player.refreshStatus();
                const paused = status?.mpv_state?.paused ?? status?.mpv?.paused ?? true;
                if (!paused) {
                    console.log('[恢复状态] 音乐正在播放，保持播放状态');
                } else {
                    console.log('[恢复状态] 音乐已暂停');
                }
            } catch (err) {
                console.warn('[恢复状态] 无法恢复播放状态:', err);
            }
        } catch (error) {
            console.error('[恢复状态] 恢复失败:', error);
        }
    }

    // 初始化播放列表
    async initPlaylist() {
        try {
            await playlistManager.refreshAll();

            // 如果在自定义房间中且有房间播放列表，自动选择房间播放列表
            if (api.roomId && playlistManager.roomPlaylist) {
                const roomPlaylistId = playlistManager.roomPlaylist.id;
                console.log('[初始化] 检测到自定义房间，自动选择房间播放列表:', roomPlaylistId);
                playlistManager.setSelectedPlaylist(roomPlaylistId);
                await playlistManager.loadCurrent();
            }

            // ✅ 从 playlistManager 恢复当前选择歌单的 ID（从 localStorage 中已恢复）
            const savedId = playlistManager.getSelectedPlaylistId();
            this.currentPlaylistId = savedId;
            console.log('[初始化] playlistManager.selectedPlaylistId:', savedId);
            console.log('[初始化] this.currentPlaylistId:', this.currentPlaylistId);
            console.log('[初始化] 恢复选择歌单:', this.currentPlaylistId);
            
            // 初始化时隐藏本地文件，点击本地标签时显示
            if (this.elements.tree) {
                this.elements.tree.classList.remove('tab-visible');
                console.log('✅ 隐藏tree');
            }
            
            // 显示playlist（添加tab-visible类以设置opacity=1）
            if (this.elements.playlist) {
                this.elements.playlist.classList.add('tab-visible');
                console.log('✅ 显示playlist');
            }
            
            this.renderPlaylist();

            // 激活队列导航按钮
            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                if (item.getAttribute('data-tab') === 'playlists') {
                    item.classList.add('active');
                }
            });
            
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
                if (playLock.isPreparing()) return;
                void this.togglePlayPause();
            });
        }

        // Mini 播放器已移除

        // 全屏播放器返回按钮 + 向下拖拽返回
        if (this.elements.fullPlayer) {
            // 返回上一导航栏的方法
            const goBackToNav = () => {
                this.elements.fullPlayer.classList.remove('show');
                setTimeout(() => {
                    this.elements.fullPlayer.style.display = 'none';
                }, 300);
            };

            // 点击返回按钮
            if (this.elements.fullPlayerBack) {
                this.elements.fullPlayerBack.addEventListener('click', goBackToNav);
            }

            // 拖拽返回逻辑
            let dragStart = { x: 0, y: 0 };
            let isDragging = false;
            let activePointerId = null;
            let startOpacity = 1;
            let isPhoneLandscape = false; // iPhone 横屏时使用水平滑动
            // iPad 屏幕更大，增大阈值防止误触
            const dragThreshold = isIPad() ? 120 : 80;
            const dragBlockSelector = [
                'button',
                'input',
                'select',
                'textarea',
                'label',
                'a',
                'iframe',
                '.full-player-progress-section',
                '.full-player-controls-grid',
                '.full-player-volume'
            ].join(', ');

            const resetDragStyles = () => {
                this.elements.fullPlayer.style.transition = '';
                this.elements.fullPlayer.style.transform = '';
                this.elements.fullPlayer.style.opacity = '';
            };

            const removeDragListeners = () => {
                document.removeEventListener('pointermove', handlePointerMove);
                document.removeEventListener('pointerup', handlePointerEnd);
                document.removeEventListener('pointercancel', handlePointerCancel);
            };

            const setLandscapeMode = () => {
                isPhoneLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
            };

            const isBlockedDragTarget = (target) => {
                if (!(target instanceof Element)) return false;
                return Boolean(target.closest(dragBlockSelector));
            };

            const startFullPlayerDrag = (clientX, clientY) => {
                dragStart = { x: clientX, y: clientY };
                isDragging = true;
                startOpacity = 1;
                setLandscapeMode();

                // 忽略距左边缘 30px 内的触摸（避免与 iOS 返回手势冲突）
                if (isPhoneLandscape && dragStart.x < 30) {
                    isDragging = false;
                    return false;
                }

                return true;
            };

            const applyDragMotion = (clientX, clientY) => {
                if (!isDragging) return;

                const delta = isPhoneLandscape
                    ? Math.max(0, clientX - dragStart.x)
                    : Math.max(0, clientY - dragStart.y);
                const opacity = Math.max(0.3, startOpacity - (delta / 300));

                this.elements.fullPlayer.style.transform = isPhoneLandscape
                    ? `translateX(${delta}px)`
                    : `translateY(${delta}px)`;
                this.elements.fullPlayer.style.opacity = opacity;
            };

            const animateDragReset = () => {
                this.elements.fullPlayer.style.transition = 'all 0.3s ease-out';
                this.elements.fullPlayer.style.transform = isPhoneLandscape ? 'translateX(0)' : 'translateY(0)';
                this.elements.fullPlayer.style.opacity = '1';

                setTimeout(() => {
                    this.elements.fullPlayer.style.transition = '';
                }, 300);
            };

            const animateDragClose = () => {
                this.elements.fullPlayer.style.transition = 'all 0.3s ease-out';
                this.elements.fullPlayer.style.transform = isPhoneLandscape ? 'translateX(100%)' : 'translateY(100%)';
                this.elements.fullPlayer.style.opacity = '0';

                setTimeout(() => {
                    resetDragStyles();
                    goBackToNav();
                }, 300);
            };

            const finishFullPlayerDrag = (clientX, clientY) => {
                if (!isDragging) return;

                const delta = isPhoneLandscape
                    ? clientX - dragStart.x
                    : clientY - dragStart.y;

                isDragging = false;

                if (delta > dragThreshold) {
                    animateDragClose();
                } else {
                    animateDragReset();
                }
            };

            const handlePointerMove = (e) => {
                if (!isDragging || e.pointerId !== activePointerId) return;
                e.preventDefault();
                applyDragMotion(e.clientX, e.clientY);
            };

            const cleanupPointerDrag = () => {
                removeDragListeners();

                if (activePointerId !== null && this.elements.fullPlayer.hasPointerCapture?.(activePointerId)) {
                    this.elements.fullPlayer.releasePointerCapture(activePointerId);
                }

                activePointerId = null;
            };

            const handlePointerEnd = (e) => {
                if (!isDragging || e.pointerId !== activePointerId) return;
                cleanupPointerDrag();
                finishFullPlayerDrag(e.clientX, e.clientY);
            };

            const handlePointerCancel = (e) => {
                if (!isDragging || e.pointerId !== activePointerId) return;
                isDragging = false;
                cleanupPointerDrag();
                animateDragReset();
            };

            this.elements.fullPlayer.addEventListener('touchstart', (e) => {
                if (isBlockedDragTarget(e.target)) return;
                if (!this.elements.fullPlayer.classList.contains('show')) return;

                const touch = e.touches[0];
                if (!touch) return;

                startFullPlayerDrag(touch.clientX, touch.clientY);
            }, { passive: true });

            this.elements.fullPlayer.addEventListener('touchmove', (e) => {
                if (!isDragging || activePointerId !== null) return;

                const touch = e.touches[0];
                if (!touch) return;

                e.preventDefault();
                applyDragMotion(touch.clientX, touch.clientY);
            }, { passive: false });

            this.elements.fullPlayer.addEventListener('touchend', (e) => {
                if (!isDragging || activePointerId !== null) return;

                const touch = e.changedTouches[0];
                if (!touch) return;

                finishFullPlayerDrag(touch.clientX, touch.clientY);
            }, { passive: true });

            this.elements.fullPlayer.addEventListener('touchcancel', () => {
                if (!isDragging || activePointerId !== null) return;
                isDragging = false;
                animateDragReset();
            }, { passive: true });

            this.elements.fullPlayer.addEventListener('pointerdown', (e) => {
                if (activePointerId !== null) return;
                if (e.pointerType === 'touch') return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                if (isBlockedDragTarget(e.target)) return;
                if (!this.elements.fullPlayer.classList.contains('show')) return;

                if (!startFullPlayerDrag(e.clientX, e.clientY)) {
                    return;
                }

                activePointerId = e.pointerId;
                document.addEventListener('pointermove', handlePointerMove, { passive: false });
                document.addEventListener('pointerup', handlePointerEnd);
                document.addEventListener('pointercancel', handlePointerCancel);

                if (this.elements.fullPlayer.setPointerCapture) {
                    this.elements.fullPlayer.setPointerCapture(e.pointerId);
                }

                e.preventDefault();
            });

            // iPad 旋转时重置展开模式，防止布局错乱 + 更新 NPP 面板
            if (isIPad()) {
                const handleOrientationChange = () => {
                    // 延迟等待浏览器完成 reflow
                    setTimeout(() => {
                        if (this.isArtworkExpanded) {
                            this.toggleArtworkExpand();
                        }
                        // 同时更新 NPP 面板可见性
                        const status = player.getStatus();
                        if (status) {
                            this._updateNowPlayingPanel(status);
                        }
                    }, 100);
                };
                window.matchMedia('(orientation: landscape)').addEventListener('change', handleOrientationChange);

                // 备用: resize 事件防抖监听
                let resizeTimer;
                window.addEventListener('resize', () => {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        const status = player.getStatus();
                        if (status) {
                            this._updateNowPlayingPanel(status);
                        }
                    }, 200);
                });
            }
        }

        // 全屏播放器控制
        if (this.elements.fullPlayerPlayPause) {
            this.elements.fullPlayerPlayPause.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                void this.togglePlayPause();
            });
        }

        // 下一首
        if (this.elements.nextBtn) {
            this.elements.nextBtn.addEventListener('click', async () => {
                await this.playNext();
            });
        }
        if (this.elements.fullPlayerNext) {
            this.elements.fullPlayerNext.addEventListener('click', async () => {
                await this.playNext();
            });
        }
        if (this.elements.miniNextBtn) {
            this.elements.miniNextBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // 阻止事件冒泡，避免触发打开全屏播放器
                await this.playNext();
            });
        }

        // 上一首
        if (this.elements.prevBtn) {
            this.elements.prevBtn.addEventListener('click', async () => {
                await this.playPrev();
            });
        }
        if (this.elements.fullPlayerPrev) {
            this.elements.fullPlayerPrev.addEventListener('click', async () => {
                await this.playPrev();
            });
        }

        // 循环模式
        if (this.elements.loopBtn) {
            this.elements.loopBtn.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                void this.runPlayerAction(() => player.cycleLoop(), '循环模式');
            });
        }
        if (this.elements.nowPlayingRepeatBtn) {
            this.elements.nowPlayingRepeatBtn.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                void this.runPlayerAction(() => player.cycleLoop(), '循环模式');
            });
        }
        if (this.elements.fullPlayerLoop) {
            this.elements.fullPlayerLoop.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                void this.runPlayerAction(() => player.cycleLoop(), '循环模式');
            });
        }
        if (this.elements.fullPlayerShuffle) {
            this.elements.fullPlayerShuffle.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                void this.runPlayerAction(() => player.toggleShuffle(), '随机播放');
            });
        }
        if (this.elements.fullPlayerPitchDown) {
            this.elements.fullPlayerPitchDown.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                void this.runPlayerAction(() => player.pitchDown(), '降调');
            });
        }
        if (this.elements.fullPlayerPitchUp) {
            this.elements.fullPlayerPitchUp.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                void this.runPlayerAction(() => player.pitchUp(), '升调');
            });
        }

        if (this.elements.fullPlayerOffsetDown) {
            this.elements.fullPlayerOffsetDown.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                const newOffset = ktvSync.adjustOffset(-0.2);
                this.updateVideoOffsetUI(newOffset);
            });
        }
        if (this.elements.fullPlayerOffsetUp) {
            this.elements.fullPlayerOffsetUp.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                const newOffset = ktvSync.adjustOffset(0.2);
                this.updateVideoOffsetUI(newOffset);
            });
        }
        if (this.elements.fullPlayerExpand) {
            this.elements.fullPlayerExpand.addEventListener('click', () => {
                this.toggleArtworkExpand();
            });
        }

        // 展开模式下点击封面/视频区域收回
        const artworkContainer = this.elements.fullPlayerCover?.parentElement;
        if (artworkContainer) {
            artworkContainer.addEventListener('click', (e) => {
                if (this.isArtworkExpanded && !e.target.closest('.full-player-expand')) {
                    this.toggleArtworkExpand();
                }
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
                if (playLock.isPreparing()) return;
                this.handleProgressClick(e);
            });
        }
        if (this.elements.fullPlayerProgressBar) {
            // 点击跳转
            this.elements.fullPlayerProgressBar.addEventListener('click', (e) => {
                if (playLock.isPreparing()) return;
                this.handleFullPlayerProgressClick(e);
            });
            
            // 添加拖拽功能
            let isDragging = false;
            
            const handleDrag = (e) => {
                if (!isDragging) return;

                e.preventDefault();
                const rect = this.elements.fullPlayerProgressBar.getBoundingClientRect();
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

                // 实时更新进度条显示
                if (this.elements.fullPlayerProgressFill) {
                    this.elements.fullPlayerProgressFill.style.width = percent + '%';
                }
                if (this.elements.fullPlayerProgressThumb) {
                    this.elements.fullPlayerProgressThumb.style.left = percent + '%';
                }

                // 更新时间显示
                const status = player.getStatus();
                const mpvData = status?.mpv_state || status?.mpv || {};
                if (mpvData.duration && this.elements.fullPlayerCurrentTime) {
                    const currentTime = (percent / 100) * mpvData.duration;
                    this.elements.fullPlayerCurrentTime.textContent = formatTime(currentTime);
                }

                // 实时seek到拖拽位置（拖拽中实时播放）
                player.seek(percent).catch(err => {
                    console.warn('实时seek失败:', err);
                });
            };

            const endDrag = (e) => {
                if (!isDragging) return;
                isDragging = false;
                this.elements.fullPlayerProgressBar.classList.remove('dragging');
                // 拖拽结束，移除 document 级别监听器
                document.removeEventListener('mousemove', handleDrag);
                document.removeEventListener('mouseup', endDrag);
                document.removeEventListener('touchmove', handleDrag);
                document.removeEventListener('touchend', endDrag);
            };

            const startDrag = (e) => {
                if (playLock.isPreparing()) return;
                isDragging = true;
                this.elements.fullPlayerProgressBar.classList.add('dragging');
                // 仅在拖拽期间注册 document 级别监听器，避免全局 scroll-blocking
                document.addEventListener('mousemove', handleDrag);
                document.addEventListener('mouseup', endDrag);
                document.addEventListener('touchmove', handleDrag, { passive: false });
                document.addEventListener('touchend', endDrag, { passive: true });
                handleDrag(e);
            };

            // 鼠标/触摸事件 — 仅在元素上监听 start，document 级别监听器在拖拽时动态注册
            this.elements.fullPlayerProgressBar.addEventListener('mousedown', startDrag);
            this.elements.fullPlayerProgressBar.addEventListener('touchstart', startDrag, { passive: false });
        }

        // 完整播放器的音量控制
        if (this.elements.fullPlayerVolumeSlider) {
            this.elements.fullPlayerVolumeSlider.addEventListener('input', (e) => {
                if (playLock.isPreparing()) return;
                const volume = parseInt(e.target.value);
                // 通过 volumeControl 来设置音量，保持同步
                volumeControl.updateDisplay(volume);
            });
            this.elements.fullPlayerVolumeSlider.addEventListener('change', (e) => {
                if (playLock.isPreparing()) return;
                const volume = parseInt(e.target.value);
                // 通过 volumeControl 来设置音量到服务器
                volumeControl.setVolume(volume);
            });
        }

        // 初始化调试面板模块
        debug.init(player, playlistManager);
        
        // 安全地初始化音频格式按钮
        if (debug && typeof debug.initAudioFormatButtons === 'function') {
            debug.initAudioFormatButtons();
        }

        // Now Playing Panel 控件
        if (this.elements.nppPlayPause) {
            this.elements.nppPlayPause.addEventListener('click', () => {
                if (playLock.isPreparing()) return;
                void this.togglePlayPause();
            });
        }
        if (this.elements.nppNext) {
            this.elements.nppNext.addEventListener('click', async () => {
                await this.playNext();
            });
        }
        if (this.elements.nppPrev) {
            this.elements.nppPrev.addEventListener('click', async () => {
                await this.playPrev();
            });
        }

        // Now Playing Panel 进度条: 点击定位
        if (this.elements.nppProgressBar) {
            this.elements.nppProgressBar.addEventListener('click', (e) => {
                if (playLock.isPreparing()) return;
                const rect = this.elements.nppProgressBar.getBoundingClientRect();
                const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                const status = player.getStatus();
                const duration = status?.mpv?.duration || status?.mpv_state?.duration || 0;
                if (duration > 0) {
                    player.seek(percent).catch(err => console.warn('[NPP Seek] Error:', err));
                }
            });
        }

        // 点击封面打开全屏播放器
        if (this.elements.nppArtworkSection) {
            this.elements.nppArtworkSection.addEventListener('click', () => {
                if (this.elements.fullPlayer) {
                    this.elements.fullPlayer.style.display = 'flex';
                    setTimeout(() => {
                        this.elements.fullPlayer.classList.add('show');
                    }, 10);
                }
            });
        }

        // 横屏/竖屏切换时更新 Now Playing 面板
        if (isIPad()) {
            window.matchMedia('(orientation: landscape)').addEventListener('change', () => {
                const status = player.getStatus();
                if (status) {
                    this._updateNowPlayingPanel(status);
                }
            });
        }

        // 标签页切换
        this.setupTabNavigation();
    }
    
    // 更新播放器 UI
    updatePlayerUI(status) {
        if (!status) return;

        // 更新标题和信息
        const title = status.current_title || status.title || status.current_meta?.title || i18n.t('player.notPlaying');
        const artist = status.current_meta?.artist || status.artist || '--';
        const playlistName = status.current_playlist_name || '默认';
        
        // 更新迷你播放器标题和信息
        if (this.elements.miniPlayerTitle) {
            this.elements.miniPlayerTitle.textContent = title;
        }
        if (this.elements.miniPlayerArtist) {
            this.elements.miniPlayerArtist.textContent = artist;
        }
        if (this.elements.miniPlayerPlaylist) {
            this.elements.miniPlayerPlaylist.textContent = playlistName;
        }
        
        // 更新全屏播放器标题和艺术家
        if (this.elements.fullPlayerTitle) {
            this.elements.fullPlayerTitle.textContent = title;
        }
        if (this.elements.fullPlayerArtist) {
            this.elements.fullPlayerArtist.textContent = artist;
        }
        if (this.elements.fullPlayerPlaylist) {
            this.elements.fullPlayerPlaylist.textContent = playlistName;
        }

        // KTV视频同步 ���在更新完UI后调用
        if (ktvSync) {
            ktvSync.updateStatus(status);
        }

        // 更新进度信息（支持两种字段名）
        const mpvData = status?.mpv_state || status?.mpv || {};
        if (mpvData) {
            const duration = mpvData.duration || 0;

            // 前端只负责显示播放进度，自动播放完全由后端控制
            // 注：currentTime 和全屏进度条由 RAF 循环（_updateProgressBar）实时更新

            if (this.elements.fullPlayerDuration) {
                this.elements.fullPlayerDuration.textContent = formatTime(duration);
            }

            // 更新播放进度条（迷你播放器）
            if (this.elements.playerProgressFill && duration > 0) {
                const currentTime = mpvData.time_pos || mpvData.time || 0;
                const percent = (currentTime / duration) * 100;
                if (this.elements.playerProgress) {
                    this.elements.playerProgressFill.style.width = percent + '%';
                }
            }

            // 更新迷你播放器进度条
            if (duration > 0) {
                const currentTime = mpvData.time_pos || mpvData.time || 0;
                const percent = (currentTime / duration) * 100;
                // 查找迷你播放器进度条（如果没有缓存元素）
                const miniProgressFill = document.getElementById('miniPlayerProgressFill');
                if (miniProgressFill) {
                    miniProgressFill.style.width = percent + '%';
                }
                
                // 更新当前播放歌曲卡片的进度条
                const trackProgressFill = document.getElementById('currentTrackProgress');
                if (trackProgressFill) {
                    trackProgressFill.style.width = percent + '%';
                } else {
                    // 如果找不到进度条元素，尝试找到current-playing卡片并添加
                    const currentPlayingCard = document.querySelector('.playlist-track-item.current-playing');
                    if (currentPlayingCard && !currentPlayingCard.querySelector('.track-progress-bar')) {
                        const progressBar = document.createElement('div');
                        progressBar.className = 'track-progress-bar';
                        const progressFill = document.createElement('div');
                        progressFill.className = 'track-progress-fill';
                        progressFill.id = 'currentTrackProgress';
                        progressFill.style.width = percent + '%';
                        progressBar.appendChild(progressFill);
                        currentPlayingCard.appendChild(progressBar);
                    }
                }
            }
        }

        // 更新播放/暂停按钮状态
        const isPlaying = (status?.mpv_state?.paused ?? status?.mpv?.paused ?? true) === false;
        
        // 更新按钮文本/图标
        if (this.elements.playPauseBtn) {
            this.elements.playPauseBtn.textContent = isPlaying ? '⏸' : '▶';
            this.elements.playPauseBtn.title = isPlaying ? i18n.t('player.pause') : i18n.t('player.play');
        }
        if (this.elements.miniPlayPauseBtn) {
            this.elements.miniPlayPauseBtn.textContent = isPlaying ? '⏸' : '▶';
        }
        if (this.elements.fullPlayerPlayPause) {
            // 更新SVG path的d属性以显示正确的图标
            const svg = this.elements.fullPlayerPlayPause.querySelector('svg');
            const path = this.elements.fullPlayerPlayPause.querySelector('svg path');
            if (path && svg) {
                // 暂停: 两个竖条 | |  播放: 三角形 ▶
                path.setAttribute('d', isPlaying ? 
                    'M6 4h4v16H6V4zm8 0h4v16h-4V4z' :  // 暂停按钮
                    'M8 5v14l11-7z'  // 播放按钮
                );
            }
        }

        // 更新封面 - 使用ThumbnailManager处理降级和缓存
        const thumbnailUrl = status.thumbnail_url || status.current_meta?.thumbnail_url || '';

        if (thumbnailUrl) {
            // 只在缩略图改变时更新
            if (thumbnailUrl !== this.lastThumbnailUrl) {
                this.lastThumbnailUrl = thumbnailUrl;

                // 使用ThumbnailManager处理缩略图降级
                if (this.elements.miniPlayerCover) {
                    this.elements.miniPlayerCover.style.display = 'block';
                    this.thumbnailManager.setupFallback(
                        this.elements.miniPlayerCover,
                        thumbnailUrl,
                        '🎵'
                    );
                }

                if (this.elements.fullPlayerCover) {
                    this.elements.fullPlayerCover.style.display = 'block';
                    this.thumbnailManager.setupFallback(
                        this.elements.fullPlayerCover,
                        thumbnailUrl,
                        '🎵'
                    );
                }
            }
        } else {
            // 如果没有封面，隐藏img并显示占位符
            if (this.elements.miniPlayerCover) {
                this.elements.miniPlayerCover.style.display = 'none';
            }
            if (this.elements.fullPlayerCover) {
                this.elements.fullPlayerCover.style.display = 'none';
            }
            this.lastThumbnailUrl = null;  // 重置缩略图追踪
        }

        // 更新循环按钮状态（从status中获取最新的循环模式）
        if (status && status.loop_mode !== undefined) {
            this.updateLoopButtonUI(status.loop_mode);
        }

        // 更新随机播放按钮状态
        if (status && status.shuffle_mode !== undefined) {
            this.updateShuffleButtonUI(status.shuffle_mode);
        }

        // 更新 Now Playing 侧边面板 (iPad 横屏)
        this._updateNowPlayingPanel(status);
    }



    // 渲染播放列表
    renderPlaylist() {
        const status = player.getStatus();
        renderPlaylistUI({
            container: this.elements.playListContainer,
            onPlay: (song) => this.playSong(song),
            currentMeta: status?.current_meta || null
        });
    }

    // 更新歌单歌曲数量显示（已移除playlist header，此方法不再需要）
    // updatePlaylistCount() {
    //     const countEl = document.getElementById('playListCount');
    //     if (countEl) {
    //         const songs = playlistManager.getSongs();
    //         const count = songs ? songs.length : 0;
    //         countEl.textContent = `${count} 首歌曲`;
    //     }
    // }

    // ✅ 新增：切换选择歌单
    async switchSelectedPlaylist(playlistId) {
        try {
            console.log('[应用] 切换选择歌单:', playlistId);

            await playlistManager.switch(playlistId);
            this.currentPlaylistId = playlistManager.getSelectedPlaylistId();
            
            // 确保隐藏模态框，显示播放列表容器
            const playlistsModal = document.getElementById('playlistsModal');
            if (playlistsModal) {
                playlistsModal.classList.remove('modal-visible');
                setTimeout(() => {
                    playlistsModal.style.display = 'none';
                }, 300);
            }
            
            // 显示播放列表容器
            if (this.elements.playlist) {
                this.elements.playlist.style.display = 'block';
                setTimeout(() => {
                    this.elements.playlist.classList.add('tab-visible');
                }, 10);
            }
            
            // 隐藏本地文件
            if (this.elements.tree) {
                this.elements.tree.classList.remove('tab-visible');
                this.elements.tree.style.display = 'none';
            }
            
            // 刷新播放列表 UI
            this.renderPlaylist();

            // 更新底部导航栏active状态为播放列表
            const navItems = document.querySelectorAll('#bottomNav .nav-item');
            navItems.forEach(item => item.classList.remove('active'));
            const playlistNavItem = document.querySelector('#bottomNav .nav-item[data-tab="playlists"]');
            if (playlistNavItem) playlistNavItem.classList.add('active');

            console.log('[应用] ✓ 已切换到歌单:', this.currentPlaylistId);
            
        } catch (error) {
            console.error('[应用] 切换失败:', error);
            Toast.error(i18n.t('player.switchFailed') + ': ' + error.message);
        }
    }

    // 停止推流（用于切换歌曲时的清理）
    // 播放歌曲
    async playSong(song) {
        try {
            // 获取当前播放的歌曲信息
            const status = player.getStatus();
            const currentMeta = status?.current_meta;
            
            // 检查是否是当前正在播放的歌曲
            if (currentMeta && currentMeta.url === song.url && !status?.paused) {
                // 如果是当前正在播放的歌曲，则显示完整播放器（像点击mini播放器一样）
                if (this.elements.miniPlayer && this.elements.fullPlayer) {
                    this.elements.miniPlayer.style.display = 'none';
                    this.elements.fullPlayer.style.display = 'flex';
                    // 触发动画：先设置 display，然后添加 show 类
                    setTimeout(() => {
                        this.elements.fullPlayer.classList.add('show');
                    }, 10);
                }
                return;
            }
            
            // 清理前一次播放的超时
            if (this.playTimeouts && this.playTimeouts.length > 0) {
                this.playTimeouts.forEach(id => clearTimeout(id));
                this.playTimeouts = [];
            }

            // 播放准备锁：防止等待期间覆盖操作（自带全屏遮罩）
            if (!playLock.acquire(song.title)) {
                return;
            }

            // 播放歌曲，添加重试逻辑，网络歌曲特别容易失败
            let playSuccess = false;
            let lastError = null;
            const maxRetries = 3;
            
            for (let retry = 0; retry < maxRetries; retry++) {
                try {
                    console.log(`[Main.playSong] 调用player.play - song.url=${song.url.substring(0, 50)}, song.title=${song.title}, song.type=${song.type}, song.duration=${song.duration || 0}`);
                    await player.play(song.url, song.title, song.type, song.duration || 0);
                    playSuccess = true;
                    break; // 播放成功，跳出重试循环
                } catch (err) {
                    lastError = err;
                    console.warn(`[播放] 第 ${retry + 1} 次播放失败: ${err.message}`);
                    
                    // 如果是本地歌曲或最后一次重试，直接抛出
                    if (song.type === 'local' || retry === maxRetries - 1) {
                        throw err;
                    }
                    
                    // 网络歌曲失败，等待后重试
                    await new Promise(resolve => setTimeout(resolve, 500 * (retry + 1)));
                    console.log(`[播放] 等待后重试播放: ${song.title}`);
                }
            }
            
            if (playSuccess) {
                playLock.release();
            }

        } catch (error) {
            playLock.release();
            console.error('[播放错误] 播放失败:', error);
            Toast.error(i18n.t('player.playFailed') + ': ' + (error.message || error));
        }
    }

    _applySkippedSongs(result) {
        const payload = result?.result || result;
        if (payload?.skipped_songs?.length > 0) {
            payload.skipped_songs.forEach(s => { if (s.url) unavailableSongs.add(s.url); });
            this.renderPlaylist();
            Toast.warning(i18n.t('player.skippedSongs', { count: payload.skipped_songs.length }));
        }
    }

    async runPlayerAction(action, context, errorMessage = i18n.t('playlist.opFailed')) {
        try {
            return await action();
        } catch (err) {
            console.error(`[${context}] 错误:`, err);
            Toast.error(errorMessage);
            return null;
        }
    }

    // 播放/暂停
    async togglePlayPause() {
        if (playLock.isPreparing()) return;
        try {
            await player.togglePlayPause();
        } catch (err) {
            console.error('[播放/暂停] 错误:', err);
            Toast.error(i18n.t('player.playFailed'));
        }
    }

    // 下一首
    async playNext() {
        if (!playLock.acquire(i18n.t('player.preparingNext'))) return;
        try {
            const result = await player.next();
            this._applySkippedSongs(result);
        } catch (err) {
            this._applySkippedSongs(err);
            console.error('[下一首] 错误:', err);
            Toast.error(i18n.t('player.nextFailed'));
        } finally {
            playLock.release();
        }
    }

    // 上一首
    async playPrev() {
        if (!playLock.acquire(i18n.t('player.preparingPrev'))) return;
        try {
            const result = await player.prev();
            this._applySkippedSongs(result);
        } catch (err) {
            this._applySkippedSongs(err);
            console.error('[上一首] 错误:', err);
            Toast.error(i18n.t('player.prevFailed'));
        } finally {
            playLock.release();
        }
    }

    // 从默认歌单中删除当前正在播放的歌曲
    async removeCurrentSongFromPlaylist() {
        try {
            const status = player.getStatus();
            if (!status || !status.current_meta) {
                console.log('[删除歌曲] 没有正在播放的歌曲');
                return; // 没有正在播放的歌曲
            }
            
            const currentMeta = status.current_meta;
            const currentUrl = currentMeta.url || currentMeta.rel || currentMeta.raw_url;
            const currentTitle = currentMeta.title || currentMeta.name;
            
            if (!playlistManager || !playlistManager.currentPlaylist) {
                console.log('[删除歌曲] 播放列表管理器或播放列表不可用');
                return;
            }
            
            console.log('[删除歌曲] 当前播放信息:', {
                url: currentUrl,
                title: currentTitle,
                type: currentMeta.type,
                playlistLength: playlistManager.currentPlaylist.length
            });
            
            // 多层级匹配策略：先按 URL，再按标题，最后按索引（考虑 YouTube URL 可能变化）
            let currentIndex = -1;
            
            // 策略1: 按 URL 精确匹配
            currentIndex = playlistManager.currentPlaylist.findIndex(
                song => song.url === currentUrl
            );
            
            // 策略2: 如果找不到，尝试按标题匹配（YouTube 歌曲 URL 可能被转换）
            if (currentIndex === -1 && currentTitle) {
                console.log('[删除歌曲] 标准 URL 匹配失败，尝试标题匹配...');
                currentIndex = playlistManager.currentPlaylist.findIndex(
                    song => (song.title || song.name) === currentTitle
                );
            }
            
            // 策略3: 如果仍未找到，假设当前播放的是列表第一首（最常见的自动播放情况）
            if (currentIndex === -1 && playlistManager.currentPlaylist.length > 0) {
                console.warn('[删除歌曲] ⚠️ URL 和标题都无法匹配，假设是列表第一首（可能是 YouTube URL 转换）');
                currentIndex = 0;
            }
            
            console.log('[删除歌曲] 最终匹配索引:', currentIndex);
            
            if (currentIndex !== -1) {
                const removedSong = playlistManager.currentPlaylist[currentIndex];
                console.log('[删除歌曲] 准备删除:', removedSong.title || removedSong.name);
                
                // 使用 PlaylistManager 的 removeAt 方法，它会自动重新加载播放列表
                const result = await playlistManager.removeAt(currentIndex);
                if (result.status === 'OK') {
                    console.log('[删除歌曲] ✓ 成功删除索引为', currentIndex, '的歌曲');
                    // 重新渲染UI确保界面立即更新
                    this.renderPlaylist();
                } else {
                    console.error('[删除歌曲] ✗ 删除失败:', result.error || result.message);
                }
            } else {
                console.error('[删除歌曲] ✗ 无法找到当前播放的歌曲，跳过删除');
            }
        } catch (err) {
            console.error('[删除歌曲错误]', err.message);
        }
    }

    // 简单防抖：将请求延迟 200ms，频繁触发只会发送最后一次
    _volumeDebounceTimer = null;
    setVolumeDebounced(value) {
        clearTimeout(this._volumeDebounceTimer);
        this._volumeDebounceTimer = setTimeout(() => {
            void api.setVolume(value).then((response) => {
                if (response?._error || response?.status !== 'OK') {
                    console.warn('[音量] 更新失败:', response?.error || response?.message || response);
                }
            }).catch((error) => {
                console.warn('[音量] 更新失败:', error);
            });
        }, 200);
    }

    // 处理进度条点击
    handleProgressClick(e) {
        if (!this.elements.playerProgress) return;
        
        const rect = this.elements.playerProgress.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        // 将百分比发送到后端 /seek
        void this.runPlayerAction(() => player.seek(percent), '迷你播放器进度跳转');
    }

    // 处理全屏播放器进度条点击
    handleFullPlayerProgressClick(e) {
        if (!this.elements.fullPlayerProgressBar) return;
        
        const rect = this.elements.fullPlayerProgressBar.getBoundingClientRect();
        const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        
        // 将百分比发送到后端 /seek
        void this.runPlayerAction(() => player.seek(percent), '全屏播放器进度跳转');
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
        
        // 标签页内容映射
        const tabContents = {
            'playlists': this.elements.playlist,
            'local': this.elements.tree,
            'search': null    // 模态框
        };

        // 模态框映射
        const modals = {
            'search': document.getElementById('searchModal'),
            'debug': document.getElementById('debugModal')
        };
        const playlistsModal = document.getElementById('playlistsModal');

        // 导航历史栈
        // 保持导航栈为 app 实例属性，确保在外部回调也可访问
        this.navigationStack = this.navigationStack || ['playlists'];
        const navigationStack = this.navigationStack; // 局部引用（用于闭包）
         let currentModal = null; // 追踪当前打开的模态框
        
        // 获取当前栏目
        const getCurrentTab = () => navigationStack[navigationStack.length - 1];
        
        // 更新所有模态框的z-index，确保最后点击的在最上面
        const updateModalZIndex = () => {
            Object.values(modals).forEach(modal => {
                if (modal) {
                    modal.style.zIndex = '100';
                }
            });
            if (currentModal) {
                currentModal.style.zIndex = '1000';
            }
        };
        
        // 隐藏所有内容
        const hideAllContent = () => {
            // 隐藏所有tab内容
            Object.values(tabContents).forEach(tab => {
                if (tab) {
                    tab.classList.remove('tab-visible');
                    tab.style.display = 'none';
                }
            });

            // 隐藏所有模态框
            Object.values(modals).forEach(modal => {
                if (modal) {
                    modal.classList.remove('modal-visible');
                    modal.style.display = 'none';
                    modal.setAttribute('aria-hidden', 'true');
                }
            });

            // 隐藏歌单管理模态框
            if (playlistsModal) {
                playlistsModal.classList.remove('modal-visible');
                playlistsModal.style.display = 'none';
                playlistsModal.setAttribute('aria-hidden', 'true');
            }

            // 隐藏历史模态框
            const historyModal = document.getElementById('historyModal');
            if (historyModal) {
                historyModal.classList.remove('modal-visible');
                historyModal.style.display = 'none';
                historyModal.setAttribute('aria-hidden', 'true');
            }

            // 关闭设置面板（直接隐藏DOM，不触发closePanel的恢复逻辑）
            const settingsPanel = document.getElementById('settingsPanel');
            if (settingsPanel && settingsPanel.style.display !== 'none') {
                settingsPanel.style.display = 'none';
                settingsPanel.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }

            // 移除所有导航按钮的active状态
            navItems.forEach(item => item.classList.remove('active'));
            currentModal = null;
        };
        
        // 显示指定栏目
        const showTab = (tabName) => {
            console.log('📋 显示栏目:', tabName);
            
            // 关闭全屏播放器
            if (this.elements.fullPlayer && this.elements.fullPlayer.style.display !== 'none') {
                this.elements.fullPlayer.style.display = 'none';
                if (this.elements.miniPlayer) {
                    this.elements.miniPlayer.style.display = 'block';
                }
            }
            
            // 隐藏所有内容
            hideAllContent();
            
            // 激活对应的导航按钮
            const targetNavItem = Array.from(navItems).find(item => 
                item.getAttribute('data-tab') === tabName
            );
            if (targetNavItem) {
                targetNavItem.classList.add('active');
            }
            
            // 显示对应的内容
            if (tabName === 'playlists') {
                // 显示当前播放队列
                if (this.elements.playlist) {
                    this.elements.playlist.style.display = 'block';
                    setTimeout(() => {
                        this.elements.playlist.classList.add('tab-visible');
                    }, 10);
                }
            } else if (tabName === 'local') {
                // 本地歌曲
                if (this.elements.tree) {
                    this.elements.tree.style.display = 'block';
                    setTimeout(() => {
                        this.elements.tree.classList.add('tab-visible');
                    }, 10);
                    localFiles.resetToRoot();
                }
            } else if (tabName === 'search') {
                // 搜索模态框
                const modal = modals.search;
                if (modal) {
                    modal._previousActiveElement = document.activeElement;
                    modal.setAttribute('aria-hidden', 'false');
                    modal.style.display = 'block';
                    currentModal = modal;
                    setTimeout(() => {
                        modal.classList.add('modal-visible');
                        updateModalZIndex();
                        focusFirstFocusable(modal, '#searchModalInput');
                    }, 10);
                }
            } else if (tabName === 'debug') {
                // 调试模态框
                const modal = modals.debug;
                if (modal) {
                    modal._previousActiveElement = document.activeElement;
                    modal.setAttribute('aria-hidden', 'false');
                    modal.style.display = 'flex';
                    modal.classList.add('modal-visible');
                    currentModal = modal;

                    if (!modal._keydownHandler) {
                        modal._keydownHandler = (event) => {
                            if (modal.style.display === 'none') {
                                return;
                            }

                            if (event.key === 'Escape') {
                                event.preventDefault();
                                const closeButton = modal.querySelector('#debugModalClose');
                                if (closeButton) {
                                    closeButton.click();
                                }
                                return;
                            }

                            trapFocusInContainer(event, modal);
                        };
                    }

                    document.addEventListener('keydown', modal._keydownHandler);
                    setTimeout(() => {
                        debug.updateInfo();
                        updateModalZIndex();
                        focusFirstFocusable(modal, '#debugModalClose');
                    }, 100);
                }
            }
        };
        
        // 导航到指定栏目
        const navigateTo = (tabName) => {
            const currentTab = getCurrentTab();
            
            // 如果点击当前栏目
            if (currentTab === tabName) {
                console.log('ℹ️ 已在当前栏目:', tabName);
                
                // playlists 栏目：任何时候点击都切换到正在播放队列
                if (tabName === 'playlists') {
                    showTab('playlists');
                    return;
                }
                
                // 其他栏目只更新z-index
                if (modals[tabName]) {
                    currentModal = modals[tabName];
                }
                updateModalZIndex();
                return;
            }
            
            // 添加到历史栈
            navigationStack.push(tabName);
            console.log('📚 导航栈:', navigationStack);
            
            // 显示栏目
            showTab(tabName);
        };
        
        // 返回上一个栏目
        const navigateBack = () => {
            // 如果栈中只有一个元素，不能再返回 - 刷新页面
            if (navigationStack.length <= 1) {
                console.log('ℹ️ 已是第一个栏目，无法返回 - 刷新页面');
                window.location.reload();
                return;
            }
            
            // 弹出当前栏目
            navigationStack.pop();
            const previousTab = getCurrentTab();
            
            console.log('🔙 返回上一个栏目:', previousTab);
            console.log('📚 导航栈:', navigationStack);
            
            // 显示上一个栏目
            showTab(previousTab);
        };
        
        // 绑定导航项点击事件
        navItems.forEach((item, index) => {
            const tabName = item.getAttribute('data-tab');
            console.log(`📌 导航项${index}: data-tab="${tabName}"`);
            
            // 跳过没有 data-tab 属性的按钮
            if (!tabName) {
                console.log(`⏭️ 跳过 "${tabName}" 按钮（独立功能）`);
                return;
            }
            
            item.addEventListener('click', () => {
                console.log('🖱️ 点击导航项:', tabName);
                if (tabName === 'playlists') {
                    this.switchSelectedPlaylist(playlistManager.getActiveDefaultId());
                    navigateTo('playlists');
                    return;
                }
                navigateTo(tabName);
            });
        });
        
        // 设置按钮点击处理
        const settingsBtn = document.getElementById('settingsNavBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                console.log('⚙️ 点击设置按钮');
                navigateTo('settings');
                hideAllContent();
                settingsBtn.classList.add('active');
                settingsManager.openPanel();
            });
        }

        // 播放历史按钮点击处理
        const historyNavBtn = document.getElementById('historyNavBtn');
        if (historyNavBtn) {
            historyNavBtn.addEventListener('click', async () => {
                console.log('🕐 点击播放历史按钮');
                hideAllContent();
                historyNavBtn.classList.add('active');
                await showPlaybackHistory();
            });
        }

        // 歌单选择按钮点击处理
        const playlistSelectBtn = document.getElementById('playlistSelectNavBtn');
        if (playlistSelectBtn) {
            playlistSelectBtn.addEventListener('click', () => {
                console.log('📋 点击歌单选择按钮');
                hideAllContent();
                playlistSelectBtn.classList.add('active');
                playlistsManagement.show();
            });
        }

        const playlistsDebugBtn = document.getElementById('playlistsDebugBtn');
        if (playlistsDebugBtn) {
            playlistsDebugBtn.addEventListener('click', () => {
                console.log('🐛 点击调试面板按钮');
                navigateTo('debug');
            });
        }

        // 修改设置管理器的关闭方法，添加恢复逻辑
        const originalClosePanel = settingsManager.closePanel;
        settingsManager.closePanel = function() {
            // 先调用原始关闭方法
            originalClosePanel.call(this);
            
            console.log('⚙️ 设置关闭，恢复到上一个栏目');
            
            // 移除设置按钮的active状态
            if (settingsBtn) settingsBtn.classList.remove('active');
            
            setTimeout(() => {
                try {
                    const stack = Array.isArray(window.app?.navigationStack) ? window.app.navigationStack : navigationStack;
                    if (Array.isArray(stack) && stack[stack.length - 1] === 'settings') {
                        navigateBack();
                        return;
                    }
                } catch (e) {
                    console.warn('[导航] 无法恢复 settings 关闭前的栏目:', e);
                }

                showTab('playlists');
                const playlistsNavBtn = navItems[0];
                if (playlistsNavBtn) {
                    playlistsNavBtn.classList.add('active');
                }
            }, 300);
        };
        
        // 初始化时显示"队列"模块
        const firstNavItem = navItems[0];
        if (firstNavItem) {
            firstNavItem.classList.add('active');
            
            // ✅ 【修复】初始化时只显示播放列表，不打开歌单管理模态框
            // 显示播放列表容器
            if (this.elements.playlist) {
                this.elements.playlist.style.display = 'block';
                setTimeout(() => {
                    this.elements.playlist.classList.add('tab-visible');
                }, 10);
            }
            
            // 隐藏本地文件
            if (this.elements.tree) {
                this.elements.tree.classList.remove('tab-visible');
                this.elements.tree.style.display = 'none';
            }
            
            // 隐藏所有模态框
            Object.values(modals).forEach(modal => {
                if (modal) {
                    modal.classList.remove('modal-visible');
                    modal.style.display = 'none';
                }
            });
            if (playlistsModal) {
                playlistsModal.classList.remove('modal-visible');
                playlistsModal.style.display = 'none';
            }
            
            // 【用户隔离】不再强制切换到 default，保持 initPlaylist() 中从 localStorage 恢复的歌单选择
            // 只渲染列表，不改变当前歌单ID
            this.renderPlaylist();
        }
        
        // 绑定本地歌曲关闭按钮
        this.setupLocalCloseButton(navItems, navigateBack);
        
        // 绑定模态框关闭事件
        this.setupModalClosing(playlistsModal, modals, navItems, navigateBack, updateModalZIndex);
    }

    // 切换标签页

    // 设置本地歌曲关闭按钮
    setupLocalCloseButton(navItems, navigateBack) {
        const localCloseBtn = document.getElementById('localCloseBtn');
        if (!localCloseBtn) return;
        
        localCloseBtn.addEventListener('click', () => {
            console.log('🔙 关闭本地歌曲页面，返回上一个栏目');
            
            // 隐藏本地歌曲页面
            if (this.elements.tree) {
                this.elements.tree.classList.remove('tab-visible');
                setTimeout(() => {
                    if (this.elements.tree) {
                        this.elements.tree.style.display = 'none';
                    }
                }, 300);
            }
            
            // 移除本地按钮的active状态
            navItems.forEach(item => {
                if (item.getAttribute('data-tab') === 'local') {
                    item.classList.remove('active');
                }
            });
            
            // 返回上一个栏目
            setTimeout(() => {
                navigateBack();
            }, 300);
        });
    }

    // 设置模态框关闭事件
    setupModalClosing(playlistsModal, modals, navItems, navigateBack, updateModalZIndex) {
        // 歌単 sticky header 点击打开歌单模态框
        document.addEventListener('open-playlists-modal', () => {
            if (playlistsModal) {
                playlistsManagement.show();
            }
        });

        // 调试模态框关闭 - 支持点击背景和关闭按钮
        const debugModal = modals.debug;
        if (debugModal) {
            const closeDebugModal = () => {
                const previousActiveElement = debugModal._previousActiveElement;
                if (debugModal._keydownHandler) {
                    document.removeEventListener('keydown', debugModal._keydownHandler);
                }

                debugModal.classList.remove('modal-visible');
                debugModal.setAttribute('aria-hidden', 'true');

                if (Array.isArray(this.navigationStack) && this.navigationStack[this.navigationStack.length - 1] === 'debug') {
                    navigateBack();
                    restoreFocus(previousActiveElement);
                    return;
                }

                debugModal.style.display = 'none';
                restoreFocus(previousActiveElement);
                updateModalZIndex();
            };

            debugModal.addEventListener('click', (e) => {
                if (e.target === debugModal) {
                    closeDebugModal();
                }
            });
            
            const debugModalClose = document.getElementById('debugModalClose');
            if (debugModalClose) {
                debugModalClose.addEventListener('click', () => {
                    closeDebugModal();
                });
            }
        }
        
        // 初始化搜索功能
        searchManager.initUI(
            () => this.currentPlaylistId,
            async () => {
                await playlistManager.loadCurrent();
                this.renderPlaylist();
            },
            () => {
                console.log('🔍 搜索关闭，返回上一个栏目');

                updateModalZIndex();

                navItems.forEach(item => {
                    if (item.getAttribute('data-tab') === 'search') {
                        item.classList.remove('active');
                    }
                });

                if (Array.isArray(this.navigationStack) && this.navigationStack[this.navigationStack.length - 1] === 'search') {
                    this.navigationStack.pop();
                }

                if (this.elements.playlist) {
                    this.elements.playlist.style.display = 'block';
                    setTimeout(() => {
                        this.elements.playlist.classList.add('tab-visible');
                    }, 10);
                }
                if (this.elements.tree) {
                    this.elements.tree.classList.remove('tab-visible');
                    this.elements.tree.style.display = 'none';
                }
                const playlistsNavBtn = navItems[0];
                if (playlistsNavBtn) {
                    playlistsNavBtn.classList.add('active');
                }
            }
        );
    }

    /**
     * 切换视频容器展开/收缩状态
     */
    toggleArtworkExpand() {
        this.isArtworkExpanded = !this.isArtworkExpanded;

        const artworkContainer = this.elements.fullPlayerCover?.parentElement;
        const expandBtn = this.elements.fullPlayerExpand;
        const fullPlayer = this.elements.fullPlayer;

        if (this.isArtworkExpanded) {
            // 启用展开模式
            if (artworkContainer) {
                artworkContainer.classList.add('expanded');
            }
            if (expandBtn) {
                expandBtn.classList.add('active');
                expandBtn.title = '恢复原始大小';
            }
            if (fullPlayer) {
                fullPlayer.classList.add('artwork-expanded');
                fullPlayer.scrollTop = 0;
            }

            console.log('[UI] 视频容器已展开到全屏');
        } else {
            // 恢复原始大小
            if (artworkContainer) {
                artworkContainer.classList.remove('expanded');
            }
            if (expandBtn) {
                expandBtn.classList.remove('active');
                expandBtn.title = '放大视图';
            }
            if (fullPlayer) {
                fullPlayer.classList.remove('artwork-expanded');
            }

            console.log('[UI] 视频容器已恢复原始大小');
        }
    }

    // 更新推流状态
}

// ==========================================
// 应用启动
// ==========================================

// 创建全局应用实例
const app = new MusicPlayerApp();

async function startApp() {
    await themeManager.init();
    await app.init();
}

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        void startApp();
    });
} else {
    void startApp();
}

// 导出供调试使用
window.MusicPlayerApp = app;
app.playSong = app.playSong.bind(app);
app.renderPlaylist = app.renderPlaylist.bind(app);
app.player = player;
app.settingsManager = settingsManager;
app.modules = {
    api,
    player,
    playlistManager,
    volumeControl,
    searchManager,
    themeManager,
    settingsManager,
    navManager
};
window.app = app;

console.log('💡 模块化音乐播放器已加载');
console.log('💡 输入 app.diagnose.printHelp() 查看诊断命令');

console.log('💡 可通过 window.app.player、window.app.settingsManager 访问核心模块');
