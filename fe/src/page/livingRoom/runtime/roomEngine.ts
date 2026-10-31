import characterRules from '../engine/data/characterRules.json';
import events from '../engine/data/events.json';
import furniture from '../engine/data/furniture.json';
import furnitureRules from '../engine/data/furnitureRules.json';
import motions from '../engine/data/motions.json';
import poses from '../engine/data/poses.json';
import { LivingRoomEngine, type EmotionFeed, type EngineCommand } from '../engine/Engine';
import { loadRules, type RuleSet } from '../engine/ruleLoader';
import type { MotionDef, RawData } from '../engine/type/type';

/** 엔진 규칙 — 엔진 데이터(engine/data)를 한 번 읽는다. 틀린 데이터면 여기서 바로 오류(엔진 테스트가 같은 데이터를 검사한다) */
export const ROOM_RULES: RuleSet = loadRules(
  structuredClone({ characterRules, furnitureRules, motions, furniture, events, poses }) as unknown as RawData,
);

/**
 * 거실 엔진을 만든다 — 엔진 생성은 EngineOptions 그대로(지시서 1-10). 로그는 개발 모드일 때만 연결한다(1-11)
 */
export function createRoomEngine(opts: {
  feed: EmotionFeed;
  onCommand: (cmd: EngineCommand) => void;
  log?: (line: string) => void;
  labelOf?: (characterId: string) => string | undefined;
}): LivingRoomEngine {
  return new LivingRoomEngine({ rules: ROOM_RULES, ...opts });
}

/**
 * 모션 이름 → 파일 · 움직임 (지시서 1-3). motions.json 이 유일한 원본이다.
 *   clip      파일 이름(확장자 없이, public/characters/chibi/motions/). 비어 있으면 null — 아직 안 만든 모션
 *   behavior  런타임이 움직임으로 처리할 이름(move_away · keep_walking)
 */
export class MotionTable {
  private readonly defs: ReadonlyMap<string, MotionDef>;

  constructor(defs: ReadonlyMap<string, MotionDef>) {
    this.defs = defs;
  }

  clipOf(name: string): string | null {
    const d = this.defs.get(name);
    return d?.kind === 'clip' ? d.clip : null;
  }

  behaviorOf(name: string): string | null {
    const d = this.defs.get(name);
    return d?.kind === 'behavior' ? d.behavior : null;
  }
}

export const ROOM_MOTIONS = new MotionTable(ROOM_RULES.motions);
