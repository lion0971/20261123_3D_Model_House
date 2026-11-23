import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { camera } from '../core/renderer.js';
import { doorAnimations, doorIndicatorInstances, hintOccluders } from '../core/state.js';
import {
  DOOR_INDICATOR_RADIUS, DOOR_INDICATOR_INTERVAL, DOOR_INDICATOR_HEIGHT_OFFSET,
  DOOR_INDICATOR_DIR_SAMPLE_DIST,
} from '../data/constants.js';
// ── 新增：指示器顯示秒數，時間到自動淡出 ──
const DOOR_INDICATOR_SHOW_SECONDS = 1;
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

// 需於 buildScene 中 doorAnimations 填好後呼叫
export function attachDoorIndicatorsToScene() {
  Object.keys(doorAnimations).forEach(name => {
    if (!doorIndicatorInstances[name]) createDoorIndicator(name);
    const inst = doorIndicatorInstances[name];
    if (inst.cssObject) return;
    const anim = doorAnimations[name];
    if (!anim || !anim.mesh) return;

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

// 與 CSS 中 doorIndicatorTriangleSweep 的播放時長一致（0.9s），多留 200ms 緩衝
// 切換整個指示器的顯示狀態（只改 class，淡入淡出由 CSS transition 處理）
function setDoorIndicatorVisible(inst, visible) {
  if (inst.isVisible === visible) return;
  inst.isVisible = visible;
  inst.root.classList.toggle('visible', visible);
}

const _occRaycaster = new THREE.Raycaster();
_occRaycaster.firstHitOnly = true;
const _occDir = new THREE.Vector3();

// 攝影機到目標之間是否有牆擋住
function isIndicatorOccluded(targetPos, dist) {
  if (hintOccluders.length === 0) return false;
  _occDir.copy(targetPos).sub(camera.position).normalize();
  _occRaycaster.set(camera.position, _occDir);
  _occRaycaster.far = Math.max(0, dist - 0.1);
  return _occRaycaster.intersectObjects(hintOccluders, false).length > 0;
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

    inst.cssObject.getWorldPosition(_doorIndicatorAnchor);
    _p0.copy(_doorIndicatorAnchor).project(camera);
    const dist = camera.position.distanceTo(_doorIndicatorAnchor);
    const inRange = dist <= DOOR_INDICATOR_RADIUS && _p0.z < 1;

    // 有牆擋住就視為不在範圍內（與魚形開關提示相同的做法）
    const occluded = inRange && isIndicatorOccluded(_doorIndicatorAnchor, dist);

    // 門已開啟、不在範圍、或被牆擋住：淡出，並重置計時
    if (anim.isOpen || !inRange || occluded) {
      setDoorIndicatorVisible(inst, false);
      inst.shownElapsed = 0;
      inst.shownDone = false;
      return;
    }

    // 本次靠近已顯示滿 2 秒：維持隱藏，直到離開範圍再靠近
    if (inst.shownDone) {
      setDoorIndicatorVisible(inst, false);
      return;
    }

    // 顯示中：累加時間，到時間就淡出並標記完成
    if (inst.isVisible) {
      inst.shownElapsed = (inst.shownElapsed ?? 0) + delta;
      if (inst.shownElapsed >= DOOR_INDICATOR_SHOW_SECONDS) {
        setDoorIndicatorVisible(inst, false);
        inst.shownDone = true;
        return;
      }
    } else {
      // 剛進入範圍：開始顯示
      setDoorIndicatorVisible(inst, true);
      inst.shownElapsed = 0;
    }

    // 在範圍內且門關閉：淡入，條狀持續循環
    setDoorIndicatorVisible(inst, true);

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

    // 角度變化很小就不寫入，減少每幀的樣式更新
    if (inst.lastAngle === null || Math.abs(angleDeg - inst.lastAngle) > 0.1) {
      inst.lastAngle = angleDeg;
      inst.group.style.transform = `rotate(${angleDeg.toFixed(1)}deg)`;
    }
  });
}