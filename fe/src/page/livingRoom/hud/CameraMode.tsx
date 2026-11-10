import { useEffect, useRef, useState } from 'react';
import { encodeThumb, UPLOAD_MAX_W } from '../runtime/thumbImage';
import * as api from '../api';
import type { RoomThumbnail } from '../types';
import { C, accentBtn, floatBar, solidBtn } from './style';
import { Icon } from './ui';
import { useEscape } from './useEscape';

/**
 * 거실 썸네일 — 카메라 버튼(내 거실 좌하단)과 카메라 모드 덮개.
 * 카메라 모드에선 페이지가 다른 HUD 를 전부 숨기고 캐릭터 · 가구 상호작용을 막는다. 여기는 촬영 틀 · 버튼 · 미리보기만.
 * 이 덮개는 DOM 이라 사진(WebGL 캔버스)에는 찍히지 않는다.
 */

const DONE_MS = 1200;

/** 내 거실 HUD 좌하단 — 호버 시 「거실 썸네일 설정」 */
export function CameraButton({ top, onClick }: { top: number; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: 'absolute', left: 12, top, zIndex: 5 }}>
      {hover && (
        <span role="tooltip" style={{ position: 'absolute', left: 0, bottom: 46, padding: '4px 9px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.14)', background: C.glass, color: C.text, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          거실 썸네일 설정
        </span>
      )}
      <button
        type="button"
        aria-label="거실 썸네일 설정"
        onClick={onClick}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        style={{ ...floatBar, width: 40, height: 40, padding: 0, justifyContent: 'center', color: C.text2, cursor: 'pointer' }}
      >
        <Icon name="camera" size={17} />
      </button>
    </div>
  );
}

/** 뷰파인더 선 — 네 모서리 ㄱ자 · 가운데 초점 모서리 · ＋ */
const VF_LINE = 'rgba(255,255,255,0.85)';
const VF_W = 2;
/** 화면 모서리 ㄱ자 — 화면 끝에서 띄운 거리 · 팔 길이 */
const VF_INSET = 20;
const VF_ARM = 28;
/** 가운데 초점 상자(모서리만) 크기 · 팔 길이, ＋ 크기 */
const VF_FOCUS = 64;
const VF_FOCUS_ARM = 12;
const VF_CROSS = 14;

type Corner = 'tl' | 'tr' | 'bl' | 'br';
/** ㄱ자 하나 — 상자의 그 모서리 쪽 두 변만 그린다 */
function cornerStyle(c: Corner, arm: number): React.CSSProperties {
  const b = `${VF_W}px solid ${VF_LINE}`;
  return {
    position: 'absolute',
    width: arm,
    height: arm,
    ...(c[0] === 't' ? { top: 0, borderTop: b } : { bottom: 0, borderBottom: b }),
    ...(c[1] === 'l' ? { left: 0, borderLeft: b } : { right: 0, borderRight: b }),
  };
}
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

/** 촬영 범위(화면 전체)를 보여 주는 뷰파인더 — 선만, 포인터는 통과 */
function Viewfinder() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: VF_INSET }}>
        {CORNERS.map((c) => <div key={c} style={cornerStyle(c, VF_ARM)} />)}
      </div>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: VF_FOCUS, height: VF_FOCUS, transform: 'translate(-50%, -50%)' }}>
        {CORNERS.map((c) => <div key={c} style={cornerStyle(c, VF_FOCUS_ARM)} />)}
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: VF_CROSS, height: VF_W, background: VF_LINE, transform: 'translate(-50%, -50%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: VF_W, height: VF_CROSS, background: VF_LINE, transform: 'translate(-50%, -50%)' }} />
      </div>
    </div>
  );
}

/** 「사진 출력 중...」을 적어도 이만큼은 보인다 — 바로 끝나도 찍혔다는 느낌이 들게 */
const PRINT_MIN_MS = 700;
/** 미리보기 박스 — 무대 가로의 이 비율(최소 · 최대 px), 좌하단에서 띄운 거리 */
const BOX_RATIO = 0.34;
const BOX_MIN = 240;
const BOX_MAX = 440;
const BOX_GAP = 16;

/** 찍은 캔버스를 그대로 붙인다 — 파일로 바꾸지 않아 바로 보이고, 화면 해상도 그대로라 흐려지지 않는다 */
function ShotCanvas({ canvas }: { canvas: HTMLCanvasElement }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    el.appendChild(canvas);
    return () => {
      canvas.remove();
    };
  }, [canvas]);
  return <div ref={host} role="img" aria-label="찍은 거실 사진" style={{ position: 'absolute', inset: 0 }} />;
}

type Shot = { canvas: HTMLCanvasElement; upload: Promise<Blob>; ready: boolean };

/**
 * 카메라 모드 — 화면 전체가 촬영 범위(뷰파인더 선만), 위 [✕ 취소] · 아래 [촬영].
 * 촬영하면 좌하단에 작은 미리보기 박스(「사진 출력 중...」 → 사진, [다시 찍기] / [썸네일로 설정], 우상단 ✕).
 * 뒤 거실은 그대로 움직인다. 덮개는 포인터를 통과시키고(휠 줌 · 끌기는 페이지가 받는다) 버튼 · 박스만 받는다
 */
