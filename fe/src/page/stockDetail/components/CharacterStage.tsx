import { useEffect, useRef, useState } from 'react';
import { useLayout, useSliding, type Layout } from '../layout';
import { StockScene, framingStep, type Framing } from '../runtime/StockScene';
import { StockStageLoop } from '../runtime/StockStageLoop';
import { characterOf, type CharacterInfo } from '../runtime/assets';

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

interface StageProps {
  onLoop: (loop: StockStageLoop | null) => void;
  onStatus: (s: StageStatus) => void;
}

/**
 * 종목의 캐릭터 무대. 종목 코드 → 캐릭터(assets.characterOf)를 정하고 그 캐릭터로 캔버스를 띄운다.
 * 다른 캐릭터를 쓰는 종목으로 옮겨 가면(NVDA ↔ 다른 종목) 캔버스째 새로 띄운다 — 옛 모델 · 옛 모션이 남지 않게.
 * 같은 캐릭터를 쓰는 종목끼리는 그대로 둔다(다시 받지 않는다).
 */
export function CharacterStage({ stockCode, ...props }: StageProps & { stockCode: string }) {
  const character = characterOf(stockCode);
  return <StageCanvas key={character.key} character={character} {...props} />;
}

/**
 * 3D 캐릭터 캔버스 — 무대 전체 크기, 막(CoverFilm) **아래**에 깐다.
 * 폭은 글로벌 사이드바를 접었을 때 기준(layout.canvasWidth)이라 여닫아도 그대로다.
 * 막이 뒤를 흐리게 하므로 씬은 한 번만 그린다.
 *
 * 모델과 첫 모션이 다 붙기 전에는 보이지 않는다(T자 자세 방지).
 * 그동안과 실패했을 때는 페이지가 PNG 캐릭터를 대신 보인다.
 */
function StageCanvas({ character, onLoop, onStatus }: StageProps & { character: CharacterInfo }) {
  const L = useLayout();
  const sliding = useSliding();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const loop = useRef<StockStageLoop | null>(null);
  const layout = useRef(L);
  layout.current = L;
  const [ready, setReady] = useState(false);
  /** 3D 에 마지막으로 맞춰 둔 화면 좌표 · 캐릭터가 따라갈 때를 기다리는 타이머 */
  const applied = useRef<Framing | null>(null);
  const settle = useRef(0);
  /** 이 시각(performance.now)까지의 창문 가운데 변화는 사이드바를 여닫아서 생긴 것으로 본다. 여닫는 중에는 Infinity */
  const slidUntil = useRef(0);
  // 콜백은 마운트 때 한 번만 건다 — 바뀔 때마다 씬을 다시 만들지 않게. 캐릭터는 바뀌면 key 로 새로 뜬다
  const cb = useRef({ onLoop, onStatus });
  cb.current = { onLoop, onStatus };
  const first = useRef(character);

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

    lp.load(first.current)
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
   *  · 글로벌 사이드바를 여닫아 창문 가운데만 옮겨 감 → 캔버스 · 카메라 · 바닥은 건드리지 않는다.
   *    창문만 움직이고, 움직임이 끝나고(sliding) HOME_SETTLE_MS 뒤에 캐릭터만 새 가운데로 걸어(뛰어) 온다.
   *  · 그 밖에 칸 폭만 바뀜(스크롤바가 생기고 없어짐) → 캐릭터는 그대로 둔다
   *  · 캐릭터가 아직 안 보이면 위와 상관없이 바로 맞춘다(framingStep) — 들어오자마자 창문 가운데에 서 있게
   *
   * 끝난 뒤 조금 더 사이드바 몫으로 치는 이유: 프레임이 느리면 칸이 다 줄어들기 전에 sliding 이 끝나서,
   * 칸의 마지막 폭이 그 뒤에 도착한다.
   */
  useEffect(() => {
    const lp = loop.current;
    if (!lp) return;
    lp.setVisibleWidth(L.viewWidth);
    if (sliding) slidUntil.current = Infinity;
    else if (slidUntil.current === Infinity) slidUntil.current = performance.now() + HOME_SETTLE_MS;
    const fromSidebar = performance.now() < slidUntil.current;

    const f = framingFor(L);
    const step = framingStep(applied.current, f, sliding, fromSidebar, ready);
    if (step === 'none') {
      // 사이드바와 상관없는 변화는 기다리던 이동을 끊지 않는다
      if (fromSidebar) window.clearTimeout(settle.current);
      return;
    }
    window.clearTimeout(settle.current);
    if (step === 'home') {
      settle.current = window.setTimeout(() => {
        applied.current = f;
        lp.moveHome(f.centerX);
      }, HOME_SETTLE_MS);
      return;
    }
    applied.current = f;
    lp.setFraming(f);
  }, [L, sliding, ready]);

  return (
    <canvas
      ref={canvas}
      aria-label="종목 캐릭터"
      className="pointer-events-none absolute left-0 top-0"
      style={{ width: L.canvasWidth, height: L.stageHeight, opacity: ready ? 1 : 0, transition: 'opacity 0.4s' }}
    />
  );
}
