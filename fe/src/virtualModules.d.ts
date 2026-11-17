/** plugins/assetVersions.ts 가 내는 표 — public 기준 경로 → 내용 해시 앞 8자. 개발 서버 · 테스트에서는 빈 표 */
declare module 'virtual:dc-asset-versions' {
  export const ASSET_VERSIONS: Readonly<Record<string, string>>;
}
