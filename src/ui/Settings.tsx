// F-redesign-2026-06-14: /settings surface reworked into a "Calibration
// Console" layout (left section nav + grouped settings rows on the
// right + custom switch / slider / segmented controls). The existing
// store contract (pointerSensitivity / fov / darkMode / enemyAggression)
// and the testid surface (`aggression-{easy,medium,hard}` +
// `label="深色模式"`) are preserved. All sections render in-flow on
// the right side (no display:none) so the page is a single scrollable
// calibration sheet; the left rail is a sticky in-page index that
// scrolls each section into view on click.
//
// F-redesign-2026-06-14: ESC key now returns to the previous surface
// (in /settings standalone it navigates back to /, in the in-game
// PauseOverlay it closes the panel back to the 3-button pause screen).
// The keydown listener is mounted on `document` because Settings is
// inside a non-focusable div (prefs-shell); a local onKeyDown on the
// shell would only fire when the shell itself has focus, which it
// never receives by default.
import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { ENEMY_CHASE_MULTIPLIER_EASY, ENEMY_CHASE_MULTIPLIER_MEDIUM, ENEMY_CHASE_MULTIPLIER_HARD, type EnemyAggression } from '../maze/types';

interface AggressionOption {
  value: EnemyAggression;
  codename: string;
  label: string;
  mult: number;
  desc: string;
}

const AGGRESSION_OPTIONS: readonly AggressionOption[] = [
  { value: 'easy',   codename: 'E-01', label: '简单', mult: ENEMY_CHASE_MULTIPLIER_EASY,   desc: '反应迟缓' },
  { value: 'medium', codename: 'M-02', label: '中等', mult: ENEMY_CHASE_MULTIPLIER_MEDIUM, desc: '标准' },
  { value: 'hard',   codename: 'H-03', label: '困难', mult: ENEMY_CHASE_MULTIPLIER_HARD,   desc: '高压追击' },
];

const SECTIONS: ReadonlyArray<{ id: string; label: string; codename: string; desc: string }> = [
  { id: 'display',  label: '显示', codename: 'D-01', desc: '外观 / 视野' },
  { id: 'input',    label: '控制', codename: 'I-02', desc: '输入' },
  { id: 'gameplay', label: '玩法', codename: 'G-03', desc: '敌人 / 行为' },
];

