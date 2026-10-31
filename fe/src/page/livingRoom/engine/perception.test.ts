import { describe, it, expect } from 'vitest'
import { Perception, type Body, type Obstacle, type ProximityEvent } from './perception'

// 반지름 0이면 표면 간 거리 = 중심 간 거리라서 숫자를 읽기 쉽다
const body = (id: string, x: number, z = 0, radius = 0): Body => ({ id, x, z, radius })
const cfg = { charEnter: 1, charExit: 2, furnitureExitGap: 1 }
const make = () => new Perception(cfg)
const types = (evs: ProximityEvent[]) => evs.map(e => e.type)

describe('캐릭터 ↔ 캐릭터', () => {
    it('멀리 있으면 이벤트가 없다', () => {
        const p = make()
        expect(p.update([body('c1', 0), body('c2', 5)], [])).toEqual([])
    })

    it('가까워지면 enter가 한 번만 나오고, 붙어 있는 동안 반복되지 않는다', () => {
        const p = make()
        p.update([body('c1', 0), body('c2', 5)], [])
        expect(p.update([body('c1', 0), body('c2', 0.5)], [])).toEqual([
            { type: 'enter', kind: 'char-char', a: 'c2', b: 'c1' },
        ])
        expect(p.update([body('c1', 0), body('c2', 0.5)], [])).toEqual([])
        expect(p.update([body('c1', 0), body('c2', 0.6)], [])).toEqual([])
    })

    it('히스테리시스: enter와 exit 사이로 벌어져도 exit가 없고, exit 후에는 enter 거리까지 와야 다시 enter', () => {
        const p = make()
        p.update([body('c1', 0), body('c2', 5)], [])
        expect(types(p.update([body('c1', 0), body('c2', 0.9)], []))).toEqual(['enter'])
        expect(p.update([body('c1', 0), body('c2', 1.5)], [])).toEqual([])      // 1 ~ 2 사이: 유지
        expect(types(p.update([body('c1', 0), body('c2', 2.5)], []))).toEqual(['exit'])
        expect(p.update([body('c1', 0), body('c2', 1.5)], [])).toEqual([])      // 아직 enter 거리 밖
        expect(types(p.update([body('c1', 0), body('c2', 0.5)], []))).toEqual(['enter'])
    })

    it('경계에서 떨려도 enter는 한 번이고 exit는 없다', () => {
        const p = make()
        const all: ProximityEvent[] = []
        for (const x of [1.1, 0.9, 1.1, 0.9, 1.1, 0.95, 1.05]) {
            all.push(...p.update([body('c1', 0), body('c2', x)], []))
        }
        expect(types(all)).toEqual(['enter'])
    })

    it('반지름을 반영한다 (표면 간 거리 기준)', () => {
        const p = make()
        // 중심 간 2.5, 반지름 0.5 + 0.5 → 표면 간 1.5 : enter 아님
        expect(p.update([body('c1', 0, 0, 0.5), body('c2', 2.5, 0, 0.5)], [])).toEqual([])
        // 중심 간 1.5 → 표면 간 0.5 : enter
        expect(types(p.update([body('c1', 0, 0, 0.5), body('c2', 1.5, 0, 0.5)], []))).toEqual(['enter'])
    })

    it('더 많이 움직인 쪽이 a (먼저 다가온 쪽)', () => {
        const p = make()
        p.update([body('c1', 0), body('c2', 3)], [])
        const [e1] = p.update([body('c1', 0), body('c2', 0.5)], [])      // c2만 움직임
        expect(e1).toMatchObject({ a: 'c2', b: 'c1' })

        const p2 = make()
        p2.update([body('c1', 0), body('c2', 3)], [])
        const [e2] = p2.update([body('c1', 2.5), body('c2', 3)], [])     // c1만 움직임
        expect(e2).toMatchObject({ a: 'c1', b: 'c2' })
    })

    it('같은 만큼 움직였으면 id 순서 (입력 순서와 무관)', () => {
        const p = make()
        p.update([body('z', -3), body('a', 3)], [])
        const [e] = p.update([body('z', -0.25), body('a', 0.25)], [])
        expect(e).toMatchObject({ a: 'a', b: 'z' })
    })

    it('세 마리가 한꺼번에 모이면 쌍마다 enter가 하나씩 나온다', () => {
        const p = make()
        p.update([body('c1', 0), body('c2', 10), body('c3', 20)], [])
        const evs = p.update([body('c1', 0), body('c2', 0.3), body('c3', 0.6)], [])
        expect(evs).toHaveLength(3)
        expect(evs.every(e => e.type === 'enter' && e.kind === 'char-char')).toBe(true)
    })

    it('사라진 캐릭터가 들어 있던 쌍은 exit로 정리된다', () => {
        const p = make()
        p.update([body('c1', 0), body('c2', 0.5)], [])
        const evs = p.update([body('c1', 0)], [])
        expect(evs).toEqual([{ type: 'exit', kind: 'char-char', a: 'c1', b: 'c2' }])
    })

    it('한 번의 업데이트에서 exit가 enter보다 앞에 온다', () => {
        const p = make()
        p.update([body('c1', 0), body('c2', 0.5), body('c3', 10)], [])    // c1-c2 근접
        const evs = p.update([body('c1', 0), body('c2', 5), body('c3', 0.5)], [])
        expect(types(evs)).toEqual(['exit', 'enter'])
    })
})

