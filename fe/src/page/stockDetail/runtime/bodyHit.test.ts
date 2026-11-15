import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { rayHitsBody, raySegmentDistance } from './bodyHit';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('raySegmentDistance — 광선과 선분의 거리', () => {
  const a = v(0, 0, 0);
  const b = v(0, 1, 0);
  it('선분을 지나는 광선은 0', () => {
    expect(raySegmentDistance(v(0, 0.5, 5), v(0, 0, -1), a, b)).toBeCloseTo(0);
  });
  it('옆으로 비켜 간 광선은 비켜 간 만큼', () => {
    expect(raySegmentDistance(v(0.3, 0.5, 5), v(0, 0, -1), a, b)).toBeCloseTo(0.3);
  });
  it('선분 끝보다 위로 지나가면 끝점까지의 거리', () => {
    expect(raySegmentDistance(v(0, 1.4, 5), v(0, 0, -1), a, b)).toBeCloseTo(0.4);
  });
  it('뒤쪽(광선 반대편)에 있는 선분은 원점에서 잰다', () => {
    expect(raySegmentDistance(v(0, 0.5, 5), v(0, 0, 1), a, b)).toBeCloseTo(5);
  });
  it('나란한 광선', () => {
    expect(raySegmentDistance(v(0.2, -3, 0), v(0, 1, 0), a, b)).toBeCloseTo(0.2);
  });
});

describe('rayHitsBody — 뼈 캡슐 판정', () => {
  // 키 1.5m, 정면(+z)에서 보는 사람 모양
  const bones: Record<string, THREE.Vector3> = {
    hips: v(0, 0.8, 0), spine: v(0, 0.95, 0), chest: v(0, 1.1, 0), neck: v(0, 1.3, 0), head: v(0, 1.35, 0),
    leftUpperArm: v(0.15, 1.25, 0), leftLowerArm: v(0.35, 1.25, 0), leftHand: v(0.55, 1.25, 0),
    rightUpperArm: v(-0.15, 1.25, 0), rightLowerArm: v(-0.35, 1.25, 0), rightHand: v(-0.55, 1.25, 0),
    leftUpperLeg: v(0.08, 0.78, 0), leftLowerLeg: v(0.08, 0.42, 0), leftFoot: v(0.08, 0.05, 0),
    rightUpperLeg: v(-0.08, 0.78, 0), rightLowerLeg: v(-0.08, 0.42, 0), rightFoot: v(-0.08, 0.05, 0),
  };
  const bone = (n: string) => bones[n]?.clone() ?? null;
  const shoot = (x: number, y: number) => rayHitsBody(new THREE.Ray(v(x, y, 5), v(0, 0, -1)), bone, 1.5, 0.15);

  it('몸통 · 머리 · 팔 · 다리를 누르면 닿는다', () => {
    expect(shoot(0, 1.0)).toBe(true);
    expect(shoot(0, 1.45)).toBe(true);
    expect(shoot(0.5, 1.25)).toBe(true);
    expect(shoot(-0.08, 0.3)).toBe(true);
  });
  it('몸 옆 빈자리 · 머리 위는 닿지 않는다', () => {
    expect(shoot(0.5, 0.9)).toBe(false);
    expect(shoot(0, 1.8)).toBe(false);
    expect(shoot(1.2, 1.0)).toBe(false);
  });
  it('뼈가 없는 모델이면 그 캡슐만 건너뛴다', () => {
    const none = () => null;
    expect(rayHitsBody(new THREE.Ray(v(0, 1, 5), v(0, 0, -1)), none, 1.5, 0.15)).toBe(false);
  });
});
