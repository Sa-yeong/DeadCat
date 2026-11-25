import { describe, it, expect, beforeEach } from 'vitest'
import { InteractionState } from './state'
import { loadRules } from './ruleLoader'
import { matchCharacter } from './matcher'
import type { RawData } from './type/type'
import characterRules from './data/characterRules.json'
import furnitureRules from './data/furnitureRules.json'
import motions from './data/motions.json'
import furniture from './data/furniture.json'
import events from './data/events.json'
import poses from './data/poses.json'

let t = 0
let state: InteractionState

beforeEach(() => {
    t = 0
    state = new InteractionState(() => t)   // 가짜 시계
})

describe('쿨다운', () => {
    it('기록 전에는 쿨다운이 아니다', () => {
        expect(state.isOnCooldown('r1', 'c1', 'c2')).toBe(false)
    })

    it('시작하면 시간이 지나기 전까지 쿨다운이다', () => {
        state.startCooldown('r1', 'c1', 'c2', 1000)
        t = 999
        expect(state.isOnCooldown('r1', 'c1', 'c2')).toBe(true)
    })

    it('정확히 만료 시각이 되면 풀린다', () => {
        state.startCooldown('r1', 'c1', 'c2', 1000)
        t = 1000
        expect(state.isOnCooldown('r1', 'c1', 'c2')).toBe(false)
    })

    it('쌍의 순서가 달라도 같은 쿨다운이다', () => {
        state.startCooldown('r1', 'c1', 'c2', 1000)
        expect(state.isOnCooldown('r1', 'c2', 'c1')).toBe(true)
    })

    it('다른 쌍, 다른 규칙에는 영향이 없다', () => {
        state.startCooldown('r1', 'c1', 'c2', 1000)
        expect(state.isOnCooldown('r1', 'c1', 'c3')).toBe(false)
        expect(state.isOnCooldown('r2', 'c1', 'c2')).toBe(false)
    })

    it('cooldownMs가 0이면 기록하지 않는다', () => {
        state.startCooldown('r1', 'c1', 'c2', 0)
        expect(state.isOnCooldown('r1', 'c1', 'c2')).toBe(false)
    })

    it('prune은 만료된 것만 지운다', () => {
        state.startCooldown('short', 'c1', 'c2', 100)
        state.startCooldown('long', 'c1', 'c2', 10000)
        t = 500
        state.prune()
        expect(state.isOnCooldown('short', 'c1', 'c2')).toBe(false)
        expect(state.isOnCooldown('long', 'c1', 'c2')).toBe(true)
    })
})

describe('캐릭터 상태', () => {
    it('등록하면 배회 상태이고 상호작용할 수 있다', () => {
        state.addCharacter('c1')
        expect(state.getState('c1')).toEqual({ kind: 'wandering' })
        expect(state.canInteract('c1')).toBe(true)
    })

    it('드래그 중에는 상호작용할 수 없다', () => {
        state.addCharacter('c1')
        state.setState('c1', { kind: 'dragging' })
        expect(state.canInteract('c1')).toBe(false)
    })

    it('resetState로 배회로 돌아간다', () => {
        state.addCharacter('c1')
        state.setState('c1', { kind: 'dragging' })
        state.resetState('c1')
        expect(state.canInteract('c1')).toBe(true)
    })

    it('등록되지 않은 캐릭터는 상호작용할 수 없고, 상태를 바꾸면 에러다', () => {
        expect(state.canInteract('ghost')).toBe(false)
        expect(() => state.setState('ghost', { kind: 'dragging' })).toThrow(/등록되지 않은/)
    })

    it('removeCharacter는 그 캐릭터의 쿨다운 기록도 지운다', () => {
        state.addCharacter('c1')
        state.startCooldown('r1', 'c1', 'c2', 10000)
        state.startCooldown('r1', 'c3', 'c4', 10000)
        state.removeCharacter('c1')
        expect(state.getState('c1')).toBeUndefined()
        expect(state.isOnCooldown('r1', 'c1', 'c2')).toBe(false)
        expect(state.isOnCooldown('r1', 'c3', 'c4')).toBe(true)   // 다른 쌍은 유지
    })
})

describe('매처 연결', () => {
    const rules = loadRules(
        structuredClone({ characterRules, furnitureRules, motions, furniture, events, poses }) as unknown as RawData,
    )
    const happy = { id: 'c1', emotion: 'happy' as const }
    const depress = { id: 'c2', emotion: 'depress' as const }

    it('쿨다운 중에는 매칭되지 않고, 풀리면 다시 매칭된다', () => {
        const ctx = state.createMatchContext(rules, () => 0)

        const first = matchCharacter(happy, depress, ctx)
        expect(first?.rule.id).toBe('basic_meet_depress')

        state.startCooldown(first!.rule.id, first!.self, first!.other, first!.rule.cooldownMs)
        expect(matchCharacter(happy, depress, ctx)).toBeNull()

        t = first!.rule.cooldownMs
        expect(matchCharacter(happy, depress, ctx)?.rule.id).toBe('basic_meet_depress')
    })

    it('매처를 호출하는 것만으로는 쿨다운이 소모되지 않는다', () => {
        const ctx = state.createMatchContext(rules, () => 0)
        matchCharacter(happy, depress, ctx)
        matchCharacter(happy, depress, ctx)
        expect(matchCharacter(happy, depress, ctx)).not.toBeNull()
    })
})

