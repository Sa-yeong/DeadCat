import { describe, it, expect, beforeEach } from 'vitest'
import { loadRules, type RuleSet } from './ruleLoader'
import { LivingRoomController, type ControllerOptions, type Dispatcher, type PlayRequest } from './controller'
import type { RawData, Emotion } from './type/type'
import motions from './data/motions.json'
import furniture from './data/furniture.json'
import events from './data/events.json'
import poses from './data/poses.json'

// ---------- 테스트용 규칙 ----------
const CHAR_RULES = [
    // 위로하기: 그룹, 중심은 other(depress)
    { id: 'comfort', when: { self: ['happy', 'sad'], other: ['depress'] }, priority: 70, group: { focus: 'other' }, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'console', other: 'crying' }] },
    // 가벼운 인사: 그룹 아님
    { id: 'basic', when: { self: ['happy', 'sad'], other: ['happy', 'sad'] }, priority: 50, group: false, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'idle', other: 'idle' }] },
    // 깨우기: 상대의 감정이 모션이 끝난 뒤 바뀜
    { id: 'wake', when: { self: ['happy', 'sad'], other: ['sleepy'] }, priority: 60, group: false, interruptible: true, cooldownMs: 15000,
        effect: [{ weight: 1, self: ['wake_up', 'idle'], other: ['surprise', 'idle'], otherEmotionTo: ['happy'] }] },
    // 광기: 가장 높은 priority, 이 상호작용 자체는 끊을 수 없음
    { id: 'madness_other', when: { self: ['euphoria', 'panic'], other: ['happy', 'sad', 'tired', 'anxious'] }, priority: 100, group: false, interruptible: false, cooldownMs: 15000,
        effect: [{ weight: 1, self: 'pass_by', other: 'avoid' }] },
    // depress는 광기를 그냥 지나침: 그룹을 끊지 못하는 낮은 priority
    { id: 'dep_madness', when: { self: ['depress'], other: ['euphoria', 'panic'] }, priority: 60, group: false, interruptible: true, cooldownMs: 0,
        effect: [{ weight: 1, self: 'pass_by', other: 'pass_by' }] },
    // 같이 울기: 그룹, 중심 없음
    { id: 'cry_together', when: { self: ['depress'], other: ['depress'] }, priority: 60, group: { focus: null }, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'crying_together', other: 'crying_together' }] },
    // 끊을 수 없는 상호작용 (priority는 낮음)
    { id: 'lock', when: { self: ['anxious'], other: ['anxious'] }, priority: 40, group: false, interruptible: false, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'trembling', other: 'trembling' }] },
    // lock을 이길 만큼 priority가 높은 규칙
    { id: 'happy_anxious', when: { self: ['happy', 'sad'], other: ['anxious'] }, priority: 70, group: false, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'console', other: 'trembling' }] },
    // 서로 다른 상호작용 둘 사이에서 한쪽만 이기는 상황용 (55는 basic 50은 이기고 tired_pair 60은 못 이김)
    { id: 'tired_pair', when: { self: ['tired'], other: ['tired'] }, priority: 60, group: false, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'console', other: 'console' }] },
    { id: 'tease_tired', when: { self: ['happy', 'sad'], other: ['tired'] }, priority: 55, group: false, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'cheer_up', other: 'tired' }] },
]

const FURNITURE_RULES = [
    { id: 'tired_sofa', when: { self: ['tired'], furniture: ['sofa'] }, priority: 80, occupy: true, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'lie_down' }] },
    { id: 'euphoria_desk', when: { self: ['euphoria'], furniture: ['desk'] }, priority: 50, occupy: false, interruptible: true, cooldownMs: 5000,
        effect: [{ weight: 1, self: 'pass_by' }] },
]

const rules: RuleSet = loadRules(
    structuredClone({ characterRules: CHAR_RULES, furnitureRules: FURNITURE_RULES, motions, furniture, events, poses }) as unknown as RawData,
)

// ---------- 공통 준비 ----------
let t = 0
const now = () => t
beforeEach(() => { t = 0 })

function modelOf(category: string): string {
    for (const [model, def] of rules.furniture) if (def.category === category) return model
    throw new Error(`furniture.json에 category "${category}" 가구 모델이 없음`)
}
const SOFA_MODEL = modelOf('sofa')
const DESK_MODEL = modelOf('desk')

