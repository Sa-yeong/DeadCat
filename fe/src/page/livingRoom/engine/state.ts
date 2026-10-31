// 그룹, 끼어들기, startCooldown 호출 추가하기
import type { CharState } from "./type/type"
import type { RuleSet } from "./ruleLoader"
import type { MatchContext } from "./matcher"

// 캐릭터 상태, 쿨다운 기록, 가구 점유, 그룹
export type Clock = () => number
// export type RuleLookup = (ruleId: string) => {interruptibe: boolean; priority: number} | undefined

// 쌍은 순서가 없다: (c1, c2)와 (c2, c1)은 같은 쿨다운
const pairKey = (ruleId: string, a: string, b: string) =>
    a < b ? `${ruleId}|${a}|${b}` : `${ruleId}|${b}|${a}`

// 거실 하나(= 컨트롤러 하나)당 인스턴스 하나. 거실을 나가면 통째로 버린다.
export class InteractionState {
    private cooldownUntil = new Map<string, number>()   // 키: 규칙+쌍 → 쿨다운이 풀리는 시각(ms)
    private states = new Map<string, CharState>()
    private furnitureAnchors = new Map<number, string[]>() // 앵커 id 목록
    private readonly now: Clock

    // 시계를 주입받아서 테스트에서 시간을 조작할 수 있게 한다.
    constructor(now: Clock = () => performance.now()) {
        this.now = now
    }

    addCharacter(id: string): void {
        this.states.set(id, { kind: 'wandering' })
    }

    removeCharacter(id: string): void {
        this.states.delete(id)
        // 이 캐릭터가 들어간 쿨다운 기록도 삭제 (Map 순회 중 delete는 안전)
        for (const key of this.cooldownUntil.keys()) {
            if (key.split('|').slice(1).includes(id)) this.cooldownUntil.delete(key)
        }
    }

    getState(id: string): CharState | undefined {
        return this.states.get(id)
    }

    setState(id: string, state: CharState): void {
        if (!this.states.has(id)) throw new Error(`등록되지 않은 캐릭터: ${id}`)
        this.states.set(id, state)
    }

    resetState(id: string): void {
        this.setState(id, { kind: 'wandering' })
    }

    registerFurniture(id: number, anchorIds: string[]): void{
        this.furnitureAnchors.set(id, anchorIds);
    }

    removeFurniture(id: number): void{
        this.furnitureAnchors.delete(id);

        for(const [charId, state] of this.states){
            if(state.kind === 'interactingFurniture' && state.furnitureId === id){
                this.resetState(charId);
            }
        }

    }

    hasFreeAnchor(id: number): boolean{
        const anchors = this.furnitureAnchors.get(id);

        if(!anchors) return false;
        const used = this.anchorOccupants(id);
        return anchors.some(a => !used.has(a));
    }

    occupy(furnitureId: number, charId: string, ruleId: string): string | null{
        const anchors = this.furnitureAnchors.get(furnitureId);

        if(!anchors) return null
        const used = this.anchorOccupants(furnitureId);
        const free = anchors.find(a => !used.has(a));

        if(!free) return null
        this.setState(charId, {kind: 'interactingFurniture', furnitureId, anchorId: free, ruleId})
        return free;
    }

    // 새 상호작용을 시작할 수 있는 상태인가
    // TODO: 끼어들기(interruptible + priority 비교)는 디스패처, 점유 기능 이후에 추가
    canInteract(id: string): boolean {
        return this.states.get(id)?.kind === "wandering"
    }

    inGroup(id: string): boolean {
        return this.states.get(id)?.kind === "interactingGroup"
    }

    // ---------- 쿨다운 ----------
    isOnCooldown(ruleId: string, a: string, b: string): boolean {
        const until = this.cooldownUntil.get(pairKey(ruleId, a, b))
        return until !== undefined && this.now() < until
    }

    // 쿨다운이 풀리기까지 남은 시간(ms). 쿨다운이 아니면 0 (로그용)
    cooldownRemaining(ruleId: string, a: string, b: string): number {
        const until = this.cooldownUntil.get(pairKey(ruleId, a, b))
        return until === undefined ? 0 : Math.max(0, until - this.now())
    }

    // 모션이 끝난 시점에 디스패처가 호출한다 (매처는 호출하지 않는다)
    startCooldown(ruleId: string, a: string, b: string, cooldownMs: number): void {
        if (cooldownMs <= 0) return
        this.cooldownUntil.set(pairKey(ruleId, a, b), this.now() + cooldownMs)
    }

    // 만료된 기록 정리 (주기적으로 호출, 예: 10초마다)
    prune(): void {
        const t = this.now()
        for (const [key, until] of this.cooldownUntil) {
            if (until <= t) this.cooldownUntil.delete(key)
        }
    }

    // ---------- 매처 연결 ----------
    createMatchContext(rules: RuleSet, random: () => number = Math.random): MatchContext {
        return {
            rules,
            isOnCooldown: (ruleId, a, b) => this.isOnCooldown(ruleId, a, b),
            random,
        }
    }

    private anchorOccupants(furnitureId: number): Map<string, string>{
        const result = new Map<string, string>();

        for(const [charId, s] of this.states){
            if(s.kind === "interactingFurniture" && s.furnitureId === furnitureId){
                result.set(s.anchorId, charId);
            }
        }
        return result;
    }
}