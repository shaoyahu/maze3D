import { useEffect, useState } from 'react';
import { Button } from './components/Button';
import {
  ENEMY_COUNT_DEFAULT,
  ENEMY_COUNT_MAX,
  SPAWN_SCHEDULE_DEFAULT,
  SURVIVE_SECONDS_DEFAULT,
  SURVIVE_SECONDS_VALUES,
  type MazeSize,
  type Seed,
  type StartLevelOptions,
  type SurviveSeconds,
  type VictoryType,
} from '../maze/types';
import { encodeSeed } from '../utils/seed';
import { isStorageAvailable } from '../store/persist';
import { useLevelStore } from '../store/levelStore';
import { algorithmForMode } from '../maze/AlgorithmMazeProvider';

export interface LevelDef { id: string; name: string; }

// P2-5 FR-13/FR-16: Mode labels and their stable data-testid values. The
// `<option>` elements use `data-testid` so the new native `<select>` can be
// queried the same way the old radio inputs were.
const MODE_OPTIONS: ReadonlyArray<{ value: VictoryType; label: string; testId: string }> = [
  { value: 'reach-exit', label: '到达出口', testId: 'mode-reach-exit' },
  { value: 'time-trial', label: '限时挑战', testId: 'mode-time-trial' },
  { value: 'survive', label: '存活模式', testId: 'mode-survive' },
];
const SIZE_OPTIONS: ReadonlyArray<{ value: MazeSize; label: string }> = [
  { value: 15, label: '15×15 (小)' },
  { value: 30, label: '30×30 (中)' },
  { value: 50, label: '50×50 (大)' },
];
// P2-5 FR-15: enemy count is now a fixed 0..10 dropdown (the range slider
// is gone). The `ENEMY_COUNT_MAX` import stays so the upper bound stays in
// sync with the source-of-truth constant in maze/types.ts.
const ENEMY_COUNT_OPTIONS: ReadonlyArray<number> = (() => {
  const out: number[] = [];
  for (let i = 0; i <= ENEMY_COUNT_MAX; i++) out.push(i);
  return out;
})();
const HEX_RE = /^[0-9a-f]{16}$/;
const LAST_SEED_KEY = 'maze3d.lastSeed';

