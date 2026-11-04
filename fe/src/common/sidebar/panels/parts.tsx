import './panels.css';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LoginPrompt } from '../../../page/livingRoom/hud/LoginPrompt';
import { R } from '../../../page/stockDetail/radius';
import { useAuthToken } from '../../authToken';
import { changeText, changeTone, priceText } from './lineModel';

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

/**
 * 스크롤 영역 — 넘친 쪽 끝만 살짝 흐려진다(맨 위면 위쪽은 안 흐림, 끝까지 내리면 아래쪽은 안 흐림).
 * 막대는 가늘고 둥글게(panels.css). 남은 높이를 다 차지하고 내용만 스크롤한다
 */
export function ScrollArea({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });
  const measure = () => {
    const el = box.current;
    if (!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setFade((f) => (f.top === top && f.bottom === bottom ? f : { top, bottom }));
  };
  // 칸 높이(주문내역을 펼치고 접음) · 내용(목록을 다시 받음)이 바뀌어도 다시 잰다
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className='dc-sb-scroll' data-fade-top={fade.top || undefined} data-fade-bottom={fade.bottom || undefined} onScroll={measure}>
      <div>{children}</div>
    </div>
  );
}

/** 하트 — 찬 하트는 빨강(관심), 빈 하트는 흐린 선. 지워진 관심종목 레일과 같은 모양 */
function Heart({ on }: { on: boolean }) {
  return (
    <svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path
        d='M12 20.5 4.2 12.9a4.9 4.9 0 0 1 0-7 4.7 4.7 0 0 1 6.7 0l1.1 1.1 1.1-1.1a4.7 4.7 0 0 1 6.7 0 4.9 4.9 0 0 1 0 7z'
        fill={on ? 'currentColor' : 'none'}
        stroke='currentColor'
        strokeWidth='1.8'
      />
    </svg>
  );
}

/** 썸네일 — 캐릭터 이미지. 없거나 못 불러오면 회색 원 */
function Thumb({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) return <span className='dc-sb-logo' />;
  return <img className='dc-sb-logo' src={url} alt='' loading='lazy' onError={() => setFailed(url)} />;
}

/**
 * 종목 한 줄 — 세 탭이 같이 쓴다. [lead(하트)] [썸네일] [이름 / sub(10주)] … [top(가격) / 아래 줄].
 * 탭마다 다른 것은 lead · sub · 오른쪽 값뿐이다. 하트와 이동은 서로 다른 버튼이라
 * 하트를 눌러도 종목 화면으로 가지 않는다. 지금 보고 있는 종목 줄은 배경으로 강조
 */
export function StockLine({
  name,
  thumb,
  lead,
  sub,
  top,
  amount,
  rate,
  current,
  onOpen,
}: {
  name: string;
  thumb: string | null | undefined;
  lead?: ReactNode;
  sub?: string;
  /** 오른쪽 위 — 가격 또는 평가금액(원) */
  top: number | null | undefined;
  /** 오른쪽 아래 — 금액(원, 모르면 null) · 비율(%) */
  amount: number | null | undefined;
  rate: number;
  current: boolean;
  onOpen: () => void;
}) {
  return (
    <li className='dc-sb-line' data-current={current || undefined} style={{ borderRadius: R.control }}>
      {lead}
      <button type='button' className='dc-sb-open' aria-current={current ? 'page' : undefined} onClick={onOpen} style={{ borderRadius: R.control }}>
        <Thumb url={thumb} />
        <span className='dc-sb-line-left'>
          <span className='dc-sb-line-name'>{name}</span>
          {sub && <span className='dc-sb-line-sub'>{sub}</span>}
        </span>
        <span className='dc-sb-line-right'>
          <span className='dc-sb-line-top'>{priceText(top)}</span>
          <span className='dc-sb-line-sub' style={{ color: changeTone(amount ?? rate) }}>
            {changeText(amount, rate)}
          </span>
        </span>
      </button>
    </li>
  );
}

export interface HeartItem {
  stock_code: string;
  stock_name: string;
  change_rate: number;
  character_img_url: string | null;
  current_price_krw?: number | null;
  change_price_krw?: number | null;
}

/** 관심 · 전체 탭의 한 줄 — 왼쪽에 하트, 오른쪽은 현재가 · 오늘 등락 */
export function HeartStockLine({
  item,
  favorite,
  current,
  onHeart,
  onOpen,
}: {
  item: HeartItem;
  favorite: boolean;
  current: boolean;
  onHeart: () => void;
  onOpen: () => void;
}) {
  return (
    <StockLine
      name={item.stock_name}
      thumb={item.character_img_url}
      lead={
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
      }
      top={item.current_price_krw}
      amount={item.change_price_krw}
      rate={item.change_rate}
      current={current}
      onOpen={onOpen}
    />
  );
}
