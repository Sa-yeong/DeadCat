import { useEffect, useState } from 'react';
import { R } from '../../stockDetail/radius';
import { itemImgUrl } from '../catalog';
import { SLOT_MACHINE } from '../furnitureCatalog';
import type { FurnitureCatalog } from '../runtime/catalogs';
import type { Pt } from '../runtime/projection';
import type { PlacementDto, SlotDrawResult } from '../types';
import { gradeLabel } from './labels';
import { drawHint, drawTitle, packLabel, remainingMs, timerLabel, type SlotNote } from './slotText';
import { C, accentBtn } from './style';
import { Icon, ItemIcon, Modal, Picture } from './ui';

/**
 * 슬롯머신 HUD (마무리 M-4) — 기계 위 타이머와 뽑기 결과 창. 주인의 일반 모드에서만 RoomHud 가 띄운다.
 * 뽑기는 캐릭터를 끌어 슬롯머신에 놓을 때(RoomLoop.onSlotDrop → RoomHud) — 여기는 보여 주기만 한다. 글 · 셈은 slotText.ts
 */

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px', borderRadius: R.control, whiteSpace: 'nowrap',
  border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(33,33,38,0.92)', fontFamily: "'Space Grotesk', 'Gothic A1', sans-serif", fontSize: 12, fontWeight: 700,
};

/**
 * 놓인 슬롯머신마다 위에 남은 시간(`5:59:12`) 또는 「뽑기 가능」. 1초마다 다시 그린다.
 * 타이머를 모르는 기계(서버가 시각을 안 준 옛 응답)는 그리지 않는다. 자리는 그릴 때마다 렌더러에 묻는다(줌 · 끌기를 따라간다)
 */
export function SlotTimers({
  placements,
  furniture,
  anchorOf,
  note,
}: {
  placements: readonly PlacementDto[];
  furniture: FurnitureCatalog;
  /** 가구 윗면 가운데의 화면 자리 */
  anchorOf: (placementId: number) => Pt | null;
  /** 못 뽑을 때 안내 — 그 기계 타이머 위에 잠깐 */
  note: SlotNote | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <>
      {placements.map((p) => {
        if (furniture.def(p.furnitureId)?.engineName !== SLOT_MACHINE) return null;
        const at = anchorOf(p.placementId);
        if (!at) return null;
        const ready = remainingMs(p.slot, now) === 0;
        const noted = note?.placementId === p.placementId ? note : null;
        if (!p.slot && !noted) return null;
        return (
          <div
            key={p.placementId}
            style={{ position: 'absolute', left: at.x - 150, top: at.y - 30 - (noted ? 28 : 0), width: 300, zIndex: 4, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
          >
            {noted && (
              <span key={noted.key} role="status" style={{ ...pill, color: C.text }}>
                {noted.text}
              </span>
            )}
            {p.slot && (
              <span
                aria-label={ready ? '슬롯머신 — 뽑을 수 있어요' : `슬롯머신 — 다음 뽑기까지 ${timerLabel(p.slot, now)}`}
                style={{ ...pill, color: ready ? '#1C1C1E' : C.text2, background: ready ? C.accent : pill.background, border: ready ? `1px solid ${C.accent}` : pill.border }}
              >
                {timerLabel(p.slot, now)}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

/** 뽑기 결과 — 가구는 「가구 팩 (등급)」 한 줄로 묶어서(보관함에는 낱개로 들어감), 아이템은 그 아이템 한 줄. 아이템 그림 파일이 없으면 아이콘 */
export function SlotResultModal({ result, onClose }: { result: SlotDrawResult; onClose: () => void }) {
  const row: React.CSSProperties = {
    flexShrink: 0, height: 44, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 12, borderRadius: R.card, border: `1px solid ${C.lineSoft}`, background: C.panel,
  };
  const tag: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.dim, whiteSpace: 'nowrap' };
  const pack = packLabel(result);
  return (
    <Modal title="뽑기 결과" sub={drawTitle(result)} width={380} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pack && (
          <div style={row}>
            <Icon name="place" size={22} color={C.text2} />
            <span style={{ flexGrow: 1, fontSize: 13, color: C.text }}>{pack}</span>
            <span style={tag}>가구</span>
          </div>
        )}
        {result.item && (
          <div style={row}>
            <Picture src={itemImgUrl(result.item.itemId)} size={26} fallback={<ItemIcon icon="gift" size={26} />} />
            <span style={{ flexGrow: 1, fontSize: 13, color: C.text }}>
              {result.item.name} ×{result.item.quantity}
            </span>
            <span style={tag}>{gradeLabel(result.item.grade)} 아이템</span>
          </div>
        )}
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: C.faint, textAlign: 'center' }}>{drawHint(result)}</p>
      <button type="button" onClick={onClose} style={{ ...accentBtn, height: 36, justifyContent: 'center' }}>
        확인
      </button>
    </Modal>
  );
}
