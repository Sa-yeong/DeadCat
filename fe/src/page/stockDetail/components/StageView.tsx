import type { ReactNode } from 'react';
import { useLayout } from '../layout';
import { FloorGrid } from './FloorGrid';
import characterFront from '../character-front.png';
import { R } from '../radius';

/** 막에 가린 부분의 처리 — 블러 + 어둡게 (2026-09-24 팀 확정) */
const COVERED_FILTER = 'blur(3px) brightness(0.28) saturate(0.7)'; // 2026-09-29 흐림 절반(6→3)
const FILM = 'rgba(28, 28, 30, 0.82)';

/**
 * 3D 캐릭터일 때의 막 — 막 자체가 뒤를 흐리게 한다(backdrop-filter).
 * 캔버스를 막 아래에 두면 씬은 한 번만 그리고 창문 밖만 흐려진다.
 * 막이 캐릭터 위를 덮으므로 PNG 때의 어둡게(brightness)는 막 색이 대신한다.
 */
const FROST = 'blur(3px) saturate(0.7)'; // 2026-09-29 흐림 절반(6→3)

/**
 * 반투명 벽 — 창문 자리만 비워두고 무대를 덮는 네 개의 띠.
 * 창문이 닫혀 있으면(기업정보·커뮤니티 탭) 창문 자리도 같은 막으로 메운다 — 창틀 테두리는 남는다.
 */
export function CoverFilm({ frosted = false, windowOpen = true }: { frosted?: boolean; windowOpen?: boolean }) {
  const L = useLayout();
  const { win } = L;
  const band = 'pointer-events-none absolute';
  const look: React.CSSProperties = frosted
    ? { background: FILM, backdropFilter: FROST, WebkitBackdropFilter: FROST }
    : { background: FILM };
  // 막 한 장에 둥근 창문 구멍을 낸다(evenodd). 네 띠로 나누면 둥근 모서리 바깥이 뚫린 채 남는다
  const r = R.panel;
  const { left: x0, top: y0, right: x1, bottom: y1 } = win;
  const hole = windowOpen
    ? ` M${x0 + r} ${y0} H${x1 - r} A${r} ${r} 0 0 1 ${x1} ${y0 + r} V${y1 - r} A${r} ${r} 0 0 1 ${x1 - r} ${y1}` +
      ` H${x0 + r} A${r} ${r} 0 0 1 ${x0} ${y1 - r} V${y0 + r} A${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`
    : '';
  return (
    <div
      className={band}
      style={{
        left: 0,
        top: 0,
        width: L.width,
        height: L.stageHeight,
        clipPath: `path(evenodd, 'M0 0 H${L.width} V${L.stageHeight} H0 Z${hole}')`,
        ...look,
      }}
    />
  );
}

/**
 * 캐릭터 — 막에 가린 전체를 블러로 깔고, 창문 안쪽만 선명한 복사본을 덮는다.
 *
 * 3D 캐릭터가 준비되기 전과, 3D를 쓸 수 없을 때(WebGL 불가·파일 실패) 쓰는 그림 판.
 * 3D는 두 번 그리지 않는다 — StageView 참고.
 */
export function CharacterLayer({ windowOpen = true }: { windowOpen?: boolean }) {
  const L = useLayout();
  const c = L.character;
  const { win, winWidth, winHeight } = L;
  const img: React.CSSProperties = {
    width: c.width,
    height: c.height,
    objectFit: 'contain',
    objectPosition: 'top center',
    display: 'block',
  };
  return (
    <>
      <img
        src={characterFront}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{ ...img, left: c.left, top: c.top, filter: COVERED_FILTER }}
      />
      <div
        className="pointer-events-none absolute overflow-hidden"
        style={{ left: win.left, top: win.top, width: winWidth, height: winHeight, borderRadius: R.panel, visibility: windowOpen ? 'visible' : 'hidden' }}
      >
        <img
          src={characterFront}
          alt="종목 캐릭터"
          className="absolute"
          style={{ ...img, left: c.left - win.left, top: c.top - win.top }}
        />
      </div>
    </>
  );
}

/** 창틀 — 뚫린 창의 테두리 */
export function WindowFrame() {
  const { win, winWidth, winHeight } = useLayout();
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: win.left,
        top: win.top,
        width: winWidth,
        height: winHeight,
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: R.panel,
      }}
    />
  );
}

/**
 * 무대 — 그리는 순서가 곧 공간이다.
 * 캐릭터가 있는 공간 / 창문이 난 벽 / 사용자 라는 구도를 DOM 순서로 만든다.
 *
 *   3D   : 3D 씬(격자 바닥·안개·캐릭터, 캔버스 한 장) → 막(뒤를 흐림) → 창틀
 *   그림 : 바닥 → 막 → 캐릭터(흐린 판 + 창문 안 선명한 판) → 창틀
 *
 * 3D는 씬을 한 번만 그리고, 창문 밖이 흐린 것은 막이 해 준다.
 * 그림은 두 장을 겹쳐도 비용이 없어 예전 방식 그대로 둔다(로딩 중·실패 시).
 *
 * windowOpen — 차트 탭에서만 창문이 뚫려 있다. 다른 탭은 창문 자리도 막으로 메운다.
 */
export function StageView({ scene, live, windowOpen }: { scene: ReactNode; live: boolean; windowOpen: boolean }) {
  return (
    <>
      {/* 3D가 준비되면 바닥도 3D 씬이 그린다 — 그림 격자는 그 전·실패 시에만 */}
      {!live && <FloorGrid />}
      {scene}
      <CoverFilm frosted={live} windowOpen={windowOpen} />
      {!live && <CharacterLayer windowOpen={windowOpen} />}
      <WindowFrame />
    </>
  );
}
