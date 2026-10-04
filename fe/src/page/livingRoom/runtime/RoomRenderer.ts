import type { ActName, CharacterDef } from '../types';
import type { Pt } from './projection';

/**
 * 거실을 **어떻게 그릴지**만 아는 쪽. 무엇을 할지는 RoomLoop 이 정한다.
 * 구현은 둘 — 지금 쓰는 PlaceholderScene(평면 더미)과, 나중에 붙일 RoomScene(3D).
 *
 * 다이어그램(클래스 r20)의 다섯 메서드에 더해, 3D 없이 HUD를 돌리려고
 * 필요해진 것을 아래에 따로 묶었다. 3D 구현도 같은 걸 제공해야 한다.
 * 좌표는 전부 **방 SVG(또는 캔버스) 기준 px** — 무대가 아니라 방 왼쪽 위가 원점.
 */
/** 들고 있는 캐릭터를 놓을 수 있는 상대 — 상호작용 가구 또는 다른 캐릭터 */
export type DropTarget = { kind: 'furniture'; placementId: number } | { kind: 'character'; charId: string };

export interface RoomRenderer {
  /* ── 다이어그램 그대로 ── */
  spawn(charId: string, def: CharacterDef, pos: Pt): void;
  move(charId: string, pos: Pt): void;
  playAct(charId: string, act: ActName): void;
  placeFurniture(placementId: number, furnitureId: number, pos: Pt, rotation: number): void;
  /** 클릭 지점의 캐릭터 */
  /** except — 이 캐릭터는 건너뛴다(들고 있는 캐릭터 밑의 상대를 찾을 때) */
  pick(x: number, y: number, except?: string): string | null;

  /* ── 추가 (2026-10-03, 제안) ── */
  /** 창 크기가 바뀌었다 — 축척과 바닥 위치를 다시 잡는다 */
  resize(scale: number, backY: number, width: number, height: number): void;
  /** 배치 모드 — 클릭 지점의 가구 */
  pickFurniture(x: number, y: number): number | null;
  removeFurniture(placementId: number): void;
  /** 배치 모드 — 고른 가구 테두리 / 놓을 자리 미리보기. null 이면 지운다 */
  highlightFurniture(placementId: number | null): void;
  showGhost(furnitureId: number | null, pos?: Pt, rotation?: number): void;
  /** 화면 좌표 → 바닥 좌표 (드래그·드롭) */
  toFloor(x: number, y: number): Pt;
  /** HUD 를 띄울 자리 — 캐릭터 머리 위 / 가구 윗면 가운데 */
  screenOf(charId: string): Pt | null;
  furnitureAnchor(placementId: number): Pt | null;
  /** 선택 표시 · 들림 · 흐리게(배치 모드) */
  setCharacterState(charId: string, s: { selected?: boolean; lifted?: boolean; dim?: boolean }): void;
  /**
   * 옷을 입힌다(clothesId) / 기본 옷으로 돌린다(null). 모양은 spawn 때 받은 CharacterDef.outfit 에서 찾는다.
   * 평면 더미는 몸통 색만 바꾸고, 3D 는 옷 모델을 바꿔 끼운다 (추가, 제안)
   */
  setOutfit(charId: string, clothesId: number | null): void;
  /**
   * 들고 있는 캐릭터를 놓으면 상호작용이 있는 상대 — 테두리를 빛낸다(null 이면 끈다). 하나만 켠다.
   * 평면 더미는 SVG 외곽선, 3D 는 외곽선 후처리(OutlinePass 등) (추가, 제안)
   */
  setDropTarget(target: DropTarget | null): void;
  dispose(): void;
}
