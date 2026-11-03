/** 아직 내용이 없는 탭 — 자리만 잡아 둔다. 각 탭 파일이 내용을 채우면 이 컴포넌트는 지운다 */
export function PanelPlaceholder({ children }: { children: string }) {
  return <p className='dc-sb-empty'>{children}</p>;
}
