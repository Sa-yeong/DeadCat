import { describe, it, expect } from 'vitest'
import { loadRules, checkCoverage } from './ruleLoader'
import characterRules from './data/characterRules.json'
import furnitureRules from './data/furnitureRules.json'
import motions from './data/motions.json'
import furniture from './data/furniture.json'
import events from './data/events.json'
import type { RawData } from './type/type'

const realData = () => structuredClone({characterRules, furnitureRules, motions, furniture, events}) as unknown as RawData

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

  it('오류가 여러 개여도 한 번에 모아서 보고한다', () => {
    const d = realData()
    d.characterRules[0].when.other = ['depres']
    d.characterRules[1].priority = -1
    expect(() => loadRules(d)).toThrow(/depres[\s\S]*priority/)
  })
})