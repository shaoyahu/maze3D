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
  'overlays.win.subtitle': 'You found the exit',
  'overlays.win.timeUsed': 'Time {time}',
  // P2-13.9: label-only keys for StatTile labels (decoupled from the
  // value-bearing .timeUsed / .pickups / .best).
  'overlays.win.timeLabel': 'Time used',
  'overlays.win.pickupsLabel': 'Collected',
  'overlays.win.bestLabel': 'Best',
  'overlays.win.pickups': 'Collected {collected} / {total}',
  'overlays.win.best': 'Personal best {time}',
  'overlays.win.newRecord': 'New record!',
  'overlays.win.retry': 'Replay',
  'overlays.win.next': 'Next Level',
  'overlays.win.toLevels': 'Choose Level',
  'overlays.win.backToMenu': 'Back to Main Menu',

  // P2-11: caught-by-enemy tutorial completion path (哨兵回廊).
  'overlays.win.caught.title': 'Caught — Tutorial Complete',
  'overlays.win.caught.subtitle': 'You experienced the chase. Next: Final Trial',

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

  // P2-12: levels.delete.* removed — see zh.ts.

  'levels.stat.best': 'Best',
  'levels.stat.collected': 'Got',
  'levels.stat.size': 'Size',
  'levels.stat.walls': 'Walls',

  'levels.victory.reachExit': 'Reach Exit',
  'levels.victory.timeTrial': 'Time Trial',
  'levels.victory.survive': 'Survive',
  'levels.victory.caughtByEnemy': 'Caught by Enemy',

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
  // F-P2-9: hint text no longer repeats "right-click drag to pan" —
  // surfaced separately via the persistent pan-hint banner that
  // appears whenever the pan tool is active (see EditorViewport.tsx).
  'editor.toolbar.hint.wall': 'Click a cell to place a wall',
  'editor.toolbar.hint.erase': 'Click a wall cell to carve a passage (turn it into floor)',
  'editor.toolbar.hint.start': 'Click a cell to set the player start',
  'editor.toolbar.hint.exit': 'Click a cell to set the exit',
  'editor.toolbar.hint.pickup': 'Click a floor cell to place an item',
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
  // P2-13.9: EditorViewport copy (was hard-coded Chinese — would show
  // Chinese under an English locale).
  'editor.viewport.empty': 'Empty grid',
  'editor.viewport.emptySub': 'Pick a tool · click a cell to start placing',
  'editor.viewport.panHintTitle': 'Pan mode',
  'editor.viewport.panHintDrag': 'Hold left or right mouse button and drag on the canvas to move the view',
  'editor.viewport.panHintSub': 'Wheel to zoom · ESC to exit',
  'editor.viewport.zoomOutAria': 'Zoom out',
  'editor.viewport.zoomInAria': 'Zoom in',
  'editor.viewport.minimapAria': 'Minimap',
  'editor.toolbar.importAria': 'Import level file',
  // P2-13: mirror of zh.ts — top toolbar button labels.
  'editor.toolbar.tool.select': 'Select',
  'editor.toolbar.tool.wall': 'Wall',
  'editor.toolbar.tool.erase': 'Carve',
  'editor.toolbar.tool.start': 'Start',
  'editor.toolbar.tool.exit': 'Exit',
  'editor.toolbar.tool.pickup': 'Item',
  'editor.toolbar.tool.enemy': 'Enemy',
  'editor.toolbar.tool.pan': 'Pan',
  'editor.toolbar.undo': 'Undo',
  'editor.toolbar.redo': 'Redo',
  // P2-13: mirror of zh.ts — left-panel file tree copy.
  'editor.leftPanel.newLevel': 'Level',
  'editor.leftPanel.newFolder': 'Folder',
  'editor.leftPanel.empty': 'No levels yet · click [Level] to start',
  'editor.leftPanel.folderNamePrompt': 'Folder name',
  'editor.leftPanel.untitledFolder': 'Untitled folder',
  'editor.leftPanel.renamePrompt': 'Rename',
  'editor.leftPanel.renameLevelPrompt': 'Level name',
  // F-2026-06-17-L-2: surface rename persist failures.
  'editor.leftPanel.renameFailedTitle': 'Rename failed',
  'editor.leftPanel.renameFailedMessage': "Couldn't save the new name: {reason}",
  'editor.leftPanel.delete': 'Delete',
  'editor.leftPanel.rename': 'Rename',
  'editor.leftPanel.moveTo': 'Move to',
  'editor.leftPanel.menu': 'More',
  'editor.leftPanel.deleteFolderTitle': 'Delete folder',
  'editor.leftPanel.deleteFolderMessage': 'Delete "{name}"? All levels and subfolders inside it will be deleted too.',
  'editor.leftPanel.deleteLevelTitle': 'Delete level',
  'editor.leftPanel.deleteLevelMessage': 'Delete "{name}"? This cannot be undone.',

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
  // F-P2-9: status-bar counter chip relabeled from "Pickups" →
  // "Items" to match the toolbar tool label and the properties-panel
  // card label.
  'editor.status.pickups': 'Items',
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

  // F-P2-9: properties-panel card relabeled from "Pickup" → "Item" for
  // consistency with the toolbar / status-bar labels.
  'editor.properties.pickupCard': 'Item',
  'editor.properties.field.type': 'Type',
  'editor.properties.field.value': 'Value',
  'editor.properties.deletePickup': 'Delete item',

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

  // P2-13.7: tutorial / HUD card i18n (was hard-coded Chinese in P2-11).
  'editor.properties.tutorialCard': 'Tutorial / HUD',
  'editor.properties.tutorialChip': 'tutorial',
  'editor.properties.tutorial.hideMinimap': 'Hide Minimap',
  'editor.properties.tutorial.enemyAggression': 'Enemy chase-speed override',
  'editor.properties.tutorial.aggression.inherit': 'Inherit global setting',
  'editor.properties.tutorial.aggression.easy': 'Easy (1.2x)',
  'editor.properties.tutorial.aggression.medium': 'Medium (1.5x)',
  'editor.properties.tutorial.aggression.hard': 'Hard (1.8x)',
  'editor.properties.tutorial.requireAllPickups': 'Must collect all items',
  'editor.properties.tutorial.stepsLabel': 'Tutorial steps (JSON)',
  // P2-13.x: tutorial card refresh — hero / row descriptions + advanced
  // collapse block copy.
  'editor.properties.tutorial.hero.on': '{count}-step tutorial active',
  'editor.properties.tutorial.hero.off': 'No tutorial configured',
  'editor.properties.tutorial.hero.sub': 'When the player enters the level, the top banner plays these steps in order.',
  'editor.properties.tutorial.hideMinimapDesc': 'Skip the top-right minimap — players rely on spatial memory only.',
  'editor.properties.tutorial.enemyAggressionDesc': 'Override the global enemy chase speed (0.8x–1.8x).',
  'editor.properties.tutorial.requireAllPickupsDesc': 'Every pickup must be collected before the level can be cleared.',
  'editor.properties.tutorial.advancedLabel': 'Advanced · Steps JSON',
  'editor.properties.tutorial.advancedHint': 'Empty = no tutorial. Full schema: docs/increments/p2-11-tutorial-steps.md.',
  'editor.properties.tutorial.advancedStatusIdle': 'Not yet committed',
  'editor.properties.tutorial.advancedStatusOk': 'Saved',
  'editor.properties.tutorial.advancedStatusError': 'Invalid JSON, kept as-is',

  'editor.properties.selectionMissing': 'The selected {thing} no longer exists.',
  // F-P2-9: missing-selection chip text relabeled from "pickup" →
  // "item" to match the new toolbar label.
  'editor.properties.selection.pickup': 'item',
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

  // F-2026-06-15-H-3.1: write-failure messages surfaced by AppShell when
  // record() / saveCustom() / deleteCustom() can't persist. The {reason}
  // placeholder is one of the persist.reason.* messages above.
  'app.error.writeFailedRecord': "Best record couldn't be saved: {reason}",
  'app.error.writeFailedCustomLevel': "Custom level couldn't be saved: {reason}",

  'editor.lastError.wallOnStart': "Can't place a wall on the start cell",
  'editor.lastError.wallOnExit': "Can't place a wall on the exit cell",
  // F-P2-9: dedicated erase / carve tool error channels. Mirror the
  // wallOnStart / wallOnExit keys so the toolbar chip surfaces the
  // i18n key consistently.
  'editor.lastError.eraseOnStart': "Can't erase the start cell (start must stay on floor)",
  'editor.lastError.eraseOnExit': "Can't erase the exit cell (exit must stay on floor)",
  // F-P2-9: pickup-on-wall now surfaces via lastErrorKey instead of
  // the previous silent reject.
  'editor.lastError.pickupOnWall': 'Pickups can only be placed on floor cells — use the Erase tool to carve a passage first',
  // F-2026-06-16-M-2: same-cell duplicate placement now surfaces a
  // distinct i18n key so the toolbar message can name the actual
  // problem (instead of a generic validator error at save time).
  'editor.lastError.pickupDuplicate': 'A pickup already exists on this cell (only one pickup per cell)',
  'editor.lastError.startOutOfBounds': 'Start is out of grid bounds',
  'editor.lastError.exitOutOfBounds': 'Exit is out of grid bounds',
  'editor.lastError.startOnExit': "Start can't overlap the exit cell",
  'editor.lastError.exitOnStart': "Exit can't overlap the start cell",
  'editor.lastError.pathOutOfBounds': 'Path node is out of grid bounds',
  'editor.lastError.pathNotAdjacent': 'Path nodes must be 4-adjacent (up / down / left / right) — diagonals are not allowed',
  'editor.lastError.collideWithStart': 'That cell is already the start',
  'editor.lastError.collideWithExit': 'That cell is already the exit',
  'editor.lastError.collideWithPickup': 'That cell already has a pickup',
  'editor.lastError.collideWithEnemy': 'That cell already has an enemy (or a patrol path node)',

  // F-2026-06-17-E-M-7: design-rule issues rendered in the editor
  // warnings popup. Keys mirror the 8 ValidationIssue.messageKey values
  // emitted by editorValidation.ts; {id} / {value} are the optional
  // interpolation variables carried in `messageVars`.
  'editor.validation.exitUnreachable': 'Exit is unreachable from the start cell',
  'editor.validation.enemyPathTooShort': 'Enemy {id} has a patrol path with fewer than 2 waypoints',
  'editor.validation.startOnWall': 'Start cell is on a wall',
  'editor.validation.exitOnWall': 'Exit cell is on a wall',
  'editor.validation.rules.initialTime': 'initialTime must be > 0 (got {value})',
  'editor.validation.rules.maxHealth': 'maxHealth must be > 0 (got {value})',
  'editor.validation.rules.timeOnPickup': 'timeOnPickup must be > 0 (got {value})',

  // P2-12: mirror of zh.ts — My-Levels drawer copy.
  'editor.mylevels.title': 'My Levels · edit or delete',
  'editor.mylevels.empty': 'No saved levels yet · start by creating one',
  'editor.mylevels.edit': 'Edit',
  'editor.mylevels.delete': 'Delete',
  'editor.mylevels.deleteTitle': 'Delete level',
  'editor.mylevels.deleteMessage': 'Delete "{name}"? This cannot be undone.',

  // ============================================================
  // editor.help.* — Level editor user manual (EditorHelpDrawer copy)
  // ============================================================
  'editor.help.title': 'Level Editor · User Manual',
  'editor.help.closeAria': 'Close the user manual',
  'editor.help.section.tools': '① Tools',
  'editor.help.section.toolsIntro': 'Pick a tool from the left rail, then click a cell on the canvas to place or modify it. Right-click drag to pan; scroll to zoom.',
  'editor.help.section.shortcuts': '② Shortcuts',
  'editor.help.section.flow': '③ Common workflow',
  'editor.help.section.checklist': '④ Pre-save checklist',
  'editor.help.col.tool': 'Tool',
  'editor.help.col.shortcut': 'Shortcut',
  'editor.help.col.action': 'Action',
  'editor.help.col.wheel': 'Mouse wheel',

  'editor.help.tool.select': 'Select',
  'editor.help.tool.selectDesc': 'Click an object to inspect it; click empty space to clear',
  'editor.help.tool.wall': 'Wall',
  'editor.help.tool.wallDesc': 'Set a cell to wall; no-op if already a wall',
  'editor.help.tool.erase': 'Erase',
  'editor.help.tool.eraseDesc': 'Carve a wall back to floor; start/exit cannot be erased',
  'editor.help.tool.start': 'Start',
  'editor.help.tool.startDesc': 'Move the player start to the clicked cell (auto-carves walls)',
  'editor.help.tool.exit': 'Exit',
  'editor.help.tool.exitDesc': 'Move the exit to the clicked cell (auto-carves walls)',
  'editor.help.tool.pickup': 'Item',
  'editor.help.tool.pickupDesc': 'Drop an item on a floor cell; tweak type and value on the right',
  'editor.help.tool.enemy': 'Enemy',
  'editor.help.tool.enemyDesc': 'Place an enemy; click it again to edit its patrol path on the right',
  'editor.help.tool.pan': 'Pan',
  'editor.help.tool.panDesc': 'Hold left or right mouse button and drag to pan; scroll to zoom',

  'editor.help.shortcut.esc': 'Exit current tool / clear selection',
  'editor.help.shortcut.undo': 'Undo',
  'editor.help.shortcut.redo': 'Redo',
  'editor.help.shortcut.wheel': 'Zoom in / out around the cursor',

  'editor.help.flow.step1': '[New] Click "New" in the top bar for a fresh 15×15 all-wall canvas. Start is at the top-left, exit at the bottom-right.',
  'editor.help.flow.step2': '[Carve paths] Switch to the Erase tool, then click cells to carve corridors and branches.',
  'editor.help.flow.step3': '[Drop items] Switch to the Item tool and place time / health / key pickups along the corridors. Tweak values on the right.',
  'editor.help.flow.step4': '[Spawn enemies] Switch to the Enemy tool and click to spawn. Click an existing enemy to edit its patrol waypoints on the right.',
  'editor.help.flow.step5': '[Save] Click "Save" to add the level to "My Levels"; "Save & Exit" returns to the main menu.',

  'editor.help.checklist.reachable': 'Start and exit are connected by an open path (status-bar warnings will flag this).',
  'editor.help.checklist.wallsClosed': 'Walls form a closed perimeter so the player cannot walk off the map.',
  'editor.help.checklist.pickups': 'At least 1-2 pickups so there is something to collect.',
  'editor.help.checklist.enemyPath': 'Each enemy has at least 2 patrol waypoints, otherwise the enemy gets stuck.',
  'editor.help.checklist.rules': 'Victory mode, initial time, and max health are set to sensible values (defaults are fine).',

  // ============================================================
  // common.*
  // ============================================================
  'common.cancel': 'Cancel',
  'common.confirm': 'OK',
  'common.back': 'Back',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.moreSuffix': ' (+{count} more)',

  // ============================================================
  // tutorial.teaching0N.stepM — tutorial banner copy
  // ============================================================
  'tutorial.teaching01.step1': 'Move the mouse to look around',
  'tutorial.teaching01.step2': 'Press W A S D to move',
  'tutorial.teaching01.step3': 'Walk to the exit to finish',
  'tutorial.teaching02.step1': 'Pick up the item on the ground — touch it to collect',
  'tutorial.teaching02.step2': 'Now head to the exit',
  'tutorial.teaching03.step1': 'Enemies patrol — run around the ring',
  'tutorial.teaching03.step2': 'They are faster — getting caught completes the lesson',
  'tutorial.teaching04.step1': 'Final trial — collect every item before the exit counts',
  'tutorial.teaching04.step2': 'All collected — head to the exit',
  'tutorial.teaching04.step3': 'Cleared!',
};