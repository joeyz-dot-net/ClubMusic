// 歌单管理模块
import { playlistManager } from './playlist.js';
import { Toast, ConfirmModal, InputModal } from './ui.js';
import { operationLock } from './operationLock.js';
import { i18n } from './i18n.js';
import { escapeHTML, focusFirstFocusable, restoreFocus, trapFocusInContainer } from './utils.js';

export class PlaylistsManagement {
    constructor() {
        this.modalBody = null;
        this.modal = null;
        this.onPlaylistSwitchCallback = null;
    }

    init(onPlaylistSwitch = null) {
        this.modalBody = document.getElementById('playlistsModalBody');
        this.modal = document.getElementById('playlistsModal');
        this.onPlaylistSwitchCallback = onPlaylistSwitch;
        this.bindEvents();
    }

    getRenderablePlaylists() {
        return (playlistManager.playlists || []).filter((playlist) => playlist.id !== playlistManager.getActiveDefaultId());
    }

    bindModalBodyDelegates() {
        if (!this.modalBody || this.modalBody._delegatedClickHandler) {
            return;
        }

        this.modalBody._delegatedClickHandler = async (event) => {
            const item = event.target.closest('.playlist-item');
            if (!item || !this.modalBody.contains(item)) {
                return;
            }

            const playlistId = item.dataset.playlistId;
            const playlist = this.getRenderablePlaylists().find((playlistItem) => playlistItem.id === playlistId);
            if (!playlist) {
                return;
            }

            const editBtn = event.target.closest('.playlist-action-btn.edit');
            if (editBtn) {
                event.stopPropagation();
                await this.handleEditPlaylist(playlist);
                return;
            }

            const deleteBtn = event.target.closest('.playlist-action-btn.delete');
            if (deleteBtn) {
                event.stopPropagation();
                await this.handleDeletePlaylist(playlist, item);
                return;
            }

            if (event.target.closest('.playlist-info')) {
                await this.handleSwitchPlaylist(playlist);
            }
        };

        this.modalBody.addEventListener('click', this.modalBody._delegatedClickHandler);
    }

    async handleSwitchPlaylist(playlist) {
        try {
            console.log('[歌单管理] 开始切换歌单:', playlist.id, playlist.name);
            console.log('[歌单管理] 步骤1: 更新前端本地状态');
            playlistManager.setSelectedPlaylist(playlist.id);

            console.log('[歌单管理] 步骤2: 调用后端验证歌单');
            const switchResult = await playlistManager.switch(playlist.id);
            console.log('[歌单管理] 后端验证结果:', switchResult);

            console.log('[歌单管理] 步骤3: 重新加载所有歌单数据');
            await playlistManager.loadAll();

            console.log('[歌单管理] ✅ 歌单切换完成:', playlist.name);
            Toast.success(i18n.t('playlists.switchSuccess', { name: playlist.name }));

            console.log('[歌单管理] 步骤4: 隐藏模态框');
            this.hide();

            setTimeout(() => {
                if (this.onPlaylistSwitchCallback && typeof this.onPlaylistSwitchCallback === 'function') {
                    console.log('[歌单管理] 步骤5: 触发回调函数，更新主界面显示');
                    this.onPlaylistSwitchCallback(playlist.id, playlist.name);
                }
            }, 50);
        } catch (error) {
            console.error('[歌单管理] 切换失败:', error);
            Toast.error(i18n.t('playlists.switchFailed', { error: error.message }));
        }
    }

    async handleEditPlaylist(playlist) {
        operationLock.acquire('edit');

        try {
            const newName = await InputModal.show({ title: i18n.t('playlists.renamePrompt'), defaultValue: playlist.name });
            if (newName !== null && newName.trim() && newName.trim() !== playlist.name) {
                await playlistManager.update(playlist.id, { name: newName.trim() });
                Toast.success(i18n.t('playlists.renameSuccess'));
                this.render();
            }
        } catch (error) {
            Toast.error(i18n.t('playlists.renameFailed', { error: error.message }));
        } finally {
            operationLock.release('edit');
        }
    }

    async handleDeletePlaylist(playlist, item) {
        operationLock.acquire('delete');

        try {
            const confirmed = await ConfirmModal.show({
                title: i18n.t('playlists.deleteConfirmTitle', { name: playlist.name }),
                message: i18n.t('playlists.deleteConfirmMsg', { count: playlist.songs?.length || 0 }),
                type: 'danger'
            });

            if (confirmed) {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '0';
                item.style.transform = 'translateX(-100%)';

                await new Promise((resolve) => setTimeout(resolve, 300));
                await playlistManager.delete(playlist.id);
                Toast.success(i18n.t('playlists.deleteSuccess'));
                this.render();
            }
        } catch (error) {
            item.style.opacity = '1';
            item.style.transform = 'translateX(0)';
            Toast.error(i18n.t('playlists.deleteFailed', { error: error.message }));
        } finally {
            operationLock.release('delete');
        }
    }

