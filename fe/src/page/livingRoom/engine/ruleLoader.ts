import type { CharacterRule, FurnitureRule, MotionDef, FurnitureDef, EventDef, MarketEventType, Effect, FurEffect, RawData, PoseDef } from "./type/type"
import { EMOTIONS, MARKET_EVENTS, type Emotion } from "./type/type"
// 인덱스: 함수가 반환하는 하나의 불변 객체
export type RuleSet = {
    characterIndex: Map<string, CharacterRule[]>
    furnitureIndex: Map<string, FurnitureRule[]>
    rulesById: Map<string, CharacterRule | FurnitureRule>
    motions: Map<string, MotionDef>
    furniture: Map<string, FurnitureDef>
    events: Record<MarketEventType, EventDef>
    poses: Record<Emotion, PoseDef>
}

const EMOTION_SET: ReadonlySet<string> = new Set(EMOTIONS)

export function loadRules(raw: RawData): RuleSet {
    const PRIORITY_MAX = 100;
    const WEIGHT_MAX = 10;

    const ids = new Set<string>();
    const raw_motions = new Map(Object.entries(raw.motions))
    const raw_furniture = new Map(Object.entries(raw.furniture))
    const categories: ReadonlySet<string> = new Set([...raw_furniture.values()].map(f => f.category));
    const error: string[] = [];

    // 캐릭터 규칙 검증
    const normalizedCharRules: CharacterRule[] = [];
    for (const rule of raw.characterRules){
        // id
        if(ids.has(rule.id)) error.push(`[${rule.id}] id 중복`)
        else ids.add(rule.id);

        // when
        const self = checkEmotions(rule.when.self, `[${rule.id}] when.self`, error);
        const other = checkEmotions(rule.when.other, `[${rule.id}] when.other`, error);
        
        if(self.includes("sleepy")){
            error.push(`[${rule.id}] sleepy는 self가 될 수 없음`)
        }

        //effect
        const normalizedEffects: Effect[] = [];

        if(rule.effect.length === 0) error.push(`[${rule.id}] effect: 빈배열`)
        else{
            for(const eff of rule.effect){
                const effSelf = checkMotions(eff.self, `[${rule.id}] effect.self`, raw_motions, error);
                const effOther = checkMotions(eff.other, `[${rule.id}] effect.other`, raw_motions, error);
                const otherEmotionTo = checkEmotions(eff.otherEmotionTo, `[${rule.id}] effect.otherEmotionTo`, error);
                
                const w = eff.weight?? 1;
                if (typeof w !== 'number' || !(w > 0 && w <= WEIGHT_MAX)) {
                    error.push(`[${rule.id}] effect.weight: 0 초과 ${WEIGHT_MAX} 이하의 숫자여야 함 (현재 ${w})`);
                }

                normalizedEffects.push({weight: w, self: effSelf, other: effOther, otherEmotionTo: otherEmotionTo});
            }
        }
        
        // 그외
        if (typeof rule.priority !== 'number' || !(rule.priority > 0 && rule.priority <= PRIORITY_MAX)) {
            error.push(`[${rule.id}] priority: 0 초과 ${PRIORITY_MAX} 이하의 숫자여야 함`)
        }
        if(rule.cooldownMs < 0) error.push(`[${rule.id}] cooldownMs: 음수`);
        if (typeof rule.interruptible !== 'boolean') error.push(`[${rule.id}] interruptible: true/false여야 함`)
        
        const validGroup = rule.group === false || 
        (typeof rule.group === 'object' && rule.group !== null && !Array.isArray(rule.group) &&(
            rule.group.focus === 'self' ||
            rule.group.focus === 'other' ||
            rule.group.focus === null
        ))
        if(!validGroup) error.push(`[${rule.id}] group 형식 오류`);

        normalizedCharRules.push({...rule, when: {self, other}, effect: normalizedEffects})
    }

    //가구 규칙 검증
    const normalizedFurRules: FurnitureRule[] = [];
    for(const rule of raw.furnitureRules){
        if(ids.has(rule.id)) error.push(`[${rule.id}] id: 중복 `);
        else ids.add(rule.id);

        //when
        const self = checkEmotions(rule.when.self, `[${rule.id}] when self`, error);
        const furniture = checkFurniture(rule.when.furniture, `[${rule.id}] when.furniture`, categories, error);

        if(self.includes('sleepy')) error.push(`[${rule.id}] sleepy는 self가 될 수 없음`);

        //effect
        const normalizedEffects: FurEffect[] = [];

        if(rule.effect.length === 0) error.push(`[${rule.id}] effect : 빈배열`);
        else{
            for(const eff of rule.effect){
                const effSelf = checkMotions(eff.self, `[${rule.id}] effect self`, raw_motions, error);
                
                const w = eff.weight?? 1;
                if (typeof w !== 'number' || !(w > 0 && w <= WEIGHT_MAX)) {
                    error.push(`[${rule.id}] effect.weight: 0 초과 ${WEIGHT_MAX} 이하의 숫자여야 함 (현재 ${w})`);
                }

                normalizedEffects.push({weight: w, self: effSelf});
            }
        }

        // 그외 (priority)
        if (typeof rule.priority !== 'number' || !(rule.priority > 0 && rule.priority <= PRIORITY_MAX)) {
            error.push(`[${rule.id}] priority: 0 초과 ${PRIORITY_MAX} 이하의 숫자여야 함`)
        }
        if(typeof rule.cooldownMs !== 'number' || rule.cooldownMs < 0) error.push(`[${rule.id}] cooldownMs: 음수 거나 숫자가 아님`);
        if (typeof rule.interruptible !== 'boolean') error.push(`[${rule.id}] interruptible: true/false여야 함`)
        if (typeof rule.occupy !== 'boolean') error.push(`[${rule.id}] occupy: true/false여야 함`)

        normalizedFurRules.push({...rule, when: {self, furniture}, effect: normalizedEffects})
    }

    const rulesById = new Map<string, CharacterRule | FurnitureRule>
    for(const r of [...normalizedCharRules, ...normalizedFurRules]) rulesById.set(r.id, r)

    // 이벤트 검증
    const events = {} as Record<MarketEventType, EventDef>
    for(const type of MARKET_EVENTS){
        const def = raw.events[type]

        if(!def){
            error.push(`[event: ${type}] event.json에 없음`);
            continue;
        }
        if(!raw_motions.has(def.reaction)) error.push(`[event: ${type}] reation: 존재하지 않는 모션 "${def.reaction}"`);
        if(!isEmotion(def.emotionTo)) error.push(`[event:${type}] emotionTo: 알 수 없는 감정 "${def.emotionTo}"`);
        events[type] = def;
    }

    for (const key of Object.keys(raw.events)) {
        if (!(MARKET_EVENTS as readonly string[]).includes(key)) error.push(`[event:${key}] 알 수 없는 이벤트 이름`)
    }

    // 기본 자세 검증: 모든 감정이 묶음을 갖고, 묶음의 자세는 clip 모션이어야 함
    const poses = {} as Record<Emotion, PoseDef>
    for(const emotion of EMOTIONS){
        const groupName = raw.poses.emotions[emotion]
        const group = groupName === undefined ? undefined : raw.poses.groups[groupName]

        if(!group){
            error.push(`[pose: ${emotion}] 묶음이 없음 "${groupName}"`);
            continue;
        }
        for(const key of ['idle', 'walk'] as const){
            if(raw_motions.get(group[key])?.kind !== 'clip') error.push(`[pose: ${groupName}] ${key}: clip 모션이 아님 "${group[key]}"`);
        }
        poses[emotion] = group;
    }

    for (const key of Object.keys(raw.poses.emotions)) {
        if (!isEmotion(key)) error.push(`[pose] 알 수 없는 감정 "${key}"`)
    }

    // index 생성
    const characterIndex = new Map<string, CharacterRule[]>();
    for(const rule of normalizedCharRules)
        for(const s of rule.when.self)
            for(const o of rule.when.other)
                addToIndex(characterIndex, `${s}|${o}`, rule);

    const furnitureIndex = new Map<string, FurnitureRule[]>();
    for(const rule of normalizedFurRules)
        for(const s of rule.when.self)
            for(const f of rule.when.furniture)
                addToIndex(furnitureIndex, `${s}|${f}`, rule);

    sortAndCheck(characterIndex, error);
    sortAndCheck(furnitureIndex, error);

    if(error.length !== 0) throw new Error('규칙 데이터 오류: \n' + error.join('\n'));
    else {
        // output 만들기
        return{characterIndex, furnitureIndex, rulesById, motions: raw_motions, furniture: raw_furniture, events, poses};
    }
}

