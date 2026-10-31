import { useEffect, useState } from 'react';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import { outfitOf } from '../catalog';
import { charIdOf, type CharacterClothes, type CharacterDef, type RoomCharacterDto } from '../types';
import { affinityLabel, levelLabel } from './labels';
import { Icon, Modal } from './ui';
import { C, solidBtn } from './style';

/** 가운데 팝업 — 옷 입히기만 남았다(출석 체크·이별 흔적은 오른쪽 창의 탭으로, OwnerPanels.tsx) */

/* ───────────────────────── 옷 입히기 ───────────────────────── */

/**
 * 스탯 링의 옷 배지에서 열린다 — OWNER 전용.
 * 캐릭터를 넘길 때마다 그 캐릭터의 옷 목록을 받는다(GET /rooms/me/characters/:stockId/clothes — 그 종목 전용 + 공용, 해금 · 착용 여부).
 * 착용은 holdings.equipped_clothes_id 한 칸. '기본 옷' 적용이 벗기(clothes_id null).
 */
export function WardrobeGallery({
  characters,
  defs,
  initial,
  onClose,
  onChanged,
}: {
  characters: RoomCharacterDto[];
  defs: (charId: string) => CharacterDef | undefined;
  /** 처음 보일 캐릭터 id */
  initial: string;
  onClose: () => void;
  onChanged: (charId: string, clothesId: number | null) => void;
}) {
  const [idx, setIdx] = useState(() => Math.max(0, characters.findIndex((c) => charIdOf(c) === initial)));
  const cur = characters[idx];
  const def = cur ? defs(charIdOf(cur)) : undefined;
  /** 지금 캐릭터의 옷 목록 — 받는 중이면 null */
  const [wardrobe, setWardrobe] = useState<{ stockId: number; data: CharacterClothes } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const stockId = cur?.stockId;
  useEffect(() => {
    if (stockId === undefined) return;
    let alive = true;
    api.getClothes(stockId).then(
      (data) => alive && setWardrobe({ stockId, data }),
      () => alive && setLoadFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [stockId]);

  if (!cur || !def) return null;
  /** 캐릭터를 넘기면 앞 캐릭터의 안내는 지우고 새로 받는다 */
  const show = (i: number) => {
    setIdx(i);
    setFailed(null);
    setLoadFailed(false);
  };
  const go = (d: number) => show((idx + d + characters.length) % characters.length);
  const data = wardrobe?.stockId === cur.stockId ? wardrobe.data : null;
  const worn = outfitOf(cur.ownedClothesId); // 거실 렌더러와 같은 규칙
  const apply = async (clothesId: number | null) => {
    if (busy) return;
    setBusy(true);
    const err = await api.setClothes(cur.stockId, clothesId).then(
      () => null,
      (e: unknown) => (e instanceof Error && e.message ? e.message : '옷을 바꾸지 못했어요'),
    );
    setBusy(false);
    setFailed(err);
    if (err) return;
    onChanged(charIdOf(cur), clothesId);
    setWardrobe((w) => (w && w.stockId === cur.stockId ? { ...w, data: { ...w.data, equippedClothesId: clothesId, clothes: w.data.clothes.map((c) => ({ ...c, equipped: c.clothesId === clothesId })) } } : w));
  };

  const navBtn: React.CSSProperties = {
    width: 30, height: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.16)', borderRadius: R.control, background: 'transparent', color: C.text, cursor: 'pointer',
  };
  /** 잠긴 옷의 안내 — 호감도로 풀리는 옷이면 필요 레벨, 아니면 얻는 방법 미정 */
  const lockedSub = (unlockLevel: number | null) =>
    unlockLevel === null ? '아직 얻지 못한 옷' : `호감도 ${unlockLevel >= 5 ? 'MAX' : `Lv.${unlockLevel}`}에서 해금 · 지금 ${levelLabel(cur.affinityLevel, cur.affinityProgress)}`;
  const options = [
    { id: null as number | null, title: '기본 옷', sub: '처음부터 입고 있던 옷', color: '#55555C', locked: false },
    ...(data?.clothes ?? []).map((c) => ({ id: c.clothesId as number | null, title: c.name, sub: c.unlocked ? '해금됨' : lockedSub(c.unlockLevel), color: outfitOf(c.clothesId)!.color, locked: !c.unlocked })),
  ];

  return (
    <Modal title="옷 입히기" width={880} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <button type="button" onClick={() => go(-1)} aria-label="이전 캐릭터" style={navBtn}><Icon name="left" size={14} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {characters.map((c, i) => {
            const d = defs(charIdOf(c));
            const on = i === idx;
            return (
              <button
                key={charIdOf(c)}
                type="button"
                aria-label={d?.stockName ?? c.stockName}
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
            {def.stockName} <span style={{ color: C.dim, fontWeight: 500 }}>· {affinityLabel(cur.affinityLevel, cur.affinityProgress)}</span>
          </span>
          <div aria-hidden="true" style={{ position: 'relative', width: 170, height: 300 }}>
            <span style={{ position: 'absolute', left: 25, top: 280, width: 120, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.5)' }} />
            <span style={{ position: 'absolute', left: 38, top: 150, width: 94, height: 136, borderRadius: '40px 40px 28px 28px', background: worn ? worn.color : def.color }} />
            <span style={{ position: 'absolute', left: 10, top: 0, width: 150, height: 150, borderRadius: '50%', background: def.color }} />
          </div>
          <span style={{ marginTop: 10, fontSize: 12, color: failed ? C.accent : C.dim }}>{failed ?? '적용한 옷은 거실 캐릭터에도 보여요'}</span>
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
          {!data && <span style={{ fontSize: 12, color: loadFailed ? C.accent : C.faint }}>{loadFailed ? '옷 목록을 불러오지 못했어요' : '옷 목록을 불러오는 중…'}</span>}
          {data && data.clothes.length === 0 && <span style={{ fontSize: 12, color: C.faint }}>아직 이 캐릭터의 옷이 없어요</span>}
        </div>
      </div>
    </Modal>
  );
}
