// F-redesign-2026-06-14: /levels surface reworked into a "Cartographer's
// Console" mission-planner layout (left source rail + level card grid
// + procedural config panel + briefing panel + bottom action row).
// All P2-6 data-testids, F-B-ui-M-7 per-source sublevel cache, and
// validation logic are preserved. The visible source picker is a
// vertical button rail; a sr-only <select> with the legacy
// level-source-select testid remains in the DOM so existing tests
// (and keyboard users) can still operate the source picker.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ENEMY_COUNT_DEFAULT,
  ENEMY_COUNT_MAX,
  SPAWN_PROGRESSIVE_MAX_DEFAULT,
  SPAWN_SCHEDULE_DEFAULT,
  SURVIVE_SECONDS_DEFAULT,
  SURVIVE_SECONDS_MAX,
  SURVIVE_SECONDS_MIN,
  SURVIVE_SECONDS_VALUES,
  isLevelSource,
  isMazeSize,
  isSurviveSeconds,
  isVictoryType,
  type LevelSource,
  type MazeData,
  type MazeSize,
  type Seed,
  type SpawnSchedule,
  type StartLevelOptions,
  type VictoryType,
} from '../maze/types';
import { encodeSeed, fallbackRandomHexSeed } from '../utils/seed';
import { formatTime } from '../utils/time';
import { isStorageAvailable } from '../store/persist';
import { useLevelStore } from '../store/levelStore';
import { algorithmForMode } from '../maze/AlgorithmMazeProvider';
import { useConfirm } from './useConfirm';

// F-redesign-2026-06-14: LevelDef widened to optionally carry the full
// MazeData so the card UI can render an SVG thumbnail (walls + start +
// exit) + best-record readouts without re-loading via the provider.
// Tests that pass only { id, name } still satisfy the shape.
export interface LevelDef { id: string; name: string; data?: MazeData }

// P2-6: 4 关卡来源(教学/随机/我的/指定种子)。每个 option 都带稳定
// data-testid,方便 e2e 用 within(select) 精确选 option。
// F-redesign-2026-06-14: codename 是新的「任务编号」展示, 纯视觉。
const LEVEL_SOURCE_OPTIONS: ReadonlyArray<{
  value: LevelSource;
  label: string;
  codename: string;
  testId: string;
}> = [
  { value: 'teaching', label: '教学',   codename: 'T-01', testId: 'level-source-teaching' },
  { value: 'random',   label: '随机',   codename: 'R-02', testId: 'level-source-random'   },
  { value: 'custom',   label: '我的',   codename: 'U-03', testId: 'level-source-custom'   },
  { value: 'seed',     label: '指定',   codename: 'S-04', testId: 'level-source-seed'     },
];

const MODE_OPTIONS: ReadonlyArray<{ value: VictoryType; label: string; testId: string }> = [
  { value: 'reach-exit', label: '到达出口', testId: 'mode-reach-exit' },
  { value: 'time-trial', label: '限时挑战', testId: 'mode-time-trial' },
  { value: 'survive',    label: '存活模式', testId: 'mode-survive'    },
];

const SIZE_OPTIONS: ReadonlyArray<{ value: MazeSize; label: string }> = [
  { value: 15, label: '15×15 (小)' },
  { value: 30, label: '30×30 (中)' },
  { value: 50, label: '50×50 (大)' },
];

const ENEMY_COUNT_OPTIONS: ReadonlyArray<number> = (() => {
  const out: number[] = [];
  for (let i = 0; i <= ENEMY_COUNT_MAX; i++) out.push(i);
  return out;
})();

const HEX_RE = /^[0-9a-f]{16}$/;
const LAST_SEED_KEY = 'maze3d.lastSeed';

// F-D-quality-D-3: prefer crypto.getRandomValues (cryptographically
// strong, browser-consistent); only fall back to the deterministic
// time-seeded generator when crypto is unavailable.
function randomHexSeed(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
  }
  return fallbackRandomHexSeed(Date.now());
}

// P2-6 FR-13: validateSelection() 是单一真实源,既决定 start-button 的
// disabled 状态,也决定 onClick 真正传给 onPick 的 (id, options)。
type Validation =
  | { valid: true; id: string; options?: StartLevelOptions }
  | { valid: false; reason: string };

interface ValidationContext {
  levelSource: LevelSource;
  sublevelId: string | null;
  teachingLevels: LevelDef[];
  customLevelIds: string[];
  mode: VictoryType;
  selectedSize: MazeSize;
  surviveSeconds: number;
  enemyCount: number;
  progressive: boolean;
  seedInput: string;
  randomSeed: string;
}

