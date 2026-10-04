import type { ActName, CharacterDef, FurnitureDef, Mood, Outfit } from '../types';

/**
 * 지금 입고 있는 고유 의상 — 착용 id 가 이 캐릭터의 옷과 같을 때만. 아니면 기본 옷(null).
 * 거실 렌더러와 옷 입히기 미리보기가 **같은 규칙**을 쓰도록 여기 하나만 둔다.
 */
export function wornOutfit(def: CharacterDef, clothesId: number | null): Outfit | null {
  return def.outfit && clothesId === def.outfit.clothesId ? def.outfit : null;
}

/**
 * 종목 고정값 캐시 — 이름 · 모델 경로 · 민감도 · 감정별 행동.
 * **런타임은 서버와 직접 말하지 않는다.** 페이지가 Catalog API로 받아 load()로 넣어 준다.
 */
export class CharacterCatalog {
  private readonly defs = new Map<string, CharacterDef>();

  load(defs: CharacterDef[]): void {
    for (const d of defs) this.defs.set(d.stockCode, d);
  }

  def(stockCode: string): CharacterDef | undefined {
    return this.defs.get(stockCode);
  }

  /** 감정 → 행동. DB 의 (종목, 감정) PK 라 감정당 하나뿐이다 */
  act(stockCode: string, mood: Mood): ActName {
    return this.defs.get(stockCode)?.acts[mood] ?? 'idle';
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
