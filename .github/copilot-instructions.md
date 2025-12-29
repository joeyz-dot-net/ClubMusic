# ClubMusic AI Agent Guide

**Full-stack web music player**: FastAPI + ES6 modules + MPV IPC engine.  
**Key distinction**: Bilingual (zh/en), user-isolation via localStorage, multi-singleton architecture, Windows/PyInstaller-optimized.

> **Last Updated**: 2025-12-27 | **Focus**: Production-ready patterns, user-isolation architecture, ES6 module state management, backend event listening

## ⚠️ Critical Rules (Must-Know)

| Rule | Impact & Example |
|------|---------|
| **API Sync** | Backend [app.py](../app.py) + Frontend [static/js/api.js](../static/js/api.js) must match exactly. New route? Update BOTH. Field rename? Check both files. Missing sync = silent failures. |
| **FormData vs JSON** | **Player control** (`/play`, `/seek`, `/volume`, `/playlist_remove`): `await request.form()`. **Data CRUD** (`/playlists`, `/playlist_reorder`, `/search_song`): `await request.json()`. Wrong type = "form required" errors. |
| **POST vs PUT vs DELETE** | **Creating**: POST `/playlists`. **Updating**: PUT `/playlists/{id}`. **Removing**: DELETE `/playlists/{id}`. Follow REST semantics strictly for frontend routing. |
| **Global Singletons** | `PLAYER`, `PLAYLISTS_MANAGER`, `RANK_MANAGER` initialized in [app.py#L70-80](../app.py). Access directly—never create new instances. State corruption if duplicated. |
| **Config Reload** | [settings.ini](../settings.ini) parsed once at startup. Audio device change? Music dir? **Requires restart** `python main.py`. |
| **UTF-8 Windows** | Every `.py` entry point needs UTF-8 wrapper (see [models/__init__.py#L6-11](../models/__init__.py)). Chinese chars garbled = missing wrapper. |
| **i18n Sync** | Always add BOTH `zh` and `en` keys in [static/js/i18n.js](../static/js/i18n.js). Missing lang = undefined UI text. |
| **Persistence** | Call `PLAYLISTS_MANAGER.save()` after ANY playlist modification. Forgetting it = data loss. |
| **User Isolation** | Playlist selection in browser `localStorage` (`selectedPlaylistId`), NOT backend global state. Each browser/tab independent. |
| **PyInstaller Paths** | External tools (`mpv.exe`, `yt-dlp.exe`) live next to exe. Bundled assets (`static/`, `templates/`) in temp `_MEIPASS` dir. |
| **Singleton Pattern** | Use `MusicPlayer.initialize()` classmethod, not `__init__()`. Returns cached instance across app lifetime. |

## Architecture

```
Browser ←poll /status→ FastAPI (app.py) ←→ Singletons ←→ MPV (\\.\pipe\mpv-pipe)
   │                         │                              ↑
   ├── ES6 modules ──────────┴── models/*.py               │
   └── localStorage                  └─ Backend event listener (detects end-file)
       (selectedPlaylistId,                 └─ Auto-deletes current song + plays next
        theme, language)                       (NO frontend intervention needed)
                                    └── playlists.json, playback_history.json
````instructions
# ClubMusic AI Agent Guide

Concise, actionable instructions for AI coding agents working on ClubMusic (FastAPI backend + ES6 frontend + MPV IPC).

Last updated: 2025-12-29

## Critical Rules (must follow)
- API surface parity: update both `app.py` and `static/js/api.js` for any endpoint changes (method, payload type, field names).
- Form vs JSON: Player-control endpoints use FormData (`/play`, `/seek`, `/volume`, `/playlist_remove`); CRUD/search endpoints use JSON (`/playlists`, `/playlist_reorder`, `/search_song`).
- Singletons: use the global `PLAYER = MusicPlayer.initialize()` and `PLAYLISTS_MANAGER` from `app.py` — do not instantiate duplicates.
- Persistence: call `PLAYLISTS_MANAGER.save()` after any playlist mutation so `playlists.json` is updated.

## Architecture & Dataflow (short)
- Browser ↔ FastAPI (`/status` polls every ~1s) ↔ Singletons ↔ MPV IPC (pipe: `\\.\pipe\mpv-pipe`).
- Auto-next is 100% backend-controlled: `models/player.py` listens for MPV `end-file` and runs `handle_playback_end()` (deletes current item, plays next). Frontend only reflects `/status`.
- Playlist selection is client-local: `localStorage.selectedPlaylistId` determines UI; backend only validates via `/playlists/{id}/switch`.

## Project-specific patterns & gotchas
- UTF-8 wrappers: entry scripts set stdout encoding for Windows (see `models/__init__.py`). Keep that pattern when adding CLI entrypoints.
- MPV startup: `main.py` interactively selects audio device and updates `mpv_cmd`. During runtime the environment var `MPV_AUDIO_DEVICE` may be used.
- yt-dlp integration: `models/song.py` and `models/player.py` call `yt-dlp` (prefer `bin/yt-dlp.exe` when present).
- Event-driven auto-fill: `app.py:auto_fill_and_play_if_idle()` can auto-fill default playlist after idle; review before changing default-queue behavior.

## Developer workflows (quick)
- Run dev server (interactive device select):
  ```powershell
  python main.py
  ```
- Build bundle (PyInstaller wrapper):
  ```powershell
  .\build_exe.bat
  ```
- Check MPV/pipe:
  ```powershell
  Get-Process mpv
  Test-Path "\\.\pipe\\mpv-pipe"
  ```

## Files to check when editing features
- Routes / business logic: `app.py`
- MPV control & event handling: `models/player.py`
- Playlist persistence & multi-playlist logic: `models/playlists.py` and `static/js/playlist.js`
- Frontend API glue: `static/js/api.js` (FormData vs JSON must match backend)

If any of these points are unclear or you want a tailored agent role (backend/frontend/tester), say which and I will adapt this guide.
````