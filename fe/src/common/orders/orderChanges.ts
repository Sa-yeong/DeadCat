/**
 * 「내가 주문 · 취소했다」 신호 — 주문 블럭과 사이드바처럼 서로를 모르는 화면이 같은 주문 상태를 다시 받게 한다.
 * 나중 체결 · 거절은 알림 통로(subscribeOrderEvents)가 알리고, 이 신호는 내가 이 화면에서 한 일을 알린다.
 *
 * 주문 · 취소한 쪽은 따로 다시 받지 않고 이 신호 하나만 보낸다 — 자기 목록도 이 신호를 듣고 다시 받으므로
 * 같은 목록을 두 번 부르지 않는다. 받는 쪽이 돌려준 Promise 를 다 기다려서, 보낸 쪽은 「다 다시 받았다」를 안다
 * (대기 줄의 [취소] 버튼이 목록이 바뀔 때까지 눌린 채로 있으려고).
 */
type Listener = () => void | Promise<unknown>;

const listeners = new Set<Listener>();

export function subscribeOrderChanges(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 듣는 쪽 하나가 실패해도 나머지는 그대로 — 실패는 듣는 쪽이 알아서 다룬다 */
export async function announceOrderChange(): Promise<void> {
  await Promise.allSettled([...listeners].map(async (fn) => fn()));
}
