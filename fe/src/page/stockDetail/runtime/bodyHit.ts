import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * 캐릭터를 눌렀는지 — 뼈를 잇는 캡슐(몸통 · 머리 · 팔 · 다리)과 광선의 거리로 본다.
 *
 * 메시 레이캐스트(intersectObject)는 뼈로 움직이는 메시의 삼각형마다 스키닝을 계산해서
 * 클릭 한 번에 60~290ms 가 걸렸다(네이버 약 180ms, 2026-11-15 측정) — 그동안 화면이 멈춘다.
 * 캡슐은 뼈 열몇 개의 위치만 보므로 1ms 도 안 걸리고, 자세를 따라간다.
 * 머리카락 · 치마 끝처럼 몸에서 먼 부분은 판정에서 빠진다.
 */

/** [시작 뼈, 끝 뼈, 반지름(키에 대한 비율)] — 끝 뼈가 없는 모델이면 그 캡슐은 건너뛴다 */
const SEGMENTS: readonly [VRMHumanBoneName, VRMHumanBoneName, number][] = [
  ['hips', 'spine', 0.11],
  ['spine', 'chest', 0.11],
  ['chest', 'neck', 0.1],
  ['leftUpperArm', 'leftLowerArm', 0.045],
  ['leftLowerArm', 'leftHand', 0.04],
  ['rightUpperArm', 'rightLowerArm', 0.045],
  ['rightLowerArm', 'rightHand', 0.04],
  ['leftUpperLeg', 'leftLowerLeg', 0.07],
  ['leftLowerLeg', 'leftFoot', 0.055],
  ['rightUpperLeg', 'rightLowerLeg', 0.07],
  ['rightLowerLeg', 'rightFoot', 0.055],
];

/** 광선(원점 o, 단위 방향 d — 앞쪽만)과 선분 ab 사이의 가장 가까운 거리 */
export function raySegmentDistance(o: THREE.Vector3, d: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const u = new THREE.Vector3().subVectors(b, a); // 선분 방향(길이 포함)
  const w = new THREE.Vector3().subVectors(a, o);
  const uu = u.dot(u);
  const ud = u.dot(d);
  const dw = d.dot(w);
  const uw = u.dot(w);
  // 1) 직선끼리 가장 가까운 선분 위 점 s(0~1로 자름) — d 는 단위 벡터라 d·d = 1
  const den = uu - ud * ud;
  let s = den > 1e-12 ? THREE.MathUtils.clamp((ud * dw - uw) / den, 0, 1) : 0;
  // 2) 그 점에 가장 가까운 광선 위 점 t(앞쪽만)
  const t = Math.max(0, dw + s * ud);
  // 3) 광선 위 그 점에 가장 가까운 선분 위 점으로 다시(t 를 잘랐을 때 맞춰 준다)
  const p = o.clone().addScaledVector(d, t);
  if (uu > 1e-12) s = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(u) / uu, 0, 1);
  return p.distanceTo(a.clone().addScaledVector(u, s));
}

/** 뼈 위치를 주는 쪽 — 없으면 null */
export type BonePos = (name: VRMHumanBoneName) => THREE.Vector3 | null;

/**
 * 광선이 몸에 닿는가.
 * height = 키(바닥에서 머리 꼭대기, m) — 반지름의 기준. headLen = 머리 뼈에서 머리 꼭대기까지(m)
 */
export function rayHitsBody(ray: THREE.Ray, bone: BonePos, height: number, headLen: number): boolean {
  const o = ray.origin;
  const d = ray.direction.clone().normalize();
  for (const [from, to, r] of SEGMENTS) {
    const a = bone(from);
    const b = bone(to);
    if (a && b && raySegmentDistance(o, d, a, b) <= r * height) return true;
  }
  // 머리 — 목에서 머리 뼈를 지나 머리 꼭대기까지, 목 → 머리 방향으로 늘린 캡슐
  const neck = bone('neck');
  const head = bone('head');
  if (neck && head) {
    const up = new THREE.Vector3().subVectors(head, neck);
    if (up.lengthSq() > 1e-12) {
      const top = head.clone().addScaledVector(up.normalize(), Math.max(0, headLen) * 0.6);
      const r = Math.max(0.07 * height, 0.5 * headLen);
      if (raySegmentDistance(o, d, head, top) <= r) return true;
    }
  }
  return false;
}
