import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * 거실 화면 미리보기 — HTML 한 장으로 뽑는다 (개별종목 vite.preview.config.ts 와 같은 방식).
 *   npx vite build --config vite.preview-room.config.ts
 * 3D 가 없어 옆에 붙는 파일이 없다 — 더블클릭으로 열어도 된다.
 */
export default defineConfig({
  root: 'preview-room',
  base: './',
  publicDir: false,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: process.env.DC_OUT || '../dist-preview-room',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
})
