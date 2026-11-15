import { type MatchContext, matchCharacter, matchFurniture } from "./matcher"
import { expect, it } from "vitest"
import { loadRules, type RuleSet } from "./ruleLoader"
import type { RawData } from './type/type'
import characterRules from './data/characterRules.json'
import furnitureRules from './data/furnitureRules.json'
import motions from './data/motions.json'
import furniture from './data/furniture.json'
import events from './data/events.json'
import poses from './data/poses.json'

const realData = () =>
  structuredClone({ characterRules, furnitureRules, motions, furniture, events, poses }) as unknown as RawData

const ruleSet: RuleSet = loadRules(realData())

const ctxChar = (over = {}): MatchContext => ({ rules: ruleSet, isOnCooldown: () => false, random: () => 0, ...over })
const happy = { id: 'c1', emotion: 'happy' as const }
const depress = { id: 'c2', emotion: 'depress' as const }

it('forward: a가 self', () => {
    expect(matchCharacter(happy, depress, ctxChar())?.self).toBe('c1')
})
it('backward: 순서를 바꿔도 happy 쪽이 self', () => {
    expect(matchCharacter(depress, happy, ctxChar())?.self).toBe('c1')   // happy가 c1
})
it('같은 감정끼리는 a가 self', () => {
    const r = matchCharacter({ id: 'x', emotion: 'tired' }, { id: 'y', emotion: 'tired' }, ctxChar())
    expect(r?.self).toBe('x')
})
it('쿨다운 중이면 null', () => {
    expect(matchCharacter(happy, depress, ctxChar({ isOnCooldown: () => true }))).toBeNull()
})
it('weight 6:4 선택 (basic_meet_tired)', () => {
    const tired = { id: 't', emotion: 'tired' as const }
    expect(matchCharacter(happy, tired, ctxChar({ random: () => 0.5 }))?.effect.self).toEqual(['cheer_up'])
    // 놀리기는 발견(한 번) → 웃기(반복) 두 단계 (2026-11-14 도휘 teasing.vrma)
    expect(matchCharacter(happy, tired, ctxChar({ random: () => 0.7 }))?.effect.self).toEqual(['tease_find', 'tease'])
})

const ctxFur = (over = {}): MatchContext => ({ rules: ruleSet, isOnCooldown: () => false, random: () => 0, ...over })

it('가구: panic × sofa', () => {
    const r = matchFurniture({ id: 'c1', emotion: 'panic' }, 'sofa_1', 'sofa', ctxFur())
    expect(r?.rule.id).toBe('panic_sofa')
    expect(r?.effect.self).toEqual(['breaking_sofa'])
})
it('가구: sleepy는 규칙 없음', () => {
    expect(matchFurniture({ id: 'c1', emotion: 'sleepy' }, 'desk_1', 'desk', ctxFur())).toBeNull()
})
it('가구: weight 6:4', () => {
    const c = { id: 'c1', emotion: 'tired' as const }
    expect(matchFurniture(c, 'd1', 'desk', ctxFur({ random: () => 0.5 }))?.effect.self).toEqual(['space_out'])
    expect(matchFurniture(c, 'd1', 'desk', ctxFur({ random: () => 0.7 }))?.effect.self).toEqual(['lean_forward'])
})
it('otherEmotionTo가 random으로 선택됨', () => {
    const happy = { id: 'a', emotion: 'happy' as const }
    const sleepy = { id: 'b', emotion: 'sleepy' as const }
    expect(matchCharacter(happy, sleepy, ctxFur({ random: () => 0.1 }))?.otherEmotionTo).toBe('happy')
    expect(matchCharacter(happy, sleepy, ctxFur({ random: () => 0.9 }))?.otherEmotionTo).toBe('sad')
})
// 정해 둔 만남(데모 연출 — runtime/roomDemo.ts)
const forceTease = (a: string, b: string) =>
    (a === 'nv' && b === 'na') || (a === 'na' && b === 'nv')
        ? { ruleId: 'basic_meet_tired', self: 'nv', other: 'na', effect: 1 }
        : null
it('정해 둔 만남: 감정 · 확률과 상관없이 그 규칙의 그 효과(놀리기), 순서를 바꿔도 같다', () => {
    const nv = { id: 'nv', emotion: 'anxious' as const }   // 평소라면 anxious_meet_tired
    const na = { id: 'na', emotion: 'tired' as const }
    for (const [a, b] of [[nv, na], [na, nv]]) {
        const r = matchCharacter(a, b, ctxChar({ random: () => 0, forceMeet: forceTease }))
        expect(r?.rule.id).toBe('basic_meet_tired')
        expect(r?.self).toBe('nv')
        expect(r?.other).toBe('na')
        expect(r?.effect.self).toEqual(['tease_find', 'tease'])
        expect(r?.effect.other).toEqual(['tired'])
    }
})
it('정해 둔 만남: 쿨다운 중이면 다른 규칙으로 새지 않고 null', () => {
    const r = matchCharacter({ id: 'nv', emotion: 'happy' }, { id: 'na', emotion: 'tired' },
        ctxChar({ forceMeet: forceTease, isOnCooldown: (id: string) => id === 'basic_meet_tired' }))
    expect(r).toBeNull()
})
it('정해 두지 않은 쌍은 평소 규칙대로', () => {
    const r = matchCharacter(happy, { id: 't', emotion: 'tired' }, ctxChar({ random: () => 0.5, forceMeet: forceTease }))
    expect(r?.effect.self).toEqual(['cheer_up'])
})
