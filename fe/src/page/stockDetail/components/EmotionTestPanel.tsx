import { useEffect, useRef, useState } from 'react';
import { simulateEmotion, type EmotionSimulateInput, type UserAction } from '../api';
import type { Emotion } from '../runtime/motionTable';
import type { StageChange, StockStageLoop } from '../runtime/StockStageLoop';

/**
 * 감정 테스트 패널 — 개발 환경에서만 뜬다.
 *
 * 실제 데이터 대신 상황(장중 여부·보유·수익률·등락률·최근 흐름)을 직접 넣어 **실제 엔진**
 * (POST /characters/emotion/simulate) 결과를 캐릭터에 바로 넣는다. 로그인 더미 데이터나
 * 장 시간 없이도 아무 상황을 볼 수 있다.
 *  · 상황 버튼 — 차례로 누르면 A → B 전환이 보인다
 *  · 값 끌기 — 슬라이더를 끄는 동안 계속 엔진을 불러, 어느 값에서 감정이 넘어가는지 보인다
 *  · 매수·매도 반응 — 지금 상황에서 주문이 성공했을 때의 반응
 *
 * 패널이 열려 있는 동안은 실시간 감정을 받지 않는다(페이지가 onActive 로 멈춘다).
 */

type Input = Required<Omit<EmotionSimulateInput, 'interaction'>>;

const BASE: Input = {
  isOperatingTime: true,
  holding: false,
  userProfitRate: 0,
  holdingPeriodDays: 0,
  fluctuationRate: 0,
  volatility: 0,
  momentum: 0,
  loss: 0,
};

const PRESETS: { label: string; input: Partial<Input> }[] = [
  { label: '장외', input: { isOperatingTime: false } },
  { label: '평온', input: {} },
  { label: '수익 +15%', input: { holding: true, userProfitRate: 15, holdingPeriodDays: 30 } },
  { label: '손실 -15%', input: { holding: true, userProfitRate: -15, holdingPeriodDays: 30 } },
  { label: '장기보유 120일', input: { holding: true, holdingPeriodDays: 120 } },
  { label: '급등 +7%', input: { fluctuationRate: 7 } },
  { label: '급락 -7%', input: { fluctuationRate: -7 } },
  { label: '변동성 큼', input: { volatility: 0.8 } },
  { label: '하락 지속', input: { momentum: -0.7, loss: 0.7 } },
  { label: '상승 모멘텀', input: { momentum: 0.7 } },
];

/** 슬라이더 — 힌트는 지금 엔진(emotion.engine.ts)의 기준값. 엔진이 바뀌면 같이 고칠 것 */
const SLIDERS: { key: keyof Input; label: string; min: number; max: number; step: number; hint: string; holding?: boolean }[] = [
  { key: 'fluctuationRate', label: '오늘 등락률 %', min: -10, max: 10, step: 0.1, hint: '±5 넘으면 광기' },
  { key: 'userProfitRate', label: '내 수익률 %', min: -30, max: 30, step: 0.5, hint: '+10 happy · -10 sad', holding: true },
  { key: 'holdingPeriodDays', label: '보유 기간 일', min: 0, max: 365, step: 1, hint: '90일부터 tired', holding: true },
  { key: 'volatility', label: '변동성', min: 0, max: 1, step: 0.01, hint: '0.7부터 anxious' },
  { key: 'momentum', label: '모멘텀', min: -1, max: 1, step: 0.01, hint: '+0.5 광기 · -0.5 하락' },
  { key: 'loss', label: '하락 지속', min: 0, max: 1, step: 0.01, hint: '0.5 + 모멘텀 -0.5 → depression' },
];

