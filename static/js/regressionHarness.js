import { recordTrace } from './requestTrace.js?v=1';

const DEFAULT_WAIT_MS = 2600;

export class RegressionHarness {
    constructor({ app, api, player, ktvSync, playlistManager }) {
        this.app = app;
        this.api = api;
        this.player = player;
        this.ktvSync = ktvSync;
        this.playlistManager = playlistManager;
        this.nextClickProbe = null;
        this.prevClickProbe = null;
        this.playPauseResumeProbe = null;
        this.songs = {
            embeddable: {
                url: 'https://www.youtube.com/watch?v=FQyEkN_9CXU',
                title: 'Gemstone Glossary: 100 Stunning Stones You Need to Know',
                name: 'Gemstone Glossary: 100 Stunning Stones You Need to Know',
                artist: 'InfoZillien',
                type: 'youtube',
                duration: 583,
                video_id: 'FQyEkN_9CXU'
            },
            restricted: {
                url: 'https://www.youtube.com/watch?v=i-jL1RgojQU',
                title: '只有你不知道 张学友 (歌词版)',
                name: '只有你不知道 张学友 (歌词版)',
                artist: '只有你不知道 张学友 (歌词版)',
                type: 'youtube',
                duration: 256,
                video_id: 'i-jL1RgojQU'
            }
        };
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    clearTrace() {
        window.__clubMusicTrace?.clear?.();
    }

    getTraceEvents() {
        return window.__clubMusicTrace?.getEvents?.() || [];
    }

    getNoticeElement() {
        return document.getElementById('fullPlayerAudioOnlyNotice');
    }

    removeWarningToasts() {
        document.querySelectorAll('.toast.toast-warning').forEach((node) => node.remove());
    }

    async ensureFullPlayerOpen() {
        const fullPlayer = document.getElementById('fullPlayer');
        if (!fullPlayer) {
            return false;
        }

        fullPlayer.style.display = 'flex';
        await this.sleep(10);
        fullPlayer.classList.add('show');
        return true;
    }

    getSong(key) {
        return this.songs[key] || null;
    }

    getSongId(song) {
        return song?.video_id || song?.url || null;
    }

    getSongMatchId(meta) {
        return meta?.video_id || meta?.url || null;
    }

    async waitForTrackMatch(expectedTrackId, { timeoutMs = 8000, intervalMs = 200 } = {}) {
        const startedAt = Date.now();
        while ((Date.now() - startedAt) <= timeoutMs) {
            const currentTrackId = this.getSongMatchId(this.player.getStatus?.()?.current_meta || null);
            if (currentTrackId === expectedTrackId) {
                return true;
            }
            await this.sleep(intervalMs);
        }
        return false;
    }

    summarizeChecks(checks) {
        const entries = Object.entries(checks);
        const failedChecks = entries.filter(([, passed]) => !passed).map(([name]) => name);
        return {
            passed: failedChecks.length === 0,
            failedChecks,
            checks,
        };
    }

    formatSummary(label, summary) {
        const status = summary?.passed ? 'PASS' : 'FAIL';
        const failed = summary?.failedChecks?.length ? ` failed=${summary.failedChecks.join(',')}` : '';
        return `[Regression] ${label}: ${status}${failed}`;
    }

    printSummary(label, summary) {
        const line = this.formatSummary(label, summary);
        console.log(line, summary);
        return line;
    }

    buildTraceMetrics({
        controlId = null,
        startIndex = 0,
        requestEventType = 'api.next.request',
        clickEventTypes = ['ui.control.click'],
        pointerEventTypes = ['ui.control.pointerdown'],
        blockedEventTypes = ['ui.control.click_blocked'],
    } = {}) {
        const traceEvents = this.getTraceEvents();
        const events = traceEvents.slice(startIndex);
        const trustedClicks = events.filter((event) => (
            clickEventTypes.includes(event.type)
            && (!controlId || event.details?.controlId === controlId)
            && event.details?.isTrusted === true
        ));
        const blockedClicks = events.filter((event) => (
            blockedEventTypes.includes(event.type)
            && (!controlId || event.details?.controlId === controlId)
        ));
        const pointerDowns = events.filter((event) => (
            pointerEventTypes.includes(event.type)
            && (!controlId || event.details?.controlId === controlId)
        ));
        const requestIds = events
            .filter((event) => event.type === requestEventType)
            .map((event) => event.details?.traceHeaders?.['X-ClubMusic-Request'])
            .filter(Boolean);

        return {
            traceStartIndex: startIndex,
            traceDeltaCount: events.length,
            trustedClickCount: trustedClicks.length,
            trustedClickSeen: trustedClicks.length > 0,
            blockedClickCount: blockedClicks.length,
            blockedClickSeen: blockedClicks.length > 0,
            pointerDownCount: pointerDowns.length,
            pointerDownSeen: pointerDowns.length > 0,
            requestCount: requestIds.length,
            requestIds,
            traceDeltaTail: events.slice(-8).map((event) => event.type),
        };
    }

    installTrustedDomProbe(controlId, tracePrefix) {
        const element = document.getElementById(controlId);
        if (!element) {
            throw new Error(`Control not found: ${controlId}`);
        }

        const recordDomEvent = (suffix, event) => {
            recordTrace(`${tracePrefix}.${suffix}`, {
                controlId,
                isTrusted: event?.isTrusted ?? null,
                detail: event?.detail ?? null,
                pointerType: event?.pointerType || null,
                targetId: event?.target?.id || null,
                currentTargetId: event?.currentTarget?.id || null,
            }, { includeStack: false });
        };

        element.addEventListener('pointerdown', (event) => {
            recordDomEvent('pointerdown', event);
        }, { once: true });
        element.addEventListener('click', (event) => {
            recordDomEvent('click', event);
        }, { once: true });
        return `#${controlId}`;
    }

    installAppMethodProbe(methodName, traceType) {
        const original = this.app?.[methodName];
        if (typeof original !== 'function') {
            throw new Error(`App method not found: ${methodName}`);
        }

        const boundOriginal = original.bind(this.app);
        this.app[methodName] = async (...args) => {
            recordTrace(traceType, { methodName }, { includeStack: false });
            return await boundOriginal(...args);
        };

        return () => {
            this.app[methodName] = original;
        };
    }

    summarizeRestrictedFlow(snapshot) {
        return this.summarizeChecks({
            currentTrackMatches: this.getSongMatchId(snapshot.currentMeta) === this.getSongId(this.songs.restricted),
            noticeVisible: snapshot.noticeVisible === true,
            failedVideoMatches: snapshot.failedVideoId === this.songs.restricted.video_id,
            pendingCleared: snapshot.pendingVideoId == null,
            videoModeDisabled: snapshot.isVideoMode === false,
            noNextRequest: snapshot.nextRequests.length === 0,
            fallbackRecorded: snapshot.fallbackCount >= 1,
        });
    }

    summarizeEmbeddableFlow(snapshot) {
        return this.summarizeChecks({
            currentTrackMatches: this.getSongMatchId(snapshot.currentMeta) === this.getSongId(this.songs.embeddable),
            noticeHidden: snapshot.noticeVisible === false,
            failedVideoCleared: snapshot.failedVideoId == null,
            pendingCleared: snapshot.pendingVideoId == null,
            videoModeEnabled: snapshot.isVideoMode === true,
            currentVideoMatches: snapshot.currentVideoId === this.songs.embeddable.video_id,
            noNextRequest: snapshot.nextRequests.length === 0,
        });
    }

    async rebuildQueue(songList = []) {
        const playlistId = this.playlistManager?.getSelectedPlaylistId?.() || 'default';
        if (playlistId === 'default') {
            const playlist = await this.api.getPlaylist(playlistId);
            const songs = Array.isArray(playlist?.playlist) ? playlist.playlist : [];
            for (let index = songs.length - 1; index >= 0; index -= 1) {
                await this.api.removeFromSpecificPlaylist(playlistId, index);
            }
        } else {
            await this.api.clearPlaylist(playlistId);
        }

        for (let index = 0; index < songList.length; index += 1) {
            const song = songList[index];
            await this.api.addToPlaylist({
                song: {
                    url: song.url,
                    title: song.title || song.name || '',
                    type: song.type || 'local',
                    duration: song.duration || 0,
                    thumbnail_url: song.thumbnail_url,
                },
                insert_index: index,
            });
        }

        await this.playlistManager?.loadCurrent?.();
    }

    resetKtvRegressionState() {
        if (!this.ktvSync) {
            return;
        }

        this.ktvSync._failedVideoId = null;
        this.ktvSync.clearPendingVideo?.();
        this.ktvSync.hideAudioOnlyNotice?.();
    }

    snapshot(label = 'snapshot') {
        const notice = this.getNoticeElement();
        const traceEvents = this.getTraceEvents();
        const status = this.player.getStatus?.() || {};
        const fullPlayer = document.getElementById('fullPlayer');
        let ytState = null;
        try {
            ytState = this.ktvSync?.player?.getPlayerState?.() ?? null;
        } catch (error) {
            ytState = `error:${String(error)}`;
        }

        return {
            label,
            currentMeta: status.current_meta || null,
            noticeVisible: notice ? notice.classList.contains('visible') : false,
            noticeTitle: notice?.querySelector('.full-player-audio-only-title')?.textContent || null,
            noticeBody: notice?.querySelector('.full-player-audio-only-body')?.textContent || null,
            warningCount: document.querySelectorAll('.toast.toast-warning').length,
            failedVideoId: this.ktvSync?._failedVideoId ?? null,
            pendingVideoId: this.ktvSync?.pendingVideoId ?? null,
            isVideoMode: !!this.ktvSync?.isVideoMode,
            currentVideoId: this.ktvSync?.currentVideoId || null,
            playerReady: !!this.ktvSync?.playerReady,
            ytState,
            fullPlayerVisible: fullPlayer ? getComputedStyle(fullPlayer).display !== 'none' : false,
            themeClass: [...document.body.classList].find((className) => className.startsWith('theme-')) || null,
            nextRequests: traceEvents
                .filter((event) => event.type === 'api.next.request')
                .map((event) => event.details?.traceHeaders?.['X-ClubMusic-Request']),
            prevRequests: traceEvents
                .filter((event) => event.type === 'api.prev.request')
                .map((event) => event.details?.traceHeaders?.['X-ClubMusic-Request']),
            fallbackCount: traceEvents.filter((event) => event.type === 'ktv.video_error_audio_fallback').length,
            traceTail: traceEvents.slice(-8).map((event) => event.type),
        };
    }

    getKtvSyncSnapshot(label = 'ktv-sync-snapshot') {
        const status = this.player.getStatus?.() || {};
        const mpvState = status?.mpv_state || status?.mpv || {};
        const rawServerTime = Number(mpvState.time_pos ?? mpvState.time ?? NaN);
        const interpolatedTime = Number(this.player.getInterpolatedTime?.());
        let ytCurrentTime = null;
        let ytState = null;
        try {
            ytCurrentTime = Number(this.ktvSync?.player?.getCurrentTime?.());
            ytState = this.ktvSync?.player?.getPlayerState?.() ?? null;
        } catch (error) {
            ytCurrentTime = null;
            ytState = `error:${String(error)}`;
        }

        const normalizedRawServerTime = Number.isFinite(rawServerTime) ? rawServerTime : null;
        const normalizedInterpolatedTime = Number.isFinite(interpolatedTime) ? interpolatedTime : null;
        const normalizedYtCurrentTime = Number.isFinite(ytCurrentTime) ? ytCurrentTime : null;

        return {
            label,
            currentMeta: status.current_meta || null,
            rawServerTime: normalizedRawServerTime,
            interpolatedTime: normalizedInterpolatedTime,
            ytCurrentTime: normalizedYtCurrentTime,
            ytState,
            paused: mpvState.paused ?? null,
            isVideoMode: !!this.ktvSync?.isVideoMode,
            currentVideoId: this.ktvSync?.currentVideoId || null,
            pendingVideoId: this.ktvSync?.pendingVideoId || null,
            failedVideoId: this.ktvSync?._failedVideoId ?? null,
            playerReady: !!this.ktvSync?.playerReady,
            videoOffset: this.ktvSync?.videoOffset ?? null,
            driftVsRaw: Number.isFinite(rawServerTime) && Number.isFinite(ytCurrentTime)
                ? Number((ytCurrentTime - rawServerTime).toFixed(3))
                : null,
            driftVsInterpolated: Number.isFinite(interpolatedTime) && Number.isFinite(ytCurrentTime)
                ? Number((ytCurrentTime - interpolatedTime).toFixed(3))
                : null,
            metrics: this.ktvSync?.getMetrics?.() || null,
        };
    }

    async sampleKtvSync({ durationMs = 5000, intervalMs = 500, label = 'ktv-sync-sample' } = {}) {
        const samples = [];
        const startedAt = Date.now();
        let sampleIndex = 0;

        while ((Date.now() - startedAt) <= durationMs) {
            samples.push({
                sampleIndex,
                elapsedMs: Date.now() - startedAt,
                ...this.getKtvSyncSnapshot(`${label}-${sampleIndex}`),
            });
            sampleIndex += 1;
            await this.sleep(intervalMs);
        }

        return samples;
    }

    summarizeKtvSync(samples = [], { maxAllowedDrift = 1.0 } = {}) {
        const finiteInterpolatedDrifts = samples
            .map((sample) => sample.driftVsInterpolated)
            .filter((value) => Number.isFinite(value));
        const finiteRawDrifts = samples
            .map((sample) => sample.driftVsRaw)
            .filter((value) => Number.isFinite(value));
        const maxAbsInterpolatedDrift = finiteInterpolatedDrifts.length
            ? Math.max(...finiteInterpolatedDrifts.map((value) => Math.abs(value)))
            : null;
        const maxAbsRawDrift = finiteRawDrifts.length
            ? Math.max(...finiteRawDrifts.map((value) => Math.abs(value)))
            : null;
        const playingSamples = samples.filter((sample) => sample.ytState === 1).length;
        const bufferingSamples = samples.filter((sample) => sample.ytState === 3).length;

        const summary = this.summarizeChecks({
            hasSamples: samples.length > 0,
            videoModeSeen: samples.some((sample) => sample.isVideoMode === true),
            ytClockObserved: finiteRawDrifts.length > 0,
            interpolatedDriftWithinThreshold: maxAbsInterpolatedDrift == null || maxAbsInterpolatedDrift <= maxAllowedDrift,
        });

        return {
            ...summary,
            sampleCount: samples.length,
            playingSamples,
            bufferingSamples,
            maxAbsInterpolatedDrift,
            maxAbsRawDrift,
        };
    }

    async runEmbeddableSyncProbe({
        settleMs = 2200,
        sampleDurationMs = 5000,
        sampleIntervalMs = 500,
        maxAllowedDrift = 1.0,
    } = {}) {
        await this.runEmbeddableVideoFlow();
        await this.sleep(settleMs);
        const samples = await this.sampleKtvSync({
            durationMs: sampleDurationMs,
            intervalMs: sampleIntervalMs,
            label: 'embeddable-sync-probe',
        });
        return {
            samples,
            summary: this.summarizeKtvSync(samples, { maxAllowedDrift }),
        };
    }

    reportCurrentState(label = 'diagnose-current-state') {
        return this.snapshot(label);
    }

    printCurrentState(label = 'diagnose-current-state') {
        const report = this.reportCurrentState(label);
        console.log('[Regression] Current state', report);
        return report;
    }

    async playSong(song, waitMs = DEFAULT_WAIT_MS) {
        await this.app.playSong(song);
        await this.sleep(waitMs);
        return this.snapshot('after-play');
    }

    async playQueueIndex(index, waitMs = DEFAULT_WAIT_MS) {
        const formData = new FormData();
        formData.append('index', String(index));
        const result = await this.api.postForm('/playlist_play', formData);
        if (result?._error || result?.status !== 'OK') {
            throw new Error(result?.error || result?.message || '按队列索引播放失败');
        }
        await this.sleep(waitMs);
        return this.player.refreshStatus('回归准备阶段同步队列索引播放状态失败');
    }

    async runEmbeddableVideoFlow() {
        recordTrace('regression.embeddable.start', { videoId: this.songs.embeddable.video_id }, { includeStack: false });
        this.clearTrace();
        await this.ensureFullPlayerOpen();
        await this.playSong(this.songs.embeddable);
        const status = this.player.getStatus?.() || {};
        await this.ktvSync.updateStatus(status);
        await this.sleep(1600);
        const snapshot = this.snapshot('embeddable-video-flow');
        return {
            ...snapshot,
            summary: this.summarizeEmbeddableFlow(snapshot),
        };
    }

    async runRestrictedAudioOnlyFlow({ errorCode = 150 } = {}) {
        recordTrace('regression.restricted.start', { videoId: this.songs.restricted.video_id, errorCode }, { includeStack: false });
        this.clearTrace();
        await this.ensureFullPlayerOpen();
        this.removeWarningToasts();
        this.resetKtvRegressionState();
        sessionStorage.removeItem(`clubmusic.ktvFallbackNotice:${this.songs.restricted.video_id}`);
        await this.playSong(this.songs.restricted);
        this.ktvSync.onPlayerError({ data: errorCode });
        await this.sleep(400);
        const snapshot = {
            ...this.snapshot('restricted-audio-only-flow'),
            fallbackNoticeStored: sessionStorage.getItem(`clubmusic.ktvFallbackNotice:${this.songs.restricted.video_id}`),
        };
        return {
            ...snapshot,
            summary: this.summarizeRestrictedFlow(snapshot),
        };
    }

    async prepareTrustedNextClickFlow({
        startSongKey = 'embeddable',
        nextSongKey = 'restricted',
        controlId = 'fullPlayerNext',
        waitMs = DEFAULT_WAIT_MS,
    } = {}) {
        const startSong = this.getSong(startSongKey);
        const nextSong = this.getSong(nextSongKey);
        if (!startSong || !nextSong) {
            throw new Error('Unknown regression song key');
        }

        recordTrace('regression.next-click.prepare.start', {
            startSongKey,
            nextSongKey,
            controlId,
        }, { includeStack: false });

        this.clearTrace();
        this.removeWarningToasts();
        sessionStorage.removeItem(`clubmusic.ktvFallbackNotice:${nextSong.video_id}`);
        await this.ensureFullPlayerOpen();
        await this.rebuildQueue([startSong, nextSong]);
        await this.playQueueIndex(0, waitMs);
        await this.sleep(400);

        const beforeSnapshot = this.snapshot('trusted-next-click-before');
        const probeId = `next_probe_${Date.now().toString(36)}`;
        this.nextClickProbe = {
            probeId,
            controlId,
            startSongKey,
            nextSongKey,
            traceStartIndex: this.getTraceEvents().length,
            beforeSnapshot,
            preparedAt: Date.now(),
        };

        recordTrace('regression.next-click.prepared', {
            probeId,
            controlId,
            traceStartIndex: this.nextClickProbe.traceStartIndex,
            startSongKey,
            nextSongKey,
        }, { includeStack: false });

        return {
            probeId,
            controlId,
            beforeSnapshot,
            expectedNextVideoId: nextSong.video_id,
            selector: `#${controlId}`,
        };
    }

    async evaluateTrustedNextClickFlow({ probeId = null, settleMs = 3200 } = {}) {
        const probe = this.nextClickProbe;
        if (!probe) {
            throw new Error('No prepared next-click probe');
        }
        if (probeId && probe.probeId !== probeId) {
            throw new Error(`Probe mismatch: expected ${probe.probeId}, got ${probeId}`);
        }

        await this.sleep(settleMs);
        const snapshot = this.snapshot('trusted-next-click-after');
        const traceMetrics = this.buildTraceMetrics({
            controlId: probe.controlId,
            startIndex: probe.traceStartIndex,
        });
        const expectedNextSong = this.getSong(probe.nextSongKey);
        const currentTrackId = this.getSongMatchId(snapshot.currentMeta);
        const summary = this.summarizeChecks({
            trustedClickSeen: traceMetrics.trustedClickSeen,
            pointerDownSeen: traceMetrics.pointerDownSeen,
            blockedClickAbsent: traceMetrics.blockedClickCount === 0,
            singleNextRequest: traceMetrics.requestCount === 1,
            currentTrackMatches: currentTrackId === this.getSongId(expectedNextSong),
            audioOnlyFallbackObserved: snapshot.failedVideoId === expectedNextSong.video_id && snapshot.isVideoMode === false,
        });

        const result = {
            probeId: probe.probeId,
            controlId: probe.controlId,
            expectedNextVideoId: expectedNextSong.video_id,
            beforeSnapshot: probe.beforeSnapshot,
            afterSnapshot: snapshot,
            traceMetrics,
            summary,
        };

        recordTrace('regression.next-click.evaluated', {
            probeId: probe.probeId,
            controlId: probe.controlId,
            summary,
        }, { includeStack: false });

        this.nextClickProbe = null;
        return result;
    }

    async prepareTrustedPrevClickFlow({
        previousSongKey = 'embeddable',
        currentSongKey = 'restricted',
        controlId = 'fullPlayerPrev',
        waitMs = DEFAULT_WAIT_MS,
    } = {}) {
        const previousSong = this.getSong(previousSongKey);
        const currentSong = this.getSong(currentSongKey);
        if (!previousSong || !currentSong) {
            throw new Error('Unknown regression song key');
        }

        recordTrace('regression.prev-click.prepare.start', {
            previousSongKey,
            currentSongKey,
            controlId,
        }, { includeStack: false });

        this.clearTrace();
        this.removeWarningToasts();
        this.resetKtvRegressionState();
        await this.ensureFullPlayerOpen();
        await this.rebuildQueue([previousSong, currentSong]);
        await this.playQueueIndex(1, waitMs);
        await this.sleep(400);

        const selector = this.installTrustedDomProbe(controlId, 'regression.prev-click.dom');
        const beforeSnapshot = this.snapshot('trusted-prev-click-before');
        const probeId = `prev_probe_${Date.now().toString(36)}`;
        this.prevClickProbe = {
            probeId,
            controlId,
            previousSongKey,
            currentSongKey,
            traceStartIndex: this.getTraceEvents().length,
            beforeSnapshot,
            restoreAppMethodProbe: this.installAppMethodProbe('playPrev', 'regression.prev-click.app-playPrev'),
            preparedAt: Date.now(),
        };

        recordTrace('regression.prev-click.prepared', {
            probeId,
            controlId,
            traceStartIndex: this.prevClickProbe.traceStartIndex,
            previousSongKey,
            currentSongKey,
        }, { includeStack: false });

        return {
            probeId,
            controlId,
            beforeSnapshot,
            expectedPreviousVideoId: previousSong.video_id,
            selector,
        };
    }

    async evaluateTrustedPrevClickFlow({ probeId = null, settleMs = 3200 } = {}) {
        const probe = this.prevClickProbe;
        if (!probe) {
            throw new Error('No prepared prev-click probe');
        }
        if (probeId && probe.probeId !== probeId) {
            throw new Error(`Probe mismatch: expected ${probe.probeId}, got ${probeId}`);
        }

        const expectedPreviousSong = this.getSong(probe.previousSongKey);
        await this.waitForTrackMatch(this.getSongId(expectedPreviousSong), { timeoutMs: Math.max(settleMs, 8000) });
        await this.sleep(300);
        const snapshot = this.snapshot('trusted-prev-click-after');
        const traceMetrics = this.buildTraceMetrics({
            controlId: probe.controlId,
            startIndex: probe.traceStartIndex,
            requestEventType: 'api.prev.request',
            clickEventTypes: ['regression.prev-click.dom.click'],
            pointerEventTypes: ['regression.prev-click.dom.pointerdown'],
            blockedEventTypes: [],
        });
        const currentTrackId = this.getSongMatchId(snapshot.currentMeta);
        const appPlayPrevSeen = this.getTraceEvents()
            .slice(probe.traceStartIndex)
            .some((event) => event.type === 'regression.prev-click.app-playPrev');
        const summary = this.summarizeChecks({
            trustedClickSeen: traceMetrics.trustedClickSeen,
            pointerDownSeen: traceMetrics.pointerDownSeen,
            appPlayPrevSeen,
            currentTrackMatches: currentTrackId === this.getSongId(expectedPreviousSong),
            videoModeRecovered: snapshot.isVideoMode === true && snapshot.currentVideoId === expectedPreviousSong.video_id,
            noNewFallbackTriggered: snapshot.fallbackCount === probe.beforeSnapshot.fallbackCount,
        });

        const result = {
            probeId: probe.probeId,
            controlId: probe.controlId,
            expectedPreviousVideoId: expectedPreviousSong.video_id,
            beforeSnapshot: probe.beforeSnapshot,
            afterSnapshot: snapshot,
            traceMetrics,
            summary,
        };

        recordTrace('regression.prev-click.evaluated', {
            probeId: probe.probeId,
            controlId: probe.controlId,
            summary,
        }, { includeStack: false });

        probe.restoreAppMethodProbe?.();
        this.prevClickProbe = null;
        return result;
    }

    async waitForPausedState(expectedPaused, { timeoutMs = 8000, intervalMs = 200 } = {}) {
        const startedAt = Date.now();
        while ((Date.now() - startedAt) <= timeoutMs) {
            const status = this.player.getStatus?.() || {};
            const mpvState = status?.mpv_state || status?.mpv || {};
            if ((mpvState.paused ?? null) === expectedPaused) {
                return true;
            }
            await this.sleep(intervalMs);
        }
        return false;
    }

    async ensurePausedForPlayPauseProbe({ maxAttempts = 3, waitMs = 500 } = {}) {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const refreshedStatus = await this.player.refreshStatus('回归准备阶段同步暂停状态失败');
            const refreshedMpvState = refreshedStatus?.mpv_state || refreshedStatus?.mpv || {};
            if (refreshedMpvState.paused === true) {
                return true;
            }

            await this.player.pause();
            await this.waitForPausedState(true, { timeoutMs: 3000, intervalMs: 150 });
            await this.sleep(waitMs);
        }

        const finalStatus = await this.player.refreshStatus('回归准备阶段最终同步暂停状态失败');
        const finalMpvState = finalStatus?.mpv_state || finalStatus?.mpv || {};
        return finalMpvState.paused === true;
    }

