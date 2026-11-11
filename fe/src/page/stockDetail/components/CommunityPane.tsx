import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthToken } from '../../../common/authToken';
import { myUserId } from '../../livingRoom/api';
import { createComment, deleteComment, errorMessage, getComments, getPosts, isUnauthorized, toggleFollow, toggleLike } from '../api';
import { COMMENT_MAX, appendComments, commentDraft, prependComment, removeComment } from '../communityComment';
import { isMine, mergeFollowing, withFollow } from '../communityFollow';
import { flipLike, likeFromServer } from '../communityLike';
import { ago } from '../format';
import { livingRoomPath } from '../links';
import { useLoginGate } from '../loginGate';
import type { Post, PostComment } from '../types';
import { R } from '../radius';

/** 팔로우 버튼 색 — 가격 하락 파랑(#5B8CFF)과 겹치지 않게 조금 더 짙은 파랑 */
const FOLLOW_BLUE = '#3D6DF2';

/** 실패 안내가 떠 있는 시간(ms) */
const NOTICE_MS = 4000;

/** 댓글을 한 번에 몇 개씩 펼치는가 */
const COMMENT_PAGE = 5;

/** 한 번에 받는 글 수 */
const POST_PAGE = 20;

/** GET /posts/{postId}/comments — 커서 페이지. 더 없으면 next는 null */
async function loadComments(postId: string, cursor: string | null, limit: number): Promise<{ comments: PostComment[]; next: string | null }> {
  const r = await getComments(postId, cursor, limit);
  return { comments: r.comments, next: r.has_more ? r.next_cursor : null };
}

/** GET /stocks/{code}/posts — 최신순 커서 페이지 */
async function loadPosts(stockCode: string, cursor: string | null): Promise<{ posts: Post[]; next: string | null }> {
  const r = await getPosts(stockCode, cursor, POST_PAGE);
  return { posts: r.posts, next: r.has_more ? r.next_cursor : null };
}

/**
 * 커뮤니티 — 탭이 열릴 때 조회. 답글은 1단만(DB 제약, 거실 방명록과 같다).
 * 종목이 바뀌면 **커서를 버린다** — 안 버리면 다른 종목 글이 이어 붙는다.
 */
