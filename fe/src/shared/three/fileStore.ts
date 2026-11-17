/**
 * **받은 파일 보관소(마무리 L-2)** — 캐릭터 모델(.vrm) · 모션(.vrma) 파일의 바이트를 주소별로 들고 있는다.
 * 모듈 수준이라 페이지 · 씬보다 오래 산다 — 그 탭(방문) 동안 한도 없이. 다시 들어오면 받지 않고 바이트에서 다시 해석한다.
 *
 * 왜 바이트만: 시간 대부분이 받기(4~6초)이고 해석은 0.1~0.2초인데, 해석된 모델은 한 벌 약 100MB(텍스처 80.5MB)라
 * 들고 있기엔 크다(L-1 측정 · 도휘 결정 11-15). 해석된 모델은 지금처럼 씬이 버린다(deepDispose).
 *
 *  · 같은 주소를 동시에 둘이 요청하면 받기는 한 번(진행 중 요청을 나눠 씀)
 *  · 못 받은 파일(404 · 서버가 대신 준 HTML · 네트워크 오류)은 null 이고 보관하지 않는다 — 다음에 들어오면 다시 시도.
 *    그 페이지 안에서 다시 묻지 않는 건 씬이 자기 표로 기억한다(RoomScene.modelFiles 등)
 */

/** fetch 와 같은 모양 — 테스트에서 가짜로 바꿔 끼운다 */
export type Fetcher = (url: string) => Promise<{
  ok: boolean;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

const files = new Map<string, Promise<ArrayBuffer | null>>();
/** 다 받아 둔 주소 — ?perf 표에 「보관소에서(받기 생략)」를 적으려고 */
const stored = new Set<string>();

/** 주소의 파일 바이트 — 받아 둔 게 있으면 그대로, 없으면 받는다. 못 받으면 null(보관 안 함) */
export function fetchFile(url: string, fetcher: Fetcher = (u) => fetch(u)): Promise<ArrayBuffer | null> {
  const have = files.get(url);
  if (have) return have;
  const job = fetcher(url).then(
    (r) => (r.ok && !r.headers.get('content-type')?.includes('text/html') ? r.arrayBuffer() : null),
    () => null,
  ).catch(() => null);
  files.set(url, job);
  void job.then((buf) => {
    if (buf) stored.add(url);
    else if (files.get(url) === job) files.delete(url); // 못 받은 파일은 잊는다 — 다음 방문 때 다시
  });
  return job;
}

/** 받아 둔 파일을 해석한다 — 해석은 부를 때마다 새로(모델은 캐릭터마다 따로, 버릴 때 deepDispose). 못 받으면 null */
export async function parseFile<T>(url: string, parse: (buf: ArrayBuffer) => Promise<T>, fetcher?: Fetcher): Promise<T | null> {
  const buf = await fetchFile(url, fetcher);
  return buf ? parse(buf) : null;
}

/** 후보 주소를 차례로 — 처음으로 받아지는 파일. 없으면(전부 못 받음) null. `tried` = 몇 번째 후보였나 */
export async function firstFile(
  urls: readonly string[],
  get: (url: string) => Promise<ArrayBuffer | null> = (u) => fetchFile(u),
): Promise<{ url: string; buf: ArrayBuffer; tried: number } | null> {
  let tried = 0;
  for (const url of urls) {
    tried++;
    const buf = await get(url);
    if (buf) return { url, buf, tried };
  }
  return null;
}

/** 이미 다 받아 둔 주소인가 — 지금 요청하면 받기를 건너뛴다 */
export function isStored(url: string): boolean {
  return stored.has(url);
}

/** 테스트용 — 보관소를 비운다 */
export function clearFileStore(): void {
  files.clear();
  stored.clear();
}
