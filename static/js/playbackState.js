import { player } from './player.js?v=11';

export function getCurrentPlaybackStatus() {
    return player.status || window.app?.lastPlayStatus || { current_meta: null };
}

export function getCurrentPlaybackMeta() {
    return getCurrentPlaybackStatus()?.current_meta || null;
}