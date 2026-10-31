import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { pct, toneSoft } from '../../stockDetail/format';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import type { CharacterCatalog } from '../runtime/catalogs';
import type { HoldingDto, RoomCharacterDto } from '../types';
import { PanelHeader } from './SidePanel';
import { C, accentBtn, ghostBtn } from './style';
import { Icon } from './ui';

/**
 * 캐릭터 — 오른쪽 창의 한 탭(OWNER 전용, 2026-10-12 아트보드 「캐릭터 탭」 그대로).
 * 거실엔 5명까지만 서니, 이름 붙인 5명 조합(프리셋)을 여럿 두고 골라 세운다.
 *   ① 목록 — 프리셋 카드를 아래로 나열. 카드를 누르면 거실이 그 조합으로(초록 테두리 + '선택'). + 로 새 프리셋
 *   ② 편집 — 위에 5칸(얼굴), 아래에 보유 종목(가나다순 · 수익률순). 누르면 넣고 다시 누르면 뺀다
 * 끌어서 넣고 빼는 방식은 쓰지 않는다 — 캐릭터는 자리가 의미가 없어 끌기가 직관적이지 않다(도휘).
 * 창은 씬을 만지지 않는다 — 바뀐 거실 캐릭터를 onRoom 으로 올려 보내면 조율자(RoomHud)가 런타임에 넘긴다.
 */

const MAX = api.MAX_ROOM_CHARACTERS;
/** 지금 거실에 선 프리셋 — 초록 */
const PICK = { line: '#4CC38A', bg: '#25302B', tagBg: 'rgba(76,195,138,0.16)', tagText: '#8FE0B5' } as const;
/** 편집에서 넣은 종목 줄 */
const ON_LINE = 'rgba(242,86,76,0.55)';
const FONT_NUM = "'Space Grotesk', sans-serif";

type Sort = 'name' | 'rate';
/** null = 목록, 'new' = 새 프리셋, 숫자 = 그 프리셋 편집 */
type Edit = null | 'new' | number;

