import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/axios';
import { readToken, useAuthToken } from '../../common/authToken';
import { useDemoMode } from '../../common/demo/demoMode';

/**
 * **데모 관리(졸프 데모 영상)** — 데모 계정(서버 DEMO_USER_IDS)에게만 보인다. 주소 /demo
 *  · 데모 계정 초기화 — 가입 직후 상태로(거래 · 보유 · 거실 · 커뮤니티 · 팔로우 · 출석 · 잔고 1억). 서버 POST /demo/reset
 *  · 가짜 시세 처음부터 — 시나리오를 처음부터(POST /demo/restart)
 *  · 거실 바로 가기 — 연출 거실(demo1: 네이버 tired · 엔비디아 놀리기, 줌 막대 바로 위 투명 버튼)
 */
interface Account {
  id: string;
  login_id: string;
  nickname: string;
}

const auth = () => ({ headers: { Authorization: `Bearer ${readToken() ?? ''}` } });
const errText = (e: unknown) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '실패했어요 — 잠시 뒤 다시 눌러 주세요';

export function DemoPage() {
  const token = useAuthToken();
  const { demo, roomUserIds } = useDemoMode();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  /** 한 번 더 눌러야 실행되는 계정(실수로 지우지 않게) */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !demo) return;
    api
      .get<{ data: Account[] }>('/demo/accounts', auth())
      .then((r) => setAccounts(r.data.data))
      .catch((e) => setNote(errText(e)));
  }, [token, demo]);

  if (!token || !demo) {
    return <Shell><p style={{ color: '#9A9AA0' }}>데모 계정으로 로그인하면 보이는 화면이에요.</p></Shell>;
  }

  const myId = (() => {
    try {
      return String(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub);
    } catch {
      return null;
    }
  })();

  const reset = async (a: Account) => {
    if (confirming !== a.id) {
      setConfirming(a.id);
      setNote(null);
      return;
    }
    setBusy(true);
    try {
      await api.post('/demo/reset', { user_id: a.id }, auth());
      setNote(`${a.login_id} 초기화 완료 — 잔고 1억, 보유 · 거실 · 기록 비움`);
    } catch (e) {
      setNote(errText(e));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const restart = async () => {
    setBusy(true);
    try {
      await api.post('/demo/restart', {}, auth());
      setNote('가짜 시세를 처음부터 다시 틀었어요');
    } catch (e) {
      setNote(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Section title="데모 계정 초기화" hint="가입 직후 상태로 — 거래 · 보유(거실 캐릭터) · 가구 · 아이템 · 출석 · 글 · 댓글 · 하트 · 팔로우를 지우고 잔고 1억. 계정 · 닉네임 · 프로필 이미지는 남아요">
        {accounts === null && !note && <p style={{ color: '#9A9AA0' }}>불러오는 중…</p>}
        {accounts?.map((a) => (
          <div key={a.id} style={row}>
            <span>
              <b>{a.login_id}</b> <span style={{ color: '#9A9AA0' }}>({a.nickname} · id {a.id}{a.id === myId ? ' · 지금 계정' : ''})</span>
            </span>
            <button type="button" disabled={busy} onClick={() => void reset(a)} style={confirming === a.id ? dangerBtn : btn}>
              {confirming === a.id ? '정말 초기화 — 한 번 더 누르기' : '초기화'}
            </button>
          </div>
        ))}
      </Section>

      <Section title="가짜 시세" hint="데모 계정에게 보이는 NVDA · 네이버 시세를 시나리오 처음부터 다시 틀어요">
        <button type="button" disabled={busy} onClick={() => void restart()} style={btn}>
          처음부터 다시
        </button>
      </Section>

      <Section title="거실" hint="연출 거실에선 네이버가 제자리에서 우울해(tired) 있어요. 줌 막대 바로 위 투명 버튼(화면엔 안 보임)을 누르고, 엔비디아를 꾹 눌러 들어 네이버 바로 옆에 놓으면 놀려요(연달아 해도 돼요)">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/room" style={btn}>내 거실</Link>
          {roomUserIds
            .filter((id) => id !== myId)
            .map((id) => (
              <Link key={id} to={`/room/${id}`} style={btn}>
                연출 거실({accounts?.find((a) => a.id === id)?.login_id ?? `id ${id}`})로 가기
              </Link>
            ))}
        </div>
      </Section>

      {note && <p role="status" style={{ marginTop: 16, color: '#EDEDEA' }}>{note}</p>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px', color: '#EDEDEA' }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 20 }}>데모 관리</h1>
      {children}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#1C1C1E', borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 12.5, color: '#9A9AA0', margin: '6px 0 12px' }}>{hint}</p>
      {children}
    </section>
  );
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 14px', border: 'none', borderRadius: 8, background: '#34343C', color: '#EDEDEA', fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' };
const dangerBtn: React.CSSProperties = { ...btn, background: '#C8424F' };
