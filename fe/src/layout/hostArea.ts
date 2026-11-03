/**
 * 화면이 실제로 받은 폭 — 브라우저 창이 아니라 화면을 담은 칸(앱에서는 Root 의 왼쪽 영역 스크롤 칸).
 * 오른쪽에 글로벌 사이드바가 붙어 창 폭과 화면 폭이 다르므로, 창 폭으로 계산하면 사이드바 밑으로 파고든다.
 * clientWidth 라 세로 스크롤바 폭은 빠진다. 담은 칸이 없으면(측정 전) 창 폭.
 */
export function hostWidth(el: HTMLElement | null): number {
  const host = el?.parentElement;
  return host ? host.clientWidth : document.documentElement.clientWidth;
}

/**
 * 담은 칸의 크기가 바뀌면 알린다 — 창 크기뿐 아니라 사이드바를 여닫을 때도 바뀐다.
 * 돌려준 함수로 그만 본다.
 */
export function observeHost(el: HTMLElement | null, onChange: () => void): () => void {
  const host = el?.parentElement;
  if (!host || typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(onChange);
  ro.observe(host);
  return () => ro.disconnect();
}
