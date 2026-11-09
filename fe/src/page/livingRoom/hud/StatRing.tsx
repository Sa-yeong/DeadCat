import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { pct, toneSoft } from '../../stockDetail/format';
import { R } from '../../stockDetail/radius';
import { reactionEmoji, topReaction } from '../catalog';
import type { CharacterDef, Quote, ReactionKind, RoomCharacterDto, ViewMode } from '../types';
import { isMaxAffinity, levelLabel, reactionCountLabel } from './labels';
import { Icon, ReactionChip } from './ui';
import { C } from './style';

/** 배지 다섯 — OWNER 5종 / VISITOR·GUEST 4종(옷 없음) */
export type BadgeKind = 'rate' | 'affinity' | 'reaction' | 'stock' | 'clothes';

const RADIUS = 96;
/** 배지 사이를 넓게 — 배지 밑 이름이 옆 배지에 가리지 않게 */
const ANGLES5 = [-180, -135, -90, -45, 0];
const ANGLES4 = [-165, -115, -65, -15];
const SIZE = 46;
/** 링과 펼친 바 사이 · 바와 화면 끝 사이 */
const BAR_GAP = 6;
/** 바깥 누르기 판정 — 링과 바는 바깥이 아니다 */
const BAR_AREA = 'data-reaction-bar';

const badgeAt = (angle: number) => {
  const a = (angle * Math.PI) / 180;
  return { left: Math.round(Math.cos(a) * RADIUS) - SIZE / 2, top: Math.round(Math.sin(a) * RADIUS) - SIZE / 2 };
};

/**
 * 캐릭터를 누르면 머리 위에 뜨는 원형 배지들.
 * 위치는 RoomHud 가 그릴 때마다 런타임(loop.screenOf)에 물어 넘겨 준다 — 스탯 링은 캐릭터를 직접 읽지 않는다.
 */
