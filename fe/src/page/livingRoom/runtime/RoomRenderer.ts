import type { CharacterDef } from '../types';
import type { Footprint } from './furnitureShape';
import type { Pt } from './projection';
import type { Look } from './outfitState';
import type { MotionClock } from './motionFx';

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

/**
 * 틀어 달라는 모션 한 단계. 클립 이름 = 모션 파일 이름(확장자 없이) — public/characters/chibi/motions/{clip}.vrma.
 * null = 아직 파일이 연결되지 않은 모션(motions.json 의 clip 이 비어 있음) — 파일이 없는 것과 같게 다룬다
 */
export interface MotionStep {
  clip: string | null;
  /** 반복 — 마지막 단계에서만 의미가 있다(반복하면 끝나지 않는다) */
  loop: boolean;
  /** 엔진 모션 이름(motions.json) — 모션별 연출(표정 덮어쓰기 MOTION_FACE 등)을 찾는 데. 없으면 연출 없음 */
  name?: string;
  /**
   * 끝까지 틀면 마지막 자세로 멈춘 채 onFinish 를 부르지 않는다(cancel 까지) — 박살 모션(G-2): 먼지가 가장 짙을 때 RoomLoop 이 끝낸다.
   * 파일이 없으면 평소처럼 건너뛴다(onFinish)
   */
  hold?: boolean;
}

