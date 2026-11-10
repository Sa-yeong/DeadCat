import { useEffect, useState } from 'react';
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

/**
 * 카메라 모드 — 화면 전체가 촬영 범위(뷰파인더 선만), 위 [✕ 취소] · 아래 [촬영]. 촬영 → 미리보기 → [다시 찍기] / [썸네일로 설정].
 * 덮개 자체는 포인터를 통과시킨다(휠 줌 · 끌기는 페이지가 받는다). 미리보기는 찍은 원본을 화면 전체에 깔고 아래를 막는다
 */
export function CameraMode({
  stageHeight,
  capture,
  onCancel,
  onSaved,
  onNeedLogin,
  loginOpen,
}: {
  stageHeight: number;
  /** 지금 화면 전체 — 미리보기(원본)와 올릴 파일 */
  capture: () => Promise<{ preview: Blob; upload: Blob }>;
  onCancel: () => void;
  /** 설정 성공 — 안내를 잠깐 보인 뒤 페이지가 카메라 모드를 끝낸다 */
  onSaved: (t: RoomThumbnail) => void;
  onNeedLogin: () => void;
  loginOpen: boolean;
}) {
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  useEscape(loginOpen ? null : onCancel);

  const take = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const { preview, upload } = await capture();
      setShot({ blob: upload, url: URL.createObjectURL(preview) });
    } catch (e) {
      console.warn('[거실 썸네일] 촬영 실패', e);
      setMessage('사진을 찍지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!shot || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.uploadRoomThumbnail(shot.blob, false);
      setDone(true);
      window.setTimeout(() => onSaved(r.thumbnail), DONE_MS);
    } catch (e) {
      if (e instanceof api.AuthRequiredError) onNeedLogin();
      setMessage(e instanceof api.AuthRequiredError ? '로그인이 필요해요' : '썸네일을 설정하지 못했어요');
      setBusy(false);
    }
  };

  const bottom = stageHeight - 64;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: shot ? 'auto' : 'none' }}>
      {shot ? (
        // 찍은 그대로(화면 해상도) — 화면과 같은 크기 · 비율이라 늘리거나 줄이지 않는다
        <img src={shot.url} alt="찍은 거실 사진" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      ) : (
        <Viewfinder />
      )}

      <div style={{ position: 'absolute', left: 0, right: 0, top: 20, display: 'flex', justifyContent: 'center' }}>
        <button type="button" onClick={onCancel} style={{ ...solidBtn, height: 34, pointerEvents: 'auto' }}>
          <Icon name="close" />취소
        </button>
      </div>

      {message && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: bottom - 40, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ padding: '4px 10px', borderRadius: 6, background: C.glass, border: '1px solid rgba(255,255,255,0.14)', fontSize: 12, fontWeight: 700 }}>{message}</span>
        </div>
      )}

      <div style={{ position: 'absolute', left: 0, right: 0, top: bottom, display: 'flex', justifyContent: 'center', gap: 8 }}>
        {done ? (
          <span style={{ height: 38, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: 8, background: C.glass, border: '1px solid rgba(255,255,255,0.14)', fontSize: 13, fontWeight: 700 }}>
            거실 썸네일을 설정했어요
          </span>
        ) : shot ? (
          <>
            <button type="button" disabled={busy} onClick={() => { setShot(null); setMessage(null); }} style={{ ...solidBtn, height: 38, pointerEvents: 'auto' }}>
              다시 찍기
            </button>
            <button type="button" disabled={busy} onClick={() => void save()} style={{ ...accentBtn, height: 38, pointerEvents: 'auto', opacity: busy ? 0.6 : 1 }}>
              썸네일로 설정
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => void take()} style={{ ...accentBtn, height: 38, pointerEvents: 'auto' }}>
            <Icon name="camera" />촬영
          </button>
        )}
      </div>
    </div>
  );
}