export function CommunityPane({ stockCode, reloadKey }: { stockCode: string; reloadKey: number }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  // 로그인 · 로그아웃으로 토큰이 바뀌면 목록을 다시 받는다 — 팔로우 · 좋아요 · 내 투표 표시가 그 사람 것으로 맞게
  const token = useAuthToken();
  // 내 번호(토큰의 sub) — 내 글에는 팔로우 버튼을 숨긴다. 비로그인이면 null
  const me = token ? myUserId() : null;
  const { requireLogin, openLogin } = useLoginGate();

  // 실패 안내 한 줄 — 잠깐 떴다 사라진다
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  // 같은 사람이 쓴 글이 여럿이어도 팔로우 상태는 하나 — 목록이 든다. 값은 서버가 준 것(writer.is_following)에서 시작
  const [following, setFollowing] = useState<Set<string>>(() => new Set());
  /** 지금 목록의 팔로우 상태 · 응답 대기 중인 사람. 목록을 처음부터 다시 받으면 통째로 새것 — 옛 응답은 옛것에만 닿는다 */
  const follow = useRef({ set: new Set<string>(), pending: new Set<string>() });
  const onFollow = useCallback(
    async (userId: string) => {
      if (!requireLogin()) return; // 비로그인 — 로그인 창만 띄우고 서버로는 안 보낸다
      const state = follow.current;
      if (state.pending.has(userId)) return; // 응답 오기 전 연타 — 한 번만 나간다
      const apply = (on: boolean) => {
        state.set = withFollow(state.set, userId, on);
        if (follow.current === state) setFollowing(state.set);
      };
      const before = state.set.has(userId);
      state.pending.add(userId);
      apply(!before); // 먼저 바꿔 보이고
      try {
        apply(await toggleFollow(userId)); // 서버가 준 값이 최종
      } catch (e) {
        apply(before); // 실패 — 누르기 전으로
        if (follow.current !== state) return;
        if (isUnauthorized(e)) openLogin();
        else setNotice(errorMessage(e, before ? '언팔로우하지 못했어요.' : '팔로우하지 못했어요.'));
      } finally {
        state.pending.delete(userId);
      }
    },
    [requireLogin, openLogin],
  );

  useEffect(() => {
    let alive = true;
    const state = { set: new Set<string>(), pending: new Set<string>() };
    follow.current = state;
    setPosts(null);
    setNext(null);
    setError(false);
    setFollowing(state.set);
    void loadPosts(stockCode, null) // 커서는 종목이 바뀔 때마다 null에서 다시 시작
      .then((r) => {
        if (!alive) return;
        state.set = mergeFollowing(state.set, r.posts, state.pending);
        setFollowing(state.set);
        setPosts(r.posts);
        setNext(r.next);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [stockCode, reloadKey, token]);

  /** 아래 끝의 '글 더보기' — 받은 글 뒤에 잇는다. 같은 글이 겹쳐 오면 한 번만 */
  const loadMorePosts = async () => {
    if (!next || more) return;
    setMore(true);
    const code = stockCode;
    const state = follow.current;
    try {
      const r = await loadPosts(code, next);
      if (code !== stockCode || follow.current !== state) return; // 그 사이 목록을 처음부터 다시 받았다
      state.set = mergeFollowing(state.set, r.posts, state.pending);
      setFollowing(state.set);
      setPosts((prev) => {
        const seen = new Set((prev ?? []).map((p) => p.post_id));
        return [...(prev ?? []), ...r.posts.filter((p) => !seen.has(p.post_id))];
      });
      setNext(r.next);
    } catch {
      // 실패하면 버튼이 그대로 남는다 — 다시 누르면 된다
    } finally {
      setMore(false);
    }
  };

  if (error) return <Notice>글 목록을 불러오지 못했습니다</Notice>;
  if (!posts) return <Notice>불러오는 중…</Notice>;
  if (posts.length === 0) return <Notice>아직 글이 없습니다</Notice>;

  return (
    <div className="dc-scroll flex h-full flex-col overflow-y-auto" style={{ gap: 12, padding: '16px 18px' }}>
      {notice && (
        <div
          role="status"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            flexShrink: 0,
            padding: '8px 12px',
            borderRadius: R.control,
            background: '#3A2A2A',
            color: '#FF8A80',
            fontSize: 12.5,
          }}
        >
          {notice}
        </div>
      )}
      {posts.map((p) => (
        <PostCard
          key={p.post_id}
          post={p}
          mine={isMine(p.writer.user_id, me)}
          me={me}
          following={p.writer.user_id != null && following.has(p.writer.user_id)}
          onFollow={(userId) => void onFollow(userId)}
          onNotice={setNotice}
        />
      ))}
      {next && (
        <button
          type="button"
          onClick={() => void loadMorePosts()}
          disabled={more}
          style={{
            flexShrink: 0,
            height: 34,
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: R.control,
            background: 'transparent',
            color: '#9A9A93',
            fontSize: 12.5,
            cursor: more ? 'progress' : 'pointer',
          }}
        >
          {more ? '불러오는 중…' : '글 더보기'}
        </button>
      )}
    </div>
  );
}

function PostCard({
  post,
  mine,
  me,
  following,
  onFollow,
  onNotice,
}: {
  post: Post;
  /** 내가 쓴 글 — 팔로우 버튼을 숨긴다 */
  mine: boolean;
  /** 내 번호 — 내 댓글에만 「삭제」를 보인다. 비로그인이면 null */
  me: string | null;
  following: boolean;
  onFollow: (userId: string) => void;
  /** 실패 안내 한 줄(목록 맨 위) */
  onNotice: (message: string) => void;
}) {
  const { requireLogin, openLogin } = useLoginGate();
  // 좋아요 — 목록이 준 값(is_liked · like_count)에서 시작. 목록을 처음부터 다시 받으면 카드가 새로 그려져 서버 값으로 다시 시작한다
  const [like, setLike] = useState({ liked: post.is_liked, likes: post.like_count });
  const { liked, likes } = like;
  /** 좋아요 응답을 기다리는 중 */
  const likePending = useRef(false);
  /** 카드가 화면에 있는가 — 목록을 다시 받아 사라진 카드의 늦은 실패는 안내하지 않는다 */
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);
  const onLike = async () => {
    if (!requireLogin()) return; // 비로그인 — 로그인 창만 띄우고 서버로는 안 보낸다
    if (likePending.current) return; // 응답 오기 전 연타 — 한 번만 나간다
    const before = like;
    likePending.current = true;
    setLike(flipLike(before)); // 먼저 바꿔 보이고
    try {
      setLike(likeFromServer(await toggleLike(post.post_id))); // 서버가 준 값이 최종
    } catch (e) {
      setLike(before); // 실패 — 누르기 전으로
      if (!shown.current) return;
      if (isUnauthorized(e)) openLogin();
      else onNotice(errorMessage(e, before.liked ? '좋아요를 취소하지 못했어요.' : '좋아요를 누르지 못했어요.'));
    } finally {
      likePending.current = false;
    }
  };
  const [voted, setVoted] = useState<number | null>(null);
  // 투표 전에는 결과를 숨긴다. 마감된 투표는 처음부터 보인다
  const revealed = voted !== null || (post.vote ? !post.vote.state : false);

  // 댓글 — 기본은 접힘. 펼치면 5개, 더보기마다 5개씩
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const r = await loadComments(post.post_id, loaded ? cursor : null, COMMENT_PAGE);
      setComments((prev) => appendComments(prev, r.comments)); // 방금 등록해 맨 위에 올린 댓글이 또 오면 한 번만
      setCursor(r.next);
      setLoaded(true);
    } catch {
      // 못 받으면 펼친 자리에 버튼만 남는다 — 다시 누르면 된다
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };
  const toggleComments = () => {
    if (!open && !loaded) void loadMore(); // 처음 펼칠 때만 받는다 — 접었다 펴면 받은 만큼 그대로
    setOpen(!open);
  };

  // 댓글 수 — 목록이 준 값에서 시작, 등록 · 삭제 응답의 comment_count 로 바꾼다
  const [commentCount, setCommentCount] = useState(post.comment_count);

  // 댓글 등록 — 입력칸의 글자는 실패해도 그대로 둔다
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  /** 등록 응답을 기다리는 중 */
  const postPending = useRef(false);
  /** 지금 등록할 수 있는 내용인가(빈 칸 · 공백만 · 150자 초과가 아님) */
  const ready = commentDraft(draft) !== null;
  const onSubmitComment = async () => {
    if (!requireLogin()) return; // 비로그인 — 로그인 창만 띄우고 서버로는 안 보낸다
    if (postPending.current) return; // 응답 오기 전 연타 · Enter 반복 — 한 번만 나간다
    const content = commentDraft(draft);
    if (content === null) return;
    postPending.current = true;
    setPosting(true);
    try {
      const r = await createComment(post.post_id, content);
      setComments((prev) => prependComment(prev, r.comment)); // 목록이 최신순이라 맨 위가 제자리
      setCommentCount(r.comment_count);
      setDraft('');
    } catch (e) {
      // 실패 — 쓴 내용은 그대로
      if (!shown.current) return;
      if (isUnauthorized(e)) openLogin();
      else onNotice(errorMessage(e, '댓글을 등록하지 못했어요.'));
    } finally {
      postPending.current = false;
      setPosting(false);
    }
  };

  // 내 댓글 삭제 — 「삭제」를 누르면 그 자리에서 한 번 더 묻는다
  /** 「삭제할까요?」를 보이고 있는 댓글 */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** 삭제 응답을 기다리는 댓글 */
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletePending = useRef(false);
  const onDeleteComment = async (commentId: string) => {
    if (!requireLogin()) return;
    if (deletePending.current) return; // 응답 오기 전 연타 — 한 번만 나간다
    deletePending.current = true;
    setDeleting(commentId);
    try {
      const r = await deleteComment(post.post_id, commentId);
      setComments((prev) => removeComment(prev, commentId));
      setCommentCount(r.comment_count);
    } catch (e) {
      // 실패 — 댓글은 그대로 둔다
      if (!shown.current) return;
      if (isUnauthorized(e)) openLogin();
      else onNotice(errorMessage(e, '댓글을 삭제하지 못했어요.'));
    } finally {
      deletePending.current = false;
      setDeleting(null);
      setConfirming(null);
    }
  };

  return (
    <article style={{ padding: '14px 16px', background: '#26262B', borderRadius: R.card }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#3A3A42' }} />
          <Nickname userId={post.writer.user_id} name={post.writer.nickname} size={12.5} />
          <span style={{ fontSize: 11.5, color: '#6E6E68' }}>
            · {ago(post.write_time)}
          </span>
        </div>
        {!mine && post.writer.user_id != null && (
          <button
            type="button"
            onClick={() => onFollow(post.writer.user_id!)}
            aria-pressed={following}
            style={{
              height: 24,
              padding: '0 10px',
              border: 'none',
              borderRadius: R.control,
              // 팔로우 중일 때는 회색 「팔로잉」 — 누르면 그 자리에서 언팔로우
              background: following ? '#3A3A42' : FOLLOW_BLUE,
              color: '#FFFFFF',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {following ? '팔로잉' : '팔로우'}
          </button>
        )}
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 14.5, fontWeight: 500, lineHeight: 1.45, color: '#DCDCD5', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {post.content}
      </p>

      {post.vote && (
        <div className="flex flex-col" style={{ gap: 6, marginTop: 10 }}>
          {post.vote.options.map((o) => {
            const chosen = voted === o.option_no;
            // {투표 반영은 C단계} 누르면 결과만 공개한다 — 숫자는 서버 값 그대로
            return (
              <button
                key={o.option_no}
                type="button"
                onClick={() => voted === null && setVoted(o.option_no)}
                aria-pressed={chosen}
                className="relative flex items-center justify-between"
                style={{
                  height: 34,
                  padding: '0 12px',
                  border: chosen ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.12)',
                  borderRadius: R.control,
                  background: 'transparent',
                  color: '#EDEDEA',
                  fontSize: 13,
                  cursor: revealed ? 'default' : 'pointer',
                  overflow: 'hidden',
                }}
              >
                <span
                  className="absolute left-0 top-0"
                  style={{
                    width: revealed ? `${o.percentage}%` : 0,
                    height: '100%',
                    background: 'rgba(91,140,255,0.22)',
                    transition: 'width 0.5s ease-out',
                  }}
                />
                <span className="relative">{o.option_text}</span>
                {revealed && (
                  <b className="relative" style={{ fontFamily: "'Space Grotesk', monospace" }}>
                    {o.percentage}%
                  </b>
                )}
              </button>
            );
          })}
          <div style={{ fontSize: 11, color: '#6E6E68' }}>
            {post.vote.total_voters}명 참여{revealed ? '' : ' · 투표 후 결과 공개'}
          </div>
        </div>
      )}

      <div className="flex items-center" style={{ gap: 14, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => void onLike()}
          aria-pressed={liked}
          className="inline-flex items-center"
          style={{ gap: 5, border: 'none', background: 'transparent', color: liked ? '#F2564C' : '#9A9A93', fontSize: 12.5, cursor: 'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M12 20.5 4.2 12.9a4.9 4.9 0 0 1 0-7 4.7 4.7 0 0 1 6.7 0l1.1 1.1 1.1-1.1a4.7 4.7 0 0 1 6.7 0 4.9 4.9 0 0 1 0 7z"
              fill={liked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
          {likes}
        </button>
        <button
          type="button"
          onClick={toggleComments}
          aria-expanded={open}
          aria-label={`댓글 ${commentCount}개 ${open ? '접기' : '펼치기'}`}
          className="inline-flex items-center"
          style={{
            gap: 5,
            border: 'none',
            background: 'transparent',
            color: open ? '#EDEDEA' : '#9A9A93',
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 5h16v11H9l-5 4z" fill={open ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          {commentCount}
        </button>
      </div>

      {open && (
        <div>
          {/* 댓글 입력 — 목록 맨 위. 비로그인도 보이고, 등록을 누르면 로그인 창 */}
          <div className="flex items-center" style={{ gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              value={draft}
              maxLength={COMMENT_MAX}
              readOnly={posting}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter 로 등록 — 한글 조합 중의 Enter(글자 확정)는 등록이 아니다
                if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                void onSubmitComment();
              }}
              placeholder="댓글 입력…"
              aria-label="댓글 입력"
              style={{
                flexGrow: 1,
                minWidth: 0,
                height: 32,
                padding: '0 10px',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: R.control,
                background: 'transparent',
                color: '#EDEDEA',
                fontSize: 13,
                outline: 'none',
              }}
            />
            {draft.length > 0 && (
              <span style={{ flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: '#6E6E68' }}>
                {draft.length}/{COMMENT_MAX}
              </span>
            )}
            <button
              type="button"
              onClick={() => void onSubmitComment()}
              aria-disabled={!ready || posting}
              style={{
                flexShrink: 0,
                height: 32,
                padding: '0 12px',
                border: 'none',
                borderRadius: R.control,
                background: '#EDEDEA',
                color: '#1C1C1E',
                fontSize: 12.5,
                fontWeight: 700,
                opacity: ready && !posting ? 1 : 0.45,
                cursor: posting ? 'progress' : 'pointer',
              }}
            >
              등록
            </button>
          </div>
          {comments.map((c) => (
            <div key={c.comment_id} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center" style={{ gap: 6, fontSize: 12 }}>
                <Nickname userId={c.writer.user_id} name={c.writer.nickname} size={12} />
                <span style={{ color: '#6E6E68' }}>· {ago(c.write_time)}</span>
                {isMine(c.writer.user_id, me) && (
                  // 내 댓글에만 — 누르면 그 자리에서 한 번 더 묻는다
                  <span className="inline-flex items-center" style={{ gap: 8, marginLeft: 'auto', fontSize: 11.5, color: '#6E6E68' }}>
                    {deleting === c.comment_id ? (
                      '삭제 중…'
                    ) : confirming === c.comment_id ? (
                      <>
                        삭제할까요?
                        <button
                          type="button"
                          onClick={() => void onDeleteComment(c.comment_id)}
                          style={{ padding: 0, border: 'none', background: 'transparent', color: '#FF8A80', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          삭제
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          style={{ padding: 0, border: 'none', background: 'transparent', color: '#9A9A93', fontSize: 11.5, cursor: 'pointer' }}
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(c.comment_id)}
                        aria-label="내 댓글 삭제"
                        style={{ padding: 0, border: 'none', background: 'transparent', color: '#6E6E68', fontSize: 11.5, cursor: 'pointer' }}
                      >
                        삭제
                      </button>
                    )}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 3, fontSize: 13, color: '#C6C6BE', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.content}</div>
            </div>
          ))}
          {loaded && comments.length === 0 && !cursor && !loading && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12.5, color: '#6E6E68' }}>
              아직 댓글이 없습니다
            </div>
          )}
          {(loading || cursor || loadFailed) && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              style={{
                width: '100%',
                height: 32,
                marginTop: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: R.control,
                background: 'transparent',
                color: '#9A9A93',
                fontSize: 12.5,
                cursor: loading ? 'progress' : 'pointer',
              }}
            >
              {loading ? '불러오는 중…' : loadFailed ? '댓글을 못 불러왔어요 — 다시 시도' : '댓글 더보기'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** 닉네임 — 누르면 그 사람의 거실(포트폴리오)로 간다. 탈퇴 등으로 id가 없으면 글자만 */
function Nickname({ userId, name, size }: { userId: string | null; name: string; size: number }) {
  const navigate = useNavigate();
  const style: React.CSSProperties = { fontSize: size, fontWeight: 700, color: '#C6C6BE' };
  if (userId == null) return <b style={style}>{name}</b>;
  return (
    <button
      type="button"
      onClick={() => navigate(livingRoomPath(userId))}
      className="hover:underline"
      title={`${name}님의 거실로`}
      style={{ ...style, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
    >
      {name}
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center" style={{ fontSize: 13, color: '#97978E' }}>
      {children}
    </div>
  );
}
