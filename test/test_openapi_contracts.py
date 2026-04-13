import re
from pathlib import Path

from fastapi import FastAPI

from routers import history as history_router
from routers import media as media_router
from routers import player as player_router
from routers import playlist as playlist_router
from routers import room as room_router
from routers import search as search_router
from routers import settings as settings_router
from routers import websocket as websocket_router


_API_JS_PATH = Path(__file__).resolve().parents[1] / "static" / "js" / "api.js"
_FRONTEND_DIRECT_API_CALL_PATTERN = re.compile(
    r"this\.(get|post|postForm|put|delete)\(\s*([`'\"])(/.*?)(?<!\\)\2",
    re.DOTALL,
)
_FRONTEND_PLAYLIST_ROUTE_PATTERN = re.compile(
    r"playlistId\s*\?\s*`/playlist\?playlist_id=\$\{[^}]+}`\s*:\s*['\"]/playlist['\"]"
)
_FORM_CONTENT_TYPES = {"multipart/form-data", "application/x-www-form-urlencoded"}


def _normalize_contract_path(path: str) -> str:
    normalized = path.split("?", 1)[0]
    normalized = re.sub(r"\$\{[^}]+}", "{param}", normalized)
    normalized = re.sub(r"\{[^}]+}", "{param}", normalized)
    return normalized


def _extract_frontend_api_calls() -> set[tuple[str, str, str]]:
    source = _API_JS_PATH.read_text(encoding="utf-8")
    calls: set[tuple[str, str, str]] = set()

    for method_name, _delimiter, endpoint in _FRONTEND_DIRECT_API_CALL_PATTERN.findall(source):
        http_method = "POST" if method_name == "postForm" else method_name.upper()
        calls.add((method_name, http_method, _normalize_contract_path(endpoint)))

    if _FRONTEND_PLAYLIST_ROUTE_PATTERN.search(source):
        calls.add(("get", "GET", "/playlist"))

    return calls


def _extract_frontend_api_contracts() -> set[tuple[str, str]]:
    return {
        (http_method, path)
        for _helper_name, http_method, path in _extract_frontend_api_calls()
    }


def _extract_backend_api_operations(schema: dict) -> dict[tuple[str, str], dict]:
    operations: dict[tuple[str, str], dict] = {}

    for path, path_item in schema["paths"].items():
        normalized_path = _normalize_contract_path(path)
        for method_name in ("get", "post", "put", "delete"):
            operation = path_item.get(method_name)
            if operation:
                operations[(method_name.upper(), normalized_path)] = operation

    return operations


def _extract_backend_api_contracts(schema: dict) -> set[tuple[str, str]]:
    return set(_extract_backend_api_operations(schema))


def build_openapi_schema():
    app = FastAPI()
    app.include_router(playlist_router.router)
    app.include_router(player_router.router)
    app.include_router(search_router.router)
    app.include_router(history_router.router)
    app.include_router(media_router.router)
    app.include_router(settings_router.router)
    app.include_router(room_router.router)
    app.include_router(websocket_router.router)
    return app.openapi()


def _get_parameter(operation: dict, name: str) -> dict:
    for parameter in operation.get("parameters", []):
        if parameter["name"] == name:
            return parameter
    raise AssertionError(f"parameter not found: {name}")


