import type { EmotionFeed, FeedEvent } from "./Engine";

export class SseEmotionFeed implements EmotionFeed {
    constructor(private readonly url: string){}

    subscribe(handler: (e: FeedEvent) => void): () => void {
        const source = new EventSource(this.url);

        const handleEvent = (message: MessageEvent) => {
            try {
                const data = JSON.parse(message.data);

                handler(data as FeedEvent)
            }catch(e){console.error('SSE 데이터 파싱 실패', e)}
        }

        const eventTypes = [
            'snapshot',
            'emotion',
            'marketEvent',
            'marketEventEnded'
        ]

        for(const type of eventTypes){
            source.addEventListener(type, handleEvent)
        }

        source.onerror = () => {
            console.error('SSE 연결 오류');
        }

        return () => {
            source.close();
        }
    }
}