describe('캐릭터 ↔ 가구', () => {
    // x 2~4, z -1~1 박스. 표면에서 1 안이면 enter, 2 초과면 exit
    const desk: Obstacle = { id: 'desk_1', minX: 2, maxX: 4, minZ: -1, maxZ: 1, interactionRadius: 1 }
    const enter = { type: 'enter', kind: 'char-furniture', char: 'c1', furniture: 'desk_1' }

    it('박스 표면 기준으로 enter/exit (히스테리시스 포함)', () => {
        const p = make()
        expect(p.update([body('c1', 0)], [desk])).toEqual([])               // 표면까지 2
        expect(p.update([body('c1', 1.5)], [desk])).toEqual([enter])        // 표면까지 0.5
        expect(p.update([body('c1', 0)], [desk])).toEqual([])               // 표면까지 2: 아직 유지
        expect(types(p.update([body('c1', -0.5)], [desk]))).toEqual(['exit']) // 2.5 > 2
    })

    it('박스 안에 있어도 enter다', () => {
        const p = make()
        expect(p.update([body('c1', 3)], [desk])).toEqual([enter])
    })

    it('모서리는 대각선 거리로 계산한다', () => {
        const p = make()
        // 가장 가까운 점 (2, 1) 까지 대각선 거리 = hypot(1.5, 1.5) ≈ 2.12 → enter 아님
        expect(p.update([body('c1', 0.5, 2.5)], [desk])).toEqual([])
        // hypot(0.7, 0.7) ≈ 0.99 → enter
        expect(types(p.update([body('c1', 1.3, 1.7)], [desk]))).toEqual(['enter'])
    })

    it('가구가 사라지면 exit로 정리된다', () => {
        const p = make()
        p.update([body('c1', 3)], [desk])
        expect(p.update([body('c1', 3)], [])).toEqual([
            { type: 'exit', kind: 'char-furniture', char: 'c1', furniture: 'desk_1' },
        ])
    })

    it('반지름이 있으면 그만큼 일찍 enter', () => {
        const p = make()
        // 표면까지 2.0, 반지름 1.5 → gap 0.5 < 1
        expect(types(p.update([body('c1', 0, 0, 1.5)], [desk]))).toEqual(['enter'])
    })
})

describe('설정과 초기화', () => {
    it('charExit가 charEnter보다 크지 않으면 에러', () => {
        expect(() => new Perception({ charEnter: 1, charExit: 1 })).toThrow(/charExit/)
        expect(() => new Perception({ charEnter: 2, charExit: 1 })).toThrow(/charExit/)
    })

    it('furnitureExitGap이 0 이하이면 에러', () => {
        expect(() => new Perception({ furnitureExitGap: 0 })).toThrow(/furnitureExitGap/)
    })

    it('reset 후에는 이전 근접 기록이 사라진다', () => {
        const p = make()
        p.update([body('c1', 0), body('c2', 0.5)], [])
        p.reset()
        expect(types(p.update([body('c1', 0), body('c2', 0.5)], []))).toEqual(['enter'])
    })
})