import { api } from './api.js?v=6';
import { player } from './player.js?v=28';
import { playlistManager } from './playlist.js?v=52';
import { buildTrackItemElement } from './templates.js';
import { Toast, loading } from './ui.js?v=3';
import { i18n } from './i18n.js?v=2';

function encodePathSegments(path) {
    return String(path || '')
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');
}

function getAlbumCoverUrl(album) {
    if (!album?.cover_path) {
        return '';
    }
    return `/cover/${encodePathSegments(album.cover_path)}`;
}

function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text) {
        element.textContent = text;
    }
    return element;
}

function setButtonAction(button, action, directory) {
    button.dataset.action = action;
    if (directory) {
        button.dataset.directory = directory;
    }
    return button;
}

function createActionButton({ label, action, directory, kind = 'secondary' }) {
    const button = createElement('button', `albums-action-btn albums-action-btn--${kind}`, label);
    button.type = 'button';
    return setButtonAction(button, action, directory);
}

function createCoverFigure({ imageUrl, className, placeholderClass, placeholderText = '♫' }) {
    const figure = createElement('div', className);
    const placeholder = createElement('div', placeholderClass, placeholderText);

    if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            image.style.display = 'none';
            placeholder.style.display = 'flex';
        });
        figure.appendChild(image);
        placeholder.style.display = 'none';
    }

    figure.appendChild(placeholder);
    return figure;
}

function shuffleSongs(songs) {
    const nextSongs = [...songs];
    for (let index = nextSongs.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [nextSongs[index], nextSongs[randomIndex]] = [nextSongs[randomIndex], nextSongs[index]];
    }
    return nextSongs;
}

function compareAlbumTitles(left, right) {
    return String(left?.title || '').localeCompare(String(right?.title || ''), undefined, { sensitivity: 'base' });
}

function buildTrackMetaText(song, index, album) {
    const prefix = String(index + 1).padStart(2, '0');
    const subtitle = album?.subtitle || album?.title || i18n.t('albums.library');
    return `${prefix} · ${subtitle}`;
}

export class AlbumsManager {
    constructor() {
        this.container = null;
        this.albums = [];
        this.albumSongsCache = new Map();
        this.currentView = 'landing';
        this.activeAlbumDirectory = null;
        this.hasBoundEvents = false;
        this.isBusy = false;
    }

