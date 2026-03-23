---
applyTo: "tools/**/*.py"
---

# Tools Rules

- Keep repository tools runnable from the workspace root on Windows using `py ...` commands. Avoid Linux-only shell assumptions in helper scripts.
- Preserve the existing UTF-8 console handling pattern for Python entry scripts so Chinese output stays readable on Windows terminals.
- `tools/browser_control_regression.py` is the primary regression harness for trusted browser controls and resume behavior. When modifying that script, keep the current pass contract stable: top-level `summary.passed = true`, `checks.controlSuite = true`, and `checks.trustedResumeSuite = true` on a healthy run.
- If you change the browser regression harness, retain support for `--ensure-server`, JSON output via `--output`, and deterministic failure artifacts such as screenshots or structured result fields.
- Changes that affect trusted next/prev, trusted resume, KTV playback coordination, or request-source tracing should be validated with `py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --output logs/browser-control-regression.json`.
- When investigating failures in browser-facing flows, correlate regression output with `/memories/repo/request-source-tracing.md`, `/memories/repo/player-status-sync.md`, and `/memories/repo/ws-playlist-updated.md` before changing behavior.
- Utility tools that inspect or repair YouTube metadata should preserve the repo's current URL/thumbnail handling conventions instead of introducing one-off parsing rules.