export function isEmotion(v: string): v is Emotion {
    return typeof v === 'string' && EMOTION_SET.has(v)
}

const toArray = <T>(v: T | T[]): T[] => (Array.isArray(v)? v : [v])

function checkEmotions(list:string | string[] | undefined, where: string, error: string[]): Emotion[]{
    if(list === undefined) return [];

    const result: Emotion[] = []
    
    if(toArray(list).length === 0) error.push(`${where}: 빈 배열`);
    else{
        for(const name of toArray(list)){
            if (isEmotion(name)) result.push(name)
            else error.push(`${where}: 알 수 없는 감정 "${name}"`)
        }
    }
    
    return result;
}

function checkMotions(list: string | string[] | undefined, where: string, motions: Map<string,MotionDef>, error: string[]): string[]{
    if(list === undefined) return [];

    const names = toArray(list);
    if(names.length === 0) error.push(`${where}: 빈 배열`);
    else {
        for(const name of names){
            if(!motions.has(name)) error.push(`${where}: 존재하지 않는 모션 "${name}"`);
        }
    }
    
    return names;
}

function checkFurniture(list: string | string[], where: string, categories: ReadonlySet<string>, error: string[]): string[]{
    if(list === undefined) {
        error.push(`${where}: 필수 항목이 없음`)
        return [];
    }
    
    const names = toArray(list);
    if(names.length === 0) error.push(`${where}: 빈 배열`);
    else{
        for(const name of names){
            if(!categories.has(name)) error.push(`${where}: 존재하지 않는 카테고리 "${name}"`);
        }
    }

    return names;
}