export function CameraMode({
  width,
  stageHeight,
  capture,
  onCancel,
  onSaved,
  onNeedLogin,
  loginOpen,
}: {
  width: number;
  stageHeight: number;
  /** 지금 화면 전체를 화면 해상도로 찍은 캔버스 */
  capture: () => HTMLCanvasElement;
  onCancel: () => void;
  /** 설정 성공 — 안내를 잠깐 보인 뒤 페이지가 카메라 모드를 끝낸다 */
  onSaved: (t: RoomThumbnail) => void;
  onNeedLogin: () => void;
  loginOpen: boolean;
}) {
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEscape(loginOpen ? null : onCancel);

  const take = () => {
    if (busy || shot) return;
    setMessage(null);
    let canvas: HTMLCanvasElement;
    try {
      canvas = capture(); // 누른 그 순간 화면
    } catch (e) {
      console.warn('[거실 썸네일] 촬영 실패', e);
      setMessage('사진을 찍지 못했어요');
      return;
    }
    // 올릴 파일은 뒤에서 만든다 — 다 될 때까지(적어도 PRINT_MIN_MS) 「사진 출력 중...」
    const upload = encodeThumb(canvas, UPLOAD_MAX_W);
    setShot({ canvas, upload, ready: false });
    Promise.all([upload, new Promise((ok) => window.setTimeout(ok, PRINT_MIN_MS))]).then(
      () => setShot((s) => (s && s.canvas === canvas ? { ...s, ready: true } : s)),
      (e) => {
        console.warn('[거실 썸네일] 사진 만들기 실패', e);
        setShot((s) => (s && s.canvas === canvas ? null : s));
        setMessage('사진을 찍지 못했어요');
      },
    );
  };

  /** 박스 닫기 · 다시 찍기 — 뷰파인더로 돌아간다 */
  const discard = () => {
    if (busy) return;
    setShot(null);
    setMessage(null);
  };

  const save = async () => {
    if (!shot?.ready || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.uploadRoomThumbnail(await shot.upload, false);
      setDone(true);
      window.setTimeout(() => onSaved(r.thumbnail), DONE_MS);
    } catch (e) {
      if (e instanceof api.AuthRequiredError) onNeedLogin();
      setMessage(e instanceof api.AuthRequiredError ? '로그인이 필요해요' : '썸네일을 설정하지 못했어요');
      setBusy(false);
    }
  };

  const boxW = Math.round(Math.max(BOX_MIN, Math.min(BOX_MAX, width * BOX_RATIO)));
  const imgH = Math.round((boxW * stageHeight) / Math.max(1, width));
  const note: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, background: C.glass, border: '1px solid rgba(255,255,255,0.14)', fontSize: 12, fontWeight: 700 };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none' }}>
      {!shot && <Viewfinder />}

      <div style={{ position: 'absolute', left: 0, right: 0, top: 20, display: 'flex', justifyContent: 'center' }}>
        <button type="button" onClick={onCancel} style={{ ...solidBtn, height: 34, pointerEvents: 'auto' }}>
          <Icon name="close" />취소
        </button>
      </div>

      {shot ? (
        // 미리보기 박스 — 좌하단
        <div style={{ position: 'absolute', left: BOX_GAP, bottom: BOX_GAP, width: boxW, padding: 8, borderRadius: 10, background: C.glass, border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)', pointerEvents: 'auto' }}>
          <div style={{ position: 'relative', width: '100%', height: imgH, borderRadius: 6, overflow: 'hidden', background: '#19191C' }}>
            {shot.ready ? (
              <ShotCanvas canvas={shot.canvas} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text2, fontSize: 13, fontWeight: 700 }}>
                사진 출력 중...
              </div>
            )}
            <button
              type="button"
              aria-label="미리보기 닫기"
              disabled={busy}
              onClick={discard}
              style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(255,255,255,0.14)', background: C.glass, color: C.text, cursor: 'pointer' }}
            >
              <Icon name="close" />
            </button>
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minHeight: 34 }}>
            {done ? (
              <span style={{ ...note, fontSize: 13 }}>거실 썸네일을 설정했어요</span>
            ) : (
              <>
                {message && <span style={{ ...note, marginRight: 'auto' }}>{message}</span>}
                <button type="button" disabled={busy} onClick={discard} style={{ ...solidBtn, height: 34 }}>
                  다시 찍기
                </button>
                <button type="button" disabled={busy || !shot.ready} onClick={() => void save()} style={{ ...accentBtn, height: 34, opacity: busy || !shot.ready ? 0.6 : 1 }}>
                  썸네일로 설정
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {message && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: stageHeight - 104, display: 'flex', justifyContent: 'center' }}>
              <span style={note}>{message}</span>
            </div>
          )}
          <div style={{ position: 'absolute', left: 0, right: 0, top: stageHeight - 64, display: 'flex', justifyContent: 'center' }}>
            <button type="button" onClick={take} style={{ ...accentBtn, height: 38, pointerEvents: 'auto' }}>
              <Icon name="camera" />촬영
            </button>
          </div>
        </>
      )}
    </div>
  );
}
