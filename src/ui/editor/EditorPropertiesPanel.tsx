import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { MazeData, PickupType, VictoryType, MinimapMode, MapOpenBehavior, ParchmentLifecycle } from '../../maze/types';
import { isPickupType, isVictoryType, VICTORY_TYPE_VALUES, MINIMAP_MODE_VALUES, MAP_OPEN_BEHAVIOR_VALUES, PARCHMENT_LIFECYCLE_VALUES } from '../../maze/types';
import { Button } from '../components/Button';
import { Dropdown, type DropdownOption } from '../components/Dropdown';
import { useT } from '../../i18n';
import { validateTutorialSteps } from '../../utils/tutorialValidator';

const PICKUP_TYPE_OPTIONS: readonly PickupType[] = ['time', 'health', 'key'];
const PICKUP_TYPE_LABEL_KEYS: Record<PickupType, string> = {
  time: 'editor.properties.pickupType.time',
  health: 'editor.properties.pickupType.health',
  key: 'editor.properties.pickupType.key',
};
const PICKUP_TYPE_CODENAMES: Record<PickupType, string> = {
  time: 'P-01',
  health: 'P-02',
  key: 'P-03',
};

// F-2026-06-17-E-M-8: 之前用 'editor.properties.victory.*' 这个不存在的
// key 前缀,渲染时 `t()` 会 console.warn 并原样返回 key 字符串,导致
// 胜利条件 Segmented 控件里出现 "editor.properties.victory.reachExit"
// 这样的 raw key。统一改成 `levels.victory.*`(在 zh.ts / en.ts 已有
// reachExit / timeTrial / survive / caughtByEnemy 四条),并用 Record
// 代替 ternary 链 — TS 编译时强制覆盖全部 4 个 VictoryType,新增值时
// 漏写会立刻报错。
const VICTORY_LABEL_KEYS: Record<VictoryType, string> = {
  'reach-exit': 'levels.victory.reachExit',
  'time-trial': 'levels.victory.timeTrial',
  survive: 'levels.victory.survive',
  'caught-by-enemy': 'levels.victory.caughtByEnemy',
};
const VICTORY_OPTIONS: ReadonlyArray<{ value: VictoryType; labelKey: string }> =
  VICTORY_TYPE_VALUES.map((v) => ({ value: v, labelKey: VICTORY_LABEL_KEYS[v] }));