function addToIndex<R>(index: Map<string, R[]>, key: string, rule: R){
    const list = index.get(key);
    
    if(list) list.push(rule)
    else index.set(key, [rule])
}

function sortAndCheck<R extends {id: string; priority: number}>(index: Map<string, R[]>, error: string[]){
    for(const [key, list] of index){
        list.sort((a, b) => b.priority - a.priority)
        for(let i=1; i<list.length; i++){
            if(list[i].priority === list[i-1].priority)
                error.push(`[${key}] priority 동률 충돌: ${list[i-1].id}, ${list[i].id}`)
        }
    }
}

// 빠진 조합 찾기
export function checkCoverage(rules: RuleSet): string[] {
    const warnings: string[] = []
    const categories = new Set([...rules.furniture.values()].map(f => f.category))

    for (let i = 0; i < EMOTIONS.length; i++) {
        for (let j = i; j < EMOTIONS.length; j++) {
            const a = EMOTIONS[i], b = EMOTIONS[j]
            if (a === 'sleepy' && b === 'sleepy') continue
            if (!rules.characterIndex.has(`${a}|${b}`) && !rules.characterIndex.has(`${b}|${a}`))
                warnings.push(`캐릭터 규칙 없음: ${a} × ${b}`)
        }
    }
    for (const e of EMOTIONS) {
        if (e === 'sleepy') continue
        for (const c of categories)
            if (!rules.furnitureIndex.has(`${e}|${c}`)) warnings.push(`가구 규칙 없음: ${e} × ${c}`)
    }
    return warnings
}