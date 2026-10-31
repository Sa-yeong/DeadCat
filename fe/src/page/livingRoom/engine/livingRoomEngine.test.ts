import { describe, it, expect, beforeEach } from 'vitest'
import { loadRules, type RuleSet } from './ruleLoader'
import { LivingRoomEngine, type EngineCommand, type FeedEvent, type EmotionFeed, type EngineOptions } from './Engine'
import type { RawData, Emotion } from './type/type'
import motions from './data/motions.json'
import furniture from './data/furniture.json'
import events from './data/events.json'
import poses from './data/poses.json'

// 바깥 창구(LivingRoomEngine) 테스트: 피드 → 감정 대기·등록 → 명령, tick, 로그
// 컨트롤러 판단 자체는 engine.test.ts에서 본다

// ---------- 테스트용 규칙 ----------
const CHAR_RULES = [
    { id: 'basic', when: { self: ['happy', 'sad'], other: ['happy', 'sad'] }, priority: 50, group: false, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'idle', other: 'idle' }] },
    // 깨우기: 모션이 끝나면 상대 감정이 happy로 바뀜
    { id: 'wake', when: { self: ['happy', 'sad'], other: ['sleepy'] }, priority: 60, group: false, interruptible: true, cooldownMs: 15000,
        effect: [{ weight: 1, self: 'wake_up', other: 'surprise', otherEmotionTo: ['happy'] }] },
    { id: 'comfort', when: { self: ['happy', 'sad'], other: ['depress'] }, priority: 70, group: { focus: 'other' }, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'console', other: 'crying' }] },
]

const FURNITURE_RULES = [
    // 반복 모션으로 끝남 → 30초 제한
    { id: 'tired_sofa', when: { self: ['tired'], furniture: ['sofa'] }, priority: 80, occupy: true, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: 'lie_down' }] },
    // 한 번짜리 모션으로 끝남 → 시간 제한 없음
    { id: 'happy_sofa', when: { self: ['happy'], furniture: ['sofa'] }, priority: 80, occupy: true, interruptible: true, cooldownMs: 20000,
        effect: [{ weight: 1, self: ['wake_up', 'idle'] }] },
]

const rules: RuleSet = loadRules(
    structuredClone({ characterRules: CHAR_RULES, furnitureRules: FURNITURE_RULES, motions, furniture, events, poses }) as unknown as RawData,
)

const SOFA = 1
const SOFA_MODEL = [...rules.furniture].find(([, def]) => def.category === 'sofa')![0]

let t = 0
beforeEach(() => { t = 0 })

function setup(over: Partial<EngineOptions> = {}) {
    let handler: ((e: FeedEvent) => void) | null = null
    const feed: EmotionFeed = {
        subscribe: h => { handler = h; return () => { handler = null } },
    }
    const commands: EngineCommand[] = []
    const logs: string[] = []
    const engine = new LivingRoomEngine({
        rules, feed, now: () => t, random: () => 0,
        onCommand: cmd => commands.push(cmd),
        log: line => logs.push(line),
        ...over,
    })
    engine.start()

    const emit = (e: FeedEvent) => handler?.(e)
    const snapshot = (chars: [string, Emotion][]) =>
        emit({ type: 'snapshot', data: { characters: chars.map(([characterId, emotion]) => ({ characterId, emotion })), furniture: [] } })
    const of = (type: EngineCommand['type']) => commands.filter(c => c.type === type)
    // 그 캐릭터의 모션이 끝났다고 알린다
    const finish = (id: string) => engine.motionFinished(id)
    return { engine, commands, logs, emit, snapshot, of, finish, unsubscribed: () => handler === null }
}

const emotionCmd = (characterId: string, emotion: Emotion): EngineCommand =>
    ({ type: 'emotion', characterId, emotion, idle: 'idle', walk: 'walk' })