    async prepareTrustedPlayPauseResumeFlow({
        songKey = 'embeddable',
        controlId = 'fullPlayerPlayPause',
        waitMs = DEFAULT_WAIT_MS,
    } = {}) {
        const song = this.getSong(songKey);
        if (!song) {
            throw new Error('Unknown regression song key');
        }

        recordTrace('regression.playpause-resume.prepare.start', {
            songKey,
            controlId,
        }, { includeStack: false });

        this.clearTrace();
        this.removeWarningToasts();
        this.resetKtvRegressionState();
        await this.ensureFullPlayerOpen();
        await this.rebuildQueue([song]);
        await this.playQueueIndex(0, waitMs);
        await this.sleep(600);
        const pausedReady = await this.ensurePausedForPlayPauseProbe();
        if (!pausedReady) {
            throw new Error('Unable to stabilize paused state before trusted play/pause probe');
        }

        const selector = this.installTrustedDomProbe(controlId, 'regression.playpause-resume.dom');
        const beforeSnapshot = this.snapshot('trusted-playpause-resume-before');
        const probeId = `playpause_probe_${Date.now().toString(36)}`;
        this.playPauseResumeProbe = {
            probeId,
            controlId,
            songKey,
            traceStartIndex: this.getTraceEvents().length,
            beforeSnapshot,
            restoreAppMethodProbe: this.installAppMethodProbe('togglePlayPause', 'regression.playpause-resume.app-togglePlayPause'),
            preparedAt: Date.now(),
        };

        recordTrace('regression.playpause-resume.prepared', {
            probeId,
            controlId,
            traceStartIndex: this.playPauseResumeProbe.traceStartIndex,
            songKey,
        }, { includeStack: false });

        return {
            probeId,
            controlId,
            beforeSnapshot,
            expectedVideoId: song.video_id,
            selector,
        };
    }

