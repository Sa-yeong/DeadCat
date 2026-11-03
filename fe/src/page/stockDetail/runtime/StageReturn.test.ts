import { describe, expect, it } from 'vitest';
import { StageReturn, type ReturnMode } from './StageReturn';
import type { StockScene } from './StockScene';

/** StockScene 흉내 — 화면 가로 위치만 계산한다(1m = 100px, 카메라 가운데가 centerX) */
function fakeScene(centerX: number, width: number) {
  const s = {
    centerX,
    width,
    pan: 0,
    root: 0,
    pixelsPerMeter: 100,
    get home() {
      return { centerX: s.centerX, width: s.width };
    },
    shiftCenter(dx: number) {
      s.centerX += dx;
    },
    setPan(x: number) {
      s.pan = x;
    },
    setRoot(x: number) {
      s.root = x;
    },
    /** 캐릭터가 화면에 보이는 가로 위치(px) */
    get screenX() {
      return s.centerX + (s.root - s.pan) * s.pixelsPerMeter;
    },
  };
  return s;
}

function setup(centerX = 800, width = 1300) {
  const scene = fakeScene(centerX, width);
  const back = new StageReturn(scene as unknown as StockScene);
  const moves: ReturnMode[] = [];
  const arrivals: ReturnMode[] = [];
  back.onMove = (m) => moves.push(m);
  back.onArrive = (m) => arrivals.push(m);
  const run = (seconds: number, onFrame?: () => void) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      back.update(1 / 60);
      onFrame?.();
    }
  };
  return { scene, back, moves, arrivals, run };
}

describe('StageReturn.moveHome — 창문 가운데가 옮겨 감(글로벌 사이드바 여닫기)', () => {
  it('바닥이 미끄러지는 동안 캐릭터는 화면에서 제자리, 그다음 걸어서 새 가운데로', () => {
    const { scene, back, moves, arrivals, run } = setup();
    run(0.1);
    back.moveHome(640);
    // 첫 순간 — 바닥은 움직이기 시작했지만 캐릭터는 그대로
    back.update(1 / 60);
    expect(scene.centerX).toBeLessThan(800);
    expect(scene.screenX).toBeCloseTo(800, 0);
    run(4);
    expect(moves).toEqual(['walk']);
    expect(arrivals).toEqual(['walk']);
    expect(scene.centerX).toBe(640);
    expect(scene.screenX).toBeCloseTo(640, 0);
  });

  it('조금(STAY_PX 이하)만 옮겨 가면 걷지 않는다', () => {
    const { scene, back, moves, run } = setup();
    back.moveHome(780);
    run(2);
    expect(moves).toEqual([]);
    expect(scene.centerX).toBe(780);
  });

  it('사이드바에 가려졌으면(보이는 폭 밖) 뛰어 온다', () => {
    const { scene, back, moves, run } = setup(1100, 1300);
    back.setVisibleWidth(980);
    back.moveHome(660);
    run(3);
    expect(moves).toEqual(['run']);
    // 달리기가 바닥보다 먼저 닿으면 바닥이 마저 가는 몇 px 은 STAY_PX 안이라 그대로 둔다
    expect(Math.abs(scene.screenX - 660)).toBeLessThan(2);
  });

  it('자는 중에는 제자리 — 깨면 그때 걸어온다', () => {
    const { scene, back, moves, run } = setup();
    back.setStill(true);
    back.moveHome(640);
    run(2);
    expect(moves).toEqual([]);
    expect(scene.centerX).toBe(640);
    expect(scene.screenX).toBeCloseTo(800, 0);
    back.setStill(false);
    run(3);
    expect(moves).toEqual(['walk']);
    expect(scene.screenX).toBeCloseTo(640, 0);
  });

  it('차트를 끄는 중에는 출발하지 않는다 — 놓으면 새 가운데로', () => {
    const { scene, back, moves, run } = setup();
    back.setDragging(true);
    back.moveHome(640);
    run(1, () => back.panBy(2));
    expect(moves).toEqual([]);
    back.setDragging(false);
    run(4);
    expect(moves.length).toBe(1);
    expect(scene.screenX).toBeCloseTo(640, 0);
  });

  it('cancelHome — 옮겨 가던 것을 버린다(창 크기가 바뀌어 새로 다 맞춤)', () => {
    const { scene, back, run } = setup();
    back.moveHome(640);
    back.update(1 / 60);
    back.cancelHome();
    const at = scene.centerX;
    run(1);
    expect(scene.centerX).toBe(at);
  });
});
