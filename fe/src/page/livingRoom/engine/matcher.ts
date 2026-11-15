import { type RuleSet } from "./ruleLoader";
import type { CharacterRule, FurnitureRule, Emotion, Effect, FurEffect } from "./type/type";

export type Decision_C = {
    rule: CharacterRule
    self: string
    other: string
    effect: Effect
    otherEmotionTo: Emotion | null
}
export type Decision_F = {
    rule: FurnitureRule;
    self: string;
    furniture: string;
    effect: FurEffect;
}

export type CharView = {
    id: string
    emotion: Emotion
}
/**
 * 이 두 캐릭터는 감정과 상관없이 이 규칙의 이 효과로 — 데모 연출용(예: 엔비디아가 네이버를 만나면 늘 놀리기).
 * effect = 규칙 effect 배열의 순번. null 이면 평소 규칙대로
 */
export type ForcedMeet = { ruleId: string; self: string; other: string; effect: number }
export type ForceMeet = (a: string, b: string) => ForcedMeet | null

// isOnCooldown -> State.ts에 있을 예정
export type MatchContext = {
    rules: RuleSet
    isOnCooldown: (ruleId: string, self: string, other: string) => boolean
    random: () => number
    forceMeet?: ForceMeet
}

type Candidate <R extends {id: string; priority: number}> = {
    rule: R;
    self: string;
    other: string;
}

// 로그는 남기지 않는다 — 고르지 못한 이유는 컨트롤러가 사건마다 한 줄로 남김 (ControllerOptions.log)
export function matchCharacter(a: CharView, b: CharView, ctx: MatchContext): Decision_C | null{
    // 정해 둔 만남(데모) — 그 규칙의 쿨다운은 지키고, 쿨다운 중이면 다른 규칙으로 새지 않고 아무것도 안 한다
    const forced = ctx.forceMeet?.(a.id, b.id)
    if (forced) {
        const found = ctx.rules.rulesById.get(forced.ruleId)
        const rule = found && 'other' in found.when ? (found as CharacterRule) : undefined
        const effect = rule?.effect[forced.effect]
        if (rule && effect) {
            if (ctx.isOnCooldown(rule.id, forced.self, forced.other)) return null
            return { rule, self: forced.self, other: forced.other, effect, otherEmotionTo: null }
        }
    }
    const forward = firstAvailable(ctx.rules.characterIndex.get(`${a.emotion}|${b.emotion}`), a.id, b.id, ctx);
    const backward = firstAvailable(ctx.rules.characterIndex.get(`${b.emotion}|${a.emotion}`), b.id, a.id, ctx);

    const picked = pickHigher(forward, backward);
    if(!picked) return null

    const effect = weightedPick(picked.rule.effect, ctx.random);
    const to = effect.otherEmotionTo

    return{
        rule: picked.rule,
        self: picked.self,
        other: picked.other,
        effect,
        otherEmotionTo: to.length? to[Math.floor(ctx.random()*to.length)] : null,
    }
}

export function matchFurniture(char: CharView, furnitureId: string, category: string, ctx: MatchContext): Decision_F | null {
    const cand = firstAvailable(ctx.rules.furnitureIndex.get(`${char.emotion}|${category}`), char.id, furnitureId, ctx)
    if (!cand) return null
    return {
        rule: cand.rule,
        self: cand.self,
        furniture: cand.other,
        effect: weightedPick(cand.rule.effect, ctx.random),
    }
}

function firstAvailable<R extends {id: string; priority: number}>(rules: R[]|undefined, a: string, b: string, ctx: MatchContext): Candidate<R> | null{
    if(!rules) return null; // 해당하는 규칙이 없는 경우
    for(const rule of rules){
        if(!ctx.isOnCooldown(rule.id, a, b)) return {rule, self: a, other: b};
    }
    return null;
}

function pickHigher<R extends {id: string; priority: number}>(forward: Candidate<R>|null, backward: Candidate<R>|null): Candidate<R>|null{
    if(!forward) return backward;
    if(!backward) return forward;
    return backward.rule.priority > forward.rule.priority ? backward : forward
}

function weightedPick<E extends {weight: number}>(effects: E[], random: () => number): E{
    const total = effects.reduce((sum, e) => sum + e.weight, 0);
    let num = random() * total;
    
    for(const effect of effects){
        num -= effect.weight;

        if(num <= 0) return effect;
    }

    return effects[effects.length - 1];
}