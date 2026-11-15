/**
 * 거실 3D 캐릭터 파일 위치. 파일은 fe/public/characters/ 아래.
 *
 * 지금은 다섯 종목이 모두 같은 치비 하나를 쓴다 — 멀리서 봤을 때 느낌을 보려는 임시(2026-10-09 도휘).
 * {미확정} 종목별 모델 주소는 캐릭터 카탈로그(API)에서 받게 된다.
 *
 * 미리보기(vite.preview-room.config.ts)는 이 파일을 통째로 바꿔 끼워 모델을 HTML 안에 넣는다.
 * 주소는 versioned()를 지난다 — 빌드 때 파일 내용 해시가 ?v= 로 붙는다(마무리 L-3)
 */
import { versioned } from '../../../shared/assetVersion';

const BASE = import.meta.env.BASE_URL;

export const ROOM_ASSETS = {
  chibi: versioned(`${BASE}characters/chibi/char_chibi_2.vrm`),
  /** 서 있을 때(걷다 멈췄을 때) 반복 — 2026-10-12 도휘 */
  idle: versioned(`${BASE}characters/chibi/idle_chibi.vrma`),
  /** 걷는 동안 반복 — 제자리 걸음(앞으로 나가는 건 RoomLoop 이 옮긴다) */
  walk: versioned(`${BASE}characters/chibi/walk_chibi.vrma`),
  /** 들려 있는 동안 버둥거림 반복(40프레임) — 2026-10-12 밤 도휘 */
  pickup40: versioned(`${BASE}characters/chibi/pickup_chibi_40.vrma`),
  /** 40프레임 버둥거리다 20프레임 동안 힘이 빠져 축 처짐 — 한 번 틀고 마지막 프레임 유지 */
  pickup60: versioned(`${BASE}characters/chibi/pickup_chibi_60.vrma`),
};
