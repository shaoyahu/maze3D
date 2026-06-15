import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { ENEMY_CHASE_MULTIPLIER_EASY, ENEMY_CHASE_MULTIPLIER_MEDIUM, ENEMY_CHASE_MULTIPLIER_HARD, type EnemyAggression } from '../maze/types';
import { useT } from '../i18n';
import { LOCALES } from '../i18n/types';

interface AggressionOption {
  value: EnemyAggression;
  codename: string;
  /** Stable, locale-independent label key. Resolved via t() at render. */
  labelKey: string;
  mult: number;
  descKey: string;
}

const AGGRESSION_OPTIONS: readonly AggressionOption[] = [
  { value: 'easy',   codename: 'E-01', labelKey: 'settings.aggression.easy',     mult: ENEMY_CHASE_MULTIPLIER_EASY,   descKey: 'settings.aggression.easyDesc' },
  { value: 'medium', codename: 'M-02', labelKey: 'settings.aggression.medium',   mult: ENEMY_CHASE_MULTIPLIER_MEDIUM, descKey: 'settings.aggression.mediumDesc' },
  { value: 'hard',   codename: 'H-03', labelKey: 'settings.aggression.hard',     mult: ENEMY_CHASE_MULTIPLIER_HARD,   descKey: 'settings.aggression.hardDesc' },
];

const SECTIONS: ReadonlyArray<{ id: string; labelKey: string; codename: string; descKey: string }> = [
  { id: 'display',  labelKey: 'settings.section.display',  codename: 'D-01', descKey: 'settings.codename.display' },
  { id: 'input',    labelKey: 'settings.section.input',    codename: 'I-02', descKey: 'settings.codename.input' },
  { id: 'gameplay', labelKey: 'settings.section.gameplay', codename: 'G-03', descKey: 'settings.codename.gameplay' },
];

