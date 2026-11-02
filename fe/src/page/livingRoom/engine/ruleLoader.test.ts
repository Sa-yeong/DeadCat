import { describe, it, expect } from 'vitest'
import { loadRules, checkCoverage } from './ruleLoader'
import characterRules from './data/characterRules.json'
import furnitureRules from './data/furnitureRules.json'
import motions from './data/motions.json'
import furniture from './data/furniture.json'
import events from './data/events.json'
import poses from './data/poses.json'
import { EMOTIONS, type RawData } from './type/type'

const realData = () => structuredClone({characterRules, furnitureRules, motions, furniture, events, poses}) as unknown as RawData

describe('실제 데이터', () => {
    it('에러 없이 로드됨', () => {
        expect(() => loadRules(realData())).not.toThrow()
    })
    it('빠진 조합이 없음', () => {
        expect(checkCoverage(loadRules(realData()))).toEqual([])
    })
    it('인덱스 키가 기대대로 만들어짐', () => {
        const rules = loadRules(realData());
        expect(rules.characterIndex.get('happy|depress')?.[0].id).toBe('basic_meet_depress')
        expect(rules.furnitureIndex.get('panic|sofa')?.[0].id).toBe('panic_sofa')
    })
    // 특수 모션 가구 5종 임시 항목 (지시서 4-b). sleepy는 self가 될 수 없어 빠진다(아래 「잘못된 데이터」 규칙)
    it.each([
        ['desk_reading', 'reading', 'read_book'],
        ['speaker', 'speaker', 'listen_music'],
        ['desk_computer', 'computer', 'use_computer'],
        ['piano', 'piano', 'play_piano'],
        ['slot_machine', 'slot', 'play_slot'],
    ])('%s: 감정마다 %s 규칙 → %s, 반복 clip', (model, category, motion) => {
        const rules = loadRules(realData())
        expect(rules.furniture.get(model)?.category).toBe(category)
        expect(rules.motions.get(motion)).toEqual({ kind: 'clip', clip: null, loop: true })
        for (const emotion of EMOTIONS) {
            const found = rules.furnitureIndex.get(`${emotion}|${category}`)
            if (emotion === 'sleepy') {
                expect(found).toBeUndefined()
                continue
            }
            expect(found).toHaveLength(1)
            expect(found?.[0]).toMatchObject({ priority: 80, occupy: true, cooldownMs: 20000, interruptible: true, effect: [{ self: [motion] }] })
        }
    })
})

describe('잘못된 데이터', () => {
  it('알 수 없는 감정 이름', () => {
    const d = realData()
    d.characterRules[0].when.other = ['depres']
    expect(() => loadRules(d)).toThrow(/알 수 없는 감정 "depres"/)
  })

  it('존재하지 않는 모션', () => {
    const d = realData()
    d.characterRules[0].effect[0].self = 'no_such_motion'
    expect(() => loadRules(d)).toThrow(/존재하지 않는 모션/)
  })

  it('sleepy가 self', () => {
    const d = realData()
    d.characterRules[0].when.self = ['sleepy']
    expect(() => loadRules(d)).toThrow(/sleepy는 self가 될 수 없음/)
  })

  it('id 중복', () => {
    const d = realData()
    d.characterRules[1].id = d.characterRules[0].id
    expect(() => loadRules(d)).toThrow(/id 중복/)
  })

  it('priority 동률 충돌', () => {
    const d = realData()
    d.characterRules[1].when = d.characterRules[0].when
    d.characterRules[1].priority = d.characterRules[0].priority
    expect(() => loadRules(d)).toThrow(/priority 동률/)
  })

  it('기본 자세: 감정에 묶음이 없음', () => {
    const d = realData()
    delete (d.poses.emotions as Record<string, string>).panic
    expect(() => loadRules(d)).toThrow(/\[pose: panic\] 묶음이 없음/)
  })

  it('기본 자세: clip이 아닌 모션', () => {
    const d = realData()
    d.poses.groups.basic.walk = 'avoid'
    expect(() => loadRules(d)).toThrow(/walk: clip 모션이 아님 "avoid"/)
  })

  it('오류가 여러 개여도 한 번에 모아서 보고한다', () => {
    const d = realData()
    d.characterRules[0].when.other = ['depres']
    d.characterRules[1].priority = -1
    expect(() => loadRules(d)).toThrow(/depres[\s\S]*priority/)
  })
})