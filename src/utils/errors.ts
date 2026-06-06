export class GameError extends Error {
  constructor(public kind: string, message: string, public userMessage: string) {
    super(message);
    this.name = 'GameError';
  }
}

export class LevelLoadError extends GameError {
  constructor(message: string, public detail?: unknown) {
    super('LevelLoad', message, '关卡加载失败，请检查关卡文件');
    this.name = 'LevelLoadError';
  }
}