function FovFrustum({ fov }: { fov: number }) {
  const clamped = Math.max(40, Math.min(110, fov));
  const t = (clamped - 40) / 70;
  const w = 8 + t * 20;
  const h = 14;
  return (
    <svg className="console-mini-frustum" viewBox="0 0 56 36" aria-hidden="true" style={{ color: 'var(--accent)' }}>
      <line x1="0" y1={h / 2} x2="56" y2={(h - w) / 2} stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
      <line x1="0" y1={h / 2} x2="56" y2={(h + w) / 2} stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
      <line x1="56" y1={(h - w) / 2} x2="56" y2={(h + w) / 2} stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
      <circle cx="0" cy={h / 2} r="2" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function Settings({ onBack }: { onBack: () => void }) {
  const t = useT();
  const sens = useSettingsStore((s) => s.pointerSensitivity);
  const fov = useSettingsStore((s) => s.fov);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const aggression = useSettingsStore((s) => s.enemyAggression);
  const language = useSettingsStore((s) => s.language);
  const set = useSettingsStore((s) => s.set);

  const sensPct = useMemo(() => {
    const min = 0.0005, max = 0.006;
    return Math.max(0, Math.min(100, ((sens - min) / (max - min)) * 100));
  }, [sens]);
  const fovPct = useMemo(() => {
    const min = 40, max = 110;
    return Math.max(0, Math.min(100, ((fov - min) / (max - min)) * 100));
  }, [fov]);

  // ESC anywhere on the Settings surface returns to the previous surface.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  return (
    <div className="prefs-shell">
      <div className="console-statusbar">
        <span className="console-statusbar__chip console-statusbar__chip--accent">
          {t('settings.status.version')}
        </span>
        <span className="console-statusbar__divider" />
        <span className="console-statusbar__chip">{t('settings.status.groupCount', { count: SECTIONS.length })}</span>
        <span className="console-statusbar__chip">{t('settings.status.fov', { fov })}</span>
        <span className="console-statusbar__chip">{t('settings.status.sens', { sens: sens.toFixed(4) })}</span>
        <span className="console-statusbar__live">
          <span className="console-statusbar__live-dot" />
          {t('settings.status.calibrated')}
        </span>
      </div>

      <div className="console-titleblock">
        <div>
          <h2 className="console-title">{t('settings.title')}</h2>
          <p className="console-subtitle">{t('settings.subtitle')}</p>
        </div>
        <div className="console-title-meta">
          <span>{t('settings.profile.label')}</span>
          <span className="console-title-meta__value">{t('settings.profile.value')}</span>
          <span className="console-statusbar__divider" />
          <span>{t('settings.version.label')}</span>
          <span className="console-title-meta__value">{t('settings.version.value')}</span>
        </div>
      </div>

      <div className="prefs-body">
        <nav className="prefs-nav" aria-label={t('settings.nav.label')}>
          <span className="prefs-nav__label">{t('settings.nav.sections')}</span>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#section-${s.id}`}
              className="prefs-nav__item"
            >
              <span>{t(s.labelKey)}</span>
              <span className="prefs-nav__codename">{s.codename}</span>
            </a>
          ))}
        </nav>

        <div className="prefs-content">
          {/* DISPLAY */}
          <section id="section-display" className="prefs-section">
            <div className="prefs-section__header">
              <h3 className="prefs-section__title">{t('settings.section.display')}</h3>
              <span className="prefs-section__codename">D-01 // {t('settings.codename.display')}</span>
            </div>
            <div className="prefs-section__body">
              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">{t('settings.darkMode.label')}</span>
                  <span className="prefs-row__desc">{t('settings.darkMode.desc')}</span>
                </div>
                <div className="prefs-row__control">
                  <label className="console-switch">
                    <input
                      type="checkbox"
                      aria-label={t('settings.darkMode.aria')}
                      checked={darkMode}
                      onChange={(e) => set('darkMode', e.target.checked)}
                    />
                    <span className="console-switch__track" />
                    <span className="console-switch__knob" />
                  </label>
                </div>
              </div>

              {/* P2-8 NEW: language toggle */}
              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">{t('settings.locale.label')}</span>
                  <span className="prefs-row__desc">{t('settings.locale.desc')}</span>
                </div>
                <div className="prefs-row__control">
                  <div
                    className="console-segmented console-segmented--with-desc"
                    role="radiogroup"
                    aria-label={t('settings.locale.aria')}
                  >
                    {LOCALES.map((loc) => {
                      const active = language === loc;
                      return (
                        <button
                          key={loc}
                          type="button"
                          data-testid={`locale-${loc}`}
                          onClick={() => set('language', loc)}
                          className={`console-segmented__option${active ? ' console-segmented__option--active' : ''}`}
                          role="radio"
                          aria-checked={active}
                        >
                          <span className="console-segmented__option-codename">{t(`settings.locale.${loc}`)}</span>
                        </button>
                      );
                    })}
                    <span
                      className="console-segmented__indicator"
                      style={{
                        left: `calc(${(LOCALES.findIndex((l) => l === language) / LOCALES.length) * 100}% + 3px)`,
                        width: `calc(${100 / LOCALES.length}% - 6px)`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">{t('settings.fov.label')}</span>
                  <span className="prefs-row__desc">{t('settings.fov.desc')}</span>
                </div>
                <div className="prefs-row__control">
                  <FovFrustum fov={fov} />
                  <input
                    type="range"
                    min={40} max={110} step={1}
                    value={fov}
                    onChange={(e) => set('fov', Number(e.target.value))}
                    className="console-slider"
                    style={{ ['--slider-fill' as string]: `${fovPct}%` }}
                    aria-label={t('settings.fov.aria')}
                  />
                  <span className="prefs-row__value">{t('settings.fov.value', { fov })}</span>
                </div>
              </div>
            </div>
          </section>

          {/* INPUT */}
          <section id="section-input" className="prefs-section">
            <div className="prefs-section__header">
              <h3 className="prefs-section__title">{t('settings.section.input')}</h3>
              <span className="prefs-section__codename">I-02 // {t('settings.codename.input')}</span>
            </div>
            <div className="prefs-section__body">
              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">{t('settings.sens.label')}</span>
                  <span className="prefs-row__desc">{t('settings.sens.desc')}</span>
                </div>
                <div className="prefs-row__control">
                  <input
                    type="range"
                    min={0.0005} max={0.006} step={0.0005}
                    value={sens}
                    onChange={(e) => set('pointerSensitivity', Number(e.target.value))}
                    className="console-slider"
                    style={{ ['--slider-fill' as string]: `${sensPct}%` }}
                    aria-label={t('settings.sens.aria')}
                  />
                  <span className="prefs-row__value">{t('settings.sens.value', { sens: sens.toFixed(4) })}</span>
                </div>
              </div>
            </div>
          </section>

          {/* GAMEPLAY */}
          <section id="section-gameplay" className="prefs-section">
            <div className="prefs-section__header">
              <h3 className="prefs-section__title">{t('settings.section.gameplay')}</h3>
              <span className="prefs-section__codename">G-03 // {t('settings.codename.gameplay')}</span>
            </div>
            <div className="prefs-section__body">
              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">{t('settings.aggression.label')}</span>
                  <span className="prefs-row__desc">{t('settings.aggression.desc')}</span>
                </div>
                <div className="prefs-row__control">
                  <div
                    className="console-segmented console-segmented--with-desc"
                    role="radiogroup"
                    aria-label={t('settings.aggression.aria')}
                  >
                    {AGGRESSION_OPTIONS.map((opt) => {
                      const active = aggression === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          data-testid={`aggression-${opt.value}`}
                          onClick={() => set('enemyAggression', opt.value)}
                          className={`console-segmented__option${active ? ' console-segmented__option--active' : ''}`}
                          role="radio"
                          aria-checked={active}
                        >
                          <span className="console-segmented__option-codename">{t(opt.labelKey)}</span>
                          <span className="console-segmented__option-mult">{opt.mult.toFixed(1)}x</span>
                        </button>
                      );
                    })}
                    <span
                      className="console-segmented__indicator"
                      style={{
                        left: `calc(${(AGGRESSION_OPTIONS.findIndex((o) => o.value === aggression) / AGGRESSION_OPTIONS.length) * 100}% + 3px)`,
                        width: `calc(${100 / AGGRESSION_OPTIONS.length}% - 6px)`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="console-action-row">
        <span className="console-action-row__hint">
          {t('settings.action.hint', { key: 'Esc' })}
        </span>
        <div className="console-action-row__buttons">
          <button
            type="button"
            onClick={onBack}
            className="console-primary-btn"
            style={{ background: 'transparent', color: 'var(--fg)', borderColor: 'var(--border)' }}
          >
            {t('settings.action.back')}
          </button>
        </div>
      </div>
    </div>
  );
}