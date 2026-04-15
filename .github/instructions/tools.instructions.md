---
applyTo: "tools/**/*.py"
---

# Tools Rules

- Keep repository tools runnable from the workspace root on Windows using `py ...` commands. Avoid Linux-only shell assumptions in helper scripts.
- Preserve the existing UTF-8 console handling pattern for Python entry scripts so Chinese output stays readable on Windows terminals.
- `tools/browser_control_regression.py` is the primary regression harness for trusted browser controls and resume behavior. Keep the legacy pass contract stable: top-level `summary.passed = true`, `checks.controlSuite = true`, and `checks.trustedResumeSuite = true` on a healthy run; the standard workflow also expects `checks.queueSuite = true`.
- If you change the browser regression harness, retain support for `--ensure-server`, JSON output via `--output`, and deterministic failure artifacts such as screenshots or structured result fields.
- Changes that affect trusted next/prev, trusted resume, KTV playback coordination, request-source tracing, or queue rendering/removal/reorder behavior should be validated with `py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-queue-suite --output logs/browser-control-regression.json`.
- Changes that affect local search results, local directory navigation, breadcrumb behavior, or the shared local tree data path should be validated with `py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-local-suite --output logs/browser-control-regression-local.json`.
- Changes that affect room routing, room bootstrap, room recovery, WebSocket room validation, or default-page isolation should be validated with `py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-queue-suite --include-room-suite --output logs/browser-control-regression-room.json` and should keep `checks.roomSuite = true` on a healthy run.
- When investigating failures in browser-facing flows, correlate regression output with `/memories/repo/request-source-tracing.md`, `/memories/repo/player-status-sync.md`, and `/memories/repo/ws-playlist-updated.md` before changing behavior.
- Utility tools that inspect or repair YouTube metadata should preserve the repo's current URL/thumbnail handling conventions instead of introducing one-off parsing rules.
