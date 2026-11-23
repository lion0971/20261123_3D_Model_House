import { controls } from './controls.js';

// 延後鎖定的共用狀態（pointer.js 與 menu.js 共用）
export const lockState = {
  pendingLock: null,   // 目前排程中的 setTimeout 代號，沒有排程時為 null
  lastUnlockTime: 0,   // 最近一次解鎖（ESC）的時間戳
};

// 取消尚未執行的延後鎖定
export function cancelPendingLock() {
  if (lockState.pendingLock !== null) {
    clearTimeout(lockState.pendingLock);
    lockState.pendingLock = null;
  }
}

// 排程延後鎖定：wait 毫秒後執行 beforeLock（可選）再呼叫 controls.lock()
// 若已有排程，先取消舊的，避免重複排程
export function scheduleLock(wait, beforeLock = null) {
  cancelPendingLock();
  lockState.pendingLock = setTimeout(() => {
    lockState.pendingLock = null;
    if (beforeLock) beforeLock();
    controls.lock();
  }, wait);
}