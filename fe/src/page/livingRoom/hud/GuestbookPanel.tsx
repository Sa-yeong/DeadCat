import { useEffect, useState } from 'react';
import { ago } from '../../stockDetail/format';
import { R } from '../../stockDetail/radius';
import * as api from '../api';
import type { OwnerId } from '../api';
import type { GuestbookPost, GuestbookReply, ReactionKind, RoomReactions, ViewMode } from '../types';
import { PanelHeader } from './SidePanel';
import { Icon, ReactionFace } from './ui';
import { C, ghostBtn, solidBtn } from './style';

type Lane = 'text' | 'reaction';

/** 서버 시각(UTC ISO) → 한국 시간 글자. 화면에는 「3분 전」을 보이고 이걸 툴팁으로 단다 */
const kst = (iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
};

/** 실패 안내 — 서버가 준 글이 있으면 그대로(비밀글 답글 403 등), 없으면 기본 글 */
const reasonOf = (e: unknown, fallback: string) => (e instanceof api.HttpError ? e.message : fallback);

/**
 * 방명록 — 오른쪽 창(SidePanel)의 한 탭. 열릴 때 첫 쪽(최신 20개)을 받고, 「더 보기」로 다음 쪽을 이어 받는다.
 *   OWNER   작성창 없음 · 글마다 답글(1단) · 받은 반응은 조회만
 *   VISITOR 작성창(비밀글 가능) · 글마다 답글(1단) · 거실 전체에 반응 남기기(1인 1개 — 다른 종류는 교체, 같은 걸 다시 누르면 취소)
 *   GUEST   방문자와 똑같이 보이고, 쓰거나 답글·반응하려 하면 로그인 창 (참여는 로그인 뒤에 — 막는 건 서버)
 *
 * 비밀글 — 볼 수 없는 사람에겐 서버가 내용을 비워(null) 보낸다. 여기는 자물쇠와 「비밀글입니다」만 그린다.
 * 답글의 비밀 여부는 원글을 따라간다(답글마다 고르지 않음). 비밀글엔 주인 · 원글 쓴 사람만 답글을 단다 — 내용이 보이는 사람이 곧 그들이다.
 * 거실 반응은 거실 응답(스냅샷)에 실려 온다 — 남기면 서버가 준 개수 · 내 반응을 페이지에 올려 스냅샷을 맞춘다.
 */