function Card({
  variant,
  selected,
  title,
  chip,
  defaultCollapsed = false,
  children,
}: {
  variant: 'meta' | 'rules' | 'pickup' | 'enemy' | 'wall';
  selected?: boolean;
  title: string;
  chip?: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div
      className={`editor-card editor-card--${variant}${collapsed ? ' editor-card--collapsed' : ''}${selected ? ' editor-card--selected' : ''}`}
    >
      <div
        className="editor-card__header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
      >
        <span>{title}</span>
        {chip && <span className={`editor-card__chip editor-card__chip--${variant}`}>{chip}</span>}
        <span className="editor-card__chevron" aria-hidden>
          ▾
        </span>
      </div>
      <div className="editor-card__body">{children}</div>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  testId,
  unit,
  t,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  testId?: string;
  unit?: string;
  t: ReturnType<typeof useT>;
}): React.ReactElement {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string): void => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const rounded = Number.isInteger(step) ? Math.floor(n) : Math.round(n * 10) / 10;
    const clamped = Math.max(min, Math.min(max, rounded));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  const dec = (): void => {
    const next = value - step;
    const rounded = Number.isInteger(step) ? Math.floor(next) : Math.round(next * 10) / 10;
    commit(String(Math.max(min, rounded)));
  };
  const inc = (): void => {
    const next = value + step;
    const rounded = Number.isInteger(step) ? Math.floor(next) : Math.round(next * 10) / 10;
    commit(String(Math.min(max, rounded)));
  };

  return (
    <div className="editor-stepper">
      <button
        type="button"
        className="editor-stepper__btn"
        onClick={dec}
        disabled={value <= min}
        aria-label={t('editor.properties.minusAria')}
      >
        −
      </button>
      <input
        className="editor-stepper__input"
        type="number"
        value={draft}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        min={min}
        max={max}
        data-testid={testId}
      />
      <button
        type="button"
        className="editor-stepper__btn"
        onClick={inc}
        disabled={value >= max}
        aria-label={t('editor.properties.plusAria')}
      >
        +
      </button>
      {unit && <span className="editor-stepper__unit">{unit}</span>}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  testIdPrefix: string;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = options.findIndex((o) => o.value === value);
    if (idx < 0) return;
    const option = el.querySelectorAll<HTMLElement>('[data-segmented-option]')[idx];
    if (!option) return;
    const rect = option.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();
    setIndicator({
      left: rect.left - containerRect.left,
      width: rect.width,
    });
  }, [value, options]);

  return (
    <div ref={containerRef} className="editor-segmented" role="radiogroup">
      <span
        className="editor-segmented__indicator"
        aria-hidden
        style={{ left: indicator.left, width: indicator.width }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          data-segmented-option
          data-testid={`${testIdPrefix}-${opt.value}`}
          onClick={() => onChange(opt.value)}
          className={`editor-segmented__option${value === opt.value ? ' editor-segmented__option--active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// F-2026-06-17-E-M-1: ref pattern. The original implementation
// depended on `[value, commit, delay]` so the effect re-scheduled
// every render (commit is an inline arrow in all 7 call sites). The
// ref pattern keeps `commit` out of the dep list (its identity changes
// on every render but its behaviour is stable), so the effect only
// re-schedules on value/delay changes — rapid typing collapses to a
// single debounce per `delay` window.
//
// F-2026-06-15-H-16: also flush a pending commit synchronously on
// unmount. Before this, unmounting (e.g. switching selection to a
// different card, navigating away from the editor) silently dropped
// any debounced update still in flight — the user typed "1.5s" into
// the dwellTime stepper, switched selection, and the value reverted
// to the prior committed value with no error. The isMounted ref
// tracks the difference between an unmount cleanup and a value
// change cleanup; only the former should flush.
//
// F-2026-06-15-M-34: gate the first scheduled fire on hasMountedRef
// flipping to true. The useState initialiser is fed by the same
// source as the debounced value (e.g. `name` is `useState(level.name)`),
// so the very first useEffect tick would have fired `commitRef(initial
// value)` and written a no-op update to the store. Skipping the
// first run keeps the commit queue idle until the user actually
// changes a value.
function useDebouncedCommit<T>(value: T, commit: (v: T) => void, delay: number): void {
  const valueRef = useRef(value);
  const commitRef = useRef(commit);
  const hasMountedRef = useRef(false);
  const pendingRef = useRef(false);
  const isMountedRef = useRef(true);
  valueRef.current = value;
  commitRef.current = commit;
  // Track mounted state via a separate effect so the unmount signal
  // is unambiguous — the inner debounce effect's cleanup runs on
  // both unmount and value change, but we only want to flush in
  // the unmount case.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    pendingRef.current = true;
    const id = window.setTimeout(() => {
      pendingRef.current = false;
      commitRef.current(valueRef.current);
    }, delay);
    return () => {
      window.clearTimeout(id);
      // H-16: only flush on unmount (not on value-change cleanup).
      // A value-change cleanup is followed by a fresh schedule on
      // the next render, so flushing here would defeat the debounce.
      if (pendingRef.current && !isMountedRef.current) {
        pendingRef.current = false;
        commitRef.current(valueRef.current);
      }
    };
    // F-2026-06-15-M-34: re-run on `value` change so subsequent edits
    // (not just the first one) get their own debounce. `commit` is
    // intentionally excluded — it's an inline arrow on every call
    // site and is captured via commitRef.current.
  }, [value, delay]);
}

function LevelMetadataForm({ level }: { level: MazeData }): React.ReactElement {
  const t = useT();
  const updateName = useEditorStore((s) => s.updateName);
  const updateSize = useEditorStore((s) => s.updateSize);
  const updateRule = useEditorStore((s) => s.updateRule);
  const updateMinimapMode = useEditorStore((s) => s.updateMinimapMode);
  const updateMapOpenBehavior = useEditorStore((s) => s.updateMapOpenBehavior);
  const updateParchmentLifecycle = useEditorStore((s) => s.updateParchmentLifecycle);

  const [name, setName] = useState(level.name);
  const [width, setWidth] = useState(level.size.width);
  const [depth, setDepth] = useState(level.size.depth);
  const [initialTime, setInitialTime] = useState(level.rules.initialTime);
  const [maxHealth, setMaxHealth] = useState(level.rules.maxHealth);
  const [timeOnPickup, setTimeOnPickup] = useState(level.rules.timeOnPickup);
  const [victory, setVictory] = useState<VictoryType>(level.rules.victory);
  // F-2026-06-30: P2-16 — three new local mirror states for the
  // minimap / behavior / lifecycle selectors. Default to the
  // engine-pinned defaults when the level omits the field, so a
  // newly-saved level looks the same in the editor regardless of
  // whether the author has touched the field yet.
  const [minimapMode, setMinimapMode] = useState<MinimapMode>(
    level.rules.minimapMode ?? 'top-right',
  );
  const [mapOpenBehavior, setMapOpenBehavior] = useState<MapOpenBehavior>(
    level.rules.mapOpenBehavior ?? 'pause',
  );
  const [parchmentLifecycle, setParchmentLifecycle] = useState<ParchmentLifecycle>(
    level.rules.parchmentLifecycle ?? 'reset-on-death',
  );

  // F-2026-06-30: 'caught-by-enemy' is a P2-11 teaching-only victory
  // path (drives the 哨兵回廊 teaching-03 lesson). Hide the option from
  // the Segmented control whenever the level has no `tutorialSteps` so
  // authors can't accidentally pick "win on death" for a normal level.
  // Teaching-03 itself keeps the option visible because its
  // `tutorialSteps` array is non-empty.
  const isTutorialLevel = (level.tutorialSteps?.length ?? 0) > 0;

  // F-2026-06-17-E-H-1: VICTORY_OPTIONS.map(...) was rebuilt on every
  // render of LevelMetadataForm. The Segmented child has an effect that
  // depends on the `options` reference, so a new array every render
  // meant a fresh getBoundingClientRect() per render — a measurable
  // layout thrash on the 50×50 editor. Memoize on `t` so language
  // switches still produce a fresh options array, but unrelated
  // re-renders (input typing, store selectors firing) keep the same
  // reference and the effect stays quiet.
  const victoryOptions = useMemo(
    () =>
      VICTORY_OPTIONS.filter((o) => isTutorialLevel || o.value !== 'caught-by-enemy').map(
        (o) => ({ value: o.value, label: t(o.labelKey) }),
      ),
    [t, isTutorialLevel],
  );

  // F-2026-06-30: the local `victory` state can still hold
  // 'caught-by-enemy' if the author just removed all tutorial steps
  // (the level previously was a teaching level, now isn't). The
  // filtered `victoryOptions` would no longer include that value, so
  // the Segmented would render with `aria-checked=false` on every
  // option. Fall back to 'reach-exit' whenever the saved value is
  // filtered out — this also keeps the value committed to the store
  // valid for a non-tutorial level.
  useEffect(() => {
    if (!isTutorialLevel && victory === 'caught-by-enemy') {
      setVictory('reach-exit');
    }
  }, [isTutorialLevel, victory]);

  useEffect(() => {
    setName(level.name);
    setWidth(level.size.width);
    setDepth(level.size.depth);
    setInitialTime(level.rules.initialTime);
    setMaxHealth(level.rules.maxHealth);
    setTimeOnPickup(level.rules.timeOnPickup);
    setVictory(level.rules.victory);
    // F-2026-06-30: P2-16 — sync the three new optional fields. The
    // ?? defaults mirror what the engine reads at runtime, so an
    // unset field shows up in the UI as the implicit default rather
    // than an empty selector.
    setMinimapMode(level.rules.minimapMode ?? 'top-right');
    setMapOpenBehavior(level.rules.mapOpenBehavior ?? 'pause');
    setParchmentLifecycle(level.rules.parchmentLifecycle ?? 'reset-on-death');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only sync on level identity change (F4)
  }, [level.id]);

  useDebouncedCommit(name, (v) => updateName(v), 300);
  // F-2026-06-18-CRITICAL: the previous version of this effect was a
  // raw `useEffect(() => setTimeout(updateSize, 300), [width, depth,
  // updateSize])`. That fires on the FIRST render of
  // LevelMetadataForm (which mounts whenever the selection becomes
  // null — e.g. immediately after deleteSelected clears the
  // selection). The setTimeout then unconditionally calls
  // `updateSize(currentW, currentD)` after 300ms. `updateSize`
  // rebuilds the walls array from scratch (all 0s — open floor) and
  // drops any out-of-bounds pickups / enemies. Reproduce: place 18
  // walls → select one → click 删除墙体 → selection becomes null →
  // LevelMetadataForm mounts → 300ms later updateSize wipes the
  // remaining 17 walls. The user reports this as "deleting one wall
  // deletes all walls".
  //
  // The fix gates the commit on an actual size change: only schedule
  // `updateSize` when the local width/depth diverges from the level's
  // current size. On mount both are equal (initialised from
  // `level.size` in the useState above) so no timeout is ever queued.
  // The same check covers the same-sized re-render path, so swapping
  // selection between WallForm and LevelMetadataForm also stays
  // silent. The 300ms debounce keeps rapid stepper clicks from
  // spamming `commitLevel` while the user is dragging.
  const lastCommittedSizeRef = useRef<{ width: number; depth: number }>({
    width: level.size.width,
    depth: level.size.depth,
  });
  // F-2026-06-15-M-35: reset the "last committed size" baseline when
  // the level identity changes (open a different level in the editor).
  // Without this, the new level's saved size is compared against the
  // OLD level's last committed size, and a "no-op" stepper click that
  // matches the new level's size but not the old ref's value would
  // schedule a spurious resize that wipes the new level's walls.
  useEffect(() => {
    lastCommittedSizeRef.current = {
      width: level.size.width,
      depth: level.size.depth,
    };
  }, [level.id]);
  useEffect(() => {
    const target = {
      width: Math.max(1, Math.floor(width)),
      depth: Math.max(1, Math.floor(depth)),
    };
    if (
      target.width === lastCommittedSizeRef.current.width &&
      target.depth === lastCommittedSizeRef.current.depth
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      // Re-check inside the timeout: the user might have reverted the
      // stepper back to the saved size between scheduling and firing.
      if (
        target.width === lastCommittedSizeRef.current.width &&
        target.depth === lastCommittedSizeRef.current.depth
      ) {
        return;
      }
      updateSize(target.width, target.depth);
      lastCommittedSizeRef.current = target;
    }, 300);
    return () => window.clearTimeout(id);
  }, [width, depth, updateSize, level]);
  useDebouncedCommit(initialTime, (v) => updateRule({ initialTime: Math.max(1, Math.floor(v)) }), 300);
  useDebouncedCommit(maxHealth, (v) => updateRule({ maxHealth: Math.max(1, Math.floor(v)) }), 300);
  useDebouncedCommit(timeOnPickup, (v) => updateRule({ timeOnPickup: Math.max(1, Math.floor(v)) }), 300);
  useDebouncedCommit(victory, (v) => {
    if (isVictoryType(v)) updateRule({ victory: v });
  }, 300);
  // F-2026-06-30: P2-16 — three new debounced commits. Each goes
  // through the dedicated action so the editor's type-guard layer
  // (the actions reject unknown values silently) runs before the
  // store sees the value. This is also why we don't need a separate
  // `isMinimapMode` check in the debounced commit: the action does
  // the validation.
  useDebouncedCommit(minimapMode, (v) => updateMinimapMode(v), 300);
  useDebouncedCommit(mapOpenBehavior, (v) => updateMapOpenBehavior(v), 300);
  useDebouncedCommit(parchmentLifecycle, (v) => updateParchmentLifecycle(v), 300);

  return (
    <div data-testid="level-metadata-form" className="editor-properties__form">
      <Card variant="meta" title={t('editor.properties.metaCard')} chip={t('editor.properties.metaChip')}>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.name')}</span>
          <input
            className="editor-properties__name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="meta-name"
          />
        </label>
        <div className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.grid')}</span>
          <div className="editor-properties__row">
            <label className="editor-properties__field">
              <span className="editor-properties__field-label">{t('editor.properties.field.width')}</span>
              <Stepper
                value={width}
                onChange={setWidth}
                min={1}
                max={50}
                testId="meta-width"
                unit={t('editor.properties.unit.cell')}
                t={t}
              />
            </label>
            <label className="editor-properties__field">
              <span className="editor-properties__field-label">{t('editor.properties.field.depth')}</span>
              <Stepper
                value={depth}
                onChange={setDepth}
                min={1}
                max={50}
                testId="meta-depth"
                unit={t('editor.properties.unit.cell')}
                t={t}
              />
            </label>
          </div>
        </div>
      </Card>

      <Card variant="rules" title={t('editor.properties.rulesCard')} chip={t('editor.properties.rulesChip')}>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.initialTime')}</span>
          <Stepper
            value={initialTime}
            onChange={setInitialTime}
            min={0}
            max={999}
            testId="meta-initial-time"
            unit={t('editor.properties.unit.second')}
            t={t}
          />
        </label>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.maxHealth')}</span>
          <Stepper
            value={maxHealth}
            onChange={setMaxHealth}
            min={1}
            max={99}
            testId="meta-max-health"
            unit="♥"
            t={t}
          />
        </label>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.timeOnPickup')}</span>
          <Stepper
            value={timeOnPickup}
            onChange={setTimeOnPickup}
            min={0}
            max={60}
            testId="meta-time-on-pickup"
            unit={t('editor.properties.unit.second')}
            t={t}
          />
        </label>
        <div className="editor-properties__field" data-testid="meta-victory">
          <span className="editor-properties__field-label">{t('editor.properties.field.victory')}</span>
          <Segmented
            options={victoryOptions}
            value={victory}
            onChange={setVictory}
            testIdPrefix="meta-victory"
          />
        </div>
        {/* F-2026-06-30: P2-16 — three-state minimap mode picker.
            Replaces the legacy `hideMinimap: boolean` switch.
            See `MazeData.hideMinimap` for the back-compat migration
            (older levels with `hideMinimap: true` are translated to
            `minimapMode: 'hidden'` by JsonMazeProvider). */}
        <div className="editor-properties__field" data-testid="meta-minimap-mode">
          <span className="editor-properties__field-label">
            {t('editor.properties.field.minimapMode')}
          </span>
          <Segmented<MinimapMode>
            options={MINIMAP_MODE_VALUES.map((v) => ({
              value: v,
              label: t(`editor.properties.minimapMode.${v === 'top-right' ? 'topRight' : v}`),
            }))}
            value={minimapMode}
            onChange={setMinimapMode}
            testIdPrefix="meta-minimap-mode"
          />
        </div>
        {/* F-2026-06-30: P2-16 — two linked switches. Render only
            when minimapMode is parchment so authors don't have to
            look at irrelevant controls for normal levels. The
            state values persist across minimapMode changes (the
            un-filtered useEffect above keeps them), so flipping
            back to parchment preserves the previous choice. */}
        {minimapMode === 'parchment' && (
          <>
            <label
              className="editor-properties__field"
              data-testid="meta-map-open-behavior"
            >
              <span className="editor-properties__field-label">
                {t('editor.properties.field.mapOpenBehavior')}
              </span>
              <Segmented<MapOpenBehavior>
                options={MAP_OPEN_BEHAVIOR_VALUES.map((v) => ({
                  value: v,
                  label: t(`editor.properties.mapOpenBehavior.${v}`),
                }))}
                value={mapOpenBehavior}
                onChange={setMapOpenBehavior}
                testIdPrefix="meta-map-open-behavior"
              />
            </label>
            <label
              className="editor-properties__field"
              data-testid="meta-parchment-lifecycle"
            >
              <span className="editor-properties__field-label">
                {t('editor.properties.field.parchmentLifecycle')}
              </span>
              <Segmented<ParchmentLifecycle>
                options={PARCHMENT_LIFECYCLE_VALUES.map((v) => ({
                  value: v,
                  label: t(
                    `editor.properties.parchmentLifecycle.${
                      v === 'reset-on-death' ? 'resetOnDeath' : v
                    }`,
                  ),
                }))}
                value={parchmentLifecycle}
                onChange={setParchmentLifecycle}
                testIdPrefix="meta-parchment-lifecycle"
              />
            </label>
          </>
        )}
      </Card>

      {/* P2-11: per-level tutorial / HUD fields. Live in their own Card so
          designers can leave them collapsed when editing combat levels.
          P2-13.7: 全部硬编码中文改 i18n 化,跟随系统语言。
          P2-13.x: 教程卡片 UI 改版 —— 顶部 hero 总览 → 三组 toggle row →
          高级 JSON 编辑折叠区(默认收起)。 */}
      <Card variant="meta" title={t('editor.properties.tutorialCard')} chip={t('editor.properties.tutorialChip')}>
        <TutorialCardBody level={level} />
      </Card>
    </div>
  );
}

function BackToLevel(): React.ReactElement {
  const t = useT();
  const clearSelection = useEditorStore((s) => s.clearSelection);
  return (
    <button
      type="button"
      data-testid="back-to-level"
      onClick={clearSelection}
      className="editor-properties__back"
    >
      <span aria-hidden>←</span>
      <span>{t('editor.properties.panelTitle')}</span>
    </button>
  );
}

// F-2026-06-17-M-6: take `pickupId` (primitive) instead of the whole
// `Pickup` object so React.memo can short-circuit re-renders when the
// parent's level array reference changes but the same entity is
// re-selected (the typical scene-editor case). The form looks up the
// entity via selector inside; the `pickupId` prop is stable across
// store updates that don't move the selection.
function PickupFormImpl({ pickupId }: { pickupId: string }): React.ReactElement {
  const t = useT();
  // F-2026-06-17-M-6: lookup primitive projection — keep this selector
  // returning the full Pickup object (not a new {id, type, value} tuple)
  // so referential equality is preserved across re-renders that don't
  // actually mutate the entity. Zustand's default shallow comparison
  // would otherwise see a fresh object on every store update.
  const pickup = useEditorStore((s) => s.level.pickups.find((p) => p.id === pickupId));
  const updatePickup = useEditorStore((s) => s.updatePickup);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  // F-2026-06-17-M-6: lazy initial state from the (possibly-missing)
  // lookup. If the pickup is missing on first render, fall back to
  // harmless defaults; useEffect below will re-sync as soon as the
  // entity appears in the store.
  const [type, setType] = useState<PickupType>(() => pickup?.type ?? 'time');
  const [value, setValue] = useState<number>(() => pickup?.value ?? 0);

  useEffect(() => {
    if (pickup) {
      setType(pickup.type);
      setValue(pickup.value);
    }
  }, [pickup?.id, pickup?.type, pickup?.value]);

  if (!pickup) return <SelectionMissing kind="pickup" />;

  return (
    <div data-testid="pickup-form" className="editor-properties__form">
      <BackToLevel />
      <Card variant="pickup" selected title={t('editor.properties.pickupCard')} chip={pickup.id.slice(0, 8)}>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.type')}</span>
          <Dropdown<PickupType>
            testId="pickup-type"
            ariaLabel={t('editor.properties.field.type')}
            value={type}
            options={PICKUP_TYPE_OPTIONS.map((tp) => ({
              value: tp,
              label: t(PICKUP_TYPE_LABEL_KEYS[tp]),
              codename: PICKUP_TYPE_CODENAMES[tp],
              desc: `(${tp})`,
            }))}
            onChange={(tp) => {
              if (!isPickupType(tp)) return;
              setType(tp);
              updatePickup(pickup.id, { type: tp });
            }}
            optionTestId={(opt) => `pickup-type-${opt.value}`}
          />
        </label>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.value')}</span>
          <Stepper
            value={value}
            onChange={(v) => {
              setValue(v);
              updatePickup(pickup.id, { value: v });
            }}
            min={0}
            max={999}
            testId="pickup-value"
            t={t}
          />
        </label>
        <Button variant="danger" onClick={() => deleteSelected()}>
          {t('editor.properties.deletePickup')}
        </Button>
      </Card>
    </div>
  );
}

const PickupForm = memo(PickupFormImpl);

// F-2026-06-17-M-6: primitive-projection props (`enemyId`) so React.memo
// can skip re-renders when the parent's level array changes but the same
// entity remains selected. Lookup happens via selector; useEffect
// re-syncs local state when the entity mutates in the store.
function EnemyFormImpl({ enemyId }: { enemyId: string }): React.ReactElement {
  const t = useT();
  // F-2026-06-17-M-6: see PickupForm — keep selector returning the
  // existing entity reference (not a fresh tuple) so memo's shallow
  // comparison sees a stable identity.
  const enemy = useEditorStore((s) => s.level.enemies.find((e) => e.id === enemyId));
  // F-P2-9: read `level` so the "+ node" button can compute in-bounds
  // defaults based on the current grid size (used in the onClick below).
  const level = useEditorStore((s) => s.level);
  const updateEnemy = useEditorStore((s) => s.updateEnemy);
  const moveEnemyNode = useEditorStore((s) => s.moveEnemyNode);
  const addEnemyNode = useEditorStore((s) => s.addEnemyNode);
  const removeEnemyNode = useEditorStore((s) => s.removeEnemyNode);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);

  // F-2026-06-17-M-6: lazy initial state with safe defaults; useEffect
  // re-syncs as soon as the entity is available in the store.
  const [dwellTime, setDwellTime] = useState<number>(() => enemy?.dwellTime ?? 0);
  const [fovRange, setFovRange] = useState<number>(() => enemy?.fovRange ?? 3);
  const [fovAngleDeg, setFovAngleDeg] = useState<number>(() => enemy?.fovAngleDeg ?? 60);

  useEffect(() => {
    if (enemy) {
      setDwellTime(enemy.dwellTime ?? 0);
      setFovRange(enemy.fovRange ?? 3);
      setFovAngleDeg(enemy.fovAngleDeg ?? 60);
    }
  }, [enemy?.id, enemy?.dwellTime, enemy?.fovRange, enemy?.fovAngleDeg]);

  useDebouncedCommit(dwellTime, (v) => updateEnemy(enemyId, { dwellTime: Math.max(0, v) }), 300);
  useDebouncedCommit(fovRange, (v) => updateEnemy(enemyId, { fovRange: Math.max(0, v) }), 300);
  useDebouncedCommit(fovAngleDeg, (v) => updateEnemy(enemyId, { fovAngleDeg: Math.max(0, v) }), 300);

  if (!enemy) return <SelectionMissing kind="enemy" />;

  return (
    <div data-testid="enemy-form" className="editor-properties__form">
    <BackToLevel />
    <Card variant="enemy" selected title={t('editor.properties.enemyCard')} chip={enemy.id.slice(0, 8)}>
      <div className="editor-properties__field">
        <span className="editor-properties__field-label">{t('editor.properties.field.spawn')}</span>
        <div className="editor-properties__readonly">
          ({enemy.x}, {enemy.z})
        </div>
      </div>
      <div className="editor-properties__field">
        <span className="editor-properties__field-label">
          {t('editor.properties.pathNodes', { count: enemy.path.length })}
        </span>
        {enemy.path.map((node, i) => (
          <div key={i} className="editor-properties__path-row" data-testid={`enemy-path-node-${i}`}>
            <span style={{ fontSize: 10, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>#{i}</span>
            <input
              type="number"
              min={0}
              value={node.x}
              aria-label={`node-${i}-x`}
              data-testid={`enemy-path-x-${i}`}
              // F-2026-06-16-H-3: guard against non-numeric input. Read
              // `valueAsNumber` (the browser/JSX canonical numeric form)
              // instead of `Number(e.target.value)` — the latter maps an
              // empty string to 0 and would happily accept the user
              // clearing the field as a "0" edit. valueAsNumber is NaN
              // whenever the value isn't a valid number (empty, "abc",
              // "1.5e", …), so the `Number.isFinite` gate correctly drops
              // the keystroke. Without this guard clamp(NaN, lo, hi)
              // returns NaN and poisons the path's collision + render
              // pipeline.
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isFinite(v)) moveEnemyNode(enemy.id, i, v, node.z);
              }}
            />
            <input
              type="number"
              min={0}
              value={node.z}
              aria-label={`node-${i}-z`}
              data-testid={`enemy-path-z-${i}`}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isFinite(v)) moveEnemyNode(enemy.id, i, node.x, v);
              }}
            />
            <button
              type="button"
              onClick={() => removeEnemyNode(enemy.id, i)}
              disabled={enemy.path.length <= 2}
              data-testid={`enemy-path-remove-${i}`}
              className="editor-properties__path-row__remove"
              aria-label={t('editor.properties.removeNodeAria', { index: i })}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          // F-P2-9: default-coord for "+ node" used to be `enemy.x, enemy.z`
          // (the spawn cell), which is always identical to `path[0]` and
          // therefore produced a zero-length path segment — breaking the
          // patrol AI and the SVG marker-end orientation. Compute a
          // sensible default: extend one cell past the current last node
          // along the direction of the last segment. If the extension
          // would land OOB / coincide with the last node, do nothing
          // (silently no-op) rather than falling back to spawn — falling
          // back to spawn re-introduces the same duplicate-node bug we
          // were trying to fix.
          onClick={() => {
            const path = enemy.path;
            const last = path[path.length - 1];
            const prev = path[path.length - 2];
            if (!last || !prev) return;
            const dx = Math.sign(last.x - prev.x);
            const dz = Math.sign(last.z - prev.z);
            const candidate = { x: last.x + dx, z: last.z + dz };
            const w = level.size.width;
            const d = level.size.depth;
            const inBounds =
              candidate.x >= 0 && candidate.x < w && candidate.z >= 0 && candidate.z < d;
            const notOverlap = candidate.x !== last.x || candidate.z !== last.z;
            if (!inBounds || !notOverlap) return;
            addEnemyNode(enemy.id, candidate.x, candidate.z);
          }}
          data-testid="enemy-path-add"
          className="editor-properties__path-add"
        >
          {t('editor.properties.addNode')}
        </button>
      </div>
      <label className="editor-properties__field">
        <span className="editor-properties__field-label">{t('editor.properties.field.dwellTime')}</span>
        <Stepper
          value={dwellTime}
          onChange={setDwellTime}
          min={0}
          max={60}
          step={0.5}
          testId="enemy-dwell"
          unit={t('editor.properties.unit.second')}
          t={t}
        />
      </label>
      <label className="editor-properties__field">
        <span className="editor-properties__field-label">{t('editor.properties.field.viewRange')}</span>
        <Stepper
          value={fovRange}
          onChange={setFovRange}
          min={0}
          max={20}
          testId="enemy-fov-range"
          unit={t('editor.properties.unit.cell')}
          t={t}
        />
      </label>
      <label className="editor-properties__field">
        <span className="editor-properties__field-label">{t('editor.properties.field.viewAngle')}</span>
        <Stepper
          value={fovAngleDeg}
          onChange={setFovAngleDeg}
          min={0}
          max={360}
          testId="enemy-fov-angle"
          unit="°"
          t={t}
        />
      </label>
      <Button variant="danger" onClick={() => deleteSelected()}>
        {t('editor.properties.deleteEnemy')}
      </Button>
    </Card>
    </div>
  );
}

