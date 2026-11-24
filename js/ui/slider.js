import * as THREE from 'three';
import { state } from '../core/state.js';
import { scene, renderer } from '../core/renderer.js';
import { sunLight, sunMesh } from '../loop/sun.js';
import { LIGHTS_ON_ELEV_RATIO, DEFAULT_DAY_VALUE } from '../data/constants.js';
import { isMobile } from '../core/controls.js';

// ── 太陽軌跡設定（方位角，弧度）──
// 日出點：滑桿 0 時的地平線方位；日落點：滑桿 100 時的地平線方位
// 預設 +75° / -75°，與原本的日出日落位置一致
const DEFAULT_SUNRISE_AZ_DEG = 75;
const DEFAULT_SUNSET_AZ_DEG = -75;
const SUN_MAX_ELEVATION = Math.PI / 4;

let sunriseAz = THREE.MathUtils.degToRad(DEFAULT_SUNRISE_AZ_DEG);
let sunsetAz = THREE.MathUtils.degToRad(DEFAULT_SUNSET_AZ_DEG);

// 將角度換算到 (-π, π]
function wrapPi(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// ── 提示視窗樣式（滑桿本身的樣式在 style.css 的 .sun-slider-wrap）──
const sliderStyleTag = document.createElement('style');
sliderStyleTag.textContent = `
.sun-dial-tip {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%) translateY(6px);
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(14, 18, 30, 0.78);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: 0 6px 20px rgba(0,0,0,0.35);
  color: #f0f4f8;
  font-size: 13px; line-height: 1.4; white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.2, 0.64, 1);
  z-index: 1;
}
.sun-dial-tip.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.sun-dial-tip .sep { margin: 0 8px; opacity: 0.4; }
.sun-dial-tip .sr { color: #7ec8ff; }
.sun-dial-tip .ss { color: #ff9f5a; }`;
document.head.appendChild(sliderStyleTag);

// ── 滑桿外框 ──
export const sliderWrap = document.createElement('div');
sliderWrap.className = 'sun-slider-wrap';
sliderWrap.style.opacity = '0'; // 其他模組會讀取此值判斷是否可見，保留 inline
document.body.appendChild(sliderWrap);

// ── 滑桿標題（放在膠囊內，透明度隨 sliderWrap 自動同步）──
const sliderTitle = document.createElement('div');
sliderTitle.className = 'sun-slider-title';
sliderTitle.textContent = '日落 ／ 日出';
sliderWrap.appendChild(sliderTitle);

// 左側圓球（白天亮、夜晚暗）
const sunOrb = document.createElement('span');
sunOrb.className = 'sun-orb sun-orb--sun';
sliderWrap.appendChild(sunOrb);

export const daySlider = document.createElement('input');
Object.assign(daySlider, { type: 'range', min: '0', max: '100', value: '15' });
daySlider.className = 'sun-range';
daySlider.style.setProperty('--fill', `${daySlider.value}%`);
sliderWrap.appendChild(daySlider);

// 右側圓球（夜晚亮、白天暗）
const moonOrb = document.createElement('span');
moonOrb.className = 'sun-orb sun-orb--moon';
sliderWrap.appendChild(moonOrb);

const sliderDivider = document.createElement('span');
sliderDivider.className = 'sun-divider';
sliderWrap.appendChild(sliderDivider);

// ── 太陽軌跡圓盤：兩個點分別代表日出與日落 ──
const DIAL_SIZE = 48;
const DIAL_CENTER = DIAL_SIZE / 2;
const DIAL_RADIUS = 16;

export const sunDial = document.createElement('div');
sunDial.className = 'sun-dial';

// 連線（兩點之間的線）
const dialSvgNS = 'http://www.w3.org/2000/svg';
const dialSvg = document.createElementNS(dialSvgNS, 'svg');
dialSvg.setAttribute('viewBox', `0 0 ${DIAL_SIZE} ${DIAL_SIZE}`);
Object.assign(dialSvg.style, {
  position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none',
});
const dialLine = document.createElementNS(dialSvgNS, 'line');
dialLine.setAttribute('stroke', 'rgba(255,255,255,0.45)');
dialLine.setAttribute('stroke-width', '1');
dialSvg.appendChild(dialLine);
sunDial.appendChild(dialSvg);

function makeDot(color, glow) {
  const dot = document.createElement('div');
  Object.assign(dot.style, {
    position: 'absolute',
    width: '10px',
    height: '10px',
    marginLeft: '-5px',
    marginTop: '-5px',
    borderRadius: '50%',
    background: color,
    boxShadow: `0 0 6px ${glow}`,
    pointerEvents: 'none',
  });
  sunDial.appendChild(dot);
  return dot;
}
const sunriseDot = makeDot('#7ec8ff', 'rgba(126,200,255,0.8)');
const sunsetDot = makeDot('#ff9f5a', 'rgba(255,159,90,0.8)');

// ── 提示視窗（靠近即顯示）──
const sunDialTip = document.createElement('div');
sunDialTip.className = 'sun-dial-tip';
sunDial.appendChild(sunDialTip);

function formatDeg(rad) {
  return `${Math.round(THREE.MathUtils.radToDeg(wrapPi(rad)))}°`;
}

function updateDialTip() {
  sunDialTip.innerHTML =
    `<span class="ss">日落</span> ${formatDeg(sunsetAz)}` +
    `<span class="sep">|</span>` +
    `<span class="sr">日出</span> ${formatDeg(sunriseAz)}` ;
}

function showDialTip() {
  if (state.isXRayMode) return;
  updateDialTip();
  sunDialTip.classList.add('show');
}

function hideDialTip() {
  sunDialTip.classList.remove('show');
}

// 方位角 → 圓盤上的座標（0° 在頂部，順時針為正，與 Three.js 的 sin/cos 座標一致）
function azToXY(az) {
  return {
    x: DIAL_CENTER + DIAL_RADIUS * Math.sin(az),
    y: DIAL_CENTER - DIAL_RADIUS * Math.cos(az),
  };
}

function updateDialVisuals() {
  const a = azToXY(sunriseAz);
  const b = azToXY(sunsetAz);
  sunriseDot.style.left = `${a.x}px`;
  sunriseDot.style.top = `${a.y}px`;
  sunsetDot.style.left = `${b.x}px`;
  sunsetDot.style.top = `${b.y}px`;
  dialLine.setAttribute('x1', a.x);
  dialLine.setAttribute('y1', a.y);
  dialLine.setAttribute('x2', b.x);
  dialLine.setAttribute('y2', b.y);
  if (sunDialTip.classList.contains('show')) updateDialTip();
}

// 太陽在 n（0~1）時的方位角：從日出點沿較短的弧走到日落點
function sunAzimuthAt(n) {
  const delta = wrapPi(sunsetAz - sunriseAz);
  return sunriseAz + delta * n;
}

function refreshSun() {
  if (state.isXRayMode) return;
  applyDayNight(parseFloat(daySlider.value));
}

// 拖曳時使用的點：'sunrise' 或 'sunset'
let activeHandle = null;

function pointerAngle(e) {
  const r = sunDial.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  return Math.atan2(dx, -dy);
}

function setHandleAz(az) {
  if (activeHandle === 'sunrise') sunriseAz = az;
  else if (activeHandle === 'sunset') sunsetAz = az;
  updateDialVisuals();
  refreshSun();
}

// 感應式顯示：滑鼠靠近圓盤（含容差）即顯示，離開範圍即收回
const DIAL_TRIGGER_MARGIN = 28;
let dialMouseRaf = 0;
let dialHovered = false;

window.addEventListener('mousemove', (e) => {
  if (isMobile || state.isXRayMode) return;
  if (sliderWrap.style.opacity === '0') return; // 滑桿隱藏時不顯示
  if (dialMouseRaf) return;
  const mx = e.clientX, my = e.clientY;
  dialMouseRaf = requestAnimationFrame(() => {
    dialMouseRaf = 0;
    const r = sunDial.getBoundingClientRect();
    const inside =
      mx >= r.left - DIAL_TRIGGER_MARGIN && mx <= r.right + DIAL_TRIGGER_MARGIN &&
      my >= r.top - DIAL_TRIGGER_MARGIN - 60 && my <= r.bottom + DIAL_TRIGGER_MARGIN;
    if (inside && !dialHovered) {
      dialHovered = true;
      showDialTip();
    } else if (!inside && dialHovered && !activeHandle) {
      dialHovered = false;
      hideDialTip();
    }
  });
});

sunDial.addEventListener('pointerdown', (e) => {
  if (state.isXRayMode) return;
  e.stopPropagation();

  // 選擇角度上較近的那個點
  const ang = pointerAngle(e);
  const dRise = Math.abs(wrapPi(ang - sunriseAz));
  const dSet = Math.abs(wrapPi(ang - sunsetAz));
  activeHandle = dRise <= dSet ? 'sunrise' : 'sunset';

  sunDial.setPointerCapture(e.pointerId);
  showDialTip();
  setHandleAz(ang);
});

sunDial.addEventListener('pointermove', (e) => {
  if (!activeHandle || state.isXRayMode) return;
  setHandleAz(pointerAngle(e));
});

const endDialDrag = () => {
  activeHandle = null;
  if (!dialHovered) hideDialTip();
};
sunDial.addEventListener('pointerup', endDialDrag);
sunDial.addEventListener('pointercancel', endDialDrag);
sunDial.addEventListener('click', e => e.stopPropagation());
sunDial.addEventListener('dblclick', (e) => {
  e.stopPropagation();
  if (state.isXRayMode) return;
  sunriseAz = THREE.MathUtils.degToRad(DEFAULT_SUNRISE_AZ_DEG);
  sunsetAz = THREE.MathUtils.degToRad(DEFAULT_SUNSET_AZ_DEG);
  updateDialVisuals();
  refreshSun();
});

sliderWrap.appendChild(sunDial);
updateDialVisuals();

// 日夜核心：t 為滑桿值 0~100
// n 決定太陽在軌跡上的位置；方位角沿日出→日落的弧移動，高度為正弦曲線
// elevRatio（兩端 0、中間 1）用來算亮度、色溫、曝光
export function applyDayNight(t) {
  const n = t / 100;

  // 軌跡條已填色長度（CSS 的 --fill）
  daySlider.style.setProperty('--fill', `${t}%`);

  const elevation = Math.sin(n * Math.PI) * SUN_MAX_ELEVATION;
  const elevRatio = elevation / SUN_MAX_ELEVATION;

  // 圓球亮度依滑桿位置變化：0 時太陽球最亮、100 時月亮球最亮
  sunOrb.style.opacity = String(1 - n * 0.65);
  moonOrb.style.opacity = String(0.35 + n * 0.65);

  const azimuth = sunAzimuthAt(n);
  const dist = 60;

  const sx = Math.cos(elevation) * Math.sin(azimuth) * dist;
  const sy = Math.sin(elevation) * dist;
  const sz = Math.cos(elevation) * Math.cos(azimuth) * dist;

  sunLight.position.set(sx, sy, sz);
  sunMesh.position.set(sx, sy, sz);

  sunLight.intensity = Math.sin(elevation) * 3.6;

  const dawnColor = new THREE.Color(0xffd0a0);
  const noonColor = new THREE.Color(0xfff5e0);
  const sunColor = dawnColor.clone().lerp(noonColor, elevRatio);
  sunLight.color.copy(sunColor);
  sunMesh.material.color.copy(sunColor);

  renderer.toneMappingExposure = 0.2 + elevRatio * 1.0;

  const ambLight = scene.children.find(o => o.isAmbientLight);
  if (ambLight) ambLight.intensity = 0.005 + elevRatio * 0.5;

  if (scene.background instanceof THREE.Color) {
    scene.background.lerpColors(new THREE.Color(0x0d0503), new THREE.Color(0x87ceeb), elevRatio);
  }

  // 燈泡目標亮度：日出 / 日落附近開燈，正午熄燈
  if (elevRatio <= 0.5) {
    const refExp = 1.8;
    const curExp = 1.3 + elevRatio;
    state.targetBulbStrength = Math.min(refExp / curExp, 3.0);
  } else if (elevRatio <= LIGHTS_ON_ELEV_RATIO) {
    state.targetBulbStrength = 1.0;
  } else {
    state.targetBulbStrength = 0.0;
  }
}

daySlider.addEventListener('input', () => {
  if (state.isXRayMode) return;
  applyDayNight(parseFloat(daySlider.value));
});
daySlider.addEventListener('mousedown', e => e.stopPropagation());
daySlider.addEventListener('click', e => e.stopPropagation());

export { DEFAULT_DAY_VALUE };