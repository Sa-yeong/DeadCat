import { useEffect, useState } from 'react';
import { pct, toneSoft, ymd } from '../../stockDetail/format';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import type { AttendanceState, FarewellCard } from '../types';
import { PanelBody, PanelHeader } from './SidePanel';
import { ItemIcon } from './ui';
import { C, accentBtn, solidBtn } from './style';

/**
 * 주인만 여는 오른쪽 창의 탭 — 출석 체크 · 이별 흔적. 예전엔 가운데 팝업이었다(2026-10-12 창으로 옮김).
 * 창 폭(360px)에 맞춰 세로로 쌓는다.
 */

/* ───────────────────────── 출석 체크 ───────────────────────── */

/** 7일 보드를 세로 목록으로 — {DB 미비 — 출석 테이블이 없어 보류된 패널. 지금은 더미} */
export function AttendancePanel({ onClose, onClaimed }: { onClose: () => void; onClaimed: () => void }) {
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
    <>
      <PanelHeader title="출석 체크" sub={st ? `연속 ${streak}일째` : undefined} onClose={onClose} />
      <PanelBody gap={6}>
        {st === null && !failed && <span style={{ fontSize: 12.5, color: C.faint }}>불러오는 중…</span>}
        {(st?.rewards ?? []).map((r, i) => {
          const done = i < st!.todayIndex || (i === st!.todayIndex && st!.claimedToday);
          const isToday = i === st!.todayIndex && !st!.claimedToday;
          const later = i > st!.todayIndex;
          return (
            <div
              key={i}
              style={{
                flexShrink: 0, height: 52, padding: '0 12px', borderRadius: R.card, display: 'flex', alignItems: 'center', gap: 12,
                border: `1px solid ${isToday ? C.accent : C.lineSoft}`, background: isToday ? '#2A2A30' : C.panel, opacity: later ? 0.5 : 1,
              }}
            >
              <span style={{ width: 38, fontSize: 12, fontWeight: 700, color: isToday ? C.accent : C.dim }}>{i + 1}일차</span>
              <ItemIcon icon={r.icon} size={24} />
              <span style={{ flexGrow: 1, fontSize: 13, color: C.text }}>{r.itemName} ×{r.quantity}</span>
              {done ? (
                <svg width="22" height="22" viewBox="0 0 30 30" role="img" aria-label="받음">
                  <circle cx="15" cy="15" r="12.5" fill="none" stroke={C.accent} strokeWidth="2" />
                  <path d="M9.5 15.5l3.8 3.6 7.2-7.4" fill="none" stroke={C.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: isToday ? C.accent : C.faint }}>{isToday ? '오늘' : ''}</span>
              )}
            </div>
          );
        })}
      </PanelBody>
      <div style={{ flexShrink: 0, padding: '12px 0 14px', borderTop: `1px solid ${C.lineSoft}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          disabled={!st || st.claimedToday || busy}
          onClick={() => void claim()}
          style={{ ...(st?.claimedToday ? solidBtn : accentBtn), height: 36, justifyContent: 'center', color: st?.claimedToday ? C.dim : '#1C1C1E', cursor: st?.claimedToday ? 'default' : 'pointer' }}
        >
          {st?.claimedToday ? '출석 완료' : '오늘 보상 받기'}
        </button>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: failed ? C.accent : C.faint, textAlign: 'center' }}>
          {failed ?? `${st?.claimedToday && today ? `${today.itemName} ×${today.quantity}를 보유 아이템에 넣었어요 · ` : ''}받은 아이템은 아이템 탭에서 캐릭터에게 끌어다 줄 수 있어요`}
        </p>
      </div>
    </>
  );
}

/* ───────────────────────── 이별 흔적 ───────────────────────── */

/** 전량 매도로 떠난 캐릭터의 카드 — 한 줄에 하나. 기념 뱃지는 빠졌다(이별 기념물 형태 미정) */
export function FarewellPanel({ onClose }: { onClose: () => void }) {
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
    flexGrow: 1, height: 28, border: '1px solid rgba(255,255,255,0.16)', borderRadius: R.control, background: 'transparent',
    color: C.text, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  };
  return (
    <>
      <PanelHeader title="이별 흔적" count={cards?.length} sub="전량 매도로 떠난 캐릭터의 카드" onClose={onClose} />
      <PanelBody gap={10}>
        {note && <p style={{ fontSize: 12, color: C.faint }}>{note}</p>}
        {cards === null && !note && <span style={{ fontSize: 12.5, color: C.faint }}>불러오는 중…</span>}
        {cards?.length === 0 && <p style={{ fontSize: 13, color: C.faint }}>아직 떠난 캐릭터가 없어요</p>}
        {cards?.map((f) => (
          <article key={f.stockCode} style={{ flexShrink: 0, border: `1px solid ${C.lineSoft}`, borderRadius: R.panel, background: C.panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div aria-hidden="true" style={{ position: 'relative', flexShrink: 0, width: 72, height: 96, borderRadius: R.card, background: '#1F1F24' }}>
                <span style={{ position: 'absolute', left: 14, top: 82, width: 44, height: 9, borderRadius: '50%', background: 'rgba(0,0,0,0.5)' }} />
                <span style={{ position: 'absolute', left: 19, top: 46, width: 34, height: 40, borderRadius: '14px 14px 10px 10px', background: f.color, opacity: 0.7 }} />
                <span style={{ position: 'absolute', left: 11, top: 8, width: 50, height: 50, borderRadius: '50%', background: f.color }} />
              </div>
              <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>{f.stockName}</h3>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: C.faint }}>{ymd(f.startDate)} – {ymd(f.endDate)}</span>
                <Row k="함께한 기간" v={`${f.days}일`} />
                <Row k="최종 수익률" v={pct(f.finalReturnRate)} color={toneSoft(f.finalReturnRate)} />
              </div>
            </div>
            <p style={{ padding: 10, borderRadius: R.card, background: 'rgba(255,255,255,0.04)', fontSize: 12, lineHeight: 1.55, color: '#DADAD4' }}>“{f.message}”</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={smallBtn} onClick={() => setNote('이미지 저장은 연결 작업 때 붙여요')}>이미지 저장</button>
              <button type="button" style={smallBtn} onClick={() => setNote('공유는 연결 작업 때 붙여요')}>공유</button>
            </div>
          </article>
        ))}
      </PanelBody>
    </>
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
