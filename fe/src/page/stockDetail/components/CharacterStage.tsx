import { useEffect, useRef, useState } from 'react';
import { useLayout, type Layout } from '../layout';
import { StockScene, onlyCenterMoved, type Framing } from '../runtime/StockScene';
import { StockStageLoop } from '../runtime/StockStageLoop';
import { CHARACTER_ASSETS } from '../runtime/assets';

export type StageStatus = 'loading' | 'ready' | 'failed';

/** 골반이 창문 아랫변보다 얼마나 위에 걸리는가 — 창문 높이 대비. 시안 그림에 맞춘 값 */
const HIPS_ABOVE_WIN_BOTTOM = 0.02;

/**
 * 창문 가운데만 옮겨 간 뒤(글로벌 사이드바 여닫기) 캐릭터가 따라가기까지 기다리는 시간(ms).
 * 여닫는 움직임이 끝나고 이만큼 지나서 간다. 그 사이에 또 여닫으면 다시 이만큼.
 */
const HOME_SETTLE_MS = 1000;

/** 화면 좌표 → 캐릭터를 걸 위치. PNG 시절 캐릭터 사각형(layout.character)을 그대로 따른다 */
export function framingFor(L: Layout): Framing {
  return {
    width: L.canvasWidth,
    height: L.stageHeight,
    headTop: L.character.top,
    hips: L.win.bottom - L.winHeight * HIPS_ABOVE_WIN_BOTTOM,
    centerX: L.character.left + L.character.width / 2,
    horizon: L.floor.horizon,
    vanishX: L.floor.vanishX,
    winMid: (L.win.top + L.win.bottom) / 2,
  };
}

/**
 * 3D 캐릭터 캔버스 — 무대 전체 크기, 막(CoverFilm) **아래**에 깐다.
 * 폭은 글로벌 사이드바를 접었을 때 기준(layout.canvasWidth)이라 여닫아도 그대로다.
 * 막이 뒤를 흐리게 하므로 씬은 한 번만 그린다.
 *
 * 모델과 첫 모션이 다 붙기 전에는 보이지 않는다(T자 자세 방지).
 * 그동안과 실패했을 때는 페이지가 PNG 캐릭터를 대신 보인다.
 */
export function CharacterStage({
  onLoop,
  onStatus,
}: {
  onLoop: (loop: StockStageLoop | null) => void;
  onStatus: (s: StageStatus) => void;
}) {
  const L = useLayout();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const loop = useRef<StockStageLoop | null>(null);
  const layout = useRef(L);
  layout.current = L;
  const [ready, setReady] = useState(false);
  /** 3D 에 마지막으로 맞춰 둔 화면 좌표 · 캐릭터가 따라갈 때를 기다리는 타이머 */
  const applied = useRef<Framing | null>(null);
  const settle = useRef(0);
  // 콜백은 마운트 때 한 번만 건다 — 바뀔 때마다 씬을 다시 만들지 않게
  const cb = useRef({ onLoop, onStatus });
  cb.current = { onLoop, onStatus };

  useEffect(() => {
    if (!canvas.current) return;
    let alive = true;
    let scene: StockScene;
    try {
      scene = new StockScene(canvas.current);
    } catch (err) {
      console.warn('[CharacterStage] WebGL 을 쓸 수 없어 그림으로 대신한다', err);
      cb.current.onStatus('failed');
      return;
    }
    const lp = new StockStageLoop(scene);
    loop.current = lp;
    applied.current = framingFor(layout.current);
    lp.setFraming(applied.current);
    cb.current.onLoop(lp);
    cb.current.onStatus('loading');
    // 미리보기 전용 — 감정 테스트 패널이 루프에 닿는 길
    const w = window as unknown as { __DC_PREVIEW__?: boolean; __dcStage?: StockStageLoop | null };
    if (w.__DC_PREVIEW__) w.__dcStage = lp;

    lp.load(CHARACTER_ASSETS.model, CHARACTER_ASSETS.motionBase)
      .then(() => {
        if (!alive) return;
        setReady(true);
        cb.current.onStatus('ready');
      })
      .catch((err) => {
        console.warn('[CharacterStage] 캐릭터 불러오기 실패 — 그림으로 대신한다', err);
        if (alive) cb.current.onStatus('failed');
      });

    return () => {
      alive = false;
      window.clearTimeout(settle.current);
      lp.dispose();
      loop.current = null;
      cb.current.onLoop(null);
      if (w.__DC_PREVIEW__) w.__dcStage = null;
    };
  }, []);

  /**
   * 레이아웃이 바뀌면 —
   *  · 창 크기가 바뀜(캔버스 크기 · 높이 쪽이 달라짐) → 카메라만 바로 다시 맞춘다. 씬은 다시 만들지 않는다
   *  · 창문 가운데만 옮겨 감(글로벌 사이드바 여닫기) → 그동안 3D 는 그대로 둔다. 캐릭터는 제자리에 있고
   *    블럭 · 창문만 움직인다. 움직임이 멎고 HOME_SETTLE_MS 뒤에 캐릭터가 새 가운데로 걸어(뛰어) 온다.
   *    여닫는 동안은 매 프레임 레이아웃이 바뀌므로 마지막 변화부터 센다
   */
  useEffect(() => {
    const lp = loop.current;
    if (!lp) return;
    lp.setVisibleWidth(L.viewWidth);
    const f = framingFor(L);
    const prev = applied.current;
    if (prev && onlyCenterMoved(prev, f)) {
      window.clearTimeout(settle.current);
      if (prev.centerX === f.centerX) return; // 원래 자리로 돌아왔다 — 갈 데가 없다
      settle.current = window.setTimeout(() => {
        applied.current = f;
        lp.moveHome(f.centerX);
      }, HOME_SETTLE_MS);
      return;
    }
    window.clearTimeout(settle.current);
    applied.current = f;
    lp.setFraming(f);
  }, [L]);

  return (
    <canvas
      ref={canvas}
      aria-label="종목 캐릭터"
      className="pointer-events-none absolute left-0 top-0"
      style={{ width: L.canvasWidth, height: L.stageHeight, opacity: ready ? 1 : 0, transition: 'opacity 0.4s' }}
    />
  );
}
