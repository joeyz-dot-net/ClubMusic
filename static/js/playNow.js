import { player } from './player.js?v=20';
import { playLock } from './playLock.js';
import { getCurrentPlaybackMeta } from './playbackState.js?v=16';

function createPlayNowError(result, fallbackMessage) {
    const message = result?.error || result?.message || fallbackMessage;
    const error = new Error(message);
    if (result && typeof result === 'object') {
        error.result = result;
    }
    return error;
}

export function getCurrentPlayNowMeta() {
    return getCurrentPlaybackMeta();
}

export function rerenderQueueWithCurrentMeta(renderPlaylistUI) {
    const container = document.getElementById('playListContainer');
    if (!container || typeof renderPlaylistUI !== 'function') {
        return false;
    }

    renderPlaylistUI({
        container,
        onPlay: (song) => window.app?.playSong(song),
        currentMeta: getCurrentPlayNowMeta()
    });

    return true;
}

export async function executePlayNow({
    song,
    addToQueueTop,
    ensureQueuedSongAtTop,
    refreshPlaylist,
    addFailedMessage = '添加歌曲失败'
}) {
    if (!playLock.acquire(song.title)) {
        return { skipped: true, reason: 'locked' };
    }

    try {
        const addResult = await addToQueueTop();
        const wasAlreadyQueued = Boolean(addResult?.duplicate);
        let refreshError = null;

        if (!wasAlreadyQueued && (addResult?._error || addResult?.status !== 'OK')) {
            throw createPlayNowError(addResult, addFailedMessage);
        }

        if (wasAlreadyQueued && typeof ensureQueuedSongAtTop === 'function') {
            await ensureQueuedSongAtTop();
        }

        if (!wasAlreadyQueued && typeof refreshPlaylist === 'function') {
            try {
                await refreshPlaylist();
            } catch (error) {
                refreshError = error;
                console.warn('[PlayNow] 播放前刷新队列失败，继续播放:', error);
            }
        }

        await player.play(song.url, song.title, song.type || 'local', 0);

        return {
            skipped: false,
            wasAlreadyQueued,
            refreshError,
            currentMeta: getCurrentPlayNowMeta(),
            addResult
        };
    } finally {
        playLock.release();
    }
}