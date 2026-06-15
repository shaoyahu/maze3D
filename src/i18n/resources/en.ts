import type { Translations } from '../types';

/**
 * P2-8: English translations. Mirrors `zh.ts` exactly — the key set must
 * be identical (enforced by `__tests__/keysParity.test.ts`).
 *
 * Strings are translated by hand; placeholder syntax is `{name}`,
 * matching the regex used by `getT`.
 */
export const en: Translations = {
  // ============================================================
  // app.*
  // ============================================================
  'app.menu.title': '3D Maze',
  'app.menu.tagline': 'Find the exit before time runs out',
  'app.menu.start': 'Start',
  'app.menu.editor': 'Level Editor',
  'app.menu.settings': 'Settings',

  'app.error.bannerClose': 'Close',
  'app.error.bannerCloseAria': 'Dismiss notice',
  'app.error.recordsMigration': 'Best-record load failed: {msg}',
  'app.error.customsMigration': 'Custom level load failed: {msg}',
  'app.error.recordsDropped': '{count} best records skipped due to incompatible format: {ids}{more}',
  'app.error.customsDropped': '{count} custom levels skipped due to incompatible format: {ids}{more}',
  'app.error.levelLoadFailed': 'Level load failed: {msg}',
  'app.error.levelGenFailed': 'Level generation failed: {msg}',
  'app.error.levelUrlInvalid': 'Invalid level URL: {msg}',
  'app.error.backToMenu': 'Back to Main Menu',
  'app.error.pointerLockFailed': 'Cannot lock the mouse; check your browser settings and try again',

  // ============================================================
  // controls.*
  // ============================================================
  'controls.move': 'Move',
  'controls.look': 'Look',
  'controls.pause': 'Pause',
  'controls.releaseMouse': 'Release mouse',

  // ============================================================
  // hud.*
  // ============================================================
  'hud.enemyCount': 'Enemies {current} / {max}',

  // ============================================================
  // overlays.*
  // ============================================================
  'overlays.pause.title': 'Paused',
  'overlays.pause.collected': 'Collected: {collected} / {total}',
  'overlays.pause.best': 'Personal best: {time}',
  'overlays.pause.resume': 'Resume',
  'overlays.pause.settings': 'Settings',
  'overlays.pause.backToMenu': 'Back to Main Menu',

  'overlays.win.title': 'Clear!',
  'overlays.win.timeUsed': 'Time {time}',
  'overlays.win.pickups': 'Collected {collected} / {total}',
  'overlays.win.best': 'Personal best {time}',
  'overlays.win.newRecord': 'New record!',
  'overlays.win.retry': 'Replay',
  'overlays.win.next': 'Next Level',
  'overlays.win.backToMenu': 'Back to Main Menu',

  'overlays.gameOver.titleSurvive': 'You fell',
  'overlays.gameOver.titleTimeTrial': "Time's up!",
  'overlays.gameOver.survived': 'Survived {time}',
  'overlays.gameOver.hitCount': 'Hits taken: {count}',
  'overlays.gameOver.retry': 'Retry',
  'overlays.gameOver.backToMenu': 'Back to Main Menu',

  // ============================================================
  // settings.*
  // ============================================================
  'settings.title': 'Settings',
  'settings.subtitle': 'Calibration & display · preferences',
  'settings.status.version': 'Settings v1.0',
  'settings.status.groupCount': '{count} groups',
  'settings.status.fov': 'FOV {fov}°',
  'settings.status.sens': 'Sensitivity {sens}',
  'settings.status.calibrated': 'Calibrated',
  'settings.nav.label': 'Settings groups',
  'settings.nav.sections': 'Groups',
  'settings.profile.label': 'Profile',
  'settings.profile.value': 'Player-01',
  'settings.version.label': 'Version',
  'settings.version.value': '2026.06',

  'settings.section.display': 'Display',
  'settings.section.input': 'Controls',
  'settings.section.gameplay': 'Gameplay',
  'settings.codename.display': 'D-01 // Display',
  'settings.codename.input': 'I-02 // Input',
  'settings.codename.gameplay': 'G-03 // Behavior',

  'settings.darkMode.label': 'Dark Mode',
  'settings.darkMode.desc': 'Toggle dark/light theme; applied to every surface and the HUD',
  'settings.darkMode.aria': 'Dark Mode',

  'settings.fov.label': 'Field of View',
  'settings.fov.desc': 'Camera vertical FOV — wider sees more, but distant objects look smaller',
  'settings.fov.aria': 'Field of View',
  'settings.fov.value': '{fov}°',

  'settings.sens.label': 'Mouse Sensitivity',
  'settings.sens.desc': 'Look angular speed (rad/pixel) — higher means more responsive',
  'settings.sens.aria': 'Mouse Sensitivity',
  'settings.sens.value': '{sens} rad/px',

  'settings.aggression.label': 'Enemy Aggression',
  'settings.aggression.desc': 'Enemy chase-speed multiplier when they spot you (1.0x = same as player)',
  'settings.aggression.aria': 'Enemy Aggression',
  'settings.aggression.easy': 'Easy',
  'settings.aggression.easyDesc': 'Slow reactions',
  'settings.aggression.medium': 'Medium',
  'settings.aggression.mediumDesc': 'Standard',
  'settings.aggression.hard': 'Hard',
  'settings.aggression.hardDesc': 'High-pressure chase',

  'settings.locale.label': 'Language',
  'settings.locale.desc': 'UI language; takes effect immediately',
  'settings.locale.aria': 'Language',
  'settings.locale.zh': '中文',
  'settings.locale.en': 'English',

  'settings.action.hint': 'Press {key} to apply and go back',
  'settings.action.back': 'Back',

  // ============================================================
  // levels.*
  // ============================================================
  'levels.title': 'Select Level',
  'levels.status.version': 'Level Select v1.0',
  'levels.status.sources': '{count} sources',
  'levels.status.builtin': 'Built-in {count}',
  'levels.status.custom': 'Custom {count}',
  'levels.status.online': 'Online',

  'levels.section.teaching': 'Mission Briefing',
  'levels.section.teachingAlt': 'Mission Briefing // Index',
  'levels.section.random': 'Procedural',
  'levels.section.randomAlt': 'Procedural Generator',
  'levels.section.custom': 'My Levels',
  'levels.section.customAlt': 'User Creations',
  'levels.section.seed': 'Specified Seed',

  'levels.source.teaching': 'Built-in',
  'levels.source.random': 'Random',
  'levels.source.custom': 'Mine',
  'levels.source.seed': 'Seed',

  'levels.mode.reachExit': 'Reach Exit',
  'levels.mode.timeTrial': 'Time Trial',
  'levels.mode.survive': 'Survive',

  'levels.size.small': '15×15 (Small)',
  'levels.size.medium': '30×30 (Medium)',
  'levels.size.large': '50×50 (Large)',

  'levels.difficulty.aria': 'Difficulty {value}/5',

  'levels.profile.session': 'Session',
  'levels.profile.value': 'Player-01',
  'levels.profile.idLabel': 'ID',

  'levels.nav.sourceLabel': 'Level source',
  'levels.nav.sourceAria': 'Level source',
  'levels.nav.railLabel': 'Source',

  'levels.sublevel.aria': 'Sub-level',
  'levels.sublevel.empty': 'No options',
  'levels.sublevel.emptyTeaching': '// No built-in levels //',
  'levels.sublevel.emptyCustom': '// No user levels // create your first one in the editor',

  'levels.delete.confirmTitle': 'Delete Level',
  'levels.delete.confirmMessage': 'Delete “{name}”? This cannot be undone.',
  'levels.delete.cancel': 'Cancel',
  'levels.delete.ok': 'Delete',
  'levels.delete.aria': 'Delete {name}',

  'levels.stat.best': 'Best',
  'levels.stat.collected': 'Got',
  'levels.stat.size': 'Size',
  'levels.stat.walls': 'Walls',

  'levels.victory.reachExit': 'Reach Exit',
  'levels.victory.timeTrial': 'Time Trial',
  'levels.victory.survive': 'Survive',

  'levels.panel.generator': 'Generator',
  'levels.panel.brief': 'Mission Briefing',
  'levels.panel.seedInput': 'Seed Input',

  'levels.seed.label': 'Seed · 64-bit HEX',
  'levels.seed.autoNote': '// Auto-generated · reshuffles when you switch source',
  'levels.seed.manualNote': '// 16-digit hex · case-insensitive · live filter',

  'levels.config.mode': 'Game Mode',
  'levels.config.modeAria': 'Game Mode',
  'levels.config.size': 'Maze Size',
  'levels.config.sizeAria': 'Maze Size',
  'levels.config.enemyCount': 'Enemy Count',
  'levels.config.enemyCountAria': 'Enemy Count',
  'levels.config.surviveSeconds': 'Survive Seconds',
  'levels.config.surviveSecondsAria': 'Survive Seconds',
  'levels.config.progressive': 'Progressive Spawn',
  'levels.config.progressiveHint': 'every {interval}s + every pickup +1',
  'levels.config.progressiveMax': 'Spawn Cap',
  'levels.config.progressiveMaxAria': 'Spawn Cap',
  'levels.config.noEnemyForMode': 'No enemies in this mode',

  'levels.brief.mode': 'Mode',
  'levels.brief.algorithm': 'Algorithm',
  'levels.brief.grid': 'Grid',
  'levels.brief.survive': 'Survive',
  'levels.brief.idPreview': 'ID Preview',
  'levels.brief.waiting': '— Awaiting valid input —',

  'levels.seedInput.useLast': '↻ Reuse last seed',
  'levels.action.hint': 'Press {enter} to start · {esc} to quit',
  'levels.action.back': 'Back',
  'levels.action.enter': 'Start Game',

  // ============================================================
  // editor.toolbar.*
  // ============================================================
  'editor.toolbar.hint.select': 'Click an object to inspect its properties',
  'editor.toolbar.hint.wall': 'Click a cell to place a wall · right-click drag to pan',
  'editor.toolbar.hint.start': 'Click a cell to set the player start',
  'editor.toolbar.hint.exit': 'Click a cell to set the exit',
  'editor.toolbar.hint.pickup': 'Click a cell to place a pickup',
  'editor.toolbar.hint.enemy': 'Click a cell to place an enemy · edit its path on the right',
  'editor.toolbar.hint.pan': 'Right-click drag to pan',

  'editor.toolbar.autoSaved': 'Auto-saved at {time}',
  'editor.toolbar.autoSaveError': 'Auto-save failed: {msg}',
  'editor.toolbar.dirtyExitTitle': 'Unsaved changes',
  'editor.toolbar.dirtyNewMessage': 'You have unsaved changes. Create a new level anyway?',
  'editor.toolbar.dirtyImportMessage': 'You have unsaved changes. Import anyway?',
  'editor.toolbar.ok': 'OK',

  'editor.toolbar.newEmpty': 'New empty 15×15 level',
  'editor.toolbar.saved': 'Saved',
  'editor.toolbar.saveError': 'Save failed: {reason}',
  'editor.toolbar.exported': 'Exported {filename}',
  'editor.toolbar.imported': 'Imported {filename}',
  'editor.toolbar.importError': 'Import failed: {msg}',

  'editor.toolbar.nameTitle': 'Max 64 chars; newlines become spaces',
  'editor.toolbar.nameAria': 'Level name',
  'editor.toolbar.unsaved': 'Unsaved',
  'editor.toolbar.savedTime': 'Saved · {time}',

  'editor.toolbar.new': 'New',
  'editor.toolbar.save': 'Save',
  'editor.toolbar.saveAndExit': 'Save & Exit',
  'editor.toolbar.export': 'Export',
  'editor.toolbar.import': 'Import',
  'editor.toolbar.exitTitle': 'Exit editor',
  'editor.toolbar.exit': 'Exit',
  'editor.toolbar.importAria': 'Import level file',

  // ============================================================
  // editor.status.*
  // ============================================================
  'editor.status.issues': 'Level check · {count} item(s)',
  'editor.status.closeAria': 'Close',
  'editor.status.empty': 'No issues',
  'editor.status.dirty': 'Unsaved',
  'editor.status.notModified': 'Untouched',
  'editor.status.savedAt': 'Saved at {time}',
  'editor.status.viewIssues': 'View {count} issue(s)',
  'editor.status.viewIssuesEmpty': 'View issues (none right now)',
  'editor.status.issuesTitle': 'Click for the detailed issue list',
  'editor.status.problems': 'Issues',
  'editor.status.warnings': 'Warnings',
  'editor.status.walls': 'Walls',
  'editor.status.pickups': 'Pickups',
  'editor.status.enemies': 'Enemies',
  'editor.status.storageHintCloseAria': 'Got it — dismiss storage notice',

  // ============================================================
  // editor.properties.*
  // ============================================================
  'editor.properties.pickupType.time': 'Time',
  'editor.properties.pickupType.health': 'Health',
  'editor.properties.pickupType.key': 'Key',

  'editor.properties.metaCard': 'Level Metadata',
  'editor.properties.metaChip': 'META',
  'editor.properties.field.name': 'Name',
  'editor.properties.field.grid': 'Grid Size',
  'editor.properties.field.width': 'Width W',
  'editor.properties.field.depth': 'Depth D',
  'editor.properties.unit.cell': 'cells',

  'editor.properties.rulesCard': 'Rules',
  'editor.properties.rulesChip': 'RULES',
  'editor.properties.field.initialTime': 'Initial Time',
  'editor.properties.unit.second': 's',
  'editor.properties.field.maxHealth': 'Max Health',
  'editor.properties.field.timeOnPickup': 'Pickup +Time',
  'editor.properties.field.victory': 'Victory Condition',

  'editor.properties.panelTitle': 'Level Properties',

  'editor.properties.pickupCard': 'Pickup',
  'editor.properties.field.type': 'Type',
  'editor.properties.field.value': 'Value',
  'editor.properties.deletePickup': 'Delete pickup',

  'editor.properties.enemyCard': 'Enemy',
  'editor.properties.field.spawn': 'Spawn',
  'editor.properties.pathNodes': 'Patrol path · {count} nodes',
  'editor.properties.removeNodeAria': 'Remove node {index}',
  'editor.properties.addNode': '+ Add node',
  'editor.properties.field.dwellTime': 'Dwell Time',
  'editor.properties.field.viewRange': 'Sight Range',
  'editor.properties.field.viewAngle': 'Sight Angle',
  'editor.properties.deleteEnemy': 'Delete enemy',

  'editor.properties.wallCard': 'Wall',
  'editor.properties.field.coord': 'Coords',
  'editor.properties.deleteWall': 'Delete wall',

  'editor.properties.selectionMissing': 'The selected {thing} no longer exists.',
  'editor.properties.selection.pickup': 'pickup',
  'editor.properties.selection.enemy': 'enemy',

  'editor.properties.minusAria': 'Decrease',
  'editor.properties.plusAria': 'Increase',

  // ============================================================
  // editor.dirtyExit.*
  // ============================================================
  'editor.dirtyExit.title': 'Unsaved changes',
  'editor.dirtyExit.message': 'You have unsaved changes. Choose an action — "Keep editing" stays on this page.',
  'editor.dirtyExit.save': 'Save & Exit',
  'editor.dirtyExit.discard': 'Discard',
  'editor.dirtyExit.cancel': 'Keep editing',

  // ============================================================
  // editor.draft.*
  // ============================================================
  'editor.draft.title': 'Restore draft?',
  'editor.draft.message': 'We found an unsaved draft from your last session. Restore it?',
  'editor.draft.discard': 'Discard',
  'editor.draft.restore': 'Restore',

  // ============================================================
  // editor.persist.*
  // ============================================================
  'editor.persist.reason.unavailable': 'Browser storage is unavailable — auto-save has been disabled',
  'editor.persist.reason.tooLarge': 'This level is too large — auto-save skipped (remove pickups/enemies or shrink the map)',
  'editor.persist.reason.quota': 'Local storage is full — auto-save failed (delete some old levels and try again)',
  'editor.persist.reason.serialization': 'The level data could not be serialized — auto-save failed',

  'editor.lastError.wallOnStart': "Can't place a wall on the start cell",
  'editor.lastError.wallOnExit': "Can't place a wall on the exit cell",
  'editor.lastError.startOutOfBounds': 'Start is out of grid bounds',
  'editor.lastError.exitOutOfBounds': 'Exit is out of grid bounds',
  'editor.lastError.pathOutOfBounds': 'Path node is out of grid bounds',

  // ============================================================
  // common.*
  // ============================================================
  'common.cancel': 'Cancel',
  'common.confirm': 'OK',
  'common.back': 'Back',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.moreSuffix': ' (+{count} more)',
};