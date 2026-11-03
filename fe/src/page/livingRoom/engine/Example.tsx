import { useEffect, useRef } from "react";
import { LivingRoomEngine} from "./Engine";
import { SseEmotionFeed } from "./EmotionFeed";
import { loadRules } from "./ruleLoader";
import characterRules from './data/characterRules.json';
import furnitureRules from './data/furnitureRules.json';
import events from './data/events.json';
import motions from './data/motions.json';
import furniture from './data/furniture.json';
import type { RawData } from "./type/type";

const rawData = {
    characterRules, furnitureRules,
    events, motions, furniture
} as RawData

export function LivingRoomPage(){
    const engineRef = useRef<LivingRoomEngine|null>(null);

    useEffect(() => {
        const rules = loadRules(rawData)

        const feed = new SseEmotionFeed(/* be와 연결할 주소 */)

        const engine = new LivingRoomEngine({
            rules: rules,
            feed: feed,
            onCommand: (cmd) => {
                switch(cmd.type){
                    case 'play':
                        console.log(`[3D 랜더러] ${cmd.characterId}에게 다음 모션 큐 재생: `, cmd.steps)
                        break;
                    case 'emotion':
                        console.log(`[UI 업데이트] ${cmd.characterId}의 기저 감정이 ${cmd.emotion}으로 변경`)
                        break
                    case 'cancel':
                        console.log(`[3D 랜더러] ${cmd.characterId}의 현재 애니메이션 강제 중지`)
                        break
                }
            }
        })

        engineRef.current = engine

        engine.start();

        return () => {
            engine.dispose();
            engineRef.current = null;
        }
    }, []);

    const handleCharacterCollision = (charA: string, charB: string) => {
        engineRef.current?.encounter(charA, charB);
    };

    const handleDragInterrupt = (charId: string) => {
        engineRef.current?.interrupt(charId);
    };

    return (
        <div>
        {/* 3D 캔버스 등 거실 렌더링 */}
        </div>
    );
}