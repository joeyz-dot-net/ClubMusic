import { api } from './api.js?v=4';

function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

export class RoomBotManager {
    constructor() {
        this.lastKnownStatus = null;
        this._ensurePromise = null;
    }

    hasRoomContext() {
        return Boolean(api.roomId);
    }

    getRoomId() {
        return api.roomId || '';
    }

    async getStatus(roomId = this.getRoomId()) {
        if (!roomId) {
            return { _error: true, message: 'missing room_id' };
        }

        const result = await api.getRoomStatus(roomId);
        if (!result?._error) {
            this.lastKnownStatus = result;
        }
        return result;
    }

    async ensureRoomReady({ defaultVolume = 80, forceInit = false } = {}) {
        if (!this.hasRoomContext()) {
            return { status: 'ok', skipped: true, reason: 'no-room-context' };
        }

        if (this._ensurePromise) {
            return this._ensurePromise;
        }

        this._ensurePromise = this._ensureRoomReady({ defaultVolume, forceInit })
            .finally(() => {
                this._ensurePromise = null;
            });

        return this._ensurePromise;
    }

    async _ensureRoomReady({ defaultVolume = 80, forceInit = false }) {
        const roomId = this.getRoomId();
        let status = null;

        if (!forceInit) {
            status = await this.getStatus(roomId);
            if (!status?._error && status.exists && status.bot_ready) {
                return { ...status, ensured: false };
            }
        }

        const initResult = await api.initRoom(roomId, defaultVolume);
        if (initResult?._error && initResult.status !== 409) {
            return initResult;
        }

        status = await this._waitForRoomReady(roomId);
        if (status?._error) {
            return initResult?._error ? initResult : status;
        }

        const ensured = initResult?.status === 'ok' && initResult?.existed === false;
        this.lastKnownStatus = { ...status, ensured };
        return this.lastKnownStatus;
    }

    async _waitForRoomReady(roomId, { attempts = 10, delayMs = 250 } = {}) {
        let lastResult = null;

        for (let index = 0; index < attempts; index += 1) {
            if (index > 0) {
                await delay(delayMs);
            }

            lastResult = await this.getStatus(roomId);
            if (!lastResult?._error && lastResult.exists && lastResult.bot_ready) {
                return lastResult;
            }
        }

        if (lastResult && !lastResult._error) {
            return {
                _error: true,
                status: 503,
                message: 'room bot not ready',
                ...lastResult,
            };
        }

        return lastResult || { _error: true, message: 'room bot not ready' };
    }

    async destroy(roomId = this.getRoomId()) {
        if (!roomId) {
            return { _error: true, message: 'missing room_id' };
        }

        const result = await api.destroyRoom(roomId);
        if (!result?._error) {
            this.lastKnownStatus = null;
        }
        return result;
    }
}

export const roomBotManager = new RoomBotManager();