import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * 미리보기 산출용 설정 — 화면은 HTML 한 장에 담긴다.
 * 3D 캐릭터 파일(public/characters)은 HTML 옆에 복사된다. 파일을 더블클릭해 열면
 * 브라우저가 옆 파일을 못 읽어 그림 캐릭터로 대신 보인다 — 3D는 서버로 열 것.
 */
export default defineConfig({
  root: 'preview',
  base: './',
  publicDir: '../public',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: process.env.DC_OUT || '../dist-preview',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
})
