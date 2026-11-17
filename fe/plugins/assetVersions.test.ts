import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { versionUrl } from '../src/shared/assetVersion'
import { HASH_LEN, buildVersionTable, hashBytes, scanPublic } from './assetVersions'

const bytes = (s: string) => new TextEncoder().encode(s)

describe('주소에 버전 — 해시 표 만들기(마무리 L-3)', () => {
  it('같은 내용 = 같은 버전, 내용이 바뀌면 버전이 바뀐다', () => {
    expect(hashBytes(bytes('vrm-a'))).toBe(hashBytes(bytes('vrm-a')))
    expect(hashBytes(bytes('vrm-a'))).not.toBe(hashBytes(bytes('vrm-b')))
    expect(hashBytes(bytes('vrm-a'))).toMatch(new RegExp(`^[0-9a-f]{${HASH_LEN}}$`))
  })

  it('표는 경로 → 버전, 경로가 달라도 내용이 같으면 같은 버전', () => {
    const t = buildVersionTable([
      { path: 'characters/a.vrm', bytes: bytes('same') },
      { path: 'characters/b/a.vrm', bytes: bytes('same') },
      { path: 'furnitures/models/1.glb', bytes: bytes('glb') },
    ])
    expect(Object.keys(t)).toEqual(['characters/a.vrm', 'characters/b/a.vrm', 'furnitures/models/1.glb'])
    expect(t['characters/a.vrm']).toBe(t['characters/b/a.vrm'])
    expect(t['furnitures/models/1.glb']).not.toBe(t['characters/a.vrm'])
  })

  it('파일을 바꿔 다시 빌드하면 그 파일의 주소만 바뀐다', () => {
    const before = buildVersionTable([
      { path: 'characters/dev/character.vrm', bytes: bytes('old') },
      { path: 'characters/motions/idle.vrma', bytes: bytes('idle') },
    ])
    const after = buildVersionTable([
      { path: 'characters/dev/character.vrm', bytes: bytes('new') },
      { path: 'characters/motions/idle.vrma', bytes: bytes('idle') },
    ])
    const url = (t: Record<string, string>, p: string) => versionUrl(`/${p}`, t, '/')
    expect(url(before, 'characters/dev/character.vrm')).not.toBe(url(after, 'characters/dev/character.vrm'))
    expect(url(before, 'characters/motions/idle.vrma')).toBe(url(after, 'characters/motions/idle.vrma'))
  })
})

describe('public 훑기', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = ''
  })

  it('characters · furnitures/models 아래 .vrm · .vrma · .glb 만, 경로는 / 로', () => {
    dir = mkdtempSync(join(tmpdir(), 'dc-av-'))
    const put = (p: string, s: string) => {
      mkdirSync(join(dir, p, '..'), { recursive: true })
      writeFileSync(join(dir, p), s)
    }
    put('characters/chibi/clothes/13/default.vrm', 'm')
    put('characters/motions/idle.vrma', 'i')
    put('characters/character-front.png', 'png')
    put('furnitures/models/1.glb', 'g')
    put('furnitures/1.png', 'png')
    put('items/1.glb', 'not-scanned')
    const paths = scanPublic(dir).map((f) => f.path)
    expect(paths.sort()).toEqual(['characters/chibi/clothes/13/default.vrm', 'characters/motions/idle.vrma', 'furnitures/models/1.glb'])
  })

  it('폴더가 없어도 멈추지 않는다', () => {
    dir = mkdtempSync(join(tmpdir(), 'dc-av-'))
    expect(scanPublic(dir)).toEqual([])
  })
})
