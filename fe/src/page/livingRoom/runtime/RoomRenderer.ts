import type { CharacterDef } from '../types';
import type { Pt } from './projection';

/**
 * 거실을 **어떻게 그릴지**만 아는 쪽. 무엇을 할지는 RoomLoop 이 정한다.
 * 구현은 둘 — RoomScene(3D, 기본)과 PlaceholderScene(평면 더미, `?r=2d`).
 *
 * 다이어그램(클래스 r20)의 메서드(playAct 는 2026-10-18 play · cancel 로 바뀜)에 더해, 3D 없이 HUD를 돌리려고
 * 필요해진 것을 아래에 따로 묶었다. 3D 구현도 같은 걸 제공해야 한다.
 * 좌표는 전부 **무대 기준 px** — 그리는 영역(SVG·캔버스)이 무대 전체를 덮는다.
 */
/** 들고 있는 캐릭터를 놓을 수 있는 상대 — 상호작용 가구 또는 다른 캐릭터 */
export type DropTarget = { kind: 'furniture'; placementId: number } | { kind: 'character'; charId: string };

/** 엔진이 틀어 달라는 모션 한 단계. 클립 이름 = 모션 파일 이름(확장자 없이) — public/characters/chibi/motions/{clip}.vrma */
export interface MotionStep {
  clip: string;
  /** 반복 — 마지막 단계에서만 의미가 있다(반복하면 끝나지 않는다) */
  loop: boolean;
}

export interface RoomRenderer {
  /* ── 다이어그램 그대로 ── */
  spawn(charId: string, def: CharacterDef, pos: Pt): void;
  move(charId: string, pos: Pt): void;
  placeFurniture(placementId: number, furnitureId: number, pos: Pt, rotation: number): void;
  /** 클릭 지점의 캐릭터 */
  /** except — 이 캐릭터는 건너뛴다(들고 있는 캐릭터 밑의 상대를 찾을 때) */
  pick(x: number, y: number, except?: string): string | null;

  /* ── 추가 (2026-10-03, 제안) ── */
  /** 캐릭터를 치운다 — 캐릭터 탭에서 프리셋을 바꿨을 때 (2026-10-12 추가) */
  despawn(charId: string): void;
  /**
   * 엔진이 정한 모션을 순서대로 튼다 — 재생기는 캐릭터마다 렌더러가 가진 하나뿐이다(2026-10-18).
   * 마지막까지 끝나면 onFinish 를 한 번, 늘 비동기로 부른다. 반복으로 끝나면 onFinish 없음 · 모르는 클립은 건너뜀 ·
   * 새 play 나 cancel 이 오면 앞 요청은 onFinish 없이 끝난다. 들려 있는 동안은 들기 동작이 이기고 요청은 버려진다
   */
  play(charId: string, steps: MotionStep[], onFinish: () => void): void;
  /** 엔진 모션을 멈추고 평소 동작(idle · walk)으로 돌아간다. onFinish 는 부르지 않는다 */
  cancel(charId: string): void;
  /**
   * 시점이 바뀌었다(창 크기 · 줌 · 끌기) — 1칸 px(scale)와 뒤 꼭짓점의 화면 자리(ox, oy), 그릴 영역 크기.
   * 줌·끌기는 이것만 다시 부른다 — 씬은 그대로, 보는 자리만 바뀐다
   */
  resize(scale: number, ox: number, oy: number, width: number, height: number): void;
  /** 배치 모드 — 클릭 지점의 가구 */
  pickFurniture(x: number, y: number): number | null;
  removeFurniture(placementId: number): void;
  /** 배치 모드 — 고른 가구 테두리 / 놓을 자리 미리보기. null 이면 지운다 */
  highlightFurniture(placementId: number | null): void;
  showGhost(furnitureId: number | null, pos?: Pt, rotation?: number): void;
  /** 화면 좌표 → 바닥 좌표 (드래그·드롭) */
  toFloor(x: number, y: number): Pt;
  /** 들고 있는 캐릭터의 목(CHAR.grab)이 화면 (x, y)에 오려면 발을 둘 바닥 좌표 — 커서 끝 = 목 */
  grabFloor(x: number, y: number): Pt;
  /** HUD 를 띄울 자리 — 캐릭터 머리 위 / 가구 윗면 가운데 */
  screenOf(charId: string): Pt | null;
  furnitureAnchor(placementId: number): Pt | null;
  /** 선택 표시 · 들림 · 숨김(배치 모드 — 그림자까지, 클릭도 안 됨) */
  setCharacterState(charId: string, s: { selected?: boolean; lifted?: boolean; hidden?: boolean }): void;
  /**
   * 옷을 입힌다(clothesId) / 기본 옷으로 돌린다(null). 모양은 spawn 때 받은 CharacterDef.outfit 에서 찾는다.
   * 평면 더미는 몸통 색만 바꾸고, 3D 는 옷 모델을 바꿔 끼운다 (추가, 제안)
   */
  setOutfit(charId: string, clothesId: number | null): void;
  /**
   * 들고 있는 캐릭터를 놓으면 상호작용이 있는 상대 — 테두리를 빛낸다(null 이면 끈다). 하나만 켠다.
   * 평면 더미는 SVG 외곽선, 3D 는 부풀린 뒷면으로 그린 실루엣 (추가, 제안)
   */
  setDropTarget(target: DropTarget | null): void;
  dispose(): void;
}

