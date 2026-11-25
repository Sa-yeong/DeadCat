import * as THREE from 'three';

/**
 * **바닥 붙이기** — 몸 중심을 기준으로 눕혀 만든 모션(tired 등)은 틀면 몸이 그림자 위에 떠 있다.
 * 매 프레임 실제 모양(스키닝된 꼭짓점)의 가장 낮은 곳을 재서, 그만큼 몸을 내리면 바닥에 닿는다.
 * 꼭짓점을 다 보면 무거워서(치비 한 벌 수만 개) 메시마다 고르게 골라 둔 일부(합쳐 약 SAMPLE_TOTAL 개)만 본다.
 */
export const SAMPLE_TOTAL = 2000;

export interface GroundSample {
  mesh: THREE.Mesh;
  /** 이 메시에서 볼 꼭짓점 번호 */
  idx: number[];
}

/** 모델에서 볼 꼭짓점을 고른다 — 모델을 올릴 때 한 번(모델을 갈아 끼우면 다시) */
export function pickGroundSamples(root: THREE.Object3D, total = SAMPLE_TOTAL): GroundSample[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.visible && m.geometry?.getAttribute('position')) meshes.push(m);
  });
  const count = meshes.reduce((n, m) => n + m.geometry.getAttribute('position').count, 0);
  if (count === 0) return [];
  const stride = Math.max(1, Math.ceil(count / total));
  return meshes.map((mesh) => {
    const n = mesh.geometry.getAttribute('position').count;
    const idx: number[] = [];
    for (let i = 0; i < n; i += stride) idx.push(i);
    return { mesh, idx };
  });
}

const v = new THREE.Vector3();
const toSpace = new THREE.Matrix4();

/**
 * 지금 자세에서 가장 낮은 높이 — space(예: 캐릭터 몸 자리 figure)의 좌표로. 바닥은 space 의 y = 0.
 * space 아래 월드 행렬을 여기서 새로 맞춘 뒤 잰다 — 스키닝은 뼈의 월드 행렬을 바로 쓴다(three SkinnedMesh.applyBoneTransform).
 * 그리기 전에 불러도 된다. 볼 꼭짓점이 없으면 null
 */
export function lowestY(samples: readonly GroundSample[], space: THREE.Object3D): number | null {
  if (samples.length === 0) return null;
  space.updateMatrixWorld(true);
  toSpace.copy(space.matrixWorld).invert();
  let min = Infinity;
  for (const s of samples) {
    for (const i of s.idx) {
      s.mesh.getVertexPosition(i, v); // 메시 좌표 — 표정(morph) · 스키닝까지 들어간 지금 모양
      v.applyMatrix4(s.mesh.matrixWorld).applyMatrix4(toSpace);
      if (v.y < min) min = v.y;
    }
  }
  return min === Infinity ? null : min;
}

/**
 * 가장 낮은 높이(low, 몸 자리 좌표) → 몸을 옮길 높이(칸, + 위 · − 아래).
 *   맞추기(GROUND_CLIPS — tired)   위아래 둘 다 — 가장 낮은 곳이 바닥에 닿게
 *   올리기만(RAISE_ONLY_CLIPS — fall_down) 바닥 아래로 들어간 만큼만 올린다. 바닥 위에 있으면 그대로(넘어지는 중간 공중 자세를 끌어내리지 않게)
 */
export function groundShift(low: number, raiseOnly: boolean): number {
  return raiseOnly ? Math.max(0, -low) : -low;
}
