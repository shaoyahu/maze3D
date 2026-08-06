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
  type Algorithm,
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
// P2-21 cleanup (DESIGN DEBT #7): the algorithm dropdown options are
// derived from the registry. Adding a new algorithm now flows in
// lockstep: registry entry → union widening → labelKey in i18n
// resources → this dropdown picks it up automatically.
import { ALGORITHM_REGISTRY } from '../maze/algorithmRegistry';
import { useT } from '../i18n';
import { useSettingsStore } from '../store/settingsStore';
import { getDisplayName } from '../utils/getDisplayName';
import { Dropdown, type DropdownOption } from './components/Dropdown';

export interface LevelDef { id: string; name: string; data?: MazeData }

const LEVEL_SOURCE_OPTIONS: ReadonlyArray<{
  value: LevelSource;
  labelKey: string;
  codename: string;
  testId: string;
}> = [
  { value: 'teaching', labelKey: 'levels.source.teaching', codename: 'T-01', testId: 'level-source-teaching' },
  { value: 'random',   labelKey: 'levels.source.random',   codename: 'R-02', testId: 'level-source-random'   },
  { value: 'custom',   labelKey: 'levels.source.custom',   codename: 'U-03', testId: 'level-source-custom'   },
  { value: 'seed',     labelKey: 'levels.source.seed',     codename: 'S-04', testId: 'level-source-seed'     },
];

const MODE_OPTIONS: ReadonlyArray<{ value: VictoryType; labelKey: string; testId: string }> = [
  { value: 'reach-exit', labelKey: 'levels.mode.reachExit',  testId: 'mode-reach-exit' },
  { value: 'time-trial', labelKey: 'levels.mode.timeTrial',  testId: 'mode-time-trial' },
  { value: 'survive',    labelKey: 'levels.mode.survive',    testId: 'mode-survive'    },
];

const SIZE_OPTIONS: ReadonlyArray<{ value: MazeSize; labelKey: string }> = [
  { value: 15, labelKey: 'levels.size.small'  },
  { value: 30, labelKey: 'levels.size.medium' },
  { value: 50, labelKey: 'levels.size.large'  },
];

const ENEMY_COUNT_OPTIONS: ReadonlyArray<number> = (() => {
  const out: number[] = [];
  for (let i = 0; i <= ENEMY_COUNT_MAX; i++) out.push(i);
  return out;
})();

const HEX_RE = /^[0-9a-f]{16}$/;
const LAST_SEED_KEY = 'maze3d.lastSeed';

// P2-21 cleanup (DESIGN DEBT #7): the dropdown options are derived
// from the single-source-of-truth registry. P2-19/20/21 grew the
// 4-item legacy list to 15 — see ALGORITHM_REGISTRY in
// src/maze/algorithmRegistry.ts for the canonical list. Names match
// the in-jamisbuck convention; values in code use kebab-case.
const ALGORITHM_OPTIONS: ReadonlyArray<{ value: Algorithm; labelKey: string }> =
  ALGORITHM_REGISTRY.map((e) => ({ value: e.id, labelKey: e.labelKey }));

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
  // P2-19: only consulted when levelSource === 'seed'; ignored on the
  // 'random' path (which still uses algorithmForMode(mode) so the
  // mode→algorithm default mapping is preserved).
  selectedAlgorithm: Algorithm;
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
      // P2-19: seed path uses the algorithm picker (not the mode default),
      // so the player can pick e.g. Eller in time-trial. The 'random'
      // path above is intentionally left on algorithmForMode(mode) so
      // existing random-level flows keep the mode→algo mapping.
      algorithm: ctx.selectedAlgorithm,
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

function LevelThumb({ data }: { data: MazeData }) {
  const W = data.size.width;
  const D = data.size.depth;
  const startX = data.start.x;
  const startZ = data.start.z;
  const exitX = data.exit.x;
  const exitZ = data.exit.z;
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
      <rect
        x={startX + 0.1} y={startZ + 0.1} width={0.8} height={0.8}
        fill="var(--ok)"
      />
      <rect
        x={exitX + 0.1} y={exitZ + 0.1} width={0.8} height={0.8}
        fill="var(--danger)"
      />
    </svg>
  );
}

