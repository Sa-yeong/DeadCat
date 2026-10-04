import * as THREE from 'three';

/**
 * 캐릭터 뒤 3D 공간 — 무한히 뻗는 격자 바닥 + 지평선 안개.
 *
 * 예전 그림(SVG) 격자를 실제 3D 바닥으로 바꾼 것이다. 캐릭터가 이 바닥 위에 서 있고,
 * 카메라가 움직이면(차트 슬라이드·줌 연동) 바닥도 같은 원근으로 따라 움직인다.
 *
 * 비용 — 사각형 두 장 + 짧은 셰이더뿐이라 내장 그래픽에서도 부담이 없다.
 * 안개는 공기 효과를 흉내 낸 것: 멀어질수록 격자가 배경색 쪽으로 옅어진다.
 */

/** 격자 한 칸 크기(m) — 캐릭터 키(약 1.5m) 기준으로 그림 시안의 칸 간격과 비슷하게 */
const CELL = 0.5;
/** 굵은 선 간격(칸 수) — 멀리서도 원근이 읽히게 몇 칸마다 조금 진한 선 */
const MAJOR_EVERY = 4;
/** 선 밝기 — 그림 시안의 흰색 16% */
const LINE_ALPHA = 0.16;
const MAJOR_ALPHA = 0.24;
/** 지평선 안개 판까지 거리(m) — 바닥이 이 거리에서 다 녹는다. 망원 카메라라 꽤 멀어야 지평선까지 닿는다 */
const HAZE_DIST = 160;
/** 지평선 안개 색·짙기 — 배경(#1C1C1E)보다 조금 밝은 회청색. 셰이더가 색 공간 변환 없이 내보내므로 sRGB 값 그대로 */
const HAZE_COLOR = new THREE.Vector3(0x3a, 0x3a, 0x44).divideScalar(255);
const HAZE_ALPHA = 0.5;

export interface EnvironmentLook {
  /** 안개가 시작되는 거리 / 다 덮는 거리(카메라 기준, m) */
  fogNear: number;
  fogFar: number;
}

export class StageEnvironment {
  readonly group = new THREE.Group();
  private readonly floorMat: THREE.ShaderMaterial;
  private readonly hazeMat: THREE.ShaderMaterial;
  private readonly haze: THREE.Mesh;

  constructor() {
    // ── 바닥: 넓은 평면 하나. 격자는 셰이더가 그린다(선 굵기가 거리와 상관없이 1px 안팎) ──
    this.floorMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uFogNear: { value: 8 },
        uFogFar: { value: 60 },
        uCell: { value: CELL },
        uMajor: { value: MAJOR_EVERY },
        uLine: { value: LINE_ALPHA },
        uMajorLine: { value: MAJOR_ALPHA },
        uHaze: { value: HAZE_COLOR },
        uHazeAlpha: { value: HAZE_ALPHA },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uCam;
        uniform float uFogNear, uFogFar, uCell, uMajor, uLine, uMajorLine, uHazeAlpha;
        uniform vec3 uHaze;
        varying vec3 vWorld;

        // 한 방향 격자선 — 화면 픽셀 기준 굵기(fwidth). 칸이 화면에서 너무 작아지면(먼 곳) 옅게 해
        // 선이 뭉쳐 어른거리는 것(모아레)을 막는다. 가로선·세로선을 따로 다뤄야, 멀리서 촘촘해지는
        // 가로선만 사라지고 소실점으로 모이는 세로선은 지평선까지 남는다(그림 시안과 같은 모양).
        float lineAxis(float c, float size) {
          float g = c / size;
          float w = max(fwidth(g), 1e-4);
          float l = 1.0 - min(abs(fract(g - 0.5) - 0.5) / w, 1.0);
          return l * smoothstep(3.0, 10.0, 1.0 / w);
        }

        void main() {
          vec2 p = vWorld.xz;
          float minor = max(lineAxis(p.x, uCell), lineAxis(p.y, uCell));
          float major = max(lineAxis(p.x, uCell * uMajor), lineAxis(p.y, uCell * uMajor));
          float a = max(minor * uLine, major * uMajorLine);

          // 안개 — 멀수록 선은 옅어지고, 대신 지평선 안개 색이 차오른다.
          // 가장 먼 곳의 안개 농도를 뒤의 안개 판 아랫단(uHazeAlpha)과 같게 맞춰 지평선에 이음매가 없게 한다.
          float dist = length(vWorld - uCam);
          float fog = smoothstep(uFogNear, uFogFar, dist);
          if (fog >= 1.0) discard; // 그 너머는 안개 판이 맡는다(두 번 겹쳐 밝아지지 않게)
          a *= 1.0 - fog;

          // 캐릭터 발밑 둘레를 살짝 밝힌다 — 공간의 중심이 어디인지
          float pool = 1.0 - smoothstep(0.0, 3.5, length(p));
          a = min(a + pool * 0.05, 1.0);

          float h = pow(fog, 2.0) * uHazeAlpha;
          float outA = a + h * (1.0 - a);
          vec3 col = (vec3(1.0) * a + uHaze * h * (1.0 - a)) / max(outA, 1e-4);
          gl_FragColor = vec4(col, outA);
        }
      `,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = -2; // 캐릭터보다 먼저(뒤에) 그린다
    this.group.add(floor);

    // ── 지평선 안개: 멀리 세운 큰 판. 바닥과 만나는 곳이 가장 짙고 위로 갈수록 사라진다 ──
    this.hazeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // 셰이더가 색을 그대로 내보내므로(색 공간 변환 없음) 화면에 보일 sRGB 값을 그대로 넣는다
      uniforms: { uColor: { value: HAZE_COLOR }, uHeight: { value: 9 }, uAlpha: { value: HAZE_ALPHA } },
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vY = w.y; // 바닥(y=0)에서의 높이(m)
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uHeight, uAlpha;
        varying float vY;
        void main() {
          float t = clamp(vY / uHeight, 0.0, 1.0);
          float a = pow(1.0 - t, 2.2) * uAlpha;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.hazeMat);
    this.haze.renderOrder = -3;
    this.group.add(this.haze);
  }

  /**
   * 카메라가 바뀔 때마다 — 안개 거리와 지평선 판 위치를 카메라에 맞춘다.
   * 캐릭터는 원점, 카메라는 +z 쪽에서 -z 방향을 본다.
   */
  update(camera: THREE.PerspectiveCamera) {
    const d = camera.position.z; // 카메라 ↔ 캐릭터 거리
    this.floorMat.uniforms.uCam.value.copy(camera.position);
    // 캐릭터 조금 뒤부터 옅어지기 시작해, 꽤 멀리서 다 사라진다
    this.floorMat.uniforms.uFogNear.value = d + 2;
    this.floorMat.uniforms.uFogFar.value = d + HAZE_DIST;

    // 안개 판 — 바닥이 다 사라지는 거리쯤에, 화면을 넉넉히 덮는 크기로
    const z = -HAZE_DIST;
    const span = (d - z) * Math.tan(THREE.MathUtils.degToRad(camera.fov)) * 4;
    this.haze.position.set(camera.position.x, 0, z);
    this.haze.scale.set(span, 18, 1);
    this.haze.position.y = 9 - 0.01; // 판 아랫변이 바닥(y=0)에 닿게
    this.hazeMat.uniforms.uHeight.value = 18;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    this.floorMat.dispose();
    this.hazeMat.dispose();
  }
}
