import { player } from './player.js';
import { playLock } from './playLock.js';

function createPlayNowError(result, fallbackMessage) {
    const message = result?.error || result?.message || fallbackMessage;
    const error = new Error(message);
    if (result && typeof result === 'object') {
        error.result = result;
    }
    return error;
}

export function getCurrentPlayNowMeta() {
    return player.status?.current_meta || window.app?.lastPlayStatus?.current_meta || null;
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

export async function executePlayNow({ song, addToQueueTop, refreshPlaylist, addFailedMessage = '添加歌曲失败' }) {
    if (!playLock.acquire(song.title)) {
        return { skipped: true, reason: 'locked' };
    }

    try {
        const addResult = await addToQueueTop();
        const wasAlreadyQueued = Boolean(addResult?.duplicate);

        if (!wasAlreadyQueued && (addResult?._error || addResult?.status !== 'OK')) {
            throw createPlayNowError(addResult, addFailedMessage);
        }

        if (!wasAlreadyQueued && typeof refreshPlaylist === 'function') {
            await refreshPlaylist();
        }

        await player.play(song.url, song.title, song.type || 'local', 0);

        return {
            skipped: false,
            wasAlreadyQueued,
            currentMeta: getCurrentPlayNowMeta(),
            addResult
        };
    } finally {
        playLock.release();
    }
}