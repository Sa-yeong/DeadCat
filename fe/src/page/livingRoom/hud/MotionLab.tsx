import { useState } from 'react';
import { EMOTIONS, type Emotion } from '../engine/type/type';
import { motionText } from '../runtime/devLabels';
import type { LabFeed } from '../runtime/LabFeed';
import type { RoomLoop } from '../runtime/RoomLoop';
import { ROOM_MOTIONS } from '../runtime/roomEngine';

/** 미리 묶은 모션 — 단계가 여럿인 것(엔진 규칙과 같은 순서) */
const PRESETS: { label: string; self: string[]; partner?: string[] }[] = [
  { label: '놀리기 (발견 → 웃기) · 상대 지침', self: ['tease_find', 'tease'], partner: ['tired'] },
];

/**
 * 모션 실험 패널(`?lab`, 2026-11-14) — 주가 스트림과 상관없이 원할 때 모션을 본다. 실제 서비스엔 안 나간다.
 *   감정    캐릭터마다 감정을 덮어쓴다(LabFeed) — 이후 엔진 규칙이 이 감정으로 돈다
 *   틀기    엔진을 거치지 않고 바로 — 상대를 고르면 둘이 마주친 것으로(놀리기처럼 둘이 하는 모션은 자리 · 방향을 맞춘다)
 *   만나게  둘을 붙여 세우고 엔진에 마주침을 알린다 — 무엇을 할지는 엔진이 감정 · 규칙 · 확률대로
 */
export function MotionLab({ loop, feed, nameOf }: { loop: RoomLoop; feed: LabFeed; nameOf: (id: string) => string }) {
  const ids = loop.characterIds;
  const clips = ROOM_MOTIONS.clipNames;
  const [, bump] = useState(0);
  const [a, setA] = useState(ids[0] ?? '');
  const [b, setB] = useState(ids[1] ?? '');
  const [motion, setMotion] = useState('preset:0');
  const [withPartner, setWithPartner] = useState(true);

  const play = () => {
    if (motion.startsWith('preset:')) {
      const p = PRESETS[Number(motion.slice(7))];
      loop.labPlay(a, p.self, withPartner && p.partner && b !== a ? { id: b, names: p.partner } : undefined);
    } else loop.labPlay(a, [motion], withPartner && b !== a ? { id: b, names: [] } : undefined);
  };

  const box: React.CSSProperties = {
    position: 'fixed', left: 12, top: 72, zIndex: 60, width: 300, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto', padding: 10,
    display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(20,20,22,0.94)', border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 6, color: '#C6C6BE', fontSize: 11, fontFamily: 'system-ui, sans-serif',
  };
  const sel: React.CSSProperties = { height: 24, background: '#2A2A30', color: '#EDEDEA', border: '1px solid #44444C', borderRadius: 3, fontSize: 11 };
  const btn: React.CSSProperties = { ...sel, padding: '0 10px', cursor: 'pointer' };
  const charSelect = (v: string, set: (s: string) => void) => (
    <select value={v} onChange={(e) => set(e.target.value)} style={{ ...sel, flex: 1 }}>
      {ids.map((id) => (
        <option key={id} value={id}>
          {nameOf(id)}
        </option>
      ))}
    </select>
  );

  return (
    <div style={box}>
      <b style={{ color: '#EDEDEA' }}>모션 실험</b>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: '#9A9A93' }}>감정 덮어쓰기 — 주가와 상관없이 이 감정으로</span>
        {ids.map((id) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(id)}</span>
            <select
              value={feed.forcedOf(id) ?? ''}
              onChange={(e) => {
                feed.force(id, e.target.value as Emotion);
                bump((n) => n + 1);
              }}
              style={sel}
            >
              <option value="" disabled>
                스트림대로
              </option>
              {EMOTIONS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: '#9A9A93' }}>바로 틀기 — 엔진을 거치지 않는다</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>누가</span>
          {charSelect(a, setA)}
        </div>
        <select value={motion} onChange={(e) => setMotion(e.target.value)} style={sel}>
          {PRESETS.map((p, i) => (
            <option key={p.label} value={`preset:${i}`}>
              {p.label}
            </option>
          ))}
          {clips.map((name) => (
            <option key={name} value={name}>
              {motionText({ name, step: 1, of: 1, left: null }).split(' · ')[0]} ({name})
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={withPartner} onChange={(e) => setWithPartner(e.target.checked)} />
          <span>상대</span>
          {charSelect(b, setB)}
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={btn} onClick={play}>
            틀기
          </button>
          <button
            type="button"
            style={btn}
            onClick={() => {
              loop.labStop(a);
              if (withPartner) loop.labStop(b);
            }}
          >
            멈추기
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ color: '#9A9A93' }}>만나게 하기 — 위 두 캐릭터를 붙여 세우고 엔진이 고르게(감정 · 확률대로, 같은 둘은 쿨다운 15초)</span>
        <button type="button" style={btn} onClick={() => loop.labMeet(a, b)}>
          {nameOf(a)} × {nameOf(b)} 만나게
        </button>
      </div>
    </div>
  );
}
