import { pct, toneSoft } from '../../stockDetail/format';
import type { OwnerProfileDto } from '../types';
import { C } from './style';
import { R } from '../../stockDetail/radius';

/**
 * 주인 프로필 — VISITOR·GUEST 전용(주인 화면에는 없다).
 * 수익률은 서버가 방문 시점에 계산한 값 하나뿐이다 — 남의 평단·수량은 내려오지 않는다.
 * 비로그인이면 RoomHud 가 onFollow 자리에 로그인 창 열기를 넣어 준다 — 버튼은 똑같이 보인다.
 */
export function OwnerProfileHud({
  owner,
  roomReturnRate,
  onFollow,
}: {
  owner: OwnerProfileDto;
  roomReturnRate: number | undefined;
  onFollow: (on: boolean) => void;
}) {
  return (
    <div style={{ position: 'absolute', left: 12, top: 10, display: 'flex', alignItems: 'center', gap: 12, zIndex: 5 }}>
      <span style={{ width: 44, height: 44, borderRadius: '50%', background: '#5B49D8', flexShrink: 0 }} aria-hidden="true" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 900 }}>{owner.nickname}의 거실</span>
          {roomReturnRate !== undefined && (
            <span style={{ fontSize: 13, fontWeight: 700, color: toneSoft(roomReturnRate) }}>{pct(roomReturnRate)}</span>
          )}
          <button
            type="button"
            onClick={() => onFollow(!owner.isFollowing)}
            style={{
              height: 26, padding: '0 10px', border: owner.isFollowing ? `1px solid ${C.line}` : 'none', borderRadius: R.control,
              background: owner.isFollowing ? 'transparent' : '#3D6DF2', color: owner.isFollowing ? C.text2 : '#FFFFFF',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {owner.isFollowing ? '팔로잉' : '팔로우'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {owner.tags.map((t) => (
            <span
              key={t.content}
              style={{
                height: 20, padding: '0 7px', display: 'inline-flex', alignItems: 'center', borderRadius: R.bar, fontSize: 11, fontWeight: 700,
                background: t.isSelf ? 'rgba(91,140,255,0.16)' : 'rgba(111,167,127,0.18)', color: t.isSelf ? '#8FB3FF' : '#8FCB9F',
              }}
            >
              {t.content}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
