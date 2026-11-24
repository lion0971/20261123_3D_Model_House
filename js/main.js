// ═══════════════════════════════════════════
// 主檔：匯入各模組並啟動
// 注意：UI / 互動模組多數在 import 時自行建立 DOM 並綁定事件，
//       因此只需 import 即可，不需呼叫 initXxx()。
// ═══════════════════════════════════════════

import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// three-mesh-bvh 掛載到 three.js prototype（需在建立任何 geometry 前完成）
window.THREE = THREE;
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { CONFIG } from '../scene-config.js';
import './core/firebase.js';
import { scene } from './core/renderer.js';
import { gltfLoader, rgbeLoader } from './core/loaders.js';
import { buildScene } from './core/buildScene.js';
import { startAnimationLoop } from './loop/animate.js';
import { loadAllAudio } from './audio/sound.js';
import { subscribeFilterUsage } from './filter/filterState.js';
import { exitApp, showCloseFallback } from './ui/endScreen.js';
import { PIPE_MODEL_FILES } from './data/pipeModels.js';

// 互動 / UI / 場景模組（import 即生效）
import './core/controls.js';
import './ui/weatherPanel.js';
import './ui/loadingScreen.js';
import './ui/climate.js';
import './ui/menu.js';
import './ui/dashboard.js';
import './ui/warnings.js';
import './ui/slider.js';
import './ui/hints.js';
import './ui/overlapWarning.js';
import './filter/filterUI.js';
import './loop/sun.js';
import './interaction/keyboard.js';
import './interaction/pointer.js';
import './interaction/touch.js';

// 背景格線與環境光
const gridHelper = new THREE.GridHelper(100, 100, 0xffffff, 0x888888);
gridHelper.material.opacity = 0.3;
gridHelper.material.transparent = true;
scene.add(gridHelper);
scene.add(new THREE.AmbientLight(0xffffff, 0.005));

// HDRI 環境貼圖
rgbeLoader.load(CONFIG.MODELS.HDRI, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.background = hdr;
});

// 音效與濾心遠端監聽（各只執行一次）
loadAllAudio();
subscribeFilterUsage();

// 建築與各管路檔並行載入；單一管路檔失敗只記錄錯誤，不影響其他模型
const buildingPromise = gltfLoader.loadAsync(CONFIG.MODELS.BUILDING);
const pipePromises = PIPE_MODEL_FILES.map(url =>
  gltfLoader.loadAsync(url).catch(err => {
    console.error(`[Pipe] 載入失敗：${url}`, err);
    return null;
  })
);

Promise.all([buildingPromise, ...pipePromises]).then(([buildingGltf, ...pipeGltfs]) => {
  const pipeModels = PIPE_MODEL_FILES
    .map((url, i) => ({
      name: url.split('/').pop().replace(/\.glb$/i, ''),
      gltf: pipeGltfs[i],
    }))
    .filter(m => m.gltf);

  buildScene(buildingGltf, pipeModels);
});

// 啟動主動畫迴圈
startAnimationLoop();

// 保留 index.html 中「離開遊戲」按鈕的全域呼叫
window.exitApp = exitApp;
window.showCloseFallback = showCloseFallback;