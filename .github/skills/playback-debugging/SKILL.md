---
name: playback-debugging
description: Debug ClubMusic playback regressions involving trusted next/prev controls, pause-resume state sync, playlist refresh churn, KTV or YouTube coordination, request-source tracing, and room-aware playback routing. Use when playback changes unexpectedly, the visible queue desynchronizes, browser controls behave inconsistently, or frontend and backend state disagree.
argument-hint: describe the playback bug, affected flow, changed files, and whether browser regression has already been run
---

# Playback Debugging

Use this skill for runtime playback investigations in ClubMusic, especially when the bug spans frontend state, backend player state, WebSocket updates, polling fallback, or browser control trust semantics.

## When To Use

Use this skill when the problem involves one or more of these symptoms:

- `Next`, `Prev`, play, pause, or resume behaves differently than expected
- the UI shows the wrong current song, paused state, or queue highlight
- the queue refreshes too often, not at all, or duplicates work after a control action
- KTV or YouTube playback falls back incorrectly, skips unexpectedly, or loses embed state
- browser-side intent and backend request logs do not seem to match
- room playback or `pipe`-aware routing behaves like requests are hitting the wrong player

## Ground Rules

- Treat the backend as the source of truth for autoplay and playback progression. Do not assume a frontend autoplay bug until request traces or state flow prove it.
- Prefer evidence over guesses. Correlate browser traces, HTTP requests, WebSocket payloads, and backend logs before proposing a fix.
- If the issue could affect trusted browser controls or resume behavior, run the browser regression suite before and after code changes.

## Primary References

- `/memories/repo/player-status-sync.md`
- `/memories/repo/request-source-tracing.md`
- `/memories/repo/ws-playlist-updated.md`
- `/memories/repo/ui-room-aware-api.md`
- [tools/browser_control_regression.py](../../../tools/browser_control_regression.py)
- [static/js/api.js](../../../static/js/api.js)
- [static/js/main.js](../../../static/js/main.js)
- [static/js/player.js](../../../static/js/player.js)
- [routers/player.py](../../../routers/player.py)
- [routers/state.py](../../../routers/state.py)
- [routers/dependencies.py](../../../routers/dependencies.py)
- [models/player.py](../../../models/player.py)

## Workflow

1. Classify the failure.
   - Control issue: trusted `Next` / `Prev`, play, pause, resume.
   - State-sync issue: wrong paused state, stale current song, wrong queue highlight.
   - Queue-refresh issue: duplicate refreshes, missing refreshes, `playlist_updated` mismatch.
   - Playback-engine issue: autoplay, MPV event handling, backend current index/meta.
   - Room-routing issue: requests or status appear to target the wrong player.

2. Inspect the changed surface first.
   - Check the edited frontend modules, router endpoints, and player/model code.
   - Verify backend/frontend API parity if any request payload or response field changed.

3. Gather runtime evidence.
   - Inspect browser-side traces such as `window.__clubMusicTrace` and `window.__clubMusicTraceEvents` when relevant.
   - Check whether `X-ClubMusic-*` request headers and backend logs identify the same tab, page, room, and request.
   - Compare WebSocket `state_update` payloads with poll-based `/status` results.

4. Run regression when applicable.
   - If the issue touches trusted controls, resume flow, stale local paused state, KTV coordination, or request tracing, run:

```powershell
py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --output logs/browser-control-regression.json
```

   - Passing baseline:
     - `summary.passed = true`
     - `checks.controlSuite = true`
     - `checks.trustedResumeSuite = true`

5. Narrow the fault domain.
   - If browser intent is correct but backend control logs differ, inspect router or request-tracing logic.
   - If backend state is correct but UI is wrong, inspect frontend status merge, optimistic updates, and duplicate singleton imports.
   - If queue refresh behavior is wrong, inspect `playlist_updated`, queue version propagation, and local refresh dedupe.
   - If room behavior is wrong, inspect pipe-aware dependency resolution and request context propagation.

6. Propose or apply the smallest fix that addresses the proven failure mode.
   - Preserve API parity, singleton usage, room-aware routing, and backend-owned autoplay semantics.
   - Re-run the most relevant validation after changes.

## Diagnosis Heuristics

### Trusted Controls And Resume

- Start with the browser regression suite.
- If only trusted resume paths fail, inspect local paused-state reconciliation and any frontend event emission around resume.
- If trusted `Next` or `Prev` duplicates requests, inspect debounce, click-preparation flows, and backend request logs together.

### Status Sync And Queue Rendering

- Compare the latest accepted server snapshot with any local optimistic barrier.
- Check whether the same song change or queue mutation is being refreshed through both local success handlers and WebSocket `playlist_updated`.
- Suspect duplicate singleton imports if one module appears fresh while another acts stale.

### Backend Autoplay And Current Song State

- Inspect MPV event handling and `handle_playback_end()` behavior.
- Confirm autoplay failure paths clear `current_meta` and `current_index` and still broadcast a coherent stopped state.
- Do not move autoplay decisions into the frontend as a workaround.

### Room-Aware Routing

- Verify the request carries the expected `pipe` or room context from the frontend.
- Confirm the backend endpoint uses request-aware dependency helpers instead of the main-player singleton.

## Expected Output

When using this skill, report results in this shape:

- `Symptom`: concise description of the observed playback bug
- `Evidence`: the key browser trace, request log, state payload, or regression result that supports the diagnosis
- `Fault domain`: frontend sync, router contract, backend player state, room routing, or external playback limitation
- `Fix status`: no code change needed, fix applied, or more evidence needed
- `Validation`: what was run and whether it passed

## Example Invocations

- `/playback-debugging next button sometimes skips twice after YouTube track changes`
- `/playback-debugging stale paused state after trusted resume probe; changed files are static/js/player.js and routers/player.py`
- `/playback-debugging room page shows wrong queue after play request with pipe parameter`
