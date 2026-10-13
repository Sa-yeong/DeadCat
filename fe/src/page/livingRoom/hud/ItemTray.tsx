import { R } from '../../stockDetail/radius';
import type { InventoryItem } from '../types';
import { ITEM_MIME } from './dnd';
import { PanelBody, PanelHeader } from './SidePanel';
import { C } from './style';
import { ItemIcon } from './ui';

/**
 * 아이템 — 오른쪽 창의 한 탭(OWNER 전용, 2026-10-12 — 예전의 '아이템 모드'를 없앴다).
 * 칸을 캐릭터에게 **끌어다 놓아야만** 준다(눌러서 골라 두기 없음). 창을 연 채로 거실은 평소대로 돌아간다.
 * 창은 씬을 만지지 않는다 — 놓은 자리의 캐릭터는 페이지가 런타임에 묻는다.
 */
export function ItemPanel({
  inventory,
  dragging,
  onDrag,
  onClose,
}: {
  inventory: InventoryItem[] | null;
  /** 끌고 있는 아이템 — 그 줄만 표시 */
  dragging: number | null;
  onDrag: (itemId: number | null) => void;
  onClose: () => void;
}) {
  return (
    <>
      <PanelHeader title="아이템" sub="캐릭터에게 끌어다 놓으면 호감도가 올라요" onClose={onClose} />
      <PanelBody>
        {inventory === null && <span style={{ fontSize: 12.5, color: C.faint }}>불러오는 중…</span>}
        {inventory?.length === 0 && <span style={{ fontSize: 12.5, color: C.faint }}>가진 아이템이 없어요</span>}
        {/* 게임 아이템 칸처럼 — 정사각형 칸을 격자로 채운다. 칸엔 그림과 왼쪽 아래 개수만(이름·호감도는 마우스를 올리면) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, alignContent: 'start' }}>
          {inventory?.map((it) => {
            const on = it.itemId === dragging;
            const empty = it.quantity <= 0;
            return (
              <div key={it.itemId} style={{ minWidth: 0, opacity: empty ? 0.4 : 1 }}>
                <div
                  draggable={!empty}
                  aria-disabled={empty}
                  aria-label={`${it.name} ${it.quantity}개, 호감도 +${it.effect} — 캐릭터에게 끌어다 놓기`}
                  title={empty ? `${it.name} — 다 썼어요` : `${it.name} · 호감도 +${it.effect}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(ITEM_MIME, String(it.itemId));
                    e.dataTransfer.effectAllowed = 'copy';
                    onDrag(it.itemId);
                  }}
                  onDragEnd={() => onDrag(null)}
                  style={{
                    position: 'relative', width: '100%', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                    borderRadius: R.card, border: `1px solid ${on ? C.accent : C.lineSoft}`, background: on ? C.chip : C.panel,
                    cursor: empty ? 'default' : 'grab',
                  }}
                >
                  <ItemIcon icon={it.icon} size={34} />
                  <span style={{ position: 'absolute', left: 6, bottom: 4, fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, color: C.text }}>
                    ×{it.quantity}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </PanelBody>
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