// 놓인 가구 (placementId). 같은 모델을 둘 놓을 수 있어서 SOFA와 SOFA_2는 모델이 같고 id만 다르다
const SOFA = 1
const DESK = 2
// const SOFA_2 = 3

// 쿨다운 키에서 가구 쪽 값: 컨트롤러가 matcher에 넘기는 String(placementId)
// const cdKey = (placementId: number) => String(placementId)

function setup(over: Partial<ControllerOptions> = {}) {
    const plays: PlayRequest[] = []
    const cancels: string[] = []
    const finishers = new Map<string, () => void>()
    const dispatcher: Dispatcher = {
        play: (req, onFinish) => { plays.push(req); finishers.set(req.characterId, onFinish) },
        cancel: id => { cancels.push(id); finishers.delete(id) },
    }
    const c = new LivingRoomController({
        rules, dispatcher, now,
        random: () => 0,                // 항상 첫 번째 선택지
        groupDurationMs: 15000,
        ...over,
    })
    const add = (id: string, emotion: Emotion) => c.addCharacter(id, emotion)
    // 엔진이 시킨 모션이 끝났다고 알린다
    const finish = (id: string) => { const f = finishers.get(id); finishers.delete(id); f?.() }
    // 아직 구현되지 않았을 수 있는 함수 (그룹 만료용). 없으면 아무 일도 하지 않는다
    const tick = () => (c as unknown as { tick?: () => void }).tick?.()
    return { c, plays, cancels, add, finish, tick }
}

const kindOf = (c: LivingRoomController, id: string) => c.state.getState(id)?.kind

// 위로 그룹을 만든다: c1(happy) c2(depress, 중심)
function comfortGroup() {
    const s = setup()
    s.add('c1', 'happy')
    s.add('c2', 'depress')
    s.c.encounter('c1', 'c2')
    return s
}

// ---------- 시작과 끝 ----------
describe('상호작용 시작과 끝', () => {
    it('happy가 depress에게 다가가면 위로하기가 시작되고 두 캐릭터가 각자의 모션을 재생한다', () => {
        const { c, plays } = comfortGroup()
        expect(plays).toEqual([
            { characterId: 'c1', motions: ['console'] },
            { characterId: 'c2', motions: ['crying'] },
        ])
        expect(kindOf(c, 'c1')).toBe('interactingGroup')
        expect(kindOf(c, 'c2')).toBe('interactingGroup')
    })

    it('그룹이 아닌 규칙은 reacting 상태가 된다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'sad')
        s.c.encounter('c1', 'c2')
        expect(s.c.state.getState('c1')).toEqual({ kind: 'reacting', ruleId: 'basic' })
        expect(s.plays).toEqual([
            { characterId: 'c1', motions: ['idle'] },
            { characterId: 'c2', motions: ['idle'] },
        ])
    })

    it('모든 참가자의 모션이 끝나면 배회로 돌아가고, 그 시점부터 쿨다운이 시작된다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'happy')
        s.c.encounter('c1', 'c2')

        t = 1000
        s.finish('c1')
        expect(kindOf(s.c, 'c1')).toBe('wandering')
        expect(s.c.state.isOnCooldown('basic', 'c1', 'c2')).toBe(false)     // 아직 c2가 남아 있어서 쿨다운 전

        s.finish('c2')
        expect(kindOf(s.c, 'c2')).toBe('wandering')
        t = 1000 + 20000 - 1
        expect(s.c.state.isOnCooldown('basic', 'c1', 'c2')).toBe(true)
        t = 1000 + 20000
        expect(s.c.state.isOnCooldown('basic', 'c1', 'c2')).toBe(false)
    })

    it('쿨다운 중에 다시 만나도 반응하지 않고, 풀린 뒤에는 반응한다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'happy')
        s.c.encounter('c1', 'c2')
        t = 1000
        s.finish('c1'); s.finish('c2')

        t = 2000
        s.c.encounter('c1', 'c2')
        expect(s.plays).toHaveLength(2)

        t = 21000
        s.c.encounter('c1', 'c2')
        expect(s.plays).toHaveLength(4)
    })

    it('깨우기: 상대의 감정은 모션이 끝난 뒤에 바뀐다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'sleepy')
        s.c.encounter('c1', 'c2')
        expect(s.plays).toEqual([
            { characterId: 'c1', motions: ['wake_up', 'idle'] },
            { characterId: 'c2', motions: ['surprise', 'idle'] },
        ])
        expect(s.c.getEmotion('c2')).toBe('sleepy')

        s.finish('c1')
        expect(s.c.getEmotion('c2')).toBe('sleepy')
        s.finish('c2')
        expect(s.c.getEmotion('c2')).toBe('happy')
    })
})

