import { describe, expect, it } from 'vitest';
import { StageReturn, type ReturnMode } from './StageReturn';
import type { StockScene } from './StockScene';

/** StockScene 흉내 — 화면 가로 위치만 계산한다(1m = 100px). 캐릭터 자리 centerX 만 옮기고 바닥 · 카메라는 floorX 그대로 */
function fakeScene(centerX: number, width: number) {
  const s = {
    centerX,
    floorX: centerX,
    width,
    pan: 0,
    root: 0,
    pixelsPerMeter: 100,
    get home() {
      return { centerX: s.centerX, width: s.width };
    },
    setCharacterCenter(x: number) {
      s.centerX = x;
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
  it('캐릭터는 화면에서 제자리로 시작해 걸어서 새 가운데로 — 바닥 · 카메라는 끝까지 그대로', () => {
    const { scene, back, moves, arrivals, run } = setup();
    run(0.1);
    back.moveHome(640);
    back.update(1 / 60);
    expect(scene.screenX).toBeCloseTo(800, 0);
    run(4, () => {
      expect(scene.floorX).toBe(800);
      expect(scene.pan).toBe(0);
    });
    expect(moves).toEqual(['walk']);
    expect(arrivals).toEqual(['walk']);
    expect(scene.centerX).toBe(640);
    expect(scene.screenX).toBeCloseTo(640, 0);
  });

  it('출발할 때 튀지 않는다 — 한 프레임에 걷는 거리 이상 안 움직인다', () => {
    const { scene, back, run } = setup();
    back.moveHome(640);
    back.update(1 / 60); // 그리기 전에 프레임 갱신이 먼저 돈다 — 첫 화면이 기준
    let last = scene.screenX;
    expect(last).toBeCloseTo(800, 0);
    run(4, () => {
      expect(Math.abs(scene.screenX - last)).toBeLessThan(5);
      last = scene.screenX;
    });
    expect(last).toBeCloseTo(640, 0);
  });

  it('조금(STAY_PX 이하)만 옮겨 가면 걷지 않는다', () => {
    const { scene, back, moves, run } = setup();
    back.moveHome(780);
    run(2);
    expect(moves).toEqual([]);
    expect(scene.centerX).toBe(780);
    expect(scene.screenX).toBeCloseTo(800, 0);
  });

  it('사이드바에 가려졌으면(보이는 폭 밖) 뛰어 온다', () => {
    const { scene, back, moves, run } = setup(1100, 1300);
    back.setVisibleWidth(980);
    back.moveHome(660);
    run(3);
    expect(moves).toEqual(['run']);
    expect(scene.screenX).toBeCloseTo(660, 0);
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

  it('걷는 중에 또 여닫으면 마지막 가운데로 간다', () => {
    const { scene, back, run } = setup();
    back.moveHome(640);
    run(0.5);
    back.moveHome(800);
    run(4);
    expect(scene.centerX).toBe(800);
    expect(scene.screenX).toBeCloseTo(800, 0);
  });
});
