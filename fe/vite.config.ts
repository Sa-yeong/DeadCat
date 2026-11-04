import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 개발 서버는 앱 진입점만 훑는다 — preview/ 는 미리보기 빌드 전용 가상 모듈을 써서 여기서 못 찾는다
  optimizeDeps: { entries: ['index.html'] },
})