// ---------- 무시해야 하는 경우 ----------
describe('무시', () => {
    it('등록되지 않은 캐릭터는 에러 없이 무시한다', () => {
        const s = setup()
        s.add('c1', 'happy')
        expect(() => s.c.encounter('c1', 'ghost')).not.toThrow()
        expect(s.plays).toHaveLength(0)
    })

    it('상호작용 기록 없이 바쁜 캐릭터(드래그 중 등)와는 시작하지 않는다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'happy')
        s.c.state.setState('c2', { kind: 'dragging' })
        s.c.encounter('c1', 'c2')
        expect(s.plays).toHaveLength(0)
        expect(kindOf(s.c, 'c1')).toBe('wandering')
    })

    it('같은 상호작용 안의 두 캐릭터가 서로 가까워져도 아무 일도 없다', () => {
        const { c, plays } = comfortGroup()
        c.encounter('c1', 'c2')
        expect(plays).toHaveLength(2)
    })

    it('모르는 가구 모델은 에러 없이 무시한다', () => {
        const s = setup()
        s.add('c1', 'tired')
        expect(() => s.c.addFurniture(99, 'no_such_model')).not.toThrow()
        expect(() => s.c.visitFurniture('c1', 99)).not.toThrow()
        expect(s.plays).toHaveLength(0)
    })
})

// ---------- 끼어들기 ----------
describe('끼어들기', () => {
    function basicPair() {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'happy')
        s.c.encounter('c1', 'c2')              // basic (50)
        return s
    }

    it('priority가 같으면 끼어들지 못한다', () => {
        const s = basicPair()
        s.add('c3', 'happy')
        s.c.encounter('c3', 'c1')              // 이것도 basic (50)
        expect(s.plays).toHaveLength(2)
        expect(kindOf(s.c, 'c3')).toBe('wandering')
    })

    it('priority가 높으면 기존 상호작용을 통째로 끝내고 새로 시작한다', () => {
        const s = basicPair()
        s.add('c3', 'euphoria')
        s.c.encounter('c3', 'c1')              // madness_other (100)

        expect(s.cancels).toEqual(['c1', 'c2'])                       // 상대(c2)도 함께 끝난다
        expect(kindOf(s.c, 'c2')).toBe('wandering')
        expect(s.c.state.getState('c1')).toEqual({ kind: 'reacting', ruleId: 'madness_other' })
        expect(s.c.state.getState('c3')).toEqual({ kind: 'reacting', ruleId: 'madness_other' })
        expect(s.plays.slice(2)).toEqual([
            { characterId: 'c3', motions: ['pass_by'] },
            { characterId: 'c1', motions: ['avoid'] },
        ])
        expect(s.c.state.isOnCooldown('basic', 'c1', 'c2')).toBe(true)   // 끊긴 상호작용에도 쿨다운
    })

    it('interruptible이 false인 상호작용은 priority가 높아도 끊지 못한다', () => {
        const s = setup()
        s.add('c1', 'anxious'); s.add('c2', 'anxious'); s.add('c3', 'happy')
        s.c.encounter('c1', 'c2')              // lock (40, 끊을 수 없음)
        s.c.encounter('c3', 'c1')              // happy_anxious (70)가 매칭되지만
        expect(s.cancels).toEqual([])
        expect(s.plays).toHaveLength(2)
        expect(s.c.state.getState('c1')).toEqual({ kind: 'reacting', ruleId: 'lock' })
        expect(kindOf(s.c, 'c3')).toBe('wandering')
    })

    it('서로 다른 상호작용 둘 중 하나라도 못 이기면 둘 다 그대로 둔다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'happy'); s.add('c3', 'tired'); s.add('c4', 'tired')
        s.c.encounter('c1', 'c2')              // basic (50)
        s.c.encounter('c3', 'c4')              // tired_pair (60)
        s.c.encounter('c1', 'c3')              // tease_tired (55): 50은 이기지만 60은 못 이김
        expect(s.cancels).toEqual([])
        expect(s.plays).toHaveLength(4)
    })

    it('끼어들기 뒤에도 새 상호작용의 모션 끝 알림이 정상 처리된다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'happy'); s.add('c3', 'euphoria')
        s.c.encounter('c1', 'c2')
        s.c.encounter('c3', 'c1')
        s.finish('c1')                         // 새 상호작용(madness_other)의 모션 끝
        expect(kindOf(s.c, 'c1')).toBe('wandering')
        s.finish('c3')
        expect(s.c.state.isOnCooldown('madness_other', 'c3', 'c1')).toBe(true)
    })
})

