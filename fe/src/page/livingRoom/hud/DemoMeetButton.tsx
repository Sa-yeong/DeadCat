/**
 * 데모 트리거 버튼(졸프 데모 영상) — 연출 거실(demo1)에서만, **보이지 않는 버튼**(영상에 안 나오게).
 * 자리는 줌 막대 바로 위, 줌 막대와 같은 폭(200) · 높이(42) — 도휘가 알고 누른다.
 * 누를 때마다 켜고 끈다: 켜져 있는 동안 엔비디아를 들어 네이버 옆에 놓으면 매번 놀리기(쿨다운 무시), 다시 누르면 꺼짐(runtime/roomDemo.ts).
 * 화면에 아무 표시도 하지 않는다 — 안내 문구 · 손 모양 커서 · 눌림 효과 · 포커스 테두리 없음
 */
export function DemoMeetButton({ right, bottomAt, onToggle }: { right: number; bottomAt: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label="놀리기 준비"
      tabIndex={-1}
      onClick={onToggle}
      style={{
        position: 'absolute',
        right,
        top: bottomAt,
        transform: 'translateY(-100%)',
        zIndex: 5,
        width: 200,
        height: 42,
        padding: 0,
        border: 'none',
        background: 'transparent',
        opacity: 0,
        cursor: 'default',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        transition: 'right 0.35s ease',
      }}
    />
  );
}
