// 通用模板构建函数
// 用于在多处复用统一的歌曲列表项结构

export function buildTrackItemHTML({
    song = {},
    type = 'local',
    metaText = '',
    actionButtonClass = 'track-menu-btn',
    actionButtonIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>'
} = {}) {
    const title = song.title || '未知歌曲';
    const cover = song.thumbnail_url || '';
    const typeLabel = type === 'local' ? '本地' : 'YouTube';
    const meta = metaText || (type === 'local' ? (song.url || '未知位置') : '未知');

    return `
        <div class="search-result-item playlist-track-item" data-url="${song.url || ''}" data-title="${title}" data-type="${type}">
            <div class="track-left">
                <div class="track-cover">
                    <img src="${cover}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                    <div class="track-cover-placeholder">🎵</div>
                </div>
                <div class="track-type">${typeLabel}</div>
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