const EnemyForm = memo(EnemyFormImpl);

// F-2026-06-17-M-6: WallForm already takes primitive {x, z} props — wrap
// with React.memo to short-circuit re-renders when an unrelated store
// update fires (e.g. dirty flag toggle).
function WallFormImpl({ x, z }: { x: number; z: number }): React.ReactElement {
  const t = useT();
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  return (
    <div data-testid="wall-form" className="editor-properties__form">
      <BackToLevel />
      <Card variant="wall" selected title={t('editor.properties.wallCard')} chip={`${x},${z}`}>
        <div className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.coord')}</span>
          <div className="editor-properties__readonly">
            ({x}, {z})
          </div>
        </div>
        <Button variant="danger" onClick={() => deleteSelected()}>
          {t('editor.properties.deleteWall')}
        </Button>
      </Card>
    </div>
  );
}

const WallForm = memo(WallFormImpl);

type RenderBodyArgs = {
  selection: ReturnType<typeof useEditorStore.getState>['selection'];
  level: MazeData;
};
function renderBody({ selection, level }: RenderBodyArgs): React.ReactNode {
  if (selection === null) return <LevelMetadataForm level={level} />;
  if (selection.kind === 'pickup') {
    // F-2026-06-17-M-6: pass `pickupId` (primitive) instead of the entity
    // object so React.memo can skip re-renders when the level array
    // reference changes but the same pickup is re-selected. The form
    // looks up the entity via selector inside.
    return <PickupForm pickupId={selection.id} />;
  }
  if (selection.kind === 'enemy') {
    // F-2026-06-17-M-6: same primitive-projection rationale as PickupForm.
    return <EnemyForm enemyId={selection.id} />;
  }
  if (selection.kind === 'wall') {
    return <WallForm x={selection.x} z={selection.z} />;
  }
  // F-2026-06-16-M-5: exhaustiveness check. If a new EditorSelection
  // variant is added (e.g. start-cell selection) without a branch
  // above, the `never` assignment fails to compile, catching the
  // missing branch at build time. The previous fallthrough returned
  // `WallForm` with `selection.x` / `.z` (which would be `undefined`
  // for a missing variant) and silently rendered a broken card.
  const _exhaustive: never = selection;
  throw new Error(`renderBody: unhandled selection kind ${String(_exhaustive)}`);
}

