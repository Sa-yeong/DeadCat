/** vite.preview.config.ts 가 만들어 넣는 3D 파일 묶음 — 이름 → gzip 해 둔 data: 주소 */
declare module 'virtual:dc-preview-assets' {
  export const PREVIEW_ASSETS: Record<string, string>;
}
