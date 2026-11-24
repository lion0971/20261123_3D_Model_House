import { getPipeOverlapResults, onPipeOverlapReady } from '../physics/pipeOverlap.js';

// ═══════════════════════════════════════════
// 管路交錯提醒面板：只在透視模式下顯示
// ═══════════════════════════════════════════

export const overlapWarningPanel = document.createElement('div');
overlapWarningPanel.id = 'pipe-overlap-warning';
Object.assign(overlapWarningPanel.style, {
  position: 'fixed',
  bottom: '28px',
  right: '20px',
  maxWidth: '360px',
  padding: '12px 16px',
  borderRadius: '12px',
  background: 'rgba(14, 18, 30, 0.8)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
  color: '#f0f4f8',
  fontSize: '13px',
  lineHeight: '1.6',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  zIndex: '250',
  pointerEvents: 'none',
  display: 'none',
});
document.body.appendChild(overlapWarningPanel);

let visible = false;

function addLine(text, color, weight = 400) {
  const line = document.createElement('div');
  line.textContent = text; // 使用 textContent，避免模型名稱被當成 HTML
  line.style.color = color;
  line.style.fontWeight = String(weight);
  overlapWarningPanel.appendChild(line);
}

function render() {
  const results = getPipeOverlapResults();
  overlapWarningPanel.textContent = '';

    const title = document.createElement('div');
  Object.assign(title.style, {
    fontWeight: '600',
    letterSpacing: '1px',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });

  const badge = document.createElement('span');
  Object.assign(badge.style, {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    borderRadius: '3px',
    background: 'linear-gradient(135deg, #ff9f5a, #ff6b35)',
    boxShadow: '0 0 6px rgba(255, 138, 76, 0.6)',
    flexShrink: '0',
  });

  const titleText = document.createElement('span');
  titleText.textContent = '管路交錯檢查';

  title.appendChild(badge);
  title.appendChild(titleText);
  overlapWarningPanel.appendChild(title);

  if (results === null) {
    addLine('計算中…', 'rgba(240, 244, 248, 0.7)');
    return;
  }
  if (results.length === 0) {
    addLine('未偵測到管路交錯', '#7ee08a');
    return;
  }

  addLine(`發現 ${results.length} 組管路交錯`, '#ffb35c', 600);
  results.forEach(r => {
    addLine(`▲ ${r.a} ↔ ${r.b}`, '#ffd97a', 600);
    r.pairs.forEach(p => addLine(`    ${p}`, 'rgba(240, 244, 248, 0.85)'));
  });
}

export function showOverlapWarning() {
  visible = true;
  render();
  overlapWarningPanel.style.display = 'block';
}

export function hideOverlapWarning() {
  visible = false;
  overlapWarningPanel.style.display = 'none';
}

// 計算完成時，若面板正在顯示就更新內容
onPipeOverlapReady(() => {
  if (visible) render();
});