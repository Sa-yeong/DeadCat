import { useState } from 'react';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import { wornOutfit } from '../runtime/catalogs';
import type { CharacterDef, RoomCharacterDto } from '../types';
import { Icon, Modal } from './ui';
import { C, solidBtn } from './style';

/** 가운데 팝업 — 옷 입히기만 남았다(출석 체크·이별 흔적은 오른쪽 창의 탭으로, OwnerPanels.tsx) */

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