export function EditorPropertiesPanel(): React.ReactElement {
  const level = useEditorStore((s) => s.level);
  const selection = useEditorStore((s) => s.selection);

  return (
    <aside data-testid="editor-properties-panel" className="editor-properties">
      {renderBody({ selection, level })}
    </aside>
  );
}

function SelectionMissing({ kind }: { kind: 'pickup' | 'enemy' }): React.ReactElement {
  const t = useT();
  return (
    <div className="editor-properties__empty">
      {t('editor.properties.selectionMissing', {
        thing: kind === 'pickup'
          ? t('editor.properties.selection.pickup')
          : t('editor.properties.selection.enemy'),
      })}
    </div>
  );
}

// ─────────────────── P2-13.x: 教程 / HUD 卡片改版 ───────────────────
//
// 结构三段式:
//   1) hero     —— 教学状态总览(开关 + 当前 step 数 / 状态)
//   2) rows     —— 三组 toggle row, 每一行 = 标题 + 描述 + 控件
//                    · 隐藏 minimap          → 自定义 Switch
//                    · 敌人追击速度覆盖       → Dropdown (继承/简单/中等/困难)
//                    · 必须收集全部拾取       → 自定义 Switch
//   3) advanced —— JSON 文本编辑,默认收起, 避免一上来就被裸露 JSON 劝退
//
// 数据流:全部走 useEditorStore 的 setter,跟原 inline 版本语义一致;
// 旧 testid (meta-hide-minimap / meta-enemy-aggression / meta-require-all-pickups
// / meta-tutorial-steps) 全部保留以不破坏现有 component 测试。
function TutorialCardBody({ level }: { level: MazeData }): React.ReactElement {
  const t = useT();
  const setHideMinimap = useEditorStore((s) => s.setHideMinimap);
  const setEnemyAggression = useEditorStore((s) => s.setEnemyAggression);
  const setRequireAllPickups = useEditorStore((s) => s.setRequireAllPickups);
  const setTutorialSteps = useEditorStore((s) => s.setTutorialSteps);

  const aggressionOptions: ReadonlyArray<DropdownOption<'' | 'easy' | 'medium' | 'hard'>> = [
    { value: '',     label: t('editor.properties.tutorial.aggression.inherit') },
    { value: 'easy',   label: t('editor.properties.tutorial.aggression.easy') },
    { value: 'medium', label: t('editor.properties.tutorial.aggression.medium') },
    { value: 'hard',   label: t('editor.properties.tutorial.aggression.hard') },
  ];

  const stepCount = level.tutorialSteps?.length ?? 0;
  const isOn = stepCount > 0;

  return (
    <div className="editor-tutorial">
      <div className="editor-tutorial__hero">
        <span className="editor-tutorial__hero-icon" aria-hidden>?</span>
        <div className="editor-tutorial__hero-body">
          <span className="editor-tutorial__hero-title">
            {isOn
              ? t('editor.properties.tutorial.hero.on', { count: stepCount })
              : t('editor.properties.tutorial.hero.off')}
          </span>
          <span className="editor-tutorial__hero-sub">
            {t('editor.properties.tutorial.hero.sub')}
          </span>
        </div>
      </div>

      <div className="editor-tutorial__rows">
        <div className="editor-tutorial__row">
          <div className="editor-tutorial__row-body">
            <span className="editor-tutorial__row-label">
              <span className="editor-tutorial__row-icon" aria-hidden>◫</span>
              {t('editor.properties.tutorial.hideMinimap')}
            </span>
            <span className="editor-tutorial__row-desc">
              {t('editor.properties.tutorial.hideMinimapDesc')}
            </span>
          </div>
          <div className="editor-tutorial__row-control">
            <label className="editor-tutorial__switch" aria-label={t('editor.properties.tutorial.hideMinimap')}>
              <input
                type="checkbox"
                data-testid="meta-hide-minimap"
                // F-2026-06-30: P2-16 — read the (migrated) modern
                // field instead of the deprecated top-level boolean.
                // `level.hideMinimap` is no longer round-tripped by
                // JsonMazeProvider (it gets translated to
                // `rules.minimapMode`), so this is the only way to
                // keep the toggle in sync with what the engine sees.
                checked={level.rules.minimapMode === 'hidden'}
                onChange={(e) => setHideMinimap(e.target.checked)}
              />
              <span className="editor-tutorial__switch__track" />
              <span className="editor-tutorial__switch__knob" />
            </label>
          </div>
        </div>

        <div className="editor-tutorial__row">
          <div className="editor-tutorial__row-body">
            <span className="editor-tutorial__row-label">
              <span className="editor-tutorial__row-icon" aria-hidden>◉</span>
              {t('editor.properties.tutorial.enemyAggression')}
            </span>
            <span className="editor-tutorial__row-desc">
              {t('editor.properties.tutorial.enemyAggressionDesc')}
            </span>
          </div>
          <div className="editor-tutorial__row-control" style={{ minWidth: 140 }}>
            <Dropdown<'' | 'easy' | 'medium' | 'hard'>
              testId="meta-enemy-aggression"
              ariaLabel={t('editor.properties.tutorial.enemyAggression')}
              value={level.rules.enemyAggression ?? ''}
              options={aggressionOptions}
              onChange={(v) => setEnemyAggression(v === '' ? null : v)}
            />
          </div>
        </div>

        <div className="editor-tutorial__row">
          <div className="editor-tutorial__row-body">
            <span className="editor-tutorial__row-label">
              <span className="editor-tutorial__row-icon" aria-hidden>✦</span>
              {t('editor.properties.tutorial.requireAllPickups')}
            </span>
            <span className="editor-tutorial__row-desc">
              {t('editor.properties.tutorial.requireAllPickupsDesc')}
            </span>
          </div>
          <div className="editor-tutorial__row-control">
            <label className="editor-tutorial__switch" aria-label={t('editor.properties.tutorial.requireAllPickups')}>
              <input
                type="checkbox"
                data-testid="meta-require-all-pickups"
                checked={!!level.rules.requireAllPickups}
                onChange={(e) => setRequireAllPickups(e.target.checked)}
              />
              <span className="editor-tutorial__switch__track" />
              <span className="editor-tutorial__switch__knob" />
            </label>
          </div>
        </div>
      </div>

      <TutorialAdvancedSteps
        initialJson={level.tutorialSteps ? JSON.stringify(level.tutorialSteps, null, 2) : ''}
        onCommit={(steps) => setTutorialSteps(steps)}
      />
    </div>
  );
}