export function EmotionTestPanel({
  getLoop,
  onActive,
}: {
  getLoop: () => StockStageLoop | null;
  onActive: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<Input>(BASE);
  const [result, setResult] = useState<Emotion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [change, setChange] = useState<StageChange | null>(null);
  const [sleep, setSleep] = useState<StockStageLoop['sleep']>(null);
  const [now, setNow] = useState(() => performance.now());
  const seq = useRef(0);

  useEffect(() => onActive(open), [open, onActive]);

  /** 엔진을 부르고 캐릭터에 넣는다. 늦게 온 옛 응답은 버린다 */
  const run = (inp: Input, interaction?: UserAction) => {
    const my = ++seq.current;
    simulateEmotion({ ...inp, ...(interaction ? { interaction: { type: interaction } } : {}) })
      .then((r) => {
        if (my !== seq.current) return;
        setError(null);
        setResult(r.emotions);
        getLoop()?.setEmotions(r.emotions);
      })
      .catch((e: unknown) => {
        if (my !== seq.current) return;
        const status = (e as { response?: { status?: number } })?.response?.status;
        setError(status === 404 ? '서버에서 테스트 API 가 꺼져 있다(배포 모드)' : '엔진을 부르지 못했다 — 백엔드가 켜져 있나?');
      });
  };

  // 값이 바뀌면 잠깐 기다렸다 부른다 — 끄는 동안 너무 자주 부르지 않게
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => run(input), 80);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, open]);

  // 마지막 전환 — 런타임이 적어 둔 것을 읽어 온다
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setChange(getLoop()?.lastChange ?? null);
      setSleep(getLoop()?.sleep ?? null);
      setNow(performance.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [open, getLoop]);

  const set = <K extends keyof Input>(k: K, v: Input[K]) => setInput((p) => ({ ...p, [k]: v }));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...S.fab }}>
        감정 테스트
      </button>
    );
  }

  return (
    <div style={S.panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>감정 테스트</b>
        <span style={{ color: '#97978E' }}>실시간 감정 멈춤</span>
        <button type="button" onClick={() => setOpen(false)} style={S.btn(false)}>
          닫기
        </button>
      </div>

      <div style={S.section}>상황</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              getLoop()?.sleepAgain(); // 장외를 다시 고르면 다시 자는 것부터
              setInput({ ...BASE, ...p.input });
            }}
            style={S.btn(false)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={S.section}>값</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        <label>
          <input type="checkbox" checked={input.isOperatingTime} onChange={(e) => set('isOperatingTime', e.target.checked)} /> 장중
        </label>
        <label>
          <input type="checkbox" checked={input.holding} onChange={(e) => set('holding', e.target.checked)} /> 보유 중
        </label>
      </div>
      {SLIDERS.map((s) => {
        const off = s.holding && !input.holding;
        const v = input[s.key] as number;
        return (
          <div key={s.key} style={{ opacity: off ? 0.35 : 1, marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {s.label} <b>{s.step < 1 ? v.toFixed(s.step < 0.1 ? 2 : 1) : v}</b>
              </span>
              <span style={{ color: '#6E6E68' }}>{s.hint}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={v}
              disabled={off}
              onChange={(e) => set(s.key, Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        );
      })}

      <div style={S.section}>주문 반응</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" onClick={() => run(input, 'BUY')} style={S.btn(false)}>
          매수 성공
        </button>
        <button type="button" onClick={() => run(input, 'SELL')} style={S.btn(false)}>
          매도 성공
        </button>
      </div>

      <div style={S.section}>엔진 결과</div>
      {error ? (
        <div style={{ color: '#FF6B6B' }}>{error}</div>
      ) : result && result.length ? (
        result.map((e, i) => (
          <div key={i}>
            {e.emotion} · {e.motion} · {e.weight.toFixed(2)} {e.duration === null ? '(유지)' : '(한 번)'}
          </div>
        ))
      ) : (
        <div style={{ color: '#97978E' }}>{result ? '감정 없음 — 무표정 idle' : '…'}</div>
      )}

      {sleep && (
        <div style={{ marginTop: 6, color: '#C9B8FF' }}>
          장외 잠 —{' '}
          {sleep === 'asleep' ? '자는 중 (카메라를 움직여도 제자리, 눌러서 깨우기)' : sleep === 'waking' ? '깨는 중' : '깨어 있음 (탭을 가리면 다시 잠)'}
        </div>
      )}

      <div style={S.section}>마지막 전환</div>
      {change ? (
        <div>
          {change.kind === 'hold' ? '유지' : '반응'} · {change.from ?? '없음'} → {change.to} ({change.emotion})
          <br />
          <span style={{ color: '#97978E' }}>
            {change.from === change.to ? '모션 그대로, 표정만' : `섞는 시간 ${change.fade.toFixed(1)}초`} ·{' '}
            {((now - change.at) / 1000).toFixed(1)}초 전
          </span>
        </div>
      ) : (
        <div style={{ color: '#97978E' }}>아직 없음</div>
      )}
    </div>
  );
}

const S = {
  fab: {
    position: 'fixed',
    left: 12,
    bottom: 12,
    zIndex: 9999,
    padding: '6px 10px',
    fontSize: 12,
    color: '#EDEDEA',
    background: '#3A2F5C',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 6,
    cursor: 'pointer',
  } as const,
  panel: {
    position: 'fixed',
    left: 12,
    bottom: 12,
    zIndex: 9999,
    width: 300,
    maxHeight: 'calc(100vh - 24px)',
    overflowY: 'auto',
    padding: 12,
    fontSize: 11.5,
    lineHeight: 1.45,
    color: '#EDEDEA',
    background: 'rgba(28,28,30,0.96)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  } as const,
  section: { margin: '10px 0 4px', color: '#97978E', fontSize: 11 } as const,
  btn: (on: boolean) =>
    ({
      padding: '3px 7px',
      fontSize: 11.5,
      color: '#EDEDEA',
      background: on ? '#4A4A55' : '#2C2C31',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 5,
      cursor: 'pointer',
    }) as const,
};
