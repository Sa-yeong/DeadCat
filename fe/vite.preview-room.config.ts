import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * 거실 화면 미리보기 — HTML 한 장으로 뽑는다 (개별종목 vite.preview.config.ts 와 같은 방식).
 *   npx vite build --config vite.preview-room.config.ts
 * 3D(three.js, ?r=3d)와 치비 모델까지 한 장 안에 들어간다 — 옆에 붙는 파일이 없어 더블클릭으로 열어도 된다.
 * 대신 모델(약 10MB)이 들어가 HTML 이 크다.
 */

/** runtime/roomAssets.ts 를 바꿔 끼워 치비 VRM·모션(VRMA)을 data: 주소로 넣는다 — 앱 빌드는 public/ 파일을 그대로 받는다 */
function inlineRoomAssets(): Plugin {
  const file = (name: string) => fileURLToPath(new URL(`./public/characters/chibi/${name}`, import.meta.url))
  const uri = (name: string) => `'data:model/gltf-binary;base64,${readFileSync(file(name)).toString('base64')}'`
  return {
    name: 'dc-inline-room-assets',
    load(id) {
      if (!id.replace(/\\/g, '/').endsWith('/livingRoom/runtime/roomAssets.ts')) return null
      return `export const ROOM_ASSETS = { chibi: ${uri('char_chibi_2.vrm')}, idle: ${uri('idle_chibi.vrma')}, walk: ${uri('walk_chibi.vrma')}, pickup40: ${uri('pickup_chibi_40.vrma')}, pickup60: ${uri('pickup_chibi_60.vrma')} };`
    },
  }
}

export default defineConfig({
  root: 'preview-room',
  base: './',
  publicDir: false,
  plugins: [inlineRoomAssets(), react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: process.env.DC_OUT || '../dist-preview-room',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
})
