import { useEffect, useRef, useState } from 'react';
import { useLayout } from '../layout';
import * as dummy from '../dummy';
import { R } from '../radius';
import { createPost, errorMessage, isUnauthorized } from '../api';
import { POLL_MAX, POLL_MIN, POLL_OPTION_MAX, POST_MAX, filledOptions, postBody } from '../communityPost';
import { useLoginGate } from '../loginGate';

const MAX_LEN = POST_MAX;
const MAX_IMAGES = 4;
/** 사진 첨부 — 백엔드에 사진 올리기가 없어 버튼을 숨긴다(2026-11-11). 생기면 true 로 */
const PHOTO_ON: boolean = false;

/**
 * 글쓰기 — 시안(CommunityRail 아트보드)의 창. 무대 전체를 어둡게 덮고 가운데에 뜬다.
 * 제목 칸은 두지 않는다 — 목록도 제목 없이 본문만 보이므로(2026-09-29).
 *
 * 아래 아이콘 — 투표 개설(사진 첨부는 꺼 둠). 「남기기」는 POST /posts/create 로 보낸다.
 * 투표 글의 마감은 서버가 7일 뒤로 고정한다 — 화면에 마감 설정은 없다.
 */
export function PostComposer({
  stockCode,
  open,
  onClose,
  onSubmitted,
}: {
  /** 이 글이 달릴 종목 */
  stockCode: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const L = useLayout();
  const { requireLogin, openLogin } = useLoginGate();
  const [body, setBody] = useState('');
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [poll, setPoll] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  /** 등록 응답을 기다리는 중 */
  const sendPending = useRef(false);
  /** 등록 실패 안내 — 창 안(아래 줄 왼쪽)에 보인다. 다시 보내거나 창을 닫으면 지운다 */
  const [failed, setFailed] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);

  // 열릴 때 본문에 바로 쓸 수 있게
  useEffect(() => {
    if (open) textarea.current?.focus();
  }, [open]);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setFailed(null);
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 미리보기용 주소는 화면을 떠날 때 돌려준다 (빼거나 비울 때는 그 자리에서)
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const held = urls.current;
    return () => held.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const dropImage = (url: string) => {
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  };

  if (!open) return null;

  const pollFilled = poll ? filledOptions(poll).length : 0;
  const pollOk = !poll || pollFilled >= POLL_MIN;
  const canSend = !sending && postBody(stockCode, body, poll) !== null;

  const reset = () => {
    images.forEach((i) => dropImage(i.url));
    setBody('');
    setImages([]);
    setPoll(null);
  };

  const submit = async () => {
    if (sendPending.current) return; // 응답 오기 전 연타 — 한 번만 나간다
    const request = postBody(stockCode, body, poll);
    if (request === null) return;
    if (!requireLogin()) return; // 창을 연 뒤 로그아웃됐다 — 로그인 창만 띄우고 서버로는 안 보낸다
    sendPending.current = true;
    setSending(true);
    setFailed(null);
    try {
      await createPost(request);
      reset();
      onSubmitted(); // 목록을 다시 받는다
      onClose();
    } catch (e) {
      // 실패 — 창과 쓴 내용은 그대로
      if (isUnauthorized(e)) openLogin();
      setFailed(errorMessage(e, '글을 등록하지 못했어요.'));
    } finally {
      sendPending.current = false;
      setSending(false);
    }
  };

  const close = () => {
    setFailed(null);
    onClose();
  };

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, room)
      .map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        return { file, url };
      });
    setImages([...images, ...picked]);
  };

  const iconBtn = (on: boolean): React.CSSProperties => ({
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: R.control,
    background: on ? 'rgba(255,255,255,0.08)' : 'transparent',
    cursor: 'pointer',
  });

  return (
    <div
      className="absolute flex items-center justify-center"
      style={{ left: 0, top: 0, width: L.width, height: L.stageHeight, background: 'rgba(8, 8, 10, 0.68)', zIndex: 20 }}
    >
      <div
        role="dialog"
        aria-label="글쓰기"
        aria-modal="true"
        className="flex flex-col"
        style={{
          width: 660,
          height: Math.min(612, L.stageHeight - 40),
          boxSizing: 'border-box',
          padding: '16px 20px 0 20px',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: R.panel,
          background: '#26262B',
        }}
      >
        {/* 머리 — 내 이름 · 닫기 */}
        <div className="flex shrink-0 items-center" style={{ gap: 10 }}>
          <span
            className="inline-flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.18)' }}
          >
            <svg width="17" height="17" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <circle cx="7" cy="4.6" r="2.6" fill="none" stroke="#C6C6BE" strokeWidth="1.4" />
              <path d="M2.2 12.2c0-2.4 2.1-3.9 4.8-3.9s4.8 1.5 4.8 3.9" fill="none" stroke="#C6C6BE" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <b style={{ fontSize: 15 }}>{dummy.me.nickname}</b>
          <button type="button" aria-label="닫기" onClick={close} style={{ ...iconBtn(false), marginLeft: 'auto' }}>
            <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path d="M4 4 14 14M14 4 4 14" stroke="#B4B4AC" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <label htmlFor="dc-post-body" className="sr-only">
          본문
        </label>
        <textarea
          id="dc-post-body"
          ref={textarea}
          value={body}
          maxLength={MAX_LEN}
          onChange={(e) => setBody(e.target.value)}
          placeholder="의견을 남겨보세요"
          className="dc-scroll"
          style={{
            flexGrow: 1,
            minHeight: 60,
            marginTop: 13,
            padding: '4px 2px',
            boxSizing: 'border-box',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#EDEDEA',
            fontFamily: "'Gothic A1', sans-serif",
            fontSize: 14,
            lineHeight: 1.6,
            resize: 'none',
          }}
        />

        {/* 첨부한 사진 */}
        {images.length > 0 && (
          <div className="flex shrink-0" style={{ gap: 8, margin: '8px 0 10px' }}>
            {images.map((img, i) => (
              <div key={img.url} className="relative" style={{ width: 72, height: 72 }}>
                <img
                  src={img.url}
                  alt={`첨부 사진 ${i + 1}`}
                  style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: R.control, border: '1px solid rgba(255,255,255,0.12)' }}
                />
                <button
                  type="button"
                  aria-label={`사진 ${i + 1} 빼기`}
                  onClick={() => {
                    dropImage(img.url);
                    setImages(images.filter((x) => x !== img));
                  }}
                  className="absolute flex items-center justify-center"
                  style={{
                    right: 3,
                    top: 3,
                    width: 20,
                    height: 20,
                    border: 'none',
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.65)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                    <path d="M4 4 14 14M14 4 4 14" stroke="#EDEDEA" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 투표 만들기 — 선택지 2~4개. 질문은 본문이 대신한다 */}
        {poll && (
          <div
            className="flex shrink-0 flex-col"
            style={{ gap: 6, margin: '8px 0 12px', padding: 12, border: '1px solid rgba(255,255,255,0.12)', borderRadius: R.card }}
          >
            <div className="flex items-center" style={{ fontSize: 12, color: '#9A9A93' }}>
              <span>투표 선택지</span>
              <button
                type="button"
                onClick={() => setPoll(null)}
                style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: '#9A9A93', fontSize: 12, cursor: 'pointer' }}
              >
                투표 빼기
              </button>
            </div>
            {poll.map((opt, i) => (
              <div key={i} className="flex items-center" style={{ gap: 6 }}>
                <input
                  value={opt}
                  maxLength={POLL_OPTION_MAX}
                  onChange={(e) => setPoll(poll.map((o, j) => (j === i ? e.target.value : o)))}
                  placeholder={`선택지 ${i + 1}`}
                  aria-label={`선택지 ${i + 1}`}
                  style={{
                    flexGrow: 1,
                    height: 34,
                    padding: '0 10px',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: R.control,
                    background: 'transparent',
                    color: '#EDEDEA',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                {poll.length > POLL_MIN && (
                  <button
                    type="button"
                    aria-label={`선택지 ${i + 1} 빼기`}
                    onClick={() => setPoll(poll.filter((_, j) => j !== i))}
                    style={iconBtn(false)}
                  >
                    <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                      <path d="M4 4 14 14M14 4 4 14" stroke="#9A9A93" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {poll.length < POLL_MAX && (
              <button
                type="button"
                onClick={() => setPoll([...poll, ''])}
                style={{
                  height: 32,
                  border: '1px dashed rgba(255,255,255,0.18)',
                  borderRadius: R.control,
                  background: 'transparent',
                  color: '#9A9A93',
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                + 선택지 추가
              </button>
            )}
          </div>
        )}

        <p className="shrink-0" style={{ margin: '0 0 12px 0', fontSize: 11.5, color: '#6E6E68' }}>
          <a href="#top" style={{ color: '#9A9A93' }}>
            커뮤니티 이용규칙
          </a>{' '}
          광고 · 도배 · 비방 글을 남기면 활동이 영구적으로 제한될 수 있어요.
        </p>

        {/* 첨부 아이콘 · 남은 글자 수 */}
        <div className="flex shrink-0 items-center" style={{ gap: 2, paddingBottom: 14 }}>
          {/* 사진 첨부는 꺼 둠(PHOTO_ON) — 코드는 그대로 둔다 */}
          {PHOTO_ON && (
          <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addImages(e.target.files);
              e.target.value = ''; // 같은 사진을 다시 골라도 반응하게
            }}
          />
          <button
            type="button"
            aria-label="사진 첨부"
            title={images.length >= MAX_IMAGES ? `사진은 ${MAX_IMAGES}장까지` : '사진 첨부'}
            disabled={images.length >= MAX_IMAGES}
            onClick={() => fileInput.current?.click()}
            style={{ ...iconBtn(images.length > 0), opacity: images.length >= MAX_IMAGES ? 0.4 : 1 }}
          >
            <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <rect x="2.5" y="4" width="15" height="12" rx="1" fill="none" stroke="#9A9A93" strokeWidth="1.5" />
              <circle cx="7" cy="8.2" r="1.3" fill="#9A9A93" />
              <path d="M3.4 14.2 7.8 10l3 2.8 2.4-2 3.4 3.4" fill="none" stroke="#9A9A93" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </button>
          </>
          )}
          <button
            type="button"
            aria-label="투표 개설"
            aria-pressed={poll !== null}
            title="투표 개설"
            onClick={() => setPoll(poll ? null : ['', ''])}
            style={iconBtn(poll !== null)}
          >
            <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <rect x="3" y="4" width="14" height="3.2" rx="1" fill="none" stroke="#9A9A93" strokeWidth="1.5" />
              <rect x="3" y="9.4" width="10" height="3.2" rx="1" fill="none" stroke="#9A9A93" strokeWidth="1.5" />
              <path d="M3 15.8h6.5" stroke="#9A9A93" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span style={{ marginLeft: 'auto', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: '#6E6E68' }}>
            {(MAX_LEN - body.length).toLocaleString('ko-KR')}
          </span>
        </div>

        {/* 남기기 */}
        <div className="flex shrink-0 items-center" style={{ padding: '14px 0', borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
          {failed ? (
            // 등록 실패 — 목록의 안내 줄과 같은 빨강
            <span role="alert" style={{ fontSize: 12, color: '#FF8A80' }}>
              {failed}
            </span>
          ) : (
            poll && !pollOk && <span style={{ fontSize: 12, color: '#9A9A93' }}>선택지를 {POLL_MIN}개 이상 채워 주세요</span>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            style={{
              marginLeft: 'auto',
              height: 38,
              padding: '0 24px',
              border: 'none',
              borderRadius: R.control,
              background: '#EDEDEA',
              color: '#1C1C1E',
              fontFamily: "'Gothic A1', sans-serif",
              fontSize: 15,
              fontWeight: 700,
              cursor: sending ? 'progress' : canSend ? 'pointer' : 'default',
              opacity: canSend ? 1 : 0.45,
            }}
          >
            남기기
          </button>
        </div>
      </div>
    </div>
  );
}
