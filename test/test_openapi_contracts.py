from fastapi import FastAPI

from routers import history as history_router
from routers import media as media_router
from routers import player as player_router
from routers import playlist as playlist_router
from routers import room as room_router
from routers import search as search_router
from routers import settings as settings_router


def build_openapi_schema():
    app = FastAPI()
    app.include_router(playlist_router.router)
    app.include_router(player_router.router)
    app.include_router(search_router.router)
    app.include_router(history_router.router)
    app.include_router(media_router.router)
    app.include_router(settings_router.router)
    app.include_router(room_router.router)
    return app.openapi()


def test_openapi_core_contract_refs_are_stable():
    schema = build_openapi_schema()
    paths = schema["paths"]

    assert paths["/play"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaySuccessResponse"
    assert paths["/status"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlayerStatusResponse"
    assert paths["/playlists"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaylistsListResponse"
    assert paths["/search_song"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/SearchSongResponse"
    assert paths["/playback_history"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaybackHistoryResponse"
    assert paths["/volume"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/VolumeResponse"
    assert paths["/room/init"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomInitResponse"
    assert paths["/diagnostic/ytdlp"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/DiagnosticYtDlpResponse"


def test_openapi_request_bodies_cover_json_and_form_contracts():
    schema = build_openapi_schema()
    paths = schema["paths"]

    play_request = paths["/play"]["post"]["requestBody"]["content"]
    assert (
        "multipart/form-data" in play_request
        or "application/x-www-form-urlencoded" in play_request
    )

    pitch_request = paths["/pitch"]["post"]["requestBody"]["content"]
    assert "application/json" in pitch_request

    history_add_request = paths["/song_add_to_history"]["post"]["requestBody"]["content"]
    assert "application/json" in history_add_request
    assert "multipart/form-data" in history_add_request
    assert history_add_request["application/json"]["schema"]["properties"]["url"]["type"] == "string"

    history_delete_request = paths["/playback_history_delete"]["post"]["requestBody"]["content"]
    assert "application/json" in history_delete_request
    assert "multipart/form-data" in history_delete_request

    room_init_request = paths["/room/init"]["post"]["requestBody"]["content"]
    assert "application/json" in room_init_request


def test_openapi_binary_and_streaming_routes_are_documented():
    schema = build_openapi_schema()
    paths = schema["paths"]

    preview_response = paths["/static/images/preview.png"]["get"]["responses"]["200"]["content"]
    assert "image/png" in preview_response

    cover_response = paths["/cover/{file_path}"]["get"]["responses"]["200"]["content"]
    assert "image/jpeg" in cover_response
    assert "image/png" in cover_response

    video_proxy_response = paths["/video_proxy"]["get"]["responses"]["200"]["content"]
    assert "application/vnd.apple.mpegurl" in video_proxy_response
    assert "video/mp2t" in video_proxy_response