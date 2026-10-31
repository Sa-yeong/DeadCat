import { type MatchContext, matchCharacter, matchFurniture } from "./matcher"
import { expect, it } from "vitest"
import { loadRules, type RuleSet } from "./ruleLoader"
import type { RawData } from './type/type'
import characterRules from './data/characterRules.json'
import furnitureRules from './data/furnitureRules.json'
import motions from './data/motions.json'
import furniture from './data/furniture.json'
import events from './data/events.json'

const realData = () =>
  structuredClone({ characterRules, furnitureRules, motions, furniture, events }) as unknown as RawData

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
    expect(matchCharacter(happy, tired, ctxChar({ random: () => 0.7 }))?.effect.self).toEqual(['tease'])
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