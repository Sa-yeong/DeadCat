import { useState } from 'react';

/** 이미지가 없는 사람 — 마이페이지가 보여 주는 기본 그림과 같다 */
export const DEFAULT_PROFILE_IMG = `${import.meta.env.BASE_URL}profile/default_1.png`;

/**
 * 닉네임 옆 프로필 원 — 마이페이지에서 고른 이미지(users.profile_img_url).
 * 없거나 못 받으면 기본 그림. 글로벌 네비 · 커뮤니티 · 방명록이 같이 쓴다
 */
export function ProfileAvatar({ url, size }: { url: string | null | undefined; size: number }) {
  // 주소를 못 받은 적이 있으면 그 주소일 때만 기본 그림 — 주소가 바뀌면 다시 시도
  const [broken, setBroken] = useState<string | null>(null);
  const src = url && url !== broken ? url : DEFAULT_PROFILE_IMG;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      onError={() => url && setBroken(url)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block' }}
    />
  );
}
