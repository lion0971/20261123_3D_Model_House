import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { scene, camera } from '../core/renderer.js';
import { doorAnimations, doorIndicatorInstances, hintOccluders } from '../core/state.js';
import {
  DOOR_INDICATOR_RADIUS, DOOR_INDICATOR_INTERVAL, DOOR_INDICATOR_HEIGHT_OFFSET,
  DOOR_INDICATOR_DIR_SAMPLE_DIST,
} from '../data/constants.js';
// ── 新增：指示器顯示秒數，時間到自動淡出 ──
const DOOR_INDICATOR_SHOW_SECONDS = 1;

// ── pass 門專用指示器參數 ──
const DOOR_PASS_FORWARD_DIST = 0.5;   // 門前方幾公尺
const DOOR_PASS_HEIGHT_OFFSET = 0.05; // 離地高度（公尺），讓它貼在地面
const DOOR_PASS_SAMPLE_DIST = 0.8;    // 用來計算螢幕角度的取樣距離
const DOOR_PASS_DROP = 1.5; // 門中心往下幾公尺
const DOOR_PASS_RADIUS = 5; // pass 門綠三角開始出現的距離（公尺）

// 門名稱含 pass 就使用 pass 指示器
function isPassDoorName(name) {
  return name.toLowerCase().includes('pass');
}

const _tmpToCam = new THREE.Vector3();

// 總開關：false 時整體隱藏所有門方向指示器
export let SHOW_DOOR_INDICATORS = true;
window.SHOW_DOOR_INDICATORS = SHOW_DOOR_INDICATORS;

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

/* 三角形外框：用 clip-path 裁成朝右的三角，條狀超出的部分會被裁掉 */
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

/* 白色條狀：常駐循環，只用 transform 位移 */
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
  animation-play-state: paused;   /* 隱藏時暫停，不佔合成資源 */
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

// ── 步驟 3 新增：pass 門指示器的 CSS ──
const passIndicatorStyleTag = document.createElement('style');
passIndicatorStyleTag.textContent = `
.pass-indicator-group {
  position: relative;
  width: 60px;
  height: 50px;
  transform-origin: center center;
  filter: drop-shadow(0 0 4px rgba(74,222,128,0.8));
}
.pass-indicator-tri {
  position: absolute;
  inset: 0;
  background: rgba(74,222,128,0.6);
  clip-path: polygon(0% 0%, 100% 50%, 0% 100%);
  overflow: hidden;
}
.pass-indicator-bar {
  position: absolute;
  top: -20%;
  left: 0;
  width: 16px;
  height: 140%;
  background: linear-gradient(90deg,
    rgba(255,255,255,0) 0%,
    rgba(255,255,255,0.95) 50%,
    rgba(255,255,255,0) 100%);
  transform: translateX(-24px);
  animation: passBarMove 1s linear infinite;
  animation-play-state: paused;
  will-change: transform;
}
.door-indicator-root.visible .pass-indicator-bar {
  animation-play-state: running;
}
@keyframes passBarMove {
  from { transform: translateX(-24px); }
  to   { transform: translateX(90px); }
}
`;
document.head.appendChild(passIndicatorStyleTag);

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

  if (isPassDoorName(name)) return createPassIndicator(name);

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
  };
}

// 建立 pass 門專用的指示器 DOM
function createPassIndicator(name) {
  const wrapper = document.createElement('div');

  const root = document.createElement('div');
  root.className = 'door-indicator-root pass-indicator-root';

  const group = document.createElement('div');
  group.className = 'pass-indicator-group';

  const tri = document.createElement('div');
  tri.className = 'pass-indicator-tri';

  const bar = document.createElement('div');
  bar.className = 'pass-indicator-bar';

  tri.appendChild(bar);
  group.appendChild(tri);
  root.appendChild(group);
  wrapper.appendChild(root);

  doorIndicatorInstances[name] = {
    wrapper, root, group,
    cssObject: null,
    isVisible: false,
    lastAngle: null,
    isPass: true,
  };
}