// ---------- 그룹 합류 ----------
describe('그룹 합류', () => {
    it('그룹의 일반 멤버에게 닿아도 중심과 다시 매칭해서 합류하고, 합류한 캐릭터의 모션만 재생한다', () => {
        const s = comfortGroup()
        s.add('c3', 'happy')
        s.c.encounter('c3', 'c1')              // c1은 중심이 아닌 멤버
        expect(s.plays).toHaveLength(3)
        expect(s.plays[2]).toEqual({ characterId: 'c3', motions: ['console'] })
        expect(kindOf(s.c, 'c3')).toBe('interactingGroup')
    })

    it('중심에게 직접 닿아도 합류한다', () => {
        const s = comfortGroup()
        s.add('c3', 'sad')
        s.c.encounter('c3', 'c2')
        expect(s.plays[2]).toEqual({ characterId: 'c3', motions: ['console'] })
    })

    it('합류는 기존 멤버를 끊지 않고 새 상호작용도 만들지 않는다', () => {
        const s = comfortGroup()
        s.add('c3', 'happy')
        s.c.encounter('c3', 'c1')
        expect(s.cancels).toEqual([])
        expect(s.c.state.isOnCooldown('comfort', 'c3', 'c2')).toBe(false)
    })

    it('광기 캐릭터가 그룹의 일반 멤버에게 닿으면 합류하지 않고 그룹이 통째로 해체된다', () => {
        const s = comfortGroup()
        s.add('c3', 'euphoria')
        s.c.encounter('c3', 'c1')              // 중심(depress)과의 규칙은 그룹이 아니고, 멤버와는 madness_other (100 > 70)
        expect(s.cancels).toEqual(['c1', 'c2'])
        expect(kindOf(s.c, 'c2')).toBe('wandering')
        expect(s.c.state.getState('c1')).toEqual({ kind: 'reacting', ruleId: 'madness_other' })
    })

    it('광기 캐릭터가 그룹의 중심(depress)에게 직접 닿으면 아무 일도 없다 (60 < 70)', () => {
        const s = comfortGroup()
        s.add('c3', 'euphoria')
        s.c.encounter('c3', 'c2')
        expect(s.cancels).toEqual([])
        expect(s.plays).toHaveLength(2)
        expect(kindOf(s.c, 'c3')).toBe('wandering')
    })

    it('이미 다른 상호작용 중인 캐릭터는 합류하지 않는다', () => {
        const s = comfortGroup()
        s.add('c4', 'happy'); s.add('c5', 'happy')
        s.c.encounter('c4', 'c5')              // basic
        s.c.encounter('c4', 'c1')              // c4는 이미 바쁨
        expect(s.plays).toHaveLength(4)
        expect(s.c.state.getState('c4')).toEqual({ kind: 'reacting', ruleId: 'basic' })
    })

    it('중심이 없는 그룹(같이 울기)에는 닿은 멤버를 기준으로 합류한다', () => {
        const s = setup()
        s.add('c1', 'depress'); s.add('c2', 'depress'); s.add('c3', 'depress')
        s.c.encounter('c1', 'c2')              // cry_together, focus 없음
        s.c.encounter('c3', 'c1')
        expect(s.plays).toHaveLength(3)
        expect(s.plays[2]).toEqual({ characterId: 'c3', motions: ['crying_together'] })
    })
})

