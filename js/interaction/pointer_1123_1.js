import * as THREE from 'three';
import { renderer, camera } from '../core/renderer.js';
import { controls } from '../core/controls.js';
import { raycaster } from '../core/raycaster.js';
import {
  state, doorObjects, interactiveDevices, flowingPipes, waterFlows, drainFlows,
  deviceWaterSounds, activeTimers,
} from '../core/state.js';
import { PIPE_CONFIG } from '../data/constants.js';
import { setPipeState, isPipeStillUsed } from '../water/pipes.js';
import { setFilterActive } from '../filter/filterState.js';
import { toggleDoor } from '../doors/doorAnimation.js';
import { dismissSwitchHint } from '../ui/hints.js';
import { stopPollingRemoteClose, warningModal } from '../ui/warnings.js';
import { menuPanel, closeMenu } from '../ui/menu.js';
import { hideTapPrompt, fadeOutBlackCover } from '../ui/loadingScreen.js';
import { hideWeatherPanel } from '../ui/weatherPanel.js';
import { setClimatePanelInstantVisible } from '../ui/climate.js';
import { setDashboardAvailable } from '../ui/dashboard.js';
import { sliderWrap } from '../ui/slider.js';
import { showResumeHint, hideResumeHint } from '../ui/resumeHint.js';

// 點擊互動（桌機：畫面中心十字準心；手機：手指觸碰位置，由 touch.js 寫入 mobileTapNDC）
renderer.domElement.addEventListener('click', () => {
  if (menuPanel.style.display === 'flex') {
    closeMenu();
    return;
  }

  if (!controls.isLocked) {
    hideTapPrompt();
    hideWeatherPanel();
    fadeOutBlackCover();
    controls.lock();
    return;
  }

  raycaster.setFromCamera(state.mobileTapNDC || new THREE.Vector2(0, 0), camera);
  state.mobileTapNDC = null;

  // 門
  const doorIntersects = raycaster.intersectObjects(doorObjects);
  if (doorIntersects.length) {
    let obj = doorIntersects[0].object;
    while (obj && !obj.name.toLowerCase().includes('sliding_door') &&
      !obj.name.toLowerCase().includes('sliding_up_door') &&
      !obj.name.toLowerCase().includes('turn_up_door') &&
      !obj.name.toLowerCase().includes('door_')) {
      obj = obj.parent;
    }
    toggleDoor(obj?.name.toLowerCase());
    return;
  }

  // 水龍頭 / 蓮蓬頭 / 馬桶開關
  const intersects = raycaster.intersectObjects(interactiveDevices);
  if (!intersects.length) return;

  const targetName = intersects[0].object.name.toLowerCase();
  const cfg = PIPE_CONFIG[targetName];
  if (!cfg) return;

  dismissSwitchHint(targetName);

  const firstColdKey = cfg.coldPipes[cfg.coldPipes.length - 1];
  const firstColdPipe = flowingPipes.get(firstColdKey);
  if (!firstColdPipe) {
    console.warn(`[Click] 找不到管路 ${firstColdKey}`);
    return;
  }

  const isNowActive = !firstColdPipe.active;

  cfg.coldPipes.forEach(pipeName => {
    const p = flowingPipes.get(pipeName);
    if (!p) return;
    if (isNowActive) setPipeState(p, 'active');
    else if (!isPipeStillUsed(pipeName, targetName, 'cold')) setPipeState(p, 'inactive');
  });

  cfg.drainPipes.forEach(pipeName => {
    const p = flowingPipes.get(pipeName);
    if (!p) return;
    if (isNowActive) setPipeState(p, 'active');
    else if (!isPipeStillUsed(pipeName, targetName, 'drain')) setPipeState(p, 'inactive');
  });

  waterFlows[targetName]?.setActive(isNowActive);
  drainFlows[cfg.drainKey]?.setActive(isNowActive);
  setFilterActive(targetName, isNowActive);

  const sound = deviceWaterSounds[targetName];
  if (sound) {
    if (isNowActive && !sound.isPlaying) sound.play();
    else if (!isNowActive && sound.isPlaying) sound.stop();
  }

  if (activeTimers[targetName]) {
    if (isNowActive) {
      activeTimers[targetName].startTime = Date.now();
      activeTimers[targetName].alerted = false;
      activeTimers[targetName].repeatMode = false;
    } else {
      activeTimers[targetName].startTime = null;
      activeTimers[targetName].repeatMode = false;
      stopPollingRemoteClose(targetName);
    }
  }
});

// 記錄是否由程式呼叫 controls.unlock()（雙擊、按鈕）；ESC 不會經過這裡
// 只有指標確實處於鎖定狀態時才標記，避免未鎖定時呼叫 unlock 造成旗標殘留
let programmaticUnlock = false;
const nativeUnlock = controls.unlock.bind(controls);
controls.unlock = () => {
  if (controls.isLocked) programmaticUnlock = true;
  nativeUnlock();
};

// PointerLock 鎖定 / 解鎖時同步 UI
controls.addEventListener('lock', () => {
  programmaticUnlock = false;
  hideResumeHint();

  // 選單已開啟時才收到鎖定事件（鎖定請求延遲生效）：立刻解除鎖定，
  // 讓選單保持可操作，並由 unlock 監聽器恢復滑桿
  if (menuPanel.style.display === 'flex') {
    controls.unlock();
    return;
  }

  sliderWrap.style.opacity = '0';
  sliderWrap.style.pointerEvents = 'none';
  setClimatePanelInstantVisible(false);
  setDashboardAvailable(false);
});

controls.addEventListener('unlock', () => {
  const fromCode = programmaticUnlock;
  programmaticUnlock = false;

  if (warningModal.style.display === 'block') return;

  if (fromCode || state.unlockFromButton) {
    // 雙擊或按鈕解鎖：恢復滑桿與氣候面板（選單與智能儀表版由 openMenu 處理）
    if (!state.isXRayMode) {
      sliderWrap.style.opacity = '1';
      sliderWrap.style.pointerEvents = 'auto';
      setClimatePanelInstantVisible(true);
    }
  } else {
    // ESC 解鎖：只顯示「點畫面繼續」
    showResumeHint();
  }
});