import main as clubmusic_main
import run as clubmusic_run


class _FakeStdin:
    def __init__(self, interactive):
        self._interactive = interactive

    def isatty(self):
        return self._interactive


def _active_instance_status():
    return {
        'existing_instance_summary': 'PID=1234',
        'port_accepting': True,
        'listening_is_clubmusic': True,
        'expected_url': 'http://127.0.0.1:9000/',
    }


def test_supports_interactive_startup_prompts_default_to_disabled_without_override():
    assert clubmusic_main._supports_interactive_startup_prompts(_FakeStdin(True)) is False
    assert clubmusic_main._supports_interactive_startup_prompts(_FakeStdin(False)) is False
    assert clubmusic_main._supports_interactive_startup_prompts(None) is False


def test_supports_interactive_startup_prompts_honors_env_override(monkeypatch):
    monkeypatch.setenv('CLUBMUSIC_STARTUP_PROMPTS', '0')
    assert clubmusic_main._supports_interactive_startup_prompts(_FakeStdin(True)) is False

    monkeypatch.setenv('CLUBMUSIC_STARTUP_PROMPTS', '1')
    assert clubmusic_main._supports_interactive_startup_prompts(_FakeStdin(False)) is True


def test_status_has_running_clubmusic_instance_requires_live_matching_listener():
    active_status = {
        'existing_instance_summary': 'PID=1234',
        'port_accepting': True,
        'listening_is_clubmusic': True,
    }
    missing_listener_status = {
        'existing_instance_summary': 'PID=1234',
        'port_accepting': True,
        'listening_is_clubmusic': False,
    }

    assert clubmusic_main._status_has_running_clubmusic_instance(active_status) is True
    assert clubmusic_main._status_has_running_clubmusic_instance(missing_listener_status) is False


def test_main_reuses_existing_instance_without_takeover_prompt_by_default(monkeypatch):
    captured = {}
    reports = []
    cleanup_calls = []
    active_status = _active_instance_status()

    monkeypatch.delenv('CLUBMUSIC_STARTUP_PROMPTS', raising=False)
    monkeypatch.setattr(clubmusic_main.sys, 'stdin', _FakeStdin(True))
    monkeypatch.setattr(clubmusic_main, 'cleanup_stale_mpv_processes', lambda logger=None: cleanup_calls.append(logger))
    monkeypatch.setattr(clubmusic_main, 'get_service_instance_status', lambda host, port: active_status)
    monkeypatch.setattr(clubmusic_main, '_report_existing_clubmusic_instance', lambda status: reports.append(status))

    def fake_ensure_single_service_instance(*, server_host, server_port, logger, interactive, prompt_for_takeover):
        captured['server_host'] = server_host
        captured['server_port'] = server_port
        captured['interactive'] = interactive
        captured['prompt_for_takeover'] = prompt_for_takeover
        raise RuntimeError('already running')

    monkeypatch.setattr(clubmusic_main, 'ensure_single_service_instance', fake_ensure_single_service_instance)

    clubmusic_main.main()

    assert captured['interactive'] is False
    assert captured['prompt_for_takeover'] is False
    assert reports == [active_status]
    assert cleanup_calls == []


def test_main_enables_takeover_prompt_when_explicitly_requested(monkeypatch):
    captured = {}
    reports = []
    cleanup_calls = []
    active_status = _active_instance_status()

    monkeypatch.setenv('CLUBMUSIC_STARTUP_PROMPTS', '1')
    monkeypatch.setattr(clubmusic_main.sys, 'stdin', _FakeStdin(False))
    monkeypatch.setattr(clubmusic_main, 'cleanup_stale_mpv_processes', lambda logger=None: cleanup_calls.append(logger))
    monkeypatch.setattr(clubmusic_main, 'get_service_instance_status', lambda host, port: active_status)
    monkeypatch.setattr(clubmusic_main, '_report_existing_clubmusic_instance', lambda status: reports.append(status))

    def fake_ensure_single_service_instance(*, server_host, server_port, logger, interactive, prompt_for_takeover):
        captured['interactive'] = interactive
        captured['prompt_for_takeover'] = prompt_for_takeover
        raise RuntimeError('already running')

    monkeypatch.setattr(clubmusic_main, 'ensure_single_service_instance', fake_ensure_single_service_instance)

    clubmusic_main.main()

    assert captured['interactive'] is True
    assert captured['prompt_for_takeover'] is True
    assert reports == [active_status]
    assert cleanup_calls == []


def test_run_cli_returns_zero_when_main_returns_normally(monkeypatch):
    monkeypatch.setattr(clubmusic_run, 'main', lambda: None)

    assert clubmusic_run.run_cli() == 0


def test_run_cli_returns_system_exit_code(monkeypatch):
    def raise_system_exit():
        raise SystemExit(1)

    monkeypatch.setattr(clubmusic_run, 'main', raise_system_exit)

    assert clubmusic_run.run_cli() == 1


def test_run_cli_returns_one_for_unexpected_error(monkeypatch):
    def raise_runtime_error():
        raise RuntimeError('boom')

    monkeypatch.setattr(clubmusic_run, 'main', raise_runtime_error)
    monkeypatch.setattr(clubmusic_run.traceback, 'print_exc', lambda: None)

    assert clubmusic_run.run_cli() == 1