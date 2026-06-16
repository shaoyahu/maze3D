import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { EnemySpawn, MazeData, Pickup, PickupType, VictoryType } from '../../maze/types';
import { isPickupType, isVictoryType, VICTORY_TYPE_VALUES } from '../../maze/types';
import { Button } from '../components/Button';
import { useT } from '../../i18n';
import { validateTutorialSteps } from '../../utils/tutorialValidator';

const PICKUP_TYPE_OPTIONS: readonly PickupType[] = ['time', 'health', 'key'];
const PICKUP_TYPE_LABEL_KEYS: Record<PickupType, string> = {
  time: 'editor.properties.pickupType.time',
  health: 'editor.properties.pickupType.health',
  key: 'editor.properties.pickupType.key',
};

const VICTORY_OPTIONS: ReadonlyArray<{ value: VictoryType; labelKey: string }> =
  VICTORY_TYPE_VALUES.map((v) => ({
    value: v,
    labelKey: v === 'reach-exit'
      ? 'editor.properties.victory.reachExit'
      : v === 'time-trial'
        ? 'editor.properties.victory.timeTrial'
        : 'editor.properties.victory.survive',
  }));

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

function useDebouncedCommit<T>(value: T, commit: (v: T) => void, delay: number): void {
  useEffect(() => {
    const id = window.setTimeout(() => commit(value), delay);
    return () => window.clearTimeout(id);
  }, [value, commit, delay]);
}

function LevelMetadataForm({ level }: { level: MazeData }): React.ReactElement {
  const t = useT();
  const updateName = useEditorStore((s) => s.updateName);
  const updateSize = useEditorStore((s) => s.updateSize);
  const updateRule = useEditorStore((s) => s.updateRule);

  const [name, setName] = useState(level.name);
  const [width, setWidth] = useState(level.size.width);
  const [depth, setDepth] = useState(level.size.depth);
  const [initialTime, setInitialTime] = useState(level.rules.initialTime);
  const [maxHealth, setMaxHealth] = useState(level.rules.maxHealth);
  const [timeOnPickup, setTimeOnPickup] = useState(level.rules.timeOnPickup);
  const [victory, setVictory] = useState<VictoryType>(level.rules.victory);

  useEffect(() => {
    setName(level.name);
    setWidth(level.size.width);
    setDepth(level.size.depth);
    setInitialTime(level.rules.initialTime);
    setMaxHealth(level.rules.maxHealth);
    setTimeOnPickup(level.rules.timeOnPickup);
    setVictory(level.rules.victory);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only sync on level identity change (F4)
  }, [level.id]);

  useDebouncedCommit(name, (v) => updateName(v), 300);
  useEffect(() => {
    const id = window.setTimeout(() => {
      updateSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(depth)));
    }, 300);
    return () => window.clearTimeout(id);
  }, [width, depth, updateSize]);
  useDebouncedCommit(initialTime, (v) => updateRule({ initialTime: Math.max(1, Math.floor(v)) }), 300);
  useDebouncedCommit(maxHealth, (v) => updateRule({ maxHealth: Math.max(1, Math.floor(v)) }), 300);
  useDebouncedCommit(timeOnPickup, (v) => updateRule({ timeOnPickup: Math.max(1, Math.floor(v)) }), 300);
  useDebouncedCommit(victory, (v) => {
    if (isVictoryType(v)) updateRule({ victory: v });
  }, 300);

  return (
    <div data-testid="level-metadata-form">
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
            options={VICTORY_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            value={victory}
            onChange={setVictory}
            testIdPrefix="meta-victory"
          />
        </div>
      </Card>

      {/* P2-11: per-level tutorial / HUD fields. Live in their own Card so
          designers can leave them collapsed when editing combat levels. */}
      <Card variant="meta" title="教程 / HUD (P2-11)" chip="tutorial">
        <label className="editor-properties__field">
          <input
            type="checkbox"
            data-testid="meta-hide-minimap"
            checked={!!level.hideMinimap}
            onChange={(e) => useEditorStore.getState().setHideMinimap(e.target.checked)}
          />
          <span className="editor-properties__field-label">隐藏 Minimap</span>
        </label>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">敌人追击速度覆盖</span>
          <select
            data-testid="meta-enemy-aggression"
            value={level.rules.enemyAggression ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              useEditorStore.getState().setEnemyAggression(
                v === '' ? null : (v as 'easy' | 'medium' | 'hard'),
              );
            }}
          >
            <option value="">继承全局设置</option>
            <option value="easy">简单 (1.2x)</option>
            <option value="medium">中等 (1.5x)</option>
            <option value="hard">困难 (1.8x)</option>
          </select>
        </label>
        <label className="editor-properties__field">
          <input
            type="checkbox"
            data-testid="meta-require-all-pickups"
            checked={!!level.rules.requireAllPickups}
            onChange={(e) => useEditorStore.getState().setRequireAllPickups(e.target.checked)}
          />
          <span className="editor-properties__field-label">必须收集全部拾取</span>
        </label>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">教学步骤 (JSON)</span>
          <textarea
            data-testid="meta-tutorial-steps"
            rows={4}
            defaultValue={level.tutorialSteps ? JSON.stringify(level.tutorialSteps, null, 2) : ''}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                useEditorStore.getState().setTutorialSteps(undefined);
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                const validation = validateTutorialSteps(parsed);
                if (validation.ok) {
                  useEditorStore.getState().setTutorialSteps(validation.steps);
                }
              } catch {
                // Invalid JSON — silently keep the text in the textarea so
                // the user can fix it. No store mutation.
              }
            }}
          />
        </label>
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

