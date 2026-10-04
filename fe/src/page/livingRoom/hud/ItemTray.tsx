import { R } from '../../stockDetail/radius';
import type { InventoryItem } from '../types';
import { BottomBar, TrayTile } from './chrome';
import { ITEM_MIME } from './dnd';
import { C, accentBtn } from './style';
import { ItemIcon } from './ui';

/**
 * 아이템 모드 하단 트레이 — OWNER 전용.
 * 아이템을 캐릭터에게 **끌어다 놓거나**, 골라 두고 캐릭터를 누른다.
 * 트레이는 씬을 만지지 않는다 — 놓은 자리의 캐릭터는 런타임의 pick 경로가 찾아 준다.
 */
export function ItemTray({
  inventory,
  pending,
  centerX,
  top,
  onPick,
  onDone,
}: {
  inventory: InventoryItem[] | null;
  pending: number | null;
  centerX: number;
  top: number;
  onPick: (itemId: number | null) => void;
  onDone: () => void;
}) {
  const sel = inventory?.find((i) => i.itemId === pending);
  return (
    <>
      <div style={{ position: 'absolute', left: centerX - 300, top: top - 26, width: 600, textAlign: 'center', fontSize: 13, color: C.text2, pointerEvents: 'none', zIndex: 8 }}>
        {sel ? `${sel.name} — 줄 캐릭터를 누르거나 끌어다 놓으세요` : '아이템을 캐릭터에게 끌어다 놓으면 호감도가 올라요'}
      </div>
      <BottomBar
        centerX={centerX}
        top={top}
        width={640}
        title="보유 아이템"
        tools={<button type="button" onClick={onDone} style={{ ...accentBtn, height: 32 }}>완료</button>}
      >
        {inventory === null && <span style={{ fontSize: 12, color: C.faint }}>불러오는 중…</span>}
        {inventory?.map((it) => {
          const on = it.itemId === pending;
          const empty = it.quantity <= 0;
          return (
            <TrayTile
              key={it.itemId}
              on={on}
              name={it.name}
              count={it.quantity}
              gap={2}
              disabled={empty}
              icon={<ItemIcon icon={it.icon} />}
              draggable={!empty}
              aria-label={`${it.name} ${it.quantity}개, 호감도 +${it.effect}`}
              title={`호감도 +${it.effect}`}
              onClick={() => onPick(on ? null : it.itemId)}
              onDragStart={(e) => {
                e.dataTransfer.setData(ITEM_MIME, String(it.itemId));
                e.dataTransfer.effectAllowed = 'copy';
                onPick(it.itemId);
              }}
            />
          );
        })}
      </BottomBar>
    </>
  );
}

/** 지급하는 순간에만 잠깐 뜨는 하트 게이지 — 상시 게이지는 없다. 자리는 준 순간에 고정된다 */
export function AffinityFlash({ x, y, delta, score, level }: { x: number; y: number; delta: number; score: number; level: number }) {
  return (
    <div style={{ position: 'absolute', left: x - 75, top: y - 56, width: 150, zIndex: 7, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, animation: 'lr-flash 1.8s ease forwards' }}>
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700, color: C.accent }}>{delta > 0 ? `+${delta}` : '이미 MAX'}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 26, padding: '0 9px', border: `1px solid ${C.line}`, borderRadius: R.control, background: C.panel }}>
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12.2 2.6 7.9a2.9 2.9 0 0 1 4.1-4.1L7 4.1l0.3-0.3a2.9 2.9 0 0 1 4.1 4.1z" fill="#FF7A70" /></svg>
        <span style={{ width: 72, height: 6, borderRadius: 3, background: '#3A3A44', overflow: 'hidden', display: 'block' }}>
          <span style={{ display: 'block', height: 6, width: (72 * Math.min(100, score)) / 100, borderRadius: 3, background: '#FF7A70', transition: 'width 0.6s ease' }} />
        </span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 700, color: C.text2 }}>{level >= 5 ? 'MAX' : `Lv.${level}`}</span>
      </div>
    </div>
  );
}
