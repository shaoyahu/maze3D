import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './components/Button';
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
  type MazeSize,
  type Seed,
  type SpawnSchedule,
  type StartLevelOptions,
  type VictoryType,
} from '../maze/types';
import { encodeSeed, fallbackRandomHexSeed } from '../utils/seed';
import { isStorageAvailable } from '../store/persist';
import { useLevelStore } from '../store/levelStore';
import { algorithmForMode } from '../maze/AlgorithmMazeProvider';
import { useConfirm } from './useConfirm';

export interface LevelDef { id: string; name: string; }

// P2-6: 4 关卡来源(教学/随机/我的/指定种子)。每个 option 都带稳定
// data-testid,方便 e2e 用 within(select) 精确选 option。
// F-D-quality-D-16: the literal union itself is now in src/maze/types.ts
// alongside the `isLevelSource` runtime whitelist; LevelSelect just imports
// the type so its option array can stay typed.
const LEVEL_SOURCE_OPTIONS: ReadonlyArray<{ value: LevelSource; label: string; testId: string }> = [
  { value: 'teaching', label: '教学关卡', testId: 'level-source-teaching' },
  { value: 'random', label: '随机关卡', testId: 'level-source-random' },
  { value: 'custom', label: '我的关卡', testId: 'level-source-custom' },
  { value: 'seed', label: '指定种子关卡', testId: 'level-source-seed' },
];

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

const ENEMY_COUNT_OPTIONS: ReadonlyArray<number> = (() => {
  const out: number[] = [];
  for (let i = 0; i <= ENEMY_COUNT_MAX; i++) out.push(i);
  return out;
})();

const HEX_RE = /^[0-9a-f]{16}$/;
const LAST_SEED_KEY = 'maze3d.lastSeed';

// F-D-quality-D-3: prefer crypto.getRandomValues (cryptographically
// strong, browser-consistent); only fall back to the deterministic
// time-seeded generator when crypto is unavailable. Math.random() is
// intentionally NOT used here — its implementation is browser/OS-
// dependent, so two no-crypto users would never share an auto-generated
// seed. `fallbackRandomHexSeed(Date.now())` is deterministic across
// runtimes (pure-JS fnv1a + mulberry32), different per call (Date.now
// advances between user clicks), and the seed string round-trips through
// the existing parseHexSeed / mulberry32 path.
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
// disabled 状态,也决定 onClick 真正传给 onPick 的 (id, options)。组件
// 只用这一处计算;handleStart 再次调一遍并按 FR-15 做幂等守卫
// `if (!result.valid) return`。
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
  // P3-B-L37: random source 的 seed 来自 caller 的 useState(rendered stable
  // per mount),不再由 validateSelection 内部 randomHexSeed() 调,免得每次
  // render 重生成 → start button id 翻动不可预测。
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
    // FR-20: localStorage 写入移到 handleStart,让 validateSelection 保持纯函数
    // (每次 render 不再无谓写盘;只在用户真的 start 时写一次)。
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
    // P2-6 FR-7: onChange 已经把输入 clamp 到 [MIN, MAX],这里再做一次
    // 防御性 clamp,保证 options.surviveSeconds 不会越界。类型仍是字面量
    // union 是为了不破坏现有 engine 调用方;运行时就是 number。
    const clamped = Math.max(SURVIVE_SECONDS_MIN, Math.min(SURVIVE_SECONDS_MAX, ctx.surviveSeconds));
    // F-D-quality-D-16: the previous `as 30 | 60 | 90 | 120` cast was a
    // type-system lie — any clamped number (e.g. 45) was quietly widened
    // to the literal union without runtime verification. The downstream
    // `normalizeSurviveSeconds` in gameStore / Game already falls back
    // to SURVIVE_SECONDS_DEFAULT for non-enum values, so we make the
    // fallback explicit at the boundary instead of hiding it in an
    // unsafe cast.
    opts.surviveSeconds = isSurviveSeconds(clamped) ? clamped : SURVIVE_SECONDS_DEFAULT;
  }
  return opts;
}

// P2-6 T5: 把 mode='survive' 那一坨 (敌人数量 + 存活秒数 input + 4 chip +
// progressive checkbox + progressive-max input) 抽出独立组件。理由:
// (a) LevelSelect 函数体本身有 300+ 行,survive 分支独占 100 行,影响可读性;
// (b) survive-only 状态(enemyCount / surviveSeconds* / progressive /
//     progressiveMax)生命周期与该面板共存,放一起便于将来按 mode 单元测试;
// (c) parent 仍负责把这些 prop 接到 <fieldset> 的 grid 上,所以子组件
//     只返回 <>...</> fragment,不另包容器。
interface SurviveSettingsPanelProps {
  enemyCount: number;
  setEnemyCount: (n: number) => void;
  surviveSecondsInput: number;
  setSurviveSecondsInput: (n: number) => void;
  surviveSecondsError: boolean;
  setSurviveSecondsError: (b: boolean) => void;
  progressive: boolean;
  setProgressive: (b: boolean) => void;
  progressiveMax: number;
  setProgressiveMax: (n: number) => void;
}

