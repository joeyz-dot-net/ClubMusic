import main as clubmusic_main
import run as clubmusic_run


class _FakeStdin:
    def __init__(self, interactive):
        self._interactive = interactive

    def isatty(self):
        return self._interactive


def test_supports_interactive_startup_prompts_respects_stdin_isatty():
    assert clubmusic_main._supports_interactive_startup_prompts(_FakeStdin(True)) is True
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