// ---------- 가구 ----------
describe('캐릭터와 가구', () => {
    it('tired가 소파에 다가가면 자리를 점유하고 모션을 재생한다', () => {
        const s = setup()
        s.c.addFurniture(SOFA, SOFA_MODEL)
        s.add('c1', 'tired')
        s.c.visitFurniture('c1', SOFA)
        expect(s.plays).toEqual([{ characterId: 'c1', motions: ['lie_down'] }])
        expect(s.c.state.getState('c1')).toMatchObject({ kind: 'interactingFurniture', furnitureId: SOFA, ruleId: 'tired_sofa' })
    })

    it('모션이 끝나면 자리가 비워지고 그 시점부터 쿨다운이 시작된다', () => {
        const s = setup()
        s.c.addFurniture(SOFA, SOFA_MODEL)
        s.add('c1', 'tired')
        s.c.visitFurniture('c1', SOFA)

        t = 1000
        s.finish('c1')
        expect(kindOf(s.c, 'c1')).toBe('wandering')
        expect(s.c.state.hasFreeAnchor(SOFA)).toBe(true)
        t = 1000 + 20000 - 1
        expect(s.c.state.isOnCooldown('tired_sofa', 'c1', SOFA_MODEL)).toBe(true)
        t = 1000 + 20000
        expect(s.c.state.isOnCooldown('tired_sofa', 'c1', SOFA_MODEL)).toBe(false)
    })

    it('occupy가 false인 규칙은 자리를 잡지 않는다 (euphoria × desk)', () => {
        const s = setup()
        s.c.addFurniture(DESK, DESK_MODEL)
        s.add('c1', 'euphoria')
        s.c.visitFurniture('c1', DESK)
        expect(s.c.state.getState('c1')).toEqual({ kind: 'reacting', ruleId: 'euphoria_desk' })
        expect(s.c.state.hasFreeAnchor(DESK)).toBe(true)
    })

    it('정원이 차면 다음 캐릭터는 가구가 없는 것처럼 지나간다', () => {
        const s = setup()
        s.c.addFurniture(SOFA, SOFA_MODEL)
        const cap = rules.furniture.get(SOFA_MODEL)!.anchors.length
        const ids = Array.from({ length: cap + 1 }, (_, i) => `c${i}`)
        ids.forEach(id => s.add(id, 'tired'))
        ids.forEach(id => s.c.visitFurniture(id, SOFA))

        const kinds = ids.map(id => kindOf(s.c, id))
        expect(kinds.filter(k => k === 'interactingFurniture')).toHaveLength(cap)
        expect(kinds.filter(k => k === 'wandering')).toHaveLength(1)
        expect(s.c.state.hasFreeAnchor(SOFA)).toBe(false)
    })

    it('쿨다운 중에는 같은 가구에 다시 들어가지 않는다', () => {
        const s = setup()
        s.c.addFurniture(SOFA, SOFA_MODEL)
        s.add('c1', 'tired')
        s.c.visitFurniture('c1', SOFA)
        t = 1000
        s.finish('c1')

        t = 2000
        s.c.visitFurniture('c1', SOFA)
        expect(s.plays).toHaveLength(1)
        t = 21000
        s.c.visitFurniture('c1', SOFA)
        expect(s.plays).toHaveLength(2)
    })

    it('가구를 치우면 쓰던 캐릭터가 모션 중단과 함께 배회로 돌아간다', () => {
        const s = setup()
        s.c.addFurniture(SOFA, SOFA_MODEL)
        s.add('c1', 'tired')
        s.c.visitFurniture('c1', SOFA)

        s.c.removeFurniture(SOFA)
        expect(s.cancels).toEqual(['c1'])
        expect(kindOf(s.c, 'c1')).toBe('wandering')
        expect(s.c.state.hasFreeAnchor(SOFA)).toBe(false)     // 가구 자체가 없어짐
    })

    it('감정이 바뀌면 점유가 풀리고 모션이 중단되며 쿨다운이 걸린다', () => {
        const s = setup()
        s.c.addFurniture(SOFA, SOFA_MODEL)
        s.add('c1', 'tired')
        s.c.visitFurniture('c1', SOFA)

        s.c.setEmotion('c1', 'happy')
        expect(s.cancels).toEqual(['c1'])
        expect(kindOf(s.c, 'c1')).toBe('wandering')
        expect(s.c.state.hasFreeAnchor(SOFA)).toBe(true)
        expect(s.c.state.isOnCooldown('tired_sofa', 'c1', SOFA_MODEL)).toBe(true)
    })
})

