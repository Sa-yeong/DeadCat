import './panels.css';
import { useEffect, useState } from 'react';
import { LoginPrompt } from '../../../page/livingRoom/hud/LoginPrompt';
import { pct1, toneSoft } from '../../../page/stockDetail/format';
import { R } from '../../../page/stockDetail/radius';
import { useAuthToken } from '../../authToken';

/**
 * 팀 공용 로그인 창(종목리스트 하트와 같은 것). 로그인하면 지금 화면에 머문다 — 사이드바는 어느 화면에서나 열리므로.
 * 로그인이 끝나면 토큰이 생기는 것을 보고 스스로 닫는다
 */
export function SidebarLogin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const token = useAuthToken();
  useEffect(() => {
    if (open && token) onClose();
  }, [open, token, onClose]);
  return <LoginPrompt open={open} onClose={onClose} />;
}

/** 로그인해야 보이는 탭(보유 · 관심)의 본문 자리 — 누르면 로그인 창 */
export function LoginGate() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type='button' className='dc-sb-gate' onClick={() => setOpen(true)}>
        <span>로그인하면 보여요</span>
        <span className='dc-sb-gate-btn' style={{ borderRadius: R.control }}>
          로그인
        </span>
      </button>
      <SidebarLogin open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** 하트 — 찬 하트는 빨강(관심), 빈 하트는 흐린 선. 지워진 관심종목 레일과 같은 모양 */
function Heart({ on }: { on: boolean }) {
  return (
    <svg width='13' height='13' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path
        d='M12 20.5 4.2 12.9a4.9 4.9 0 0 1 0-7 4.7 4.7 0 0 1 6.7 0l1.1 1.1 1.1-1.1a4.7 4.7 0 0 1 6.7 0 4.9 4.9 0 0 1 0 7z'
        fill={on ? 'currentColor' : 'none'}
        stroke='currentColor'
        strokeWidth='1.8'
      />
    </svg>
  );
}

export interface LineItem {
  stock_code: string;
  stock_name: string;
  change_rate: number;
}

/**
 * 관심 · 전체 탭의 한 줄 — [하트][로고 · 이름 … 등락률]. 하트와 이동은 서로 다른 버튼이라
 * 하트를 눌러도 종목 화면으로 가지 않는다. 지금 보고 있는 종목 줄은 배경으로 강조
 */
export function StockLine({
  item,
  favorite,
  current,
  onHeart,
  onOpen,
}: {
  item: LineItem;
  favorite: boolean;
  current: boolean;
  onHeart: () => void;
  onOpen: () => void;
}) {
  return (
    <li className='dc-sb-line'>
      <button
        type='button'
        className='dc-sb-heart'
        data-on={favorite || undefined}
        onClick={onHeart}
        aria-label={`${item.stock_name} 관심 ${favorite ? '해제' : '등록'}`}
        aria-pressed={favorite}
      >
        <Heart on={favorite} />
      </button>
      <button
        type='button'
        className='dc-sb-open'
        data-current={current || undefined}
        aria-current={current ? 'page' : undefined}
        onClick={onOpen}
        style={{ borderRadius: R.control }}
      >
        <span className='dc-sb-name'>
          {/* 로고 자리 — 레일처럼 회색 원. 종목 로고 이미지가 생기면 여기에 */}
          <span className='dc-sb-logo' />
          <span className='dc-sb-ellipsis'>{item.stock_name}</span>
        </span>
        <span className='dc-sb-num' style={{ fontSize: 12, fontWeight: 700, color: toneSoft(item.change_rate) }}>
          {pct1(item.change_rate)}
        </span>
      </button>
    </li>
  );
}