    async evaluateTrustedPlayPauseResumeFlow({
        probeId = null,
        settleMs = 1800,
        sampleDurationMs = 3200,
        sampleIntervalMs = 400,
        maxAllowedDrift = 1.0,
    } = {}) {
        const probe = this.playPauseResumeProbe;
        if (!probe) {
            throw new Error('No prepared playpause-resume probe');
        }
        if (probeId && probe.probeId !== probeId) {
            throw new Error(`Probe mismatch: expected ${probe.probeId}, got ${probeId}`);
        }

        const expectedSong = this.getSong(probe.songKey);
        await this.waitForPausedState(false, { timeoutMs: Math.max(settleMs, 8000) });
        await this.sleep(settleMs);

        const samples = await this.sampleKtvSync({
            durationMs: sampleDurationMs,
            intervalMs: sampleIntervalMs,
            label: 'trusted-playpause-resume',
        });
        const snapshot = this.snapshot('trusted-playpause-resume-after');
        const traceMetrics = this.buildTraceMetrics({
            controlId: probe.controlId,
            startIndex: probe.traceStartIndex,
            requestEventType: 'regression.playpause-resume.noop',
            clickEventTypes: ['regression.playpause-resume.dom.click'],
            pointerEventTypes: ['regression.playpause-resume.dom.pointerdown'],
            blockedEventTypes: [],
        });
        const traceEvents = this.getTraceEvents().slice(probe.traceStartIndex);
        const appTogglePlayPauseSeen = traceEvents.some((event) => event.type === 'regression.playpause-resume.app-togglePlayPause');
        const currentTrackId = this.getSongMatchId(snapshot.currentMeta);
        const finiteYtTimes = samples
            .map((sample) => sample.ytCurrentTime)
            .filter((value) => Number.isFinite(value));
        const ytClockAdvanced = finiteYtTimes.length >= 2
            && (finiteYtTimes[finiteYtTimes.length - 1] - finiteYtTimes[0]) > 1.0;
        const ytPlayingObserved = samples.some((sample) => sample.ytState === 1);
        const resumedSeen = samples.some((sample) => sample.paused === false);
        const ytStateCounts = samples.reduce((counts, sample) => {
            const key = String(sample.ytState);
            counts[key] = (counts[key] || 0) + 1;
            return counts;
        }, {});
        const finalSample = samples[samples.length - 1] || null;
        const finalYtState = finalSample?.ytState ?? snapshot.ytState ?? null;
        const allBuffering = samples.length > 0 && samples.every((sample) => sample.ytState === 3);
        const allPaused = samples.length > 0 && samples.every((sample) => sample.ytState === 2);
        let failureMode = null;
        const ytTraceTrail = traceEvents
            .filter((event) => event.type.startsWith('ktv.trusted_resume.') || event.type === 'ktv.player_state_change')
            .map((event) => ({
                type: event.type,
                at: event.at,
                state: event.details?.playerState ?? event.details?.eventState ?? null,
                stateLabel: event.details?.playerStateLabel || event.details?.eventStateLabel || null,
                currentTime: event.details?.currentTime ?? null,
                context: event.details?.context || null,
            }));
        const toggleTraceTrail = traceEvents
            .filter((event) => event.type.startsWith('ui.toggle_play_pause.'))
            .map((event) => ({
                type: event.type,
                at: event.at,
                paused: event.details?.paused ?? null,
                isResuming: event.details?.isResuming ?? null,
                requestedTrustedResume: event.details?.requestedTrustedResume ?? null,
                trackType: event.details?.trackType || null,
                videoId: event.details?.videoId || null,
            }));
        const traceSawPlaying = ytTraceTrail.some((entry) => entry.state === 1);
        const traceEndedPaused = ytTraceTrail.length > 0 && ytTraceTrail[ytTraceTrail.length - 1].state === 2;
        if (!ytPlayingObserved) {
            if (traceSawPlaying && traceEndedPaused) {
                failureMode = 'reverted_to_paused';
            } else if (allBuffering || finalYtState === 3) {
                failureMode = 'stuck_buffering';
            } else if (allPaused || finalYtState === 2) {
                failureMode = 'stuck_paused';
            } else {
                failureMode = 'not_playing';
            }
        }
        const syncSummary = this.summarizeKtvSync(samples, { maxAllowedDrift });
        const summary = this.summarizeChecks({
            trustedClickSeen: traceMetrics.trustedClickSeen,
            pointerDownSeen: traceMetrics.pointerDownSeen,
            appTogglePlayPauseSeen,
            currentTrackMatches: currentTrackId === this.getSongId(expectedSong),
            resumedSeen,
            videoModeEnabled: snapshot.isVideoMode === true && snapshot.currentVideoId === expectedSong.video_id,
            ytPlayingObserved,
            ytClockAdvanced,
        });
        const diagnostics = {
            failureMode,
            finalYtState,
            ytStateCounts,
            allBuffering,
            allPaused,
            traceSawPlaying,
            traceEndedPaused,
            ytTraceTrail,
            toggleTraceTrail,
        };

        const result = {
            probeId: probe.probeId,
            controlId: probe.controlId,
            expectedVideoId: expectedSong.video_id,
            beforeSnapshot: probe.beforeSnapshot,
            afterSnapshot: snapshot,
            samples,
            syncSummary,
            traceMetrics,
            diagnostics,
            summary,
        };

        recordTrace('regression.playpause-resume.evaluated', {
            probeId: probe.probeId,
            controlId: probe.controlId,
            summary,
            syncSummary,
            diagnostics,
        }, { includeStack: false });

        probe.restoreAppMethodProbe?.();
        this.playPauseResumeProbe = null;
        return result;
    }

