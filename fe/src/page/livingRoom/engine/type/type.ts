// 데이터의 모양과 사용할 이름에 대한 설명
// 감정 enum, JSON 데이터 모양, 캐릭터의 런타임 상태, 이벤트

export const EMOTIONS = ['happy','sad','tired','depress','euphoria','panic','anxious','sleepy'] as const
export const MARKET_EVENTS = ['sideCar_P', 'sideCar_N', 'curB1', 'curB2', 'curB3'] as const
export type Emotion = typeof EMOTIONS[number]
export type MarketEventType = typeof MARKET_EVENTS[number]

export type Effect = { weight: number; self: string[]; other: string[]; otherEmotionTo: Emotion[]}
export type FurEffect = {weight: number; self: string[]}
export type CharacterRule = { 
    id: string
    when: {self: Emotion[], other: Emotion[]}
    priority: number
    effect: Effect[]
    group: false | {focus: 'self' | 'other' | null}
    cooldownMs: number
    interruptible: boolean
}
export type FurnitureRule = {
    id: string
    when: {self: Emotion[], furniture: string[]}
    priority: number
    effect: FurEffect[]
    occupy: boolean
    cooldownMs: number
    interruptible: boolean
}

export type Anchor = { id: string; offset: number[]; facing: number}
export type MotionDef = { kind: 'clip'; clip: string |  null; loop?: boolean}
    | {kind: 'behavior'; behavior: string}
export type FurnitureDef = {category: string; interactionRadius: number; anchors: Anchor[]}
export type EventDef = {reaction: string; emotionTo: Emotion}

export type CharState =
    | {kind: 'wandering'}
    | {kind: 'reacting'; ruleId: string}
    | {kind: 'interactingFurniture'; furnitureId: number; anchorId:string; ruleId: string}
    | {kind: 'interactingGroup'; groupId: number}
    | {kind: 'dragging'}

export type NearbyEvent = {type: 'enter'|'exit'; a: string; b: string}

// Raw 데이터
export type rawEffect = {
    weight?: number
    self: string | string[]
    other: string | string[]
    otherEmotionTo?: string|string[]
}
export type rawCharacterRule = {
    id: string
    when: {self: string|string[]; other: string|string[]}
    priority: number
    effect: rawEffect[]
    group: false | {focus: 'self' | 'other' | null}
    cooldownMs: number
    interruptible: boolean
}
export type rawFurnitureRule = {
    id: string
    when: {self: string | string[]; furniture: string | string[]}
    priority: number
    effect: {weight?: number; self: string | string[]}[]
    occupy: boolean
    cooldownMs: number
    interruptible: boolean
}

export type RawData = {
    characterRules: rawCharacterRule[]
    furnitureRules: rawFurnitureRule[]
    motions: Record<string, MotionDef>
    furniture: Record<string, FurnitureDef>
    events: Record<string,EventDef>
}