export function CharacterPanel({
  catalog,
  onRoom,
  onClose,
}: {
  /** 이름·색을 찾는 종목 캐시 — 보유 종목 것까지 여기서 받아 넣는다 */
  catalog: CharacterCatalog;
  /** 거실에 선 캐릭터가 바뀌었다(프리셋을 고르거나, 거실의 프리셋을 고치거나 지웠다) */
  onRoom: (characters: RoomCharacterDto[]) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<api.PresetState | null>(null);
  const [holdings, setHoldings] = useState<HoldingDto[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [draft, setDraft] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('name');
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  /** 프리셋을 빠르게 연달아 누르면 마지막 누름이 이긴다 */
  const pickSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [list, hold] = await Promise.all([api.getPresets(), api.getHoldings()]);
      const codes = [...new Set([...hold.map((h) => h.stockCode), ...list.presets.flatMap((p) => p.stockCodes)])];
      catalog.load(await api.getCharacterDefs(codes));
      if (!alive) return;
      setState(list);
      setHoldings(hold);
    })().catch(() => alive && setFailed('캐릭터 정보를 불러오지 못했어요'));
    return () => {
      alive = false;
    };
  }, [catalog]);

  const presets = state?.presets ?? [];
  // 프리셋 · 보유 목록이 아직 더미라 종목 코드로 찾는다 — S6 에서 stock_id 로 바꾼다
  const nameOf = (code: string) => catalog.byCode(code)?.stockName ?? code;
  const colorOf = (code: string) => catalog.byCode(code)?.color ?? '#6E6E68';

  /** 서버가 돌려준 새 상태를 받는다 — 거실 캐릭터도 같이 맞춘다(안 바뀌었으면 런타임이 그냥 넘긴다) */
  const accept = (next: api.PresetState) => {
    setState(next);
    onRoom(next.characters);
  };

  /* ── ① 목록 ── */

  const pick = (presetId: number) => {
    if (!state || state.activePresetId === presetId) return;
    const prev = state.activePresetId;
    const req = ++pickSeq.current;
    setState({ ...state, activePresetId: presetId }); // 먼저 초록으로 — 거실은 응답을 받고 바뀐다
    setFailed(null);
    api.activatePreset(presetId).then(
      (next) => req === pickSeq.current && accept(next),
      () => {
        if (req !== pickSeq.current) return;
        setState((s) => (s ? { ...s, activePresetId: prev } : s));
        setFailed('거실을 바꾸지 못했어요 — 다시 눌러 주세요');
      },
    );
  };

  const openEdit = (e: Exclude<Edit, null>) => {
    const p = typeof e === 'number' ? presets.find((x) => x.presetId === e) : undefined;
    setEdit(e);
    setDraft(p ? [...p.stockCodes] : []);
    setNameDraft(p ? p.name : `프리셋 ${presets.length + 1}`);
    setEditError(null);
  };

  /* ── ② 편집 ── */

  const full = draft.length >= MAX;
  const toggle = (code: string) => setDraft((d) => (d.includes(code) ? d.filter((x) => x !== code) : d.length >= MAX ? d : [...d, code]));

  const run = async (call: () => Promise<api.PresetState>) => {
    if (busy) return;
    setBusy(true);
    setEditError(null);
    const next = await call().catch((e: unknown) => {
      setEditError(e instanceof Error ? e.message : '저장하지 못했어요');
      return null;
    });
    setBusy(false);
    if (!next) return;
    accept(next);
    setEdit(null);
  };
  const save = () => {
    const name = nameDraft.trim() || `프리셋 ${presets.length + 1}`;
    void run(() => (edit === 'new' ? api.createPreset(name, draft) : api.updatePreset(edit as number, name, draft)));
  };
  const remove = () => typeof edit === 'number' && void run(() => api.deletePreset(edit));

  const sorted = [...(holdings ?? [])].sort((a, b) => (sort === 'rate' ? b.returnRate - a.returnRate : nameOf(a.stockCode).localeCompare(nameOf(b.stockCode), 'ko')));

  if (edit !== null) {
    return (
      <>
        <div style={{ minHeight: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${C.lineSoft}` }}>
          <button type="button" onClick={() => setEdit(null)} aria-label="프리셋 목록으로" style={iconBtn}>
            <Icon name="left" size={14} />
          </button>
          <h2 style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.04em' }}>{edit === 'new' ? '새 프리셋' : '프리셋 편집'}</h2>
          <button type="button" onClick={onClose} aria-label="캐릭터 닫기" style={{ ...iconBtn, marginLeft: 'auto' }}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <section aria-label="프리셋 구성" style={{ flexShrink: 0, padding: '12px 0 14px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text"
              aria-label="프리셋 이름"
              maxLength={api.PRESET_NAME_MAX}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="프리셋 이름"
              style={{
                flexGrow: 1, minWidth: 0, height: 32, boxSizing: 'border-box', padding: '0 10px', border: `1px solid rgba(255,255,255,0.16)`, borderRadius: R.control,
                background: C.input, color: C.text, fontFamily: "'Gothic A1', sans-serif", fontSize: 13.5, fontWeight: 700,
              }}
            />
            <span style={{ flexShrink: 0, fontFamily: FONT_NUM, fontSize: 13, fontWeight: 700 }}>
              {draft.length}
              <span style={{ color: C.faint, fontWeight: 500 }}> / {MAX}</span>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${MAX}, minmax(0, 1fr))`, gap: 8 }}>
            {Array.from({ length: MAX }, (_, i) => {
              const code = draft[i];
              return (
                <div key={code ?? `empty-${i}`} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  {code ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggle(code)}
                        aria-label={`${nameOf(code)} 빼기`}
                        style={{ ...faceBox, padding: 0, border: '1px solid rgba(255,255,255,0.14)', background: C.panel, cursor: 'pointer' }}
                      >
                        <Face color={colorOf(code)} />
                        <span aria-hidden="true" style={{ position: 'absolute', right: 3, top: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(20,20,24,0.85)', color: C.text2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="close" size={9} />
                        </span>
                      </button>
                      <span style={{ ...nameLine, fontSize: 11, color: C.text }}>{nameOf(code)}</span>
                    </>
                  ) : (
                    <>
                      <div style={{ ...faceBox, border: '1px dashed rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6E6E68' }}>
                        <Icon name="plus" size={16} />
                      </div>
                      <span style={{ fontSize: 11, color: '#6E6E68' }}>빈 자리</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 8px' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: C.text2 }}>
            보유 종목 <span style={{ fontFamily: FONT_NUM, fontWeight: 500, color: C.faint }}>{holdings?.length ?? 0}</span>
          </h3>
          <div role="group" aria-label="정렬" style={{ display: 'flex', gap: 2, padding: 2, borderRadius: R.control, background: C.input }}>
            {([['name', '가나다순'], ['rate', '수익률순']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={sort === id}
                onClick={() => setSort(id)}
                style={{ height: 24, padding: '0 9px', border: 'none', borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: sort === id ? '#3A3A44' : 'transparent', color: sort === id ? C.text : C.dim }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 8px', flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map((h) => {
            const on = draft.includes(h.stockCode);
            const blocked = !on && full;
            return (
              <li key={h.stockCode} style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={blocked}
                  onClick={() => toggle(h.stockCode)}
                  title={blocked ? `거실엔 ${MAX}명까지 세울 수 있어요` : undefined}
                  style={{
                    width: '100%', height: 50, boxSizing: 'border-box', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: R.card,
                    border: `1px solid ${on ? ON_LINE : 'rgba(255,255,255,0.08)'}`, background: on ? '#2A2A30' : C.panel, color: C.text, textAlign: 'left',
                    cursor: blocked ? 'default' : 'pointer', opacity: blocked ? 0.45 : 1, fontFamily: "'Gothic A1', sans-serif",
                  }}
                >
                  <MiniFace color={colorOf(h.stockCode)} />
                  <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(h.stockCode)}</span>
                    <span style={{ fontSize: 11, color: C.faint }}>{h.quantity}주</span>
                  </span>
                  <span style={{ flexShrink: 0, fontFamily: FONT_NUM, fontSize: 12, fontWeight: 700, color: toneSoft(h.returnRate) }}>{pct(h.returnRate)}</span>
                  {/* 넣었으면 채운 동그라미 — 순번 숫자는 넣지 않는다(2026-10-12 도휘) */}
                  <span
                    aria-hidden="true"
                    style={{ flexShrink: 0, width: 22, height: 22, boxSizing: 'border-box', borderRadius: '50%', border: `1.5px solid ${on ? C.accent : 'rgba(255,255,255,0.24)'}`, background: on ? C.accent : 'transparent' }}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <div style={{ flexShrink: 0, padding: '12px 0 14px', borderTop: `1px solid ${C.lineSoft}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {editError && <span role="alert" style={{ fontSize: 12, color: '#FF7A70' }}>{editError}</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {typeof edit === 'number' && presets.length > 1 && (
              <button type="button" onClick={remove} disabled={busy} style={{ ...ghostBtn, height: 34, padding: '0 10px', color: '#FF7A70', fontSize: 12.5, fontWeight: 700 }}>
                삭제
              </button>
            )}
            <button type="button" onClick={() => setEdit(null)} style={{ ...ghostBtn, marginLeft: 'auto', height: 34, padding: '0 14px', border: `1px solid ${C.line}`, color: C.text, fontSize: 12.5, fontWeight: 700 }}>
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={draft.length === 0 || busy}
              style={{ ...accentBtn, height: 34, padding: '0 18px', fontSize: 12.5, opacity: draft.length === 0 || busy ? 0.4 : 1, cursor: draft.length === 0 ? 'default' : 'pointer' }}
            >
              저장
            </button>
          </div>
        </div>
      </>
    );
  }

  const cantAdd = presets.length >= api.MAX_PRESETS;
  return (
    <>
      <PanelHeader title="캐릭터" sub="프리셋을 누르면 거실이 그 조합으로" onClose={onClose} />
      <ul style={{ listStyle: 'none', margin: 0, padding: '12px 0', flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state === null && !failed && <li style={{ fontSize: 12.5, color: C.faint }}>불러오는 중…</li>}
        {failed && <li role="alert" style={{ fontSize: 12.5, color: '#FF7A70' }}>{failed}</li>}
        {presets.map((p) => {
          const on = p.presetId === state?.activePresetId;
          return (
            <li key={p.presetId} style={{ flexShrink: 0, position: 'relative' }}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${p.name} 프리셋을 거실에 세우기`}
                onClick={() => pick(p.presetId)}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 10,
                  border: `1px solid ${on ? PICK.line : C.lineSoft}`, background: on ? PICK.bg : C.panel, color: C.text, textAlign: 'left',
                  cursor: on ? 'default' : 'pointer', fontFamily: "'Gothic A1', sans-serif",
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 64, minHeight: 22 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  {on && (
                    <span style={{ flexShrink: 0, height: 20, padding: '0 7px', display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box', borderRadius: 4, border: `1px solid ${PICK.line}`, background: PICK.tagBg, color: PICK.tagText, fontSize: 11, fontWeight: 700 }}>
                      선택
                    </span>
                  )}
                  <span style={{ flexShrink: 0, fontFamily: FONT_NUM, fontSize: 12, fontWeight: 700, color: C.faint }}>
                    {p.stockCodes.length}/{MAX}
                  </span>
                </span>
                <span style={{ display: 'grid', gridTemplateColumns: `repeat(${MAX}, minmax(0, 1fr))`, gap: 6 }}>
                  {Array.from({ length: MAX }, (_, j) => {
                    const code = p.stockCodes[j];
                    return (
                      <span key={j} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <span style={{ ...faceBox, border: code ? '1px solid rgba(255,255,255,0.12)' : '1px dashed rgba(255,255,255,0.16)', background: code ? C.panel : 'transparent' }}>
                          {code && <Face color={colorOf(code)} />}
                        </span>
                        <span style={{ ...nameLine, height: 14, fontSize: 10.5, color: C.text2 }}>{code ? nameOf(code) : ''}</span>
                      </span>
                    );
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => openEdit(p.presetId)}
                aria-label={`${p.name} 편집`}
                style={{ position: 'absolute', right: 8, top: 8, height: 26, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid rgba(255,255,255,0.16)', borderRadius: R.control, background: C.panel, color: C.text2, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
              >
                <Icon name="pencil" size={13} />
                편집
              </button>
            </li>
          );
        })}
      </ul>
      <div style={{ flexShrink: 0, padding: '12px 0 14px', borderTop: `1px solid ${C.lineSoft}` }}>
        <button
          type="button"
          onClick={() => !cantAdd && openEdit('new')}
          disabled={cantAdd || state === null}
          style={{
            width: '100%', height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px dashed rgba(255,255,255,0.24)', borderRadius: R.card,
            background: 'transparent', color: C.text, fontSize: 13, fontWeight: 700, cursor: cantAdd ? 'default' : 'pointer', opacity: cantAdd || state === null ? 0.4 : 1,
          }}
        >
          <Icon name="plus" size={13} />
          {cantAdd ? `프리셋은 ${api.MAX_PRESETS}개까지` : '프리셋 추가'}
        </button>
      </div>
    </>
  );
}

const iconBtn: CSSProperties = { ...ghostBtn, width: 30, padding: 0, justifyContent: 'center', flexShrink: 0 };
const faceBox: CSSProperties = { position: 'relative', width: '100%', aspectRatio: '1 / 1', boxSizing: 'border-box', borderRadius: R.card, overflow: 'hidden', display: 'block' };
const nameLine: CSSProperties = { maxWidth: '100%', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/** 칸 안의 얼굴 — 3D 썸네일이 생기기 전까지 머리+몸 도형(캐릭터 색) */
function Face({ color }: { color: string }) {
  return (
    <>
      <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '22%', width: '46%', aspectRatio: '1 / 1', transform: 'translateX(-50%)', borderRadius: '50%', background: color }} />
      <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '58%', width: '36%', height: '34%', transform: 'translateX(-50%)', borderRadius: '9px 9px 4px 4px', background: color, opacity: 0.8 }} />
    </>
  );
}

/** 보유 종목 줄의 작은 얼굴 */
function MiniFace({ color }: { color: string }) {
  return (
    <span aria-hidden="true" style={{ position: 'relative', width: 28, height: 34, flexShrink: 0 }}>
      <span style={{ position: 'absolute', left: 3, top: 0, width: 22, height: 22, borderRadius: '50%', background: color }} />
      <span style={{ position: 'absolute', left: 7, top: 20, width: 14, height: 14, borderRadius: '6px 6px 3px 3px', background: color, opacity: 0.8 }} />
    </span>
  );
}