// ---------- 1-5 등록 순서 ----------
describe('캐릭터 등록 순서 (1-5)', () => {
    it('snapshot보다 addCharacter가 먼저 와도 감정이 오는 순간 등록되어 반응한다', () => {
        const s = setup()
        s.engine.addCharacter('1'); s.engine.addCharacter('2')
        expect(s.engine.isWaitingEmotion('1')).toBe(true)

        s.snapshot([['1', 'happy'], ['2', 'sad']])
        expect(s.engine.isWaitingEmotion('1')).toBe(false)
        expect(s.of('emotion')).toEqual([emotionCmd('1', 'happy'), emotionCmd('2', 'sad')])

        s.engine.encounter('1', '2')
        expect(s.of('play')).toHaveLength(2)
    })

    it('snapshot이 먼저 오면 addCharacter 때 바로 등록된다', () => {
        const s = setup()
        s.snapshot([['1', 'happy'], ['2', 'sad']])
        expect(s.commands).toEqual([])                          // 아직 아무도 거실에 안 섰음

        s.engine.addCharacter('1'); s.engine.addCharacter('2')
        expect(s.of('emotion')).toEqual([emotionCmd('1', 'happy'), emotionCmd('2', 'sad')])
        s.engine.encounter('1', '2')
        expect(s.of('play')).toHaveLength(2)
    })

    it('snapshot에 있어도 런타임이 세우지 않은 캐릭터는 등록되지 않는다', () => {
        const s = setup()
        s.engine.addCharacter('1')
        s.snapshot([['1', 'happy'], ['2', 'happy']])

        expect(s.engine.emotionOf('2')).toBe('happy')           // 감정은 기억
        expect(s.engine.isWaitingEmotion('2')).toBe(false)      // 거실에 없음
        s.engine.encounter('1', '2')
        expect(s.of('play')).toEqual([])
        expect(s.of('emotion')).toEqual([emotionCmd('1', 'happy')])
    })

    it('snapshot이 두 번 와도 중복 등록·중복 명령이 없고, 바뀐 감정만 반영된다', () => {
        const s = setup()
        s.engine.addCharacter('1'); s.engine.addCharacter('2')
        s.snapshot([['1', 'happy'], ['2', 'sad']])
        s.engine.encounter('1', '2')                            // basic 진행 중

        s.snapshot([['1', 'happy'], ['2', 'sad']])              // 재연결: 같은 감정
        expect(s.of('emotion')).toHaveLength(2)
        expect(s.of('cancel')).toEqual([])                      // 진행 중 상호작용도 그대로

        s.snapshot([['1', 'happy'], ['2', 'depress']])          // 재연결 사이 감정이 바뀜
        expect(s.of('emotion')).toEqual([emotionCmd('1', 'happy'), emotionCmd('2', 'sad'), emotionCmd('2', 'depress')])
        expect(s.engine.emotionOf('2')).toBe('depress')
    })

    it('감정 대기 중인 캐릭터와의 마주침·가구 방문은 무시된다', () => {
        const s = setup()
        s.engine.addFurniture(SOFA, SOFA_MODEL)
        s.engine.addCharacter('1'); s.engine.addCharacter('2')
        s.snapshot([['1', 'happy']])

        s.engine.encounter('1', '2')
        s.engine.visitFurniture('2', SOFA)
        expect(s.of('play')).toEqual([])
        expect(s.logs).toContain('1 × 2: 감정 대기')
        expect(s.logs).toContain('2 × 가구 1: 감정 대기')
    })

    it('거실에서 뺀 캐릭터는 감정 기록도 지워져, 다시 세우면 다음 감정까지 대기한다', () => {
        const s = setup()
        s.engine.addCharacter('1')
        s.snapshot([['1', 'happy']])
        s.engine.deleteCharacter('1')
        expect(s.engine.emotionOf('1')).toBeUndefined()

        s.engine.addCharacter('1')
        expect(s.engine.isWaitingEmotion('1')).toBe(true)
        s.snapshot([['1', 'sad']])                              // 프리셋을 바꾸면 런타임이 재연결 (1-5 B)
        expect(s.engine.isWaitingEmotion('1')).toBe(false)
    })
})

// ---------- 1-1 emotion 명령 ----------
describe('emotion 명령 (1-1 · 1-8)', () => {
    it('백엔드 emotion 이벤트로 감정이 바뀌면 기본 자세와 함께 보내고, 같은 감정이면 보내지 않는다', () => {
        const s = setup()
        s.engine.addCharacter('1')
        s.snapshot([['1', 'happy']])
        s.emit({ type: 'emotion', characterId: '1', emotion: 'happy' })
        s.emit({ type: 'emotion', characterId: '1', emotion: 'panic' })
        expect(s.of('emotion')).toEqual([emotionCmd('1', 'happy'), emotionCmd('1', 'panic')])
    })

    it('emotion 이벤트가 감정 대기를 풀기도 한다', () => {
        const s = setup()
        s.engine.addCharacter('1')
        s.emit({ type: 'emotion', characterId: '1', emotion: 'tired' })
        expect(s.engine.isWaitingEmotion('1')).toBe(false)
        expect(s.of('emotion')).toEqual([emotionCmd('1', 'tired')])
    })

    it('규칙이 감정을 바꾸면(깨우기) 모션이 끝난 뒤 emotion 명령이 나가고 emotionOf도 새 감정이다', () => {
        const s = setup()
        s.engine.addCharacter('1'); s.engine.addCharacter('2')
        s.snapshot([['1', 'happy'], ['2', 'sleepy']])
        s.engine.encounter('1', '2')
        expect(s.of('emotion')).toHaveLength(2)

        s.finish('2')
        expect(s.of('emotion').at(-1)).toEqual(emotionCmd('2', 'happy'))
        expect(s.engine.emotionOf('2')).toBe('happy')
    })

    it('기본 자세는 poses.json의 감정 묶음에서 온다', () => {
        for (const e of ['happy', 'sad', 'tired', 'depress', 'euphoria', 'panic', 'anxious', 'sleepy'] as Emotion[]) {
            expect(rules.poses[e]).toEqual({ idle: 'idle', walk: 'walk' })
        }
    })
})