// F-redesign-2026-06-14: tiny SVG frustum that visualizes the current
// FOV. Wider triangle = wider field of view. Kept inline so it
// inherits the surrounding text color via currentColor.
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
  const sens = useSettingsStore((s) => s.pointerSensitivity);
  const fov = useSettingsStore((s) => s.fov);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const aggression = useSettingsStore((s) => s.enemyAggression);
  const set = useSettingsStore((s) => s.set);

  const sensPct = useMemo(() => {
    const min = 0.0005, max = 0.006;
    return Math.max(0, Math.min(100, ((sens - min) / (max - min)) * 100));
  }, [sens]);
  const fovPct = useMemo(() => {
    const min = 40, max = 110;
    return Math.max(0, Math.min(100, ((fov - min) / (max - min)) * 100));
  }, [fov]);

  // F-redesign-2026-06-14: ESC anywhere on the Settings surface returns
  // to the previous surface. The listener is attached to `document`
  // because Settings' container div never receives keyboard focus by
  // default, so a local onKeyDown handler would never fire. Cleanup
  // removes the listener on unmount so a stale handler can't fire if
  // Settings is unmounted via another path (e.g. browser back).
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
          设置 v1.0
        </span>
        <span className="console-statusbar__divider" />
        <span className="console-statusbar__chip">分组 {SECTIONS.length}</span>
        <span className="console-statusbar__chip">视野 {fov}°</span>
        <span className="console-statusbar__chip">灵敏度 {sens.toFixed(4)}</span>
        <span className="console-statusbar__live">
          <span className="console-statusbar__live-dot" />
          已校准
        </span>
      </div>

      <div className="console-titleblock">
        <div>
          <h2 className="console-title">设置</h2>
          <p className="console-subtitle">校准与显示 · 偏好设置</p>
        </div>
        <div className="console-title-meta">
          <span>档案</span>
          <span className="console-title-meta__value">玩家-01</span>
          <span className="console-statusbar__divider" />
          <span>版本</span>
          <span className="console-title-meta__value">2026.06</span>
        </div>
      </div>

      <div className="prefs-body">
        <nav className="prefs-nav" aria-label="设置分组">
          <span className="prefs-nav__label">分组</span>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#section-${s.id}`}
              className="prefs-nav__item"
            >
              <span>{s.label}</span>
              <span className="prefs-nav__codename">{s.codename}</span>
            </a>
          ))}
        </nav>

        <div className="prefs-content">
          {/* DISPLAY */}
          <section id="section-display" className="prefs-section">
            <div className="prefs-section__header">
              <h3 className="prefs-section__title">显示</h3>
              <span className="prefs-section__codename">D-01 // 显示</span>
            </div>
            <div className="prefs-section__body">
              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">深色模式</span>
                  <span className="prefs-row__desc">切换深色 / 浅色主题，所有界面与 HUD 同步生效</span>
                </div>
                <div className="prefs-row__control">
                  <label className="console-switch">
                    <input
                      type="checkbox"
                      aria-label="深色模式"
                      checked={darkMode}
                      onChange={(e) => set('darkMode', e.target.checked)}
                    />
                    <span className="console-switch__track" />
                    <span className="console-switch__knob" />
                  </label>
                </div>
              </div>

              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">视野角度</span>
                  <span className="prefs-row__desc">摄像机垂直视野，越大看越多但远处更小</span>
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
                    aria-label="视野角度"
                  />
                  <span className="prefs-row__value">{fov}°</span>
                </div>
              </div>
            </div>
          </section>

          {/* INPUT */}
          <section id="section-input" className="prefs-section">
            <div className="prefs-section__header">
              <h3 className="prefs-section__title">控制</h3>
              <span className="prefs-section__codename">I-02 // 输入</span>
            </div>
            <div className="prefs-section__body">
              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">鼠标灵敏度</span>
                  <span className="prefs-row__desc">视角转动的角速度（rad / 像素），越大越灵敏</span>
                </div>
                <div className="prefs-row__control">
                  <input
                    type="range"
                    min={0.0005} max={0.006} step={0.0005}
                    value={sens}
                    onChange={(e) => set('pointerSensitivity', Number(e.target.value))}
                    className="console-slider"
                    style={{ ['--slider-fill' as string]: `${sensPct}%` }}
                    aria-label="鼠标灵敏度"
                  />
                  <span className="prefs-row__value">{sens.toFixed(4)} rad/px</span>
                </div>
              </div>
            </div>
          </section>

          {/* GAMEPLAY */}
          <section id="section-gameplay" className="prefs-section">
            <div className="prefs-section__header">
              <h3 className="prefs-section__title">玩法</h3>
              <span className="prefs-section__codename">G-03 // 行为</span>
            </div>
            <div className="prefs-section__body">
              <div className="prefs-row">
                <div className="prefs-row__label">
                  <span className="prefs-row__name">敌人追击速度</span>
                  <span className="prefs-row__desc">敌人发现玩家后的追击倍率（1.0x = 玩家同等速度）</span>
                </div>
                <div className="prefs-row__control">
                  <div
                    className="console-segmented console-segmented--with-desc"
                    role="radiogroup"
                    aria-label="敌人追击速度"
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
                          <span className="console-segmented__option-codename">{opt.label}</span>
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
          按 <kbd>Esc</kbd> 应用并返回
        </span>
        <div className="console-action-row__buttons">
          <button
            type="button"
            onClick={onBack}
            className="console-primary-btn"
            style={{ background: 'transparent', color: 'var(--fg)', borderColor: 'var(--border)' }}
          >
            返回
          </button>
        </div>
      </div>
    </div>
  );
}
