from pathlib import Path


_REPO_ROOT = Path(__file__).resolve().parents[1]


def test_main_init_applies_settings_nav_visibility_before_binding_events():
    source = (_REPO_ROOT / 'static' / 'js' / 'main.js').read_text(encoding='utf-8')

    settings_init_index = source.index('await settingsManager.init();')
    apply_visibility_index = source.index('this.applySettingsNavVisibility();', settings_init_index)
    bind_events_index = source.index('this.bindEventListeners();', apply_visibility_index)

    assert settings_init_index < apply_visibility_index < bind_events_index
