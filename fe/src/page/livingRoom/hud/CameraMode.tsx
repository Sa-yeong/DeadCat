import { useEffect, useState } from 'react';
import * as api from '../api';
import type { CaptureRect } from '../runtime/RoomRenderer';
import { cameraFrame } from './cameraFrame';
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

/**
 * 카메라 모드 — 틀 밖은 어둡게, 위 [✕ 취소] · 아래 [촬영]. 촬영 → 미리보기 → [다시 찍기] / [썸네일로 설정].
 * 덮개 자체는 포인터를 통과시킨다(휠 줌 · 끌기는 페이지가 받는다). 미리보기 중에는 틀 아래를 막는다
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
  /** 지금 화면의 이 영역을 800×400 으로 */
  capture: (rect: CaptureRect) => Promise<Blob>;
  onCancel: () => void;
  /** 설정 성공 — 안내를 잠깐 보인 뒤 페이지가 카메라 모드를 끝낸다 */
  onSaved: (t: RoomThumbnail) => void;
  onNeedLogin: () => void;
  loginOpen: boolean;
}) {
  const frame = cameraFrame(width, stageHeight);
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
      const blob = await capture(frame);
      setShot({ blob, url: URL.createObjectURL(blob) });
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
      {/* 촬영 틀 — 큰 그림자로 틀 밖을 어둡게 */}
      <div style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', outline: '1px solid rgba(255,255,255,0.7)' }}>
        {shot && <img src={shot.url} alt="찍은 거실 사진" style={{ width: '100%', height: '100%', display: 'block' }} />}
      </div>

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
