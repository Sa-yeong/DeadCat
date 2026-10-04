import { useEffect, useState } from 'react';
import { pct, toneSoft, ymd } from '../../stockDetail/format';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import { wornOutfit } from '../runtime/catalogs';
import type { AttendanceState, CharacterDef, FarewellCard, RoomCharacterDto } from '../types';
import { Icon, ItemIcon, Modal } from './ui';
import { C, accentBtn, solidBtn } from './style';

/* ───────────────────────── 출석 체크 ───────────────────────── */

/** 7일 보드 — OWNER 전용. {DB 미비 — 출석 테이블이 없어 보류된 패널. 지금은 더미} */
export function AttendanceBoard({ onClose, onClaimed }: { onClose: () => void; onClaimed: () => void }) {
  const [st, setSt] = useState<AttendanceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void api.getAttendance().then((s) => alive && setSt(s), () => alive && setFailed('출석 정보를 불러오지 못했어요'));
    return () => {
      alive = false;
    };
  }, []);

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    const next = await api.claimAttendance().catch(() => null);
    setBusy(false);
    if (!next) {
      setFailed('보상을 받지 못했어요 — 다시 눌러 주세요');
      return;
    }
    setFailed(null);
    setSt(next);
    onClaimed();
  };

  const streak = st ? st.todayIndex + (st.claimedToday ? 1 : 0) : 0;
  const today = st?.rewards[st.todayIndex];
  return (
    <Modal title="출석 체크" sub={st ? `연속 ${streak}일째` : undefined} width={580} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
        {(st?.rewards ?? []).map((r, i) => {
          const done = i < st!.todayIndex || (i === st!.todayIndex && st!.claimedToday);
          const isToday = i === st!.todayIndex && !st!.claimedToday;
          return (
            <div
              key={i}
              style={{
                height: 104, padding: '8px 4px', borderRadius: R.card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
                border: `1px solid ${isToday ? C.accent : C.lineSoft}`, background: isToday ? '#2A2A30' : C.panel, opacity: i > st!.todayIndex ? 0.45 : 1,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: isToday ? C.accent : C.dim }}>{i + 1}일차</span>
              {done ? (
                <svg width="30" height="30" viewBox="0 0 30 30" role="img" aria-label="받음">
                  <circle cx="15" cy="15" r="12.5" fill="none" stroke={C.accent} strokeWidth="1.8" />
                  <path d="M9.5 15.5l3.8 3.6 7.2-7.4" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <ItemIcon icon={r.icon} />
              )}
              <span style={{ fontSize: 11, color: C.text2, whiteSpace: 'nowrap' }}>{r.itemName} ×{r.quantity}</span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!st || st.claimedToday || busy}
        onClick={() => void claim()}
        style={{ ...(st?.claimedToday ? solidBtn : accentBtn), height: 36, justifyContent: 'center', color: st?.claimedToday ? C.dim : '#1C1C1E', cursor: st?.claimedToday ? 'default' : 'pointer' }}
      >
        {st?.claimedToday ? '출석 완료' : '오늘 보상 받기'}
      </button>
      <p style={{ fontSize: 12, color: C.faint, textAlign: 'center' }}>
        {failed ?? `${st?.claimedToday && today ? `${today.itemName} ×${today.quantity}를 보유 아이템에 넣었어요 · ` : ''}받은 아이템은 아이템 모드에서 캐릭터에게 줄 수 있어요`}
      </p>
    </Modal>
  );
}

/* ───────────────────────── 이별 흔적 ───────────────────────── */

/** 전량 매도로 떠난 캐릭터의 카드 — OWNER 전용. 기념 뱃지는 빠졌다(이별 기념물 형태 미정) */
export function FarewellArchive({ onClose }: { onClose: () => void }) {
  const [cards, setCards] = useState<FarewellCard[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void api.getFarewells().then(
      (c) => alive && setCards(c),
      () => alive && setNote('이별 흔적을 불러오지 못했어요'),
    );
    return () => {
      alive = false;
    };
  }, []);

  const smallBtn: React.CSSProperties = {
    flexGrow: 1, height: 30, border: '1px solid rgba(255,255,255,0.16)', borderRadius: R.control, background: 'transparent',
    color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  };
  return (
    <Modal title="이별 흔적" sub="전량 매도로 떠난 캐릭터가 남긴 카드" width={940} onClose={onClose}>
      {cards?.length === 0 && <p style={{ fontSize: 13, color: C.faint }}>아직 떠난 캐릭터가 없어요</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {cards?.map((f) => (
          <article key={f.stockCode} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: R.panel, background: C.panel, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'relative', height: 180, background: '#1F1F24', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', left: 12, top: 10, fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: C.faint }}>
                {ymd(f.startDate)} – {ymd(f.endDate)}
              </span>
              <div aria-hidden="true" style={{ position: 'relative', width: 96, height: 140, marginBottom: 14 }}>
                <span style={{ position: 'absolute', left: 14, top: 126, width: 68, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.5)' }} />
                <span style={{ position: 'absolute', left: 22, top: 70, width: 52, height: 62, borderRadius: '22px 22px 16px 16px', background: f.color, opacity: 0.7 }} />
                <span style={{ position: 'absolute', left: 10, top: 0, width: 76, height: 76, borderRadius: '50%', background: f.color }} />
              </div>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{f.stockName}</h3>
              <Row k="함께한 기간" v={`${f.days}일`} />
              <Row k="최종 수익률" v={pct(f.finalReturnRate)} color={toneSoft(f.finalReturnRate)} />
              <p style={{ marginTop: 4, padding: 10, borderRadius: R.card, background: 'rgba(255,255,255,0.04)', fontSize: 12, lineHeight: 1.55, color: '#DADAD4' }}>“{f.message}”</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button type="button" style={smallBtn} onClick={() => setNote('이미지 저장은 연결 작업 때 붙여요')}>이미지 저장</button>
                <button type="button" style={smallBtn} onClick={() => setNote('공유는 연결 작업 때 붙여요')}>공유</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {note && <p style={{ fontSize: 12, color: C.faint }}>{note}</p>}
    </Modal>
  );
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: C.dim }}>{k}</span>
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: color ?? C.text }}>{v}</span>
    </div>
  );
}

/* ───────────────────────── 옷 입히기 ───────────────────────── */

/**
 * 스탯 링의 옷 배지에서 열린다 — OWNER 전용.
 * 캐릭터당 고유 의상 1벌, 호감도 MAX에서 해금. '기본 옷' 적용이 벗기기.
 * {착용 저장 테이블 미정 — 지금은 ownedClothesId 하나로 보유=착용}
 */
export function WardrobeGallery({
  characters,
  defs,
  initial,
  onClose,
  onChanged,
}: {
  characters: RoomCharacterDto[];
  defs: (code: string) => CharacterDef | undefined;
  initial: string;
  onClose: () => void;
  onChanged: (stockCode: string, clothesId: number | null) => void;
}) {
  const [idx, setIdx] = useState(() => Math.max(0, characters.findIndex((c) => c.stockCode === initial)));
  const cur = characters[idx];
  const def = cur ? defs(cur.stockCode) : undefined;
  // 고유 의상은 카탈로그에 실려 있다 — 캐릭터를 넘기면 그 캐릭터의 옷이 바로 보인다(따로 받지 않는다)
  const outfit = def?.outfit ?? null;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!cur || !def) return null;
  /** 캐릭터를 넘기면 앞 캐릭터의 실패 안내는 지운다 */
  const show = (i: number) => {
    setIdx(i);
    setFailed(false);
  };
  const go = (d: number) => show((idx + d + characters.length) % characters.length);
  const worn = wornOutfit(def, cur.ownedClothesId); // 거실 렌더러와 같은 규칙
  const unlocked = outfit ? cur.affinityLevel >= outfit.unlockLevel : false;
  const apply = async (clothesId: number | null) => {
    if (busy) return;
    setBusy(true);
    const ok = await api.setOutfit(cur.stockCode, clothesId).then(() => true, () => false);
    setBusy(false);
    setFailed(!ok);
    if (ok) onChanged(cur.stockCode, clothesId);
  };

  const navBtn: React.CSSProperties = {
    width: 30, height: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.16)', borderRadius: R.control, background: 'transparent', color: C.text, cursor: 'pointer',
  };
  const options = [
    { id: null as number | null, title: '기본 옷', sub: '처음부터 입고 있던 옷', color: '#55555C', locked: false },
    ...(outfit ? [{ id: outfit.clothesId as number | null, title: outfit.name, sub: unlocked ? '호감도 MAX 달성으로 해금' : `호감도 MAX(Lv.${outfit.unlockLevel})에서 해금 · 지금 Lv.${cur.affinityLevel}`, color: outfit.color, locked: !unlocked }] : []),
  ];

  return (
    <Modal title="옷 입히기" width={880} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <button type="button" onClick={() => go(-1)} aria-label="이전 캐릭터" style={navBtn}><Icon name="left" size={14} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {characters.map((c, i) => {
            const d = defs(c.stockCode);
            const on = i === idx;
            return (
              <button
                key={c.stockCode}
                type="button"
                aria-label={d?.stockName ?? c.stockCode}
                aria-pressed={on}
                onClick={() => show(i)}
                style={{
                  width: on ? 52 : 36, height: on ? 52 : 36, padding: 0, border: 'none', borderRadius: '50%', cursor: 'pointer',
                  background: d?.color ?? '#55555C', opacity: on ? 1 : 0.5, boxShadow: on ? `0 0 0 2px ${C.nav}, 0 0 0 4px ${C.accent}` : 'none',
                }}
              />
            );
          })}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="다음 캐릭터" style={navBtn}><Icon name="right" size={14} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, minHeight: 420 }}>
        <div style={{ position: 'relative', borderRadius: R.panel, background: '#1F1F24', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 20 }}>
          <span style={{ position: 'absolute', left: 14, top: 12, fontSize: 13, fontWeight: 700 }}>
            {def.stockName} <span style={{ color: C.dim, fontWeight: 500 }}>· {cur.affinityLevel >= 5 ? 'Lv.5 MAX' : `Lv.${cur.affinityLevel}`}</span>
          </span>
          <div aria-hidden="true" style={{ position: 'relative', width: 170, height: 300 }}>
            <span style={{ position: 'absolute', left: 25, top: 280, width: 120, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.5)' }} />
            <span style={{ position: 'absolute', left: 38, top: 150, width: 94, height: 136, borderRadius: '40px 40px 28px 28px', background: worn ? worn.color : def.color }} />
            <span style={{ position: 'absolute', left: 10, top: 0, width: 150, height: 150, borderRadius: '50%', background: def.color }} />
          </div>
          <span style={{ marginTop: 10, fontSize: 12, color: failed ? C.accent : C.dim }}>{failed ? '옷을 바꾸지 못했어요 — 다시 눌러 주세요' : '적용한 옷은 거실 캐릭터에도 보여요'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((o) => {
            const on = (worn?.clothesId ?? null) === o.id;
            return (
              <div key={String(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `1px solid ${on ? C.accent : C.lineSoft}`, borderRadius: R.card, background: C.panel }}>
                <span style={{ width: 52, height: 52, borderRadius: R.card, background: o.color, opacity: o.locked ? 0.3 : 1, flexShrink: 0 }} />
                <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{o.title}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.dim }}>
                    {o.locked && <Icon name="lock" size={12} />}
                    {o.sub}
                  </span>
                </div>
                {on ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>착용 중</span>
                ) : (
                  !o.locked && <button type="button" onClick={() => void apply(o.id)} style={{ ...solidBtn, fontSize: 12 }}>적용</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
