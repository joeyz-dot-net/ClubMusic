# Browser Regression Validation

Use this prompt after changing playback, browser controls, status synchronization, KTV behavior, request tracing, queue refresh logic, local search/directory navigation, or room-aware routing and recovery.

## Goal

Validate that the change did not regress trusted browser controls, trusted resume behavior, queue delete/reorder coverage, local search/directory navigation coverage, or room-scoped recovery and isolation, then summarize the result against the repository baseline.

## Workflow

1. Inspect the changed files and determine whether the change can affect any of these areas:
   - trusted `Next` / `Prev`
   - play / pause / resume
   - stale local paused state reconciliation
   - KTV or YouTube playback coordination
   - request-source tracing
   - playlist refresh and `playlist_updated` behavior
   - local search results, local directory navigation, breadcrumb return, or the shared local tree data path
   - room routing, room bootstrap, room recovery, or WebSocket room scoping
2. If the change touches trusted controls, resume, KTV, request tracing, or queue refresh behavior, run the standard browser regression workflow:

```powershell
py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-queue-suite --output logs/browser-control-regression.json
```

3. If the change touches room routing, room bootstrap, room recovery, or default-page isolation, run the room suite instead of the base-only flow:

```powershell
py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-queue-suite --include-room-suite --output logs/browser-control-regression-room.json
```

4. If the change touches local search results, local directory navigation, breadcrumb return, or the shared local tree data path, run the local suite:

```powershell
py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-local-suite --output logs/browser-control-regression-local.json
```

5. Treat this as the passing baseline:
   - top-level `summary.passed = true`
   - `checks.controlSuite = true`
   - `checks.trustedResumeSuite = true`
   - `checks.queueSuite = true`
   - `checks.localSuite = true` when `--include-local-suite` is used
   - `checks.roomSuite = true` when `--include-room-suite` is used
6. If the regression fails, inspect and summarize the most relevant evidence before proposing code changes:
   - `logs/browser-control-regression.json`
   - `logs/browser-control-regression-local.json` when the local suite was used
   - `logs/browser-control-regression-room.json` when the room suite was used
   - request-source tracing expectations from `/memories/repo/request-source-tracing.md`
   - status merge and optimistic update expectations from `/memories/repo/player-status-sync.md`
   - queue refresh semantics from `/memories/repo/ws-playlist-updated.md`
   - room routing expectations from `/memories/repo/clubmusic-room-routing-strict.md`
   - room recovery expectations from `/memories/repo/clubmusic-room-frontend-recovery.md`
7. Report back with:
   - whether the regression was run
   - whether the base suite, local suite, or room suite was used
   - whether it passed or failed
   - the failing check names, if any
   - the most likely regression source
   - whether follow-up code changes are needed

## Response Format

- `Regression run`: yes or no
- `Suite`: base, local, room, or skipped
- `Result`: pass or fail
- `Baseline status`: whether `summary.passed`, `checks.controlSuite`, `checks.trustedResumeSuite`, and `checks.queueSuite` matched the expected baseline, plus `checks.localSuite` or `checks.roomSuite` when applicable
- `Relevant findings`: concise explanation of any failing or suspicious checks
- `Next action`: either `none` or the specific fix / investigation to do next

## Notes

- Prefer the command above over ad hoc browser testing so the result is reproducible.
- The room suite already includes the base trusted-control and trusted-resume checks; do not run both unless you need separate artifacts.
- If the task clearly does not touch playback or browser-control behavior, say so explicitly and skip the regression instead of running it blindly.
- Do not claim the regression passed unless the output actually matches the expected baseline.