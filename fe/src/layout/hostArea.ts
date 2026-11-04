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
 * 오른쪽에 keep 만큼 내주고 남는 폭 — 사이드바를 여닫는 동안에도 변하지 않는다.
 * 지금 칸 폭에 사이드바 폭을 더하면 여닫는 도중 반올림으로 1px 씩 흔들리므로, 창 폭에서 거꾸로 뺀다.
 * 스크롤바는 빼지 않는다 — 스크롤바는 넘칠 때만 생겨서, 빼면 여닫을 때 이 값이 달라진다.
 */
export function collapsedHostWidth(el: HTMLElement | null, keep: number): number {
  const host = el?.parentElement;
  const doc = document.documentElement.clientWidth;
  if (!host) return doc - keep;
  return Math.round(doc - host.getBoundingClientRect().left - keep);
}

/**
 * 사이드바가 sidebar 폭이 되었을 때 담은 칸이 받을 폭 — 여닫기가 끝나기 전에 최종 폭을 미리 안다.
 * hostWidth 처럼 지금 있는 세로 스크롤바 폭은 뺀다.
 */
export function hostWidthWithSidebar(el: HTMLElement | null, sidebar: number): number {
  const host = el?.parentElement;
  const scrollbar = host ? host.offsetWidth - host.clientWidth : 0;
  return collapsedHostWidth(el, sidebar) - scrollbar;
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
