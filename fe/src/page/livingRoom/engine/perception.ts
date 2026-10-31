export type Body = { id: string; x: number; z: number; radius: number }

// 가구는 XZ 평면의 박스. interactionRadius는 박스 표면에서 이 거리 안으로 들어오면 enter.
export type Obstacle = {
    id: string
    minX: number; maxX: number
    minZ: number; maxZ: number
    interactionRadius: number
}

export type ProximityEvent =
    | { type: 'enter' | 'exit'; kind: 'char-char'; a: string; b: string }
    | { type: 'enter' | 'exit'; kind: 'char-furniture'; char: string; furniture: string }

export type PerceptionConfig = {
    charEnter: number
    charExit: number
    furnitureExitGap: number 
}

export const DEFAULT_PERCEPTION_CONFIG: PerceptionConfig = { // 캐릭터 크기와 거실 크기가 정해진 후 다시 조정
    charEnter: 0.4,
    charExit: 1.0,
    furnitureExitGap: 0.4,
}

type Pair =
    | { kind: 'char-char'; a: string; b: string }               // a, b는 id 정렬 순서로 저장
    | { kind: 'char-furniture'; char: string; furniture: string }

const toEvent = (type: 'enter' | 'exit', pair: Pair): ProximityEvent => ({ type, ...pair })
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const EPS = 1e-9

export class Perception {
    private readonly config: PerceptionConfig
    private near = new Map<string, Pair>()
    private lastPos = new Map<string, { x: number; z: number }>()

    constructor(config: Partial<PerceptionConfig> = {}) {
        const c = { ...DEFAULT_PERCEPTION_CONFIG, ...config }
        if (!(c.charEnter >= 0)) throw new Error('charEnter는 0 이상이어야 합니다')
        if (!(c.charExit > c.charEnter)) throw new Error('charExit는 charEnter보다 커야 합니다 (히스테리시스)')
        if (!(c.furnitureExitGap > 0)) throw new Error('furnitureExitGap은 0보다 커야 합니다')
        this.config = c
    }

    update(bodies: Body[], obstacles: Obstacle[]): ProximityEvent[] {
        // exits, enters는 왜 필요한건가?
        // bodyById나 obstacleById는 id로 검색하기 쉽게하기 위함이 아닐까?
        const c = this.config
        const exits: ProximityEvent[] = []
        const enters: ProximityEvent[] = []
        const bodyById = new Map(bodies.map(b => [b.id, b] as const))
        const obstacleById = new Map(obstacles.map(o => [o.id, o] as const))

        // 1. 사라진 캐릭터/가구가 들어 있는 쌍은 exit로 정리
        for (const [key, pair] of this.near) {
            const alive = pair.kind === 'char-char'
                ? bodyById.has(pair.a) && bodyById.has(pair.b)
                : bodyById.has(pair.char) && obstacleById.has(pair.furniture)
            if (!alive) {
                this.near.delete(key)
                exits.push(toEvent('exit', pair))
            }
        }

        // 2. 캐릭터 ↔ 캐릭터
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const p = bodies[i], q = bodies[j]
                const gap = Math.hypot(p.x - q.x, p.z - q.z) - p.radius - q.radius
                const [lo, hi] = p.id < q.id ? [p.id, q.id] : [q.id, p.id]
                const key = `cc|${lo}|${hi}`
                const isNear = this.near.has(key)

                if (!isNear && gap < c.charEnter) {
                    const pair: Pair = { kind: 'char-char', a: lo, b: hi }
                    this.near.set(key, pair)
                    const [a, b] = this.approacherFirst(p, q)
                    enters.push({ type: 'enter', kind: 'char-char', a, b })
                } else if (isNear && gap > c.charExit) {
                    const pair = this.near.get(key)!
                    this.near.delete(key)
                    exits.push(toEvent('exit', pair))
                }
            }
        }

        // 3. 캐릭터 ↔ 가구 (박스에서 가장 가까운 점 기준)
        for (const body of bodies) {
            for (const ob of obstacles) {
                const cx = clamp(body.x, ob.minX, ob.maxX)
                const cz = clamp(body.z, ob.minZ, ob.maxZ)
                const gap = Math.hypot(body.x - cx, body.z - cz) - body.radius
                const key = `cf|${body.id}|${ob.id}`
                const isNear = this.near.has(key)

                if (!isNear && gap < ob.interactionRadius) {
                    const pair: Pair = { kind: 'char-furniture', char: body.id, furniture: ob.id }
                    this.near.set(key, pair)
                    enters.push(toEvent('enter', pair))
                } else if (isNear && gap > ob.interactionRadius + c.furnitureExitGap) {
                    const pair = this.near.get(key)!
                    this.near.delete(key)
                    exits.push(toEvent('exit', pair))
                }
            }
        }

        // 4. 위치 기록 갱신 (사라진 캐릭터의 기록은 함께 정리됨)
        this.lastPos = new Map(bodies.map(b => [b.id, { x: b.x, z: b.z }] as const))

        return [...exits, ...enters]
    }

    // 거실을 떠날 때 기억을 비운다
    reset(): void {
        this.near.clear()
        this.lastPos.clear()
    }

    // 이번 업데이트에서 더 많이 움직인 쪽(= 먼저 다가온 쪽)이 앞. 같으면 id 순.
    private approacherFirst(p: Body, q: Body): [string, string] {
        const mp = this.moved(p), mq = this.moved(q)
        if (Math.abs(mp - mq) < EPS) return p.id < q.id ? [p.id, q.id] : [q.id, p.id]
        return mp > mq ? [p.id, q.id] : [q.id, p.id]
    }

    private moved(b: Body): number {
        const last = this.lastPos.get(b.id)
        return last ? Math.hypot(b.x - last.x, b.z - last.z) : 0
    }
}