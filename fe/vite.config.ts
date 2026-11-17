import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { assetVersions } from './plugins/assetVersions'

// https://vite.dev/config/
export default defineConfig({
  // 캐릭터 · 가구 3D 파일 주소에 내용 해시(?v=) — 빌드에서만, 개발 서버는 버전 없음(plugins/assetVersions.ts)
  plugins: [react(), tailwindcss(), assetVersions()],
  // 개발 서버는 앱 진입점만 훑는다 — preview/ 는 미리보기 빌드 전용 가상 모듈을 써서 여기서 못 찾는다
  optimizeDeps: { entries: ['index.html'] },
})
