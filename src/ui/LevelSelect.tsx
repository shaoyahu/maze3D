import { useEffect, useState } from 'react';
import { Button } from './components/Button';
import {
  ENEMY_COUNT_DEFAULT,
  ENEMY_COUNT_MAX,
  ENEMY_COUNT_MIN,
  SPAWN_SCHEDULE_DEFAULT,
  SURVIVE_SECONDS_DEFAULT,
  SURVIVE_SECONDS_VALUES,
  type Algorithm,
  type MazeSize,
  type Seed,
  type StartLevelOptions,
  type SurviveSeconds,
  type VictoryType,
} from '../maze/types';
import { encodeSeed } from '../utils/seed';
import { isStorageAvailable } from '../store/persist';

export interface LevelDef { id: string; name: string; }

// P2-3 procedural defaults. Algorithm is hidden from the player per roadmap
// Q11 ("卡片=尺寸，算法玩家不感知"), so the random and specified-seed flows
// both pick a fixed algorithm. Size 30 is the "medium" preset for the
// specified-seed flow; the random flow uses 3 size cards.
const PROCEDURAL_ALGORITHM: Algorithm = 'recursive-backtracker';
const SPECIFIED_DEFAULT_SIZE: MazeSize = 30;
const PROCEDURAL_SIZES: readonly MazeSize[] = [15, 30, 50];
const HEX_RE = /^[0-9a-f]{16}$/;
const LAST_SEED_KEY = 'maze3d.lastSeed';
const MODE_OPTIONS: readonly VictoryType[] = ['reach-exit', 'time-trial', 'survive'];
const MODE_LABEL: Record<VictoryType, string> = {
  'reach-exit': '到达出口',
  'time-trial': '限时挑战',
  survive: '存活模式',
};

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
    const seed: Seed = { algorithm: PROCEDURAL_ALGORITHM, size, mazeSeed: randomHexSeed() };
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
      algorithm: PROCEDURAL_ALGORITHM,
      size: SPECIFIED_DEFAULT_SIZE,
      mazeSeed: seedInput,
    };
    onPick(encodeSeed(seed), buildOptions(seed));
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, overflow: 'auto', padding: 16 }}>
      <h2>选择关卡</h2>
      {error && (
        <p style={{ color: 'var(--danger)', maxWidth: 480, textAlign: 'center' }}>{error}</p>
      )}

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

      {/* P2-4a FR-13: 4 controls shared by both procedural entries. */}
      <fieldset
        data-testid="procedural-controls"
        style={{ border: '1px solid var(--muted)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 280 }}
      >
        <legend style={{ fontSize: 13, fontWeight: 600 }}>程序生成设置</legend>

        <div role="radiogroup" aria-label="游戏模式" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13 }}>游戏模式</span>
          {MODE_OPTIONS.map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                data-testid={`mode-${m}`}
              />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>

        {mode === 'survive' && (
          <div role="radiogroup" aria-label="存活秒数" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13 }}>存活秒数</span>
            {SURVIVE_SECONDS_VALUES.map((s) => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="survive-seconds"
                  value={s}
                  checked={surviveSeconds === s}
                  onChange={() => setSurviveSeconds(s)}
                  data-testid={`survive-${s}`}
                />
                {s} 秒
              </label>
            ))}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13 }}>敌人数量: {enemyCount}</span>
          <input
            type="range"
            min={ENEMY_COUNT_MIN}
            max={ENEMY_COUNT_MAX}
            step={1}
            value={enemyCount}
            onChange={(e) => setEnemyCount(Number(e.target.value))}
            aria-label="敌人数量"
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={progressive}
            onChange={(e) => setProgressive(e.target.checked)}
            data-testid="progressive-spawn"
          />
          渐进生成（每 15s + 每 pickup +1，上限 10）
        </label>
      </fieldset>

      {/* P2-3 FR-10 + Q11: 3 size cards (algorithm hidden). */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <h3>随机关卡</h3>
        <div style={{ display: 'flex', gap: 12 }} data-testid="random-cards">
          {PROCEDURAL_SIZES.map((size) => (
            <Button key={size} onClick={() => startRandom(size)}>
              {size}×{size}
            </Button>
          ))}
        </div>
      </section>

      {/* P2-3 FR-10: 指定种子关卡 group. */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <h3>指定种子关卡</h3>
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
        <Button onClick={startSpecified}>开始</Button>
      </section>

      {!error && available.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>暂无固定关卡，可以试试上方随机关卡。</p>
      )}

      <Button onClick={onBack} variant="secondary">返回</Button>
    </div>
  );
}
