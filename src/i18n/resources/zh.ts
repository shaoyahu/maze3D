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
  'overlays.win.pickups': '收集 {collected} / {total}',
  'overlays.win.best': '历史最佳 {time}',
  'overlays.win.newRecord': '新纪录！',
  'overlays.win.retry': '重玩',
  'overlays.win.next': '下一关',
  'overlays.win.toLevels': '选择关卡',
  'overlays.win.backToMenu': '返回主菜单',

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

  'levels.delete.confirmTitle': '删除关卡',
  'levels.delete.confirmMessage': '确定删除「{name}」？此操作不可撤销。',
  'levels.delete.cancel': '取消',
  'levels.delete.ok': '删除',
  'levels.delete.aria': '删除 {name}',

  'levels.stat.best': '最佳',
  'levels.stat.collected': '已收',
  'levels.stat.size': '尺寸',
  'levels.stat.walls': '墙体',

  'levels.victory.reachExit': '终点模式',
  'levels.victory.timeTrial': '限时模式',
  'levels.victory.survive': '存活模式',

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
  'editor.toolbar.importAria': '导入关卡文件',

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

  'editor.properties.selectionMissing': '选中的{thing}已不存在。',
  // F-P2-9: missing-selection chip text relabeled from "拾取物" →
  // "道具" to match the new toolbar label.
  'editor.properties.selection.pickup': '道具',
  'editor.properties.selection.enemy': '敌人',

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

  // ============================================================
  // common.* — 跨组件通用按钮 / 操作
  // ============================================================
  'common.cancel': '取消',
  'common.confirm': '确定',
  'common.back': '返回',
  'common.save': '保存',
  'common.delete': '删除',
  'common.moreSuffix': ' 等 {count} 项',
};