import type { Translations } from '../types';

/**
 * P2-8: 中文翻译资源（规范源）。
 *
 * 所有面向用户的中文字符串都必须从源码迁移到这里。
 * 命名约定：`<domain>.<entity>.<field>`，例如 `app.menu.title` / `settings.darkMode.label`。
 * 同一 key 在 `en.ts` 必须存在（由 `__tests__/keysParity.test.ts` 强制）。
 *
 * 来源（按文件）：
 *   - src/ui/App.tsx
 *   - src/ui/MainMenu.tsx
 *   - src/ui/PauseOverlay.tsx / WinOverlay.tsx / GameOverOverlay.tsx
 *   - src/ui/GameCanvas.tsx
 *   - src/ui/Settings.tsx
 *   - src/ui/LevelSelect.tsx
 *   - src/ui/components/ControlHints.tsx / EnemyCounter.tsx
 *   - src/ui/editor/EditorTopBar.tsx / EditorStatusBar.tsx / EditorPropertiesPanel.tsx / EditorPage.tsx
 *   - src/store/editorStore.ts（lastError + persist reason）
 *
 * 占位符语法：`{name}` — 与 `getT` 实现的正则 `/\{(\w+)\}/g` 一致。
 */
export const zh: Translations = {
  // ============================================================
  // app.* — App 根 + 全局错误兜底
  // ============================================================
  'app.menu.title': '3D 迷宫',
  'app.menu.tagline': '在限时内找到出口',
  'app.menu.start': '开始',
  'app.menu.editor': '关卡编辑器',
  'app.menu.settings': '设置',

  'app.error.bannerClose': '关闭',
  'app.error.bannerCloseAria': '关闭提示',
  'app.error.recordsMigration': '最佳成绩加载失败：{msg}',
  'app.error.customsMigration': '自定义关卡加载失败：{msg}',
  'app.error.recordsDropped': '{count} 个最佳成绩因格式不兼容而跳过：{ids}{more}',
  'app.error.customsDropped': '{count} 个自定义关卡因格式不兼容而跳过：{ids}{more}',
  'app.error.levelLoadFailed': '关卡加载失败：{msg}',
  'app.error.levelGenFailed': '关卡生成失败：{msg}',
  'app.error.levelUrlInvalid': '关卡 URL 不合法：{msg}',
  'app.error.backToMenu': '返回主菜单',
  'app.error.pointerLockFailed': '无法锁定鼠标，请检查浏览器设置后重试',

  // ============================================================
  // controls.* — HUD 控制提示
  // ============================================================
  'controls.move': '移动',
  'controls.look': '视角',
  'controls.pause': '暂停',
  'controls.releaseMouse': '释放鼠标',

  // ============================================================
  // hud.* — HUD 数值显示
  // ============================================================
  'hud.enemyCount': '敌人 {current} / {max}',
  // P3-1: 层指示器。P3-1a 只占位 key（实际 HUD 组件由 P3-1c 接）。
  // 两种形式：`.label` 是完整的「第 N 层」，`.short` 是 LevelSelect
  // 下拉里那种紧凑「L{N}」徽章（与关卡尺寸风格一致）。
  'hud.levelIndicator.label': '第 {level} 层',
  'hud.levelIndicator.short': 'L{level}',

  // ============================================================
  // overlays.pause/win/gameOver — 暂停 / 通关 / 失败遮罩
  // ============================================================
  'overlays.pause.title': '已暂停',
  'overlays.pause.collected': '已收集: {collected} / {total}',
  'overlays.pause.best': '历史最佳: {time}',
  'overlays.pause.resume': '继续游戏',
  'overlays.pause.settings': '设置',
  'overlays.pause.backToMenu': '返回主菜单',

  'overlays.win.title': '通关！',
  'overlays.win.subtitle': '你找到了出口',
  'overlays.win.timeUsed': '用时 {time}',
  // P2-13.9: label-only keys(不带 {value} 参数)— 给 StatTile 的 label
  // 用,跟带 value 的 .timeUsed / .pickups / .best 解耦。
  'overlays.win.timeLabel': '用时',
  'overlays.win.pickupsLabel': '收集',
  'overlays.win.bestLabel': '最佳',
  'overlays.win.pickups': '收集 {collected} / {total}',
  'overlays.win.best': '历史最佳 {time}',
  'overlays.win.newRecord': '新纪录！',
  'overlays.win.retry': '重玩',
  'overlays.win.next': '下一关',
  'overlays.win.toLevels': '选择关卡',
  'overlays.win.backToMenu': '返回主菜单',

  // P2-11: caught-by-enemy tutorial completion path (哨兵回廊).
  'overlays.win.caught.title': '被追上了 — 教学完成',
  'overlays.win.caught.subtitle': '你体验了一次敌人的追逐。下一关：最终试炼',

  'overlays.gameOver.titleSurvive': '坚持失败',
  'overlays.gameOver.titleTimeTrial': '时间到！',
  'overlays.gameOver.survived': '坚持了 {time}',
  'overlays.gameOver.hitCount': '击中数 {count}',
  'overlays.gameOver.retry': '重试',
  'overlays.gameOver.backToMenu': '返回主菜单',

  // ============================================================
  // settings.* — /settings 页面
  // ============================================================
  'settings.title': '设置',
  'settings.subtitle': '校准与显示 · 偏好设置',
  'settings.status.version': '设置 v1.0',
  'settings.status.groupCount': '分组 {count}',
  'settings.status.fov': '视野 {fov}°',
  'settings.status.sens': '灵敏度 {sens}',
  'settings.status.calibrated': '已校准',
  'settings.nav.label': '设置分组',
  'settings.nav.sections': '分组',
  'settings.profile.label': '档案',
  'settings.profile.value': '玩家-01',
  'settings.version.label': '版本',
  'settings.version.value': '2026.06',

  'settings.section.display': '显示',
  'settings.section.input': '控制',
  'settings.section.gameplay': '玩法',
  'settings.codename.display': 'D-01 // 显示',
  'settings.codename.input': 'I-02 // 输入',
  'settings.codename.gameplay': 'G-03 // 行为',

  'settings.darkMode.label': '深色模式',
  'settings.darkMode.desc': '切换深色 / 浅色主题，所有界面与 HUD 同步生效',
  'settings.darkMode.aria': '深色模式',

  'settings.fov.label': '视野角度',
  'settings.fov.desc': '摄像机垂直视野，越大看越多但远处更小',
  'settings.fov.aria': '视野角度',
  'settings.fov.value': '{fov}°',

  'settings.sens.label': '鼠标灵敏度',
  'settings.sens.desc': '视角转动的角速度（rad / 像素），越大越灵敏',
  'settings.sens.aria': '鼠标灵敏度',
  'settings.sens.value': '{sens} rad/px',

  'settings.aggression.label': '敌人追击速度',
  'settings.aggression.desc': '敌人发现玩家后的追击倍率（1.0x = 玩家同等速度）',
  'settings.aggression.aria': '敌人追击速度',
  'settings.aggression.easy': '简单',
  'settings.aggression.easyDesc': '反应迟缓',
  'settings.aggression.medium': '中等',
  'settings.aggression.mediumDesc': '标准',
  'settings.aggression.hard': '困难',
  'settings.aggression.hardDesc': '高压追击',

  'settings.locale.label': '语言',
  'settings.locale.desc': '界面显示语言；切换后立即生效',
  'settings.locale.aria': '语言',
  'settings.locale.zh': '中文',
  'settings.locale.en': 'English',

  'settings.action.hint': '按 {key} 应用并返回',
  'settings.action.back': '返回',

  // ============================================================
  // levels.* — /levels 页（关卡选择）
  // ============================================================
  'levels.title': '选择关卡',
  'levels.status.version': '关卡选择 v1.0',
  'levels.status.sources': '来源 {count}',
  'levels.status.builtin': '内置 {count}',
  'levels.status.custom': '自定义 {count}',
  'levels.status.online': '在线',

  'levels.section.teaching': '任务简报',
  'levels.section.teachingAlt': '任务简报 // 目录',
  'levels.section.random': '程序生成',
  'levels.section.randomAlt': '程序生成器',
  'levels.section.custom': '我的关卡',
  'levels.section.customAlt': '用户创作',
  'levels.section.seed': '指定种子',

  'levels.source.teaching': '教学',
  'levels.source.random': '随机',
  'levels.source.custom': '我的',
  'levels.source.seed': '指定',

  'levels.mode.reachExit': '到达出口',
  'levels.mode.timeTrial': '限时挑战',
  'levels.mode.survive': '存活模式',

  'levels.size.small': '15×15 (小)',
  'levels.size.medium': '30×30 (中)',
  'levels.size.large': '50×50 (大)',

  'levels.difficulty.aria': '难度 {value}/5',

  'levels.profile.session': '会话',
  'levels.profile.value': '玩家-01',
  'levels.profile.idLabel': '编号',

  'levels.nav.sourceLabel': '关卡来源',
  'levels.nav.sourceAria': '关卡来源',
  'levels.nav.railLabel': '来源',

  'levels.sublevel.aria': '子关卡',
  'levels.sublevel.empty': '暂无可选',
  'levels.sublevel.emptyTeaching': '// 暂无教学关卡 //',
  'levels.sublevel.emptyCustom': '// 暂无用户关卡 // 进入编辑器创建你的第一个关卡',

  // P2-12: levels.delete.* 已移除 — 自定义关卡的"删除"入口从 /levels
  // 搬到 EditorMyLevelsDrawer,这些 key 不再有消费者。

  'levels.stat.best': '最佳',
  'levels.stat.collected': '已收',
  'levels.stat.size': '尺寸',
  'levels.stat.walls': '墙体',

  'levels.victory.reachExit': '终点模式',
  'levels.victory.timeTrial': '限时模式',
  'levels.victory.survive': '存活模式',
  'levels.victory.caughtByEnemy': '被抓即胜',

  // F-2026-06-30: P2-16 — hand-held parchment modal copy. The
  // 'title' / 'hint' pair is also rendered by HUD as the M-key
  // tooltip, so the wording has to read well in both contexts
  // (full modal title and a one-line bottom-right badge).
  'overlays.parchment.title': '羊皮纸地图',
  'overlays.parchment.hint': '按 M 或 ESC 关闭',
  'overlays.parchment.empty': '尚未探索',
  // P3-1: 羊皮纸 modal 顶部 level tab 标签（spec §6.3）。完整
  // tab bar 由 P3-1c 实现；占位字符串与 HUD 紧凑形式保持一致
  // （「L1 / L2 / …」），两处样式不漂移。
  'overlays.parchment.levelTab': 'L{level}',

  'levels.panel.generator': '生成器',
  'levels.panel.brief': '任务简报',
  'levels.panel.seedInput': '种子输入',

  'levels.seed.label': '种子 · 64位 HEX',
  'levels.seed.autoNote': '// 自动生成 · 切换来源时重新洗牌',
  'levels.seed.manualNote': '// 16 位十六进制 · 不区分大小写 · 实时过滤',

  'levels.config.mode': '游戏模式',
  'levels.config.modeAria': '游戏模式',
  'levels.config.size': '迷宫尺寸',
  'levels.config.sizeAria': '迷宫尺寸',
  'levels.config.enemyCount': '敌人数量',
  'levels.config.enemyCountAria': '敌人数量',
  'levels.config.surviveSeconds': '存活秒数',
  'levels.config.surviveSecondsAria': '存活秒数',
  'levels.config.progressive': '渐进生成',
  'levels.config.progressiveHint': '每 {interval}s + 每 pickup +1',
  'levels.config.progressiveMax': '渐进上限',
  'levels.config.progressiveMaxAria': '渐进上限',
  'levels.config.noEnemyForMode': '当前模式无敌人',

  'levels.brief.mode': '模式',
  'levels.brief.algorithm': '算法',
  'levels.brief.grid': '网格',
  'levels.brief.survive': '存活',
  'levels.brief.idPreview': '编号预览',
  'levels.brief.waiting': '— 等待有效输入 —',

  // P2-19: algorithm picker labels (used by the LevelSelect "指定种子关卡"
  // group's new algorithm <select>). The 4 legacy algorithms shipped in
  // P2-3 never had a player-facing label (the brief panel just printed
  // the raw kebab-case name); P2-19 promotes them to i18n strings for
  // consistency with the 4 new ones. P2-20 adds 4 more. P2-21 finalizes
  // the set at 15 (full jamisbuck.org/mazes coverage).
  //
  // P2-21 cleanup (DESIGN DEBT #7): the i18n key set must be a
  // 1:1 map of ALGORITHM_REGISTRY entries' labelKey. See
  // algorithmRegistry.ts and tests/unit/maze/algorithmRegistry.test.ts
  // for the lockstep invariant. Adding a new algorithm requires
  // adding its labelKey here AND a matching entry in the registry.
  'levels.algorithm.label': '算法',
  'levels.algorithm.recursiveBacktracker': 'Recursive Backtracker',
  'levels.algorithm.kruskal': 'Kruskal',
  'levels.algorithm.prim': "Prim's",
  'levels.algorithm.huntAndKill': 'Hunt and Kill',
  'levels.algorithm.eller': "Eller's",
  'levels.algorithm.sidewinder': 'Sidewinder',
  'levels.algorithm.binaryTree': 'Binary Tree',
  'levels.algorithm.growingTree': 'Growing Tree',
  // P2-20: 4 new algorithm labels.
  'levels.algorithm.parallelBacktracker': 'Parallel Backtracker',
  'levels.algorithm.recursiveDivision': 'Recursive Division',
  'levels.algorithm.aldousBroder': 'Aldous-Broder',
  'levels.algorithm.wilsons': "Wilson's",
  // P2-21: 3 final algorithm labels (Houston's / Growing Binary Tree /
  // Blobby Recursive Division).
  'levels.algorithm.houston': "Houston's",
  'levels.algorithm.growingBinaryTree': 'Growing Binary Tree',
  'levels.algorithm.blobbyRecursiveDivision': 'Blobby Recursive Division',
  // P3-1: 层数下拉（P3-1c LevelSelect）。1..6 层与 spec 的
  // LevelCount literal union 一一对应；默认 1 保持现有单层
  // URL / 最佳成绩完全向后兼容。`optionN` 后缀（数字前无点号）
  // 是 i18n 命名空间约定要求——所有 dotted 段必须以字母开头。
  'levels.algorithm.levelCount': '层数',
  'levels.algorithm.levelCount.option1': '1 层',
  'levels.algorithm.levelCount.option2': '2 层',
  'levels.algorithm.levelCount.option3': '3 层',
  'levels.algorithm.levelCount.option4': '4 层',
  'levels.algorithm.levelCount.option5': '5 层',
  'levels.algorithm.levelCount.option6': '6 层',
  // H3 fix (architect review): 教学关固定单层(JsonMazeProvider
  // 直接服务 JSON,教学 JSON 无 transitions 数组)。在 teaching 源
  // 上放可调的 levelCount 会把 N>1 渗到 seed options,引擎把同一
  // 单层墙渲染 N 份(没有 transition 可上楼)。该 hint 解释为什么
  // levelCount 控件在 teaching 路径下被锁定。
  'levels.algorithm.levelCount.disabledForTeaching': '教学关卡固定 1 层',

  'levels.seedInput.useLast': '↻ 使用上次种子',
  'levels.action.hint': '按 {enter} 进入 · 按 {esc} 退出',
  'levels.action.back': '返回',
  'levels.action.enter': '进入游戏',

  // ============================================================
  // editor.toolbar.* — 编辑器工具栏
  // ============================================================
  'editor.toolbar.hint.select': '点击对象查看属性',
  // F-P2-9: hint text no longer repeats "右键拖动平移" — that's
  // surfaced separately via the persistent pan-hint banner that
  // appears whenever the pan tool is active (see EditorViewport.tsx).
  'editor.toolbar.hint.wall': '点击格子放置墙体',
  'editor.toolbar.hint.erase': '点击格子凿出通道（把墙变路）',
  'editor.toolbar.hint.start': '点击格子设置玩家起点',
  'editor.toolbar.hint.exit': '点击格子设置出口',
  // F-P2-9: "拾取物" relabeled to "道具" so the toolbar chip is
  // consistent with the in-cell color icons (⏱ ♥ ⚷) and the
  // properties-panel card label.
  'editor.toolbar.hint.pickup': '点击格子放置道具',
  'editor.toolbar.hint.enemy': '点击格子放置敌人 · 选中后在右侧编辑路径',
  // P2-18: trap and door toolbar hints.
  'editor.toolbar.hint.trap': '点击格子放置陷阱 · 选中后在右侧编辑类型和参数',
  'editor.toolbar.hint.door': '点击格子放置门 · 选中后在右侧编辑钥匙颜色',
  // P3-1c: 5 vertical-transition toolbar hints. 镜像 en.ts,中文文案
  // 跟项目其他按钮一样"动作 + 默认目的地"的双段结构,跟现有的
  // trap / door hint 保持同一形状。
  'editor.toolbar.hint.stairUp': '点击格子放上行楼梯（默认目的地：本层 + 1）',
  'editor.toolbar.hint.stairDown': '点击格子放下行楼梯（默认目的地：本层 − 1）',
  'editor.toolbar.hint.holeDown': '点击格子放下行洞口（默认目的地：本层 − 1）',
  'editor.toolbar.hint.holeUp': '点击格子放上行洞口（默认目的地：本层 + 1）',
  'editor.toolbar.hint.ladder': '点击格子放梯子（默认目的地：本层 + 1）',
  'editor.toolbar.hint.pan': '右键拖动平移视图',

  'editor.toolbar.autoSaved': '已自动保存 {time}',
  'editor.toolbar.autoSaveError': '自动保存失败：{msg}',
  'editor.toolbar.dirtyExitTitle': '未保存的修改',
  'editor.toolbar.dirtyNewMessage': '当前关卡有未保存的修改，确定新建？',
  'editor.toolbar.dirtyImportMessage': '当前关卡有未保存的修改，确定导入？',
  'editor.toolbar.ok': '确定',

  'editor.toolbar.newEmpty': '已新建 15×15 空关卡',
  'editor.toolbar.saved': '已保存',
  'editor.toolbar.saveError': '保存失败：{reason}',
  'editor.toolbar.exported': '已导出 {filename}',
  'editor.toolbar.imported': '已导入 {filename}',
  'editor.toolbar.importError': '导入失败：{msg}',

  'editor.toolbar.nameTitle': '最长 64 字符，换行会被替换成空格',
  'editor.toolbar.nameAria': '关卡名',
  'editor.toolbar.unsaved': '未保存',
  'editor.toolbar.savedTime': '已保存 · {time}',

  'editor.toolbar.new': '新建',
  'editor.toolbar.save': '保存',
  'editor.toolbar.saveAndExit': '保存并退出',
  'editor.toolbar.export': '导出',
  'editor.toolbar.import': '导入',
  'editor.toolbar.exitTitle': '退出编辑器',
  'editor.toolbar.exit': '退出',
  // P2-13.9: EditorViewport 文案(原硬编码中文,英文 locale 下不变中文)。
  'editor.viewport.empty': '空关卡',
  'editor.viewport.emptySub': '选择工具 · 点击格子开始放置',
  'editor.viewport.panHintTitle': '平移模式',
  'editor.viewport.panHintDrag': '按住 左键 或 右键 在画布上拖动来移动视图',
  'editor.viewport.panHintSub': '滚轮缩放 · ESC 退出',
  'editor.viewport.zoomOutAria': '缩小',
  'editor.viewport.zoomInAria': '放大',
  'editor.viewport.minimapAria': '缩略图',
  'editor.toolbar.importAria': '导入关卡文件',
  // P2-13: 工具栏(中央上方)横排按钮文案。键名沿用 P2-9 EditorLeftDrawer
  // 的命名(editor.toolbar.tool.*),只是 .tsx 主体已经搬到新位置。
  'editor.toolbar.tool.select': '选择',
  'editor.toolbar.tool.wall': '墙体',
  'editor.toolbar.tool.erase': '通道',
  'editor.toolbar.tool.start': '起点',
  'editor.toolbar.tool.exit': '终点',
  'editor.toolbar.tool.pickup': '拾取',
  'editor.toolbar.tool.enemy': '敌人',
  // P2-18: trap and door toolbar tools.
  'editor.toolbar.tool.trap': '陷阱',
  'editor.toolbar.tool.door': '门',
  // P3-1c: 5 vertical-transition toolbar tools. 标签与 en.ts 保持
  // 一一对应(逐字镜像),属性的 transitionCard.kind 下拉菜单复用
  // 这几个 key —— 用户在工具栏按钮上看到的标签,跟属性面板里
  // 下拉选项的标签是同一句。
  'editor.toolbar.tool.stairUp': '上行楼梯',
  'editor.toolbar.tool.stairDown': '下行楼梯',
  'editor.toolbar.tool.holeDown': '下行洞口',
  'editor.toolbar.tool.holeUp': '上行洞口',
  'editor.toolbar.tool.ladder': '梯子',
  'editor.toolbar.tool.pan': '平移',
  'editor.toolbar.undo': '撤销',
  'editor.toolbar.redo': '重做',
  // P2-13: 编辑器左栏文件树。EditorLeftPanel 用到的全部文案。
  'editor.leftPanel.newLevel': '关卡',
  'editor.leftPanel.newFolder': '文件夹',
  'editor.leftPanel.empty': '还没有关卡 · 点 [关卡] 开始',
  'editor.leftPanel.folderNamePrompt': '文件夹名',
  'editor.leftPanel.untitledFolder': '未命名文件夹',
  'editor.leftPanel.renamePrompt': '重命名',
  'editor.leftPanel.renameLevelPrompt': '关卡名',
  // F-2026-06-17-L-2: surface rename persist failures (FR-14 + FR-20 wired
  // through the dedicated renameLevel action in levelStore.ts).
  'editor.leftPanel.renameFailedTitle': '重命名失败',
  'editor.leftPanel.renameFailedMessage': '无法保存新名称:{reason}',
  'editor.leftPanel.delete': '删除',
  'editor.leftPanel.rename': '重命名',
  'editor.leftPanel.moveTo': '移动到',
  'editor.leftPanel.menu': '更多',
  'editor.leftPanel.deleteFolderTitle': '删除文件夹',
  'editor.leftPanel.deleteFolderMessage': '确定删除「{name}」?此文件夹内的所有关卡和子文件夹也会被删除。',
  'editor.leftPanel.deleteLevelTitle': '删除关卡',
  'editor.leftPanel.deleteLevelMessage': '确定删除「{name}」?此操作不可撤销。',
  // P3-1c: 多层级(L1..L6)左侧 tab 栏文案。levelTab 用 {level} 模板
  // 插值(1-indexed,跟用户习惯一致),addLevel / removeLevel 是顶部
  // 一对"+" / "−"按钮的 label 和 aria。
  'editor.leftPanel.levelTab': 'L{level}',
  'editor.leftPanel.levelTabAria': '第 {level} 层',
  // P5-editor-multilayer (Task 5): 每层 entity count tooltip + 多层 mode badge
  'editor.leftPanel.levelTabTooltip': '第 {level} 层 · {count} 个实体',
  'editor.leftPanel.levelTabEntityBreakdown': '{pickups} 拾取 · {enemies} 敌人 · {traps} 陷阱 · {doors} 门 · {transitions} 垂直连接',
  'editor.leftPanel.multiLayerBadge': '多层模式',
  'editor.leftPanel.addLevel': '加层',
  'editor.leftPanel.removeLevel': '删层',
  'editor.leftPanel.addLevelAria': '增加一层（当前 {count} 层）',
  'editor.leftPanel.removeLevelAria': '删除最顶层（当前 {count} 层）',
  'editor.leftPanel.removeLevelTitle': '删除最顶层?',
  'editor.leftPanel.removeLevelMessage': '这会删除第 {count} 层以及这一层上的所有实体（拾取 / 陷阱 / 门 / 敌人 / 垂直连接）。可以用 ⌘Z 撤销。',

  // ============================================================
  // editor.status.* — 编辑器状态栏
  // ============================================================
  'editor.status.issues': '关卡检查 · {count} 项',
  'editor.status.closeAria': '关闭',
  'editor.status.empty': '无问题',
  'editor.status.dirty': '未保存',
  'editor.status.notModified': '未改动',
  'editor.status.savedAt': '已保存 {time}',
  'editor.status.viewIssues': '查看 {count} 项问题',
  'editor.status.viewIssuesEmpty': '查看关卡问题（当前无）',
  'editor.status.issuesTitle': '点击查看详细问题列表',
  'editor.status.problems': '问题',
  'editor.status.warnings': '警告',
  'editor.status.walls': '墙',
  // F-P2-9: status-bar counter chip relabeled from "拾取" → "道具" to
  // match the toolbar tool label and the properties-panel card label.
  'editor.status.pickups': '道具',
  'editor.status.enemies': '敌人',
  // P5-editor-multilayer (Task 9): 多层时显示 "第 1/3 层"，单层时 "1 层"
  'editor.status.layerIndicator.single': '1 层',
  'editor.status.layerIndicator.multi': '第 {current} / {total} 层',
  'editor.status.storageHintCloseAria': '知道了，关闭存储提示',

  // ============================================================
  // editor.properties.* — 编辑器属性面板
  // ============================================================
  'editor.properties.pickupType.time': '时间',
  'editor.properties.pickupType.health': '生命',
  'editor.properties.pickupType.key': '钥匙',

  'editor.properties.metaCard': '关卡元数据',
  'editor.properties.metaChip': 'META',
  'editor.properties.field.name': '名称',
  'editor.properties.field.grid': '网格尺寸',
  'editor.properties.field.width': '宽 W',
  'editor.properties.field.depth': '深 D',
  'editor.properties.unit.cell': '格',

  'editor.properties.rulesCard': '规则',
  'editor.properties.rulesChip': 'RULES',
  'editor.properties.field.initialTime': '初始时间',
  'editor.properties.unit.second': '秒',
  'editor.properties.field.maxHealth': '最大生命',
  'editor.properties.field.timeOnPickup': '拾取 +时间',
  'editor.properties.field.victory': '胜利条件',

  // F-2026-06-30: P2-16 — three new editor fields + the 3/2/2
  // option-label groups. The three-state picker (topRight /
  // parchment / hidden) replaces the legacy `hideMinimap: boolean`
  // switch; the two linked Segmented controls below it only show
  // up when the mode is 'parchment'.
  'editor.properties.field.minimapMode': '地图模式',
  'editor.properties.minimapMode.topRight': '右上角小地图',
  'editor.properties.minimapMode.parchment': '羊皮纸地图',
  'editor.properties.minimapMode.hidden': '完全隐藏',
  'editor.properties.field.mapOpenBehavior': '打开地图时',
  'editor.properties.mapOpenBehavior.pause': '暂停游戏',
  'editor.properties.mapOpenBehavior.continue': '继续接受伤害',
  'editor.properties.field.parchmentLifecycle': '死亡 / 重玩时',
  'editor.properties.parchmentLifecycle.resetOnDeath': '清空羊皮纸',
  'editor.properties.parchmentLifecycle.persist': '保留走过的痕迹',

  'editor.properties.panelTitle': '关卡属性',

  // F-P2-9: properties-panel card relabeled from "拾取物" → "道具"
  // for consistency with the toolbar / status-bar labels.
  'editor.properties.pickupCard': '道具',
  'editor.properties.field.type': '类型',
  'editor.properties.field.value': '数值',
  'editor.properties.deletePickup': '删除道具',

  'editor.properties.enemyCard': '敌人',
  'editor.properties.field.spawn': '出生点',
  'editor.properties.pathNodes': '巡逻路径 · {count} 节点',
  'editor.properties.removeNodeAria': '移除节点 {index}',
  'editor.properties.addNode': '+ 添加节点',
  'editor.properties.field.dwellTime': '停留时间',
  'editor.properties.field.viewRange': '视野范围',
  'editor.properties.field.viewAngle': '视野角度',
  'editor.properties.deleteEnemy': '删除敌人',

  'editor.properties.wallCard': '墙体',
  'editor.properties.field.coord': '坐标',
  'editor.properties.deleteWall': '删除墙体',

  // P2-18: trap and door property panel keys.
  'editor.properties.trapCard': '陷阱',
  'editor.properties.trapKind.fire': '火焰',
  'editor.properties.trapKind.water': '水洼',
  'editor.properties.field.damage': '伤害',
  'editor.properties.field.slowDuration': '减速时长',
  'editor.properties.deleteTrap': '删除陷阱',
  'editor.properties.doorCard': '门',
  'editor.properties.keyColor.red': '红',
  'editor.properties.keyColor.blue': '蓝',
  'editor.properties.keyColor.green': '绿',
  'editor.properties.keyColor.yellow': '黄',
  'editor.properties.field.keyColor': '钥匙颜色',
  'editor.properties.doorMissingKey': '⚠ 关卡中没有对应颜色的钥匙，玩家将无法打开此门',
  'editor.properties.deleteDoor': '删除门',
  // P3-1c: vertical-transition 属性面板(transition 卡片)。
  // kind 下拉菜单直接复用 editor.toolbar.tool.* 的标签 —— 用户
  // 在工具栏按钮上看到的文字跟下拉里的选项是同一句。
  'editor.properties.transitionCard': '垂直连接',
  'editor.properties.transition.source': '源',
  'editor.properties.transition.kind': '类型',
  'editor.properties.transition.toLevel': '目标层',
  'editor.properties.transition.toX': '落点 X（留空 = 与源同 X）',
  'editor.properties.transition.toZ': '落点 Z（留空 = 与源同 Z）',
  'editor.properties.transition.sameLayerWarn': '⚠ 目标层和源层相同 — 玩家会原地踏步。请在右侧设置一个真正的 toLevel。',
  'editor.properties.deleteTransition': '删除垂直连接',

  // P2-13.7: 教程 / HUD 卡片整体 i18n 化(原硬编码中文)。
  'editor.properties.tutorialCard': '教程 / HUD',
  'editor.properties.tutorialChip': 'tutorial',
  'editor.properties.tutorial.hideMinimap': '隐藏 Minimap',
  'editor.properties.tutorial.enemyAggression': '敌人追击速度覆盖',
  'editor.properties.tutorial.aggression.inherit': '继承全局设置',
  'editor.properties.tutorial.aggression.easy': '简单 (1.2x)',
  'editor.properties.tutorial.aggression.medium': '中等 (1.5x)',
  'editor.properties.tutorial.aggression.hard': '困难 (1.8x)',
  'editor.properties.tutorial.requireAllPickups': '必须收集全部拾取',
  'editor.properties.tutorial.stepsLabel': '教学步骤 (JSON)',
  // P2-13.x: 教程卡片改版,新增 hero/row 描述 / 高级折叠区文案。
  'editor.properties.tutorial.hero.on': '已启用 {count} 步教程',
  'editor.properties.tutorial.hero.off': '未配置教程',
  'editor.properties.tutorial.hero.sub': '玩家进入关卡时,顶部横幅会按顺序播放这串步骤。',
  'editor.properties.tutorial.hideMinimapDesc': '关卡内不渲染右上角小地图,强制玩家靠空间记忆。',
  'editor.properties.tutorial.enemyAggressionDesc': '覆盖全局敌人追击速度(0.8x~1.8x)。',
  'editor.properties.tutorial.requireAllPickupsDesc': '通关前必须先拿走所有拾取物。',
  'editor.properties.tutorial.advancedLabel': '高级 · 步骤 JSON',
  'editor.properties.tutorial.advancedHint': '留空 = 不显示教程。完整 schema 见 docs/increments/p2-11-tutorial-steps.md。',
  'editor.properties.tutorial.advancedStatusIdle': '尚未提交',
  'editor.properties.tutorial.advancedStatusOk': '已保存',
  'editor.properties.tutorial.advancedStatusError': 'JSON 解析失败,保持原样',

  'editor.properties.selectionMissing': '选中的{thing}已不存在。',
  // F-P2-9: missing-selection chip text relabeled from "拾取物" →
  // "道具" to match the new toolbar label.
  'editor.properties.selection.pickup': '道具',
  'editor.properties.selection.enemy': '敌人',
  // P2-18: trap and door selection labels.
  'editor.properties.selection.trap': '陷阱',
  'editor.properties.selection.door': '门',
  // P3-1c: transition selection label.
  'editor.properties.selection.transition': '垂直连接',

  'editor.properties.minusAria': '减小',
  'editor.properties.plusAria': '增大',

  // ============================================================
  // editor.dirtyExit.* — 编辑器脏数据退出对话框
  // ============================================================
  'editor.dirtyExit.title': '未保存的修改',
  'editor.dirtyExit.message': '当前关卡有未保存的修改，请选择操作（继续编辑 = 留在此页）。',
  'editor.dirtyExit.save': '保存并退出',
  'editor.dirtyExit.discard': '放弃修改',
  'editor.dirtyExit.cancel': '继续编辑',

  // ============================================================
  // editor.draft.* — 编辑器草稿恢复对话框
  // ============================================================
  'editor.draft.title': '恢复草稿',
  'editor.draft.message': '发现上次未保存的草稿，是否恢复？',
  'editor.draft.discard': '放弃',
  'editor.draft.restore': '恢复',

  // ============================================================
  // editor.persist.* — editorStore.lastError + persist reason
  // ============================================================
  'editor.persist.reason.unavailable': '浏览器存储不可用，自动保存已禁用',
  'editor.persist.reason.tooLarge': '当前关卡过大，自动保存被跳过（请删除部分拾取/敌人或缩小地图）',
  'editor.persist.reason.quota': '本地存储已满，自动保存失败（请删除旧关卡后重试）',
  'editor.persist.reason.serialization': '关卡数据无法序列化，自动保存失败',

  // F-2026-06-15-H-3.1: write-failure messages surfaced by AppShell when
  // record() / saveCustom() / deleteCustom() can't persist. The {reason}
  // placeholder is one of the persist.reason.* messages above.
  'app.error.writeFailedRecord': '本次最佳成绩未能保存：{reason}',
  'app.error.writeFailedCustomLevel': '自定义关卡未能保存：{reason}',

  'editor.lastError.wallOnStart': '无法在起点放置墙（墙不能覆盖起点）',
  'editor.lastError.wallOnExit': '无法在终点放置墙（墙不能覆盖终点）',
  // F-P2-9: dedicated erase / carve tool error channels. Mirror the
  // wallOnStart / wallOnExit keys so the toolbar chip surfaces the
  // i18n key consistently.
  'editor.lastError.eraseOnStart': '无法擦除起点（起点必须是地面）',
  'editor.lastError.eraseOnExit': '无法擦除终点（终点必须是地面）',
  // F-P2-9: pickup-on-wall now surfaces via lastErrorKey instead of
  // the previous silent reject, matching the wall / start / exit
  // placement-actions contract.
  'editor.lastError.pickupOnWall': '拾取物只能放在地面上（请先用「通道」工具凿出地面再放拾取）',
  // F-2026-06-16-M-2: same-cell duplicate placement now surfaces a
  // distinct i18n key so the toolbar message can name the actual
  // problem (instead of a generic validator error at save time).
  'editor.lastError.pickupDuplicate': '该格子已有拾取物（每格只能放一个）',
  'editor.lastError.startOutOfBounds': '起点位置超出网格范围',
  'editor.lastError.exitOutOfBounds': '终点位置超出网格范围',
  'editor.lastError.startOnExit': '起点不能与终点重叠',
  'editor.lastError.exitOnStart': '终点不能与起点重叠',
  'editor.lastError.pathOutOfBounds': '路径节点超出网格范围',
  'editor.lastError.collideWithStart': '该格子已经是起点',
  'editor.lastError.collideWithExit': '该格子已经是终点',
  'editor.lastError.collideWithPickup': '该格子上已经有拾取物',
  'editor.lastError.collideWithEnemy': '该格子上已经有敌人（或巡逻路径节点）',
  'editor.lastError.pathNotAdjacent': '路径节点必须与上一个节点上下左右相邻（不能斜着放）',
  // P2-18: trap and door placement error keys.
  'editor.lastError.trapOnWall': '陷阱只能放在地面上（请先用「通道」工具凿出地面再放陷阱）',
  'editor.lastError.doorOnWall': '门只能放在地面上（请先用「通道」工具凿出地面再放门）',
  'editor.lastError.trapDuplicate': '该格子已有陷阱（每格只能放一个）',
  'editor.lastError.doorDuplicate': '该格子已有门（每格只能放一个）',
  'editor.lastError.collideWithTrap': '该格子上已有陷阱',
  'editor.lastError.collideWithDoor': '该格子上已有门',
  // F-2026-07-01-FCR-M-3: 通道工具（擦除）若目标格子上有拾取物/陷阱/门/敌人（路径节点），
  // 拒绝并提示，避免用户擦掉墙后该实体孤立在地面而不知情。
  'editor.lastError.eraseOnEntity': '该格子上有拾取物 / 陷阱 / 门 / 敌人，无法擦除（请先删除实体）',
  // P3-1c: vertical-transition 放置校验（与 en.ts 镜像,逐字翻译）
  'editor.lastError.transitionOnWall': '垂直连接只能放在地面格子上（先用擦除工具挖通道）',
  'editor.lastError.transitionOnStart': '垂直连接不能放在起点格子上',
  'editor.lastError.transitionOnExit': '垂直连接不能放在出口格子上',
  'editor.lastError.transitionDuplicate': '该格子上已有垂直连接（每格每层只能放一个）',

  // F-2026-06-17-E-M-7: 关卡检查 (validateDesign) 的全部问题文案。
  // 由 EditorStatusBar 渲染,跟随当前语言。`{id}` / `{value}` 是可选插值。
  'editor.validation.exitUnreachable': '出口无法从起点到达',
  'editor.validation.enemyPathTooShort': '敌人 {id} 的巡逻路径少于 2 个路径点',
  'editor.validation.startOnWall': '起点落在了墙上',
  'editor.validation.exitOnWall': '出口落在了墙上',
  'editor.validation.rules.initialTime': '初始时间必须大于 0(当前 {value})',
  'editor.validation.rules.maxHealth': '最大生命必须大于 0(当前 {value})',
  'editor.validation.rules.timeOnPickup': '拾取 +时间必须大于 0(当前 {value})',
  'editor.validation.caughtByEnemyRequiresTutorial': '「被抓即胜」仅供教学关卡使用,请先在教学设置里添加至少一个步骤',

  // P2-12: 编辑器内"我的关卡"管理 drawer 的展示文案。drawer 替代
  // 原 /levels 页面的删除入口;编辑/删除两个操作都从这里发起。
  'editor.mylevels.title': '我的关卡 · 编辑或删除',
  'editor.mylevels.empty': '还没有保存的关卡 · 新建一个开始吧',
  'editor.mylevels.edit': '编辑',
  'editor.mylevels.delete': '删除',
  'editor.mylevels.deleteTitle': '删除关卡',
  'editor.mylevels.deleteMessage': '确定删除「{name}」?此操作不可撤销。',

  // ============================================================
  // editor.help.* — 编辑器使用手册（EditorHelpDrawer 内容）
  // ============================================================
  'editor.help.title': '关卡编辑器 · 使用手册',
  'editor.help.closeAria': '关闭使用手册',
  'editor.help.section.tools': '① 工具总览',
  'editor.help.section.toolsIntro': '左侧工具栏点选工具后，在画布上点格子即可放置或修改。右键拖动画布可平移视图；滚轮缩放。',
  'editor.help.section.shortcuts': '② 快捷键',
  'editor.help.section.flow': '③ 常用流程',
  'editor.help.section.checklist': '④ 保存前自检',
  // P5-editor-multilayer (Task 8): 新增"⑤ 多层迷宫"段
  'editor.help.section.multiLayer': '⑤ 多层迷宫',
  'editor.help.multiLayerIntro': '多层关卡包含 2–6 层叠放的楼层（L1、L2、…）。玩家在 L1 用 WASD 行走，通过放置的垂直连接（楼梯 / 坑洞 / 梯子）爬升或下落。',
  'editor.help.multiLayerAdd': '加层',
  'editor.help.multiLayerAddBody': '在 tab 栏点 [+] 按钮即可增加新的最顶层。新层默认克隆当前最顶层的墙体——你可以立刻编辑它而不影响其他层。',
  'editor.help.multiLayerRemove': '删层',
  'editor.help.multiLayerRemoveBody': '点 [−] 按钮删除最顶层。当只剩 1 层时，编辑器自动塌缩回单层模式（L0 网格写回传统的 `walls` 字段）。',
  'editor.help.multiLayerConnect': '跨层连接',
  'editor.help.multiLayerConnectBody': '用 楼梯 / 坑洞 / 梯子 工具在两个层之间放置连接。viewport 里的半透明 ghost overlay 会标出跨层桥接的格子。连接的源和目标格子都必须在各自层的可走格上。',
  'editor.help.multiLayerJson': 'JSON 输出',
  'editor.help.multiLayerJsonBody': '多层关卡导出为 `walls2d: [layer0, layer1, …]`（每层一个 2D 网格）。升到多层时传统的 `walls` 字段被丢弃，塌缩回单层时恢复。',
  'editor.help.col.tool': '工具',
  'editor.help.col.shortcut': '快捷键',
  'editor.help.col.action': '作用',
  'editor.help.col.wheel': '鼠标滚轮',

  'editor.help.tool.select': '选择',
  'editor.help.tool.selectDesc': '点对象查看属性；点空白处清空选择',
  'editor.help.tool.wall': '墙体',
  'editor.help.tool.wallDesc': '点格子设为墙；已为墙则无操作',
  'editor.help.tool.erase': '通道',
  'editor.help.tool.eraseDesc': '把墙凿为路；起点/终点不能擦除',
  'editor.help.tool.start': '起点',
  'editor.help.tool.startDesc': '移动玩家起点到点击的格子（自动凿墙）',
  'editor.help.tool.exit': '终点',
  'editor.help.tool.exitDesc': '移动出口到点击的格子（自动凿墙）',
  'editor.help.tool.pickup': '道具',
  'editor.help.tool.pickupDesc': '在地面格子放道具；右侧面板调整类型与数值',
  'editor.help.tool.enemy': '敌人',
  'editor.help.tool.enemyDesc': '放敌人；选中后右侧编辑巡逻路径',
  'editor.help.tool.pan': '平移',
  'editor.help.tool.panDesc': '按住左/右键拖动平移视图；滚轮缩放',
  // P2-18: trap + door tool entries
  'editor.help.tool.trap': '陷阱',
  'editor.help.tool.trapDesc': '在地面格子放陷阱（火坑扣血 / 水洼减速）；右侧面板调整类型与数值',
  'editor.help.tool.door': '门',
  'editor.help.tool.doorDesc': '放颜色门（红/蓝/绿/黄），玩家需拾取同色钥匙才能开门通过',

  'editor.help.shortcut.esc': '退出当前工具 / 清空选择',
  'editor.help.shortcut.undo': '撤销',
  'editor.help.shortcut.redo': '重做',
  'editor.help.shortcut.wheel': '以鼠标为中心缩放视图',

  'editor.help.flow.step1': '【新建】点工具栏「新建」得到一张 15×15 全墙的画布，起点在左上、终点在右下',
  'editor.help.flow.step2': '【凿通道】切到「通道」工具，在画布上依次点击出迷宫的主干道与分支',
  'editor.help.flow.step3': '【放道具】切到「道具」工具，在通道上点格子放时间/生命/钥匙；右侧面板调整数值',
  'editor.help.flow.step4': '【放敌人】切到「敌人」工具点格子放敌人；点击已放敌人后，可在右侧编辑巡逻路径',
  'editor.help.flow.step5': '【保存】点「保存」把当前关卡加入「我的关卡」；「保存并退出」同时返回主菜单',

  'editor.help.checklist.reachable': '起点到终点之间存在通路（状态栏 ⚠ 警告会提醒）',
  'editor.help.checklist.wallsClosed': '墙体闭合、外圈有墙（避免玩家走出地图）',
  'editor.help.checklist.pickups': '至少放 1-2 个道具，否则游玩没有收集乐趣',
  'editor.help.checklist.enemyPath': '每个敌人至少有 2 个巡逻点，否则敌人会卡住',
  'editor.help.checklist.rules': '胜利模式、初始时间、最大生命都设了合理值（默认即可）',
  // P2-18: trap + door checklist items
  'editor.help.checklist.trapsAndDoors': '门和对应颜色钥匙放在关卡内（否则玩家无法开门）；陷阱不要挡住唯一通路',

  // ============================================================
  // editor.manual.* — 教程手册（EditorTutorialManual 内容）
  // ============================================================
  'editor.manual.title': '教程手册',
  'editor.manual.closeAria': '关闭教程手册',
  'editor.manual.dontAutoOpen': '不再自动打开',
  'editor.manual.dontAutoOpenAria': '不再自动打开教程手册',
  'editor.manual.nav.prev': '← 上一章',
  // L-9 (2026-07-01): the `←` / `→` arrows above are hardcoded
  // glyphs (not {var} placeholders) because they're typographic
  // decoration, not localizable content. zh-CN renders left-to-right
  // arrows in both chapters; an RTL locale would need its own
  // mirrored copy, which is a future i18n pass — not a placeholder
  // issue. Kept literal so a translator doesn't accidentally
  // 'translate' them into spelled-out "previous".
  'editor.manual.nav.next': '下一章 →',

  // Ch1 入门
  'editor.manual.ch1.title': '入门',
  'editor.manual.ch1.intro': '欢迎来到关卡编辑器！本章带你快速上手创建第一个关卡。',
  'editor.manual.ch1.s1.title': '🎯 创建关卡',
  'editor.manual.ch1.s1.body': '点击顶部工具栏的「新建」按钮，即可获得一张 15×15 的全墙画布。\n新画布默认起点在左上角、终点在右下角，你可以随时移动它们。',
  'editor.manual.ch1.s2.title': '🖱️ 画布导航',
  'editor.manual.ch1.s2.body': '滚轮缩放：以鼠标位置为中心放大或缩小画布。\n右键拖动：平移视图，查看画布的不同区域。\n左侧工具栏选好工具后，在画布上点击格子即可操作。',
  'editor.manual.ch1.s3.title': '💾 保存与退出',
  'editor.manual.ch1.s3.body': '「保存」将关卡存入浏览器的「我的关卡」列表。\n「保存并退出」保存后返回主菜单。\n「导出」下载 .maze3d.json 文件，可以分享给其他玩家。\n未保存的修改会显示 ● 标记提醒。',

  // Ch2 工具详解
  'editor.manual.ch2.title': '工具详解',
  'editor.manual.ch2.intro': '左侧工具栏提供了 8 种工具，每种都有对应的快捷键。本节逐一介绍。',
  'editor.manual.ch2.s1.title': '👆 选择工具 (V)',
  'editor.manual.ch2.s1.body': '默认工具。点击画布上的对象（墙体、道具、敌人）可选中它，右侧属性面板会显示对应属性。\n点击空白处取消选择。选中敌人后可在右侧编辑巡逻路径。',
  'editor.manual.ch2.s2.title': '🧱 墙体与通道 (W / B)',
  'editor.manual.ch2.s2.body': '「墙体」工具 (W)：点击地面格子将其变为墙。\n「通道」工具 (B)：点击墙格子将其凿为路。起点和终点不能被擦除。\n提示：用通道工具从全墙画布中凿出迷宫路径，是最常用的工作方式。',
  'editor.manual.ch2.s3.title': '🏁 起点与终点 (S / E)',
  'editor.manual.ch2.s3.body': '「起点」工具 (S)：点击任意格子放置玩家起点，该格子自动变为通道。\n「终点」工具 (E)：点击任意格子放置出口，该格子同样自动变为通道。\n每张地图只能有一个起点和一个终点，新放置会移动旧位置。',
  'editor.manual.ch2.s4.title': '🎒 道具 (P)',
  'editor.manual.ch2.s4.body': '在地面格子上点击放置道具。选中道具后，右侧面板可调整类型和数值：\n⏳ 时间 — 增加倒计时秒数\n❤️ 生命 — 恢复生命值\n🔑 钥匙 — 解锁门的必需品\n每个道具会自动分配唯一 ID。',
  'editor.manual.ch2.s5.title': '⚔️ 敌人与平移 (M / H)',
  'editor.manual.ch2.s5.body': '「敌人」工具 (M)：点击地面格子放置敌人。选中后右侧可编辑巡逻路径。\n「平移」工具 (H)：按住鼠标拖动平移视图。你也可以随时用右键拖动平移，不必切到此工具。\n敌人需要至少 2 个巡逻点才能正常移动。',

  // Ch3 属性面板
  'editor.manual.ch3.title': '属性面板',
  'editor.manual.ch3.intro': '右侧属性面板根据当前选择显示对应的配置项，未选中对象时显示关卡元数据。',
  'editor.manual.ch3.s1.title': '📋 关卡元数据',
  'editor.manual.ch3.s1.body': '未选中任何对象时，面板显示关卡级设置：\n名称 — 显示在关卡列表中的标题\n宽度 / 深度 — 画布尺寸（修改会重建画布，注意可能丢失边缘内容）',
  'editor.manual.ch3.s2.title': '🏆 胜利规则',
  'editor.manual.ch3.s2.body': '胜利模式 — 决定玩家如何获胜：\n· 到达出口 — 走到终点即胜利\n· 限时挑战 — 在倒计时结束前到达终点\n· 生存模式 — 在敌人的追击下存活指定时间\n初始时间 — 限时/生存模式的倒计时秒数\n最大生命 — 玩家可承受的受伤次数\n需要全部道具 — 勾选后必须收集所有道具才能通关',
  'editor.manual.ch3.s3.title': '🔧 道具与敌人属性',
  'editor.manual.ch3.s3.body': '选中道具时可编辑：类型、数值（时间秒数 / 生命恢复量）。\n选中敌人时可编辑：巡逻路径（点击「添加路径点」后依次点击画布上的格子）。\n选中起点/终点时显示其坐标，可直接在面板中调整位置。',

  // Ch4 设计技巧
  'editor.manual.ch4.title': '设计技巧',
  'editor.manual.ch4.intro': '好的关卡设计需要兼顾可玩性、挑战性和公平性。以下是一些实用建议。',
  'editor.manual.ch4.s1.title': '🔀 路径设计',
  'editor.manual.ch4.s1.body': '主路径应当清晰可达，从起点到终点至少一条明显路线。\n分支路径可以藏道具或死胡同，增加探索乐趣。\n避免过长的无分支走廊——连续 5 格以上的直路会让玩家失去方向感。',
  'editor.manual.ch4.s2.title': '⚖️ 难度平衡',
  'editor.manual.ch4.s2.body': '小关卡（15×15）适合 1-3 个敌人，大关卡（30×30+）可以 5-10 个。\n道具数量与关卡规模匹配：一般每 20 格通道放 1 个道具。\n生存模式的敌人数量建议从 3 开始，渐进生成开启时体验更佳。',
  'editor.manual.ch4.s3.title': '⚠️ 常见错误',
  'editor.manual.ch4.s3.body': '起点与终点不连通 — 最常见的问题，状态栏会显示 ⚠ 警告。\n敌人没有巡逻路径 — 敌人会原地不动，体验很差。\n外墙有缺口 — 玩家可能走出地图边界。\n道具放在墙上 — 道具只有在通道上才能被拾取。',
  'editor.manual.ch4.s4.title': '✅ 验收自检',
  'editor.manual.ch4.s4.body': '保存前检查以下几点：\n1. 起点到终点有通路（状态栏无 ⚠ 警告）\n2. 每个敌人至少 2 个巡逻点\n3. 外围墙体闭合\n4. 胜利模式和参数设置合理\n5. 关卡名称有辨识度',

  // Ch5 测试与发布
  'editor.manual.ch5.title': '测试与发布',
  'editor.manual.ch5.intro': '设计完成后，验证、导出和分享你的关卡。',
  'editor.manual.ch5.s1.title': '🔍 验证关卡',
  'editor.manual.ch5.s1.body': '状态栏会实时显示验证警告：\n⚠ 起点与终点不连通\n⚠ 缺少起点或终点\n⚠ 敌人缺少巡逻路径\n这些是建议性警告，不会阻止你保存。但强烈建议修复后再发布。',
  'editor.manual.ch5.s2.title': '📤 导出与导入',
  'editor.manual.ch5.s2.body': '「导出」— 将关卡下载为 .maze3d.json 文件，包含完整关卡数据。\n「导入」— 选择一个 .maze3d.json 文件加载到编辑器。导入会覆盖当前未保存的修改。\n导出文件可以发送给其他玩家，他们通过「导入」即可加载你的关卡。',
  'editor.manual.ch5.s3.title': '🌐 分享关卡',
  'editor.manual.ch5.s3.body': '方式一：导出 .maze3d.json 文件，发送给其他玩家导入。\n方式二：保存到「我的关卡」后，在关卡选择页面选择该关卡进入游戏，浏览器地址栏的 URL 就是关卡的直达链接。\n分享 URL 时，对方打开即可直接进入同一关卡配置。',

  // Ch6 高级功能
  'editor.manual.ch6.title': '高级功能',
  'editor.manual.ch6.intro': '掌握基础后，探索这些高级功能来打造更丰富的关卡体验。',
  'editor.manual.ch6.s1.title': '🔴 敌人巡逻路径',
  'editor.manual.ch6.s1.body': '选中敌人后，右侧面板显示巡逻路径编辑器：\n点击「添加路径点」按钮，然后在画布上依次点击格子来定义巡逻路线。\n敌人会按路径点顺序循环移动，最后一个路径点之后回到第一个。\n路径点必须是通道格子，否则敌人无法到达。',
  'editor.manual.ch6.s2.title': '💀 存活模式设置',
  'editor.manual.ch6.s2.body': '胜利模式选择「生存」后，可配置以下参数：\n存活秒数 — 玩家需要坚持的时间（30/60/90/120 秒，或自定义）\n敌人数量 — 初始生成的敌人数量（0-10）\n渐进生成 — 勾选后每隔一段时间自动增加敌人\n这些设置让生存关卡可以有不同的紧张程度。',
  'editor.manual.ch6.s3.title': '🗺️ 羊皮纸地图设置',
  'editor.manual.ch6.s3.body': '「地图模式」属性决定玩家在游戏中看到的地图形式：\n· 右上角小地图 — 默认模式，始终显示完整地图\n· 羊皮纸地图 — 按 M 键打开全屏地图，只有走过的区域才可见，受伤会留下损伤\n· 完全隐藏 — 不显示任何地图\n选择羊皮纸模式后，可额外设置：打开地图时是否暂停游戏、死亡时是否保留地图。',
  'editor.manual.ch6.s4.title': '📁 文件夹管理',
  'editor.manual.ch6.s4.body': '左侧面板底部的「我的关卡」列表支持文件夹组织：\n点击文件夹名称可展开/折叠。\n将关卡拖到文件夹上即可移动。\n右键文件夹可重命名或删除。\n文件夹帮助你按主题或难度归类关卡，方便管理大量自制关卡。',

  // ============================================================
  // common.* — 跨组件通用按钮 / 操作
  // ============================================================
  'common.cancel': '取消',
  'common.confirm': '确定',
  'common.back': '返回',
  'common.save': '保存',
  'common.delete': '删除',
  'common.moreSuffix': ' 等 {count} 项',
  // L-10 (2026-07-01): the {count} placeholder IS shared with en.ts
  // (see en.common.moreSuffix '(+{count} more)') so the keysParity
  // test passes — but the *wording* intentionally diverges between
  // locales: zh-CN naturally drops the suffix inside the trailing
  // list ("[A, B] 等 3 项"), while en wraps it in a parenthetical
  // prefix ("[A, B] (+3 more)") so it reads naturally as an aside.
  // Both call sites pass only `{ count }` — verified by the consumer
  // in App.tsx.

  // ============================================================
  // tutorial.teaching0N.stepM — 教学步骤 HUD 横幅文案
  // ============================================================
  'tutorial.teaching01.step1': '移动鼠标转动视角',
  'tutorial.teaching01.step2': '按 WASD 键移动',
  'tutorial.teaching01.step3': '走到出口即可通关',
  'tutorial.teaching02.step1': '地上的物品可以拾取，靠近自动获取',
  'tutorial.teaching02.step2': '现在可以走向出口了',
  'tutorial.teaching03.step1': '敌人在巡逻 — 绕回廊跑',
  'tutorial.teaching03.step2': '它们比你快 — 被追上即通关',
  'tutorial.teaching04.step1': '这是最终试炼 — 必须收集全部物品才能在终点通关',
  'tutorial.teaching04.step2': '已收集全部 — 前往出口',
  'tutorial.teaching04.step3': '通关！',
  // P2-18: 新教学关卡 — 陷阱 + 钥匙门
  'tutorial.teaching05.step1': '前方是火焰陷阱 — 踩上去会扣血',
  'tutorial.teaching05.step2': '看羊皮纸上的灼烧印记 — 受伤位置会留下痕迹',
  'tutorial.teaching05.step3': '继续前往出口',
  'tutorial.teaching06.step1': '前方是水洼 — 会让人减速',
  'tutorial.teaching06.step2': '减速期间移动变慢 — 等待恢复',
  'tutorial.teaching06.step3': '恢复后继续前进',
  'tutorial.teaching07.step1': '拾取红钥匙 — 注意钥匙上的颜色',
  'tutorial.teaching07.step2': '走到红门旁按数字键 1 使用同色钥匙开门',
  'tutorial.teaching07.step3': '成功开门通关！',
  'tutorial.teaching08.step1': '新特性 — 钥匙开门 + 火焰水洼陷阱',
  'tutorial.teaching08.step2': '拾取第一把钥匙 — 绕开水洼与火焰',
  'tutorial.teaching08.step3': '走到对应颜色的门旁 — 按数字键开门',
  'tutorial.teaching08.step4': '拾取第二把钥匙 — 注意陷阱扣血',
  'tutorial.teaching08.step5': '走到第二道门旁 — 再开一道门',
  'tutorial.teaching08.step6': '恭喜 — 全部新特性通关！',
  // P5-1: 多层教学关卡 — 教玩家跨层移动的核心 mechanic
  'tutorial.teachingMultilayer01.step1': '欢迎来到层级试炼 — 这个迷宫有 2 层',
  'tutorial.teachingMultilayer01.step2': '按 WASD 移动,找到地上的楼梯（↑ 符号）走上去',
  'tutorial.teachingMultilayer01.step3': '你已经到第 2 层!HUD 上的 L 标记会跟着切换',
  'tutorial.teachingMultilayer01.step4': '在第 2 层找到出口 (绿色方块)',
  'tutorial.teachingMultilayer01.step5': '成功!你刚刚跨越了不同层级',
};