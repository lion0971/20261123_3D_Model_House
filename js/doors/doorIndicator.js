import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { scene, camera } from '../core/renderer.js';
import { doorAnimations, doorIndicatorInstances, hintOccluders } from '../core/state.js';
import {
  DOOR_INDICATOR_RADIUS, DOOR_INDICATOR_HEIGHT_OFFSET, DOOR_INDICATOR_DIR_SAMPLE_DIST,DOOR_GROUPS,
} from '../data/constants.js';

// 指示器顯示秒數，時間到自動淡出
const DOOR_INDICATOR_SHOW_SECONDS = 1;

// ── pass 門專用參數 ──
const PASS_FORWARD_DIST = 0.5;    // 三角形位於門前幾公尺
const PASS_GROUND_OFFSET = 0.02;  // 離地高度（公尺），避免與地板 z-fighting
const PASS_RADIUS = 4.5;            // 出現距離（公尺）
const PASS_SIZE = 0.55;            // 三角形長度（公尺）
const PASS_WIDTH = 0.35;           // 三角形寬度（公尺）
const PASS_SWEEP_SECONDS = 1.0;   // 白色光帶掃過一次的時間
const PASS_FADE_SPEED = 6;        // 淡入淡出速度

// 總開關：false 時整體隱藏所有門方向指示器
export let SHOW_DOOR_INDICATORS = true;
window.SHOW_DOOR_INDICATORS = SHOW_DOOR_INDICATORS;

// 門名稱含 pass 就使用綠色平放三角形
function isPassDoorName(name) {
  return name.toLowerCase().includes('pass');
}

// 回傳門所屬的群組（門名稱陣列），不在任何群組則回傳 null
function getDoorGroup(name) {
  return DOOR_GROUPS.find(group => group.includes(name)) ?? null;
}

// ── 藍色指示器 CSS（與原本相同） ──
const doorIndicatorStyleTag = document.createElement('style');
doorIndicatorStyleTag.textContent = `
.door-indicator-root {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease-out;
}
.door-indicator-root.visible {
  opacity: 1;
}

.door-indicator-group {
  position: relative;
  width: 60px;
  height: 30px;
  transform-origin: center center;
  filter: drop-shadow(0 0 4px rgba(147,197,253,0.8));
}

.door-indicator-tri {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34px;
  height: 35px;
  transform: translate(-50%, -50%);
  background: rgba(147,197,253,0.55);
  clip-path: polygon(0% 0%, 100% 50%, 0% 100%);
  overflow: hidden;
}

.door-indicator-bar {
  position: absolute;
  top: -20%;
  left: 0;
  width: 10px;
  height: 140%;
  background: linear-gradient(90deg,
    rgba(255,255,255,0) 0%,
    rgba(255,255,255,0.95) 50%,
    rgba(255,255,255,0) 100%);
  transform: translateX(-14px);
  animation: doorIndicatorBarMove 1.2s linear infinite;
  animation-play-state: paused;
  will-change: transform;
}
.door-indicator-root.visible .door-indicator-bar {
  animation-play-state: running;
}

@keyframes doorIndicatorBarMove {
  from { transform: translateX(-14px); }
  to   { transform: translateX(40px); }
}
`;
document.head.appendChild(doorIndicatorStyleTag);

// ── pass 三角形：平放在 XZ 平面（法向量朝上），尖端指向 local +X ──
let _passGeometry = null;
function getPassGeometry() {
  if (_passGeometry) return _passGeometry;
  const shape = new THREE.Shape();
  shape.moveTo(0, -PASS_WIDTH / 2);
  shape.lineTo(PASS_SIZE, 0);
  shape.lineTo(0, PASS_WIDTH / 2);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);                 // 形狀的 XY 平面轉到 XZ 平面
  geo.translate(-PASS_SIZE / 2, 0, 0);       // 讓三角形中心對齊錨點
  _passGeometry = geo;
  return geo;
}

