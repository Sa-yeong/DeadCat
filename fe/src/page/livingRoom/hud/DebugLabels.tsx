import { useEffect, useState } from 'react';
import { EMOTION_COLOR, motionLabel, WAITING_COLOR } from '../runtime/devLabels';
import type { RoomLoop } from '../runtime/RoomLoop';

/**
 * 개발 모드(`?debug=motion`, 지시서 1-3) — 캐릭터 머리 위 글자 두 줄. 실제 서비스엔 안 나간다.
 *   윗줄  지금 단계의 모션 이름(한글, behavior 포함). 모션이 없으면 비움
 *   아랫줄 지금 감정(엔진 이름 그대로) — 감정마다 배경색. 감정을 아직 모르면 "감정 대기"(1-5)
 * 캐릭터가 걸어 다니니 매 프레임 자리를 다시 묻는다(3D · 평면 더미 둘 다 renderer.screenOf 기준)
 */
export function DebugLabels({ loop }: { loop: RoomLoop }) {
  const [, setFrame] = useState(0);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setFrame((n) => n + 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
      {loop.debugLabels().map((l) => {
        const tone = l.emotion ? (EMOTION_COLOR[l.emotion] ?? WAITING_COLOR) : WAITING_COLOR;
        const emotion = l.emotion ?? (l.waiting ? '감정 대기' : '감정 모름');
        return (
          <div
            key={l.id}
            style={{
              position: 'absolute', left: l.at.x, top: l.at.y - 6, transform: 'translate(-50%, -100%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, lineHeight: 1.25,
            }}
          >
            {l.motion && (
              <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(20,20,24,0.88)', color: '#F4F4EF', border: '1px solid rgba(255,255,255,0.2)' }}>
                {motionLabel(l.motion)}
              </span>
            )}
            <span style={{ padding: '1px 6px', borderRadius: 4, background: tone.bg, color: tone.fg }}>{emotion}</span>
          </div>
        );
      })}
    </div>
  );
}
