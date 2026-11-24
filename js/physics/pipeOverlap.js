import * as THREE from 'three';

// ═══════════════════════════════════════════
// 管路檔交錯偵測
// 載入完成後於閒置時間計算一次，結果快取；切換透視模式只讀取結果，不重算
// ═══════════════════════════════════════════

let overlapResults = null; // null = 尚未計算完成；陣列 = 結果
const readyCallbacks = [];

export function getPipeOverlapResults() {
  return overlapResults;
}

// 結果就緒時呼叫 fn；若已就緒則立即呼叫
export function onPipeOverlapReady(fn) {
  if (overlapResults !== null) fn(overlapResults);
  else readyCallbacks.push(fn);
}

function collectMeshes(root) {
  const meshes = [];
  root.traverse(obj => {
    if (obj.isMesh && obj.geometry) meshes.push(obj);
  });
  return meshes;
}

// 為每個 mesh 建立 BVH 與世界座標包圍盒（BVH 只建一次）
function prepareMesh(mesh) {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  if (!geo.boundsTree) geo.computeBoundsTree();
  return {
    mesh,
    worldBox: new THREE.Box3().setFromObject(mesh),
    label: mesh.name || '(unnamed)',
  };
}

// 判斷兩個 mesh 的三角形是否相交
function meshesIntersect(a, b) {
  // 將 b 的座標轉到 a 的局部座標：invA * B
  const bToA = new THREE.Matrix4()
    .copy(a.mesh.matrixWorld)
    .invert()
    .multiply(b.mesh.matrixWorld);
  return a.mesh.geometry.boundsTree.intersectsGeometry(b.mesh.geometry, bToA);
}

// groups: [{ name, root }]，回傳 [{ a, b, pairs: [描述字串] }]
export function computePipeOverlaps(groups) {
  const prepared = groups.map(g => ({
    name: g.name,
    meshes: collectMeshes(g.root).map(prepareMesh),
  }));

  const results = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const A = prepared[i], B = prepared[j];
      const pairs = new Set();

      for (const a of A.meshes) {
        for (const b of B.meshes) {
          // 粗篩：包圍盒不相交就跳過，避免大量精細檢查
          if (!a.worldBox.intersectsBox(b.worldBox)) continue;
          if (meshesIntersect(a, b)) pairs.add(`${a.label} ↔ ${b.label}`);
        }
      }

      if (pairs.size) results.push({ a: A.name, b: B.name, pairs: [...pairs] });
    }
  }
  return results;
}

// 排在瀏覽器閒置時計算，避免影響載入後的第一幀
export function schedulePipeOverlapCheck(groups) {
  const run = () => {
    overlapResults = computePipeOverlaps(groups);
    readyCallbacks.splice(0).forEach(fn => fn(overlapResults));
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 0);
  }
}