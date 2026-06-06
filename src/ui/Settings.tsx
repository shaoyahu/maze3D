import { useSettingsStore } from '../store/settingsStore';
import { Button } from './components/Button';

export function Settings({ onBack }: { onBack: () => void }) {
  const sens = useSettingsStore((s) => s.pointerSensitivity);
  const set = useSettingsStore((s) => s.set);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 }}>
      <h2>设置</h2>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        鼠标灵敏度
        <input
          type="range" min={0.0005} max={0.006} step={0.0005}
          value={sens}
          onChange={(e) => set('pointerSensitivity', Number(e.target.value))}
        />
        <span style={{ opacity: 0.7, fontSize: 12 }}>{sens.toFixed(4)} rad/px</span>
      </label>
      <Button onClick={onBack} variant="secondary">返回</Button>
    </div>
  );
}