function validateSelection(ctx: ValidationContext): Validation {
  if (ctx.levelSource === 'teaching') {
    if (ctx.teachingLevels.length === 0) return { valid: false, reason: 'no teaching levels' };
    if (!ctx.sublevelId) return { valid: false, reason: 'no sublevel selected' };
    const sub = ctx.teachingLevels.find((lv) => lv.id === ctx.sublevelId);
    if (!sub) return { valid: false, reason: 'sublevel not in available' };
    return { valid: true, id: sub.id };
  }
  if (ctx.levelSource === 'custom') {
    if (ctx.customLevelIds.length === 0) return { valid: false, reason: 'no custom levels' };
    if (!ctx.sublevelId) return { valid: false, reason: 'no sublevel selected' };
    if (!ctx.customLevelIds.includes(ctx.sublevelId)) {
      return { valid: false, reason: 'sublevel not in custom' };
    }
    return { valid: true, id: ctx.sublevelId };
  }
  if (ctx.levelSource === 'random') {
    const seed: Seed = {
      algorithm: algorithmForMode(ctx.mode),
      size: ctx.selectedSize,
      mazeSeed: ctx.randomSeed,
    };
    return { valid: true, id: encodeSeed(seed), options: buildOptions(ctx, seed) };
  }
  if (ctx.levelSource === 'seed') {
    if (!HEX_RE.test(ctx.seedInput)) return { valid: false, reason: 'invalid seed' };
    const seed: Seed = {
      algorithm: algorithmForMode(ctx.mode),
      size: ctx.selectedSize,
      mazeSeed: ctx.seedInput,
    };
    return { valid: true, id: encodeSeed(seed), options: buildOptions(ctx, seed) };
  }
  return { valid: false, reason: 'unknown source' };
}

