/**
 * hatDrop.ts — "annoying" motion hat gag for the NAVER character (naver_long_final.vrm).
 *
 * The hat (node "WingedHat", parented to the upperChest bone) falls off while the head snaps back,
 * flutters to the floor, and is put back on the pack while the character is crouched.
 * VRMA cannot animate props, so this runs in code alongside the VRMA clip.
 *
 * Usage
 *   const hat = createHatDrop(vrm);                 // once, after the VRM is loaded
 *   // every frame while the annoying clip plays (after mixer.update, before vrm.update):
 *   hat.update(Math.floor(annoyAction.time * 30));
 *   // when the clip finishes or is interrupted by another motion:
 *   hat.reset();
 *
 * All positions are in the character's own space (vrm.scene), so moving/scaling/rotating the
 * character on screen is fine. The floor is vrm.scene's local y = 0 (the feet).
 */
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

export interface HatDropOptions {
  nodeName?: string;          // hat node in the VRM
  fps?: number;               // frame rate of the VRMA
  dropFrame?: number;         // hat leaves the pack
  landFrame?: number;         // hat touches the floor
  backFrame?: number;         // hat is back on the pack
  /** crown direction of the hat as it hangs on the pack, in the hat mesh's own coordinates */
  hatUp?: THREE.Vector3;
  /** centre of the hat in the hat mesh's own coordinates (it tumbles around this point) */
  hatCenter?: THREE.Vector3;
  /** landing offset from where it fell, in character space (x: + = character's left, z: + = forward) */
  landOffset?: THREE.Vector3;
  popSpeed?: number;          // initial upward speed (m/s) when it pops off
  flutter?: number;           // sideways sway amplitude (m)
  flutterHz?: number;         // sway frequency
  landYaw?: number;           // final spin around the vertical axis (rad)
}

export interface HatDrop {
  update(frame: number): void;
  reset(): void;
  readonly state: 'on' | 'falling' | 'landed' | 'missing';
}

const DEFAULTS = {
  nodeName: 'WingedHat',
  fps: 30,
  dropFrame: 3,
  landFrame: 35,
  backFrame: 80,
  // measured on naver_long_final.vrm (hat hung on the right side of the pack)
  hatUp: new THREE.Vector3(-0.5076, 0.8559, 0.099),
  hatCenter: new THREE.Vector3(-0.2741, 1.3406, -0.2046),
  landOffset: new THREE.Vector3(-0.18, 0, 0.3),
  popSpeed: 0.55,
  flutter: 0.09,
  flutterHz: 1.7,
  landYaw: 0.6,
};

export function createHatDrop(vrm: VRM, options: HatDropOptions = {}): HatDrop {
  const o = { ...DEFAULTS, ...options };
  const root = vrm.scene;
  const node = root.getObjectByName(o.nodeName) ?? null;
  if (!node || !node.parent) {
    console.warn(`[hatDrop] "${o.nodeName}" not found — hat gag disabled`);
    return { update() {}, reset() {}, get state() { return 'missing' as const; } };
  }
  const hat = node;
  const homeParent = node.parent;
  const homePos = node.position.clone();
  const homeQuat = node.quaternion.clone();
  const homeScale = node.scale.clone();
  const hatUp = o.hatUp.clone().normalize();

  let state: 'on' | 'falling' | 'landed' = 'on';
  let pivot: THREE.Object3D | null = null;
  const start = new THREE.Vector3(), end = new THREE.Vector3();
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();

  /** matrix from the hat mesh's own coordinates to character space, right now */
  function hatToRoot(out: THREE.Matrix4): THREE.Matrix4 {
    root.updateMatrixWorld(true);
    out.copy(root.matrixWorld).invert().multiply(homeParent.matrixWorld)
      .multiply(tmpM.compose(homePos, homeQuat, homeScale));
    return out;
  }

  function reset(): void {
    if (pivot) { pivot.removeFromParent(); pivot = null; }
    homeParent.add(hat);
    hat.position.copy(homePos); hat.quaternion.copy(homeQuat); hat.scale.copy(homeScale);
    state = 'on';
  }

  function drop(): void {
    const m = hatToRoot(new THREE.Matrix4());
    const centre = o.hatCenter.clone().applyMatrix4(m);
    pivot = new THREE.Object3D();
    pivot.name = 'WingedHatPivot';
    pivot.position.copy(centre);
    root.add(pivot);
    pivot.updateMatrixWorld(true);
    pivot.attach(hat);                       // keeps the hat exactly where it is
    start.copy(centre); q0.copy(pivot.quaternion);

    // land upright: turn the current crown direction to straight up, then a little spin
    const up = hatUp.clone().transformDirection(m);
    q1.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.landYaw)
      .multiply(tmpQ.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0)));

    // how high the pivot must be for the brim to rest on the floor (exact, over all vertices)
    pivot.quaternion.copy(q1); pivot.updateMatrixWorld(true);
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    let minY = Infinity;
    hat.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute('position');
      const mm = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        tmpV.fromBufferAttribute(pos, i).applyMatrix4(mm);
        if (tmpV.y < minY) minY = tmpV.y;
      }
    });
    const lift = centre.y - minY;
    pivot.quaternion.copy(q0); pivot.updateMatrixWorld(true);

    end.set(centre.x + o.landOffset.x, lift + 0.002, centre.z + o.landOffset.z);
    state = 'falling';
  }

  const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
  const wob = new THREE.Quaternion(), eul = new THREE.Euler();

  function update(frame: number): void {
    if (state === 'on' && frame >= o.dropFrame && frame < o.backFrame) drop();
    if (pivot && (state === 'falling' || state === 'landed')) {
      const T = (o.landFrame - o.dropFrame) / o.fps;
      const t = THREE.MathUtils.clamp((frame - o.dropFrame) / o.fps, 0, T);
      const u = t / T;
      const v0 = o.popSpeed;
      const g = (2 * (start.y - end.y + v0 * T)) / (T * T);   // lands exactly on landFrame
      const w = t * Math.PI * 2 * o.flutterHz;
      const sway = Math.sin(w) * (1 - u);                         // flutter that dies out on landing
      pivot.position.set(
        start.x + (end.x - start.x) * easeOut(u) + sway * o.flutter,
        start.y + v0 * t - 0.5 * g * t * t,
        start.z + (end.z - start.z) * easeOut(u) + Math.cos(w) * o.flutter * 0.45 * (1 - u),
      );
      wob.setFromEuler(eul.set(sway * 0.45, 0, sway * 0.6));
      pivot.quaternion.slerpQuaternions(q0, q1, Math.min(1, u * 1.15)).multiply(wob);
      if (u >= 1) { pivot.position.copy(end); pivot.quaternion.copy(q1); state = 'landed'; }
    }
    if (frame >= o.backFrame && state !== 'on') reset();
  }

  return { update, reset, get state() { return state; } };
}
