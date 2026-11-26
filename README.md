# 該回家了吧（Succuleaf 數位分身）

以 Three.js 建構的互動式 3D 建築體驗。使用者可在建築中第一人稱漫遊、開關門、操作水龍頭與馬桶、觀察管路與水流，並透過「管路透視模式」檢視隱藏管線與管路交錯狀況。

---

## 目錄

1. [功能概覽](#功能概覽)
2. [技術棧](#技術棧)
3. [專案結構](#專案結構)
4. [啟動流程](#啟動流程)
5. [操作方式](#操作方式)
6. [核心設計](#核心設計)
7. [模組說明](#模組說明)
8. [資料設定](#資料設定)
9. [雲端服務（Firebase）](#雲端服務firebase)
10. [外部服務（天氣）](#外部服務天氣)
11. [開發與部署](#開發與部署)
12. [授權條款](#授權條款)
13. [致謝](#致謝)

---

## 功能概覽

- **第一人稱漫遊**：PointerLock 控制視角，支援 WASD / 方向鍵與滑鼠；手機支援單指環顧、長按前進、雙指後退。
- **碰撞**：牆面、地板、樓梯圓柱與桌子皆有碰撞；透視模式下僅外牆仍保留碰撞。
- **旋轉樓梯**：可沿樓梯軌道上下爬行，依輸入方向推進高度，並於頂端或底端離開。
- **互動裝置**：點擊水龍頭、蓮蓬頭、馬桶開關，觸發管路水流、排水漩渦粒子與水流音效。
- **濾心**：出水時累計用量，於 3D 卡片與儀表板顯示剩餘時間，並同步至 Firebase；低於 5% 時發出警告。
- **出水超時警告**：單一裝置連續出水超過 1 分鐘會彈出警告，可選擇關閉水流，並支援遠端關閉。
- **門**：滑門、上下滑門、上掀門、旋轉門，點擊切換開關（連動門同步），並有方向指示器。
- **日夜與太陽軌跡**：底部滑桿控制時間，圓盤可拖曳調整日出與日落方位；燈泡依日照自動明暗。
- **水池**：進入水池範圍時攝影機下沉、漂浮，入水與出水時播放水花音效。
- **管路透視模式**：隱藏牆體與地板，凸顯管路與燈具，並顯示管路交錯檢查結果。
- **智慧儀表板**：左側展開，顯示室外溫濕度、冷氣／除濕狀態與濾心剩餘時間。
- **氣候提示**：首次開啟特定門時彈出室外溫濕度與冷氣／除濕建議，之後每個快取週期自動提示。
- **離開流程**：離開遊戲後顯示結束畫面與環境動畫（葉子搖晃、魚群游動）。

---

## 技術棧

| 項目 | 說明 |
|---|---|
| 3D 引擎 | Three.js 0.160.0（importmap 從 unpkg 載入） |
| 模型格式 | glTF / GLB，管路與建築分檔，建築支援 Draco 壓縮 |
| 加速 | three-mesh-bvh 0.8.3（碰撞、射線與管路交錯偵測） |
| 後製 | EffectComposer + UnrealBloomPass |
| 雲端 | Firebase 10.12.4（Realtime Database、匿名登入） |
| 外部 API | Open-Meteo（室外溫濕度與天氣代碼） |
| 通知 | LINE 通知（由 Firebase 節點觸發，可由 `flags.js` 關閉） |

---

## 專案結構

```
index.html                  入口頁，載入 importmap 與 js/main.js
style.css                   全域樣式（離開按鈕、載入畫面、說明框、滑桿、結束畫面等）
scene-config.js             場景設定（模型路徑、相機起點，支援 GitHub Pages 子路徑）
models/
  building.glb              建築本體（不含管路）
  pipes/                    管路模型，每個檔案一組管路
    pipe_outlet.glb
    pipe_drain.glb
hdri/
  studio-0623.hdr           環境貼圖
textures/
  bake_ao.png               烘焙 AO 貼圖
audio/                      faucet_loop.ogg、shower_loop.ogg、swim.ogg、splash.ogg
js/
  main.js                   主入口：初始化 Three.js、並行載入模型、啟動動畫迴圈
  core/
    renderer.js             Scene、Camera、WebGLRenderer、EffectComposer、CSS2DRenderer
    controls.js             PointerLockControls 與 isMobile 判斷
    loaders.js              GLTFLoader（含 Draco）、RGBELoader、AudioLoader、AO 貼圖
    state.js                共用狀態中心
    buildScene.js           組裝場景：分類 mesh、互動物件、碰撞資料、預熱
    raycaster.js            共用 Raycaster
    firebase.js             Firebase 初始化與匿名登入
  interaction/
    keyboard.js             WASD / 方向鍵
    pointer.js              點擊互動、PointerLock 鎖定與解鎖、ESC 提示流程
    touch.js                行動裝置觸控邏輯
  loop/
    animate.js              主動畫迴圈
    sun.js                  太陽光與太陽球體
    bulbs.js                燈泡收集、光源建立與亮度
  physics/
    collision.js            玩家碰撞、滑動、樓梯與桌子虛擬碰撞
    staircase.js            旋轉樓梯軌道移動與入口角度
    pipeOverlap.js          管路群組交錯偵測與結果快取
  ui/
    loadingScreen.js        載入畫面、說明框、點擊開始提示、全黑遮罩
    menu.js                 中央選單、管路透視切換、雙擊開啟選單
    slider.js               日夜滑桿、太陽軌跡圓盤、感應式提示
    dashboard.js            智慧儀表板
    climate.js              室外氣候提示卡片
    weatherPanel.js         天氣資料取得（Open-Meteo）與快取
    warnings.js             濾心警告、出水超時警告與 Firebase 警告節點
    hints.js                開關魚形提示與門靠近提示
    resumeHint.js           ESC 後「點畫面繼續」提示
    overlapWarning.js       管路交錯檢查面板（透視模式下顯示）
    endScreen.js            離開流程與結束畫面、環境動畫
  water/
    pipes.js                管路材質池與狀態切換
    WaterFlow.js            出水口水柱粒子
    DrainFlow.js            排水口漩渦粒子
    pool.js                 水池範圍與下沉／漂浮
  filter/
    filterState.js          濾心用量狀態、Firebase 同步
    filterUI.js             濾心 3D 卡片與圓環
  doors/
    doorSetup.js            門的登記
    doorAnimation.js        門的開關動畫與連動
    doorIndicator.js        門方向指示器（藍色三角與 pass 綠色三角）
  audio/
    sound.js                音效載入與播放
  utils/
    math.js                 角度、曲線、時間格式與門指示器計算工具
    glow.js                 圓錐體積光與徑向光暈貼圖
  data/
    constants.js            管路對照、碰撞名單、門、濾心、日夜與天氣常數
    pipeModels.js           管路 GLB 清單
  config/
    flags.js                功能開關
```

> `lockState.js` 已移除。

---

## 啟動流程

1. `index.html` 載入 importmap，以 `type="module"` 執行 `js/main.js`。
2. `main.js` 將 three-mesh-bvh 掛載到 Three.js 原型，之後建立的幾何皆可使用 BVH。
3. 各 UI 與互動模組在 `import` 時即建立 DOM 並綁定事件，`main.js` 只需 import。
4. 建築與所有管路 GLB 以 `Promise.all` 並行載入，單一管路失敗只記錄錯誤。
5. `buildScene(buildingGltf, pipeModels)`：
   - 登記門、收集出水口與排水口；
   - 遍歷所有模型，分類 mesh（燈泡、管路、可點擊裝置、碰撞物、靜態物件）；
   - 建立碰撞包圍球、水流粒子、排水漩渦、音效與 3D 提示；
   - 初始化日夜狀態與燈泡亮度；
   - 以 `requestIdleCallback` 排程管路交錯偵測；
   - 以上帝視角正交相機預熱 shader，之後呼叫 `finishLoading()`。
6. `finishLoading()` 淡出載入畫面，顯示說明框並出現「點擊畫面開始」提示。
7. `main.js` 啟動 `startAnimationLoop()`。

---

## 操作方式

| 操作 | 桌機 | 手機 |
|---|---|---|
| 進入漫遊 | 點擊畫面 | 點擊說明面板或畫面 |
| 移動 | WASD / 方向鍵 | 按住螢幕單指前進，雙指後退 |
| 環顧 | 滑鼠移動 | 單指滑動 |
| 爬樓梯 | 站在樓梯入口角度，前進或後退 | 同左（長按前進） |
| 互動 | 點擊水龍頭、門（準心位置） | 單擊準心位置 |
| 開啟選單 | 雙擊畫面 | 雙擊螢幕 |
| 暫停（解鎖） | ESC | 再次單擊 |
| 管路透視 | 選單中的按鈕 | 選單中的按鈕 |
| 調整日夜 | 底部滑桿 | 底部滑桿 |
| 調整太陽軌跡 | 拖曳圓盤上的藍點（日出）或橘點（日落），雙擊還原 | 同左（觸控拖曳） |
| 離開遊戲 | 右下角按鈕 | 同左 |

---

## 核心設計

### 狀態管理

`core/state.js` 集中管理共用狀態：

- **可變純量**（如 `isXRayMode`、`unlockFromButton`、`targetBulbStrength`、`isOnStairRail`、`stairHeight`）放在 `state` 物件上，確保跨模組修改同步。
- **集合**（陣列、Map、物件）以 `export const` 匯出，引用固定、內容可變，例如 `interactiveDevices`、`doorAnimations`、`flowingPipes`、`filterState`。
- **濾心狀態**：每個裝置一筆，含 `usedSeconds`、`remoteTotal`、`pendingDelta`、`isActive`、`ready` 等。

### 場景組裝（buildScene）

`buildScene.js` 對建築與所有管路模型使用同一組遍歷邏輯，依名稱分類：

| 類別 | 判斷依據 | 處理 |
|---|---|---|
| 燈泡 | 名稱含 `bulb` | 建立發光材質與光源，登記至 `bulbMeshes` |
| 管路 | 名稱在 `PIPE_CONFIG` 的 `coldPipes` / `drainPipes` | 指派 `PIPE_MATERIALS`，登記至 `flowingPipes` |
| 可點擊裝置 | 名稱為 `PIPE_CONFIG` 的鍵 | 登記至 `interactiveDevices`，建立水流與音效 |
| 碰撞物 | 名稱或父物件名含 `wall`、`floor`、`door`、`stairs` | 登記至 `collidableObjects`，建立 BVH |
| 嚴格碰撞牆 | 名稱在 `STRICT_COLLISION_NAMES` | 透視模式下仍保留碰撞 |
| 提示遮擋物 | 名稱含 `wall` | 登記至 `hintOccluders`，用於提示被牆遮擋時隱藏 |
| 靜態物件 | 其餘 | 關閉 `matrixAutoUpdate` |

地板 `floor`、`floor_2` 會替換為不受光源影響的 `MeshBasicMaterial`；`AO_BAKE_TARGETS` 內的物件套用烘焙 AO（需要 `uv2`）。

### 燈泡與日夜

- `applyDayNight(t)`（`ui/slider.js`）統一計算太陽位置、光源強度、色溫、曝光、背景色與 `targetBulbStrength`。
- 燈泡依 `elevRatio` 決定目標亮度：日出與日落附近開燈並隨高度調整，正午熄燈（`LIGHTS_ON_ELEV_RATIO`）。
- `animate.js` 每幀以 `BULB_LERP_SPEED` 將 `currentBulbStrength` 插值到目標，並呼叫 `applyBulbStrength`。
- `bulbs.js` 依燈泡類型區分：
  - **line_bulb**：沿長軸的 PointLight 與兩層圓柱光暈；
  - **ball_bulb**：PointLight 與徑向光暈 Sprite（`BALL_BULB_OVERRIDES` 可覆寫單一燈泡參數）；
  - **rec_bulb**：RectAreaLight 與自發光材質；
  - **其他**：SpotLight 與圓錐體積光。

### 太陽軌跡

- 日出與日落各為一個地平線方位角，預設 +75° 與 -75°。
- 滑桿圓球亮度依 `n` 變化：0 時太陽球最亮，100 時月亮球最亮。
- 圓盤與滑桿共用同一組方位角，拖曳時以較近的點為準，雙擊還原預設。
- 管路透視模式中滑桿與圓盤隱藏，`applyDayNight` 不會被使用者觸發。
- `sun.js` 建立 `DirectionalLight` 與太陽球體（`SHOW_SUN_MESH` 預設為 `false`，球體不顯示），光暈為 BackSide 球體。

### 門系統

門依名稱在 `doorSetup.js` 登記：

| 類型 | 名稱規則 | 動畫 |
|---|---|---|
| 滑門 | 含 `sliding_door` | 沿 X 或 Z 軸滑動（`SLIDE_AXIS_OVERRIDE` 可覆寫） |
| 上下滑門 | 含 `sliding_up_door` / `sliding_down_door` | 沿 Y 軸滑動 |
| 上掀門 | 含 `turn_up_door` | 繞 Z 軸旋轉 `TURN_UP_OPEN_ANGLE`（60°） |
| 旋轉門 | 含 `door_`（未被上列登記） | 繞 Y 軸旋轉 90° |

- **連動門**：`DOOR_GROUPS` 定義，點擊其中一扇時同步開關（`toggleDoor`）。
- **動畫**：`updateDoorAnimations` 每幀以 `progress` 0～1 推進，套用 ease-in-out。
- **方向指示器**（`doorIndicator.js`）：
  - 一般門：藍色 CSS 三角形，以 CSS2D 掛在門上，角度依螢幕投影指向開門方向；
  - 名稱含 `pass` 的門：平放地面的綠色 ShaderMaterial 三角形，光帶循環掃過；
  - 指示器只在距離內顯示，被牆遮擋時淡出，每次靠近顯示 1 秒後不再重複，離開範圍後重置。
- **門提示**（`hints.js`）：`DOOR_HINT_DEVICES` 的門靠近時浮現「按門開關」，全域只要任一扇門被操作過即永久關閉（`dismissDoorHintPermanently`）。
- **氣候提示觸發**：第一次開啟 `DOOR_HINT_DEVICES` 中的門時觸發 `startClimateOnFirstDoorOpen`。

### 碰撞與樓梯

`physics/collision.js`：

- **一般模式**：以玩家位置篩出附近（`NEARBY_COLLISION_RADIUS`）的碰撞包圍球，再以四方向射線與側向偏移射線（`PLAYER_HALF_WIDTH`）偵測牆面，沿牆面滑動（最多 `MAX_SLIDE_ITERATIONS` 次）。
- **透視模式**：僅 `strictCollidableObjects` 保留碰撞。
- **樓梯圓柱**：`resolveStaircaseCylinderCollision` 將樓梯圓柱非入口角度視為牆面。
- **桌子**：`resolveDiningTableCollision` 使用 `DINING_TABLE_BOUNDS` 的水平矩形做虛擬碰撞，範圍由 `buildScene` 以 `Box3` 量測。
- **卡住處理**：切回一般模式時若仍在牆內或樓梯圓柱中，`isStuckInWall` 旗標允許暫時穿越直到脫離。

`physics/staircase.js`：

- **進入樓梯**：`updateStaircase` 每幀檢查攝影機是否進入樓梯半徑（含 `radiusMargin`）且角度符合入口容差，符合即進入軌道模式（`isOnStairRail`），並依高度判斷從樓下或樓上進入。
- **入口角度**：`getStairEntranceConfig` 依攝影機高度是否超過樓梯中點（`STAIR_MID_Y`）選擇樓下或樓上的入口角度與容差。
- **軌道移動**：在軌道模式下，玩家的前後輸入（含觸控長按）會投影到樓梯切線方向，推進 `stairHeight`，攝影機沿 `walkRadius` 圓周移動，高度依 `stepHeight` 階梯化。
- **離開條件**：未過 `STAIR_COMMIT_MARGIN` 的區段可隨時退回入口；進入「已承諾」區段後，需朝外側移動才能離開頂端或底端。
- **角度修正**：`getStairAngleAtHeight` 依另一端的入口角度線性修正，使上下端角度銜接正確。

### 水流與排水

- **出水口（`WaterFlow`）**：faucet 為細流（80 顆粒子，生命週期短）；shower 為大水柱（150 顆）。
- **排水口（`DrainFlow`）**：200 顆粒子，以螺旋方式繞排水點旋轉，中心偏亮白藍、外圈偏深藍。
- **管路材質（`pipes.js`）**：冷水管與排水管各有 `active_shared`、`active_own`、`inactive` 三種共用材質。出水時改用疊加混合形成發光。
- **共用管路判斷**：`isPipeStillUsed` 確認某管路是否仍被其他正在出水的裝置使用，避免關閉單一裝置時誤關共用幹管。
- **水流音效**：每個裝置掛一個 `PositionalAudio`，依裝置類型選擇 faucet 或 shower 音效。

### 濾心系統

- 每個水龍頭（`FILTER_DEVICES`）出水時，`setFilterActive` 開始累計；關水時立即寫入一次。
- `animate.js` 每幀累加 `pendingDelta`，封頂於 `FILTER_LIFETIME_SECONDS`。
- UI 每 `FILTER_UI_UPDATE_INTERVAL` 秒更新一次；每 `FILTER_SAVE_INTERVAL` 秒節流寫入 Firebase。
- 剩餘比例低於 `FILTER_LOW_RATIO`（5%）時觸發一次警告（`showFilterWarning`）並寫入低量警告節點。
- 圓環顏色依用量區間變化（`FILTER_RING_ZONES`：藍、綠、黃、橘、紅）。
- 3D 卡片（`filterUI.js`）以 CSS2D 掛在出水口上方，水平重疊時以鬆弛演算法推開，只在出水且位於視野內時顯示。
- 更換濾心使用 `resetFilterUsage`，以 `set` 覆寫為 0（`increment` 無法清零）。

### 出水超時警告

`warnings.js` 與 `animate.js` 協作：

1. `animate.js` 檢查 `activeTimers`，若某裝置出水超過 `WARNING_MS`（1 分鐘）呼叫 `showWarning`。
2. `showWarning` 將裝置加入 `warningQueue`，寫入 `sessions/{token}/{device}` 節點（`status: timeout_alert`，並以 `onDisconnect` 自動清除），並開始監聽 `shouldClose` 以支援遠端關閉。
3. 彈窗提供「我知道了」（重新計時，之後以 `WARNING_REPEAT_MS` 10 分鐘重複）與「關閉水流」。
4. 遠端寫入 `shouldClose: true` 時，本機會自動關閉該裝置的水流。

### 水池

`pool.js`：

- `initPoolBounds` 以 `floor_pool_water` 的包圍盒決定水平範圍。
- `updatePool` 每幀判斷攝影機是否在範圍內：入水時下沉至 `WATER_SINK_DEPTH` 並加入 `WATER_ENTRY_OVERSHOOT`，出水時跳起 `WATER_EXIT_JUMP`，並加入水面漂浮（`WATER_BOB_AMPLITUDE`）。
- 入水與出水瞬間呼叫 `playSplash`。
- `animate.js` 依水平位移決定是否播放游泳聲（目前 `SWIM_LOOP_ENABLED` 為 `false`，僅保留 API）。

### 提示系統

`hints.js` 包含兩種 3D 提示，皆以 CSS2D 掛在物件上，並以 `hintOccluders`（牆面）做遮擋檢查：

- **開關魚形提示**：靠近 `SWITCH_HINT_DEVICES` 的開關（`SWITCH_HINT_RADIUS`）時顯示「按開關」與來回咬動的魚形動畫；按下後本次靠近期間不再彈出（`dismissSwitchHint`）。每 `SWITCH_HINT_CHECK_INTERVAL` 秒檢查一次。
- **門靠近提示**：靠近 `DOOR_HINT_DEVICES` 的門時顯示「按門開關」與葉子掃光動畫，全域一次性。

### 管路交錯偵測

1. `main.js` 將每個管路 GLB 視為一個群組，傳入 `buildScene`。
2. `schedulePipeOverlapCheck` 以 `requestIdleCallback`（逾時 3 秒）排程，避免影響首幀。
3. `computePipeOverlaps` 比較不同群組之間的 mesh：先以世界座標 `Box3` 粗篩，相交才做 BVH 精細檢查（`intersectsGeometry`）。
4. 結果快取於 `pipeOverlap.js`，切換透視模式時只讀取結果。
5. `overlapWarning.js` 顯示「▲ 檔A ↔ 檔B」，下方縮排列出相交的 mesh 配對。

**限制**：

- 只判斷三角形表面相交；管路只是靠近未接觸不算交錯。
- 同一個 GLB 內的管路不互相比較。
- 所有管路 GLB 需與建築使用相同座標系。

### 點擊與解鎖流程（pointer.js）

- 未鎖定時點擊畫面：若距離上次 ESC 解鎖未滿 `POINTER_LOCK_COOLDOWN_MS`（1100 ms）則忽略，否則呼叫 `controls.lock()`。
- 已鎖定時點擊：先檢查選單是否開啟（開啟則關閉選單），再以準心或觸控位置做射線，依序檢查門與裝置。
- `controls.unlock` 被包裝，`programmaticUnlock` 旗標用來區分程式解鎖（雙擊、按鈕、警告彈窗）與 ESC 解鎖。
- ESC 解鎖時 `showResumeHint` 在冷卻結束後才顯示「點畫面繼續」。
- 鎖定成功後會隱藏滑桿、氣候面板與智慧儀表板。

### 選單與透視模式（menu.js）

- **雙擊畫面**或手機雙擊：`openMenu()`，解除鎖定、顯示選單，並恢復滑桿與氣候面板（透視模式中例外）。
- **管路透視切換**（`toggleXRayMode`）：
  - 啟用時：太陽光與太陽球隱藏、燈具亮度歸零、背景改黑、牆體與地板 `opacity 0.15`、管路保留可見、滑桿隱藏、顯示交錯面板；
  - 停用時：還原所有數值，並以 `checkCurrentCollision` 判斷是否卡在牆內。
- 切換過程顯示三點動畫遮蔽畫面，約 130 ms 後完成並自動鎖定。

### 載入與揭曉（loadingScreen.js）

- `manager.onProgress` 更新進度條。
- 說明框預設展開；手機版可收合為 `#instructions-fab`。
- 首次點擊 `fadeOutBlackCover()` 會將 `sceneRenderEnabled` 設為 `true`、淡出全黑遮罩，並呼叫 `ensureWeatherData()`。
- 「點擊畫面開始」提示含葉子飛入與漣漪動畫。

### 離開流程

`exitApp()`（`endScreen.js`）：

1. 解除 PointerLock；
2. 將 `isAnimating` 設為 `false` 停止動畫迴圈；
3. 將仍在出水的濾心用量寫入 Firebase；
4. 釋放 Renderer；
5. 顯示 `#close-fallback` 結束畫面，並啟動環境動畫（6 片葉子與 5 隻魚，以 `requestAnimationFrame` 驅動）。

---

## 模組說明

### core/

| 檔案 | 職責 |
|---|---|
| `renderer.js` | 建立 Scene、透視相機（含 `audioListener`）、WebGLRenderer、EffectComposer（Bloom）與 CSS2DRenderer；視窗縮放時同步更新 |
| `controls.js` | 建立 PointerLockControls，匯出 `isMobile` |
| `loaders.js` | LoadingManager、GLTFLoader（掛 Draco）、RGBELoader、AudioLoader，並預載 AO 貼圖 |
| `state.js` | 狀態中心，包含 `state`、場景集合、警告監聽、濾心狀態、碰撞包圍球 |
| `buildScene.js` | 組裝場景、分類 mesh、建立互動物件與預熱 |
| `firebase.js` | 初始化 App、Database、Auth，匯出 `authReadyPromise` |

### loop/

| 檔案 | 職責 |
|---|---|
| `animate.js` | 主動畫迴圈（限制 60 FPS）：門動畫、水流、透視呼吸光、超時警告、濾心累加與 UI、提示節流、移動與碰撞、樓梯、水池、燈泡插值、渲染 |
| `sun.js` | 建立 `sunLight`（DirectionalLight）與太陽球體、光暈 |
| `bulbs.js` | 收集燈泡、建立光源與光暈、依 `s` 統一調整亮度 |

### interaction/

| 檔案 | 職責 |
|---|---|
| `keyboard.js` | WASD 與方向鍵對應 `state.moveForward` 等旗標 |
| `pointer.js` | 點擊互動、鎖定與解鎖、ESC 冷卻提示、交錯面板觸發 |
| `touch.js` | 手機單指環顧、長按前進、雙指後退、單擊與雙擊判斷，`mobileLock` / `mobileUnlock` 取代 PointerLock |

### ui/

| 檔案 | 職責 |
|---|---|
| `loadingScreen.js` | 載入進度、說明框、點擊開始提示、葉子飛行、全黑遮罩淡出 |
| `menu.js` | 中央選單、透視切換、雙擊開選單、`openMenu` / `closeMenu` |
| `slider.js` | 日夜滑桿、太陽軌跡圓盤、感應式提示、`applyDayNight` |
| `dashboard.js` | 左側智慧儀表板，滑鼠靠近展開、手機點擊切換 |
| `climate.js` | 室外氣候提示卡片；首次開特定門時觸發，之後依快取週期重複 |
| `weatherPanel.js` | Open-Meteo 天氣請求、快取與 `ensureWeatherData` 唯一入口 |
| `warnings.js` | 濾心低量與出水超時彈窗、Firebase 警告節點寫入、遠端關閉監聽 |
| `hints.js` | 開關魚形提示與門靠近提示 |
| `resumeHint.js` | ESC 後「點畫面繼續」提示 |
| `overlapWarning.js` | 管路交錯檢查面板 |
| `endScreen.js` | 離開流程、結束畫面與環境動畫 |

### physics/、water/、filter/、doors/、audio/、utils/

| 檔案 | 職責 |
|---|---|
| `physics/collision.js` | 玩家碰撞與滑動、樓梯圓柱與桌子虛擬碰撞、卡住脫離 |
| `physics/staircase.js` | 樓梯進入判定、軌道移動、入口角度與離開條件 |
| `physics/pipeOverlap.js` | 管路群組交錯偵測與快取 |
| `water/pipes.js` | 管路材質池、`setPipeState`、`setupPipeMaterial`、`isPipeStillUsed` |
| `water/WaterFlow.js` | 出水水柱粒子系統 |
| `water/DrainFlow.js` | 排水漩渦粒子系統 |
| `water/pool.js` | 水池範圍、下沉與漂浮、入出水判斷 |
| `filter/filterState.js` | 濾心本機狀態、Firebase 即時監聽、節流寫入、重設、開關水 |
| `filter/filterUI.js` | 濾心 3D 卡片、圓環進度、時間格式、卡片重疊推開 |
| `doors/doorSetup.js` | 門的登記（滑門、上下滑門、上掀門、旋轉門） |
| `doors/doorAnimation.js` | 門開關切換、連動與每幀動畫 |
| `doors/doorIndicator.js` | 門方向指示器（藍色 CSS 三角與綠色 pass 3D 三角） |
| `audio/sound.js` | 音效載入、裝置水流音效、入水水花、游泳聲（API 保留） |
| `utils/math.js` | `angleDiff`、`computeDoorIndicatorMeta`、`mixWithWhite`、`cubicBezier`、`formatRemainingParts` 等 |
| `utils/glow.js` | `createConeVolumetricLight`（圓錐體積光 Shader）、`getRadialGlowTexture`（徑向光暈貼圖，快取） |

---

## 資料設定

### `data/constants.js`

| 區塊 | 主要常數 | 說明 |
|---|---|---|
| 碰撞與移動 | `PLAYER_HALF_WIDTH`、`collisionDistance`、`NEARBY_COLLISION_RADIUS`、`WALK_HOLD_ACCEL` | 玩家碰撞與移動參數 |
| 樓梯 | `STAIRCASE`、`STAIR_MID_Y`、`STAIR_COMMIT_MARGIN` | 旋轉樓梯中心、半徑、高度、步高與入口角度 |
| 桌子 | `DINING_TABLE_BOUNDS` | 載入後由 `buildScene` 量測 |
| 水池 | `WATER_SINK_DEPTH` 等 | 下沉、漂浮與入出水參數 |
| 門 | `DOOR_GROUPS`、`*_OVERRIDE`、`DOOR_HINT_DEVICES` | 連動門、軸向覆寫與提示門 |
| 門指示器 | `DOOR_INDICATOR_RADIUS`、`DOOR_INDICATOR_HEIGHT_OFFSET` | 指示器顯示距離與高度 |
| 開關提示 | `SWITCH_HINT_RADIUS`、`SWITCH_HINT_CHECK_INTERVAL` | 魚形提示距離與檢查間隔 |
| 濾心 | `FILTER_DEVICES`、`FILTER_LIFETIME_HOURS`、`FILTER_LOW_RATIO`、`FILTER_RING_ZONES` | 濾心裝置、壽命、低量門檻與顏色區間 |
| 警告 | `WARNING_MS`、`WARNING_REPEAT_MS` | 出水超時首次與重複間隔 |
| 日夜 / 透視 | `DEFAULT_DAY_VALUE`、`LIGHTS_ON_ELEV_RATIO`、`XRAY_*`、`BULB_LERP_SPEED` | 日夜預設值、燈光開啟門檻與透視參數 |
| 天氣 | `WEATHER_LAT`、`WEATHER_LON`、`WEATHER_CACHE_MS` | 查詢座標與快取時間 |
| 管路 | `PIPE_CONFIG`、`SHARED_COLD_PIPES`、`SHARED_WASTE_PIPES` | 裝置與管路的對應關係 |
| 裝置名稱 | `DEVICE_LABEL` | 3D 卡片、警告與儀表板的中文名稱 |
| 音效 | `AUDIO_FILES`、`SWIM_*` | 音效檔路徑與游泳聲設定 |
| 渲染 | `TARGET_FPS`、`FRAME_INTERVAL` | 動畫迴圈幀率上限 |

### `PIPE_CONFIG` 結構

```js
'kit_faucet_1': {
  outletKey: 'kit_faucet_1_outlet',   // 出水口空物件名稱
  drainKey: 'kit_faucet_1_drain',     // 排水口空物件名稱
  coldPipes: [...],                   // 冷水管（由進水端到出水端，最後一項為是否出水的判斷依據）
  drainPipes: [...],                  // 排水管
  type: 'faucet',                     // 'faucet' 或 'shower'
  drainRadius: 0.18,                  // 選填：排水漩渦半徑
}
```

> 所有物件名稱必須全域唯一，`PIPE_CONFIG` 與 `flowingPipes` 依名稱查找。

### `data/pipeModels.js`

```js
export const PIPE_MODEL_FILES = [
  'models/pipes/pipe_kitchen.glb',
  'models/pipes/pipe_bath.glb',
  'models/pipes/pipe_toilet.glb',
];
```

新增或移除管路檔只需修改此清單。

### `config/flags.js`

| 常數 | 預設 | 說明 |
|---|---|---|
| `SHOW_WEATHER_PANEL_ON_LOAD` | `false` | 載入時是否顯示天氣面板（天氣資料仍會在首次點擊後抓取） |
| `SHOW_CLIMATE_PANEL_IN_MENU` | `false` | 選單與鎖定狀態切換時是否同步氣候面板 |
| `LINE_NOTIFY_ENABLED` | `true` | 是否寫入 Firebase 通知節點（`sessions`、`filterAlerts`） |
| `FILTER_PERSIST_ENABLED` | `true` | 濾心用量是否寫入 Firebase（關閉時僅本機計時） |

### `scene-config.js`

- 若網域為 `github.io`，資源路徑前綴為 `/Graduate_3D_Model_House/`，否則為 `./`。
- `CONFIG.MODELS.BUILDING`：`models/20260805.glb`
- `CONFIG.MODELS.HDRI`：`hdri/studio-0623.hdr`
- `CONFIG.CAMERA`：`fov: 60`、起點 `(1.5, 1.5, -20.2)`、看向 `(5.46, 2.48, -11.12)`

---

## 雲端服務（Firebase）

### 初始化（`core/firebase.js`）

- Firebase 10.12.4 模組版，由 gstatic CDN 載入。
- 匯出 `db`（Realtime Database）、`auth` 與 `authReadyPromise`。
- 啟動時執行 `signInAnonymously`，登入成功後 `authReadyPromise` 解析；所有寫入 Firebase 的模組都會先 `await authReadyPromise`。

### 資料節點

| 路徑 | 寫入者 | 欄位 | 用途 |
|---|---|---|---|
| `filters/{裝置名}` | `filterState.js` | `usedSeconds`、`alerted`、`updatedAt` | 濾心累計使用秒數（`increment` 累加）與警告狀態 |
| `filterAlerts/{裝置名}` | `warnings.js`（`markFilterLowAlert`） | `status: "filter_low_alert"`、`notified`、`timestamp` | 濾心低量通知，供 LINE 通知服務讀取 |
| `sessions/{token}/{裝置名}` | `warnings.js`（`markTimeoutAlert`） | `status: "timeout_alert"`、`notified`、`timestamp`、`shouldClose` | 出水超時通知；`token` 為 `sessionId_時間戳`；連線斷開時由 `onDisconnect` 刪除 |

`token` 由 `state.sessionId`（每次開啟網頁唯一）與觸發時間組成。使用者按「我知道了」或「關閉水流」時會刪除對應節點。遠端服務寫入 `shouldClose: true` 時，本機會自動關閉水流。

### 寫入時機

- 濾心：每 `FILTER_SAVE_INTERVAL`（10 秒）節流寫入；關水時立即寫入；離開遊戲時寫入仍在出水的濾心；低量警告時寫入一次。
- 更換濾心：以 `set` 覆寫 `usedSeconds: 0`。
- 出水超時：觸發警告時寫入 `sessions`，並以 `onDisconnect` 登記自動刪除。

### 安全規則（建議）

```json
{
  "rules": {
    "filters": {
      "$device": {
        ".read": "auth != null",
        ".write": "auth != null",
        "usedSeconds": { ".validate": "newData.isNumber()" }
      }
    },
    "filterAlerts": {
      "$device": { ".read": "auth != null", ".write": "auth != null" }
    },
    "sessions": {
      "$token": {
        "$device": { ".read": "auth != null", ".write": "auth != null" }
      }
    }
  }
}
```

此規則為示意，實際上線前應依權限需求調整，例如限制只有特定身分能重設濾心或修改 `shouldClose`。

### 設定注意

- Firebase Console → Authentication 需啟用 **Anonymous** 登入。
- Google Cloud Console 的 API Key HTTP referrer 需包含部署網址與本機開發網址（例如 `http://127.0.0.1:5500`），否則會出現 `auth/permission-denied` 或 403。

---

## 外部服務（天氣）

`ui/weatherPanel.js` 使用 **Open-Meteo** 免費 API，不需金鑰：

```
https://api.open-meteo.com/v1/forecast?latitude={WEATHER_LAT}&longitude={WEATHER_LON}&current=temperature_2m,relative_humidity_2m,weather_code
```

- 座標由 `WEATHER_LAT` / `WEATHER_LON` 決定（目前為台北）。
- `ensureWeatherData()` 為唯一入口：1 小時（`WEATHER_CACHE_MS`）內沿用快取，同時多次呼叫會共用同一個 Promise。
- 天氣代碼依 WMO 標準轉為中文描述（`describeWeatherCode`）。
- 結果寫入 `state.currentOutdoorTemp`、`state.currentOutdoorHumidity`，供儀表板與氣候提示使用。
- 觸發時機：首次點擊畫面開始（`fadeOutBlackCover`）、開啟儀表板（`dashboard.js`）、首次開特定門（`climate.js`），以及 `SHOW_WEATHER_PANEL_ON_LOAD` 為 `true` 時載入即抓取。

氣候提示判斷（`climate.js`）：

- 溫度 > 28°C：顯示「已開啟冷氣」；
- 濕度 > 60%：顯示「已開啟除濕」；
- 皆不符合：顯示「環境舒適」。

這些門檻與儀表板 `dashboard.js` 中的判斷相同，目前寫死於程式碼中。

---

## 開發與部署

### 本機執行

`main.js` 以 ES Module 載入，並以 `fetch` 讀取模型與音效，必須透過 HTTP 伺服器開啟，不可直接以 `file://` 開啟。例如使用 VS Code 的 Live Server，根目錄為包含 `index.html` 的資料夾。

### GitHub Pages 部署

- `scene-config.js` 會依網域判斷路徑前綴，部署於 `github.io` 時自動加上 `/Graduate_3D_Model_House/`。
- 所有資源路徑必須與此前綴一致，且模型、音效與 HDRI 需一併上傳。

### 注意事項

- **路徑大小寫**：Linux 伺服器（包含 GitHub Pages）區分大小寫，檔名需完全一致。
- **Pointer Lock 冷卻**：Chrome 在 ESC 解鎖後約 1 秒內無法重新鎖定。
- **物件命名**：管路與裝置依名稱查找，拆檔後名稱必須全域唯一。
- **座標一致**：所有管路 GLB 需與建築使用相同原點與座標系，否則交錯偵測結果錯誤。
- **第三方資源**：Three.js、Draco 解碼器、Firebase SDK 皆由 CDN 載入，離線環境無法執行。
- **警告彈窗與解鎖**：`showWarning` 與 `showFilterWarning` 會呼叫 `controls.unlock()`，`pointer.js` 以 `programmaticUnlock` 區分，因此不會被當成 ESC 解鎖顯示「點畫面繼續」。

---

## 授權條款

本專案《該回家了吧》為個人獨立開發之 3D 互動空間展示專案，結合 Blender 3D 建模、Three.js 網頁 3D 渲染技術及 HTML、CSS、JavaScript 互動介面，呈現居家空間、環境資訊與智慧生活應用之概念。

1. **原創內容**：本專案自行製作之 3D 空間模型、場景配置、介面設計、互動流程及原創程式碼，其著作權歸原作者所有。未經原作者書面同意，不得擅自重製、散布、修改或作商業用途。
2. **第三方開源技術與素材**：本專案使用之開源函式庫、開發工具及第三方素材，均依照各自原始授權條款使用。其著作權及相關權利仍歸原開發者或著作權人所有。
3. **使用限制**：使用者如需引用、展示或使用本專案內容，應註明原始作者及專案來源。第三方素材之使用，另須遵守其原始授權規範。
4. **免責聲明**：本專案主要作為學術研究、技術展示及互動設計之用途，不代表實際智慧家庭設備之控制系統，亦不構成專業環境監測或設備安全保證。

---

## 致謝

感謝以下開源技術與開發工具，協助完成本專案之建構與實作：

| 工具／技術 | 使用項目 |
|---|---|
| Blender | 3D 空間建模、物件製作及場景設計 |
| Blendkit | 3D 家具、裝飾物件及材質素材資源 |
| Three.js | 網頁 3D 場景渲染與互動展示 |
| GLTFLoader | glTF／GLB 模型載入 |
| DRACOLoader | 3D 模型幾何資料壓縮與解碼 |
| EXRLoader | HDR／EXR 環境影像載入 |
| PointerLockControls | 第一人稱視角與空間漫遊 |
| HTML / CSS / JavaScript | 網頁介面及互動功能開發 |
| Google Apps Script | 環境數據串接與資料紀錄（如適用） |

此外，感謝各開源技術社群提供的文件、教學資源及技術分享，使本專案得以持續改善與完成。

對於本專案所使用之第三方模型、貼圖、環境影像及其他素材，將依其原始來源及授權規範另行標示。

**Project:** 該回家了吧
**Project Type:** 3D Interactive Smart Home Concept
**Developer:** 個人獨立開發
**Technology:** 3D Modeling / Web-based 3D Rendering / Interactive Development