export function GuestbookPanel({
  open,
  ownerId,
  mode,
  reactionKinds,
  roomReactions,
  onRoomReactions,
  onClose,
  onVisit,
  onNeedLogin,
}: {
  open: boolean;
  ownerId: OwnerId;
  mode: ViewMode;
  reactionKinds: ReactionKind[];
  roomReactions: RoomReactions;
  onRoomReactions: (r: RoomReactions) => void;
  onClose: () => void;
  onVisit: (userId: number) => void;
  /** 비로그인(또는 로그인이 풀린 사람)이 쓰거나 반응하려 했다 */
  onNeedLogin: () => void;
}) {
  const guest = mode === 'GUEST';
  /** 방명록·거실 반응을 남기는 쪽 — 방문자와 비로그인 (주인은 답글만) */
  const visiting = mode !== 'OWNER';
  const [posts, setPosts] = useState<GuestbookPost[] | null>(null);
  /** 다음 쪽 커서 — 마지막 쪽이면 null */
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [secret, setSecret] = useState(false);
  const [reply, setReply] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  /** 보내는 중 — 같은 글·반응이 두 번 가지 않게. 글과 반응은 따로 막는다(글 보내는 중에도 반응은 눌리게) */
  const [busy, setBusy] = useState<Record<Lane, boolean>>({ text: false, reaction: false });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api.getGuestbook(ownerId).then(
      (page) => {
        if (!alive) return;
        setPosts(page.posts);
        setNext(page.nextCursor);
        setFailed(null);
      },
      () => alive && setFailed('방명록을 불러오지 못했어요'),
    );
    return () => {
      alive = false;
    };
  }, [open, ownerId]);

  /** 다음 쪽 — 받은 글 뒤에 잇는다(이미 있는 글은 건너뜀: 그 사이 새 글이 와서 밀렸을 때) */
  const loadMore = () => {
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    api
      .getGuestbook(ownerId, next)
      .then(
        (page) => {
          setPosts((list) => {
            const have = new Set((list ?? []).map((p) => p.postId));
            return [...(list ?? []), ...page.posts.filter((p) => !have.has(p.postId))];
          });
          setNext(page.nextCursor);
        },
        () => setFailed('방명록을 더 불러오지 못했어요'),
      )
      .finally(() => setLoadingMore(false));
  };

  /** 쓰기 실패는 글자를 지우지 않고 알린다. 로그인이 풀렸으면 로그인 창. 같은 줄(글/반응)이 보내는 중이면 무시한다 */
  const attempt = async (lane: Lane, job: () => Promise<void>, msg: string) => {
    if (busy[lane]) return;
    setBusy((b) => ({ ...b, [lane]: true }));
    setFailed(null);
    await job().catch((e: unknown) => {
      if (e instanceof api.AuthRequiredError) onNeedLogin();
      else setFailed(reasonOf(e, msg));
    });
    setBusy((b) => ({ ...b, [lane]: false }));
  };

  /** 한글 조합 중의 Enter 는 글자를 확정하는 것이지 보내기가 아니다 */
  const onEnter = (send: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
  };

  const write = () => {
    if (guest) return onNeedLogin();
    const text = draft.trim();
    if (!text || !ownerId) return;
    void attempt('text', async () => {
      await api.writeGuestbook(ownerId, text, secret);
      setDraft('');
      setSecret(false);
      // 새 글은 늘 첫 쪽 맨 위 — 첫 쪽만 다시 받아 앞에 붙이고, 이미 받아 둔 뒤쪽 글은 그대로 둔다
      const page = await api.getGuestbook(ownerId);
      setPosts((list) => {
        const fresh = new Set(page.posts.map((p) => p.postId));
        return [...page.posts, ...(list ?? []).filter((p) => !fresh.has(p.postId))];
      });
    }, '글을 남기지 못했어요');
  };

  /** 답글 창 열기/닫기 — 비로그인은 로그인 창 */
  const toggleReply = (postId: number) => {
    if (guest) return onNeedLogin();
    setReplyTo(replyTo === postId ? null : postId);
    setReply('');
  };

  const sendReply = (post: GuestbookPost) => {
    const text = reply.trim();
    if (!text) return;
    void attempt('text', async () => {
      const r = await api.replyGuestbook(ownerId, post.postId, text);
      // 답글은 서버가 번호 · 시각만 준다 — 이 글 밑에 바로 붙여 보인다(작성자 이름은 다음에 열 때 서버 값으로)
      const mine: GuestbookReply = { replyId: r.replyId, userId: Number(api.myUserId()) || null, nickname: '나', content: text, writeTime: r.writeTime };
      setPosts((list) => (list ?? []).map((x) => (x.postId === post.postId ? { ...x, replies: [...x.replies, mine] } : x)));
      setReply('');
      setReplyTo(null);
    }, '답글을 달지 못했어요');
  };

  const react = (reactionType: string) => {
    if (guest) return onNeedLogin();
    if (mode !== 'VISITOR' || !ownerId) return;
    void attempt('reaction', async () => onRoomReactions(await api.reactToRoom(ownerId, reactionType)), '반응을 남기지 못했어요');
  };

  const input: React.CSSProperties = {
    flexGrow: 1, minWidth: 0, height: 30, padding: '0 10px', border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: R.control, background: C.input, color: C.text, fontSize: 13,
  };

  return (
    <>
      <PanelHeader title="방명록" count={posts?.length ?? ''} onClose={onClose} />

      {visiting && (
        <div style={{ display: 'flex', gap: 6, padding: '12px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
          <label htmlFor="gb-write" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>방명록 쓰기</label>
          {/* 비로그인은 입력칸을 누르는 순간 로그인 창 — 글을 다 쓰고 나서 막히지 않게 */}
          <input
            id="gb-write"
            value={draft}
            maxLength={api.GUESTBOOK_MAX}
            readOnly={guest}
            onPointerDown={guest ? (e) => { e.preventDefault(); onNeedLogin(); } : undefined}
            onFocus={guest ? (e) => { e.currentTarget.blur(); onNeedLogin(); } : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onEnter(write)}
            placeholder={secret ? '비밀글 남기기 — 주인과 나만 봐요' : '방명록 남기기'}
            style={input}
          />
          <SecretToggle on={secret} onToggle={() => (guest ? onNeedLogin() : setSecret((v) => !v))} />
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
              {p.profileImgUrl ? (
                <img src={p.profileImgUrl} alt="" width={22} height={22} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#3A3A44', flexShrink: 0 }} aria-hidden="true" />
              )}
              <Writer userId={p.userId} nickname={p.nickname} size={13} onVisit={onVisit} />
              {p.isSecret && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.dim }}><Icon name="lock" size={12} />비밀글</span>}
              <span title={kst(p.writeTime)} style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>{ago(p.writeTime)}</span>
            </div>
            {p.content === null ? (
              <p style={{ margin: '6px 0 0 30px', fontSize: 12.5, lineHeight: 1.5, color: C.faint }}>비밀글입니다</p>
            ) : (
              <p style={{ margin: '6px 0 0 30px', fontSize: 13, lineHeight: 1.5, color: '#DADAD4', overflowWrap: 'anywhere' }}>{p.content}</p>
            )}
            <div style={{ marginLeft: 30 }}>
              {p.replies.map((r) => <Reply key={r.replyId} r={r} onVisit={onVisit} />)}
              {/* 읽을 수 없는 비밀글엔 답글을 달 수 없다(서버도 403) */}
              {p.content !== null && (
                <>
                  <button type="button" onClick={() => toggleReply(p.postId)}
                    style={{ ...ghostBtn, height: 24, padding: '0 8px', marginTop: 6, fontSize: 12, color: C.dim }}>
                    {replyTo === p.postId ? '닫기' : '답글'}
                  </button>
                  {replyTo === p.postId && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <input aria-label="답글 입력" autoFocus value={reply} maxLength={api.REPLY_MAX} onChange={(e) => setReply(e.target.value)}
                        onKeyDown={onEnter(() => sendReply(p))} placeholder={p.isSecret ? '비밀 답글 달기 — 비밀글이라 답글도 비밀이에요' : '답글 달기'} style={input} />
                      <button type="button" onClick={() => sendReply(p)} style={{ ...solidBtn, fontSize: 12 }}>등록</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        {posts && next !== null && (
          <button type="button" onClick={loadMore} disabled={loadingMore}
            style={{ ...ghostBtn, width: '100%', height: 32, margin: '10px 0', justifyContent: 'center', fontSize: 12, color: C.dim }}>
            {loadingMore ? '불러오는 중…' : '더 보기'}
          </button>
        )}
      </div>

      <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, borderTop: `1px solid ${C.lineSoft}` }}>
        <span style={{ fontSize: 12, color: C.dim, marginRight: 4 }}>{visiting ? '반응 남기기' : '받은 반응'}</span>
        {reactionKinds.length === 0 && <span style={{ fontSize: 12, color: C.faint }}>아직 반응 종류가 없어요</span>}
        {reactionKinds.map((k) => {
          // 비로그인에게는 '내 반응'이 없다 — 서버도 null 로 준다
          const mine = !guest && roomReactions.mine === k.reactionType;
          return (
            <button
              key={k.reactionType}
              type="button"
              aria-label={mine ? `${k.reactionType} 취소` : k.reactionType}
              aria-pressed={mine}
              disabled={!visiting}
              onClick={() => react(k.reactionType)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: R.control,
                border: mine ? `1px solid ${C.accent}` : '1px solid transparent', background: C.input, color: C.text,
                fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, cursor: visiting ? 'pointer' : 'default',
              }}
            >
              <ReactionFace kind={k} size={13} />
              {roomReactions.counts[k.reactionType] ?? 0}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** 쓴 사람 이름 — 누르면 그 사람 거실로. 탈퇴한 사람(번호 없음)은 글자만 */
function Writer({ userId, nickname, size, onVisit }: { userId: number | null; nickname: string; size: number; onVisit: (userId: number) => void }) {
  if (userId === null) return <span style={{ fontSize: size, fontWeight: 700, color: C.dim }}>{nickname}</span>;
  return (
    <button type="button" onClick={() => onVisit(userId)} title={`${nickname}님의 거실로`}
      style={{ padding: 0, border: 'none', background: 'none', fontSize: size, fontWeight: 700, color: C.text, cursor: 'pointer' }}>
      {nickname}
    </button>
  );
}

/** 답글 한 줄 — 비밀글의 답글을 볼 수 없으면 안내만 */
function Reply({ r, onVisit }: { r: GuestbookReply; onVisit: (userId: number) => void }) {
  return (
    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: R.card, background: 'rgba(255,255,255,0.05)', fontSize: 12, lineHeight: 1.5, color: C.text2, overflowWrap: 'anywhere' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 6, verticalAlign: 'top' }}>
        <span style={{ color: C.faint }} aria-hidden="true">↳</span>
        <Writer userId={r.userId} nickname={r.nickname} size={12} onVisit={onVisit} />
        <span title={kst(r.writeTime)} style={{ fontSize: 11, color: C.faint }}>{ago(r.writeTime)}</span>
      </span>
      {r.content === null ? <span style={{ color: C.faint }}>비밀글입니다</span> : r.content}
    </div>
  );
}

/** 비밀 켜고 끄기 — 자물쇠 버튼(방명록 글에만. 답글은 원글을 따라간다) */
function SecretToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="비밀로 쓰기"
      title={on ? '비밀 — 거실 주인과 나만 봐요' : '비밀로 쓰기'}
      onClick={onToggle}
      style={{
        ...ghostBtn, flexShrink: 0, height: 30, gap: 4, padding: '0 8px', fontSize: 12,
        border: `1px solid ${on ? C.accent : 'rgba(255,255,255,0.16)'}`, color: on ? C.text : C.dim, cursor: 'pointer',
      }}
    >
      <Icon name="lock" size={12} />
      비밀
    </button>
  );
}