    // 绑定事件
    bindEvents() {
        // 创建新歌单按钮
        const playlistsAddBtn = document.getElementById('playlistsAddBtn');
        if (playlistsAddBtn) {
            playlistsAddBtn.addEventListener('click', async () => {
                const name = await InputModal.show({ title: i18n.t('playlists.createPrompt') });
                if (name && name.trim()) {
                    try {
                        await playlistManager.create(name.trim());
                        Toast.success(i18n.t('playlists.createSuccess'));
                        this.render();
                    } catch (error) {
                        Toast.error(i18n.t('playlists.createFailed', { error: error.message }));
                    }
                }
            });
        }

        // 歌单模态框关闭按钮
        const playlistsCloseBtn = document.getElementById('playlistsCloseBtn');
        if (playlistsCloseBtn) {
            playlistsCloseBtn.addEventListener('click', () => {
                this.hide();
            });
        }

        // 点击背景关闭模态框
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.hide();
                }
            });
        }
    }

    // 显示歌单管理模态框
    show() {
        if (this.modal) {
            this.modal._previousActiveElement = document.activeElement;
            this.modal.style.display = 'flex';

            if (!this._handleModalKeydown) {
                this._handleModalKeydown = (event) => {
                    if (!this.modal || !this.modal.classList.contains('modal-visible')) return;

                    if (event.key === 'Escape') {
                        event.preventDefault();
                        this.hide();
                        return;
                    }

                    trapFocusInContainer(event, this.modal);
                };
            }

            document.addEventListener('keydown', this._handleModalKeydown);
            setTimeout(() => {
                this.modal.classList.add('modal-visible');
                focusFirstFocusable(this.modal, '#playlistsAddBtn');
            }, 10);
            this.render();
        }
    }

    // 隐藏模态框
    hide() {
        if (this.modal) {
            console.log('[歌单管理] 隐藏模态框');
            this.modal.classList.remove('modal-visible');
            if (this._handleModalKeydown) {
                document.removeEventListener('keydown', this._handleModalKeydown);
            }
            // 缩短延迟，确保回调执行后模态框已隐藏
            setTimeout(() => {
                this.modal.style.display = 'none';
                restoreFocus(this.modal._previousActiveElement);
                console.log('[歌单管理] ✓ 模态框已隐藏');
            }, 100);
        }
    }

    // 渲染歌单列表
    render(onPlaylistSwitch = null) {
        if (!this.modalBody) {
            console.warn('❌ playlistsModalBody 未找到');
            return;
        }

        if (typeof onPlaylistSwitch === 'function') {
            this.onPlaylistSwitchCallback = onPlaylistSwitch;
        }

        this.bindModalBodyDelegates();

        const playlists = this.getRenderablePlaylists();
        console.log('📋 渲染歌单列表，共', playlists.length, '个歌单');

        this.modalBody.innerHTML = '';

        if (playlists.length === 0) {
            this.modalBody.innerHTML = `
                <div class="playlists-empty">
                    <div class="playlists-empty-icon">📁</div>
                    <div class="playlists-empty-text">${i18n.t('playlists.empty')}</div>
                    <div style="font-size: 14px; color: rgba(255, 255, 255, 0.4); margin-top: 8px;">
                        ${i18n.t('playlists.createHint')}
                    </div>
                </div>
            `;
            return;
        }

        playlists.forEach((playlist, index) => {
            const item = document.createElement('div');
            const isSelected = playlist.id === playlistManager.selectedPlaylistId;
            item.className = 'playlist-item' + (isSelected ? ' selected' : '');
            item.dataset.playlistId = playlist.id;
            const isRoom = !!playlist.is_room;
            const playlistName = escapeHTML(playlist.name || i18n.t('playlist.unnamed'));

            // 为不同歌单生成不同的渐变色
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
            const roomGradient = 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)';
            const gradient = isRoom ? roomGradient : gradients[index % gradients.length];

            // 歌单图标
            const icons = ['🎵', '🎧', '🎸', '🎹', '🎤', '🎼', '🎺', '🥁'];
            const icon = isRoom ? '🎤' : (playlist.id === playlistManager.getActiveDefaultId() ? '⭐' : icons[index % icons.length]);

            // badge
            const badgeHTML = isRoom
                ? `<span class="default-badge room-badge">${i18n.t('playlists.roomBadge')}</span>`
                : (playlist.id === playlistManager.getActiveDefaultId() ? `<span class="default-badge">${i18n.t('playlists.defaultBadge')}</span>` : '');

            // 房间歌单不显示编辑和删除按钮
            const showActions = playlist.id !== playlistManager.getActiveDefaultId() && !isRoom;

            item.innerHTML = `
                <div class="playlist-icon" style="background: ${gradient}">
                    ${icon}
                </div>
                <div class="playlist-info">
                    <div class="playlist-name">
                        ${playlistName}
                        ${badgeHTML}
                    </div>
                    <div class="playlist-count">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.6;">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                        </svg>
                        ${i18n.t('local.songCount', { count: playlist.songs?.length || 0 })}
                    </div>
                </div>
                <div class="playlist-actions">
                    ${showActions ? `
                        <button class="playlist-action-btn edit" title="编辑歌单">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/>
                                <path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                        </button>
                        <button class="playlist-action-btn delete" title="删除歌单">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `;

            this.modalBody.appendChild(item);
        });
    }
}

// 导出单例
export const playlistsManagement = new PlaylistsManagement();
