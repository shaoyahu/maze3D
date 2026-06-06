import { Button } from './components/Button';

export interface LevelDef { id: string; name: string; }

export function LevelSelect({
  available,
  onPick,
  onBack,
}: {
  available: LevelDef[];
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <h2>选择关卡</h2>
      {available.length === 0 ? <p>暂无可用关卡</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {available.map((lv) => (
            <Button key={lv.id} onClick={() => onPick(lv.id)}>{lv.name}</Button>
          ))}
        </div>
      )}
      <Button onClick={onBack} variant="secondary">返回</Button>
    </div>
  );
}