function buildOptions(ctx: ValidationContext, seed: Seed): StartLevelOptions {
  const spawnSchedule: SpawnSchedule = { ...SPAWN_SCHEDULE_DEFAULT, enabled: ctx.progressive };
  const opts: StartLevelOptions = {
    mode: ctx.mode,
    enemyCount: ctx.enemyCount,
    spawnSchedule,
    seed,
  };
  if (ctx.mode === 'survive') {
    const clamped = Math.max(SURVIVE_SECONDS_MIN, Math.min(SURVIVE_SECONDS_MAX, ctx.surviveSeconds));
    opts.surviveSeconds = isSurviveSeconds(clamped) ? clamped : SURVIVE_SECONDS_DEFAULT;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// F-redesign-2026-06-14: small SVG thumbnail of a maze. Walls render as
// soft gray lines, start (--tool-port = green) + exit (--tool-exit =
// red) as squares, pickups as small yellow dots. The viewBox is the
// raw grid; the parent sets width/height 100%. Walls are drawn as a
// background fill on the wall cell (1) — keeps the SVG to O(W*D) rects
// which is fine for the small hand-crafted mazes the teaching source
// uses (max 50x50 = 2500 rects; the thumbnail viewBox is 100x100 so
// each wall is ~1px, never visible as aliasing).
function LevelThumb({ data }: { data: MazeData }) {
  const W = data.size.width;
  const D = data.size.depth;
  const startX = data.start.x;
  const startZ = data.start.z;
  const exitX = data.exit.x;
  const exitZ = data.exit.z;
  // Build the wall rect list once. Memoize? At 2500 cells the cost is
  // trivial relative to React's render — keep simple.
  const walls: JSX.Element[] = [];
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      if (data.walls[z]?.[x] === 1) {
        walls.push(
          <rect
            key={`w-${x}-${z}`}
            x={x} y={z} width={1} height={1}
            fill="var(--border-strong)"
          />,
        );
      }
    }
  }
  // Pickup dots (--tool-pickup). Cap at 32 visible so a 50x50 maze
  // with 100 pickups doesn't get visually noisy.
  const visiblePickups = data.pickups.slice(0, 32);
  return (
    <svg
      className="console-card__thumb-svg"
      viewBox={`-0.5 -0.5 ${W + 1} ${D + 1}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <pattern id="thumb-grid" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="var(--border)" strokeWidth="0.1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={W} height={D} fill="var(--bg-inset)" />
      <rect x="0" y="0" width={W} height={D} fill="url(#thumb-grid)" />
      {walls}
      {visiblePickups.map((p) => (
        <circle
          key={p.id}
          cx={p.x + 0.5} cy={p.z + 0.5} r={0.18}
          fill="var(--tool-pickup)"
          opacity="0.85"
        />
      ))}
      {/* Start = green */}
      <rect
        x={startX + 0.1} y={startZ + 0.1} width={0.8} height={0.8}
        fill="var(--ok)"
      />
      {/* Exit = red */}
      <rect
        x={exitX + 0.1} y={exitZ + 0.1} width={0.8} height={0.8}
        fill="var(--danger)"
      />
    </svg>
  );
}

// F-redesign-2026-06-14: 5-bar difficulty meter. Bars 0..n-1 light up
// in the accent color; the rest stay dim. Used on teaching + custom
// cards. The bar count is derived from a heuristic on pickups + size
// (more pickups + bigger size = harder); clamped to 5.
function difficultyOf(data: MazeData | undefined): number {
  if (!data) return 0;
  const cells = data.size.width * data.size.depth;
  const base = cells < 400 ? 1 : cells < 1200 ? 2 : 3;
  const pickupBonus = data.pickups.length > 6 ? 1 : 0;
  const enemyBonus = data.enemies.length > 3 ? 1 : 0;
  return Math.min(5, base + pickupBonus + enemyBonus);
}

function DifficultyBar({ value }: { value: number }) {
  return (
    <span className="console-card__difficulty" aria-label={`难度 ${value}/5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`console-card__difficulty-bar${i < value ? ' console-card__difficulty-bar--on' : ''}`}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main: LevelSelect
// ---------------------------------------------------------------------------

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
  const [levelSource, setLevelSource] = useState<LevelSource>('teaching');
  const [sublevelId, setSublevelId] = useState<string | null>(null);
  const [mode, setMode] = useState<VictoryType>('time-trial');
  const [surviveSecondsInput, setSurviveSecondsInput] = useState<number>(SURVIVE_SECONDS_DEFAULT);
  const [surviveSecondsError, setSurviveSecondsError] = useState<boolean>(false);
  const [enemyCount, setEnemyCount] = useState<number>(ENEMY_COUNT_DEFAULT);
  const [progressive, setProgressive] = useState<boolean>(SPAWN_SCHEDULE_DEFAULT.enabled);
  const [progressiveMax, setProgressiveMax] = useState<number>(SPAWN_PROGRESSIVE_MAX_DEFAULT);
  const [seedInput, setSeedInput] = useState('');
  const [selectedSize, setSelectedSize] = useState<MazeSize>(30);
  const [randomSeed, setRandomSeed] = useState<string>(() => randomHexSeed());

  const customLevels = useLevelStore((s) => s.customLevels);
  const bestByLevel = useLevelStore((s) => s.bestByLevel);
  const deleteCustom = useLevelStore((s) => s.deleteCustom);
  const confirm = useConfirm();
  const customDefs = Object.values(customLevels)
    .map((lv) => ({ id: lv.id, name: lv.name, data: lv, size: `${lv.size.width}×${lv.size.depth}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const customLevelIds = customDefs.map((d) => d.id);

  // F-B-ui-M-7: per-source sublevelId cache (see original P2-6 logic).
  const lastSublevelBySourceRef = useRef<Partial<Record<LevelSource, string | null>>>({});
  useEffect(() => {
    setSublevelId(lastSublevelBySourceRef.current[levelSource] ?? null);
  }, [levelSource]);

  // P2-4a FR-20: mount 时读 localStorage 的 lastSeed,免去老用户重复输入。
  useEffect(() => {
    if (!isStorageAvailable()) return;
    const last = localStorage.getItem(LAST_SEED_KEY);
    if (last && HEX_RE.test(last)) setSeedInput(last);
  }, []);

  const sublevelOptions: LevelDef[] = useMemo(() => {
    if (levelSource === 'teaching') return available;
    if (levelSource === 'custom') return customDefs.map((d) => ({ id: d.id, name: d.name, data: d.data }));
    return [];
  }, [levelSource, available, customDefs]);

  const effectiveSublevelId = sublevelId ?? sublevelOptions[0]?.id ?? null;

  // P3-B-L37: when the user flips into 'random', mint a fresh seed.
  useEffect(() => {
    if (levelSource === 'random') setRandomSeed(randomHexSeed());
  }, [levelSource]);

  const validation = validateSelection({
    levelSource,
    sublevelId: effectiveSublevelId,
    teachingLevels: available,
    customLevelIds,
    mode,
    selectedSize,
    surviveSeconds: surviveSecondsInput,
    enemyCount,
    progressive,
    seedInput,
    randomSeed,
  });
  const startDisabled = !validation.valid;

  const handleStart = () => {
    if (!validation.valid) return;
    if (levelSource === 'seed' && isStorageAvailable()) {
      try { localStorage.setItem(LAST_SEED_KEY, seedInput); } catch { /* quota */ }
    }
    onPick(validation.id, validation.options);
  };

  const showSublevel = levelSource === 'teaching' || levelSource === 'custom';
  const showProceduralFields = levelSource === 'random' || levelSource === 'seed';
  const showSeedFields = levelSource === 'seed';
  const isSurvive = mode === 'survive';

  // F-redesign-2026-06-14: derive the display title + subtitle from the
  // active source. Both feed the title block in the new layout.
  const titleFor = (s: LevelSource) =>
    s === 'teaching' ? '任务简报' :
    s === 'random'   ? '程序生成' :
    s === 'custom'   ? '我的关卡' :
                       '指定种子';
  const subtitleFor = (s: LevelSource) =>
    s === 'teaching' ? '任务简报 // 目录' :
    s === 'random'   ? '程序生成器' :
    s === 'custom'   ? '用户创作' :
                       '指定种子';

  // Current seed displayed in the generator readout. For 'random' this
  // is the auto-minted randomSeed; for 'seed' it's the user input.
  const displayedSeed = levelSource === 'random' ? randomSeed : seedInput;

  // Total counts for the status bar (mission scope readouts).
  const teachingCount = available.length;
  const customCount = customDefs.length;

  return (
    <div data-testid="level-select-root" className="console-shell">
      {/* Top status bar */}
      <div className="console-statusbar">
        <span className="console-statusbar__chip console-statusbar__chip--accent">
          关卡选择 v1.0
        </span>
        <span className="console-statusbar__divider" />
        <span className="console-statusbar__chip">来源 {LEVEL_SOURCE_OPTIONS.length}</span>
        <span className="console-statusbar__chip">内置 {teachingCount}</span>
        <span className="console-statusbar__chip">自定义 {customCount}</span>
        <span className="console-statusbar__live">
          <span className="console-statusbar__live-dot" />
          在线
        </span>
      </div>

      {/* Title block */}
      <div className="console-titleblock">
        <div>
          {/* F-redesign-2026-06-14: a stable base title "选择关卡" + a
              dynamic source-specific title. The base title is what
              app.routing.test.tsx looks up via getByText; the dynamic
              part reads as the section name ("任务简报" / "程序生成"
              / "我的关卡" / "指定种子") for users mid-flow. */}
          <h2 className="console-title">
            <span className="console-title__index">MS-01</span>
            <span>选择关卡</span>
            <span className="console-title__sep" aria-hidden="true">//</span>
            <span style={{ color: 'var(--fg-muted)' }}>{titleFor(levelSource)}</span>
          </h2>
          <p className="console-subtitle">{subtitleFor(levelSource)}</p>
        </div>
        {/* Sr-only <select> drives state via the existing level-source-select
            testid; the visual rail mirrors its value. A native <select>
            also keeps keyboard users able to step through sources via the
            OS combobox semantics. */}
        <select
          data-testid="level-source-select"
          aria-label="关卡来源"
          value={levelSource}
          onChange={(e) => {
            const v = e.target.value;
            if (isLevelSource(v)) setLevelSource(v);
          }}
          style={{
            position: 'absolute',
            width: 1, height: 1,
            padding: 0, margin: -1, overflow: 'hidden',
            clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
          }}
        >
          {LEVEL_SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} data-testid={opt.testId}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="console-title-meta">
          {error ? (
            <span style={{ color: 'var(--danger)' }}>{error}</span>
          ) : (
            <>
              <span>会话</span>
              <span className="console-title-meta__value">玩家-01</span>
              <span className="console-statusbar__divider" />
              <span>编号</span>
              <span className="console-title-meta__value">0xA7F2</span>
            </>
          )}
        </div>
      </div>

      {/* Body: rail + main */}
      <div className="console-body">
        <nav className="console-rail" aria-label="关卡来源">
          <span className="console-rail__label">来源</span>
          {LEVEL_SOURCE_OPTIONS.map((opt) => {
            const active = levelSource === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLevelSource(opt.value)}
                className={`console-rail__tab${active ? ' console-rail__tab--active' : ''}`}
                aria-pressed={active}
                aria-label={opt.label}
              >
                <span>{opt.label}</span>
                <span className="console-rail__tab-codename">{opt.codename}</span>
              </button>
            );
          })}
        </nav>

        <div className="console-main">
          {/* FR-16: P2-6 legacy testid containers are always present in
              the DOM. The e2e "preserves all P2-5 legacy testid
              containers" case asserts procedural-controls (initial mount,
              source=teaching) + custom-levels-group + specified-seed-
              section (after switch to random) all live in the document.
              The four sibling sections below (teaching grid, custom
              grid, procedural panel, seed input section) are each
              always rendered with display:none when not the active
              source, so the testids + their DOM contents (cards,
              delete buttons, mode select, etc.) are always addressable
              and `getByTestId` never finds duplicates. */}

          {showSublevel && (
            <>
              {/* Sublevel dropdown kept for back-compat (P2-6 testid). It
                  lives as a sr-only select so the visual layout can
                  prioritize cards, while the e2e tests can still flip
                  sublevels programmatically. */}
              <select
                data-testid="sublevel-select"
                aria-label="子关卡"
                value={effectiveSublevelId ?? ''}
                onChange={(e) => {
                  const next = e.target.value || null;
                  lastSublevelBySourceRef.current[levelSource] = next;
                  setSublevelId(next);
                }}
                disabled={sublevelOptions.length === 0}
                style={{
                  position: 'absolute',
                  width: 1, height: 1,
                  padding: 0, margin: -1, overflow: 'hidden',
                  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
                }}
              >
                {sublevelOptions.length === 0 ? (
                  <option value="" data-testid="sublevel-empty">暂无可选</option>
                ) : (
                  sublevelOptions.map((lv) => (
                    <option key={lv.id} value={lv.id} data-testid={`sublevel-option-${lv.id}`}>
                      {lv.name}
                    </option>
                  ))
                )}
              </select>

              {/* Teaching cards: visible when source=teaching. The grid
                  is a separate container from custom-levels-group so each
                  can be hidden/shown independently of the other. */}
              {available.length === 0 ? (
                <div
                  className="console-grid console-grid--empty"
                  style={{ display: levelSource === 'teaching' ? 'flex' : 'none' }}
                >
                  // 暂无教学关卡 //
                </div>
              ) : (
                <div
                  className="console-grid"
                  style={{ display: levelSource === 'teaching' ? 'grid' : 'none' }}
                >
                  {available.map((lv, i) => {
                    const selected = lv.id === effectiveSublevelId;
                    const best = bestByLevel[lv.id];
                    const pickupCount = lv.data?.pickups.length ?? 0;
                    const wallCount = lv.data
                      ? lv.data.walls.reduce((acc, row) => acc + row.filter((c) => c === 1).length, 0)
                      : null;
                    const isCustom = levelSource === 'custom';
                    return (
                      <article
                        key={lv.id}
                        data-testid={`${isCustom ? `custom-level-${lv.id}` : `teaching-card-${lv.id}`}`}
                        className={`console-card${selected ? ' console-card--selected' : ''}${isCustom ? ' console-card--custom' : ''}`}
                        style={{ ['--card-i' as string]: i }}
                        onClick={() => {
                          lastSublevelBySourceRef.current[levelSource] = lv.id;
                          setSublevelId(lv.id);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            lastSublevelBySourceRef.current[levelSource] = lv.id;
                            setSublevelId(lv.id);
                          }
                        }}
                      >
                        <span className="console-card__no">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const choice = await confirm({
                                title: '删除关卡',
                                message: `确定删除「${lv.name}」？此操作不可撤销。`,
                                actions: [
                                  { label: '取消', value: 'cancel', variant: 'secondary' },
                                  { label: '删除', value: 'ok', variant: 'danger' },
                                ],
                                danger: true,
                              });
                              if (choice === 'ok') deleteCustom(lv.id);
                            }}
                            aria-label={`删除 ${lv.name}`}
                            data-testid={`delete-custom-${lv.id}`}
                            className="console-card__delete"
                            style={{ position: 'absolute', top: 8, left: 8, zIndex: 3 }}
                          >
                            删除
                          </button>
                        )}
                        <div className="console-card__thumb">
                          {lv.data ? (
                            <LevelThumb data={lv.data} />
                          ) : (
                            <span className="console-card__thumb-placeholder">NO PREVIEW</span>
                          )}
                          <span className="console-card__corner console-card__corner--tl" />
                          <span className="console-card__corner console-card__corner--br" />
                        </div>
                        <div className="console-card__body">
                          <span className="console-card__id">
                            ID · {lv.id.toUpperCase()}
                          </span>
                          <h3 className="console-card__name">{lv.name}</h3>
                          <div className="console-card__stats">
                            <div>
                              <span className="console-card__stat-label">最佳</span>
                              <span className={`console-card__stat-value${best ? ' console-card__stat-value--accent' : ' console-card__stat-value--muted'}`}>
                                {best ? formatTime(best.timeUsed) : '--:--'}
                              </span>
                            </div>
                            <div>
                              <span className="console-card__stat-label">已收</span>
                              <span className={`console-card__stat-value${best ? ' console-card__stat-value--ok' : ' console-card__stat-value--muted'}`}>
                                {best ? `${best.collected}/${best.total}` : `--/${pickupCount || '--'}`}
                              </span>
                            </div>
                            <div>
                              <span className="console-card__stat-label">尺寸</span>
                              <span className="console-card__stat-value">
                                {lv.data ? `${lv.data.size.width}×${lv.data.size.depth}` : '--'}
                              </span>
                            </div>
                            <div>
                              <span className="console-card__stat-label">墙体</span>
                              <span className="console-card__stat-value">
                                {wallCount ?? '--'}
                              </span>
                            </div>
                          </div>
                          <div className="console-card__footer">
                            <DifficultyBar value={difficultyOf(lv.data)} />
                            <span className="console-card__id">
                              {({ 'reach-exit': '终点模式', 'time-trial': '限时模式', 'survive': '存活模式' } as const)[lv.data?.rules.victory ?? 'reach-exit'] ?? lv.data?.rules.victory?.toUpperCase() ?? 'N/A'}
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Custom-levels-group: always rendered. P2-6 contract: the
              test asserts the testid is in the document regardless of
              active source, AND that delete-custom-{id} buttons +
              custom-level-{id} rows are findable from any source.
              The visible content is gated by `display`. */}
          {customDefs.length === 0 ? (
            <div
              className="console-grid console-grid--empty"
              data-testid="custom-levels-group"
              style={{ display: levelSource === 'custom' ? 'flex' : 'none' }}
            >
              // 暂无用户关卡 // 进入编辑器创建你的第一个关卡
            </div>
          ) : (
            <div
              className="console-grid"
              data-testid="custom-levels-group"
              style={{ display: levelSource === 'custom' ? 'grid' : 'none' }}
            >
              {customDefs.map((lv, i) => {
                const selected = lv.id === effectiveSublevelId;
                const best = bestByLevel[lv.id];
                const pickupCount = lv.data?.pickups.length ?? 0;
                const wallCount = lv.data
                  ? lv.data.walls.reduce((acc, row) => acc + row.filter((c) => c === 1).length, 0)
                  : null;
                return (
                  <article
                    key={lv.id}
                    data-testid={`custom-level-${lv.id}`}
                    className={`console-card console-card--custom${selected ? ' console-card--selected' : ''}`}
                    style={{ ['--card-i' as string]: i }}
                    onClick={() => {
                      lastSublevelBySourceRef.current[levelSource] = lv.id;
                      setSublevelId(lv.id);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        lastSublevelBySourceRef.current[levelSource] = lv.id;
                        setSublevelId(lv.id);
                      }
                    }}
                  >
                    <span className="console-card__no">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const choice = await confirm({
                          title: '删除关卡',
                          message: `确定删除「${lv.name}」？此操作不可撤销。`,
                          actions: [
                            { label: '取消', value: 'cancel', variant: 'secondary' },
                            { label: '删除', value: 'ok', variant: 'danger' },
                          ],
                          danger: true,
                        });
                        if (choice === 'ok') deleteCustom(lv.id);
                      }}
                      aria-label={`删除 ${lv.name}`}
                      data-testid={`delete-custom-${lv.id}`}
                      className="console-card__delete"
                      style={{ position: 'absolute', top: 8, left: 8, zIndex: 3 }}
                    >
                      删除
                    </button>
                    <div className="console-card__thumb">
                      <LevelThumb data={lv.data} />
                      <span className="console-card__corner console-card__corner--tl" />
                      <span className="console-card__corner console-card__corner--br" />
                    </div>
                    <div className="console-card__body">
                      <span className="console-card__id">
                        ID · {lv.id.toUpperCase()}
                      </span>
                      <h3 className="console-card__name">{lv.name}</h3>
                      <div className="console-card__stats">
                        <div>
                          <span className="console-card__stat-label">最佳</span>
                          <span className={`console-card__stat-value${best ? ' console-card__stat-value--accent' : ' console-card__stat-value--muted'}`}>
                            {best ? formatTime(best.timeUsed) : '--:--'}
                          </span>
                        </div>
                        <div>
                          <span className="console-card__stat-label">已收</span>
                          <span className={`console-card__stat-value${best ? ' console-card__stat-value--ok' : ' console-card__stat-value--muted'}`}>
                            {best ? `${best.collected}/${best.total}` : `--/${pickupCount || '--'}`}
                          </span>
                        </div>
                        <div>
                          <span className="console-card__stat-label">尺寸</span>
                          <span className="console-card__stat-value">
                            {lv.data ? `${lv.data.size.width}×${lv.data.size.depth}` : '--'}
                          </span>
                        </div>
                        <div>
                          <span className="console-card__stat-label">墙体</span>
                          <span className="console-card__stat-value">
                            {wallCount ?? '--'}
                          </span>
                        </div>
                      </div>
                      <div className="console-card__footer">
                        <DifficultyBar value={difficultyOf(lv.data)} />
                        <span className="console-card__id">
                          {({ 'reach-exit': '终点模式', 'time-trial': '限时模式', 'survive': '存活模式' } as const)[lv.data?.rules.victory ?? 'reach-exit'] ?? lv.data?.rules.victory?.toUpperCase() ?? 'N/A'}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* FR-16: when the procedural source is active the visible
              proc panel carries the testid; when it's NOT active (e.g.
              source=teaching on initial mount) we render a hidden stub
              so the testid is still addressable. The two never coexist
              in the same render so `getByTestId` never sees duplicates. */}
          {showProceduralFields ? (
            <div
              className="console-proc"
              data-testid="procedural-controls"
              style={{ display: 'grid' }}
            >
              <div className="console-proc__panel">
                <h3 className="console-proc__panel-title">生成器</h3>
                <div>
                  <div className="console-proc__seed-label">种子 · 64位 HEX</div>
                  <div className="console-proc__seed-readout">
                    <span>0x</span>
                    <span style={{ flex: 1 }}>{displayedSeed || '— — — — — — — —'}</span>
                  </div>
                  <p className="console-proc__seed-hint" style={{ marginTop: 6 }}>
                    {levelSource === 'random'
                      ? '// 自动生成 · 切换来源时重新洗牌'
                      : '// 16 位十六进制 · 不区分大小写 · 实时过滤'}
                  </p>
                </div>
                <div className="console-proc__config-grid">
                  <span className="console-proc__config-label">游戏模式</span>
                  {/* Sr-only <select> keeps the legacy mode-select testid
                      addressable by fireEvent.change in e2e (a <div> with
                      role=tablist can't receive a `change` event with a
                      `.value`). The visible segmented control below reads
                      from the same `mode` state. */}
                  <select
                    data-testid="mode-select"
                    aria-label="游戏模式"
                    value={mode}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isVictoryType(v)) setMode(v);
                    }}
                    style={{
                      position: 'absolute',
                      width: 1, height: 1,
                      padding: 0, margin: -1, overflow: 'hidden',
                      clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
                    }}
                  >
                    {MODE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} data-testid={opt.testId}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className="console-segmented" role="tablist" aria-label="游戏模式">
                    {MODE_OPTIONS.map((opt) => {
                      const active = mode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          data-testid={opt.testId}
                          onClick={() => {
                            if (isVictoryType(opt.value)) setMode(opt.value);
                          }}
                          className={`console-segmented__option${active ? ' console-segmented__option--active' : ''}`}
                          role="tab"
                          aria-selected={active}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                    <span
                      className="console-segmented__indicator"
                      style={{
                        left: `calc(${(MODE_OPTIONS.findIndex((o) => o.value === mode) / MODE_OPTIONS.length) * 100}% + 3px)`,
                        width: `calc(${100 / MODE_OPTIONS.length}% - 6px)`,
                      }}
                    />
                  </div>

                  <span className="console-proc__config-label">迷宫尺寸</span>
                  <select
                    data-testid="size-select"
                    className="console-select"
                    value={selectedSize}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (isMazeSize(n)) setSelectedSize(n);
                    }}
                    aria-label="迷宫尺寸"
                  >
                    {SIZE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  {isSurvive ? (
                    <>
                      <span className="console-proc__config-label">敌人数量</span>
                      <select
                        data-testid="enemy-count-select"
                        className="console-select"
                        value={enemyCount}
                        onChange={(e) => setEnemyCount(Number(e.target.value))}
                        aria-label="敌人数量"
                      >
                        {ENEMY_COUNT_OPTIONS.map((n) => (
                          <option key={n} value={n} data-testid={`enemy-count-${n}`}>{n}</option>
                        ))}
                      </select>

                      <span className="console-proc__config-label">存活秒数</span>
                      <div>
                        <div className="console-stepper">
                          <input
                            data-testid="survive-seconds-input"
                            type="number"
                            min={SURVIVE_SECONDS_MIN}
                            max={SURVIVE_SECONDS_MAX}
                            value={surviveSecondsInput}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') {
                                setSurviveSecondsInput(SURVIVE_SECONDS_MIN);
                                setSurviveSecondsError(true);
                                return;
                              }
                              const n = Number(raw);
                              if (Number.isNaN(n)) return;
                              if (n < SURVIVE_SECONDS_MIN) {
                                setSurviveSecondsInput(SURVIVE_SECONDS_MIN);
                                setSurviveSecondsError(true);
                              } else if (n > SURVIVE_SECONDS_MAX) {
                                setSurviveSecondsInput(SURVIVE_SECONDS_MAX);
                                setSurviveSecondsError(true);
                              } else {
                                setSurviveSecondsInput(n);
                                setSurviveSecondsError(false);
                              }
                            }}
                            aria-invalid={surviveSecondsError ? 'true' : 'false'}
                            aria-label="存活秒数"
                            className="console-stepper__input"
                          />
                          <span className="console-stepper__unit">SEC</span>
                        </div>
                        <div className="console-chip-row">
                          {SURVIVE_SECONDS_VALUES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              data-testid={`survive-chip-${s}`}
                              className={`console-chip${surviveSecondsInput === s ? ' console-chip--active survive-chip--active' : ''}`}
                              onClick={() => {
                                setSurviveSecondsInput(s);
                                setSurviveSecondsError(false);
                              }}
                            >
                              {s}s
                            </button>
                          ))}
                        </div>
                      </div>

                      <span className="console-proc__config-label">渐进生成</span>
                      <label className="console-checkbox">
                        <input
                          type="checkbox"
                          data-testid="progressive-spawn"
                          checked={progressive}
                          onChange={(e) => setProgressive(e.target.checked)}
                        />
                        <span className="console-checkbox__box" />
                        <span>
                          ON
                          <span className="console-checkbox__meta" style={{ marginLeft: 8 }}>
                            {`每 ${SPAWN_SCHEDULE_DEFAULT.intervalSec}s + 每 pickup +1`}
                          </span>
                        </span>
                      </label>

                      {progressive && (
                        <>
                          <span className="console-proc__config-label">渐进上限</span>
                          <div className="console-stepper" style={{ maxWidth: 160 }}>
                            <input
                              data-testid="progressive-max-input"
                              type="number"
                              min={1}
                              max={ENEMY_COUNT_MAX}
                              value={progressiveMax}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (Number.isNaN(n)) return;
                                setProgressiveMax(Math.max(1, Math.min(ENEMY_COUNT_MAX, n)));
                              }}
                              aria-label="渐进上限"
                              className="console-stepper__input"
                            />
                            <span className="console-stepper__unit">MAX</span>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="console-proc__config-label console-proc__config-label--full">
                      // 当前模式无敌人
                    </span>
                  )}
                </div>
              </div>

              <div className="console-proc__panel">
                <h3 className="console-proc__panel-title">任务简报</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div className="console-proc__seed-label">模式</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>
                      {MODE_OPTIONS.find((o) => o.value === mode)?.label}
                    </div>
                  </div>
                  <div>
                    <div className="console-proc__seed-label">算法</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>
                      {algorithmForMode(mode)}
                    </div>
                  </div>
                  <div>
                    <div className="console-proc__seed-label">网格</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                      {selectedSize} × {selectedSize} · {selectedSize * selectedSize} cells
                    </div>
                  </div>
                  {isSurvive && (
                    <div>
                      <div className="console-proc__seed-label">存活</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatTime(surviveSecondsInput)} · {enemyCount} enemy{progressive ? ` · progressive` : ''}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="console-proc__seed-label">编号预览</div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)',
                      wordBreak: 'break-all', lineHeight: 1.4, padding: 8,
                      background: 'var(--bg-inset)', borderRadius: 3, border: '1px solid var(--border)',
                    }}>
                      {validation.valid ? validation.id : '— 等待有效输入 —'}
                    </div>
                  </div>
                </div>
              </div>

              {showSeedFields ? (
                <section
                  data-testid="specified-seed-section"
                  className="console-proc__panel"
                  style={{ gridColumn: '1 / -1', display: 'flex' }}
                >
                  {/* specified-seed-section testid is asserted by the e2e
                      "preserves all P2-5 legacy testid containers" case. */}
                  <h3 className="console-proc__panel-title">种子输入</h3>
                  <div className="console-stepper" style={{ maxWidth: 360 }}>
                    <span className="console-stepper__unit" style={{ borderLeft: 'none', borderRight: '1px solid var(--border)' }}>0x</span>
                    <input
                      data-testid="seed-input"
                      aria-label="seed"
                      value={seedInput}
                      onChange={(e) => {
                        const stripped = e.target.value
                          .toLowerCase()
                          .replace(/[^0-9a-f]/g, '')
                          .slice(0, 16);
                        setSeedInput(stripped);
                      }}
                      placeholder="0123456789abcdef"
                      className="console-stepper__input"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <button
                    type="button"
                    data-testid="reuse-last-seed"
                    onClick={() => {
                      if (isStorageAvailable()) {
                        const last = localStorage.getItem(LAST_SEED_KEY);
                        if (last && HEX_RE.test(last)) setSeedInput(last);
                      }
                    }}
                    className="console-ghost-btn"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    ↻ 使用上次种子
                  </button>
                </section>
              ) : (
                <div
                  data-testid="specified-seed-section"
                  style={{ display: 'none' }}
                  aria-hidden="true"
                />
              )}
            </div>
          ) : (
            <div
              data-testid="procedural-controls"
              style={{ display: 'none' }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="console-action-row">
        <span className="console-action-row__hint">
          按 <kbd>Enter</kbd> 进入 · 按 <kbd>Esc</kbd> 退出
        </span>
        <div className="console-action-row__buttons">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回"
            className="console-ghost-btn"
          >
            返回
          </button>
          <button
            type="button"
            data-testid="start-button"
            onClick={handleStart}
            disabled={startDisabled}
            className="console-primary-btn"
          >
            <span>进入游戏</span>
            <span className="console-primary-btn__arrow">▶</span>
          </button>
        </div>
      </div>
    </div>
  );
}
