import { useState } from 'react';
import { C, floatBar, solidBtn } from './style';

/**
 * 데모 트리거 버튼(졸프 데모 영상) — 연출 거실(demo1)에서만 보인다(runtime/roomDemo.ts).
 * 누르면 준비만 — 그다음 엔비디아를 들어 네이버 옆에 놓으면 놀리기(쿨다운 무시 한 번). 둘 중 하나가 거실에 없으면 안내만
 */
/** bottomAt — 버튼 묶음의 아래 끝(무대 위에서 px). 그 위로 쌓는다 */
export function DemoMeetButton({ right, bottomAt, onArm }: { right: number; bottomAt: number; onArm: () => boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const click = () => {
    const ok = onArm();
    setNote(ok ? '준비됨 — 엔비디아를 들어 네이버 옆에 놓으세요' : '엔비디아 · 네이버가 둘 다 거실에 있어야 해요');
    window.setTimeout(() => setNote(null), 3500);
  };
  return (
    <div style={{ position: 'absolute', right, top: bottomAt, transform: 'translateY(-100%)', zIndex: 5, display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-end', gap: 6, transition: 'right 0.35s ease' }}>
      <div style={{ ...floatBar, padding: 4 }}>
        <button type="button" onClick={click} style={{ ...solidBtn, height: 32 }}>
          놀리기 준비 (엔비디아 → 네이버)
        </button>
      </div>
      {note && <span style={{ fontSize: 12, color: C.text, background: C.panel, padding: '4px 8px', borderRadius: 6 }}>{note}</span>}
    </div>
  );
}
