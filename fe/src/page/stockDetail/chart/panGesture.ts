/** 손을 뗀 뒤 이만큼(ms)은 끌기로 친다 — 터치는 놓은 뒤에도 관성으로 미끄러진다 */
export const RELEASE_GLIDE_MS = 700;

/**
 * 차트에 보이는 범위가 바뀌었을 때 그게 사용자가 끈 것인가 — 끈 것만 캐릭터를 민다.
 *
 * 봉이 아직 없을 때 시작한 누르기는 끌기가 아니다. 끌 것이 없고, 그동안 봉이 도착하면
 * 처음 구간으로 맞추는 큰 범위 변화가 끈 것으로 잡혀 캐릭터가 멀리 밀려나기 때문이다
 * (리스트의 종목을 두 번 눌러 두 번째 누르기가 막 뜬 차트에 떨어지는 경우).
 */
export class PanGesture {
  private pressed = false;
  private releasedAt = -Infinity;

  /** hasBars — 지금 차트에 봉이 있는가 */
  press(hasBars: boolean) {
    if (hasBars) this.pressed = true;
  }

  release(now: number) {
    if (!this.pressed) return;
    this.pressed = false;
    this.releasedAt = now;
  }

  byUser(now: number): boolean {
    return this.pressed || now - this.releasedAt < RELEASE_GLIDE_MS;
  }
}
