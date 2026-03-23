# Browser Regression Validation

Use this prompt after changing playback, browser controls, status synchronization, KTV behavior, request tracing, or queue refresh logic.

## Goal

Validate that the change did not regress trusted browser controls or trusted resume behavior, then summarize the result against the repository baseline.

## Workflow

1. Inspect the changed files and determine whether the change can affect any of these areas:
   - trusted `Next` / `Prev`
   - play / pause / resume
   - stale local paused state reconciliation
   - KTV or YouTube playback coordination
   - request-source tracing
   - playlist refresh and `playlist_updated` behavior
2. If the change touches any of those areas, run the browser regression workflow:

```powershell
py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --output logs/browser-control-regression.json
```

3. Treat this as the passing baseline:
   - top-level `summary.passed = true`
   - `checks.controlSuite = true`
   - `checks.trustedResumeSuite = true`
4. If the regression fails, inspect and summarize the most relevant evidence before proposing code changes:
   - `logs/browser-control-regression.json`
   - request-source tracing expectations from `/memories/repo/request-source-tracing.md`
   - status merge and optimistic update expectations from `/memories/repo/player-status-sync.md`
   - queue refresh semantics from `/memories/repo/ws-playlist-updated.md`
5. Report back with:
   - whether the regression was run
   - whether it passed or failed
   - the failing check names, if any
   - the most likely regression source
   - whether follow-up code changes are needed

## Response Format

- `Regression run`: yes or no
- `Result`: pass or fail
- `Baseline status`: whether `summary.passed`, `checks.controlSuite`, and `checks.trustedResumeSuite` all matched the expected baseline
- `Relevant findings`: concise explanation of any failing or suspicious checks
- `Next action`: either `none` or the specific fix / investigation to do next

## Notes

- Prefer the command above over ad hoc browser testing so the result is reproducible.
- If the task clearly does not touch playback or browser-control behavior, say so explicitly and skip the regression instead of running it blindly.
- Do not claim the regression passed unless the output actually matches the expected baseline.