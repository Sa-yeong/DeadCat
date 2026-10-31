import { charIdOf, type CharacterDef, type FurnitureDef } from '../types';

/**
 * 종목 고정값 캐시 — 이름 · 모델 경로. 감정·행동은 엔진 몫이라 여기 없다. 열쇠는 캐릭터 id(charIdOf — 지시서 A2).
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
