import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

/**
 * **주소에 버전(마무리 L-3)** — `fe/public` 의 캐릭터 · 가구 3D 파일에 내용 해시 표를 만든다.
 * public 파일은 Vite 가 이름을 바꾸지 않으므로, 빌드 때 「public 기준 경로 → 내용 해시 앞 8자」 표를
 * 가상 모듈 `virtual:dc-asset-versions` 로 내고, 앱은 주소를 만들 때 `versioned()`(src/shared/assetVersion.ts)를 지나
 * `…/character.vrm?v=1a2b3c4d` 로 받는다 — 파일이 바뀌면 주소가 바뀌어 옛 파일이 보이지 않는다.
 *
 *  · 빌드(`vite build`)에서만 표를 만든다. 개발 서버 · vitest 는 빈 표(버전 없음) — 개발 서버는 public 파일을
 *    `Cache-Control: no-cache` 로 내줘 매번 다시 묻기 때문에 옛 파일이 남지 않고, 파일을 고칠 때마다 표를 다시 만들 필요도 없다
 *  · 미리보기 한 장 빌드(vite.preview*.config.ts)는 `enabled: false` — 3D 파일을 HTML 안에 넣어 주소로 찾기 때문
 */

/** 표에 넣는 파일 — public 기준 폴더와 확장자 */
export const VERSIONED_DIRS = ['characters', 'furnitures/models'] as const
export const VERSIONED_EXT = /\.(vrm|vrma|glb)$/i
/** 해시 앞 몇 자 — 16진 8자(32비트). 파일 수십 개라 겹칠 일은 사실상 없다 */
export const HASH_LEN = 8

/** 파일 내용 → 버전(sha256 앞 len 자) */
export function hashBytes(bytes: Uint8Array, len = HASH_LEN): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, len)
}

/** 파일 목록 → 「경로 → 버전」 표. 경로는 그대로(public 기준, `/` 구분) — 같은 내용이면 같은 버전 */
export function buildVersionTable(files: Iterable<{ path: string; bytes: Uint8Array }>, len = HASH_LEN): Record<string, string> {
  const table: Record<string, string> = {}
  for (const f of files) table[f.path] = hashBytes(f.bytes, len)
  return table
}

/** public 폴더에서 표에 넣을 파일을 훑는다(없는 폴더는 건너뜀) */
export function scanPublic(publicDir: string): { path: string; bytes: Uint8Array }[] {
  const out: { path: string; bytes: Uint8Array }[] = []
  const walk = (dir: string) => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const n of names.sort()) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (VERSIONED_EXT.test(n)) out.push({ path: relative(publicDir, p).split(sep).join('/'), bytes: readFileSync(p) })
    }
  }
  for (const d of VERSIONED_DIRS) walk(join(publicDir, d))
  return out
}

const ID = 'virtual:dc-asset-versions'

export function assetVersions(opts: { enabled?: boolean } = {}): Plugin {
  let table: Record<string, string> = {}
  return {
    name: 'dc-asset-versions',
    configResolved(config) {
      const on = opts.enabled ?? config.command === 'build'
      table = on && config.publicDir ? buildVersionTable(scanPublic(config.publicDir)) : {}
      if (on) config.logger.info(`[dc-asset-versions] 버전 붙인 파일 ${Object.keys(table).length}개`)
    },
    resolveId(id) {
      return id === ID ? '\0' + ID : null
    },
    load(id) {
      if (id !== '\0' + ID) return null
      return `export const ASSET_VERSIONS = ${JSON.stringify(table, null, 1)};`
    },
  }
}