describe('가구 점유', () => {
    const SOFA = 1, DESK = 2, UNKNOWN = 999   // 가구 배치 id는 number
    beforeEach(() => {
        ['c1', 'c2', 'c3'].forEach(id => state.addCharacter(id));
        state.registerFurniture(SOFA, ['seat_l', 'seat_r'])
        state.registerFurniture(DESK, ['chair'])
    })
    // 빈 앵커를 고르는 건 컨트롤러(getFreeAnchors → effect.placed 만큼) — state 는 받은 앵커를 그 캐릭터 것으로 적는다(5448b34)
    const take = (id: number, c: string, n = 1) => {
        const anchors = state.getFreeAnchors(id).slice(0, n)
        state.occupy(id, c, 'r1', anchors)
        return anchors
    }

    it('등록된 가구는 빈 앵커가 있고, 등록되지 않은 가구는 없음', () => {
        expect(state.getFreeAnchors(SOFA)).toEqual(['seat_l', 'seat_r']);
        expect(state.getFreeAnchors(UNKNOWN)).toEqual([]);
    })

    it('occupy: 받은 앵커를 캐릭터 상태에 적는다', () => {
        state.occupy(SOFA, 'c1', 'r1', ['seat_l'])
        expect(state.getState('c1')).toEqual({
            kind: 'interactingFurniture', furnitureId: SOFA, anchorId: ['seat_l'], ruleId: 'r1'
        })
        expect(state.getFreeAnchors(SOFA)).toEqual(['seat_r'])
    })

    it('두 캐릭터는 서로 다른 앵커를 받는다', () => {
        const a = take(SOFA, 'c1')
        const b = take(SOFA, 'c2')
        expect(a).not.toEqual(b)
    })

    it('두 자리를 한 번에(placed 2) — 소파를 통째로 쓰면 빈 앵커가 없다(거실모션 H-3)', () => {
        expect(take(SOFA, 'c1', 2)).toEqual(['seat_l', 'seat_r'])
        expect(state.getFreeAnchors(SOFA)).toEqual([])
        state.resetState('c1')
        expect(state.getFreeAnchors(SOFA)).toEqual(['seat_l', 'seat_r'])   // 끝나면 두 자리 다 빈다
    })

    it('정원이 차면 빈 앵커가 없다', () => {
        take(SOFA, 'c1')
        take(SOFA, 'c2')
        expect(state.getFreeAnchors(SOFA)).toEqual([])
    })

    it('다른 가구의 정원에는 영향이 없다', () => {
        take(SOFA, 'c1')
        take(SOFA, 'c2')
        expect(state.getFreeAnchors(DESK)).toEqual(['chair'])
    })

    it('resetState로 상태가 바뀌면 앵커가 자동으로 비워진다', () => {
        take(DESK, 'c1')
        expect(state.getFreeAnchors(DESK)).toEqual([])
        state.resetState('c1')
        expect(state.getFreeAnchors(DESK)).toEqual(['chair'])
    })

    it('드래그로 상태가 바뀌어도 앵커가 비워진다', () => {
        take(DESK, 'c1')
        state.setState('c1', { kind: 'dragging' })
        expect(state.getFreeAnchors(DESK)).toEqual(['chair'])
    })

    it('removeCharacter 후에도 앵커가 비워진다', () => {
        take(DESK, 'c1')
        state.removeCharacter('c1')
        expect(state.getFreeAnchors(DESK)).toEqual(['chair'])
    })

    it('비워진 앵커는 다음 캐릭터가 받을 수 있다', () => {
        take(DESK, 'c1')
        state.resetState('c1')
        expect(take(DESK, 'c2')).toEqual(['chair'])
    })

    it('removeFurniture는 점유 중이던 캐릭터를 배회로 돌려보낸다', () => {
        take(SOFA, 'c1')
        state.removeFurniture(SOFA)
        expect(state.getState('c1')).toEqual({ kind: 'wandering' })
        expect(state.canInteract('c1')).toBe(true)
        expect(state.getFreeAnchors(SOFA)).toEqual([])   // 가구 자체가 없어짐
    })

    it('등록되지 않은 캐릭터가 occupy하면 에러다', () => {
        expect(() => state.occupy(DESK, 'ghost', 'r1', ['chair'])).toThrow(/등록되지 않은/)
    })
})