def test_openapi_core_contract_refs_are_stable():
    schema = build_openapi_schema()
    paths = schema["paths"]
    status_schema = paths["/status"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]

    assert paths["/play"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaySuccessResponse"
    assert paths["/debug/pipe-check"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/DebugPipeCheckResponse"
    assert paths["/next"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaybackAdvanceResponse"
    assert paths["/prev"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaybackAdvanceResponse"
    assert {item["$ref"] for item in status_schema["anyOf"]} == {
        "#/components/schemas/PlayerStatusResponse",
        "#/components/schemas/PlayerStatusErrorResponse",
    }
    assert paths["/playlists"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaylistsListResponse"
    assert paths["/search_song"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/SearchSongResponse"
    assert paths["/playback_history"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaybackHistoryResponse"
    assert paths["/volume"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/VolumeResponse"
    assert paths["/room/init"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomInitResponse"
    assert paths["/diagnostic/ytdlp"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/DiagnosticYtDlpResponse"
    assert paths["/youtube_extract_playlist"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/YoutubeExtractPlaylistResponse"
    assert paths["/play_youtube_playlist"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlayYoutubePlaylistResponse"


def test_openapi_settings_diagnostics_and_room_contract_refs_are_stable():
    schema = build_openapi_schema()
    paths = schema["paths"]

    assert paths["/version"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/VersionResponse"
    assert paths["/settings"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/UserSettingsResponse"
    assert paths["/settings"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/SettingsMutationResponse"
    assert paths["/settings/{key}"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/SettingsMutationResponse"
    assert paths["/settings/schema"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/SettingsSchemaResponse"
    assert paths["/ui-config"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/UIConfigResponse"
    assert paths["/ui-config"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/UIConfigMutationResponse"
    assert paths["/diagnostic/instance-status"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/DiagnosticInstanceStatusResponse"
    assert paths["/room/{room_id}"]["delete"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomDestroyResponse"
    assert paths["/room/{room_id}/status"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomStatusResponse"
    assert paths["/room/list"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomListResponse"


def test_openapi_error_contract_refs_are_stable():
    schema = build_openapi_schema()
    paths = schema["paths"]

    assert paths["/play"]["post"]["responses"]["409"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaybackControlErrorResponse"
    assert paths["/next"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaybackControlErrorResponse"
    assert paths["/prev"]["post"]["responses"]["404"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PlaybackControlErrorResponse"
    assert paths["/pause"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/seek"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/loop"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/shuffle"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/pitch"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/youtube_extract_playlist"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/play_youtube_playlist"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/search_song"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/search_youtube"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/get_directory_songs"]["post"]["responses"]["404"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlists"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlist_create"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlists/{playlist_id}"]["delete"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlists/{playlist_id}"]["delete"]["responses"]["404"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlists/{playlist_id}/clear"]["post"]["responses"]["404"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlists/{playlist_id}/remove"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlists/{playlist_id}"]["put"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlists/{playlist_id}/switch"]["post"]["responses"]["404"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlist_play"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlist_reorder"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playlist_remove"]["post"]["responses"]["404"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playback_history"]["get"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playback_history_merged"]["get"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/song_add_to_history"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/playback_history_delete"]["post"]["responses"]["404"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/refresh_video_url"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/volume"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/settings"]["get"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/settings/{key}"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/diagnostic/instance-status"]["get"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/diagnostic/ytdlp"]["get"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ErrorResponse"
    assert paths["/room/init"]["post"]["responses"]["400"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomErrorResponse"
    assert paths["/room/init"]["post"]["responses"]["409"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomErrorResponse"
    assert paths["/room/init"]["post"]["responses"]["429"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomErrorResponse"
    assert paths["/room/init"]["post"]["responses"]["500"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomErrorResponse"
    assert paths["/room/{room_id}"]["delete"]["responses"]["404"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomErrorResponse"


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


def test_openapi_settings_and_room_request_shapes_are_stable():
    schema = build_openapi_schema()
    paths = schema["paths"]

    settings_request = paths["/settings"]["post"]["requestBody"]["content"]
    assert settings_request["application/json"]["schema"]["$ref"] == "#/components/schemas/UserSettingsUpdateRequest"

    single_setting_operation = paths["/settings/{key}"]["post"]
    single_setting_request = single_setting_operation["requestBody"]["content"]
    assert single_setting_request["application/json"]["schema"]["$ref"] == "#/components/schemas/SettingsValueRequest"
    key_parameter = _get_parameter(single_setting_operation, "key")
    assert key_parameter["in"] == "path"
    assert key_parameter["required"] is True
    assert key_parameter["schema"]["type"] == "string"

    ui_config_request = paths["/ui-config"]["post"]["requestBody"]["content"]
    assert ui_config_request["application/json"]["schema"]["$ref"] == "#/components/schemas/UIConfigRequest"

    room_init_request = paths["/room/init"]["post"]["requestBody"]["content"]
    assert room_init_request["application/json"]["schema"]["$ref"] == "#/components/schemas/RoomInitRequest"

    room_delete_parameter = _get_parameter(paths["/room/{room_id}"]["delete"], "room_id")
    assert room_delete_parameter["in"] == "path"
    assert room_delete_parameter["required"] is True
    assert room_delete_parameter["schema"]["type"] == "string"

    room_status_parameter = _get_parameter(paths["/room/{room_id}/status"]["get"], "room_id")
    assert room_status_parameter["in"] == "path"
    assert room_status_parameter["required"] is True
    assert room_status_parameter["schema"]["type"] == "string"

    assert "requestBody" not in paths["/diagnostic/instance-status"]["get"]
    assert "requestBody" not in paths["/room/list"]["get"]
    assert "requestBody" not in paths["/settings/schema"]["get"]


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


def test_websocket_route_is_not_emitted_in_http_openapi_schema():
    schema = build_openapi_schema()

    assert "/ws" not in schema["paths"]


def test_frontend_api_contracts_exist_in_openapi_schema():
    schema = build_openapi_schema()
    frontend_contracts = _extract_frontend_api_contracts()
    backend_contracts = _extract_backend_api_contracts(schema)

    assert {
        ("POST", "/play"),
        ("GET", "/playlist"),
        ("POST", "/settings/{param}"),
        ("GET", "/room/{param}/status"),
        ("POST", "/playlists/{param}/add_next"),
    }.issubset(frontend_contracts)

    missing_contracts = sorted(frontend_contracts - backend_contracts)

    assert missing_contracts == []


def test_frontend_api_body_encodings_match_openapi_schema():
    schema = build_openapi_schema()
    backend_operations = _extract_backend_api_operations(schema)
    frontend_calls = _extract_frontend_api_calls()

    frontend_form_contracts = {
        (http_method, path)
        for helper_name, http_method, path in frontend_calls
        if helper_name == "postForm"
    }
    assert {
        ("POST", "/play"),
        ("POST", "/volume"),
        ("POST", "/seek"),
        ("POST", "/playlist_remove"),
        ("POST", "/search_youtube"),
    }.issubset(frontend_form_contracts)

    mismatched_form_routes = []
    mismatched_json_routes = []

    for helper_name, http_method, path in sorted(frontend_calls):
        operation = backend_operations.get((http_method, path))
        assert operation is not None, (http_method, path)

        request_content = set(operation.get("requestBody", {}).get("content", {}))

        if helper_name == "postForm":
            if request_content and not (_FORM_CONTENT_TYPES & request_content):
                mismatched_form_routes.append((http_method, path, sorted(request_content)))
            continue

        if helper_name in {"post", "put"} and request_content and "application/json" not in request_content:
            mismatched_json_routes.append((http_method, path, sorted(request_content)))

    assert mismatched_form_routes == []
    assert mismatched_json_routes == []