export function StatRing({
  x,
  y,
  rightEdge,
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
  /** 무대에서 보이는 오른쪽 끝(px) — 오른쪽 창이 열려 있으면 창의 왼쪽 */
  rightEdge: number;
  mode: ViewMode;
  character: RoomCharacterDto;
  def: CharacterDef;
  quote: Quote | undefined;
  reactions: ReactionKind[];
  onSelectBadge: (kind: BadgeKind) => void;
  /** 반응 종류를 골랐다 — 1인 1개라 내 반응과 같은 걸 다시 고르면 서버가 취소한다 */
  onReact: (reactionType: string) => void;
  /** 비로그인이 바의 반응을 눌렀다 */
  onNeedLogin: () => void;
}) {
  const [barOpen, setBarOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const [barWidth, setBarWidth] = useState(0);
  const owner = mode === 'OWNER';

  // 수익률 — 내 거실은 보유 목록(GET /holdings 3초 폴링, 마이페이지와 같은 값), 남의 거실은 서버가 방문 시점에 계산한 값
  const rate = owner ? quote?.returnRate : character.returnRate;

  const kinds: BadgeKind[] = owner ? ['rate', 'affinity', 'reaction', 'stock', 'clothes'] : ['rate', 'affinity', 'reaction', 'stock'];
  const angles = owner ? ANGLES5 : ANGLES4;
  const label: Record<BadgeKind, string> = { rate: '수익률', affinity: '호감도', reaction: '받은 반응', stock: '종목 보기', clothes: '옷' };

  // 바 폭은 숫자 자리에 따라 달라진다 — 그리기 전에 재서 화면 끝을 넘는지 본다
  useLayoutEffect(() => {
    if (barOpen && barRef.current) setBarWidth(barRef.current.offsetWidth);
  }, [barOpen, reactions, character.receivedReactions]);

  useEffect(() => {
    if (!barOpen) return;
    const closeOutside = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(`[${BAR_AREA}]`)) setBarOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [barOpen]);

  const reactionBadge = badgeAt(angles[kinds.indexOf('reaction')]);
  const barRight = reactionBadge.left + SIZE + BAR_GAP;
  // 오른쪽이 원칙. 화면 끝에 잘려 못 누르게 되면 링 왼쪽으로
  const barLeft = barWidth > 0 && x + barRight + barWidth + BAR_GAP > rightEdge ? reactionBadge.left - BAR_GAP - barWidth : barRight;

  const face = (k: BadgeKind) => {
    const num = { fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '-0.02em' } as const;
    switch (k) {
      case 'rate':
        return <span style={{ ...num, color: rate === undefined ? C.faint : toneSoft(rate) }}>{rate === undefined ? '—' : pct(rate)}</span>;
      case 'affinity':
        // 서버가 준 레벨 · 지금 단계 진행률 그대로(3-⑤) — 배지가 작아 두 줄로
        return isMaxAffinity(character.affinityProgress) ? (
          <span style={num}>MAX</span>
        ) : (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
            <span style={num}>{levelLabel(character.affinityLevel, character.affinityProgress)}</span>
            <span style={{ ...num, fontSize: 10, fontWeight: 500, color: C.dim }}>{character.affinityProgress}%</span>
          </span>
        );
      case 'reaction':
        return <ReactionRingFace counts={character.receivedReactions} />;
      case 'stock':
        return <Icon name="arrow" size={16} />;
      case 'clothes':
        return <Icon name="hanger" size={18} />;
    }
  };

  const click = (k: BadgeKind) => {
    if (k === 'reaction') {
      setBarOpen((v) => !v);
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
        const { left, top } = badgeAt(angles[i]);
        const clickable = k === 'stock' || k === 'clothes' || k === 'reaction';
        return (
          <div key={k} style={{ position: 'absolute', left, top, width: SIZE, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <button
              type="button"
              aria-label={label[k]}
              aria-expanded={k === 'reaction' ? barOpen : undefined}
              {...(k === 'reaction' ? { [BAR_AREA]: '' } : {})}
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
      {barOpen && (
        <ReactionBar
          barRef={barRef}
          left={barLeft}
          top={reactionBadge.top + SIZE / 2}
          mode={mode}
          stockName={def.stockName}
          reactions={reactions}
          counts={character.receivedReactions}
          myReaction={character.myReaction ?? null}
          onPick={(reactionType) => (mode === 'GUEST' ? onNeedLogin() : onReact(reactionType))}
        />
      )}
    </div>
  );
}

/** 링 안 — 가장 많이 받은 반응 이모지 + 그 수. 46px 원에 이모지 + 「10k+」가 들어가는 크기. 이모지가 없는 종류는 이름이 길어 수만 */
export function ReactionRingFace({ counts }: { counts: Record<string, number> }) {
  const top = topReaction(counts);
  const emoji = top && reactionEmoji(top.reactionType);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontFamily: "'Space Grotesk', sans-serif", fontSize: top ? 10 : 11, fontWeight: 700, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>
      {emoji && <span style={{ fontSize: 11, lineHeight: 1, letterSpacing: 0 }}>{emoji}</span>}
      {reactionCountLabel(top?.count ?? 0)}
    </span>
  );
}

/**
 * 링 옆에 펼치는 바 — 반응 종류 전부 + 각각 받은 수.
 *   OWNER   보기만 (자기 캐릭터엔 반응을 남기지 않는다)
 *   VISITOR 누르면 남기기 · 같은 것 다시 누르면 취소, 내 반응은 테두리
 *   GUEST   보여 주되 누르면 로그인 안내 (누르기는 onPick 이 가른다)
 */
export function ReactionBar({ barRef, left, top, mode, stockName, reactions, counts, myReaction, onPick }: {
  barRef?: Ref<HTMLDivElement>;
  left: number;
  /** 바 세로 가운데 */
  top: number;
  mode: ViewMode;
  stockName: string;
  reactions: ReactionKind[];
  counts: Record<string, number>;
  myReaction: string | null;
  onPick: (reactionType: string) => void;
}) {
  return (
    <div
      ref={barRef}
      {...{ [BAR_AREA]: '' }}
      style={{
        position: 'absolute', left, top, transform: 'translateY(-50%)', zIndex: 1, display: 'flex', gap: 4, padding: 4,
        border: `1px solid ${C.line}`, borderRadius: R.card, background: C.panel,
      }}
    >
      {reactions.length === 0 && <span style={{ padding: '4px 6px', fontSize: 11, color: C.faint, whiteSpace: 'nowrap' }}>아직 반응 종류가 없어요</span>}
      {reactions.map((r) => {
        const mine = mode !== 'GUEST' && myReaction === r.reactionType;
        return (
          <ReactionChip
            key={r.reactionType}
            kind={r}
            count={counts[r.reactionType] ?? 0}
            mine={mine}
            disabled={mode === 'OWNER'}
            ariaLabel={mode === 'OWNER' ? `${stockName}가 받은 ${r.reactionType}` : mine ? `${stockName}에게 남긴 ${r.reactionType} 취소` : `${stockName}에게 ${r.reactionType}`}
            onClick={() => onPick(r.reactionType)}
          />
        );
      })}
    </div>
  );
}
