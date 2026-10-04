import { useEffect, useState } from 'react';
import { ago } from '../../stockDetail/format';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import type { OwnerId } from '../api';
import type { GuestbookPost, ReactionKind, RoomReactions, ViewMode } from '../types';
import { Icon } from './ui';
import { C, REACTION_COLOR, ghostBtn, solidBtn } from './style';

type Lane = 'text' | 'reaction';

/**
 * 방명록 — 오른쪽에서 밀려 들어오는 패널. 열릴 때 글과 반응을 받는다(스냅샷에 없음).
 *   OWNER   작성창 없음 · 글마다 답글(1단) · 받은 반응은 조회만
 *   VISITOR 작성창 · 거실 전체에 반응 남기기(1인 1개, 다시 누르면 취소)
 *   GUEST   방문자와 똑같이 보이고, 쓰거나 반응하려 하면 로그인 창 (참여는 로그인 뒤에)
 */
export function GuestbookPanel({
  open,
  ownerId,
  mode,
  reactionKinds,
  left,
  top,
  width,
  height,
  onClose,
  onVisit,
  onNeedLogin,
}: {
  open: boolean;
  ownerId: OwnerId;
  mode: ViewMode;
  reactionKinds: ReactionKind[];
  left: number;
  top: number;
  width: number;
  height: number;
  onClose: () => void;
  onVisit: (userId: number) => void;
  /** 비로그인이 쓰거나 반응하려 했다 */
  onNeedLogin: () => void;
}) {
  const guest = mode === 'GUEST';
  /** 방명록·거실 반응을 남기는 쪽 — 방문자와 비로그인 (주인은 답글만) */
  const visiting = mode !== 'OWNER';
  const [posts, setPosts] = useState<GuestbookPost[] | null>(null);
  const [reactions, setReactions] = useState<RoomReactions | null>(null);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  /** 보내는 중 — 같은 글·반응이 두 번 가지 않게. 글과 반응은 따로 막는다(글 보내는 중에도 반응은 눌리게) */
  const [busy, setBusy] = useState<Record<Lane, boolean>>({ text: false, reaction: false });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([api.getGuestbook(ownerId), api.getRoomReactions(ownerId)])
      .then(([p, r]) => {
        if (!alive) return;
        setPosts(p);
        setReactions(r);
        setFailed(null);
      })
      .catch(() => alive && setFailed('방명록을 불러오지 못했어요'));
    return () => {
      alive = false;
    };
  }, [open, ownerId]);

  /** 쓰기 실패는 글자를 지우지 않고 알린다. 같은 줄(글/반응)이 보내는 중이면 무시한다 */
  const attempt = async (lane: Lane, job: () => Promise<void>, msg: string) => {
    if (busy[lane]) return;
    setBusy((b) => ({ ...b, [lane]: true }));
    setFailed(null);
    await job().catch(() => setFailed(msg));
    setBusy((b) => ({ ...b, [lane]: false }));
  };

  /** 한글 조합 중의 Enter 는 글자를 확정하는 것이지 보내기가 아니다 */
  const onEnter = (send: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
  };

  const write = () => {
    if (guest) return onNeedLogin();
    const text = draft.trim();
    if (!text) return;
    void attempt('text', async () => {
      const p = await api.writeGuestbook(ownerId, text);
      setPosts((list) => [p, ...(list ?? [])]);
      setDraft('');
    }, '글을 남기지 못했어요');
  };

  const sendReply = (postId: number) => {
    const text = reply.trim();
    if (!text) return;
    void attempt('text', async () => {
      const p = await api.replyGuestbook(postId, text);
      setPosts((list) => (list ?? []).map((x) => (x.postId === postId ? p : x)));
      setReply('');
      setReplyTo(null);
    }, '답글을 달지 못했어요');
  };

  const react = (id: number) => {
    if (guest) return onNeedLogin();
    if (mode !== 'VISITOR') return;
    void attempt('reaction', async () => setReactions(await api.reactToRoom(ownerId, id)), '반응을 남기지 못했어요');
  };

  const input: React.CSSProperties = {
    flexGrow: 1, minWidth: 0, height: 30, padding: '0 10px', border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: R.control, background: C.input, color: C.text, fontSize: 13,
  };

  return (
    <aside
      aria-label="방명록"
      aria-hidden={!open}
      style={{
        position: 'absolute', left, top, width, height, zIndex: 20, padding: '0 14px', display: 'flex', flexDirection: 'column',
        border: `1px solid ${C.line}`, borderRadius: R.panel, background: C.nav,
        transform: `translateX(${open ? 0 : width + 40}px)`, transition: 'transform 0.35s ease', visibility: open ? 'visible' : 'hidden',
      }}
    >
      <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.lineSoft}` }}>
        <h2 style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.04em' }}>
          방명록 <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, color: C.faint }}>{posts?.length ?? ''}</span>
        </h2>
        <button type="button" onClick={onClose} aria-label="방명록 닫기" style={{ ...ghostBtn, width: 30, padding: 0, justifyContent: 'center' }}>
          <Icon name="close" size={14} />
        </button>
      </div>

      {visiting && (
        <div style={{ display: 'flex', gap: 6, padding: '12px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
          <label htmlFor="gb-write" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>방명록 쓰기</label>
          {/* 비로그인은 입력칸을 누르는 순간 로그인 창 — 글을 다 쓰고 나서 막히지 않게 */}
          <input
            id="gb-write"
            value={draft}
            maxLength={150}
            readOnly={guest}
            onPointerDown={guest ? (e) => { e.preventDefault(); onNeedLogin(); } : undefined}
            onFocus={guest ? (e) => { e.currentTarget.blur(); onNeedLogin(); } : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onEnter(write)}
            placeholder="방명록 남기기"
            style={input}
          />
          <button type="button" onClick={write} style={solidBtn}>등록</button>
        </div>
      )}

      <div style={{ flexGrow: 1, overflowY: 'auto' }}>
        {failed && <div role="status" style={{ padding: '10px 2px 0', fontSize: 12, color: C.accent }}>{failed}</div>}
        {posts === null && !failed && <div style={{ padding: 16, fontSize: 12.5, color: C.faint }}>불러오는 중…</div>}
        {posts?.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: C.faint }}>아직 남긴 글이 없어요</div>}
        {posts?.map((p) => (
          <article key={p.postId} style={{ padding: '12px 2px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#3A3A44', flexShrink: 0 }} aria-hidden="true" />
              <button type="button" onClick={() => onVisit(p.userId)} title={`${p.nickname}님의 거실로`} style={{ padding: 0, border: 'none', background: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {p.nickname}
              </button>
              {p.isSecret && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.dim }}><Icon name="lock" size={12} />비밀글</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>{ago(p.writeTime)}</span>
            </div>
            <p style={{ margin: '6px 0 0 30px', fontSize: 13, lineHeight: 1.5, color: '#DADAD4' }}>{p.content}</p>
            <div style={{ marginLeft: 30 }}>
              {p.replies.map((r) => (
                <div key={r.commentId} style={{ marginTop: 8, padding: '8px 10px', borderRadius: R.card, background: 'rgba(255,255,255,0.05)', fontSize: 12, lineHeight: 1.5, color: C.text2 }}>
                  <span style={{ fontWeight: 700, color: C.text }}>{r.nickname}</span> · {r.content}
                </div>
              ))}
              {mode === 'OWNER' && (
                <>
                  <button type="button" onClick={() => { setReplyTo(replyTo === p.postId ? null : p.postId); setReply(''); }}
                    style={{ ...ghostBtn, height: 24, padding: '0 8px', marginTop: 6, fontSize: 12, color: C.dim }}>
                    {replyTo === p.postId ? '닫기' : '답글'}
                  </button>
                  {replyTo === p.postId && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <input aria-label="답글 입력" autoFocus value={reply} maxLength={150} onChange={(e) => setReply(e.target.value)}
                        onKeyDown={onEnter(() => sendReply(p.postId))} placeholder="답글 달기" style={input} />
                      <button type="button" onClick={() => sendReply(p.postId)} style={{ ...solidBtn, fontSize: 12 }}>등록</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, borderTop: `1px solid ${C.lineSoft}` }}>
        <span style={{ fontSize: 12, color: C.dim, marginRight: 4 }}>{visiting ? '반응 남기기' : '받은 반응'}</span>
        {reactionKinds.map((k) => {
          // 비로그인에게는 '내 반응'이 없다 — 서버가 실어 보내도 표시하지 않는다
          const mine = !guest && reactions?.mine === k.reactionId;
          return (
            <button
              key={k.reactionId}
              type="button"
              aria-label={k.label}
              aria-pressed={mine}
              disabled={!visiting}
              onClick={() => react(k.reactionId)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: R.control,
                border: mine ? `1px solid ${REACTION_COLOR[k.icon]}` : '1px solid transparent', background: C.input, color: C.text,
                fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, cursor: visiting ? 'pointer' : 'default',
              }}
            >
              <Icon name={k.icon} size={13} fill={k.icon !== 'smile'} color={REACTION_COLOR[k.icon]} />
              {reactions?.counts[k.reactionId] ?? 0}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
