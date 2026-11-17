import type * as THREE from 'three';

/**
 * **측정 줄(마무리 L-1)** — 주소에 `?perf` 가 있을 때만 캐릭터 불러오기 시간 · 메모리를 콘솔에 표로 낸다.
 * 평소(`?perf` 없음)엔 아무것도 하지 않는다 — 부르는 쪽도 `PERF_ON` 으로 감싸 계산을 건너뛴다.
 *
 * 한 줄 = 화면 · 단계 · 대상 파일 · 걸린 시간(ms) · 비고. 줄이 쌓이면 잠깐(0.8초) 기다렸다 한 번에 `console.table`.
 * 같은 시간은 `performance.measure`(개발자 도구 성능 탭) 에도 남는다. 지금까지의 줄 전부는 `window.__perf`.
 */
export const PERF_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf');

export interface PerfRow {
  화면: string;
  단계: string;
  대상: string;
  ms: number | '';
  비고: string;
}

const pending: PerfRow[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

/** 지금 시각(ms) — 측정이 꺼져 있으면 0 */
export function perfNow(): number {
  return PERF_ON ? performance.now() : 0;
}

/** 표에 한 줄 — `start` 를 주면 지금까지 걸린 시간을 재고 performance.measure 에도 남긴다 */
export function perfRow(screen: string, step: string, target: string, start: number | null, note = ''): void {
  if (!PERF_ON) return;
  let ms: number | '' = '';
  if (start !== null) {
    const end = performance.now();
    ms = Math.round(end - start);
    try {
      performance.measure(`[perf] ${screen} ${step} ${target}`, { start, end });
    } catch {
      /* 오래된 브라우저 — 표만 */
    }
  }
  const row: PerfRow = { 화면: screen, 단계: step, 대상: target, ms, 비고: note };
  pending.push(row);
  const all = ((window as unknown as { __perf?: PerfRow[] }).__perf ??= []);
  all.push(row);
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log('[perf] 캐릭터 불러오기 측정 (?perf)');
    console.table(pending.splice(0));
  }, 800);
}

/** 주소의 끝 파일 이름(폴더 두 단계까지) — 표에서 짧게 보이게 */
export function shortName(url: string): string {
  return url.split('?')[0].split('/').slice(-3).join('/');
}

const MB = 1024 * 1024;
const mb = (n: number) => `${(n / MB).toFixed(1)}MB`;

/** 그 파일의 네트워크 기록 — 받는 데 걸린 시간 · 실제로 받은 양(0 이면 브라우저 캐시에서) */
export function downloadNote(url: string): string {
  if (!PERF_ON) return '';
  const href = new URL(url, window.location.href).href;
  const list = performance.getEntriesByName(href) as PerformanceResourceTiming[];
  const e = list[list.length - 1];
  if (!e) return '받기 기록 없음';
  const from = e.transferSize === 0 && e.decodedBodySize > 0 ? ' (캐시)' : '';
  return `받기 ${Math.round(e.duration)}ms · 전송 ${mb(e.transferSize)} / 파일 ${mb(e.decodedBodySize)}${from}`;
}

/** 그 파일을 받는 데 걸린 시간(ms) — 기록이 없으면 null */
export function downloadMs(url: string): number | null {
  if (!PERF_ON) return null;
  const href = new URL(url, window.location.href).href;
  const list = performance.getEntriesByName(href) as PerformanceResourceTiming[];
  const e = list[list.length - 1];
  return e ? e.duration : null;
}

/**
 * 모델 한 벌이 차지하는 양 — 텍스처(가로 × 세로 × 4바이트, 밉맵 제외) · 꼭짓점 데이터(버퍼 바이트 합) · 브라우저 힙(크롬만).
 * 텍스처는 그래픽 카드에 이만큼(밉맵이 있으면 +1/3), 브라우저 쪽에도 원본 그림이 남는다
 */
export function memoryNote(root: THREE.Object3D, renderer?: THREE.WebGLRenderer): string {
  if (!PERF_ON) return '';
  const textures = new Set<THREE.Texture>();
  const buffers = new Set<ArrayBufferLike>();
  let bufBytes = 0;
  const addArray = (a: { array: ArrayLike<number> & { buffer?: ArrayBufferLike; byteLength?: number } } | null | undefined) => {
    const arr = a?.array as unknown as ArrayBufferView | undefined;
    if (!arr || !arr.buffer || buffers.has(arr.buffer)) return;
    buffers.add(arr.buffer);
    bufBytes += arr.buffer.byteLength;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    if (g) {
      for (const attr of Object.values(g.attributes)) addArray(attr as unknown as { array: ArrayLike<number> });
      for (const list of Object.values(g.morphAttributes)) for (const attr of list) addArray(attr as unknown as { array: ArrayLike<number> });
      addArray(g.index as unknown as { array: ArrayLike<number> } | null);
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) textures.add(v as THREE.Texture);
      // MToon 등 셰이더 재질은 uniforms 안에 텍스처를 둔다
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) if ((u?.value as THREE.Texture | null)?.isTexture) textures.add(u.value as THREE.Texture);
    }
  });
  // 같은 그림을 여러 텍스처가 나눠 쓴다(MToon 외곽선 재질 등) — 그래픽 카드에는 그림(source)마다 한 장이 올라간다
  const sources = new Set<unknown>();
  let texBytes = 0;
  let biggest = 0;
  for (const t of textures) {
    const key = t.source ?? t.image;
    if (sources.has(key)) continue;
    sources.add(key);
    const img = t.image as { width?: number; height?: number } | undefined;
    const w = img?.width ?? 0;
    const h = img?.height ?? 0;
    texBytes += w * h * 4;
    biggest = Math.max(biggest, w, h);
  }
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  const gl = renderer ? ` · 렌더러 텍스처 ${renderer.info.memory.textures}개 · 셰이더 ${renderer.info.programs?.length ?? '?'}개` : '';
  return `텍스처 그림 ${sources.size}장 ${mb(texBytes)}(최대 ${biggest}px) · 꼭짓점 ${mb(bufBytes)}${heap ? ` · 힙 ${mb(heap)}` : ''}${gl}`;
}
