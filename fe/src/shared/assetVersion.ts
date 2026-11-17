import { ASSET_VERSIONS } from 'virtual:dc-asset-versions';

/**
 * **주소에 버전(마무리 L-3)** — 캐릭터 모델 · 모션 · 가구 모델 주소는 전부 이 함수를 지난다.
 * 빌드 때 만든 표(plugins/assetVersions.ts)에 있는 파일이면 `?v=내용해시` 를 붙이고, 없으면 그대로 둔다.
 *  · 표에 없는 파일(거실이 차례로 찾아보는 없는 옷 파일 등)은 버전 없이 — 404 → 다음 후보 동작 그대로
 *  · 이미 `?` 가 붙은 주소 · data: 주소는 그대로 — 두 번 지나도 같은 주소(받은 파일 보관소의 키가 하나로)
 *  · 개발 서버 · 테스트는 표가 비어 있어 그대로
 */
export function versionUrl(url: string, table: Readonly<Record<string, string>>, base: string): string {
  if (!url.startsWith(base) || url.includes('?')) return url;
  const v = table[url.slice(base.length)];
  return v ? `${url}?v=${v}` : url;
}

/** 이 앱의 주소(`BASE_URL` + public 기준 경로)에 버전을 붙인다 */
export const versioned = (url: string): string => versionUrl(url, ASSET_VERSIONS, import.meta.env.BASE_URL);