// ---------- 감정과 캐릭터 제거 ----------
describe('감정과 캐릭터 관리', () => {
    it('등록한 감정을 조회하고, 등록되지 않은 id의 감정 변경은 무시한다', () => {
        const s = setup()
        s.add('c1', 'happy')
        expect(s.c.getEmotion('c1')).toBe('happy')
        expect(s.c.getEmotion('ghost')).toBeUndefined()
        expect(() => s.c.setEmotion('ghost', 'sad')).not.toThrow()
    })

    it('감정이 바뀌면 그 캐릭터의 진행 중인 상호작용이 끊기고, 같은 감정이면 아무 일도 없다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'happy')
        s.c.encounter('c1', 'c2')

        s.c.setEmotion('c1', 'happy')                          // 같은 감정
        expect(s.cancels).toEqual([])

        s.c.setEmotion('c1', 'sad')
        expect(s.cancels).toEqual(['c1'])
        expect(s.c.getEmotion('c1')).toBe('sad')
        expect(kindOf(s.c, 'c2')).toBe('reacting')             // 비그룹이라 상대는 계속 진행
    })

    it('상호작용 중에 캐릭터를 제거해도 상대의 진행과 종료는 정상이다', () => {
        const s = setup()
        s.add('c1', 'happy'); s.add('c2', 'happy')
        s.c.encounter('c1', 'c2')

        s.c.removeCharacter('c1')
        expect(s.cancels).toEqual(['c1'])
        expect(s.c.state.getState('c1')).toBeUndefined()
        expect(s.c.getEmotion('c1')).toBeUndefined()

        expect(() => s.finish('c2')).not.toThrow()
        expect(kindOf(s.c, 'c2')).toBe('wandering')
    })
})

// ---------- 그룹 해체 ----------
// 아래는 tick(), interrupt의 그룹 후속 처리, finished의 그룹 구분을 구현한 뒤에 .skip을 지우고 돌린다.
describe('그룹 해체 (구현 후 활성화)', () => {
    it('groupDurationMs가 지나면 tick에서 모든 멤버가 해체되고 쿨다운이 걸린다', () => {
        const s = comfortGroup()
        t = 14999
        s.tick()
        expect(s.cancels).toEqual([])

        t = 15000
        s.tick()
        expect(s.cancels).toEqual(['c1', 'c2'])
        expect(kindOf(s.c, 'c1')).toBe('wandering')
        expect(s.c.state.isOnCooldown('comfort', 'c1', 'c2')).toBe(true)
    })

    it('중심의 감정이 바뀌면 그룹 전체가 해체된다', () => {
        const s = comfortGroup()
        s.c.setEmotion('c2', 'happy')
        expect(kindOf(s.c, 'c1')).toBe('wandering')
        expect(kindOf(s.c, 'c2')).toBe('wandering')
    })

    it('두 명짜리 그룹에서 한 명이 빠지면 나머지도 해체된다', () => {
        const s = comfortGroup()
        s.c.interrupt('c1')
        expect(kindOf(s.c, 'c2')).toBe('wandering')
    })

    it('세 명 이상의 그룹에서 일반 멤버가 빠지면 그룹은 유지된다', () => {
        const s = comfortGroup()
        s.add('c3', 'happy')
        s.c.encounter('c3', 'c1')
        s.c.interrupt('c3')
        expect(kindOf(s.c, 'c3')).toBe('wandering')
        expect(kindOf(s.c, 'c1')).toBe('interactingGroup')
        expect(kindOf(s.c, 'c2')).toBe('interactingGroup')
    })

    it('중심이 빠지면 남은 멤버가 있어도 그룹 전체가 해체된다', () => {
        const s = comfortGroup()
        s.add('c3', 'happy')
        s.c.encounter('c3', 'c1')
        s.c.interrupt('c2')
        expect(kindOf(s.c, 'c1')).toBe('wandering')
        expect(kindOf(s.c, 'c3')).toBe('wandering')
    })
})