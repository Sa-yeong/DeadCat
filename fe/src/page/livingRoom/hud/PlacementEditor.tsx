import { useEffect, useRef, useState } from 'react';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import type { FurnitureCatalog } from '../runtime/catalogs';
import { syncPlacements } from '../runtime/placementSync';
import type { Pt } from '../runtime/projection';
import type { RoomRenderer } from '../runtime/RoomRenderer';
import type { PlacementDto } from '../types';
import { BottomBar, ModeBanner, TrayTile } from './chrome';
import { FURN_MIME } from './dnd';
import {
  movePlacement,
  nearestFit,
  placeFromStorage,
  resetPlacements,
  rotatePlacement,
  slideTo,
  storePlacement,
  type PlacementDoc,
} from './placementDoc';
import { C, accentBtn, ghostBtn } from './style';
import { ConfirmDialog, Icon } from './ui';
import { useEscape } from './useEscape';
import { useHistory } from './useHistory';

/**
 * 배치 편집 세션 — OWNER 전용, 대상은 **가구만**.
 * 저장 전 상태(history)를 든다. 편집 중 이동·회전은 서버로 가지 않고, 저장할 때 한 번에 보낸다.
 * 씬을 직접 만지는 오버레이는 여기뿐이다 (RoomRenderer · FurnitureCatalog 로 가는 파란 선).
 * 계산은 placementDoc.ts, 되돌리기 기록은 useHistory — 여기는 포인터와 화면만.
 */
