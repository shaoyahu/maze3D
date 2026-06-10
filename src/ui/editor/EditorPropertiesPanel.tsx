import { useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { EnemySpawn, LevelRules, MazeData, Pickup, PickupType } from '../../maze/types';
import { Button } from '../components/Button';

const PICKUP_TYPE_OPTIONS: readonly PickupType[] = ['time', 'health', 'key'];
const PICKUP_TYPE_LABEL: Record<PickupType, string> = {
  time: '时间',
  health: '生命',
  key: '钥匙',
};
const VICTORY_OPTIONS = [
  { value: 'reach-exit', label: '到达出口' },
  { value: 'time-trial', label: '限时挑战' },
  { value: 'survive', label: '存活模式' },
] as const;

const PANEL_STYLE = {
  width: 320,
  flexShrink: 0,
  borderLeft: '1px solid var(--border)',
  background: 'var(--panel)',
  padding: 12,
  overflowY: 'auto' as const,
  fontSize: 13,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 10,
};

const SECTION_TITLE = { fontSize: 12, fontWeight: 600, opacity: 0.85, marginBottom: 4 };
const FIELD = { display: 'flex', flexDirection: 'column' as const, gap: 3 };
const LABEL = { fontSize: 11, opacity: 0.75 };
const INPUT = {
  padding: '4px 6px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--fg)',
  fontSize: 13,
};

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
function LevelMetadataForm({ level }: { level: MazeData }) {
  const updateName = useEditorStore((s) => s.updateName);
  const updateSize = useEditorStore((s) => s.updateSize);
  const updateRule = useEditorStore((s) => s.updateRule);

  const [name, setName] = useState(level.name);
  const [width, setWidth] = useState(level.size.width);
  const [depth, setDepth] = useState(level.size.depth);
  const [initialTime, setInitialTime] = useState(level.rules.initialTime);
  const [maxHealth, setMaxHealth] = useState(level.rules.maxHealth);
  const [timeOnPickup, setTimeOnPickup] = useState(level.rules.timeOnPickup);
  const [victory, setVictory] = useState(level.rules.victory);

  // Re-sync local state when the store's level identity changes (e.g.
  // `newLevel` was called) so the form shows the new values.
  useEffect(() => {
    setName(level.name);
    setWidth(level.size.width);
    setDepth(level.size.depth);
    setInitialTime(level.rules.initialTime);
    setMaxHealth(level.rules.maxHealth);
    setTimeOnPickup(level.rules.timeOnPickup);
    setVictory(level.rules.victory);
  }, [level.id, level.name, level.size.width, level.size.depth, level.rules]);

  // Read sibling values from the store at fire time, not from the closure:
  // each debounced commit is a separate useEffect, so captures of
  // `level.size.depth` (from the width hook) and `level.size.width` (from
  // the depth hook) would race and clobber whichever field the user edited
  // second.
  useDebouncedCommit(name, (v) => updateName(v), 300);
  useDebouncedCommit(width, (v) => {
    const { depth: d } = useEditorStore.getState().level.size;
    updateSize(Math.max(1, Math.floor(v)), d);
  }, 300);
  useDebouncedCommit(depth, (v) => {
    const { width: w } = useEditorStore.getState().level.size;
    updateSize(w, Math.max(1, Math.floor(v)));
  }, 300);
  useDebouncedCommit(initialTime, (v) => updateRule({ initialTime: Math.max(0, Math.floor(v)) }), 300);
  useDebouncedCommit(maxHealth, (v) => updateRule({ maxHealth: Math.max(1, Math.floor(v)) }), 300);
  useDebouncedCommit(timeOnPickup, (v) => updateRule({ timeOnPickup: Math.max(0, Math.floor(v)) }), 300);
  useDebouncedCommit(victory, (v) => updateRule({ victory: v as LevelRules['victory'] }), 300);

  return (
    <div data-testid="level-metadata-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={SECTION_TITLE}>关卡元数据</div>
      <label style={FIELD}>
        <span style={LABEL}>名称</span>
        <input style={INPUT} value={name} onChange={(e) => setName(e.target.value)} data-testid="meta-name" />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ ...FIELD, flex: 1 }}>
          <span style={LABEL}>宽 (width)</span>
          <input
            style={INPUT}
            type="number"
            min={1}
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            data-testid="meta-width"
          />
        </label>
        <label style={{ ...FIELD, flex: 1 }}>
          <span style={LABEL}>深 (depth)</span>
          <input
            style={INPUT}
            type="number"
            min={1}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            data-testid="meta-depth"
          />
        </label>
      </div>
      <div style={SECTION_TITLE}>规则</div>
      <label style={FIELD}>
        <span style={LABEL}>初始时间 (s)</span>
        <input
          style={INPUT}
          type="number"
          min={0}
          value={initialTime}
          onChange={(e) => setInitialTime(Number(e.target.value))}
          data-testid="meta-initial-time"
        />
      </label>
      <label style={FIELD}>
        <span style={LABEL}>最大生命</span>
        <input
          style={INPUT}
          type="number"
          min={1}
          value={maxHealth}
          onChange={(e) => setMaxHealth(Number(e.target.value))}
          data-testid="meta-max-health"
        />
      </label>
      <label style={FIELD}>
        <span style={LABEL}>拾取 +时间 (s)</span>
        <input
          style={INPUT}
          type="number"
          min={0}
          value={timeOnPickup}
          onChange={(e) => setTimeOnPickup(Number(e.target.value))}
          data-testid="meta-time-on-pickup"
        />
      </label>
      <div role="radiogroup" style={FIELD}>
        <span style={LABEL}>胜利条件</span>
        {VICTORY_OPTIONS.map((opt) => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="victory"
              value={opt.value}
              checked={victory === opt.value}
              onChange={() => setVictory(opt.value)}
              data-testid={`meta-victory-${opt.value}`}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pickup form (selection.kind === 'pickup')
// ---------------------------------------------------------------------------
function PickupForm({ pickup }: { pickup: Pickup }) {
  const updatePickup = useEditorStore((s) => s.updatePickup);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const [type, setType] = useState<PickupType>(pickup.type);
  const [value, setValue] = useState(pickup.value);

  useEffect(() => {
    setType(pickup.type);
    setValue(pickup.value);
  }, [pickup.id, pickup.type, pickup.value]);

  useDebouncedCommit(type, (v) => updatePickup(pickup.id, { type: v }), 300);
  useDebouncedCommit(value, (v) => updatePickup(pickup.id, { value: Math.max(0, Math.floor(v)) }), 300);

  return (
    <div data-testid="pickup-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={SECTION_TITLE}>拾取物 {pickup.id.slice(0, 8)}</div>
      <label style={FIELD}>
        <span style={LABEL}>类型</span>
        <select
          style={INPUT}
          value={type}
          onChange={(e) => setType(e.target.value as PickupType)}
          data-testid="pickup-type"
        >
          {PICKUP_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {PICKUP_TYPE_LABEL[t]} ({t})
            </option>
          ))}
        </select>
      </label>
      <label style={FIELD}>
        <span style={LABEL}>数值</span>
        <input
          style={INPUT}
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          data-testid="pickup-value"
        />
      </label>
      <Button variant="danger" onClick={() => deleteSelected()}>删除拾取物</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enemy form (selection.kind === 'enemy')
// ---------------------------------------------------------------------------
function EnemyForm({ enemy }: { enemy: EnemySpawn }) {
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
    <div data-testid="enemy-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={SECTION_TITLE}>敌人 {enemy.id.slice(0, 8)}</div>
      <div style={FIELD}>
        <span style={LABEL}>出生点 (只读)</span>
        <span style={{ fontFamily: 'monospace' }}>
          ({enemy.x}, {enemy.z})
        </span>
      </div>
      <div style={FIELD}>
        <span style={LABEL}>巡逻路径 ({enemy.path.length} 个节点)</span>
        {enemy.path.map((node, i) => (
          <div
            key={i}
            data-testid={`enemy-path-node-${i}`}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span style={{ fontSize: 11, opacity: 0.7, minWidth: 18 }}>#{i}</span>
            <input
              style={{ ...INPUT, flex: 1 }}
              type="number"
              min={0}
              value={node.x}
              aria-label={`node-${i}-x`}
              data-testid={`enemy-path-x-${i}`}
              onChange={(e) => moveEnemyNode(enemy.id, i, Number(e.target.value), node.z)}
            />
            <input
              style={{ ...INPUT, flex: 1 }}
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
              style={{
                background: 'transparent',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '2px 6px',
                cursor: enemy.path.length <= 2 ? 'not-allowed' : 'pointer',
                opacity: enemy.path.length <= 2 ? 0.4 : 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => addEnemyNode(enemy.id, enemy.x, enemy.z)}
          data-testid="enemy-path-add"
          style={{
            background: 'var(--panel)',
            color: 'var(--fg)',
            border: '1px dashed var(--border)',
            borderRadius: 4,
            padding: '4px 6px',
            cursor: 'pointer',
            fontSize: 12,
            marginTop: 2,
          }}
        >
          + 添加节点
        </button>
      </div>
      <label style={FIELD}>
        <span style={LABEL}>停留时间 (s)</span>
        <input
          style={INPUT}
          type="number"
          min={0}
          step={0.1}
          value={dwellTime}
          onChange={(e) => setDwellTime(Number(e.target.value))}
          data-testid="enemy-dwell"
        />
      </label>
      <label style={FIELD}>
        <span style={LABEL}>视野范围 (格)</span>
        <input
          style={INPUT}
          type="number"
          min={0}
          value={fovRange}
          onChange={(e) => setFovRange(Number(e.target.value))}
          data-testid="enemy-fov-range"
        />
      </label>
      <label style={FIELD}>
        <span style={LABEL}>视野角度 (°)</span>
        <input
          style={INPUT}
          type="number"
          min={0}
          max={360}
          value={fovAngleDeg}
          onChange={(e) => setFovAngleDeg(Number(e.target.value))}
          data-testid="enemy-fov-angle"
        />
      </label>
      <Button variant="danger" onClick={() => deleteSelected()}>删除敌人</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wall form (selection.kind === 'wall')
// ---------------------------------------------------------------------------
function WallForm({ x, z }: { x: number; z: number }) {
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  return (
    <div data-testid="wall-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={SECTION_TITLE}>墙体</div>
      <div style={FIELD}>
        <span style={LABEL}>坐标 (只读)</span>
        <span style={{ fontFamily: 'monospace' }}>
          ({x}, {z})
        </span>
      </div>
      <Button variant="danger" onClick={() => deleteSelected()}>删除墙体</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level panel: dispatches to the per-selection sub-form.
// ---------------------------------------------------------------------------
export function EditorPropertiesPanel() {
  const level = useEditorStore((s) => s.level);
  const selection = useEditorStore((s) => s.selection);

  let body: React.ReactNode;
  if (selection === null) {
    body = <LevelMetadataForm level={level} />;
  } else if (selection.kind === 'pickup') {
    const pickup = level.pickups.find((p) => p.id === selection.id);
    body = pickup ? <PickupForm pickup={pickup} /> : <SelectionMissing kind="pickup" />;
  } else if (selection.kind === 'enemy') {
    const enemy = level.enemies.find((e) => e.id === selection.id);
    body = enemy ? <EnemyForm enemy={enemy} /> : <SelectionMissing kind="enemy" />;
  } else {
    body = <WallForm x={selection.x} z={selection.z} />;
  }

  return (
    <aside data-testid="editor-properties-panel" style={PANEL_STYLE}>
      {body}
    </aside>
  );
}

// Defensive: the selected id is gone (e.g. undo just dropped it). Tell
// the user instead of rendering a form bound to undefined.
function SelectionMissing({ kind }: { kind: 'pickup' | 'enemy' }) {
  return <p style={{ opacity: 0.7 }}>选中的{kind === 'pickup' ? '拾取物' : '敌人'}已不存在。</p>;
}
