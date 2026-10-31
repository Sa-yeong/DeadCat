import type { RuleSet } from "./ruleLoader"
import type { CharacterRule, Emotion } from "./type/type"
import { matchCharacter, matchFurniture, type Decision_C, type Decision_F, type MatchContext } from "./matcher"
import { InteractionState, type Clock } from "./state"

// BE가 내려주는 가구 배치 중 컨트롤러에 필요한 부분 (위치는 update()의 Obstacle로 따로 들어온다)
export type PlacedFurniture = { id: number; model: string }

export type ControllerOptions = {
    rules: RuleSet
    dispatcher: Dispatcher
    now?: Clock
    groupDurationMs?: number
    random?: () => number
    log?: (line: string) => void
}

type Verdict = 
    | { kind: 'start' }
    | { kind: 'interrupt' }
    | { kind: 'ignore' }

// 진행 중인 상호작용 하나 (캐릭터끼리 또는 캐릭터-가구). 모든 참가자가 빠지면 쿨다운을 시작한다.
type Interaction = {
    ruleId: string
    cooldownMs: number     
    pair: [string, string] // 쿨다운 키 (매처가 isOnCooldown에 넘기는 값과 같아야 함)
    remaining: Set<string>      // 아직 진행 중인 참가자
    furnitureId: number | null // 가구 제거 시 가구를 쓰던 상호작용 찾는 용도
    group:{
        focusId: string | null // 중심인 캐릭터가 없는 경우 -> null
        endAt: number // 지속 시간 만료 시각
    } | null // grouping을 사용하지 않는 경우 -> null
}

// Perception → 매처 → 상태 → 디스패처를 잇는 흐름. 거실 하나당 하나, 나갈 때 버린다.
// TODO: 장내 이벤트 처리 구현하기
export class LivingRoomController {
    readonly state: InteractionState
    private readonly rules: RuleSet
    private readonly dispatcher: Dispatcher
    private readonly ctx: MatchContext
    private readonly now: Clock
    private readonly groupDurationMs: number
    private readonly log: (line: string) => void

    private emotions = new Map<string, Emotion>()
    private models = new Map<number, string>() // db furniture id , json 데이터에 있는 가구 이름
    private interactions = new Map<number, Interaction>()
    private byChar = new Map<string, number>()     // 캐릭터 id → 참여 중인 상호작용 id
    private nextId = 1

    constructor(opts: ControllerOptions) {
        this.rules = opts.rules
        this.dispatcher = opts.dispatcher
        this.now = opts.now ?? (() => performance.now())
        this.state = new InteractionState(this.now)
        this.ctx = this.state.createMatchContext(opts.rules, opts.random)
        this.groupDurationMs = opts.groupDurationMs ?? 15000
        this.log = opts.log ?? (() => undefined)
    }

    // ---------- 캐릭터 ----------
    addCharacter(id: string, emotion: Emotion): void {
        this.state.addCharacter(id)
        this.emotions.set(id, emotion)
    }

    removeCharacter(id: string): void {
        this.interrupt(id)
        this.state.removeCharacter(id)
        this.emotions.delete(id)
    }

    getEmotion(id: string): Emotion | undefined {
        return this.emotions.get(id)
    }

    // 감정이 바뀌면 그 감정으로 매칭된 진행 중 상호작용은 끊는다 (일어나서 배회로 복귀)
    setEmotion(id: string, emotion: Emotion): void {
        const prev = this.emotions.get(id)
        if (prev === undefined) return
        if (prev === emotion) return
        this.interrupt(id) // 그룹 해제 하기
        this.emotions.set(id, emotion)
        this.log(`${id} 감정 → ${emotion}`)
    }

    // ---------- 가구 ----------
    addFurniture(id: number, model: string): void {
        const def = this.rules.furniture.get(model)
        if (!def) return
        this.state.registerFurniture(id, def.anchors.map(a => a.id))
        this.models.set(id, model) // 이게 왜 있는지 모르겠음.
    }

    removeFurniture(id: number): void {
        for (const it of [...this.interactions.values()]) {
            if (it.furnitureId !== id) continue
            for (const charId of [...it.remaining]) this.interrupt(charId)
        }
        this.state.removeFurniture(id)
        this.models.delete(id)
    }

