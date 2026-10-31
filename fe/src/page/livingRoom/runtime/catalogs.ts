import { charIdOf, type CharacterDef, type FurnitureDef, type Outfit } from '../types';

/**
 * 지금 입고 있는 고유 의상 — 착용 id 가 이 캐릭터의 옷과 같을 때만. 아니면 기본 옷(null).
 * 거실 렌더러와 옷 입히기 미리보기가 **같은 규칙**을 쓰도록 여기 하나만 둔다.
 */
export function wornOutfit(def: CharacterDef, clothesId: number | null): Outfit | null {
  return def.outfit && clothesId === def.outfit.clothesId ? def.outfit : null;
}

/**
 * 종목 고정값 캐시 — 이름 · 모델 경로 · 의상. 감정·행동은 엔진 몫이라 여기 없다. 열쇠는 캐릭터 id(charIdOf — 지시서 A2).
 * **런타임은 서버와 직접 말하지 않는다.** 페이지가 Catalog API로 받아 load()로 넣어 준다.
 */
export class CharacterCatalog {
  private readonly defs = new Map<string, CharacterDef>();

  load(defs: CharacterDef[]): void {
    for (const d of defs) this.defs.set(charIdOf(d), d);
  }

  def(charId: string): CharacterDef | undefined {
    return this.defs.get(charId);
  }

  /** 종목 코드로 찾기 — 캐릭터 탭(프리셋 · 보유 목록)이 아직 더미라 코드로 묻는다. S6 에서 프리셋이 stock_id 로 바뀌면 지운다 */
  byCode(stockCode: string): CharacterDef | undefined {
    return [...this.defs.values()].find((d) => d.stockCode === stockCode);
  }
}

/** 가구 고정값 캐시 — 이름 · 크기 · 모양. 씬과 배치 편집기가 같이 본다 */
export class FurnitureCatalog {
  private readonly defs = new Map<number, FurnitureDef>();

  load(defs: FurnitureDef[]): void {
    for (const d of defs) this.defs.set(d.furnitureId, d);
  }

  def(furnitureId: number): FurnitureDef | undefined {
    return this.defs.get(furnitureId);
  }

  all(): FurnitureDef[] {
    return [...this.defs.values()];
  }
}