function difficultyOf(data: MazeData | undefined): number {
  if (!data) return 0;
  const cells = data.size.width * data.size.depth;
  const base = cells < 400 ? 1 : cells < 1200 ? 2 : 3;
  const pickupBonus = data.pickups.length > 6 ? 1 : 0;
  const enemyBonus = data.enemies.length > 3 ? 1 : 0;
  return Math.min(5, base + pickupBonus + enemyBonus);
}

function DifficultyBar({ value, t }: { value: number; t: ReturnType<typeof useT> }) {
  return (
    <span className="console-card__difficulty" aria-label={t('levels.difficulty.aria', { value })}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`console-card__difficulty-bar${i < value ? ' console-card__difficulty-bar--on' : ''}`}
        />
      ))}
    </span>
  );
}

const SECTION_TITLE_KEYS: Record<LevelSource, string> = {
  teaching: 'levels.section.teaching',
  random: 'levels.section.random',
  custom: 'levels.section.custom',
  seed: 'levels.section.seed',
};
const SECTION_SUBTITLE_KEYS: Record<LevelSource, string> = {
  teaching: 'levels.section.teachingAlt',
  random: 'levels.section.randomAlt',
  custom: 'levels.section.customAlt',
  seed: 'levels.section.seed',
};
// F-2026-06-17: 'caught-by-enemy' is a teaching-only victory path
// (the label is shown only if a user picks a level whose victory is
// caught-by-enemy, which is currently just teaching-03 哨兵回廊).
// Reuses the same i18n namespace as the other victory labels.
const VICTORY_LABEL_KEYS: Record<VictoryType, string> = {
  'reach-exit': 'levels.victory.reachExit',
  'time-trial': 'levels.victory.timeTrial',
  survive: 'levels.victory.survive',
  'caught-by-enemy': 'levels.victory.caughtByEnemy',
};

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
  const t = useT();
  const locale = useSettingsStore((s) => s.language);
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
  // P2-19: algorithm pick for the "指定种子关卡" path. Initialized to
  // the mode's default algorithm; reset on every mode change (the
  // default mapping between mode and algorithm is the P2-3 contract we
  // do not want to silently break).
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<Algorithm>(
    () => algorithmForMode('time-trial'),
  );

  const customLevels = useLevelStore((s) => s.customLevels);
  const bestByLevel = useLevelStore((s) => s.bestByLevel);
  // P2-12: `deleteCustom` 之前是给 /levels 上"删除自定义关卡"按钮用的,
  // 那个入口已搬到 EditorMyLevelsDrawer。这里只读 customLevels 用于渲染。
  const customDefs = Object.values(customLevels)
    .map((lv) => ({ id: lv.id, name: lv.name, data: lv, size: `${lv.size.width}×${lv.size.depth}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const customLevelIds = customDefs.map((d) => d.id);

  const lastSublevelBySourceRef = useRef<Partial<Record<LevelSource, string | null>>>({});
  useEffect(() => {
    // F-2026-06-15-M-4.10: only reset sublevelId from the cache when there
    // IS a cached value for this source. Without the guard, switching to
    // a source we've never visited (`?? null`) wipes the current pick to
    // null and then the next render's `effectiveSublevelId` falls back to
    // `sublevelOptions[0]?.id` — visually the user sees the first option
    // selected but the state field is null until the user picks again.
    const cached = lastSublevelBySourceRef.current[levelSource];
    if (cached !== undefined) {
      setSublevelId(cached);
    }
  }, [levelSource]);

  useEffect(() => {
    if (!isStorageAvailable()) return;
    const last = localStorage.getItem(LAST_SEED_KEY);
    if (last && HEX_RE.test(last)) setSeedInput(last);
  }, []);

  // P2-19: mode change resets the algorithm pick to that mode's default
  // (P2-3's algorithmForMode mapping). Players can still override the
  // pick manually after switching mode.
  useEffect(() => {
    setSelectedAlgorithm(algorithmForMode(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const sublevelOptions: LevelDef[] = useMemo(() => {
    if (levelSource === 'teaching') return available;
    if (levelSource === 'custom') return customDefs.map((d) => ({ id: d.id, name: d.name, data: d.data }));
    return [];
  }, [levelSource, available, customDefs]);

  const effectiveSublevelId = sublevelId ?? sublevelOptions[0]?.id ?? null;

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
    selectedAlgorithm,
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

  const displayedSeed = levelSource === 'random' ? randomSeed : seedInput;
  const teachingCount = available.length;
  const customCount = customDefs.length;

  // P2-8: localize level display names. For teaching levels, the JSON
  // already carries the canonical name + i18n.en override; for custom
  // levels (editor-created) we fall back to `lv.name` via the same helper.
  const displayName = (lv: { name: string; data?: MazeData }): string =>
    lv.data ? getDisplayName(lv.data, locale) : lv.name;

  return (
    <div data-testid="level-select-root" className="console-shell">
      <div className="console-statusbar">
        <span className="console-statusbar__chip console-statusbar__chip--accent">
          {t('levels.status.version')}
        </span>
        <span className="console-statusbar__divider" />
        <span className="console-statusbar__chip">{t('levels.status.sources', { count: LEVEL_SOURCE_OPTIONS.length })}</span>
        <span className="console-statusbar__chip">{t('levels.status.builtin', { count: teachingCount })}</span>
        <span className="console-statusbar__chip">{t('levels.status.custom', { count: customCount })}</span>
        <span className="console-statusbar__live">
          <span className="console-statusbar__live-dot" />
          {t('levels.status.online')}
        </span>
      </div>

      <div className="console-titleblock">
        <div>
          <h2 className="console-title">
            <span className="console-title__index">MS-01</span>
            <span>{t('levels.title')}</span>
            <span className="console-title__sep" aria-hidden="true">//</span>
            <span style={{ color: 'var(--fg-muted)' }}>{t(SECTION_TITLE_KEYS[levelSource])}</span>
          </h2>
          <p className="console-subtitle">{t(SECTION_SUBTITLE_KEYS[levelSource])}</p>
        </div>
        <Dropdown<LevelSource>
          testId="level-source-select"
          ariaLabel={t('levels.nav.sourceLabel')}
          value={levelSource}
          options={LEVEL_SOURCE_OPTIONS.map<DropdownOption<LevelSource>>((opt) => ({
            value: opt.value,
            label: t(opt.labelKey),
            codename: opt.codename,
          }))}
          onChange={(v) => { if (isLevelSource(v)) setLevelSource(v); }}
          optionTestId={(opt) => LEVEL_SOURCE_OPTIONS.find((o) => o.value === opt.value)?.testId}
          hidden
        />
        <div className="console-title-meta">
          {error ? (
            <span style={{ color: 'var(--danger)' }}>{error}</span>
          ) : (
            <>
              <span>{t('levels.profile.session')}</span>
              <span className="console-title-meta__value">{t('levels.profile.value')}</span>
              <span className="console-statusbar__divider" />
              <span>{t('levels.profile.idLabel')}</span>
              <span className="console-title-meta__value">0xA7F2</span>
            </>
          )}
        </div>
      </div>

      <div className="console-body">
        <nav className="console-rail" aria-label={t('levels.nav.sourceAria')}>
          <span className="console-rail__label">{t('levels.nav.railLabel')}</span>
          {LEVEL_SOURCE_OPTIONS.map((opt) => {
            const active = levelSource === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLevelSource(opt.value)}
                className={`console-rail__tab${active ? ' console-rail__tab--active' : ''}`}
                aria-pressed={active}
                aria-label={t(opt.labelKey)}
              >
                <span>{t(opt.labelKey)}</span>
                <span className="console-rail__tab-codename">{opt.codename}</span>
              </button>
            );
          })}
        </nav>

        <div className="console-main">
          {showSublevel && (
            <>
              <Dropdown<string>
                testId="sublevel-select"
                ariaLabel={t('levels.sublevel.aria')}
                value={effectiveSublevelId ?? ''}
                options={
                  sublevelOptions.length === 0
                    ? [{ value: '', label: t('levels.sublevel.empty'), disabled: true }]
                    : sublevelOptions.map<DropdownOption<string>>((lv) => ({
                        value: lv.id,
                        label: displayName(lv),
                      }))
                }
                onChange={(next) => {
                  const v = next || null;
                  lastSublevelBySourceRef.current[levelSource] = v;
                  setSublevelId(v);
                }}
                optionTestId={(opt) =>
                  opt.value === '' ? 'sublevel-empty' : `sublevel-option-${opt.value}`
                }
                disabled={sublevelOptions.length === 0}
                hidden
              />

              {available.length === 0 ? (
                <div
                  className="console-grid console-grid--empty"
                  style={{ display: levelSource === 'teaching' ? 'flex' : 'none' }}
                >
                  {t('levels.sublevel.emptyTeaching')}
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
                    const name = displayName(lv);
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
                        {/* P2-12: 自定义关卡的"删除"按钮已搬到编辑器内的
                            EditorMyLevelsDrawer;此处不再渲染。卡片保持可点
                            击(进入游戏)。 */}
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
                          <h3 className="console-card__name">{name}</h3>
                          <div className="console-card__stats">
                            <div>
                              <span className="console-card__stat-label">{t('levels.stat.best')}</span>
                              <span className={`console-card__stat-value${best ? ' console-card__stat-value--accent' : ' console-card__stat-value--muted'}`}>
                                {best ? formatTime(best.timeUsed) : '--:--'}
                              </span>
                            </div>
                            <div>
                              <span className="console-card__stat-label">{t('levels.stat.collected')}</span>
                              <span className={`console-card__stat-value${best ? ' console-card__stat-value--ok' : ' console-card__stat-value--muted'}`}>
                                {best ? `${best.collected}/${best.total}` : `--/${pickupCount || '--'}`}
                              </span>
                            </div>
                            <div>
                              <span className="console-card__stat-label">{t('levels.stat.size')}</span>
                              <span className="console-card__stat-value">
                                {lv.data ? `${lv.data.size.width}×${lv.data.size.depth}` : '--'}
                              </span>
                            </div>
                            <div>
                              <span className="console-card__stat-label">{t('levels.stat.walls')}</span>
                              <span className="console-card__stat-value">
                                {wallCount ?? '--'}
                              </span>
                            </div>
                          </div>
                          <div className="console-card__footer">
                            <DifficultyBar value={difficultyOf(lv.data)} t={t} />
                            <span className="console-card__id">
                              {lv.data
                                ? t(VICTORY_LABEL_KEYS[lv.data.rules.victory] ?? 'levels.victory.reachExit')
                                : 'N/A'}
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

          {customDefs.length === 0 ? (
            <div
              className="console-grid console-grid--empty"
              data-testid="custom-levels-group"
              style={{ display: levelSource === 'custom' ? 'flex' : 'none' }}
            >
              {t('levels.sublevel.emptyCustom')}
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
                const name = displayName(lv);
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
                    {/* P2-12: 删除按钮已搬走(见 P2-12.4),此处只渲染卡片。
                        点击 / 键盘聚焦仍能进入游戏 — 决策 C。 */}
                    <div className="console-card__thumb">
                      <LevelThumb data={lv.data} />
                      <span className="console-card__corner console-card__corner--tl" />
                      <span className="console-card__corner console-card__corner--br" />
                    </div>
                    <div className="console-card__body">
                      <span className="console-card__id">
                        ID · {lv.id.toUpperCase()}
                      </span>
                      <h3 className="console-card__name">{name}</h3>
                      <div className="console-card__stats">
                        <div>
                          <span className="console-card__stat-label">{t('levels.stat.best')}</span>
                          <span className={`console-card__stat-value${best ? ' console-card__stat-value--accent' : ' console-card__stat-value--muted'}`}>
                            {best ? formatTime(best.timeUsed) : '--:--'}
                          </span>
                        </div>
                        <div>
                          <span className="console-card__stat-label">{t('levels.stat.collected')}</span>
                          <span className={`console-card__stat-value${best ? ' console-card__stat-value--ok' : ' console-card__stat-value--muted'}`}>
                            {best ? `${best.collected}/${best.total}` : `--/${pickupCount || '--'}`}
                          </span>
                        </div>
                        <div>
                          <span className="console-card__stat-label">{t('levels.stat.size')}</span>
                          <span className="console-card__stat-value">
                            {lv.data ? `${lv.data.size.width}×${lv.data.size.depth}` : '--'}
                          </span>
                        </div>
                        <div>
                          <span className="console-card__stat-label">{t('levels.stat.walls')}</span>
                          <span className="console-card__stat-value">
                            {wallCount ?? '--'}
                          </span>
                        </div>
                      </div>
                      <div className="console-card__footer">
                        <DifficultyBar value={difficultyOf(lv.data)} t={t} />
                        <span className="console-card__id">
                          {lv.data
                            ? t(VICTORY_LABEL_KEYS[lv.data.rules.victory] ?? 'levels.victory.reachExit')
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {showProceduralFields ? (
            <div
              className="console-proc"
              data-testid="procedural-controls"
              style={{ display: 'grid' }}
            >
              <div className="console-proc__panel">
                <h3 className="console-proc__panel-title">{t('levels.panel.generator')}</h3>
                <div>
                  <div className="console-proc__seed-label">{t('levels.seed.label')}</div>
                  <div className="console-proc__seed-readout">
                    <span>0x</span>
                    <span style={{ flex: 1 }}>{displayedSeed || '— — — — — — — —'}</span>
                  </div>
                  <p className="console-proc__seed-hint" style={{ marginTop: 6 }}>
                    {levelSource === 'random'
                      ? t('levels.seed.autoNote')
                      : t('levels.seed.manualNote')}
                  </p>
                </div>
                <div className="console-proc__config-grid">
                  <span className="console-proc__config-label">{t('levels.config.mode')}</span>
                  <Dropdown<VictoryType>
                    testId="mode-select"
                    ariaLabel={t('levels.config.modeAria')}
                    value={mode}
                    options={MODE_OPTIONS.map<DropdownOption<VictoryType>>((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                    onChange={(v) => { if (isVictoryType(v)) setMode(v); }}
                    optionTestId={(opt) => MODE_OPTIONS.find((o) => o.value === opt.value)?.testId}
                    hidden
                  />
                  <div className="console-segmented" role="tablist" aria-label={t('levels.config.modeAria')}>
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
                          {t(opt.labelKey)}
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

                  <span className="console-proc__config-label">{t('levels.config.size')}</span>
                  <Dropdown<MazeSize>
                    testId="size-select"
                    className="console-select"
                    ariaLabel={t('levels.config.sizeAria')}
                    value={selectedSize}
                    options={SIZE_OPTIONS.map<DropdownOption<MazeSize>>((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                      codename: `${opt.value}×${opt.value}`,
                    }))}
                    onChange={(n) => { if (isMazeSize(n)) setSelectedSize(n); }}
                  />

                  {isSurvive ? (
                    <>
                      <span className="console-proc__config-label">{t('levels.config.enemyCount')}</span>
                      <Dropdown<number>
                        testId="enemy-count-select"
                        className="console-select"
                        ariaLabel={t('levels.config.enemyCountAria')}
                        value={enemyCount}
                        options={ENEMY_COUNT_OPTIONS.map<DropdownOption<number>>((n) => ({
                          value: n,
                          label: String(n),
                        }))}
                        onChange={(n) => setEnemyCount(n)}
                        optionTestId={(opt) => `enemy-count-${opt.value}`}
                      />

                      <span className="console-proc__config-label">{t('levels.config.surviveSeconds')}</span>
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
                            aria-label={t('levels.config.surviveSecondsAria')}
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

                      <span className="console-proc__config-label">{t('levels.config.progressive')}</span>
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
                            {t('levels.config.progressiveHint', { interval: SPAWN_SCHEDULE_DEFAULT.intervalSec })}
                          </span>
                        </span>
                      </label>

                      {progressive && (
                        <>
                          <span className="console-proc__config-label">{t('levels.config.progressiveMax')}</span>
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
                              aria-label={t('levels.config.progressiveMaxAria')}
                              className="console-stepper__input"
                            />
                            <span className="console-stepper__unit">MAX</span>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="console-proc__config-label console-proc__config-label--full">
                      {t('levels.config.noEnemyForMode')}
                    </span>
                  )}
                </div>
              </div>

              <div className="console-proc__panel">
                <h3 className="console-proc__panel-title">{t('levels.panel.brief')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div className="console-proc__seed-label">{t('levels.brief.mode')}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--fg)' }}>
                      {t(MODE_OPTIONS.find((o) => o.value === mode)?.labelKey ?? '')}
                    </div>
                  </div>
                  <div>
                    <div className="console-proc__seed-label">{t('levels.brief.algorithm')}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>
                      {algorithmForMode(mode)}
                    </div>
                  </div>
                  <div>
                    <div className="console-proc__seed-label">{t('levels.brief.grid')}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                      {selectedSize} × {selectedSize} · {selectedSize * selectedSize} cells
                    </div>
                  </div>
                  {isSurvive && (
                    <div>
                      <div className="console-proc__seed-label">{t('levels.brief.survive')}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatTime(surviveSecondsInput)} · {enemyCount} enemy{progressive ? ` · progressive` : ''}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="console-proc__seed-label">{t('levels.brief.idPreview')}</div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)',
                      wordBreak: 'break-all', lineHeight: 1.4, padding: 8,
                      background: 'var(--bg-inset)', borderRadius: 3, border: '1px solid var(--border)',
                    }}>
                      {validation.valid ? validation.id : t('levels.brief.waiting')}
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
                  <h3 className="console-proc__panel-title">{t('levels.panel.seedInput')}</h3>
                  {/* P2-19: algorithm picker for the seed path. The 4 legacy
                      algorithms (P2-3) sit alongside the 4 new ones; the
                      default is `algorithmForMode(mode)` and the picker
                      resets whenever `mode` changes. */}
                  <div className="console-proc__seed-label">{t('levels.algorithm.label')}</div>
                  <Dropdown<Algorithm>
                    testId="algorithm-select"
                    className="console-select"
                    ariaLabel={t('levels.algorithm.label')}
                    value={selectedAlgorithm}
                    options={ALGORITHM_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                    onChange={(v) => setSelectedAlgorithm(v)}
                    optionTestId={(opt) => `algorithm-${opt.value}`}
                  />
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
                    {t('levels.seedInput.useLast')}
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

      <div className="console-action-row">
        <span className="console-action-row__hint">
          {t('levels.action.hint', { enter: 'Enter', esc: 'Esc' })}
        </span>
        <div className="console-action-row__buttons">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('levels.action.back')}
            className="console-ghost-btn"
          >
            {t('levels.action.back')}
          </button>
          <button
            type="button"
            data-testid="start-button"
            onClick={handleStart}
            disabled={startDisabled}
            className="console-primary-btn"
          >
            <span>{t('levels.action.enter')}</span>
            <span className="console-primary-btn__arrow">▶</span>
          </button>
        </div>
      </div>
    </div>
  );
}