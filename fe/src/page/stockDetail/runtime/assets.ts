/**
 * 종목 코드 → 캐릭터(모델 + 모션 표). **조립은 여기 한 곳.**
 *  · 모델은 종목마다 따로 둔다 — 캐릭터마다 디테일이 다르다(2026-11-07 도휘 결정)
 *  · 모션(.vrma)은 VRoid 뼈가 같아 공용을 그대로 쓰고, 필요한 것만 캐릭터별로 덮어쓴다
 *  · STOCK_CHARACTERS 에 없는 종목은 공용 캐릭터(테스트용 캐릭터 + 공용 모션) — 지금 동작 그대로
 * {C단계 미확정} 종목별 모델 주소는 API(캐릭터 정보)에서 받게 된다.
 *
 * 파일은 fe/public/characters/ 아래 — 공용: dev/character.vrm · motions/, 종목 전용: stocks/{코드}/character.vrm · motions/
 * 모델 · 모션 주소는 전부 versioned()를 지난다 — 빌드 때 파일 내용 해시가 ?v= 로 붙는다(마무리 L-3)
 */
import { versioned } from '../../../shared/assetVersion';
import { MOTIONS, resolveMotions, type MotionName, type MotionSet, type MotionTable } from './motionTable';

const BASE = import.meta.env.BASE_URL;

export interface CharacterInfo {
  /** 같은 key = 같은 캐릭터 — 종목을 옮겨도 다시 받지 않는다 */
  key: string;
  model: string;
  motions: MotionSet;
  /** 연타 반응(annoying)이 나오는 탭 수 — 없으면 공용 SPAM_TAPS */
  spamTaps?: number;
  /** 연타 반응(annoying) 동안 모자가 떨어졌다 돌아오는 장면(hatDrop.ts) — 모델에 WingedHat 노드가 있는 캐릭터만 */
  hatDrop?: boolean;
  /** 치비 모드(개별종목 치비 지시서) 모델 — 거실과 같은 파일. 모자(hatDrop)는 없다 */
  chibiModel: string;
  /** 치비 모드 모션 표 — 등신대와 같은 표(뼈 공유), chibiCommon 에 적은 덮어쓰기만 공용으로 */
  chibiMotions: MotionSet;
  /** 치비 모드 연타 탭 수 — 없으면 공용 SPAM_TAPS */
  chibiSpamTaps?: number;
}

/** 종목 전용 캐릭터 한 명 */
interface CharacterSpec {
  /** fe/public 기준 폴더 — 그 안에 character.vrm, 덮어쓸 모션은 motions/ */
  dir: string;
  /** 공용 모션 중 이 캐릭터만 바꿀 것 — 파일은 dir/motions/ 에서 찾는다 */
  overrides?: MotionTable;
  spamTaps?: number;
  hatDrop?: boolean;
  /**
   * 치비 모드에서는 공용으로 되돌릴 덮어쓰기 — 등신대 전용으로 만든 모션이라 치비에 안 맞는 것.
   * 연타 반응(annoying)을 되돌리면 연타 탭 수(spamTaps)도 공용으로
   */
  chibiCommon?: MotionName[];
}

/** 종목 코드(대문자) → 전용 캐릭터 */
export const STOCK_CHARACTERS: Record<string, CharacterSpec> = {
  NVDA: {
    dir: 'characters/stocks/NVDA/',
    overrides: {
      // 연타 반응 = 한 손 V(pingerV.vrma, 도휘 제작) + happy(윙크가 든 표정) 1. 나머지 설정은 공용 annoying 그대로
      // 파일은 데모용으로 11.7초 — V 완성(약 1.5초) 뒤 2초인 3.5초에서 끊고 유지 모션으로(2026-11-26 도휘)
      annoying: { ...MOTIONS.annoying!, face: [{ expr: 'happy', value: 1 }], end: 3.5 },
    },
  },
  // NAVER — 전용 모델(2026-11-15). 연타 반응(공용과 같은 3탭) = naver_annoying.vrma(도휘 제작, 30fps 0~109프레임) + 모자 떨어뜨리기(hatDrop.ts).
  // 표정은 VRMA 안의 키(blink · ou · angry) 그대로 — 코드 표정 없음. 끝나면 유지 모션으로. 나머지 모션은 공용
  '035420': {
    dir: 'characters/stocks/035420/',
    overrides: {
      annoying: { file: 'naver_annoying.vrma', loop: false, face: [], vrmaFace: true },
    },
    hatDrop: true,
    // 치비 모드 — 전용 연타 반응(모자 연출과 짝) 대신 공용 annoying, 모자도 끈다(치비 지시서 결정 9)
    chibiCommon: ['annoying'],
  },
  // 애플 · 코카콜라 · 삼성전자 — 전용 모델(2026-11-26). 전용 모션은 아직 없어 모션은 전부 공용
  AAPL: { dir: 'characters/stocks/AAPL/' },
  KO: { dir: 'characters/stocks/KO/' },
  '005930': { dir: 'characters/stocks/005930/' },
};