/** 거실 썸네일 — 찍을 시점(1칸 px · 뒤 꼭짓점 자리)과 무대 px 영역. 영역은 2:1 이어야 찌그러지지 않는다 */
export interface CaptureView {
  scale: number;
  ox: number;
  oy: number;
}
export interface CaptureRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 찍은 캔버스 크기(px) — 영역과 같은 비율이어야 찌그러지지 않는다 */
export interface CaptureSize {
  w: number;
  h: number;
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
   * 마지막까지 끝나면 onFinish 를 한 번, 늘 비동기로 부른다. 반복으로 끝나면 onFinish 없음 · 파일 없는 클립은 건너뜀
   * (개발 모드 holdMissingClips 면 대기 자세로 시간을 채움) ·
   * 새 play 나 cancel 이 오면 앞 요청은 onFinish 없이 끝난다. 들려 있는 동안은 들기 동작이 이기고 요청은 버려진다
   */
  play(charId: string, steps: MotionStep[], onFinish: () => void): void;
  /** 엔진 모션을 멈추고 평소 동작(idle · walk)으로 돌아간다. onFinish 는 부르지 않는다 */
  cancel(charId: string): void;
  /**
   * 평소 자세(대기 · 걷기)를 바꿔 끼운다 — 엔진 emotion 명령의 idle · walk(지시서 1-8). 클립 이름이 null 이거나
   * 파일이 없으면 기본 자세(idle_chibi · walk_chibi)로 둔다. 감정으로 분기하지 않는다 — 받은 이름을 틀 뿐
   */
  setBasePose(charId: string, pose: { idle: string | null; walk: string | null }): void;
  /** 얼굴 표정 — 엔진 emotion 명령의 감정을 표정으로 보인다(짝 표는 motionTable CHIBI_FACE). 평면 더미는 그리지 않는다 */
  setExpression(charId: string, emotion: string): void;
  /**
   * 개발 모드(지시서 1-3) — 파일 없는 클립 단계를 ms 동안 대기 자세로 채운다(반복 마지막 단계는 cancel 까지).
   * null 이면 끈다(파일 없는 단계는 건너뜀). 실제 서비스엔 켜지 않는다
   */
  holdMissingClips(ms: number | null): void;
  /**
   * 개발 모드 머리 위 글자(지시서 1-3) — 지금 엔진 단계의 남은 시간(초). 반복 단계면 'loop',
   * 엔진 모션이 없거나 파일을 받는 중이라 아직 모르면 null. 읽기만 한다
   */
  motionTimeLeft(charId: string): number | 'loop' | null;
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
  /** 배치 모드 — 움직이는 가구의 설치 영역 칸 전체를 반투명 초록(ok) / 빨강(겹침 · 방 밖)으로 칠한다. null 이면 지운다 */
  showPlacementArea(area: Footprint | null, ok?: boolean): void;
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
   * 지금 모습 — 고른 옷(기본 · MAX) × 수익률 상태(헤진 · 일반 · 좋은), 지시서 3-⑩. 판정은 RoomLoop(outfitState)가 한다.
   * 평면 더미는 몸통 색만 바꾸고, 3D 는 그 모습의 모델 파일(catalog.modelUrlsOf)로 통째로 갈아 끼운다 — 찾은 파일이 지금과 같으면 그대로
   */
  setOutfit(charId: string, look: Look): void;
  /**
   * 들고 있는 캐릭터를 놓으면 상호작용이 있는 상대 — 테두리를 빛낸다(null 이면 끈다). 하나만 켠다.
   * 평면 더미는 SVG 외곽선, 3D 는 부풀린 뒷면으로 그린 실루엣 (추가, 제안)
   */
  setDropTarget(target: DropTarget | null): void;
  /**
   * 거실 썸네일(3D 만 — 평면 더미는 없음). 주어진 시점의 영역을 size(기본 800×400)로 찍은 캔버스 — 화면 해상도와 무관.
   * 배경은 거실 배경색으로 채우고, 3D 보조 표시(선택 테두리 · 가구 하이라이트 · 고스트 · 배치 영역 · 드롭 대상)는 그 순간만 끈다.
   * 화면은 찍은 뒤 원래대로. 파일로 바꾸는 건 thumbImage
   */
  capture?(view: CaptureView, rect: CaptureRect, size?: CaptureSize): HTMLCanvasElement;
  /**
   * 슬롯머신 한 판(3D 만 — 평면 더미는 없음) — 레버를 당겼다 놓고 릴이 돈다. 뽑기 결과를 서버에서 받은 뒤 HUD 가 부른다(마무리 M-4).
   * delayS 초 뒤에 레버가 내려가기 시작한다 — 캐릭터 모션(play_slot)의 레버 타이밍에 맞춘다(2026-11-14). 그동안 레버 · 릴은 가만히 있다.
   * 모델을 못 받았거나 이미 도는 중이면 false
   */
  pullLever?(placementId: number, delayS?: number): boolean;
  /** 캐릭터가 dir 쪽(방 좌표)을 보도록 돈다 — 걸을 때처럼 부드럽게, snap 이면 바로(3D 만). 슬롯머신 앞에 세울 때 (2026-11-14) */
  face?(charId: string, dir: Pt, snap?: boolean): void;
  /**
   * 엔진 모션을 트는 동안 몸 전체를 lift 칸 올린다(음수면 내림) — 소파에 앉을 때 엉덩이를 좌석 높이에 맞춘다(3D 만, 2026-11-14).
   * 모션이 실제로 돌 때만 걸리고, 들어가고 나올 때 동작이 섞이는 시간 동안 서서히 옮겨 간다. 0 이면 풀기
   */
  setSeatLift?(charId: string, lift: number): void;
  /**
   * 엔진 모션을 트는 동안 바닥에 붙인다(GROUND_CLIPS 와 같은 처리, 3D 만) — 가구 모션 자리의 ground(거실모션 H-2). false 면 풀기
   */
  setGrounded?(charId: string, on: boolean): void;
  /** 「이펙트만」 단계(trembling, 거실모션 H-6) 동안 감정과 상관없이 저릿저릿을 켠다(3D 만) */
  setJitterForce?(charId: string, on: boolean): void;
  /** 지금 줌(1 = 방 전체 구도) — 화면 px 로 정한 이펙트 크기(저릿저릿)를 줌에 비례시키는 데(3D 만, H-6) */
  setZoom?(z: number): void;
  /**
   * 지금 트는 엔진 모션 단계의 시간(초) · 길이 — 박살 프레임을 재는 데(G-2). 파일을 받는 중 · 없는 파일 · 엔진 모션이 없으면 null
   */
  motionClock?(charId: string): MotionClock | null;
  /** 가구를 화면에서 숨긴다 / 다시 보인다 — 박살로 먼지가 가장 짙을 때(G-2). 숨긴 가구는 클릭 · 드롭 대상에서도 빠진다 */
  setFurnitureHidden?(placementId: number, hidden: boolean): void;
  /** 가구 자리에 흙먼지를 터뜨린다(3D 만, G-2) — 크기는 그 가구의 설치 영역 · 키 기준. 그리기만 하고 알림은 없다 */
  burstDust?(placementId: number): void;
  /** 가구 모델을 살짝 들썩인다(3D 만, G-2 — 책상을 주먹으로 내려침) */
  bumpFurniture?(placementId: number): void;
  /**
   * 거실 등장(3D 만, 2026-11-26) — 방금 spawn 한 캐릭터를 하늘에서 떨어뜨린다. 거실에 들어와 처음 세울 때만 RoomLoop 이 부른다
   * (캐릭터 탭에서 새로 세움 · 배치 저장 뒤 다시 세움에는 부르지 않는다). 모델을 받는 동안은 도형 · 그림자도 숨기고,
   * 받으면 화면 위 밖에서 떨어져 착지 먼지 속에서 평소 자세로 바뀐다.
   * 등장을 하면 true — 먼지가 걷혀 움직여도 될 때 onReady 를 한 번 부른다(그 전에 despawn 되면 안 부름).
   * false(평면 더미 · 이미 모델이 있음)면 onReady 를 부르지 않고 바로 평소 상태
   */
  enter?(charId: string, onReady: () => void): boolean;
  /** 지금 세운 캐릭터 모델 · 동작과 가구 모델을 다 받고 자세가 잡힌 뒤(등장도 끝난 뒤) — 자동 촬영이 기다린다 */
  whenSettled?(): Promise<void>;
  dispose(): void;
}

