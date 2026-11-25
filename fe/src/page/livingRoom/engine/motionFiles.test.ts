import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import motions from './data/motions.json';

// 거실모션 H-1 — motions.json 의 clip 이름마다 모션 파일(public/characters/chibi/motions/{clip}.vrma)이 있는가
const DIR = fileURLToPath(new URL('../../../../public/characters/chibi/motions/', import.meta.url));

describe('모션 파일 (H-1)', () => {
  it('motions.json 의 모든 clip 에 파일이 있다', () => {
    const clips = Object.values(motions as Record<string, { clip?: string | null }>).flatMap((m) => (m.clip ? [m.clip] : []));
    const have = new Set(readdirSync(DIR).filter((f) => f.endsWith('.vrma')).map((f) => f.slice(0, -'.vrma'.length)));
    expect(existsSync(DIR)).toBe(true);
    expect(clips.filter((c) => !have.has(c))).toEqual([]);
  });

  it('광기 밀치기(P-1) — wake_up · fall_down 도 대조에 들어간다', () => {
    const clips = Object.values(motions as Record<string, { clip?: string | null }>).map((m) => m.clip);
    expect(clips).toEqual(expect.arrayContaining(['wake_up', 'fall_down']));
    expect(existsSync(`${DIR}wake_up.vrma`)).toBe(true);
    expect(existsSync(`${DIR}fall_down.vrma`)).toBe(true);
  });
});
