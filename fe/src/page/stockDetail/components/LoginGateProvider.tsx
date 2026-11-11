import { useMemo, useState, type ReactNode } from 'react';
import { readToken, useAuthToken } from '../../../common/authToken';
import { LoginPrompt } from '../../livingRoom/hud/LoginPrompt';
import { LoginGateContext, type LoginGate } from '../loginGate';

/**
 * 로그인 문(loginGate.ts)의 창 — 거실과 같은 팀 공용 로그인 팝업(LoginPrompt)을 띄운다.
 * 로그인하면 지금 주소로 돌아오고, 토큰이 바뀐 것을 보고 스스로 닫는다.
 */
export function LoginGateProvider({ children }: { children: ReactNode }) {
  const token = useAuthToken();
  // 창을 띄울 때의 토큰을 같이 든다 — 그 뒤 토큰이 바뀌면(로그인 됨) 닫힌 것으로 본다
  const [asked, setAsked] = useState<{ token: string | null } | null>(null);
  if (asked && asked.token !== token) setAsked(null);
  const open = asked !== null && asked.token === token;

  const gate = useMemo<LoginGate>(
    () => ({
      requireLogin: () => {
        const now = readToken();
        if (now !== null) return true;
        setAsked({ token: now });
        return false;
      },
      openLogin: () => setAsked({ token: readToken() }),
    }),
    [],
  );

  return (
    <LoginGateContext.Provider value={gate}>
      {children}
      <LoginPrompt open={open} onClose={() => setAsked(null)} />
    </LoginGateContext.Provider>
  );
}