// Generate a random 16-char lowercase hex seed using the Web Crypto API.
// Falls back to Math.random for older runtimes / test environments where
// crypto.getRandomValues may not be available.
function randomHexSeed(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function LevelSelect({
  available,
  error,
  onPick,
  onBack,
}: {
  available: LevelDef[];
  error?: string | null;
  onPick: (id: string, options?: StartLevelOptions) => void;
  onBack: () => void;
}) {
  // P2-4a FR-13: 4 controls apply to both procedural entries (random +
  // specified-seed). Sharing state keeps the entry buttons consistent: the
  // last configuration the user picked is the one used next time, regardless
  // of which entry they click. Hand-crafted levels still ignore the options.
  const [mode, setMode] = useState<VictoryType>('time-trial');
  const [surviveSeconds, setSurviveSeconds] = useState<SurviveSeconds>(SURVIVE_SECONDS_DEFAULT);
  const [enemyCount, setEnemyCount] = useState<number>(ENEMY_COUNT_DEFAULT);
  const [progressive, setProgressive] = useState<boolean>(SPAWN_SCHEDULE_DEFAULT.enabled);
  const [seedInput, setSeedInput] = useState('');
  const [seedError, setSeedError] = useState<string | null>(null);
  // FR-16: 程序生成开局用当前下拉尺寸,而不是写死的常量。
  const [selectedSize, setSelectedSize] = useState<MazeSize>(30);
  // FR-13: 进阶折叠默认收起,seed 输入隐藏。
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // P2-4a FR-20: read the last valid hex seed on mount so a returning
  // player doesn't have to retype it. localStorage values that don't
  // match HEX_RE are silently ignored (don't try to repair a corrupted
  // entry, just leave the field blank). Guard with isStorageAvailable
  // so Safari private mode / disabled storage doesn't throw.
  useEffect(() => {
    if (!isStorageAvailable()) return;
    const last = localStorage.getItem(LAST_SEED_KEY);
    if (last && HEX_RE.test(last)) setSeedInput(last);
  }, []);

  // P2-4b FR-40: "我的关卡" group shows user-saved custom levels, sorted
  // by name for a stable order. Each entry uses the level's id (a
  // `custom-<uuid>` prefix is enforced by the editor's `newLevel` /
  // `importJson`) so EditorMazeProvider can resolve it on the way out.
  const customLevels = useLevelStore((s) => s.customLevels);
  const deleteCustom = useLevelStore((s) => s.deleteCustom);
  const customDefs = Object.values(customLevels)
    .map((lv) => ({ id: lv.id, name: lv.name, size: `${lv.size.width}×${lv.size.depth}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));

  const buildOptions = (seed?: Seed): StartLevelOptions => {
    const opts: StartLevelOptions = {
      mode,
      enemyCount,
      spawnSchedule: { ...SPAWN_SCHEDULE_DEFAULT, enabled: progressive },
      ...(seed ? { seed } : {}),
    };
    if (mode === 'survive') opts.surviveSeconds = surviveSeconds;
    return opts;
  };

  const startRandom = (size: MazeSize) => {
    const seed: Seed = { algorithm: algorithmForMode(mode), size, mazeSeed: randomHexSeed() };
    onPick(encodeSeed(seed), buildOptions(seed));
  };

  const startSpecified = () => {
    if (!HEX_RE.test(seedInput)) {
      // FR-20: invalid seed must NOT be persisted. Only call setSeedError
      // and bail; the LAST_SEED_KEY stays at whatever the last valid
      // value was (or null on first run).
      setSeedError('请输入 16 位小写 hex（例如 0123456789abcdef）');
      return;
    }
    setSeedError(null);
    localStorage.setItem(LAST_SEED_KEY, seedInput);
    const seed: Seed = {
      algorithm: algorithmForMode(mode),
      size: selectedSize,
      mazeSeed: seedInput,
    };
    onPick(encodeSeed(seed), buildOptions(seed));
  };

  return (
    <div
      data-testid="level-select-root"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        // FR-7: 左列=选项面板,右列=关卡列表。720px 以下塌成 1 列。
        gridTemplateColumns: 'minmax(280px, 360px) 1fr',
        gap: 16,
        padding: 16,
        overflow: 'auto',
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          [data-testid="level-select-root"] {
            grid-template-columns: 1fr !important;
          }
        }
        .level-select-select {
          padding: 6px 10px;
          border: 1px solid var(--muted);
          border-radius: 4px;
          background: var(--bg, #fff);
          color: inherit;
          font-size: 14px;
          min-width: 180px;
        }
      `}</style>

      {/* FR-7 / P2-4a FR-13: 程序生成设置 (left column). */}
      <fieldset
        data-testid="procedural-controls"
        style={{ border: '1px solid var(--muted)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 280 }}
      >
        <legend style={{ fontSize: 13, fontWeight: 600 }}>程序生成设置</legend>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13 }}>游戏模式</span>
          <select
            data-testid="mode-select"
            className="level-select-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as VictoryType)}
            aria-label="游戏模式"
          >
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} data-testid={opt.testId}>{opt.label}</option>
            ))}
          </select>
        </label>

        {mode === 'survive' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13 }}>存活秒数</span>
            <select
              data-testid="survive-seconds-select"
              className="level-select-select"
              value={surviveSeconds}
              onChange={(e) => setSurviveSeconds(Number(e.target.value) as SurviveSeconds)}
              aria-label="存活秒数"
            >
              {SURVIVE_SECONDS_VALUES.map((s) => (
                <option key={s} value={s} data-testid={`survive-${s}`}>{s} 秒</option>
              ))}
            </select>
          </label>
        )}

        {mode === 'survive' ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13 }}>敌人数量</span>
            <select
              data-testid="enemy-count-select"
              className="level-select-select"
              value={enemyCount}
              onChange={(e) => setEnemyCount(Number(e.target.value))}
              aria-label="敌人数量"
            >
              {ENEMY_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n} data-testid={`enemy-count-${n}`}>{n}</option>
              ))}
            </select>
          </label>
        ) : (
          // FR-10: 非 survive 模式显示一行"无敌人"文案,代替隐藏(让玩家
          // 知道敌人系统是有的,只是当前模式不会用)。
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>当前模式无敌人</p>
        )}

        {mode === 'survive' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={progressive}
              onChange={(e) => setProgressive(e.target.checked)}
              data-testid="progressive-spawn"
            />
            渐进生成（每 15s + 每 pickup +1，上限 10）
          </label>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13 }}>迷宫尺寸</span>
          <select
            data-testid="size-select"
            className="level-select-select"
            value={selectedSize}
            onChange={(e) => setSelectedSize(Number(e.target.value) as MazeSize)}
            aria-label="迷宫尺寸"
          >
            {SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </fieldset>

      {/* Right column: level lists + entry buttons. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <h2>选择关卡</h2>
        {error && <p style={{ color: 'var(--danger)', maxWidth: 480, textAlign: 'center' }}>{error}</p>}

        {/* P2-3 FR-10: 固定关卡 group (hand-crafted JSON levels). */}
        {available.length > 0 && (
          <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <h3>固定关卡</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {available.map((lv) => (
                <Button key={lv.id} onClick={() => onPick(lv.id)}>{lv.name}</Button>
              ))}
            </div>
          </section>
        )}

        {/* P2-3 FR-10 + Q11 + P2-5 FR-16: 随机关卡 now uses the size dropdown. */}
        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <h3>随机关卡</h3>
          <Button onClick={() => startRandom(selectedSize)}>
            开始 {selectedSize}×{selectedSize} 随机关卡
          </Button>
        </section>

        {/* P2-3 FR-10 + P2-5 FR-13: 指定种子关卡 with 进阶 fold. */}
        <section
          data-testid="specified-seed-section"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
        >
          <h3>指定种子关卡</h3>
          <Button
            variant="secondary"
            onClick={() => setAdvancedOpen((o) => !o)}
            data-testid="advanced-toggle"
            aria-expanded={advancedOpen}
          >
            进阶 {advancedOpen ? '▴' : '▾'}
          </Button>
          {advancedOpen && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span>Seed (16 hex)</span>
                <input
                  aria-label="seed"
                  value={seedInput}
                  onChange={(e) => { setSeedInput(e.target.value); setSeedError(null); }}
                  placeholder="0123456789abcdef"
                  style={{ fontFamily: 'monospace', padding: '6px 10px', minWidth: 220 }}
                />
              </label>
              {seedError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{seedError}</p>}
              {/* FR-13: "使用上次 seed" 按钮 (从 localStorage 读 maze3d.lastSeed)。 */}
              <Button
                variant="secondary"
                onClick={() => {
                  if (isStorageAvailable()) {
                    const last = localStorage.getItem(LAST_SEED_KEY);
                    if (last && HEX_RE.test(last)) {
                      setSeedInput(last);
                      setSeedError(null);
                    }
                  }
                }}
                data-testid="reuse-last-seed"
              >
                使用上次 seed
              </Button>
              <Button onClick={startSpecified}>开始</Button>
            </>
          )}
        </section>

        {/* P2-4b FR-40/41: "我的关卡" — user-saved custom levels. Hidden when
            none exist so the menu doesn't show an empty section. */}
        {customDefs.length > 0 && (
          <section
            data-testid="custom-levels-group"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
          >
            <h3>我的关卡</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {customDefs.map((lv) => (
                <div
                  key={lv.id}
                  data-testid={`custom-level-${lv.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Button onClick={() => onPick(lv.id)}>{lv.name}</Button>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{lv.size}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`删除关卡「${lv.name}」？`)) deleteCustom(lv.id);
                    }}
                    aria-label={`删除 ${lv.name}`}
                    data-testid={`delete-custom-${lv.id}`}
                    style={{
                      background: 'transparent',
                      color: 'var(--danger)',
                      border: '1px solid var(--danger)',
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!error && available.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>暂无固定关卡，可以试试上方随机关卡。</p>
        )}

        <Button onClick={onBack} variant="secondary">返回</Button>
      </div>
    </div>
  );
}
