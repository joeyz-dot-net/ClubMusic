// 通用模板构建函数
// 用于在多处复用统一的歌曲列表项结构

import { thumbnailManager } from './utils.js';
import { i18n } from './i18n.js';

export function buildTrackItemHTML({
    song = {},
    type = 'local',
    metaText = '',
    actionButtonClass = 'track-menu-btn',
    actionButtonIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    isCover = false  // ✅ 新增：是否为目录
} = {}) {
    const title = song.title || i18n.t('track.unknown');
    const cover = song.thumbnail_url || '';

    // ✅ 目录类型处理
    const isDirectory = song.is_directory || song.type === 'directory' || isCover;
    const displayType = isDirectory ? i18n.t('search.typeDirectory') : (type === 'local' ? i18n.t('track.typeLocal') : 'YouTube');
    const meta = metaText || (isDirectory ? i18n.t('search.typeDirectory') : (type === 'local' ? (song.url || i18n.t('track.unknownLocation')) : i18n.t('track.unknownDuration')));

    return `
        <div class="search-result-item playlist-track-item" data-url="${song.url || ''}" data-title="${title}" data-type="${isDirectory ? 'directory' : type}" data-thumbnail_url="${cover || ''}" data-directory="${isDirectory}">
            <div class="track-left">
                <div class="track-cover">
                    <img src="${cover}" alt="" crossorigin="anonymous" data-original-url="${cover}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                    <div class="track-cover-placeholder">${isDirectory ? '📁' : '🎵'}</div>
                </div>
                <div class="track-type">${displayType}</div>
            </div>
            <div class="track-info">
                <div class="track-title">${title}</div>
                <div class="track-meta">
                    <div class="track-playlist-name">${meta}</div>
                </div>
            </div>
            <button class="${actionButtonClass}">
                ${actionButtonIcon}
            </button>
        </div>
    `;
}
