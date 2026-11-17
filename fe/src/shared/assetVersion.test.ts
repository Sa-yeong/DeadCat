import { describe, expect, it } from 'vitest';
import { versionUrl, versioned } from './assetVersion';

const TABLE = { 'characters/dev/character.vrm': '1a2b3c4d', 'furnitures/models/1.glb': '99887766' };

describe('versioned — 주소에 버전(마무리 L-3)', () => {
  it('표에 있는 파일은 ?v=버전', () => {
    expect(versionUrl('/characters/dev/character.vrm', TABLE, '/')).toBe('/characters/dev/character.vrm?v=1a2b3c4d');
    expect(versionUrl('/furnitures/models/1.glb', TABLE, '/')).toBe('/furnitures/models/1.glb?v=99887766');
  });

  it('표에 없는 파일은 그대로 — 거실이 차례로 찾아보는 없는 옷 파일(404 → 다음 후보)', () => {
    expect(versionUrl('/characters/chibi/clothes/13/base_normal.vrm', TABLE, '/')).toBe('/characters/chibi/clothes/13/base_normal.vrm');
  });

  it('두 번 지나도 같은 주소 — 받은 파일 보관소의 키가 하나', () => {
    const once = versionUrl('/characters/dev/character.vrm', TABLE, '/');
    expect(versionUrl(once, TABLE, '/')).toBe(once);
  });

  it('BASE 가 다르면 BASE 를 뗀 경로로 찾고, BASE 밖 · data: 주소는 그대로', () => {
    expect(versionUrl('/app/characters/dev/character.vrm', TABLE, '/app/')).toBe('/app/characters/dev/character.vrm?v=1a2b3c4d');
    expect(versionUrl('/characters/dev/character.vrm', TABLE, '/app/')).toBe('/characters/dev/character.vrm');
    expect(versionUrl('data:model/gltf-binary;base64,AAAA', TABLE, '/')).toBe('data:model/gltf-binary;base64,AAAA');
  });

  it('테스트 · 개발 서버는 빈 표 — 주소 그대로', () => {
    expect(versioned('/characters/dev/character.vrm')).toBe('/characters/dev/character.vrm');
  });
});