    summarizeQuickSuite(result) {
        return this.summarizeChecks({
            restrictedFlow: result?.restricted?.summary?.passed === true,
            embeddableFlow: result?.embeddable?.summary?.passed === true,
        });
    }

    summarizeControlSuite(result) {
        return this.summarizeChecks({
            trustedNextFlow: result?.trustedNext?.summary?.passed === true,
            trustedPrevFlow: result?.trustedPrev?.summary?.passed === true,
        });
    }

    buildControlSuiteResult({ trustedNext = null, trustedPrev = null } = {}) {
        const result = {
            trustedNext,
            trustedPrev,
        };
        result.summary = this.summarizeControlSuite(result);
        return result;
    }

    printControlSuiteSummary(result) {
        const summary = this.summarizeControlSuite(result);
        this.printSummary('control-suite', summary);
        return summary;
    }

    async runQuickSuiteAndPrint() {
        const result = await this.runQuickSuite();
        this.printSummary('quick-suite', result.summary);
        return result;
    }

    async runQuickSuite() {
        const restricted = await this.runRestrictedAudioOnlyFlow();
        const embeddable = await this.runEmbeddableVideoFlow();
        const result = {
            restricted,
            embeddable,
        };
        result.summary = this.summarizeQuickSuite(result);
        recordTrace('regression.quick-suite.complete', result, { includeStack: false });
        return result;
    }