function SurviveSettingsPanel(props: SurviveSettingsPanelProps) {
  const {
    enemyCount, setEnemyCount,
    surviveSecondsInput, setSurviveSecondsInput,
    surviveSecondsError, setSurviveSecondsError,
    progressive, setProgressive,
    progressiveMax, setProgressiveMax,
  } = props;
  return (
    <>
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

      <span style={{ fontSize: 13 }}>存活秒数</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
          style={{ fontSize: 14, padding: '4px 8px', fontFamily: 'inherit', width: 100 }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SURVIVE_SECONDS_VALUES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`survive-chip-${s}`}
              className={`survive-chip ${surviveSecondsInput === s ? 'survive-chip--active' : ''}`}
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

      <span />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input
          type="checkbox"
          data-testid="progressive-spawn"
          checked={progressive}
          onChange={(e) => setProgressive(e.target.checked)}
        />
        渐进生成（每 {SPAWN_SCHEDULE_DEFAULT.intervalSec}s + 每 pickup +1）
      </label>

      {progressive && (
        <>
          <span style={{ fontSize: 13 }}>渐进上限</span>
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
            style={{ fontSize: 14, padding: '4px 8px', fontFamily: 'inherit', width: 80 }}
          />
        </>
      )}
    </>
  );
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
  // P2-6 FR-1: 主关卡来源 dropdown。默认 teaching,这样老玩家从顶部开始
  // 看到的还是熟悉的关卡列表。
  const [levelSource, setLevelSource] = useState<LevelSource>('teaching');
  // P2-6 FR-2: 选中的 sublevel id。teaching/custom 用,random/seed 不用。
  // 切换来源时 useEffect 重置,避免 stale id 跨源污染 onPick。
  const [sublevelId, setSublevelId] = useState<string | null>(null);
  // P2-6 FR-5: 程序生成共享 state (mode/size 在 random/seed 都用;
  // survive/enemy/progressive 只在 mode=survive 时用)。
  const [mode, setMode] = useState<VictoryType>('time-trial');
  // P2-6 FR-7: survive-seconds free input [10, 600]。状态存的是"已 clamp
  // 的输入值",surviveSecondsError 单独跟踪"用户尝试输入越界"这个事实,
  // 这样 input 显示 clamp 后的数字,但 aria-invalid 仍能保持 'true'。
  const [surviveSecondsInput, setSurviveSecondsInput] = useState<number>(SURVIVE_SECONDS_DEFAULT);
  const [surviveSecondsError, setSurviveSecondsError] = useState<boolean>(false);
  const [enemyCount, setEnemyCount] = useState<number>(ENEMY_COUNT_DEFAULT);
  const [progressive, setProgressive] = useState<boolean>(SPAWN_SCHEDULE_DEFAULT.enabled);
  // P2-6: 渐进生成上限从常量提到 UI,仅 progressive=true 时渲染 input。
  const [progressiveMax, setProgressiveMax] = useState<number>(SPAWN_PROGRESSIVE_MAX_DEFAULT);
  // P2-6 FR-21: seed-input 在 onChange (而非 onBlur) 实时 strip + 限长 16。
  const [seedInput, setSeedInput] = useState('');
  const [selectedSize, setSelectedSize] = useState<MazeSize>(30);
  // P3-B-L37: pin the random seed across renders. validateSelection runs
  // on every render, so without this every parent re-render (hover,
  // focus, any unrelated state) would mint a fresh seed and the start
  // button's id would flip unpredictably. Lazy-init generates one seed
  // for the first render; the effect below refreshes it when the user
  // (re)enters the 'random' source.
  const [randomSeed, setRandomSeed] = useState<string>(() => randomHexSeed());

  const customLevels = useLevelStore((s) => s.customLevels);
  const deleteCustom = useLevelStore((s) => s.deleteCustom);
  // P2-7: themed confirm dialog replaces native window.confirm().
  const confirm = useConfirm();
  const customDefs = Object.values(customLevels)
    .map((lv) => ({ id: lv.id, name: lv.name, size: `${lv.size.width}×${lv.size.depth}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const customLevelIds = customDefs.map((d) => d.id);

  // F-B-ui-M-7: per-source sublevelId cache. Each levelSource remembers the
  // last sublevelId the user picked in it, so switching teaching→custom→teaching
  // restores their teaching selection (was: cleared to null, then effectiveSublevelId
  // fell back to sublevelOptions[0]?.id, dropping the user's pick on every return
  // visit).
  //
  // Write path: ONLY the dropdown onChange handler updates the cache — see the
  // sublevel <select> below. Doing this in a useEffect on [levelSource, sublevelId]
  // is tempting but wrong: when levelSource flips, React commits with the *stale*
  // sublevelId (the prior source's pick), and the effect would clobber the new
  // source's cache slot with that stale value before the restore effect fires.
  // Read path: the restoration useEffect below runs only when levelSource changes.
  const lastSublevelBySourceRef = useRef<Partial<Record<LevelSource, string | null>>>({});
  useEffect(() => {
    setSublevelId(lastSublevelBySourceRef.current[levelSource] ?? null);
  }, [levelSource]);

  // P2-4a FR-20: mount 时读 localStorage 的 lastSeed,免去老用户重复输入。
  // localStorage 不可用 / 值不是 16hex 时静默忽略。
  useEffect(() => {
    if (!isStorageAvailable()) return;
    const last = localStorage.getItem(LAST_SEED_KEY);
    if (last && HEX_RE.test(last)) setSeedInput(last);
  }, []);

  // sublevel 列表:teaching 走 available,custom 走 customDefs。1 个时自动
  // 选中,免去一次点击;0 个时 select 禁用。
  const sublevelOptions: LevelDef[] = useMemo(() => {
    if (levelSource === 'teaching') return available;
    if (levelSource === 'custom') return customDefs.map((d) => ({ id: d.id, name: d.name }));
    return [];
  }, [levelSource, available, customDefs]);

  const effectiveSublevelId = sublevelId ?? sublevelOptions[0]?.id ?? null;

  // P3-B-L37: when the user flips into 'random' from another source,
  // mint a fresh seed once. The randomSeed state is otherwise held
  // stable so the start button's id is deterministic across renders.
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
    // FR-15: 幂等守卫。validateSelection 是单一真实源,即便 disabled 状态
    // 在 React 批处理中被绕过,这里也兜底拒绝。
    if (!validation.valid) return;
    // FR-20: valid seed 写入 localStorage(供 reuse-last-seed 用)。
    // 之前在 validateSelection 里写,改成 start 时写:避免每次 render 无谓
    // 写盘;validateSelection 也回到纯函数。Safari 隐私模式 / 禁用 storage
    // 走 try/catch,QuotaExceeded 不影响流程。
    if (levelSource === 'seed' && isStorageAvailable()) {
      try { localStorage.setItem(LAST_SEED_KEY, seedInput); } catch { /* quota */ }
    }
    onPick(validation.id, validation.options);
  };

  const showSublevel = levelSource === 'teaching' || levelSource === 'custom';
  const showProceduralFields = levelSource === 'random' || levelSource === 'seed';
  const showSeedFields = levelSource === 'seed';
  const isSurvive = mode === 'survive';

  return (
    <div
      data-testid="level-select-root"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2>选择关卡</h2>
        {error && <p style={{ color: 'var(--danger)', maxWidth: 480, textAlign: 'center' }}>{error}</p>}

        {/* P2-6 FR-1: 主关卡来源 dropdown。 */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span>关卡来源</span>
          <select
            data-testid="level-source-select"
            className="level-select-select"
            value={levelSource}
            onChange={(e) => {
              // F-D-quality-D-16: same pattern as EditorPropertiesPanel —
              // raw <select> value is `string`; validate against the
              // whitelist before narrowing to the literal union.
              const v = e.target.value;
              if (isLevelSource(v)) setLevelSource(v);
            }}
            aria-label="关卡来源"
          >
            {LEVEL_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} data-testid={opt.testId}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* P2-6 FR-2: sublevel dropdown (teaching 列表 / custom 列表)。 */}
        {showSublevel && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>{levelSource === 'teaching' ? '教学关' : '我的关卡'}</span>
            <select
              data-testid="sublevel-select"
              className="level-select-select"
              value={effectiveSublevelId ?? ''}
              onChange={(e) => {
                // F-B-ui-M-7: cache the explicit user pick for the active
                // source. See lastSublevelBySourceRef comment above for why
                // this is the only legitimate write path.
                const next = e.target.value || null;
                lastSublevelBySourceRef.current[levelSource] = next;
                setSublevelId(next);
              }}
              disabled={sublevelOptions.length === 0}
              aria-label="子关卡"
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
          </label>
        )}

        {/* P2-6 FR-16: procedural-controls 是 top-level container,永远在
            DOM 里(让 e2e 稳定定位)。里面内容按 showProceduralFields 切换,
            避免教学/我的关卡也显示一坨无关的算法选项。 */}
        <fieldset
          data-testid="procedural-controls"
          style={{ border: '1px solid var(--muted)', borderRadius: 6, padding: 12 }}
        >
          <legend style={{ fontSize: 13, fontWeight: 600 }}>程序生成设置</legend>
          {showProceduralFields ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                columnGap: 12,
                rowGap: 10,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13 }}>游戏模式</span>
              <select
                data-testid="mode-select"
                className="level-select-select"
                value={mode}
                onChange={(e) => {
                  // F-D-quality-HIGH-2: validate raw event value against
                  // the VictoryType whitelist; silently ignore unknown
                  // values rather than silently widening state.
                  const v = e.target.value;
                  if (isVictoryType(v)) setMode(v);
                }}
                aria-label="游戏模式"
              >
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} data-testid={opt.testId}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <span style={{ fontSize: 13 }}>迷宫尺寸</span>
              <select
                data-testid="size-select"
                className="level-select-select"
                value={selectedSize}
                onChange={(e) => {
                  // F-D-quality-D-16: numeric <select> value comes from
                  // Number(string) which yields NaN for empty / non-numeric
                  // input; isMazeSize rejects NaN and sizes outside the
                  // 15 / 30 / 50 enum.
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
                <SurviveSettingsPanel
                  enemyCount={enemyCount}
                  setEnemyCount={setEnemyCount}
                  surviveSecondsInput={surviveSecondsInput}
                  setSurviveSecondsInput={setSurviveSecondsInput}
                  surviveSecondsError={surviveSecondsError}
                  setSurviveSecondsError={setSurviveSecondsError}
                  progressive={progressive}
                  setProgressive={setProgressive}
                  progressiveMax={progressiveMax}
                  setProgressiveMax={setProgressiveMax}
                />
              ) : (
                <>
                  <span />
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>当前模式无敌人</p>
                </>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              教学关卡 / 我的关卡自带规则,不需要程序生成设置。
            </p>
          )}
        </fieldset>

        {/* P2-6 FR-10: specified-seed section 是 top-level container,永远
            在 DOM 里(FR-16 兼容性)。seed-input + reuse-last-seed 仅在
            showSeedFields 时渲染。 */}
        <section
          data-testid="specified-seed-section"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}
        >
          <h3>指定种子</h3>
          {showSeedFields && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Seed (16 hex)</span>
                <input
                  data-testid="seed-input"
                  aria-label="seed"
                  value={seedInput}
                  onChange={(e) => {
                    // FR-21: 实时 strip 非 hex,lowercase 归一,限长 16。
                    const stripped = e.target.value
                      .toLowerCase()
                      .replace(/[^0-9a-f]/g, '')
                      .slice(0, 16);
                    setSeedInput(stripped);
                  }}
                  placeholder="0123456789abcdef"
                  style={{ fontFamily: 'monospace', padding: '6px 10px', minWidth: 220 }}
                />
              </label>
              <Button
                variant="secondary"
                onClick={() => {
                  if (isStorageAvailable()) {
                    const last = localStorage.getItem(LAST_SEED_KEY);
                    if (last && HEX_RE.test(last)) {
                      setSeedInput(last);
                    }
                  }
                }}
                data-testid="reuse-last-seed"
              >
                使用上次 seed
              </Button>
            </>
          )}
        </section>

        {/* P2-6 FR-9: custom-levels-group 是 top-level container,永远在
            DOM 里(FR-16 兼容性)。每行是 metadata + delete 按钮;点击 row
            走 onPick 的路径是 source=custom + sublevel=id + start-button。 */}
        <section
          data-testid="custom-levels-group"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}
        >
          <h3>我的关卡</h3>
          {customDefs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {customDefs.map((lv) => (
                <div
                  key={lv.id}
                  data-testid={`custom-level-${lv.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <span style={{ fontSize: 14 }}>{lv.name}</span>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{lv.size}</span>
                  <button
                    type="button"
                    onClick={async () => {
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
          )}
        </section>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Button
            data-testid="start-button"
            onClick={handleStart}
            disabled={startDisabled}
            hoverStyle="lift"
          >
            进入游戏
          </Button>
          <Button onClick={onBack} variant="secondary">返回</Button>
        </div>
      </div>
    </div>
  );
}
