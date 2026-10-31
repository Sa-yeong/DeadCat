import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import Login from '../../../common/Login';
import { LoginModal } from '../../../modal/LoginModal';
import { useEscape } from './useEscape';

/**
 * 팀 공용 로그인 창(종목 리스트 관심 종목과 같은 것)을 거실에서 띄운다.
 * body 로 빼서 그린다 — 거실 화면(.dc-screen)의 글자색·box-sizing·입력칸 규칙이 팀 창에 묻지 않게.
 * Esc 는 로그인 입력칸에 커서가 있어도 바로 창을 닫는다.
 * 로그인하면 지금 주소로 돌아온다 — 거실 페이지가 그 이동을 보고 토큰으로 거실을 새로 연다(LivingRoomPage).
 */
export function LoginPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname, search } = useLocation();
  useEscape(open ? onClose : null, { evenInInputs: true });
  if (!open) return null;
  return createPortal(<LoginModal isOpen onClose={onClose} children={<Login redirectTo={pathname + search} />} />, document.body);
}