    printHelp() {
        console.log('Regression commands:');
        console.log('  await app.regression.runRestrictedAudioOnlyFlow()');
        console.log('  await app.regression.runEmbeddableVideoFlow()');
        console.log('  app.regression.getKtvSyncSnapshot()');
        console.log('  await app.regression.sampleKtvSync()');
        console.log('  await app.regression.runEmbeddableSyncProbe()');
        console.log('  app.regression.summarizeKtvSync(samples)');
        console.log('  await app.regression.runQuickSuite()');
        console.log('  await app.regression.runQuickSuiteAndPrint()');
        console.log('  await app.regression.prepareTrustedPlayPauseResumeFlow()');
        console.log('  await app.regression.evaluateTrustedPlayPauseResumeFlow()');
        console.log('  await app.regression.prepareTrustedNextClickFlow()');
        console.log('  await app.regression.evaluateTrustedNextClickFlow()');
        console.log('  await app.regression.prepareTrustedPrevClickFlow()');
        console.log('  await app.regression.evaluateTrustedPrevClickFlow()');
        console.log('  app.regression.buildControlSuiteResult({ trustedNext, trustedPrev })');
        console.log('  app.regression.summarizeControlSuite(result)');
        console.log('  app.regression.printControlSuiteSummary(result)');
        console.log('  app.regression.printSummary(label, summary)');
        console.log('  app.regression.snapshot()');
        console.log('  app.regression.reportCurrentState()');
        console.log('  app.regression.printCurrentState()');
        console.log('  app.regression.songs');
    }
}

export function createRegressionHarness(deps) {
    return new RegressionHarness(deps);
}