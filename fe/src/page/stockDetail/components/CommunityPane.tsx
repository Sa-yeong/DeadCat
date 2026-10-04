import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getComments, getPosts } from '../api';
import { ago } from '../format';
import { livingRoomPath } from '../links';
import type { Post, PostComment } from '../types';
import { R } from '../radius';

/** 팔로우 버튼 색 — 가격 하락 파랑(#5B8CFF)과 겹치지 않게 조금 더 짙은 파랑 */
const FOLLOW_BLUE = '#3D6DF2';

/**
 * 실 API 교체 지점 — 팔로우 / 언팔로우.
 * {백엔드에 아직 없음} relation 모듈에는 목록 조회(GET /users/me/relations)만 있다.
 */
async function setFollow(_userId: string, _follow: boolean): Promise<void> {
  await new Promise((r) => setTimeout(r, 120));
}

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
  // 같은 사람이 쓴 글이 여럿이어도 팔로우 상태는 하나 — 목록이 든다
  const [following, setFollowing] = useState<Set<string>>(() => new Set());
  const toggleFollow = useCallback(
    (userId: string) => {
      const on = !following.has(userId);
      setFollowing((prev) => {
        const next = new Set(prev);
        if (on) next.add(userId);
        else next.delete(userId);
        return next;
      });
      void setFollow(userId, on);
    },
    [following],
  );

  useEffect(() => {
    let alive = true;
    setPosts(null);
    setNext(null);
    setError(false);
    void loadPosts(stockCode, null) // 커서는 종목이 바뀔 때마다 null에서 다시 시작
      .then((r) => {
        if (!alive) return;
        setPosts(r.posts);
        setNext(r.next);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [stockCode, reloadKey]);

  /** 아래 끝의 '글 더보기' — 받은 글 뒤에 잇는다. 같은 글이 겹쳐 오면 한 번만 */
  const loadMorePosts = async () => {
    if (!next || more) return;
    setMore(true);
    const code = stockCode;
    try {
      const r = await loadPosts(code, next);
      if (code !== stockCode) return;
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
      {posts.map((p) => (
        <PostCard
          key={p.post_id}
          post={p}
          following={p.writer.user_id != null && following.has(p.writer.user_id)}
          onFollow={toggleFollow}
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
  following,
  onFollow,
}: {
  post: Post;
  following: boolean;
  onFollow: (userId: string) => void;
}) {
  const [liked, setLiked] = useState(post.is_liked);
  const [likes, setLikes] = useState(post.like_count);
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
      setComments((prev) => [...prev, ...r.comments]);
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
        {post.writer.user_id != null && (
          <button
            type="button"
            onClick={() => onFollow(post.writer.user_id!)}
            aria-pressed={following}
            style={{
              height: 24,
              padding: '0 10px',
              border: 'none',
              borderRadius: R.control,
              // {제안} 팔로우 중일 때는 회색 — 누르면 해제
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
          onClick={() => {
            setLiked(!liked);
            setLikes(likes + (liked ? -1 : 1));
          }}
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
          aria-label={`댓글 ${post.comment_count}개 ${open ? '접기' : '펼치기'}`}
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
          {post.comment_count}
        </button>
      </div>

      {open && (
        <div>
          {comments.map((c) => (
            <div key={c.comment_id} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center" style={{ gap: 6, fontSize: 12 }}>
                <Nickname userId={c.writer.user_id} name={c.writer.nickname} size={12} />
                <span style={{ color: '#6E6E68' }}>· {ago(c.write_time)}</span>
              </div>
              <div style={{ marginTop: 3, fontSize: 13, color: '#C6C6BE', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.content}</div>
            </div>
          ))}
          {loaded && comments.length === 0 && (
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
