import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EMOTION_COLOR, motionText, WAITING_COLOR } from '../runtime/devLabels';
import type { RoomLoop } from '../runtime/RoomLoop';
import { stackLabels } from './labelStack';

/** 머리 위 자리에서 이만큼(px) 띄운다 */
const HEAD_GAP = 6;
/** 쌓여 올라간 높이를 따라가는 빠르기(초) — 겹침이 풀리거나 생길 때 툭 튀지 않게 */
const SMOOTH_S = 0.1;

/**
 * 개발 모드(`?debug=motion`, 지시서 1-3) — 캐릭터 머리 위 글자 두 줄. 실제 서비스엔 안 나간다.
 *   윗줄  지금 단계의 모션 이름(한글, behavior 포함) · 단계 번호 · 남은 시간(motionText). 모션이 없으면 비움
 *   아랫줄 지금 감정(엔진 이름 그대로) — 감정마다 배경색. 감정을 아직 모르면 "감정 대기"(1-5)
 * 캐릭터가 걸어 다니니 매 프레임 자리를 다시 묻는다(3D · 평면 더미 둘 다 renderer.screenOf 기준).
 * 글자끼리 겹치면 위로 쌓고(stackLabels), 올라간 높이만 부드럽게 따라간다 — 가로는 캐릭터를 바로 따라간다.
 * 스탯 링이 열린 캐릭터는 RoomLoop 이 목록에서 뺀다
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

  const els = useRef(new Map<string, HTMLDivElement>());
  /** 지금 화면에 보이는 올라간 높이(px) — 목표(쌓기 결과)를 부드럽게 따라간다 */
  const shown = useRef(new Map<string, number>());
  const order = useRef<string[]>([]);
  const last = useRef(0);

  const labels = loop.debugLabels();

  // 그린 뒤 · 보이기 전에 글자 크기를 재고 자리를 정한다
  useLayoutEffect(() => {
    const now = performance.now();
    const dt = last.current ? Math.min(0.1, (now - last.current) / 1000) : 0;
    last.current = now;
    const k = 1 - Math.exp(-dt / SMOOTH_S);
    const boxes = labels.flatMap((l) => {
      const el = els.current.get(l.id);
      return el ? [{ id: l.id, x: l.at.x, y: l.at.y - HEAD_GAP, w: el.offsetWidth, h: el.offsetHeight, el }] : [];
    });
    const stacked = stackLabels(boxes, order.current);
    order.current = stacked.order;
    const seen = new Set<string>();
    for (const b of boxes) {
      const target = stacked.lift.get(b.id) ?? 0;
      const prev = shown.current.get(b.id);
      const cur = prev === undefined ? target : prev + (target - prev) * k; // 처음 보이는 글자는 바로 제자리
      shown.current.set(b.id, cur);
      seen.add(b.id);
      b.el.style.transform = `translate(${b.x - b.w / 2}px, ${b.y - b.h - cur}px)`;
    }
    for (const id of shown.current.keys()) if (!seen.has(id)) shown.current.delete(id);
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
      {labels.map((l) => {
        const tone = l.emotion ? (EMOTION_COLOR[l.emotion] ?? WAITING_COLOR) : WAITING_COLOR;
        const emotion = l.emotion ?? (l.waiting ? '감정 대기' : '감정 모름');
        return (
          <div
            key={l.id}
            ref={(el) => {
              if (el) els.current.set(l.id, el);
              else els.current.delete(l.id);
            }}
            style={{
              position: 'absolute', left: 0, top: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700, lineHeight: 1.25,
            }}
          >
            {l.motion && (
              <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(20,20,24,0.88)', color: '#F4F4EF', border: '1px solid rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums' }}>
                {motionText(l.motion)}
              </span>
            )}
            <span style={{ padding: '1px 6px', borderRadius: 4, background: tone.bg, color: tone.fg }}>{emotion}</span>
          </div>
        );
      })}
    </div>
  );
}