/**
 * 치비 모델 — 거실과 같은 파일 `characters/chibi/clothes/{stock_id}/default.vrm`(같은 주소라 거실에 들렀으면 브라우저 캐시에서 바로).
 * 개별종목은 종목 **코드**로 찾으므로 코드 → stock_id 표. 표에 없는 종목은 기본 치비(char_chibi_2.vrm, 거실과 같은 규칙).
 * {임시} id 는 지금 seed 기준 — 나중에 API(캐릭터 정보)에서 받게 되면 이 표는 없앤다.
 * 코드는 STOCK_CHARACTERS 에도 있어야 한다 — 없으면 공용 캐릭터(key 'common', 기본 치비)를 쓴다(assets.test 가 본다)
 */
export const CHIBI_STOCK_ID: Readonly<Record<string, number>> = {
  '005930': 1, // 삼성전자
  '035420': 5, // 네이버
  AAPL: 11,
  NVDA: 13,
  KO: 20, // 코카콜라
};
const DEFAULT_CHIBI = versioned(`${BASE}characters/chibi/char_chibi_2.vrm`);

/** 종목 코드 → 치비 모델 주소(버전 붙음). 표에 없으면 기본 치비 */
export function chibiModelOf(stockCode: string): string {
  const id = CHIBI_STOCK_ID[stockCode.toUpperCase()];
  return id === undefined ? DEFAULT_CHIBI : versioned(`${BASE}characters/chibi/clothes/${id}/default.vrm`);
}

const COMMON_KEY = 'common';
/** 표의 파일 이름을 폴더 주소로 풀고 버전을 붙인다 */
function motionsAt(base: string, table: MotionTable): MotionSet {
  const out = resolveMotions(base, table);
  for (const m of Object.values(out)) m.url = versioned(m.url);
  return out;
}

const COMMON_MOTIONS = motionsAt(`${BASE}characters/motions/`, MOTIONS);
const COMMON: CharacterInfo = {
  key: COMMON_KEY,
  model: versioned(`${BASE}characters/dev/character.vrm`),
  motions: COMMON_MOTIONS,
  chibiModel: DEFAULT_CHIBI,
  chibiMotions: COMMON_MOTIONS,
};

/** 공용 모션 표 위에 덮어쓰기를 얹는다 — 같은 이름은 덮어쓴 쪽, 나머지는 공용 */
export function mergeMotions(common: MotionSet, overrides: MotionTable, base: string): MotionSet {
  return { ...common, ...motionsAt(base, overrides) };
}

const cache = new Map<string, CharacterInfo>();

/** 이 종목의 캐릭터. 전용 캐릭터가 없으면 공용 */
export function characterOf(stockCode: string): CharacterInfo {
  const code = stockCode.toUpperCase();
  const spec = STOCK_CHARACTERS[code];
  if (!spec) return COMMON;
  let info = cache.get(code);
  if (!info) {
    const dir = `${BASE}${spec.dir}`;
    const motions = mergeMotions(COMMON_MOTIONS, spec.overrides ?? {}, `${dir}motions/`);
    const back = spec.chibiCommon ?? [];
    const chibiMotions: MotionSet = { ...motions };
    for (const name of back) {
      if (COMMON_MOTIONS[name]) chibiMotions[name] = COMMON_MOTIONS[name];
      else delete chibiMotions[name];
    }
    info = {
      key: code,
      model: versioned(`${dir}character.vrm`),
      motions,
      spamTaps: spec.spamTaps,
      hatDrop: spec.hatDrop,
      chibiModel: chibiModelOf(code),
      chibiMotions,
      chibiSpamTaps: back.includes('annoying') ? undefined : spec.spamTaps,
    };
    cache.set(code, info);
  }
  return info;
}
