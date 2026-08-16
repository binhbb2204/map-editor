/**
 * SettingsPanel — handles the settings modal UI,
 * grid resize, sky/theme toggles, and i18n localization.
 */
export default class SettingsPanel {
  constructor(app, placement, { onUpdateMinimap, onNotify }) {
    this.app = app;
    this.placement = placement;
    this._onUpdateMinimap = onUpdateMinimap;
    this._onNotify = onNotify;
  }

  setup() {
    document.getElementById('btn-settings').addEventListener('click', () => {
      document.getElementById('setting-grid-w').value = this.placement.gridW;
      document.getElementById('setting-grid-h').value = this.placement.gridH;
      document.getElementById('settings-overlay').classList.remove('hidden');
    });

    const closeSettings = () => {
      document.getElementById('settings-overlay').classList.add('hidden');
    };
    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    document.getElementById('btn-close-settings-x').addEventListener('click', closeSettings);

    document.getElementById('btn-apply-grid').addEventListener('click', () => {
      const w = parseInt(document.getElementById('setting-grid-w').value);
      const h = parseInt(document.getElementById('setting-grid-h').value);
      if (w >= 5 && h >= 5) {
        this.placement.resizeGrid(w, h);
        this._onUpdateMinimap();
        this._onNotify(`Grid resized to ${w}x${h}`);
      } else {
        this._onNotify('Grid size must be at least 5x5');
      }
    });

    document.getElementById('ui-theme-select').addEventListener('change', (e) => {
      if (e.target.value === 'light') document.body.classList.add('theme-light');
      else document.body.classList.remove('theme-light');
    });

    document.getElementById('sky-theme-select').addEventListener('change', (e) => {
      this.app.setSkyTheme(e.target.value);
    });

    this._setupI18n();
  }

  _setupI18n() {
    const i18n = {
      en: {
        settings: 'Preferences', graphics: 'Graphics & Environment',
        uiTheme: 'UI Theme', skyTheme: 'Sky & Lighting', weather: 'Weather',
        editor: 'Editor Setup', gridSize: 'Grid Size', language: 'Language',
        apply: 'Apply', close: 'Save & Close'
      },
      vi: {
        settings: 'Cài Đặt', graphics: 'Đồ Họa & Môi Trường',
        uiTheme: 'Giao Diện', skyTheme: 'Bầu Trời & Ánh Sáng', weather: 'Thời Tiết',
        editor: 'Thiết Lập Editor', gridSize: 'Kích Thước Map', language: 'Ngôn Ngữ',
        apply: 'Áp Dụng', close: 'Lưu & Đóng'
      }
    };

    const updateLang = (lang) => {
      document.getElementById('lang-settings-title').textContent = i18n[lang].settings;
      document.getElementById('lang-graphics').textContent = i18n[lang].graphics;
      document.getElementById('lang-ui-theme').textContent = i18n[lang].uiTheme;
      document.getElementById('lang-sky-theme').textContent = i18n[lang].skyTheme;
      document.getElementById('lang-weather').textContent = i18n[lang].weather;
      document.getElementById('lang-editor').textContent = i18n[lang].editor;
      document.getElementById('lang-grid-size').textContent = i18n[lang].gridSize;
      document.getElementById('lang-language').textContent = i18n[lang].language;
      document.querySelector('.lang-apply').textContent = i18n[lang].apply;
      document.querySelector('.lang-close').textContent = i18n[lang].close;
    };

    document.getElementById('btn-lang-en').addEventListener('click', (e) => {
      e.target.classList.add('active');
      document.getElementById('btn-lang-vi').classList.remove('active');
      updateLang('en');
    });
    document.getElementById('btn-lang-vi').addEventListener('click', (e) => {
      e.target.classList.add('active');
      document.getElementById('btn-lang-en').classList.remove('active');
      updateLang('vi');
    });
  }
}