function PickupForm({ pickup }: { pickup: Pickup }): React.ReactElement {
  const t = useT();
  const updatePickup = useEditorStore((s) => s.updatePickup);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const [type, setType] = useState<PickupType>(pickup.type);
  const [value, setValue] = useState(pickup.value);

  useEffect(() => {
    setType(pickup.type);
    setValue(pickup.value);
  }, [pickup.id, pickup.type, pickup.value]);

  return (
    <div data-testid="pickup-form" className="editor-properties__form">
      <BackToLevel />
      <Card variant="pickup" selected title={t('editor.properties.pickupCard')} chip={pickup.id.slice(0, 8)}>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">{t('editor.properties.field.type')}</span>
          <select
            className="editor-properties__select"
            value={type}
            onChange={(e) => {
              const tp = e.target.value;
              if (!isPickupType(tp)) return;
              setType(tp);
              updatePickup(pickup.id, { type: tp });
            }}
            data-testid="pickup-type"
          >
            {PICKUP_TYPE_OPTIONS.map((tp) => (
              <option key={tp} value={tp}>
                {t(PICKUP_TYPE_LABEL_KEYS[tp])} ({tp})
              </option>
            ))}
          </select>
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

function EnemyForm({ enemy }: { enemy: EnemySpawn }): React.ReactElement {
  const t = useT();
  // F-P2-9: read `level` so the "+ node" button can compute in-bounds
  // defaults based on the current grid size (used in the onClick below).
  const level = useEditorStore((s) => s.level);
  const updateEnemy = useEditorStore((s) => s.updateEnemy);
  const moveEnemyNode = useEditorStore((s) => s.moveEnemyNode);
  const addEnemyNode = useEditorStore((s) => s.addEnemyNode);
  const removeEnemyNode = useEditorStore((s) => s.removeEnemyNode);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);

  const [dwellTime, setDwellTime] = useState(enemy.dwellTime ?? 0);
  const [fovRange, setFovRange] = useState(enemy.fovRange ?? 3);
  const [fovAngleDeg, setFovAngleDeg] = useState(enemy.fovAngleDeg ?? 60);

  useEffect(() => {
    setDwellTime(enemy.dwellTime ?? 0);
    setFovRange(enemy.fovRange ?? 3);
    setFovAngleDeg(enemy.fovAngleDeg ?? 60);
  }, [enemy.id, enemy.dwellTime, enemy.fovRange, enemy.fovAngleDeg]);

  useDebouncedCommit(dwellTime, (v) => updateEnemy(enemy.id, { dwellTime: Math.max(0, v) }), 300);
  useDebouncedCommit(fovRange, (v) => updateEnemy(enemy.id, { fovRange: Math.max(0, v) }), 300);
  useDebouncedCommit(fovAngleDeg, (v) => updateEnemy(enemy.id, { fovAngleDeg: Math.max(0, v) }), 300);

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

function WallForm({ x, z }: { x: number; z: number }): React.ReactElement {
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

type RenderBodyArgs = {
  selection: ReturnType<typeof useEditorStore.getState>['selection'];
  level: MazeData;
};
function renderBody({ selection, level }: RenderBodyArgs): React.ReactNode {
  if (selection === null) return <LevelMetadataForm level={level} />;
  if (selection.kind === 'pickup') {
    const pickup = level.pickups.find((p) => p.id === selection.id);
    return pickup ? <PickupForm pickup={pickup} /> : <SelectionMissing kind="pickup" />;
  }
  if (selection.kind === 'enemy') {
    const enemy = level.enemies.find((e) => e.id === selection.id);
    return enemy ? <EnemyForm enemy={enemy} /> : <SelectionMissing kind="enemy" />;
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