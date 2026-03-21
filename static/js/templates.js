// 通用模板构建函数
// 用于在多处复用统一的歌曲列表项结构

import { normalizeThumbnailUrl } from './utils.js';
import { i18n } from './i18n.js';

function createFragmentFromHTML(html) {
    return document.createRange().createContextualFragment(html);
}

export function buildTrackItemElement({
    song = {},
    type = 'local',
    metaText = '',
    actionButtonClass = 'track-menu-btn',
    actionButtonIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    isCover = false  // ✅ 新增：是否为目录
} = {}) {
    const title = song.title || i18n.t('track.unknown');
    const cover = normalizeThumbnailUrl(song.thumbnail_url || '');

    // ✅ 目录类型处理
    const isDirectory = song.is_directory || song.type === 'directory' || isCover;
    const displayType = isDirectory ? i18n.t('search.typeDirectory') : (type === 'local' ? i18n.t('track.typeLocal') : 'YouTube');
    const meta = metaText || (isDirectory ? i18n.t('search.typeDirectory') : (type === 'local' ? (song.url || i18n.t('track.unknownLocation')) : i18n.t('track.unknownDuration')));

    const item = document.createElement('div');
    item.className = 'search-result-item playlist-track-item';
    item.dataset.url = song.url || '';
    item.dataset.title = title;
    item.dataset.type = isDirectory ? 'directory' : type;
    item.dataset.thumbnail_url = cover;
    item.dataset.directory = String(isDirectory);

    const trackLeft = document.createElement('div');
    trackLeft.className = 'track-left';

    const trackCover = document.createElement('div');
    trackCover.className = 'track-cover';

    const image = document.createElement('img');
    image.alt = '';
    image.crossOrigin = 'anonymous';
    image.dataset.originalUrl = cover;

    const placeholder = document.createElement('div');
    placeholder.className = 'track-cover-placeholder';
    placeholder.textContent = isDirectory ? '📁' : '🎵';

    if (cover) {
        image.src = cover;
        placeholder.style.display = 'none';
        image.addEventListener('error', () => {
            image.style.display = 'none';
            placeholder.style.display = 'flex';
        });
    } else {
        image.style.display = 'none';
        placeholder.style.display = 'flex';
    }

    trackCover.appendChild(image);
    trackCover.appendChild(placeholder);

    const trackType = document.createElement('div');
    trackType.className = 'track-type';
    trackType.textContent = displayType;

    trackLeft.appendChild(trackCover);
    trackLeft.appendChild(trackType);

    const trackInfo = document.createElement('div');
    trackInfo.className = 'track-info';

    const trackTitle = document.createElement('div');
    trackTitle.className = 'track-title';
    trackTitle.textContent = title;

    const trackMeta = document.createElement('div');
    trackMeta.className = 'track-meta';

    const playlistName = document.createElement('div');
    playlistName.className = 'track-playlist-name';
    playlistName.textContent = meta;

    trackMeta.appendChild(playlistName);
    trackInfo.appendChild(trackTitle);
    trackInfo.appendChild(trackMeta);

    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = actionButtonClass;
    actionButton.appendChild(createFragmentFromHTML(actionButtonIcon));

    item.appendChild(trackLeft);
    item.appendChild(trackInfo);
    item.appendChild(actionButton);
    return item;
}
