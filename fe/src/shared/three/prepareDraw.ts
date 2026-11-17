import type * as THREE from 'three';

/** 셰이더 준비를 기다리는 최대 시간 — 넘으면 그냥 보인다(그래픽 카드가 매우 느려도 캐릭터가 안 나오는 일은 없게) */
const MAX_WAIT_MS = 3000;

/**
 * **그리기 준비 뒤 보이기(마무리 L-2 · 결정 7)** — 모델을 화면에 보이기 전에 셰이더(표면을 칠하는 작은 프로그램)를
 * 준비하고 텍스처(모델에 입히는 그림)를 그래픽 카드에 올려 둔다. 안 하면 첫 그리기(0.2~0.6초) 동안 화면이 멈추고
 * 위에서부터 잘려 그려지는 모습이 보인다.
 *
 * `object` 는 아직 장면에 안 넣은 모델이어도 된다 — `scene`(넣을 장면)의 조명 · 안개 기준으로 준비한다.
 * three 의 `compileAsync` 와 같은 일을 하되, 기다리는 사이 화면을 떠나면(`alive()` false) 바로 멈춘다 —
 * 렌더러를 버린 뒤에 준비 상태를 묻다 오류가 나지 않게.
 */
export async function prepareDraw(
  renderer: THREE.WebGLRenderer,
  object: THREE.Object3D,
  camera: THREE.Camera,
  scene: THREE.Scene,
  alive: () => boolean = () => true,
): Promise<void> {
  if (!alive()) return;
  const materials = renderer.compile(object, camera, scene);
  for (const t of texturesOf(object)) renderer.initTexture(t);
  const start = performance.now();
  for (;;) {
    if (!alive()) return;
    for (const m of materials) {
      const program = (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram;
      if (!program || program.isReady()) materials.delete(m);
    }
    if (materials.size === 0 || performance.now() - start > MAX_WAIT_MS) return;
    await new Promise((ok) => setTimeout(ok, 10));
  }
}

/** 모델 안의 텍스처 전부 — 재질 속성 · 셰이더 재질(MToon)의 uniforms */
function texturesOf(root: THREE.Object3D): Set<THREE.Texture> {
  const out = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!m) continue;
      for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) out.add(v as THREE.Texture);
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) if ((u?.value as THREE.Texture | null)?.isTexture) out.add(u.value as THREE.Texture);
    }
  });
  return out;
}