    async init({ container }) {
        this.container = container || null;
        if (!this.container || this.hasBoundEvents) {
            return;
        }

        this.container.addEventListener('click', (event) => {
            void this.handleClick(event);
        });

        this.container.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            const target = event.target.closest('[data-action], .album-card, .album-track-item');
            if (!target || !this.container.contains(target)) {
                return;
            }

            event.preventDefault();
            target.click();
        });

        this.hasBoundEvents = true;
    }

    async enterLanding() {
        if (!this.container) {
            return;
        }

        await this.ensureAlbumsLoaded();
        this.currentView = 'landing';
        this.render();
    }

    async ensureAlbumsLoaded(forceRefresh = false) {
        const result = forceRefresh ? await api.refreshAlbums() : await api.getAlbums();

        if (result?._error || result?.status !== 'OK') {
            throw new Error(result?.error || result?.message || i18n.t('albums.loadFailed'));
        }

        this.albums = Array.isArray(result.albums) ? result.albums : [];
        return this.albums;
    }

    getAlbum(directory) {
        return this.albums.find((album) => album.directory === directory) || null;
    }

    getFeaturedAlbum() {
        return this.getRecentlyAddedAlbums(1)[0] || null;
    }

    getRecentlyAddedAlbums(limit = 8) {
        return [...this.albums]
            .sort((left, right) => (right.modified_at || 0) - (left.modified_at || 0) || compareAlbumTitles(left, right))
            .slice(0, limit);
    }

    getAllAlbums() {
        return [...this.albums].sort(compareAlbumTitles);
    }

    getPlaylistDisplayName(playlistId) {
        const activeDefaultId = playlistManager.getActiveDefaultId();
        if (playlistId === activeDefaultId) {
            return i18n.t('nav.queue');
        }

        const playlist = playlistManager.getAll().find((item) => item.id === playlistId);
        return playlist?.name || playlistManager.getCurrentName() || i18n.t('playlist.current');
    }

    async getQueueInsertIndex({ fallback = 1, minimum = 1, logPrefix = '[Albums]' } = {}) {
        try {
            const status = await api.getStatus();
            if (status?._error) {
                throw new Error(status.error || status.message || 'status unavailable');
            }

            const currentIndex = status?.current_index ?? -1;
            const insertIndex = Math.max(minimum, currentIndex + 1);
            console.log(`${logPrefix} 从后端获取当前播放索引:`, { currentIndex, insertIndex });
            return insertIndex;
        } catch (error) {
            console.warn(`${logPrefix} 无法获取后端状态，使用默认值 ${fallback}:`, error);
            return fallback;
        }
    }

    async loadAlbumSongs(directory) {
        if (this.albumSongsCache.has(directory)) {
            return this.albumSongsCache.get(directory) || [];
        }

        const result = await api.getDirectorySongs(directory);
        if (result?._error || result?.status !== 'OK') {
            throw new Error(result?.error || result?.message || i18n.t('albums.loadSongsFailed'));
        }

        const songs = Array.isArray(result.songs) ? result.songs : [];
        this.albumSongsCache.set(directory, songs);
        return songs;
    }

    async openAlbum(directory) {
        const album = this.getAlbum(directory);
        if (!album) {
            Toast.warning(i18n.t('albums.notFound'));
            return;
        }

        try {
            await this.loadAlbumSongs(directory);
            this.activeAlbumDirectory = directory;
            this.currentView = 'detail';
            this.render();
        } catch (error) {
            console.error('[Albums] 打开专辑失败:', error);
            Toast.error(i18n.t('albums.loadSongsFailed') + ': ' + error.message);
        }
    }

    async refreshPlaylistView() {
        try {
            await playlistManager.refreshAll();
            window.app?.renderPlaylist?.();
        } catch (error) {
            console.warn('[Albums] 刷新播放列表失败:', error);
        }
    }

    async addSongsToPlaylist(playlistId, songs, startIndex) {
        let addedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (const song of songs) {
            try {
                const result = await playlistManager.addSong(playlistId, song, startIndex + addedCount);
                if (result?.status === 'OK') {
                    addedCount += 1;
                } else if (result?.duplicate) {
                    skippedCount += 1;
                } else {
                    failedCount += 1;
                }
            } catch (error) {
                failedCount += 1;
                console.warn('[Albums] 添加歌曲失败:', error);
            }
        }

        return { addedCount, skippedCount, failedCount };
    }

    async addSongsToTop(playlistId, songs) {
        let addedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        for (let index = songs.length - 1; index >= 0; index -= 1) {
            const song = songs[index];
            try {
                const result = await playlistManager.addSong(playlistId, song, 0);
                if (result?.status === 'OK') {
                    addedCount += 1;
                } else if (result?.duplicate) {
                    skippedCount += 1;
                } else {
                    failedCount += 1;
                }
            } catch (error) {
                failedCount += 1;
                console.warn('[Albums] 顶部插入歌曲失败:', error);
            }
        }

        if (songs[0]?.url) {
            try {
                await playlistManager.ensureSongAtTop(playlistId, songs[0].url);
            } catch (error) {
                console.warn('[Albums] 无法将首曲移动到顶部:', error);
            }
        }

        return { addedCount, skippedCount, failedCount };
    }

    notifyAlbumQueueResult({ addedCount, skippedCount, failedCount, playlistName, albumTitle }) {
        if (addedCount > 0 && skippedCount === 0 && failedCount === 0) {
            Toast.success(i18n.t('albums.queueSuccess', { title: albumTitle, name: playlistName }));
            return;
        }

        if (addedCount === 0 && failedCount > 0) {
            Toast.error(i18n.t('albums.queueFailed') + ': ' + albumTitle);
            return;
        }

        Toast.warning(i18n.t('albums.queueMixed', {
            title: albumTitle,
            added: addedCount,
            skipped: skippedCount,
            failed: failedCount,
        }));
    }

    async addAlbumToQueue(directory, { shuffle = false } = {}) {
        const album = this.getAlbum(directory);
        if (!album || this.isBusy) {
            return;
        }

        this.isBusy = true;
        loading.show(i18n.t('albums.queueing'));

        try {
            const songs = await this.loadAlbumSongs(directory);
            if (!songs.length) {
                Toast.warning(i18n.t('albums.noSongs'));
                return;
            }

            const nextSongs = shuffle ? shuffleSongs(songs) : [...songs];
            const playlistId = playlistManager.getSelectedPlaylistId() || playlistManager.getActiveDefaultId();
            const insertIndex = await this.getQueueInsertIndex({ fallback: 1, minimum: 1 });
            const result = await this.addSongsToPlaylist(playlistId, nextSongs, insertIndex);
            await this.refreshPlaylistView();
            this.notifyAlbumQueueResult({
                ...result,
                playlistName: this.getPlaylistDisplayName(playlistId),
                albumTitle: album.title,
            });
        } catch (error) {
            console.error('[Albums] 添加专辑失败:', error);
            Toast.error(i18n.t('albums.queueFailed') + ': ' + error.message);
        } finally {
            loading.hide();
            this.isBusy = false;
        }
    }

    async playAlbum(directory, { shuffle = false } = {}) {
        const album = this.getAlbum(directory);
        if (!album || this.isBusy) {
            return;
        }

        this.isBusy = true;
        loading.show(i18n.t('albums.playing'));

        try {
            const songs = await this.loadAlbumSongs(directory);
            if (!songs.length) {
                Toast.warning(i18n.t('albums.noSongs'));
                return;
            }

            const nextSongs = shuffle ? shuffleSongs(songs) : [...songs];
            const playlistId = playlistManager.getActiveDefaultId();
            await this.addSongsToTop(playlistId, nextSongs);
            const firstSong = nextSongs[0];
            await player.play(firstSong.url, firstSong.title, firstSong.type || 'local', firstSong.duration || 0);
            await this.refreshPlaylistView();
            Toast.success(i18n.t('albums.playSuccess', { title: album.title }));
        } catch (error) {
            console.error('[Albums] 播放专辑失败:', error);
            Toast.error(i18n.t('albums.playFailed') + ': ' + error.message);
        } finally {
            loading.hide();
            this.isBusy = false;
        }
    }

    async addTrackToQueue(song) {
        if (!song || this.isBusy) {
            return;
        }

        this.isBusy = true;
        try {
            const playlistId = playlistManager.getSelectedPlaylistId() || playlistManager.getActiveDefaultId();
            const insertIndex = await this.getQueueInsertIndex({ fallback: 1, minimum: 1 });
            const result = await playlistManager.addSong(playlistId, song, insertIndex);
            if (result?.status === 'OK') {
                await this.refreshPlaylistView();
                Toast.success(i18n.t('search.addSuccess', {
                    name: this.getPlaylistDisplayName(playlistId),
                    title: song.title,
                }));
            } else if (result?.duplicate) {
                Toast.warning(`${song.title} ${i18n.t('search.alreadyInList')}`);
            } else {
                throw new Error(result?.error || result?.message || i18n.t('search.addFailed'));
            }
        } catch (error) {
            console.error('[Albums] 添加单曲失败:', error);
            Toast.error(i18n.t('search.addFailed') + ': ' + error.message);
        } finally {
            this.isBusy = false;
        }
    }

    async refreshAlbums() {
        if (this.isBusy) {
            return;
        }

        this.isBusy = true;
        loading.show(i18n.t('albums.refreshing'));

        try {
            await this.ensureAlbumsLoaded(true);
            if (this.currentView === 'detail' && !this.getAlbum(this.activeAlbumDirectory)) {
                this.currentView = 'landing';
                this.activeAlbumDirectory = null;
            }
            this.render();
            Toast.success(i18n.t('albums.refreshSuccess'));
        } catch (error) {
            console.error('[Albums] 刷新专辑失败:', error);
            Toast.error(i18n.t('albums.refreshFailed') + ': ' + error.message);
        } finally {
            loading.hide();
            this.isBusy = false;
        }
    }

    async handleClick(event) {
        const actionElement = event.target.closest('[data-action]');
        if (actionElement && this.container.contains(actionElement)) {
            event.preventDefault();
            const action = actionElement.dataset.action;
            const directory = actionElement.dataset.directory || '';

            if (action === 'refresh-albums') {
                await this.refreshAlbums();
                return;
            }
            if (action === 'open-album') {
                await this.openAlbum(directory);
                return;
            }
            if (action === 'back-to-albums') {
                this.currentView = 'landing';
                this.activeAlbumDirectory = null;
                this.render();
                return;
            }
            if (action === 'play-album') {
                await this.playAlbum(directory);
                return;
            }
            if (action === 'shuffle-album') {
                await this.playAlbum(directory, { shuffle: true });
                return;
            }
            if (action === 'queue-album') {
                await this.addAlbumToQueue(directory);
                return;
            }
            if (action === 'queue-track') {
                const song = {
                    url: actionElement.dataset.songUrl || '',
                    title: actionElement.dataset.songTitle || '',
                    type: actionElement.dataset.songType || 'local',
                };
                await this.addTrackToQueue(song);
                return;
            }
        }

        const albumCard = event.target.closest('.album-card');
        if (albumCard && this.container.contains(albumCard)) {
            event.preventDefault();
            await this.openAlbum(albumCard.dataset.directory || '');
            return;
        }

        const trackItem = event.target.closest('.album-track-item');
        if (trackItem && this.container.contains(trackItem)) {
            event.preventDefault();
            const song = {
                url: trackItem.dataset.url || '',
                title: trackItem.dataset.title || '',
                type: trackItem.dataset.type || 'local',
            };
            await window.app?.playSong?.(song);
        }
    }

    createPageHeader() {
        const header = createElement('div', 'albums-page-header');
        const titleGroup = createElement('div', 'albums-page-title-group');

        titleGroup.appendChild(createElement('div', 'albums-page-eyebrow', i18n.t('albums.library')));
        titleGroup.appendChild(createElement('h1', 'albums-page-title', i18n.t('albums.title')));
        titleGroup.appendChild(createElement('p', 'albums-page-subtitle', i18n.t('albums.pageSubtitle')));

        header.appendChild(titleGroup);
        header.appendChild(createActionButton({
            label: i18n.t('albums.refresh'),
            action: 'refresh-albums',
            kind: 'ghost',
        }));
        return header;
    }

    createAlbumCard(album, { rail = false } = {}) {
        const card = createElement('div', `album-card${rail ? ' album-card--rail' : ''}`);
        card.dataset.directory = album.directory;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${i18n.t('albums.openAlbum')}: ${album.title}`);

        card.appendChild(createCoverFigure({
            imageUrl: getAlbumCoverUrl(album),
            className: 'album-card-artwork',
            placeholderClass: 'album-card-placeholder',
        }));

        const body = createElement('div', 'album-card-body');
        body.appendChild(createElement('div', 'album-card-title', album.title));
        if (album.subtitle) {
            body.appendChild(createElement('div', 'album-card-subtitle', album.subtitle));
        }
        body.appendChild(createElement('div', 'album-card-meta', i18n.t('local.songCount', { count: album.track_count || 0 })));
        card.appendChild(body);
        return card;
    }

    createSection(title, items, { rail = false } = {}) {
        const section = createElement('section', 'albums-section');
        section.appendChild(createElement('h2', 'albums-section-title', title));

        const grid = createElement('div', rail ? 'albums-rail' : 'albums-grid');
        items.forEach((album) => {
            grid.appendChild(this.createAlbumCard(album, { rail }));
        });

        section.appendChild(grid);
        return section;
    }

    createHero(album) {
        const hero = createElement('section', 'albums-hero');

        const artworkButton = createElement('button', 'albums-hero-artwork-button');
        artworkButton.type = 'button';
        setButtonAction(artworkButton, 'open-album', album.directory);
        artworkButton.appendChild(createCoverFigure({
            imageUrl: getAlbumCoverUrl(album),
            className: 'albums-hero-artwork',
            placeholderClass: 'albums-hero-placeholder',
        }));

        const copy = createElement('div', 'albums-hero-copy');
        copy.appendChild(createElement('div', 'albums-page-eyebrow', i18n.t('albums.featured')));
        copy.appendChild(createElement('h2', 'albums-hero-title', album.title));
        if (album.subtitle) {
            copy.appendChild(createElement('div', 'albums-hero-subtitle', album.subtitle));
        }
        copy.appendChild(createElement('div', 'albums-hero-meta', i18n.t('local.songCount', { count: album.track_count || 0 })));

        const actions = createElement('div', 'albums-hero-actions');
        actions.appendChild(createActionButton({ label: i18n.t('albums.play'), action: 'play-album', directory: album.directory, kind: 'primary' }));
        actions.appendChild(createActionButton({ label: i18n.t('albums.shuffle'), action: 'shuffle-album', directory: album.directory, kind: 'secondary' }));
        actions.appendChild(createActionButton({ label: i18n.t('albums.addToQueue'), action: 'queue-album', directory: album.directory, kind: 'ghost' }));
        copy.appendChild(actions);

        hero.appendChild(artworkButton);
        hero.appendChild(copy);
        return hero;
    }

    createTrackList(album, songs) {
        const section = createElement('section', 'album-detail-tracks');
        section.appendChild(createElement('h2', 'albums-section-title', i18n.t('albums.tracks')));

        if (!songs.length) {
            section.appendChild(createElement('div', 'albums-empty-state', i18n.t('albums.noSongs')));
            return section;
        }

        const list = createElement('div', 'album-track-list');
        songs.forEach((song, index) => {
            const item = buildTrackItemElement({
                song,
                type: 'local',
                metaText: buildTrackMetaText(song, index, album),
                actionButtonClass: 'track-menu-btn album-track-add-btn',
            });
            item.classList.add('album-track-item');
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', `${song.title} - ${i18n.t('albums.trackPlay')}`);

            const addButton = item.querySelector('.album-track-add-btn');
            if (addButton) {
                setButtonAction(addButton, 'queue-track');
                addButton.dataset.songUrl = song.url || '';
                addButton.dataset.songTitle = song.title || '';
                addButton.dataset.songType = song.type || 'local';
                addButton.setAttribute('aria-label', i18n.t('albums.addTrack'));
            }

            list.appendChild(item);
        });

        section.appendChild(list);
        return section;
    }

    renderLanding() {
        const page = createElement('div', 'albums-page');
        page.appendChild(this.createPageHeader());

        if (!this.albums.length) {
            page.appendChild(createElement('div', 'albums-empty-state', i18n.t('albums.empty')));
            return page;
        }

        const featuredAlbum = this.getFeaturedAlbum();
        if (featuredAlbum) {
            page.appendChild(this.createHero(featuredAlbum));
        }

        const recentAlbums = this.getRecentlyAddedAlbums(8);
        if (recentAlbums.length) {
            page.appendChild(this.createSection(i18n.t('albums.recentlyAdded'), recentAlbums, { rail: true }));
        }

        page.appendChild(this.createSection(i18n.t('albums.allAlbums'), this.getAllAlbums()));
        return page;
    }

    renderDetail() {
        const album = this.getAlbum(this.activeAlbumDirectory);
        if (!album) {
            this.currentView = 'landing';
            return this.renderLanding();
        }

        const songs = this.albumSongsCache.get(album.directory) || [];
        const page = createElement('div', 'album-detail-page');

        const topBar = createElement('div', 'album-detail-topbar');
        topBar.appendChild(createActionButton({ label: i18n.t('albums.back'), action: 'back-to-albums', kind: 'ghost' }));
        topBar.appendChild(createActionButton({ label: i18n.t('albums.refresh'), action: 'refresh-albums', kind: 'ghost' }));
        page.appendChild(topBar);

        const hero = createElement('section', 'album-detail-hero');
        hero.appendChild(createCoverFigure({
            imageUrl: getAlbumCoverUrl(album),
            className: 'album-detail-artwork',
            placeholderClass: 'album-detail-placeholder',
        }));

        const body = createElement('div', 'album-detail-copy');
        body.appendChild(createElement('div', 'albums-page-eyebrow', i18n.t('albums.library')));
        body.appendChild(createElement('h1', 'album-detail-title', album.title));
        if (album.subtitle) {
            body.appendChild(createElement('div', 'album-detail-subtitle', album.subtitle));
        }
        body.appendChild(createElement('div', 'album-detail-meta', i18n.t('local.songCount', { count: album.track_count || songs.length })));

        const actions = createElement('div', 'albums-hero-actions');
        actions.appendChild(createActionButton({ label: i18n.t('albums.play'), action: 'play-album', directory: album.directory, kind: 'primary' }));
        actions.appendChild(createActionButton({ label: i18n.t('albums.shuffle'), action: 'shuffle-album', directory: album.directory, kind: 'secondary' }));
        actions.appendChild(createActionButton({ label: i18n.t('albums.addToQueue'), action: 'queue-album', directory: album.directory, kind: 'ghost' }));
        body.appendChild(actions);

        hero.appendChild(body);
        page.appendChild(hero);
        page.appendChild(this.createTrackList(album, songs));
        return page;
    }

    renderError(message) {
        const page = createElement('div', 'albums-page');
        page.appendChild(this.createPageHeader());
        page.appendChild(createElement('div', 'albums-empty-state albums-empty-state--error', message));
        return page;
    }

    render() {
        if (!this.container) {
            return;
        }

        try {
            const page = this.currentView === 'detail' ? this.renderDetail() : this.renderLanding();
            this.container.replaceChildren(page);
        } catch (error) {
            console.error('[Albums] 渲染失败:', error);
            this.container.replaceChildren(this.renderError(error.message || i18n.t('albums.loadFailed')));
        }
    }
}

export const albumsManager = new AlbumsManager();