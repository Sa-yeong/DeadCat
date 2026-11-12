import { describe, expect, it } from 'vitest';
import { FURNITURE_CATALOG } from '../furnitureCatalog';
import { footprint } from '../runtime/furnitureShape';
import { occupiesFloor } from '../runtime/occupancy';
import type { FurnitureDef, PlacementDto } from '../types';
import { clampPos, insideRoom, placeable, placeFromStorage, rotatePlacement, snapPos, type PlacementDoc } from './placementDoc';

// 설치 영역 · 배치 판정 — 지시서 「가구 · 반응 실제 연결」 3

const DESK = 1;
const SOFA = 2;
const CARPET = 6;
const SPEAKER = 26;
const PIANO = 28;
const SLOT = 29;

const defOf = (id: number) => FURNITURE_CATALOG.find((d) => d.furnitureId === id);
const must = (id: number) => defOf(id) as FurnitureDef;
const pl = (placementId: number, furnitureId: number, x: number, y: number, rotation = 0): PlacementDto => ({ placementId, furnitureId, positionX: x, positionY: y, rotation });
const docOf = (...placements: PlacementDto[]): PlacementDoc => ({ placements, storage: [] });
const cand = (furnitureId: number, x: number, y: number, rotation = 0, placementId: number | null = null) => ({ placementId, furnitureId, pos: { x, y }, rotation });

