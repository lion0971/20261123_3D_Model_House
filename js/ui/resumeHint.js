// 解鎖（ESC）後顯示「點畫面繼續」提示
// pointer-events: none 讓點擊穿透到 canvas，由 pointer.js 的 click 負責重新鎖定
const hint = document.createElement('div');
hint.id = 'resume-hint';
hint.textContent = '點畫面繼續';
document.body.appendChild(hint);

export function showResumeHint() {
  hint.classList.add('show');
}

export function hideResumeHint() {
  hint.classList.remove('show');
}