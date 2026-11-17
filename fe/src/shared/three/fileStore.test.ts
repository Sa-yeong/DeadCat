import { beforeEach, describe, expect, it } from 'vitest';
import { clearFileStore, fetchFile, firstFile, isStored, parseFile, type Fetcher } from './fileStore';

/** 가짜 불러오기 — 주소별 응답(ok · content-type)을 정해 두고, 몇 번 받았는지 센다 */
function fakeFetch(table: Record<string, { ok: boolean; type?: string } | 'throw'>) {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    const r = table[url] ?? { ok: false };
    if (r === 'throw') throw new Error('네트워크');
    await Promise.resolve(); // 실제처럼 한 박자 늦게
    return {
      ok: r.ok,
      headers: { get: (n: string) => (n === 'content-type' ? (r.type ?? 'application/octet-stream') : null) },
      arrayBuffer: async () => new TextEncoder().encode(url).buffer as ArrayBuffer,
    };
  };
  return { fetcher, calls };
}

const MODEL = '/characters/chibi/char_chibi_2.vrm';
const MOTION = '/characters/chibi/idle_chibi.vrma';

describe('받은 파일 보관소(L-2)', () => {
  beforeEach(() => clearFileStore());

  it('같은 주소 두 번 = 받기 한 번, 해석은 두 번(다시 들어올 때마다 새로 해석)', async () => {
    const { fetcher, calls } = fakeFetch({ [MODEL]: { ok: true } });
    let parsed = 0;
    const parse = async (buf: ArrayBuffer) => ({ n: ++parsed, size: buf.byteLength });
    const a = await parseFile(MODEL, parse, fetcher); // 첫 방문
    expect(isStored(MODEL)).toBe(true);
    const b = await parseFile(MODEL, parse, fetcher); // 다시 들어옴
    expect(calls).toEqual([MODEL]);
    expect(parsed).toBe(2);
    expect(a).not.toBe(b); // 해석본은 매번 새것
  });

  it('동시에 둘 = 받기 한 번(진행 중 요청을 나눠 씀)', async () => {
    const { fetcher, calls } = fakeFetch({ [MODEL]: { ok: true } });
    const [x, y] = await Promise.all([fetchFile(MODEL, fetcher), fetchFile(MODEL, fetcher)]);
    expect(calls).toEqual([MODEL]);
    expect(x).toBe(y);
    expect(x).not.toBeNull();
  });

  it('못 받은 파일(404 · HTML · 네트워크 오류)은 null이고 보관하지 않는다 — 다음에 다시 받는다', async () => {
    const miss = '/characters/chibi/clothes/9/base_normal.vrm';
    const html = '/characters/chibi/clothes/common/base_normal.vrm';
    const down = '/characters/chibi/clothes/5/base_normal.vrm';
    const { fetcher, calls } = fakeFetch({ [miss]: { ok: false }, [html]: { ok: true, type: 'text/html; charset=utf-8' }, [down]: 'throw' });
    for (const u of [miss, html, down]) expect(await fetchFile(u, fetcher)).toBeNull();
    await Promise.resolve(); // 실패 정리(then)가 돈 뒤
    for (const u of [miss, html, down]) expect(isStored(u)).toBe(false);
    for (const u of [miss, html, down]) await fetchFile(u, fetcher);
    expect(calls).toEqual([miss, html, down, miss, html, down]);
  });

  it('후보를 차례로 — 못 받은 파일은 건너뛰고 다음 후보(거실 findModel)', async () => {
    const miss = '/characters/chibi/clothes/13/base_normal.vrm';
    const html = '/characters/chibi/clothes/common/base_normal.vrm';
    const { fetcher, calls } = fakeFetch({ [miss]: { ok: false }, [html]: { ok: true, type: 'text/html' }, [MODEL]: { ok: true } });
    const found = await firstFile([miss, html, MODEL], (u) => fetchFile(u, fetcher));
    expect(found?.url).toBe(MODEL);
    expect(found?.tried).toBe(3);
    expect(calls).toEqual([miss, html, MODEL]);
    // 다시 들어오면 — 있는 파일은 보관소에서, 없는 파일은 다시 묻는다
    const again = await firstFile([miss, html, MODEL], (u) => fetchFile(u, fetcher));
    expect(again?.url).toBe(MODEL);
    expect(calls).toEqual([miss, html, MODEL, miss, html]);
    expect(await firstFile([miss], (u) => fetchFile(u, fetcher))).toBeNull();
  });

  it('모션 바이트도 받기 한 번 — 해석에 실패하면 parseFile 이 오류를 그대로 낸다', async () => {
    const { fetcher, calls } = fakeFetch({ [MOTION]: { ok: true } });
    let parsed = 0;
    await parseFile(MOTION, async () => ++parsed, fetcher);
    await parseFile(MOTION, async () => ++parsed, fetcher);
    await fetchFile(MOTION, fetcher);
    expect(calls).toEqual([MOTION]);
    expect(parsed).toBe(2);
    await expect(parseFile(MOTION, async () => { throw new Error('깨진 파일'); }, fetcher)).rejects.toThrow('깨진 파일');
    expect(await parseFile('/없는.vrma', async () => 1, fetcher)).toBeNull();
  });
});