// 高级 JSON 编辑折叠区:默认收起,点 ▶ 展开,展开后 textarea 接受
// onBlur 时的 validate + commit。状态在本地 useState 跟踪 raw 文本与
// 上次 commit 的状态(ok / error / pristine)。
function TutorialAdvancedSteps({
  initialJson,
  onCommit,
}: {
  initialJson: string;
  onCommit: (steps: ReturnType<typeof useEditorStore.getState>['level']['tutorialSteps']) => void;
}): React.ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(initialJson);
  const [status, setStatus] = useState<'pristine' | 'ok' | 'error'>('pristine');

  // 同步外部变化(切关卡时)
  useEffect(() => {
    setRaw(initialJson);
    setStatus('pristine');
  }, [initialJson]);

  const commit = (): void => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onCommit(undefined);
      setStatus('ok');
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      const validation = validateTutorialSteps(parsed);
      if (validation.ok) {
        onCommit(validation.steps);
        setStatus('ok');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  // F-2026-06-17-E-M-4: wrap the JSON parse in useMemo so it doesn't
  // re-run on every keystroke. Previously each `setRaw` re-rendered
  // the IIFE which did a fresh `JSON.parse` + `.slice(0, 3).map` even
  // when `status === 'pristine'` (the parse was gated by status but the
  // function call itself still happened on every render).
  const stepList = useMemo(() => {
    if (status !== 'ok') return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 3).map((s: { title?: string; trigger?: string }, i: number) => ({
          index: i,
          title: typeof s?.title === 'string' ? s.title : `Step ${i + 1}`,
          trigger: typeof s?.trigger === 'string' ? s.trigger : '',
        }));
      }
    } catch { /* ignore */ }
    return null;
  }, [raw, status]);

  return (
    <div className={`editor-tutorial__advanced${open ? ' editor-tutorial__advanced--open' : ''}`}>
      <button
        type="button"
        className="editor-tutorial__advanced-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="meta-tutorial-steps-toggle"
      >
        <span>{t('editor.properties.tutorial.advancedLabel')}</span>
        <span className="editor-tutorial__advanced-caret" aria-hidden>▸</span>
      </button>
      <div className="editor-tutorial__advanced-body">
        <div className="editor-tutorial__advanced-hint">
          {t('editor.properties.tutorial.advancedHint')}
        </div>
        <textarea
          data-testid="meta-tutorial-steps"
          rows={6}
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setStatus('pristine'); }}
          onBlur={commit}
          spellCheck={false}
        />
        <span
          className={
            status === 'error'
              ? 'editor-tutorial__advanced-status editor-tutorial__advanced-status--error'
              : status === 'ok'
                ? 'editor-tutorial__advanced-status editor-tutorial__advanced-status--ok'
                : 'editor-tutorial__advanced-status'
          }
          data-testid="meta-tutorial-steps-status"
        >
          {status === 'error'
            ? t('editor.properties.tutorial.advancedStatusError')
            : status === 'ok'
              ? t('editor.properties.tutorial.advancedStatusOk')
              : t('editor.properties.tutorial.advancedStatusIdle')}
        </span>
        {open && stepList && stepList.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {stepList.map((s) => (
              <div className="editor-tutorial__step-row" key={s.index}>
                <span className="editor-tutorial__step-row__no editor-tutorial__step-row__no--current">
                  {s.index + 1}
                </span>
                <div className="editor-tutorial__step-row__body">
                  <span>{s.title}</span>
                  {s.trigger && <span className="editor-tutorial__step-row__meta">{s.trigger}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}