// 綠色三角形材質：底色綠、白色光帶沿 X 方向掃過
function createPassMaterial() {
  const half = (PASS_SIZE / 2).toFixed(3);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: `
      varying float vX;
      void main() {
        vX = position.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying float vX;
      void main() {
        float t = fract(uTime / ${PASS_SWEEP_SECONDS.toFixed(3)});
        float center = mix(-${half} - 0.3, ${half} + 0.3, t);
        float band = 1.0 - smoothstep(0.0, 0.18, abs(vX - center));
        vec3 base = vec3(0.290, 0.871, 0.502);   // #4ade80
        vec3 col = mix(base, vec3(1.0), band * 0.9);
        float a = (0.6 + band * 0.35) * uOpacity;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// 依門類型算出本地座標系的開門方向
export function getDoorOpenLocalDirection(anim) {
  if (!anim) return new THREE.Vector3(1, 0, 0);
  if (anim.type === 'sliding') {
    const sign = anim.slideSign ?? -1;
    if (anim.slideAxis === 'z') return new THREE.Vector3(0, 0, sign);
    if (anim.slideAxis === 'y') return new THREE.Vector3(0, sign, 0);
    return new THREE.Vector3(sign, 0, 0);
  }
  if (anim.type === 'turn_up') return new THREE.Vector3(0, 1, 0);
  const sign = anim.swingSign ?? -1;
  return new THREE.Vector3(-sign, 0, 0);
}

export function createDoorIndicator(name) {
  // pass 門不建立 DOM，改在 attach 時建立 3D 網格
  if (isPassDoorName(name)) {
    doorIndicatorInstances[name] = {
      isPass: true,
      mesh: null,
      worldNormal: null,
      base: null,
      groundY: 0,
      opacity: 0,
      shownElapsed: 0,
      shownDone: false,
    };
    return;
  }

  const wrapper = document.createElement('div');

  const root = document.createElement('div');
  root.className = 'door-indicator-root';

  const group = document.createElement('div');
  group.className = 'door-indicator-group';

  const tri = document.createElement('div');
  tri.className = 'door-indicator-tri';

  const bar = document.createElement('div');
  bar.className = 'door-indicator-bar';

  tri.appendChild(bar);
  group.appendChild(tri);
  root.appendChild(group);
  wrapper.appendChild(root);

  doorIndicatorInstances[name] = {
    wrapper, root, group,
    cssObject: null,
    isVisible: false,
    lastAngle: null,
    shownElapsed: 0,
    shownDone: false,
  };
}

// ── pass 門：掛載平放的三角形到場景 ──
const _toCam = new THREE.Vector3();
function attachPassIndicator(inst, anim, groupNames) {
  // 合併群組內所有門的範圍，取得整組的中心
  const box = new THREE.Box3();
  inst.groupAnims = [];
  for (const n of groupNames) {
    const a = doorAnimations[n];
    if (!a || !a.mesh) continue;
    inst.groupAnims.push(a);
    box.union(new THREE.Box3().setFromObject(a.mesh));
  }
  const center = box.getCenter(new THREE.Vector3());

  // 門的薄軸方向（法向量），取水平分量（以代表門為準）
  const axisMap = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const n = new THREE.Vector3(...(axisMap[anim.frontAxis] ?? [0, 0, 1]))
    .transformDirection(anim.mesh.matrixWorld);
  n.y = 0;
  if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
  else n.normalize();

  inst.worldNormal = n;
  inst.groundY = box.min.y + PASS_GROUND_OFFSET;
  inst.base = new THREE.Vector3(center.x, inst.groundY, center.z);

  inst.mesh = new THREE.Mesh(getPassGeometry(), createPassMaterial());
  inst.mesh.renderOrder = 10;
  inst.mesh.visible = false;
  scene.add(inst.mesh);

  updatePassPose(inst);
}

// 每幀依攝影機在門的哪一側，決定三角形位置與朝向（永遠平貼地面，指向門）
function updatePassPose(inst) {
  _toCam.set(camera.position.x - inst.base.x, 0, camera.position.z - inst.base.z);
  const side = inst.worldNormal.dot(_toCam) >= 0 ? 1 : -1;

  inst.mesh.position.set(
    inst.base.x + inst.worldNormal.x * side * PASS_FORWARD_DIST,
    inst.groundY,
    inst.base.z + inst.worldNormal.z * side * PASS_FORWARD_DIST
  );

  // 箭頭方向：從前方指向門
  const dx = -inst.worldNormal.x * side;
  const dz = -inst.worldNormal.z * side;
  // 繞 Y 軸旋轉 θ 時，local +X 會變成 (cosθ, 0, -sinθ)
  inst.mesh.rotation.set(0, Math.atan2(-dz, dx), 0);
}

function updatePassIndicator(inst, anim, delta) {
  updatePassPose(inst);
  inst.mesh.material.uniforms.uTime.value += delta;

  const dist = camera.position.distanceTo(inst.mesh.position);
  const inRange = dist <= PASS_RADIUS;
  const occluded = inRange && isIndicatorOccluded(inst.mesh.position, dist);

  let target = 0;
  if (!SHOW_DOOR_INDICATORS || anim.isOpen || !inRange) {
    // 門已開啟、不在範圍、或總開關關閉：淡出並重置計時
    inst.shownElapsed = 0;
    inst.shownDone = false;
  } else if (occluded || inst.shownDone) {
    // 被牆擋住，或本次靠近已顯示完畢
    target = 0;
  } else {
    inst.shownElapsed += delta;
    if (inst.shownElapsed >= DOOR_INDICATOR_SHOW_SECONDS) {
      inst.shownDone = true;
    } else {
      target = 1;
    }
  }

  inst.opacity += (target - inst.opacity) * Math.min(1, PASS_FADE_SPEED * delta);
  if (inst.opacity < 0.005) inst.opacity = 0;
  inst.mesh.material.uniforms.uOpacity.value = inst.opacity;
  inst.mesh.visible = inst.opacity > 0;
}

// 需於 buildScene 中 doorAnimations 填好後呼叫
export function attachDoorIndicatorsToScene() {
  Object.keys(doorAnimations).forEach(name => {
    if (!doorIndicatorInstances[name]) createDoorIndicator(name);
    const inst = doorIndicatorInstances[name];
    const anim = doorAnimations[name];
    if (!anim || !anim.mesh) return;

    if (inst.isPass) {
      const group = getDoorGroup(name);
      // 群組中非代表門不建立指示器
      if (group && group[0] !== name) return;
      if (!inst.mesh) attachPassIndicator(inst, anim, group ?? [name]);
      return;
    }

    if (inst.cssObject) return;

    const cssObject = new CSS2DObject(inst.wrapper);
    const x = anim.indicatorLocalX ?? 0;
    const y = anim.indicatorLocalY ?? DOOR_INDICATOR_HEIGHT_OFFSET;
    cssObject.position.set(x, y, 0);
    anim.mesh.add(cssObject);
    inst.cssObject = cssObject;
  });
}

const _doorIndicatorAnchor = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _localCenter = new THREE.Vector3();
const _localSample = new THREE.Vector3();
const _worldSample = new THREE.Vector3();

// 攝影機到目標之間是否有牆擋住（與 hints.js 相同做法）
const _occRaycaster = new THREE.Raycaster();
_occRaycaster.firstHitOnly = true;
const _occDir = new THREE.Vector3();

function isIndicatorOccluded(targetPos, dist) {
  if (hintOccluders.length === 0) return false;
  _occDir.copy(targetPos).sub(camera.position).normalize();
  _occRaycaster.set(camera.position, _occDir);
  _occRaycaster.far = Math.max(0, dist - 0.1);
  return _occRaycaster.intersectObjects(hintOccluders, false).length > 0;
}

function setDoorIndicatorVisible(inst, visible) {
  if (inst.isVisible === visible) return;
  inst.isVisible = visible;
  inst.root.classList.toggle('visible', visible);
}

export function updateDoorIndicators(delta) {
  if (!SHOW_DOOR_INDICATORS) {
    Object.keys(doorIndicatorInstances).forEach(name => {
      const inst = doorIndicatorInstances[name];
      if (!inst) return;
      if (inst.isPass) {
        if (inst.mesh) inst.mesh.visible = false;
        inst.opacity = 0;
        inst.shownElapsed = 0;
        inst.shownDone = false;
      } else {
        setDoorIndicatorVisible(inst, false);
        inst.shownElapsed = 0;
        inst.shownDone = false;
      }
    });
    return;
  }

  Object.keys(doorAnimations).forEach(name => {
    const inst = doorIndicatorInstances[name];
    const anim = doorAnimations[name];
    if (!inst || !anim) return;

    // pass 門：3D 平放三角形
    if (inst.isPass) {
      if (inst.mesh) updatePassIndicator(inst, anim, delta);
      return;
    }

    // 以下為藍色門，維持原本邏輯
    if (!inst.cssObject) return;

    inst.cssObject.getWorldPosition(_doorIndicatorAnchor);
    _p0.copy(_doorIndicatorAnchor).project(camera);
    const dist = camera.position.distanceTo(_doorIndicatorAnchor);
    const inRange = dist <= DOOR_INDICATOR_RADIUS && _p0.z < 1;
    const occluded = inRange && isIndicatorOccluded(_doorIndicatorAnchor, dist);

    if (anim.isOpen || !inRange) {
      setDoorIndicatorVisible(inst, false);
      inst.shownElapsed = 0;
      inst.shownDone = false;
      return;
    }

    if (occluded) {
      setDoorIndicatorVisible(inst, false);
      return;
    }

    if (inst.shownDone) {
      setDoorIndicatorVisible(inst, false);
      return;
    }

    if (inst.isVisible) {
      inst.shownElapsed = (inst.shownElapsed ?? 0) + delta;
      if (inst.shownElapsed >= DOOR_INDICATOR_SHOW_SECONDS) {
        setDoorIndicatorVisible(inst, false);
        inst.shownDone = true;
        return;
      }
    } else {
      setDoorIndicatorVisible(inst, true);
      inst.shownElapsed ??= 0;
    }

    _localCenter.set(anim.indicatorLocalX ?? 0, anim.indicatorLocalY ?? 0, 0);
    const openDirLocal = getDoorOpenLocalDirection(anim);
    _localSample.copy(_localCenter).addScaledVector(openDirLocal, DOOR_INDICATOR_DIR_SAMPLE_DIST);
    _worldSample.copy(_localSample).applyMatrix4(anim.mesh.matrixWorld);
    _p1.copy(_worldSample).project(camera);

    const sx0 = (_p0.x + 1) / 2 * window.innerWidth;
    const sy0 = (1 - _p0.y) / 2 * window.innerHeight;
    const sx1 = (_p1.x + 1) / 2 * window.innerWidth;
    const sy1 = (1 - _p1.y) / 2 * window.innerHeight;
    const dx = sx1 - sx0;
    const dy = sy1 - sy0;
    const angleDeg = (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6)
      ? Math.atan2(dy, dx) * 180 / Math.PI : 0;

    if (inst.lastAngle === null || Math.abs(angleDeg - inst.lastAngle) > 0.1) {
      inst.lastAngle = angleDeg;
      inst.group.style.transform = `rotate(${angleDeg.toFixed(1)}deg)`;
    }
  });
}