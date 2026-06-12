import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useLevelStore } from '../store/levelStore';
import { Button } from './components/Button';
import { Settings } from './Settings';
import { formatTime } from '../utils/time';

// 3 个并列按钮的固定宽度。720px 以下由媒体查询收紧。
const PAUSE_BTN_WIDTH = 240;

export function PauseOverlay({ onResume, onQuit }: { onResume: () => void; onQuit: () => void; }) {
  const pickupCount = useGameStore((s) => s.pickupCount);
  const currentLevelId = useGameStore((s) => s.currentLevelId);
  const best = useLevelStore((s) => (currentLevelId ? s.bestByLevel[currentLevelId] : undefined));
  // 设置 按钮内嵌在暂停页:点开是 Settings,返回后回到 3 按钮状态。
  // 不走 App 的 uiScreen='settings' 路径,避免与主菜单的设置入口冲突。
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    // Settings 内部用 position:absolute,inset:0,父级需 position:relative。
    // overlayStyle 已经设了 position:absolute,所以 Settings 能正常铺满。
    return (
      <div style={overlayStyle}>
        <Settings onBack={() => setShowSettings(false)} />
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <h2>已暂停</h2>
      <p>已收集: {pickupCount.collected} / {pickupCount.total}</p>
      {best && <p>历史最佳: {formatTime(best.timeUsed)}</p>}
      <div style={buttonRowStyle}>
        <Button
          onClick={onResume}
          hoverStyle="lift"
          width={PAUSE_BTN_WIDTH}
          data-testid="pause-resume"
        >
          继续游戏
        </Button>
        <Button
          onClick={() => setShowSettings(true)}
          variant="secondary"
          hoverStyle="glow"
          width={PAUSE_BTN_WIDTH}
          data-testid="pause-settings"
        >
          设置
        </Button>
        <Button
          onClick={onQuit}
          variant="danger"
          hoverStyle="fade"
          width={PAUSE_BTN_WIDTH}
          data-testid="pause-quit"
        >
          返回主菜单
        </Button>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
};

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 12,
  marginTop: 20,
};