// 掛載 pass 指示器：錨點放在場景中，位置由 updatePassAnchor 每幀決定
function attachPassIndicator(inst, anim) {
  const box = new THREE.Box3().setFromObject(anim.mesh);
  const center = box.getCenter(new THREE.Vector3());

  // 門的薄軸方向（門的法向量），取水平分量
  const axisMap = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const localAxis = axisMap[anim.frontAxis] ?? [0, 0, 1];
  const n = new THREE.Vector3(...localAxis).transformDirection(anim.mesh.matrixWorld);
  n.y = 0;
  if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
  else n.normalize();

  inst.worldNormal = n;
  inst.arrowWorld = new THREE.Vector3();
  // 門底部中心點（地面高度）
  inst.base = new THREE.Vector3(center.x, center.y - DOOR_PASS_DROP, center.z);

  inst.anchor = new THREE.Object3D();
  scene.add(inst.anchor);

  const cssObject = new CSS2DObject(inst.wrapper);
  inst.anchor.add(cssObject);
  inst.cssObject = cssObject;

  updatePassAnchor(inst);
}

// 依攝影機在門的哪一側，決定「前方」，把錨點放在門前 0.5 公尺，箭頭指向門
function updatePassAnchor(inst) {
  _tmpToCam.set(camera.position.x - inst.base.x, 0, camera.position.z - inst.base.z);
  const side = inst.worldNormal.dot(_tmpToCam) >= 0 ? 1 : -1;

  inst.anchor.position.set(
    inst.base.x + inst.worldNormal.x * side * DOOR_PASS_FORWARD_DIST,
    inst.base.y,
    inst.base.z + inst.worldNormal.z * side * DOOR_PASS_FORWARD_DIST
  );
  inst.anchor.updateMatrixWorld(true);

  // 箭頭方向：從前方指向門（與前方法向量相反）
  inst.arrowWorld.set(-inst.worldNormal.x * side, 0, -inst.worldNormal.z * side);
}

// 需於 buildScene 中 doorAnimations 填好後呼叫
export function attachDoorIndicatorsToScene() {
  Object.keys(doorAnimations).forEach(name => {
    if (!doorIndicatorInstances[name]) createDoorIndicator(name);
    const inst = doorIndicatorInstances[name];
    if (inst.cssObject) return;
    const anim = doorAnimations[name];
    if (!anim || !anim.mesh) return;

    if (inst.isPass) {
      attachPassIndicator(inst, anim);
      return;
    }

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
const _invMatrix = new THREE.Matrix4();
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
      if (inst) {
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
    if (!inst || !inst.cssObject || !anim) return;

    // pass 門的錨點需每幀依攝影機位置更新
    if (inst.isPass) updatePassAnchor(inst);

    inst.cssObject.getWorldPosition(_doorIndicatorAnchor);
    _p0.copy(_doorIndicatorAnchor).project(camera);
    const dist = camera.position.distanceTo(_doorIndicatorAnchor);
    const radius = inst.isPass ? DOOR_PASS_RADIUS : DOOR_INDICATOR_RADIUS;
    const inRange = dist <= radius && _p0.z < 1;
    const occluded = inRange && isIndicatorOccluded(_doorIndicatorAnchor, dist);

    // 門已開啟或不在範圍：淡出並重置計時
    if (anim.isOpen || !inRange) {
      setDoorIndicatorVisible(inst, false);
      inst.shownElapsed = 0;
      inst.shownDone = false;
      return;
    }

    // 被牆擋住：只淡出，保留計時
    if (occluded) {
      setDoorIndicatorVisible(inst, false);
      return;
    }

    // 本次靠近已顯示完畢
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

    // 計算螢幕上的指向角度
    let worldSample;
    if (inst.isPass) {
      // pass 門：從錨點沿箭頭方向取樣
      worldSample = _worldSample
        .copy(_doorIndicatorAnchor)
        .addScaledVector(inst.arrowWorld, DOOR_PASS_SAMPLE_DIST);
    } else {
      _localCenter.set(anim.indicatorLocalX ?? 0, anim.indicatorLocalY ?? 0, 0);
      const openDirLocal = getDoorOpenLocalDirection(anim);
      _localSample.copy(_localCenter).addScaledVector(openDirLocal, DOOR_INDICATOR_DIR_SAMPLE_DIST);
      worldSample = _worldSample.copy(_localSample).applyMatrix4(anim.mesh.matrixWorld);
    }
    _p1.copy(worldSample).project(camera);

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