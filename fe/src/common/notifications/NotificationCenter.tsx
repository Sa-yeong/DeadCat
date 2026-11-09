import './NotificationCenter.css';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { down, up } from '../../page/stockDetail/format';
import { R } from '../../page/stockDetail/radius';
import { useAuthToken } from '../authToken';
import { startOrderFeed } from './orderFeed';
import { clearNotices, dismissNotice, getNotices, subscribeNotices, type Notice, type NoticePart } from './store';

/** 저절로 닫히기까지(ms) — 마우스를 올린 동안은 멈춘다 */
const SHOW_MS = 4000;

const STRIP = { BUY: up, SELL: down, FAIL: '#6E6E74' } as const;

/**
 * 앱 공용 알림 상자 — 화면 우하단. Root 에 하나 둔다.
 * 로그인한 동안 알림 통로를 열고, 로그아웃하면 닫고, 계정이 바뀌면 닫았다가 새로 연다.
 */
export function NotificationCenter() {
  const { pathname } = useLocation();
  const token = useAuthToken();
  const notices = useSyncExternalStore(subscribeNotices, getNotices);

  useEffect(() => {
    if (!token) return;
    const stop = startOrderFeed(token);
    return () => {
      stop();
      clearNotices();
    };
  }, [token]);

  return (
    <div className="dc-notices" aria-live="polite">
      {notices.map((n) => (
        <NoticeCard key={n.key} notice={n} pathname={pathname} />
      ))}
    </div>
  );
}

function NoticeCard({ notice, pathname }: { notice: Notice; pathname: string }) {
  const [hover, setHover] = useState(false);
  const left = useRef(SHOW_MS);

  useEffect(() => {
    if (hover) return;
    const started = Date.now();
    const t = window.setTimeout(() => dismissNotice(notice.key), left.current);
    return () => {
      window.clearTimeout(t);
      left.current -= Date.now() - started;
    };
  }, [hover, notice.key]);

  return (
    <div
      className="dc-notice"
      role="status"
      style={{ borderRadius: R.card }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="dc-notice-strip" style={{ background: STRIP[notice.tone] }} />
      {notice.title.length > 0 && <div className="dc-notice-title"><Parts parts={notice.title} pathname={pathname} /></div>}
      <div className="dc-notice-body"><Parts parts={notice.body} pathname={pathname} /></div>
      <button type="button" className="dc-notice-close" aria-label="알림 닫기" onClick={() => dismissNotice(notice.key)}>✕</button>
    </div>
  );
}

function Parts({ parts, pathname }: { parts: NoticePart[]; pathname: string }) {
  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === 'string') return <span key={i}>{p}</span>;
        if ('side' in p) {
          return <span key={i} style={{ color: p.side === 'BUY' ? up : down }}>{p.side === 'BUY' ? '매수' : '매도'}</span>;
        }
        const to = `/stocks/${encodeURIComponent(p.stock.code)}`;
        // 이미 그 종목 화면이면 그냥 글자
        return pathname === to ? <span key={i}>{p.stock.name}</span> : <Link key={i} to={to}>{p.stock.name}</Link>;
      })}
    </>
  );
}
