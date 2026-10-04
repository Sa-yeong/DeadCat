import { useState } from 'react';
import { pct, toneSoft } from '../../stockDetail/format';
import { R } from '../../stockDetail/radius';
import type { CharacterDef, Quote, ReactionKind, RoomCharacterDto, ViewMode } from '../types';
import { Icon } from './ui';
import { C, REACTION_COLOR } from './style';

/** 배지 다섯 — OWNER 5종 / VISITOR·GUEST 4종(옷 없음) */
export type BadgeKind = 'rate' | 'affinity' | 'reaction' | 'stock' | 'clothes';

const RADIUS = 96;
/** 배지 사이를 넓게 — 배지 밑 이름이 옆 배지에 가리지 않게 */
const ANGLES5 = [-180, -135, -90, -45, 0];
const ANGLES4 = [-165, -115, -65, -15];
const SIZE = 46;

/**
 * 캐릭터를 누르면 머리 위에 뜨는 원형 배지들.
 * 위치는 RoomHud 가 그릴 때마다 런타임(loop.screenOf)에 물어 넘겨 준다 — 스탯 링은 캐릭터를 직접 읽지 않는다.
 */
export function StatRing({
  x,
  y,
  mode,
  character,
  def,
  quote,
  reactions,
  onSelectBadge,
  onReact,
  onNeedLogin,
}: {
  /** 머리 위 지점 (무대 기준 px) */
  x: number;
  y: number;
  mode: ViewMode;
  character: RoomCharacterDto;
  def: CharacterDef;
  quote: Quote | undefined;
  reactions: ReactionKind[];
  onSelectBadge: (kind: BadgeKind) => void;
  onReact: (reactionId: number) => void;
  /** 비로그인이 반응을 남기려 했다 */
  onNeedLogin: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const owner = mode === 'OWNER';

  // 수익률 — 내 거실은 시세로 실시간, 남의 거실은 서버가 계산한 값
  const rate =
    owner && quote && character.meanPrice ? ((quote.price - character.meanPrice) / character.meanPrice) * 100 : character.returnRate;

  const kinds: BadgeKind[] = owner ? ['rate', 'affinity', 'reaction', 'stock', 'clothes'] : ['rate', 'affinity', 'reaction', 'stock'];
  const angles = owner ? ANGLES5 : ANGLES4;
  const label: Record<BadgeKind, string> = { rate: '수익률', affinity: '호감도', reaction: '받은 반응', stock: '종목 보기', clothes: '옷' };

  const face = (k: BadgeKind) => {
    const num = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '-0.02em' } as const;
    switch (k) {
      case 'rate':
        return <span style={{ ...num, color: rate === undefined ? C.faint : toneSoft(rate) }}>{rate === undefined ? '—' : pct(rate)}</span>;
      case 'affinity':
        return <span style={num}>{character.affinityLevel >= 5 ? 'MAX' : `Lv.${character.affinityLevel}`}</span>;
      case 'reaction':
        return <span style={num}>{character.receivedReactionCount}</span>;
      case 'stock':
        return <Icon name="arrow" size={16} />;
      case 'clothes':
        return <Icon name="hanger" size={18} />;
    }
  };

  const click = (k: BadgeKind) => {
    if (k === 'reaction' && mode === 'GUEST') {
      onNeedLogin();
      return;
    }
    if (k === 'reaction' && mode === 'VISITOR') {
      setPicker((v) => !v);
      return;
    }
    onSelectBadge(k);
  };

  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 6 }}>
      <div style={{ position: 'absolute', left: -80, top: -RADIUS - 58, width: 160, display: 'flex', justifyContent: 'center' }}>
        <span
          style={{
            padding: '4px 9px', borderRadius: R.control, background: C.panel, border: `1px solid ${C.line}`,
            fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >
          {def.stockName}
          {owner && character.quantity !== undefined && <span style={{ color: C.dim, fontWeight: 500 }}> · {character.quantity}주</span>}
        </span>
      </div>
      {kinds.map((k, i) => {
        const a = (angles[i] * Math.PI) / 180;
        const bx = Math.round(Math.cos(a) * RADIUS) - SIZE / 2;
        const by = Math.round(Math.sin(a) * RADIUS) - SIZE / 2;
        const clickable = k === 'stock' || k === 'clothes' || (k === 'reaction' && mode !== 'OWNER');
        return (
          <div key={k} style={{ position: 'absolute', left: bx, top: by, width: SIZE, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <button
              type="button"
              aria-label={label[k]}
              onClick={() => click(k)}
              style={{
                width: SIZE, height: SIZE, padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: C.panel, border: `1px solid rgba(255,255,255,0.22)`, color: C.text, cursor: clickable ? 'pointer' : 'default',
              }}
            >
              {face(k)}
            </button>
            <span style={{ fontSize: 11, fontWeight: 500, color: C.text2, whiteSpace: 'nowrap' }}>{label[k]}</span>
          </div>
        );
      })}
      {picker && (
        <div
          style={{
            position: 'absolute', left: -70, top: 24, width: 140, display: 'flex', justifyContent: 'center', gap: 4, padding: 4,
            border: `1px solid ${C.line}`, borderRadius: R.card, background: C.panel,
          }}
        >
          {reactions.map((r) => (
            <button
              key={r.reactionId}
              type="button"
              aria-label={`${def.stockName}에게 ${r.label}`}
              onClick={() => {
                onReact(r.reactionId);
                setPicker(false);
              }}
              style={{ width: 32, height: 28, border: 'none', borderRadius: R.control, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name={r.icon} size={16} fill={r.icon !== 'smile'} color={REACTION_COLOR[r.icon]} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