// ---------- 1-6 tick ----------
describe('tick (1-6)', () => {
    it('그룹은 15초가 지나면 tick에서 전원 cancel되고 쿨다운이 걸린다', () => {
        const s = setup()
        s.engine.addCharacter('1'); s.engine.addCharacter('2')
        s.snapshot([['1', 'happy'], ['2', 'depress']])
        s.engine.encounter('1', '2')

        t = 14999; s.engine.tick()
        expect(s.of('cancel')).toEqual([])
        t = 15000; s.engine.tick()
        expect(s.of('cancel')).toEqual([{ type: 'cancel', characterId: '1' }, { type: 'cancel', characterId: '2' }])

        s.engine.encounter('1', '2')                            // 쿨다운 중
        expect(s.of('play')).toHaveLength(2)
    })

    it('반복 모션으로 끝나는 가구 상호작용은 30초 뒤 cancel되고 자리가 비며 쿨다운이 걸린다', () => {
        const s = setup()
        s.engine.addFurniture(SOFA, SOFA_MODEL)
        s.engine.addCharacter('1'); s.engine.addCharacter('2')
        s.snapshot([['1', 'tired'], ['2', 'tired']])
        s.engine.visitFurniture('1', SOFA)
        s.engine.visitFurniture('2', SOFA)
        expect(s.of('play')).toHaveLength(2)                    // 2인용 소파

        t = 29999; s.engine.tick()
        expect(s.of('cancel')).toEqual([])
        t = 30000; s.engine.tick()
        expect(s.of('cancel')).toEqual([{ type: 'cancel', characterId: '1' }, { type: 'cancel', characterId: '2' }])

        s.engine.visitFurniture('1', SOFA)                      // 자리는 비었지만 쿨다운 중
        expect(s.of('play')).toHaveLength(2)
        t = 50000
        s.engine.visitFurniture('1', SOFA)
        expect(s.of('play')).toHaveLength(3)
    })

    it('가구 시작 로그에 시간 제한이 표시된다', () => {
        const s = setup()
        s.engine.addFurniture(SOFA, SOFA_MODEL)
        s.engine.addCharacter('1')
        s.snapshot([['1', 'tired']])
        s.engine.visitFurniture('1', SOFA)
        expect(s.logs.at(-1)).toContain('30초 제한')
    })

    it('한 번짜리 모션으로 끝나는 가구 상호작용은 시간 제한 없이 모션 끝 알림으로 끝난다', () => {
        const s = setup()
        s.engine.addFurniture(SOFA, SOFA_MODEL)
        s.engine.addCharacter('1')
        s.snapshot([['1', 'happy']])
        s.engine.visitFurniture('1', SOFA)

        expect(s.logs.at(-1)).not.toContain('제한')

        t = 60000; s.engine.tick()
        expect(s.of('cancel')).toEqual([])
    })
})

// ---------- 1-11 로그 ----------
describe('로그 (1-11)', () => {
    it('사건마다 결과와 이유를 한 줄로 남기고, 이름을 곁들인다', () => {
        const names: Record<string, string> = { '1': '삼성전자', '2': '카카오', '3': 'NAVER', '4': 'SK하이닉스' }
        const s = setup({ labelOf: id => names[id] })
        for (const id of ['1', '2', '3', '4']) s.engine.addCharacter(id)
        s.snapshot([['1', 'happy'], ['2', 'depress'], ['3', 'sad'], ['4', 'depress']])
        s.logs.length = 0

        s.engine.encounter('2', '4')                            // depress × depress 규칙 없음
        s.engine.encounter('1', '2')                            // 시작
        s.engine.encounter('3', '1')                            // 그룹 일반 멤버에게 닿음 → 중심과 매칭해 합류
        s.engine.encounter('4', '2')                            // 그룹 중심에게 닿았지만 규칙 없음
        expect(s.logs).toEqual([
            '2(카카오) × 4(SK하이닉스): 규칙 없음(depress × depress)',
            '1(삼성전자) × 2(카카오): 시작 → comfort (console / crying)',
            '3(NAVER) × 2(카카오): 그룹 합류 → comfort (console)',
            '4(SK하이닉스) × 2(카카오): 규칙 없음(depress × depress)',
        ])
    })

    it('쿨다운 중이면 남은 시간을 초 단위로 남긴다', () => {
        const s = setup()
        s.engine.addCharacter('1'); s.engine.addCharacter('2')
        s.snapshot([['1', 'happy'], ['2', 'sad']])
        s.engine.encounter('1', '2')
        s.finish('1'); s.finish('2')

        t = 8000
        s.engine.encounter('2', '1')
        expect(s.logs.at(-1)).toBe('2 × 1: 쿨다운 중(12초 남음)')
    })

    it('시간 만료도 한 줄로 남긴다', () => {
        const s = setup()
        s.engine.addFurniture(SOFA, SOFA_MODEL)
        s.engine.addCharacter('1')
        s.snapshot([['1', 'tired']])
        s.engine.visitFurniture('1', SOFA)
        t = 30000; s.engine.tick()
        expect(s.logs.at(-1)).toBe(`1 × 가구 1(${SOFA_MODEL}): 시간 만료 → tired_sofa 종료`)
    })

    it('dispose하면 피드 구독이 끊긴다', () => {
        const s = setup()
        s.engine.dispose()
        expect(s.unsubscribed()).toBe(true)
    })
})
