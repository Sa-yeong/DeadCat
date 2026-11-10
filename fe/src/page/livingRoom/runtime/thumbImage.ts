/** 거실 썸네일 이미지 — 찍은 캔버스를 파일로 */

/** 자동 촬영 크기 — 거실 탐색 카드(2:1)에 맞춘다 */
export const THUMB_W = 800;
export const THUMB_H = 400;
/** 직접 촬영(화면 전체)을 올릴 때 가로 최대 — 카드(약 280px)보다 넉넉하게, 서버 한도(500KB) 안으로 */
export const UPLOAD_MAX_W = 1200;

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));

/** 가로가 maxW 보다 크면 비율을 지켜 줄인다 */
function shrink(c: HTMLCanvasElement, maxW: number): HTMLCanvasElement {
  if (c.width <= maxW) return c;
  const out = document.createElement('canvas');
  out.width = maxW;
  out.height = Math.round((c.height * maxW) / c.width);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, out.width, out.height);
  return out;
}

/** 올릴 파일 — webp 0.85, 브라우저가 webp 를 못 만들면(다른 형식이 나오면) jpeg 0.85 */
export async function encodeThumb(c: HTMLCanvasElement, maxW = Infinity): Promise<Blob> {
  const src = shrink(c, maxW);
  const webp = await toBlob(src, 'image/webp', 0.85);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(src, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('썸네일 이미지를 만들지 못했어요');
  return jpeg;
}