    // ---------- enter 처리 ----------
    encounter(a: string, b: string): void {
        const ea = this.emotions.get(a)
        const eb = this.emotions.get(b)
        if (ea === undefined || eb === undefined) return

        for(const id of [a, b]){
            if(this.state.canInteract(id)) continue
            if(this.byChar.get(id) === undefined) return;
        }

        if(this.joinGroup(a, b)) return;

        const d = matchCharacter({ id: a, emotion: ea }, { id: b, emotion: eb }, this.ctx)

        if (d) { this.startCharChar(d) }
    }

    private joinGroup(a: string, b: string):boolean{
        const ia = this.byChar.get(a);
        const ib = this.byChar.get(b);

        if((ia === undefined) === (ib === undefined)) return false

        const member = ia !== undefined ? a : b
        const newbee = member === a? b : a
        const interactionId = this.byChar.get(member)!;
        const it = this.interactions.get(interactionId);

        if(!it?.group) return false;
        if(!this.state.canInteract(newbee)) return false;

        const target = it.group.focusId ?? member;
        const targetEmo = this.emotions.get(target);
        const newbeeEmo = this.emotions.get(newbee);

        if(!it.remaining.has(target) || !targetEmo || !newbeeEmo) return false

        const newD = matchCharacter({id: newbee, emotion: newbeeEmo}, {id: target, emotion: targetEmo}, this.ctx);
        if(!newD || !newD.rule.group) return false // 좀 더 고민 해보자

        const motions = newbee === newD.self ? newD.effect.self : newD.effect.other
        if(motions.length === 0) return false;

        it.remaining.add(newbee);
        this.byChar.set(newbee, interactionId)
        this.state.setState(newbee, {kind: 'interactingGroup', groupId: interactionId})
        this.dispatcher.play({characterId: newbee, motions},
                () => this.finished(newbee, interactionId))
        return true
    }

    visitFurniture(charId: string, furnitureId: number): void {
        const emotion = this.emotions.get(charId)
        const model = this.models.get(furnitureId)
        if (emotion === undefined || model === undefined) return
        const furniture = this.rules.furniture.get(model)
        if(!furniture) return

        if (!this.state.canInteract(charId)) return
        if (!this.state.hasFreeAnchor(furnitureId)) {
            this.log(`skip ${charId} × ${furnitureId}: 자리가 없음`)    // 가구가 없는 것처럼 취급
            return
        }
        const d = matchFurniture({ id: charId, emotion }, model, furniture?.category, this.ctx)
        if (d) this.startFurniture(d, furnitureId)
    }

    // ---------- 상호작용 시작 ----------
    private judge(rule: CharacterRule, self: string, other: string): Verdict {
        const ids = new Set<number>()
        for (const c of [self, other]) {
            const id = this.byChar.get(c)
            if (id !== undefined) ids.add(id)
        }
        if (ids.size === 0) return { kind: 'start' }

        // 같은 상호작용 안의 두 캐릭터가 서로 가까워짐 (그룹 멤버끼리)
        if (ids.size === 1 && this.byChar.has(self) && this.byChar.has(other)) return { kind: 'ignore' }

        // 끼어들기: 관련된 모든 상호작용을 이길 때만
        for (const id of ids) {
            const it = this.interactions.get(id)
            const cur = it && this.rules.rulesById.get(it.ruleId)
            if (!cur || !cur.interruptible || rule.priority <= cur.priority) return { kind: 'ignore' }
        }
        return { kind: 'interrupt' }
    } 

    private startCharChar(d: Decision_C): void {
        const { rule, self, other, effect } = d
        const parts: [string, string[]][] = []
        if (effect.self.length > 0) parts.push([self, effect.self])
        if (effect.other.length > 0) parts.push([other, effect.other])
        if (parts.length === 0) return

        const verdict = this.judge(rule, self, other);

        if(verdict.kind === 'ignore') return
        if(verdict.kind === 'interrupt'){
            this.interruptWhole(self);
            this.interruptWhole(other);
        }

        // start 로직 구현 && interrupt 로직 동일할거라 예측
        // console.log(`[${rule.id}] ${self} → ${other}: ${effect.self.join('>')} / ${effect.other.join('>')}${note}`)

        // grouping 만들기 && 캐릭터의 state -> InteractGroup으로 하기
        const group = rule.group ? {
            focusId: rule.group.focus === "self" ? self : rule.group.focus === "other" ? other : null,
            endAt: this.now() + this.groupDurationMs,
        } : null
 
        const interactionId = this.begin(rule.id, rule.cooldownMs, self, other, parts.map(p => p[0]), null, group);

        const applyEmotion = () => {
            if (d.otherEmotionTo === null) return
            this.emotions.set(other, d.otherEmotionTo)
            this.log(`${other} 감정 → ${d.otherEmotionTo}`)
        }        

        for (const [charId, motions] of parts) {
            this.state.setState(charId, group 
                ? {kind: 'interactingGroup', 'groupId': interactionId} 
                : {kind: 'reacting', ruleId: rule.id}
            )
            this.dispatcher.play(
                { characterId: charId, motions },
                () => this.finished(charId, interactionId, charId === other ? applyEmotion : undefined),
            )
        }
        if (effect.other.length === 0) applyEmotion()    // 모션이 없으면 감정만 바로 바꾼다
    }

