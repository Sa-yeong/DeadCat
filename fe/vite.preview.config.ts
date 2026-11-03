import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * 개별종목 화면 미리보기 — HTML 한 장으로 뽑는다.
 *   npx vite build --config vite.preview.config.ts
 *
 * 서버 없이 열린다(2026-10-27) — preview/mockApi.ts 가 가짜 백엔드 노릇을 하고,
 * 3D 캐릭터·모션(public/characters)은 gzip 으로 줄여 HTML 안에 넣는다.
 * 옆에 붙는 파일이 없어 더블클릭으로 열어도 3D 까지 보인다. 대신 HTML 이 크다(약 17MB).
 */

/** public/characters 아래 파일을 { '상대경로': 'data:…gzip' } 로 묶어 virtual:dc-preview-assets 로 내놓는다 */
function inlineCharacterAssets(): Plugin {
  const ID = 'virtual:dc-preview-assets'
  const root = fileURLToPath(new URL('./public/characters/', import.meta.url))
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
  return {
    name: 'dc-inline-character-assets',
    resolveId(id) {
      return id === ID ? '\0' + ID : null
    },
    load(id) {
      if (id !== '\0' + ID) return null
      const entries = walk(root)
        .filter((p) => /\.(vrm|vrma)$/.test(p))
        .map((p) => {
          const key = p.slice(root.length).replace(/\\/g, '/')
          const gz = gzipSync(readFileSync(p), { level: 9 }).toString('base64')
          return `  ${JSON.stringify(key)}: 'data:application/gzip;base64,${gz}'`
        })
      return `export const PREVIEW_ASSETS = {\n${entries.join(',\n')}\n};`
    },
  }
}

export default defineConfig({
  root: 'preview',
  base: './',
  publicDir: false,
  plugins: [inlineCharacterAssets(), react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: process.env.DC_OUT || '../dist-preview',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
})
