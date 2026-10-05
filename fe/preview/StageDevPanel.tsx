import { useEffect, useState } from 'react';
import type { Emotion, MotionName } from '../src/page/stockDetail/runtime/motionTable';
import type { StockStageLoop } from '../src/page/stockDetail/runtime/StockStageLoop';

/**
 * 미리보기 전용 — 감정 API 없이 캐릭터 동작을 눌러 보는 패널.
 * 앱에는 들어가지 않는다(preview/ 폴더에만 있다).
 */
const HOLD: { label: string; e: Emotion }[] = [
  { label: '기본', e: { emotion: 'happy', motion: 'idle', weight: 0, duration: null } },
  { label: 'happy', e: { emotion: 'happy', motion: 'idle', weight: 0.7, duration: null } },
  { label: 'sad', e: { emotion: 'sad', motion: 'idle', weight: 0.7, duration: null } },
  { label: 'euphoria', e: { emotion: 'euphoria', motion: 'idle', weight: 0.9, duration: null } },
  { label: 'panic', e: { emotion: 'panic', motion: 'idle', weight: 0.9, duration: null } },
  { label: 'tired', e: { emotion: 'tired', motion: 'tired', weight: 0.4, duration: null } },
  { label: 'depression', e: { emotion: 'depression', motion: 'depression', weight: 0.8, duration: null } },
  { label: 'anxious', e: { emotion: 'anxious', motion: 'anxious', weight: 0.7, duration: null } },
  { label: 'sleepy', e: { emotion: 'sleepy', motion: 'sleep', weight: 0.3, duration: null } },
];
const ONCE: MotionName[] = ['surprise', 'upset', 'annoying', 'relief'];

const loop = () => (window as unknown as { __dcStage?: StockStageLoop | null }).__dcStage ?? null;

export function StageDevPanel() {
  const [hold, setHold] = useState('기본');
  const [open, setOpen] = useState(true);
  // 차트 슬라이드 연동 확인용 — 지금 걷는 중/달리는 중
  const [moving, setMoving] = useState<string>('—');
  useEffect(() => {
    const t = window.setInterval(() => {
      const m = loop()?.returning ?? null;
      setMoving(m === 'run' ? '달리기' : m === 'walk' ? '걷기' : '—');
    }, 100);
    return () => window.clearInterval(t);
  }, []);
  const btn = (on: boolean): React.CSSProperties => ({
    height: 24, padding: '0 8px', margin: '0 4px 4px 0', borderRadius: 3, cursor: 'pointer', fontSize: 11,
    border: '1px solid rgba(255,255,255,0.22)', background: on ? '#F2564C' : '#26262B', color: '#EDEDEA',
  });
  return (
    <div
      style={{
        position: 'fixed', right: 12, bottom: 12, zIndex: 50, width: open ? 300 : 'auto', padding: 10,
        background: 'rgba(20,20,22,0.94)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4,
        color: '#C6C6BE', fontSize: 11, fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? 6 : 0 }}>
        <b style={{ color: '#EDEDEA' }}>감정 테스트 (미리보기 전용)</b>
        <button type="button" style={btn(false)} onClick={() => setOpen(!open)}>{open ? '접기' : '펼치기'}</button>
      </div>
      {open && (
        <>
          <div style={{ marginBottom: 4 }}>유지 감정</div>
          <div>
            {HOLD.map((h) => (
              <button key={h.label} type="button" style={btn(hold === h.label)} onClick={() => { setHold(h.label); loop()?.setEmotions([h.e]); }}>
                {h.label}
              </button>
            ))}
          </div>
          <div style={{ margin: '6px 0 4px' }}>한 번 모션 (끝나면 유지 감정으로 복귀)</div>
          <div>
            {ONCE.map((m) => {
              const cur = HOLD.find((h) => h.label === hold)!.e;
              return (
                <button key={m} type="button" style={btn(false)}
                  onClick={() => loop()?.setEmotions([cur, { emotion: cur.emotion, motion: m, weight: 1, duration: 400 }])}>
                  {m}
                </button>
              );
            })}
          </div>
          <div style={{ margin: '6px 0 0' }}>
            돌아오기: <b style={{ color: moving === '—' ? '#8A8A82' : '#F2564C' }}>{moving}</b>
            <span style={{ color: '#8A8A82' }}> (차트를 좌우로 끌었다 놓으면)</span>
          </div>
          <div style={{ marginTop: 6, color: '#8A8A82' }}>
            차트 탭에서 캐릭터를 누르면 클릭 반응 — anxious·sleepy 만 반응이 있다(백엔드 표와 같음). 1.5초 안에 3번 이상은 연타.
          </div>
        </>
      )}
    </div>
  );
}