    private startFurniture(d: Decision_F, placementId: number): void {
        const { rule, self: charId, effect } = d
        if (effect.self.length === 0) return

        if (rule.occupy) {
            if (!this.state.occupy(placementId, charId, rule.id)) return
        }else{
            this.state.setState(charId, {kind: 'reacting', ruleId: rule.id})
        }
    
        this.log(`[${rule.id}] ${charId} × ${placementId}: ${effect.self.join(' → ')}${rule.occupy ? ' (점유)' : ''}`)
        
        const category = this.models.get(placementId);
        if(!category) return;
        const interactionId = this.begin(rule.id, rule.cooldownMs, charId, category, [charId], placementId, null)
        this.dispatcher.play(
            { characterId: charId, motions: effect.self },
            () => this.finished(charId, interactionId),
        )
    }

    // ---------- 상호작용 생명주기 ----------
    private begin(
        ruleId: string, cooldownMs: number, keyA: string, keyB: string,
        participants: string[], furnitureId: number | null, group: {focusId: string | null; endAt: number} | null
    ): number {
        const id = this.nextId++
        this.interactions.set(id, { ruleId, cooldownMs, pair: [keyA, keyB], remaining: new Set(participants), furnitureId, group })
        for (const p of participants) this.byChar.set(p, id)
        return id
    }

    // 참가자 한 명이 정상 종료 또는 중단으로 빠진다. 마지막 참가자가 빠지면 쿨다운 시작.
    private leave(charId: string): void {
        const id = this.byChar.get(charId)
        if (id === undefined) return
        this.byChar.delete(charId)

        const it = this.interactions.get(id)
        if (!it) return
        it.remaining.delete(charId)
        if (it.remaining.size === 0) {
            this.interactions.delete(id)
            this.state.startCooldown(it.ruleId, it.pair[0], it.pair[1], it.cooldownMs)
        }
    }

    // 디스패처의 onFinish. 이미 중단된 상호작용의 늦은 콜백은 무시한다.
    // 모션이 끝났을때 해체 -> 정상적으로 빠짐
    private finished(charId: string, interactionId: number, after?: () => void): void {
        if (this.byChar.get(charId) !== interactionId) return
        this.leave(charId)
        this.state.resetState(charId)
        after?.()
    }

    // 정상 종료가 아닌 경로(드래그, 감정 변경, 제거)에서 호출. 쿨다운은 정상 종료와 같게 건다.
    private removeMember(charId: string): void {
        if (!this.byChar.has(charId)) return
        this.dispatcher.cancel(charId)
        this.leave(charId)
        this.state.resetState(charId)
    }

    interrupt(charId: string): void {
        const id = this.byChar.get(charId)
        if(id === undefined) return
        const it = this.interactions.get(id)
        this.removeMember(charId);
        if(it?.group && (it.group.focusId === charId || it.remaining.size < 2)){
            for(const c of [...it.remaining])
                this.removeMember(c)
        }
    }
    // 같은 상호작용의 참가자를 모두 끝낸다
    private interruptWhole(charId: string): void {          
        const id = this.byChar.get(charId)
        if (id === undefined) return
        const it = this.interactions.get(id)
        if (!it) return
        for (const c of [...it.remaining]) this.removeMember(c)
    }

    // 근데 이것도 endAt없애면 필요없는거 아닌가?
    tick(): void {
    this.state.prune()
    const t = this.now()
    for (const it of [...this.interactions.values()]) {
        if (it.group && t >= it.group.endAt) for (const c of [...it.remaining]) this.removeMember(c)
    }
}
}

// dispatcher 간소화 (test용)
export type PlayRequest = {
    characterId: string
    motions: string[]
}

export type Dispatcher = {
    play(req: PlayRequest, onFinish: () => void): void;
    cancel(characterId: string): void;
}