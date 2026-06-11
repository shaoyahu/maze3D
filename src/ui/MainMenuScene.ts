import * as THREE from 'three';
import { AlgorithmMazeProvider } from '../maze/AlgorithmMazeProvider';
import type { MazeData } from '../maze/types';
import { createRenderer } from '../engine/Renderer';
import { createCamera } from '../engine/Camera';
import { buildScene, disposeScene } from '../engine/Scene';
import type { SceneRefs } from '../engine/Scene';

// P2-5 FR-1/FR-2/FR-3: 主菜单背景的 Three.js 场景。一个低多边形迷宫
// (15×15),3/4 俯视,相机绕中心缓慢自转。prefers-reduced-motion 命中时
// 自转暂停,只渲染一帧。整个类封装了 renderer + scene + camera + rAF
// 循环, dispose() 在菜单卸载时由 useEffect 的 cleanup 调用。
//
// 边界:这个文件 import 了 engine/Renderer、engine/Camera、engine/Scene —
// 那些模块不依赖 react 或 store,所以这里也可以用。整文件不 import react。

const MAZE_SIZE = 15;
const ROTATION_RADIANS_PER_SEC = 0.05; // 大约 1 圈 / 125 秒
const FRAME_MS_THRESHOLD = 100;        // 背景 tab 时 rAF 节流到 ~1Hz;超过这个的 dt 视作停顿,跳过自转
const HEIGHT_OFFSET = 0;               // 迷宫放在 y=0,相机在 y 上方

export class MainMenuScene {
  private renderer?: THREE.WebGLRenderer;
  private camera?: THREE.PerspectiveCamera;
  private sceneRefs?: SceneRefs;
  private rafId: number | null = null;
  private lastFrameMs: number = 0;
  private azimuth: number = 0;
  private disposed = false;

  constructor(private container: HTMLElement) {}

  // 异步初始化,WebGL 不可用时 throw 让调用方回退到 CSS 背景。
  async init(): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('data-testid', 'main-menu-canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.container.appendChild(canvas);

    this.renderer = createRenderer(canvas);
    this.camera = createCamera();
    // 3/4 俯视:稍微抬高的 camera 看向迷宫中心。
    this.camera.position.set(0, MAZE_SIZE * 1.2, MAZE_SIZE * 1.6);
    this.camera.lookAt(0, 0, 0);

    // 用一个固定 seed 跑 recursive-backtracker 拿迷宫墙 (15×15,无敌人,无 pickup)。
    // MainMenu 不关心具体迷宫形状,只想有个低多边形景观;固定 seed 让菜单
    // 每次启动都看到同一个迷宫,不会让人感觉"哎这次怎么不一样了"。
    const provider = new AlgorithmMazeProvider();
    const maze: MazeData = await provider.load(
      'algo-v1-recursive-backtracker-15-0123456789abcdef',
    );
    this.sceneRefs = buildScene(maze, /* darkMode */ false);

    // FR-2: 检测 prefers-reduced-motion。
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.lastFrameMs = performance.now();
    if (reduceMotion) {
      // 渲染一帧静态画面,不启动 rAF。
      this.renderFrame();
    } else {
      this.tick();
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dtMs = now - this.lastFrameMs;
    this.lastFrameMs = now;
    if (dtMs < FRAME_MS_THRESHOLD) {
      this.azimuth += ROTATION_RADIANS_PER_SEC * (dtMs / 1000);
      this.updateCamera();
    }
    this.renderFrame();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private updateCamera(): void {
    if (!this.camera) return;
    const r = MAZE_SIZE * 1.6;
    this.camera.position.x = Math.sin(this.azimuth) * r;
    this.camera.position.z = Math.cos(this.azimuth) * r;
    this.camera.position.y = MAZE_SIZE * 1.2;
    this.camera.lookAt(0, HEIGHT_OFFSET, 0);
  }

  private renderFrame(): void {
    if (!this.renderer || !this.camera || !this.sceneRefs) return;
    this.renderer.render(this.sceneRefs.scene, this.camera);
  }

  // FR-3: useEffect 的 cleanup 必须 dispose。释放 renderer + scene。
  dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.sceneRefs) {
      disposeScene(this.sceneRefs.scene, this.sceneRefs.walls, this.sceneRefs.pickups, this.sceneRefs.enemies);
      this.sceneRefs = undefined;
    }
    this.renderer?.dispose();
    this.renderer = undefined;
    this.camera = undefined;
  }
}
