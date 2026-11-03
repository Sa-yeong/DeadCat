import { api } from './axios';

/** 열린 스트림 손잡이 — 닫기 · 지금 다시 잇기 */
export interface SseStream {
  close(): void;
  reconnect(): void;
}

/** 끊겼을 때 다시 잇는 간격(ms) — 1초에서 두 배씩, 30초까지 */
const RETRY_MIN = 1000;
const RETRY_MAX = 30_000;
/** 다시 이어도 소용없는 응답 — 로그인 풀림(401) · 비공개(403) · 없음(404). 스트림을 열기 전 HTTP 상태로 온다 */
const STOP_STATUS = [401, 403, 404];

/**
 * 서버 스트림(SSE)을 연다 — 거실 감정 · 앱 알림이 같이 쓴다.
 * 브라우저 EventSource 는 헤더를 못 붙여서(401) fetch 로 열고 SSE 를 직접 읽는다.
 *   메시지마다 data 줄의 JSON 을 onMessage 로 — 이름표(event:)는 보지 않는다. 내용 속 type 으로 나누는 건 받는 쪽
 *   끊기면 간격을 두고 다시 잇는다. 이을 때마다(처음 포함) onOpen 을 부른다 — 끊긴 사이 놓친 것을 받아 올 자리
 *   401 · 403 · 404 면 다시 잇지 않고 onStopped(상태)를 한 번 부른다. tokenRequired 인데 토큰이 없어도 401 로 친다.
 *   토큰이 없으면 헤더 없이 연다
 */
export function openSse({
  path,
  token,
  tokenRequired,
  label,
  onMessage,
  onStopped,
  onOpen,
}: {
  path: string;
  /** 이을 때마다 읽는다 */
  token: () => string | null;
  tokenRequired: boolean;
  /** 콘솔 경고에 붙는 이름 */
  label: string;
  onMessage: (data: unknown) => void;
  onStopped: (status: number) => void;
  onOpen?: () => void;
}): SseStream {
  let ctrl: AbortController | null = null;
  let timer = 0;
  let retry = 0;
  let closed = false;

  const stop = (status: number) => {
    closed = true;
    onStopped(status);
  };

  const connect = async () => {
    window.clearTimeout(timer);
    ctrl?.abort();
    const mine = new AbortController();
    ctrl = mine;
    const t = token();
    if (!t && tokenRequired) return stop(401);
    try {
      const res = await fetch(`${api.defaults.baseURL ?? ''}${path}`, {
        headers: t ? { Authorization: `Bearer ${t}`, Accept: 'text/event-stream' } : { Accept: 'text/event-stream' },
        cache: 'no-store',
        signal: mine.signal,
      });
      if (STOP_STATUS.includes(res.status)) return stop(res.status);
      if (!res.ok || !res.body) throw new Error(`스트림 응답 ${res.status}`);
      retry = 0;
      onOpen?.();
      await readSse(res.body, onMessage, label);
    } catch (e) {
      if (mine.signal.aborted) return; // 닫았거나 새로 이었다
      console.warn(`[${label}] 끊김 — 다시 잇습니다`, e);
    }
    if (closed || ctrl !== mine) return;
    timer = window.setTimeout(() => void connect(), Math.min(RETRY_MAX, RETRY_MIN * 2 ** retry++));
  };

  void connect();
  return {
    close() {
      closed = true;
      window.clearTimeout(timer);
      ctrl?.abort();
    },
    reconnect() {
      if (closed) return;
      retry = 0;
      void connect();
    },
  };
}

/** SSE 본문을 끝까지 읽는다 — 빈 줄로 메시지를 나누고, data 줄을 모아 JSON 으로. 주석(:)·다른 줄은 버린다 */
async function readSse(body: ReadableStream<Uint8Array>, onMessage: (data: unknown) => void, label: string): Promise<void> {
  const reader = body.getReader();
  const text = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += text.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
    let cut: number;
    while ((cut = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(l.startsWith('data: ') ? 6 : 5))
        .join('\n');
      if (!data) continue;
      try {
        onMessage(JSON.parse(data));
      } catch {
        console.warn(`[${label}] JSON 이 아닌 메시지를 버립니다`, data);
      }
    }
  }
}
