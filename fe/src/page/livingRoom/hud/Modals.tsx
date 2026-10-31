import { useEffect, useState } from 'react';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import { lookColor } from '../catalog';
import { clothesKindOf, OUTFIT_RULE, type OutfitState } from '../runtime/outfitState';
import { charIdOf, type CharacterClothes, type CharacterDef, type RoomCharacterDto } from '../types';
import { affinityLabel, levelLabel } from './labels';
import { Icon, Modal } from './ui';
import { C, solidBtn } from './style';

/** 가운데 팝업 — 옷 입히기만 남았다(출석 체크·이별 흔적은 오른쪽 창의 탭으로, OwnerPanels.tsx) */

/* ───────────────────────── 옷 입히기 ───────────────────────── */

/**
 * 스탯 링의 옷 배지에서 열린다 — OWNER 전용. 고르는 옷은 둘: 기본 옷 · 호감도 MAX 보상 옷(3-⑩).
 * 캐릭터를 넘길 때마다 그 캐릭터의 MAX 옷을 받는다(GET /rooms/me/characters/:stockId/clothes — 해금 여부). 서버는 고른 옷만 저장한다.
 * 헤진 · 일반 · 좋은 형태는 수익률이 정한다(런타임 판정) — 고르기는 언제나 되고, 상태는 형태만 바꾼다. 헤진 · 좋은이면 안내 한 줄
 */
export function WardrobeGallery({
  characters,
  defs,
  initial,
  stateOf,
  onClose,
  onChanged,
}: {
  characters: RoomCharacterDto[];
  defs: (charId: string) => CharacterDef | undefined;
  /** 처음 보일 캐릭터 id */
  initial: string;
  /** 지금 옷 상태(런타임 판정) — 수익률을 아직 못 받았으면 undefined */
  stateOf: (charId: string) => OutfitState | undefined;
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
  const state = stateOf(charIdOf(cur)) ?? 'normal';
  const worn = clothesKindOf(cur.ownedClothesId);
  const max = data?.maxClothes ?? null;
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
    setWardrobe((w) => (w && w.stockId === cur.stockId ? { ...w, data: { ...w.data, equippedClothesId: clothesId } } : w));
  };

  const navBtn: React.CSSProperties = {
    width: 30, height: 30, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.16)', borderRadius: R.control, background: 'transparent', color: C.text, cursor: 'pointer',
  };
  // 칸 그림 색 — 지금 상태로 입었을 때의 모습(거실 렌더러와 같은 lookColor)
  const options = [
    { id: null as number | null, on: worn === 'base', title: '기본 옷', sub: '처음부터 입고 있던 옷', color: lookColor(cur.stockId, { clothes: 'base', state }), locked: false },
    ...(max
      ? [{
          id: max.clothesId as number | null,
          on: worn === 'max',
          title: max.name,
          sub: max.unlocked ? '호감도 MAX 보상' : `호감도 MAX에서 해금 · 지금 ${levelLabel(cur.affinityLevel, cur.affinityProgress)}`,
          color: lookColor(cur.stockId, { clothes: 'max', state }),
          locked: !max.unlocked,
        }]
      : []),
  ];
  const stateNote =
    state === 'ragged' ? `수익률 -${OUTFIT_RULE.enter}% 이하라 헤진 옷을 입고 있어요` : state === 'fancy' ? `수익률 +${OUTFIT_RULE.enter}% 이상이라 좋은 옷을 입고 있어요` : null;

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
            <span style={{ position: 'absolute', left: 38, top: 150, width: 94, height: 136, borderRadius: '40px 40px 28px 28px', background: lookColor(cur.stockId, { clothes: worn, state }) }} />
            <span style={{ position: 'absolute', left: 10, top: 0, width: 150, height: 150, borderRadius: '50%', background: def.color }} />
          </div>
          <span style={{ marginTop: 10, fontSize: 12, color: failed ? C.accent : C.dim }}>{failed ?? '적용한 옷은 거실 캐릭터에도 보여요'}</span>
          {stateNote && <span style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: C.text2 }}>{stateNote}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((o) => {
            const on = o.on;
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
          {data && !max && <span style={{ fontSize: 12, color: C.faint }}>이 캐릭터의 MAX 보상 옷은 아직 준비 중이에요</span>}
        </div>
      </div>
    </Modal>
  );
}