export function PlacementEditor({
  renderer,
  catalog,
  initial,
  roomLeft,
  roomWidth,
  stageHeight,
  barTop,
  onPreview,
  onExit,
}: {
  renderer: RoomRenderer;
  catalog: FurnitureCatalog;
  initial: readonly PlacementDto[];
  roomLeft: number;
  roomWidth: number;
  stageHeight: number;
  barTop: number;
  /** 편집 중 배치가 바뀌었다 — 캐릭터가 지금 가구를 피해 걷도록 런타임에 알린다(저장 전) */
  onPreview: (placements: readonly PlacementDto[]) => void;
  /** 저장했으면 저장된 배치, 취소했으면 null */
  onExit: (saved: PlacementDto[] | null) => void;
}) {
  const history = useHistory<PlacementDoc>();
  const doc = history.present;
  const [selected, setSelected] = useState<number | null>(null);
  const [holding, setHolding] = useState<number | null>(null); // 보관함에서 집은 가구
  const [confirmReset, setConfirmReset] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 저장 실패 · 보관함 불러오기 실패 — 안내 문구로만 알린다 */
  const [failed, setFailed] = useState<'save' | 'load' | null>(null);
  const [dragging, setDragging] = useState(false);
  const overlay = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ id: number; offset: Pt; start: Pt; last: Pt } | null>(null);
  const nextTemp = useRef(-1);
  /** 저장 응답이 오기 전에 화면을 떠났는지 — 떠났으면 런타임을 건드리지 않는다 */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 시작 — 보관함을 받고 첫 기록을 만든다
  useEffect(() => {
    let alive = true;
    void api.getStorage().then(
      (storage) => alive && history.reset({ placements: initial.map((p) => ({ ...p })), storage }),
      () => alive && setFailed('load'), // 보관함을 모르면 저장할 수 없다 — 문서를 만들지 않아 저장이 잠긴 채로 둔다
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 문서가 바뀔 때마다(옮기기·회전·보관·꺼내기·초기화·되돌리기) 걷는 칸을 맞춘다
  const previewed = doc?.placements;
  useEffect(() => {
    if (previewed) onPreview(previewed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewed]);

  // 나가면 표시를 지운다
  useEffect(
    () => () => {
      renderer.highlightFurniture(null);
      renderer.showGhost(null);
    },
    [renderer],
  );

  const def = (id: number) => catalog.def(id);
  const placementOf = (id: number) => doc?.placements.find((p) => p.placementId === id);

  const select = (id: number | null) => {
    setSelected(id);
    renderer.highlightFurniture(id);
  };

  const stopHolding = () => {
    setHolding(null);
    renderer.showGhost(null);
  };

  /** 문서를 바꾸고 씬을 맞춘 뒤 기록에 쌓는다. 저장 중에는 아무것도 바꾸지 않는다(모든 편집이 여기를 지난다) */
  const apply = (next: PlacementDoc) => {
    if (!doc || saving || next === doc) return;
    syncPlacements(renderer, doc.placements, next.placements);
    history.commit(next);
  };

  /** 되돌리기·다시 하기 — 옮겨 간 문서로 씬을 맞춘다 */
  const travel = (to: PlacementDoc | undefined) => {
    if (!doc || saving || !to) return;
    syncPlacements(renderer, doc.placements, to.placements);
    select(null);
    stopHolding();
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = overlay.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const floorAt = (e: { clientX: number; clientY: number }) => {
    const p = local(e);
    return renderer.toFloor(p.x, p.y);
  };

  /** 보관함 가구가 놓일 자리 — 누른 곳에서 가장 가까운 빈 자리. 근처에 없으면 null */
  const spotFor = (furnitureId: number, at: Pt) =>
    doc ? nearestFit(doc, def, { placementId: null, furnitureId, pos: at, rotation: 0 }) : null;

  const place = (furnitureId: number, at: Pt) => {
    if (!doc) return;
    const pos = spotFor(furnitureId, at);
    if (!pos) return; // 놓을 자리가 없다 — 들고 있는 채로 다른 곳을 고르게 둔다
    const id = nextTemp.current--;
    const next = placeFromStorage(doc, furnitureId, pos, id);
    stopHolding();
    if (next === doc) return;
    apply(next);
    select(id);
  };

  /* ── 방 위 포인터 ── */
  // 저장 중에는 손대지 않는다 — 응답 전에 바꾼 것은 저장되지 않은 채 씬에만 남기 때문
  const onDown = (e: React.PointerEvent) => {
    if (!doc || saving || e.button !== 0 || !e.isPrimary) return;
    if (holding !== null) {
      place(holding, floorAt(e));
      return;
    }
    const p = local(e);
    const id = renderer.pickFurniture(p.x, p.y);
    select(id);
    const pl = id === null ? undefined : placementOf(id);
    if (id === null || !pl) return;
    const fl = renderer.toFloor(p.x, p.y);
    const start = { x: pl.positionX, y: pl.positionY };
    drag.current = { id, offset: { x: fl.x - start.x, y: fl.y - start.y }, start, last: start };
    setDragging(true);
    overlay.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!doc || saving) return;
    // 버튼이 떼어졌는데 놓기를 못 받았다(우클릭 메뉴 등) — 끌기를 끝낸다
    if (drag.current && e.buttons === 0) {
      endDrag();
      return;
    }
    if (holding !== null) {
      // 고스트는 실제로 놓일 자리에 보여 준다 — 근처에 빈 자리가 없으면 안 보인다
      const pos = spotFor(holding, floorAt(e));
      renderer.showGhost(pos ? holding : null, pos ?? undefined, 0);
      return;
    }
    const d = drag.current;
    const pl = d && placementOf(d.id);
    if (!d || !pl) return;
    const fl = floorAt(e);
    const want = { x: fl.x - d.offset.x, y: fl.y - d.offset.y };
    d.last = slideTo(doc, def, { placementId: pl.placementId, furnitureId: pl.furnitureId, pos: want, rotation: pl.rotation }, d.last);
    renderer.placeFurniture(pl.placementId, pl.furnitureId, d.last, pl.rotation);
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d || !doc) return;
    if (d.last.x === d.start.x && d.last.y === d.start.y) return;
    // 씬은 이미 그 자리에 있다 — 기록만 쌓는다
    history.commit(movePlacement(doc, d.id, d.last));
  };

  /* ── 편집 동작 ── */
  const rotate = () => {
    if (doc && selected !== null) apply(rotatePlacement(doc, selected, def));
  };
  const store = () => {
    if (!doc || selected === null) return;
    apply(storePlacement(doc, selected));
    select(null);
  };
  const reset = () => {
    if (doc) apply(resetPlacements(doc));
    select(null);
    setConfirmReset(false);
  };
  const cancel = () => {
    if (doc) syncPlacements(renderer, doc.placements, initial);
    onExit(null);
  };
  const save = async () => {
    // 끄는 중에는 저장하지 않는다 — 끌던 자리는 아직 문서에 없어서 씬과 저장값이 갈라진다
    if (!doc || saving || dragging) return;
    setSaving(true);
    setFailed(null);
    const saved = await api.savePlacements(doc.placements, doc.storage).catch(() => null);
    if (!mounted.current) return;
    if (!saved) {
      setSaving(false);
      setFailed('save');
      return;
    }
    syncPlacements(renderer, doc.placements, saved); // 임시 id → 서버 id
    onExit(saved);
  };

  // Esc — 확인 창 → 집은 가구 → 고른 가구 순으로 내려놓는다. 모드를 나가지는 않는다(편집을 잃지 않게)
  useEscape(
    confirmReset ? () => setConfirmReset(false) : holding !== null ? stopHolding : selected !== null ? () => select(null) : null,
  );

  const anchor = selected !== null && !dragging ? renderer.furnitureAnchor(selected) : null;
  const canRotate = !!doc && selected !== null && rotatePlacement(doc, selected, def) !== doc;
  const selPl = selected !== null ? placementOf(selected) : undefined;
  const selDef = selPl ? def(selPl.furnitureId) : undefined;
  const iconBtn: React.CSSProperties = { ...ghostBtn, width: 32, height: 32, padding: 0, justifyContent: 'center' };
  const centerX = roomLeft + roomWidth / 2;
  const stock = doc?.storage ?? [];

  return (
    <>
      {/* 방 위를 덮는 투명 판 — 배치 모드 동안 포인터를 가로챈다 */}
      <div
        ref={overlay}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => holding !== null && renderer.showGhost(null)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(FURN_MIME)) e.preventDefault();
        }}
        onDrop={(e) => {
          const id = Number(e.dataTransfer.getData(FURN_MIME));
          if (!id || saving) return;
          e.preventDefault();
          place(id, floorAt(e));
        }}
        style={{ position: 'absolute', left: roomLeft, top: 0, width: roomWidth, height: stageHeight, zIndex: 4, cursor: holding !== null ? 'copy' : 'default', touchAction: 'none', transition: 'left 0.35s ease' }}
      />

      <ModeBanner
        title="배치"
        hint={failed === 'save' ? '저장하지 못했어요 — 다시 눌러 주세요' : holding !== null ? '놓을 자리를 누르세요' : '가구를 끌어 옮기고, 눌러서 돌리거나 보관해요'}
      />

      {anchor && selDef && (
        <div style={{ position: 'absolute', left: roomLeft + anchor.x - 120, top: anchor.y - 46, width: 240, display: 'flex', justifyContent: 'center', zIndex: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 3, border: `1px solid ${C.line}`, borderRadius: R.card, background: C.panel }}>
            <span style={{ padding: '0 8px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{selDef.name}</span>
            <button type="button" onClick={rotate} disabled={!canRotate || saving} title={canRotate ? undefined : '돌릴 자리가 없어요'} style={{ ...ghostBtn, opacity: canRotate ? 1 : 0.4, cursor: canRotate ? 'pointer' : 'default' }}><Icon name="rotate" />회전</button>
            <button type="button" onClick={store} disabled={saving} style={ghostBtn}><Icon name="store" />보관</button>
          </div>
        </div>
      )}

      <BottomBar
        centerX={centerX}
        top={barTop}
        width={Math.min(760, roomWidth + 120)}
        title="보관함"
        gap={12}
        tools={
          <>
            <button type="button" onClick={() => travel(history.undo())} aria-label="되돌리기" disabled={!history.canUndo || saving} style={{ ...iconBtn, color: history.canUndo ? C.text : '#55555C' }}><Icon name="undo" /></button>
            <button type="button" onClick={() => travel(history.redo())} aria-label="다시 하기" disabled={!history.canRedo || saving} style={{ ...iconBtn, color: history.canRedo ? C.text : '#55555C' }}><Icon name="redo" /></button>
            <button type="button" onClick={() => setConfirmReset(true)} disabled={!doc || saving} style={ghostBtn}>초기화</button>
            <button type="button" onClick={cancel} disabled={saving} style={ghostBtn}>취소</button>
            <button type="button" onClick={() => void save()} disabled={saving || dragging || !doc} style={{ ...accentBtn, height: 32 }}>{saving ? '저장 중…' : '저장'}</button>
          </>
        }
      >
        {!doc && <span style={{ fontSize: 12, color: C.faint }}>{failed === 'load' ? '보관함을 불러오지 못했어요 — 취소하고 다시 들어와 주세요' : '불러오는 중…'}</span>}
        {doc && stock.length === 0 && <span style={{ fontSize: 12, color: C.faint }}>보관한 가구가 없어요</span>}
        {stock.map((s) => {
          const d = def(s.furnitureId);
          if (!d) return null;
          const on = holding === s.furnitureId;
          return (
            <TrayTile
              key={s.furnitureId}
              on={on}
              name={d.name}
              count={s.quantity}
              gap={4}
              icon={
                <svg width="30" height="24" viewBox="0 0 30 24" aria-hidden="true">
                  <polygon points="15,3 27,9 15,15 3,9" fill={d.colors[0]} />
                  <polygon points="3,9 15,15 15,22 3,16" fill={d.kind === 'rug' ? d.colors[0] : d.colors[1]} />
                  <polygon points="15,15 27,9 27,16 15,22" fill={d.kind === 'rug' ? d.colors[0] : d.colors[2]} />
                </svg>
              }
              draggable={!saving}
              aria-label={`${d.name} ${s.quantity}개`}
              onClick={() => {
                if (saving) return;
                select(null);
                if (on) stopHolding();
                else setHolding(s.furnitureId);
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData(FURN_MIME, String(s.furnitureId));
                e.dataTransfer.effectAllowed = 'copy';
              }}
            />
          );
        })}
      </BottomBar>

      {confirmReset && (
        <ConfirmDialog
          title="배치를 초기화할까요?"
          body="방에 놓인 가구가 전부 보관함으로 돌아가요. 저장하기 전까지는 되돌릴 수 있어요."
          confirmLabel="초기화"
          onCancel={() => setConfirmReset(false)}
          onConfirm={reset}
        />
      )}
    </>
  );
}