describe('카탈로그', () => {
  it('DB furnitures 31줄 전부 — 키는 1~31(30 · 31 = 슬롯머신 2 · 3단계)', () => {
    expect(FURNITURE_CATALOG.map((d) => d.furnitureId)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it('등급별 스킨은 크기 · 엔진 이름이 같다', () => {
    for (let i = 0; i < 6; i++) {
      const [a, b, c, d] = [1, 7, 13, 19].map((first) => must(first + i));
      for (const o of [b, c, d]) expect([o.w, o.d, o.engineName, o.kind]).toEqual([a.w, a.d, a.engineName, a.kind]);
    }
  });

  it('설치 영역 크기 — 지시서 표', () => {
    const size = (id: number) => [must(id).w, must(id).d];
    expect(size(DESK)).toEqual([4, 4]);
    expect(size(SOFA)).toEqual([4, 2]);
    expect(size(3)).toEqual([2, 2]); // 화분
    expect(size(4)).toEqual([2, 2]); // 스탠드 조명
    expect(size(5)).toEqual([4, 2]); // 책장
    expect(size(CARPET)).toEqual([8, 6]);
    expect(size(25)).toEqual([4, 4]); // 독서 책상
    expect(size(27)).toEqual([4, 4]); // 컴퓨터 책상
    expect(size(PIANO)).toEqual([3, 4]);
    expect(size(SPEAKER)).toEqual([2, 4]);
    expect(size(SLOT)).toEqual([2, 4]);
  });

  it('엔진 이름은 상호작용 가구만', () => {
    expect(must(DESK).engineName).toBe('desk_small');
    expect(must(SOFA).engineName).toBe('sofa_2seat');
    expect(must(25).engineName).toBe('desk_reading');
    expect(must(26).engineName).toBe('speaker');
    expect(must(27).engineName).toBe('desk_computer');
    expect(must(28).engineName).toBe('piano');
    expect(must(29).engineName).toBe('slot_machine');
    for (const id of [3, 4, 5, 6]) expect(must(id).engineName).toBeUndefined();
  });
});

describe('설치 영역 — 회전 4방향', () => {
  it('짝수 변은 자리가 가운데, 돌리면 가로 · 세로가 바뀐다', () => {
    const sofa = must(SOFA);
    expect(footprint(sofa, { x: 10, y: 10 }, 0)).toEqual({ x0: 8, x1: 12, y0: 9, y1: 11 });
    expect(footprint(sofa, { x: 10, y: 10 }, 90)).toEqual({ x0: 9, x1: 11, y0: 8, y1: 12 });
    expect(footprint(sofa, { x: 10, y: 10 }, 180)).toEqual({ x0: 8, x1: 12, y0: 9, y1: 11 });
    expect(footprint(sofa, { x: 10, y: 10 }, 270)).toEqual({ x0: 9, x1: 11, y0: 8, y1: 12 });
  });

  it('홀수 변(피아노 3칸)도 변이 칸 경계에 맞는다', () => {
    const piano = must(PIANO);
    expect(footprint(piano, { x: 10, y: 10 }, 0)).toEqual({ x0: 9, x1: 12, y0: 8, y1: 12 });
    expect(footprint(piano, { x: 10, y: 10 }, 90)).toEqual({ x0: 8, x1: 12, y0: 9, y1: 12 });
    expect(footprint(piano, { x: 10, y: 10 }, 180)).toEqual({ x0: 9, x1: 12, y0: 8, y1: 12 });
    expect(footprint(piano, { x: 10, y: 10 }, 270)).toEqual({ x0: 8, x1: 12, y0: 9, y1: 12 });
  });
});

describe('1칸 단위', () => {
  it('포인터 자리는 정수 칸으로', () => {
    expect(snapPos({ x: 10.4, y: 9.6 })).toEqual({ x: 10, y: 10 });
  });

  it('방 밖으로 나간 포인터도 자리는 방 안(정수)', () => {
    expect(snapPos({ x: -3, y: 31 })).toEqual({ x: 0, y: 30 });
  });

  it('clampPos 는 설치 영역을 방 안으로 — 회전 · 홀수 변 포함', () => {
    expect(clampPos(must(SOFA), { x: 0, y: 0 }, 0)).toEqual({ x: 2, y: 1 });
    expect(clampPos(must(SOFA), { x: 0, y: 0 }, 90)).toEqual({ x: 1, y: 2 });
    expect(clampPos(must(PIANO), { x: 0, y: 0 }, 0)).toEqual({ x: 1, y: 2 });
    expect(clampPos(must(PIANO), { x: 30, y: 30 }, 0)).toEqual({ x: 28, y: 28 });
    expect(footprint(must(PIANO), { x: 28, y: 28 }, 0)).toEqual({ x0: 27, x1: 30, y0: 26, y1: 30 });
  });
});

describe('놓을 수 있는가(초록 / 빨강)', () => {
  it('빈 방 안이면 된다', () => {
    expect(placeable(docOf(), defOf, cand(SOFA, 10, 10))).toBe(true);
  });

  it('방 밖이면 안 된다 — 네 벽 모두, 벽에 딱 붙는 건 된다', () => {
    expect(placeable(docOf(), defOf, cand(SOFA, 1, 10))).toBe(false); // 왼벽을 1칸 넘음
    expect(placeable(docOf(), defOf, cand(SOFA, 2, 10))).toBe(true);
    expect(placeable(docOf(), defOf, cand(SOFA, 29, 10))).toBe(false);
    expect(placeable(docOf(), defOf, cand(SOFA, 28, 10))).toBe(true);
    expect(placeable(docOf(), defOf, cand(SOFA, 10, 0))).toBe(false);
    expect(placeable(docOf(), defOf, cand(SOFA, 10, 30))).toBe(false);
    expect(insideRoom(must(SOFA), { x: 10, y: 29 }, 0)).toBe(true);
  });

  it('돌리면 방 안 판정도 바뀐다', () => {
    expect(placeable(docOf(), defOf, cand(SOFA, 1, 10, 0))).toBe(false);
    expect(placeable(docOf(), defOf, cand(SOFA, 1, 10, 90))).toBe(true);
  });

  it('겹치면 안 된다 — 사용 자리(설치 영역 전체)도 막는다, 변끼리 맞닿는 건 된다', () => {
    const doc = docOf(pl(1, SLOT, 10, 10)); // 2×4 — x 9~11, y 8~12
    expect(placeable(doc, defOf, cand(3, 10, 11))).toBe(false); // 화분이 앞쪽 사용 자리에
    expect(placeable(doc, defOf, cand(3, 10, 13))).toBe(true); //  y 12~14 — 맞닿음
    expect(placeable(doc, defOf, cand(3, 12, 10))).toBe(true); //  x 11~13 — 맞닿음
  });

  it('돌린 가구의 영역으로 겹침을 본다', () => {
    const doc = docOf(pl(1, SOFA, 10, 10, 90)); // x 9~11, y 8~12
    expect(placeable(doc, defOf, cand(3, 10, 12))).toBe(false);
    expect(placeable(doc, defOf, cand(3, 12, 10))).toBe(true);
  });

  it('자기 자신과는 겹침이 아니다', () => {
    const doc = docOf(pl(1, SOFA, 10, 10));
    expect(placeable(doc, defOf, cand(SOFA, 11, 10, 0, 1))).toBe(true);
    expect(placeable(doc, defOf, cand(SOFA, 11, 10, 0, null))).toBe(false);
  });

  it('카펫은 겹침 검사에서 빠진다 — 위에 가구를 놓아도, 가구 위에 깔아도, 카펫끼리도 된다', () => {
    expect(occupiesFloor(must(CARPET))).toBe(false);
    expect(placeable(docOf(pl(1, CARPET, 10, 10)), defOf, cand(SOFA, 10, 10))).toBe(true);
    expect(placeable(docOf(pl(1, SOFA, 10, 10)), defOf, cand(CARPET, 10, 10))).toBe(true);
    expect(placeable(docOf(pl(1, CARPET, 10, 10)), defOf, cand(18, 10, 10))).toBe(true);
  });

  it('카펫도 방 밖은 안 된다', () => {
    expect(placeable(docOf(), defOf, cand(CARPET, 3, 10))).toBe(false);
    expect(placeable(docOf(), defOf, cand(CARPET, 4, 10))).toBe(true);
  });

  it('카탈로그에 없는 가구는 놓을 수 없다', () => {
    expect(placeable(docOf(), defOf, cand(999, 10, 10))).toBe(false);
  });
});

describe('회전 · 꺼내기', () => {
  it('벽에 붙은 가구를 돌리면 안쪽으로 밀려 정수 자리로', () => {
    const doc = docOf(pl(1, SOFA, 10, 1)); // y 0~2
    const p = rotatePlacement(doc, 1, defOf).placements[0];
    expect(p.rotation).toBe(90);
    expect([p.positionX, p.positionY]).toEqual([10, 2]);
  });

  it('옆 가구와 겹치면 비키고, 비킬 자리가 없으면 같은 문서', () => {
    // 방 가운데 소파를 돌릴 자리를 위아래 책장으로 막는다
    const free = docOf(pl(1, SOFA, 10, 10), pl(2, 5, 10, 8));
    expect(rotatePlacement(free, 1, defOf)).not.toBe(free);
    const stuck = docOf(pl(1, SOFA, 10, 10), pl(2, 5, 10, 8), pl(3, 5, 10, 12), pl(4, 5, 6, 8), pl(5, 5, 14, 8), pl(6, 5, 6, 12), pl(7, 5, 14, 12), pl(8, 5, 6, 10), pl(9, 5, 14, 10));
    expect(rotatePlacement(stuck, 1, defOf)).toBe(stuck);
  });

  it('보관함에 있어야 꺼낼 수 있고, 꺼내면 개수가 준다', () => {
    const doc: PlacementDoc = { placements: [], storage: [{ furnitureId: SOFA, quantity: 2 }] };
    const next = placeFromStorage(doc, SOFA, { x: 10, y: 10 }, -1);
    expect(next.placements).toEqual([{ placementId: -1, furnitureId: SOFA, positionX: 10, positionY: 10, rotation: 0 }]);
    expect(next.storage).toEqual([{ furnitureId: SOFA, quantity: 1 }]);
    expect(placeFromStorage(doc, DESK, { x: 10, y: 10 }, -1)).toBe(doc);
  });
});
