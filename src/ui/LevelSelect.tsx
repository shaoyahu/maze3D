import { useState } from 'react';
import { Button } from './components/Button';
import type { Algorithm, MazeSize, Seed, StartLevelOptions } from '../maze/types';
import { encodeSeed } from '../utils/seed';

export interface LevelDef { id: string; name: string; }

// P2-3 procedural defaults. Algorithm is hidden from the player per roadmap
// Q11 ("卡片=尺寸，算法玩家不感知"), so the random and specified-seed flows
// both pick a fixed algorithm. Size 30 is the "medium" preset for the
// specified-seed flow; the random flow uses 3 size cards.
const PROCEDURAL_ALGORITHM: Algorithm = 'recursive-backtracker';
const SPECIFIED_DEFAULT_SIZE: MazeSize = 30;
const PROCEDURAL_SIZES: readonly MazeSize[] = [15, 30, 50];
const HEX_RE = /^[0-9a-f]{16}$/;

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
  const [seedInput, setSeedInput] = useState('');
  const [seedError, setSeedError] = useState<string | null>(null);

  const startRandom = (size: MazeSize) => {
    const seed: Seed = { algorithm: PROCEDURAL_ALGORITHM, size, mazeSeed: randomHexSeed() };
    onPick(encodeSeed(seed), { mode: 'time-trial', seed });
  };

  const startSpecified = () => {
    if (!HEX_RE.test(seedInput)) {
      setSeedError('请输入 16 位小写 hex（例如 0123456789abcdef）');
      return;
    }
    setSeedError(null);
    const seed: Seed = {
      algorithm: PROCEDURAL_ALGORITHM,
      size: SPECIFIED_DEFAULT_SIZE,
      mazeSeed: seedInput,
    };
    onPick(encodeSeed(seed), { mode: 'time-trial', seed });
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

      {/* P2-3 FR-10 + Q11: 3 size cards (algorithm hidden). Always time-trial. */}
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
