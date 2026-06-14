import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { EnemySpawn, MazeData, Pickup, PickupType, VictoryType } from '../../maze/types';
import { isPickupType, isVictoryType, VICTORY_TYPE_VALUES } from '../../maze/types';
import { Button } from '../components/Button';

const PICKUP_TYPE_OPTIONS: readonly PickupType[] = ['time', 'health', 'key'];
const PICKUP_TYPE_LABEL: Record<PickupType, string> = {
  time: '时间',
  health: '生命',
  key: '钥匙',
};

const VICTORY_OPTIONS: ReadonlyArray<{ value: VictoryType; label: string }> =
  VICTORY_TYPE_VALUES.map((v) => ({
    value: v,
    label: v === 'reach-exit' ? '到达出口' : v === 'time-trial' ? '限时挑战' : '存活模式',
  }));

// ---------------------------------------------------------------------------
// Collapsible card primitive
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Number stepper (atomic decrement/increment + direct input)
// ---------------------------------------------------------------------------

function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  testId,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  testId?: string;
  unit?: string;
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
    // Floor only when the step is integer; otherwise round to one decimal
    // place so a 0.5-step preserves fractional values like 2.5.
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
        aria-label="减小"
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
        aria-label="增大"
      >
        +
      </button>
      {unit && <span className="editor-stepper__unit">{unit}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control (radio group with sliding indicator)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hook: debounce a value; `commit` runs after `delay` ms of no updates.
// Used so a typing burst (e.g. "12" in a number field) produces one
// store dispatch rather than two.
// ---------------------------------------------------------------------------
function useDebouncedCommit<T>(value: T, commit: (v: T) => void, delay: number): void {
  useEffect(() => {
    const id = window.setTimeout(() => commit(value), delay);
    return () => window.clearTimeout(id);
  }, [value, commit, delay]);
}

// ---------------------------------------------------------------------------
// Level metadata form (selection === null)
// ---------------------------------------------------------------------------
function LevelMetadataForm({ level }: { level: MazeData }): React.ReactElement {
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
  useDebouncedCommit(initialTime, (v) => updateRule({ initialTime: Math.max(0, Math.floor(v)) }), 300);
  useDebouncedCommit(maxHealth, (v) => updateRule({ maxHealth: Math.max(1, Math.floor(v)) }), 300);
  useDebouncedCommit(timeOnPickup, (v) => updateRule({ timeOnPickup: Math.max(0, Math.floor(v)) }), 300);
  useDebouncedCommit(victory, (v) => {
    if (isVictoryType(v)) updateRule({ victory: v });
  }, 300);

  return (
    <div data-testid="level-metadata-form">
      <Card variant="meta" title="关卡元数据" chip="META">
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">名称</span>
          <input
            className="editor-properties__name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="meta-name"
          />
        </label>
        <div className="editor-properties__field">
          <span className="editor-properties__field-label">网格尺寸</span>
          <div className="editor-properties__row">
            <label className="editor-properties__field">
              <span className="editor-properties__field-label">宽 W</span>
              <Stepper
                value={width}
                onChange={setWidth}
                min={1}
                max={50}
                testId="meta-width"
                unit="格"
              />
            </label>
            <label className="editor-properties__field">
              <span className="editor-properties__field-label">深 D</span>
              <Stepper
                value={depth}
                onChange={setDepth}
                min={1}
                max={50}
                testId="meta-depth"
                unit="格"
              />
            </label>
          </div>
        </div>
      </Card>

      <Card variant="rules" title="规则" chip="RULES">
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">初始时间</span>
          <Stepper
            value={initialTime}
            onChange={setInitialTime}
            min={0}
            max={999}
            testId="meta-initial-time"
            unit="秒"
          />
        </label>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">最大生命</span>
          <Stepper
            value={maxHealth}
            onChange={setMaxHealth}
            min={1}
            max={99}
            testId="meta-max-health"
            unit="♥"
          />
        </label>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">拾取 +时间</span>
          <Stepper
            value={timeOnPickup}
            onChange={setTimeOnPickup}
            min={0}
            max={60}
            testId="meta-time-on-pickup"
            unit="秒"
          />
        </label>
        <div className="editor-properties__field" data-testid="meta-victory">
          <span className="editor-properties__field-label">胜利条件</span>
          <Segmented
            options={VICTORY_OPTIONS}
            value={victory}
            onChange={setVictory}
            testIdPrefix="meta-victory"
          />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pickup form (selection.kind === 'pickup')
// ---------------------------------------------------------------------------
function PickupForm({ pickup }: { pickup: Pickup }): React.ReactElement {
  const updatePickup = useEditorStore((s) => s.updatePickup);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const [type, setType] = useState<PickupType>(pickup.type);
  const [value, setValue] = useState(pickup.value);

  useEffect(() => {
    setType(pickup.type);
    setValue(pickup.value);
  }, [pickup.id, pickup.type, pickup.value]);

  return (
    <div data-testid="pickup-form">
      <Card variant="pickup" selected title="拾取物" chip={pickup.id.slice(0, 8)}>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">类型</span>
          <select
            className="editor-properties__select"
            value={type}
            onChange={(e) => {
              const t = e.target.value;
              if (!isPickupType(t)) return;
              setType(t);
              updatePickup(pickup.id, { type: t });
            }}
            data-testid="pickup-type"
          >
            {PICKUP_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {PICKUP_TYPE_LABEL[t]} ({t})
              </option>
            ))}
          </select>
        </label>
        <label className="editor-properties__field">
          <span className="editor-properties__field-label">数值</span>
          <Stepper
            value={value}
            onChange={(v) => {
              setValue(v);
              updatePickup(pickup.id, { value: v });
            }}
            min={0}
            max={999}
            testId="pickup-value"
          />
        </label>
        <Button variant="danger" onClick={() => deleteSelected()}>
          删除拾取物
        </Button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enemy form (selection.kind === 'enemy')
// ---------------------------------------------------------------------------
function EnemyForm({ enemy }: { enemy: EnemySpawn }): React.ReactElement {
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
    <div data-testid="enemy-form">
    <Card variant="enemy" selected title="敌人" chip={enemy.id.slice(0, 8)}>
      <div className="editor-properties__field">
        <span className="editor-properties__field-label">出生点</span>
        <div className="editor-properties__readonly">
          ({enemy.x}, {enemy.z})
        </div>
      </div>
      <div className="editor-properties__field">
        <span className="editor-properties__field-label">
          巡逻路径 · {enemy.path.length} 节点
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
              onChange={(e) => moveEnemyNode(enemy.id, i, Number(e.target.value), node.z)}
            />
            <input
              type="number"
              min={0}
              value={node.z}
              aria-label={`node-${i}-z`}
              data-testid={`enemy-path-z-${i}`}
              onChange={(e) => moveEnemyNode(enemy.id, i, node.x, Number(e.target.value))}
            />
            <button
              type="button"
              onClick={() => removeEnemyNode(enemy.id, i)}
              disabled={enemy.path.length <= 2}
              data-testid={`enemy-path-remove-${i}`}
              className="editor-properties__path-row__remove"
              aria-label={`移除节点 ${i}`}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => addEnemyNode(enemy.id, enemy.x, enemy.z)}
          data-testid="enemy-path-add"
          className="editor-properties__path-add"
        >
          + 添加节点
        </button>
      </div>
      <label className="editor-properties__field">
        <span className="editor-properties__field-label">停留时间</span>
        <Stepper
          value={dwellTime}
          onChange={setDwellTime}
          min={0}
          max={60}
          step={0.5}
          testId="enemy-dwell"
          unit="秒"
        />
      </label>
      <label className="editor-properties__field">
        <span className="editor-properties__field-label">视野范围</span>
        <Stepper
          value={fovRange}
          onChange={setFovRange}
          min={0}
          max={20}
          testId="enemy-fov-range"
          unit="格"
        />
      </label>
      <label className="editor-properties__field">
        <span className="editor-properties__field-label">视野角度</span>
        <Stepper
          value={fovAngleDeg}
          onChange={setFovAngleDeg}
          min={0}
          max={360}
          testId="enemy-fov-angle"
          unit="°"
        />
      </label>
      <Button variant="danger" onClick={() => deleteSelected()}>
        删除敌人
      </Button>
    </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wall form (selection.kind === 'wall')
// ---------------------------------------------------------------------------
function WallForm({ x, z }: { x: number; z: number }): React.ReactElement {
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  return (
    <div data-testid="wall-form">
      <Card variant="wall" selected title="墙体" chip={`${x},${z}`}>
        <div className="editor-properties__field">
          <span className="editor-properties__field-label">坐标</span>
          <div className="editor-properties__readonly">
            ({x}, {z})
          </div>
        </div>
        <Button variant="danger" onClick={() => deleteSelected()}>
          删除墙体
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
  return <WallForm x={selection.x} z={selection.z} />;
}

// ---------------------------------------------------------------------------
// Top-level panel: dispatches to the per-selection sub-form.
// ---------------------------------------------------------------------------
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
  return (
    <div className="editor-properties__empty">
      选中的{kind === 'pickup' ? '拾取物' : '敌人'}已不存在。
    </div>
  );
}
