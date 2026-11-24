import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// iPhone でキーボードを閉じたあと、画面の見た目とタップの位置がずれることがある。
// キーボードが閉じたら、今のスクロール位置をもう一度入れ直して合わせる
const isEditable = (el: Element | null) => !!el && (el.matches('input, textarea, select') || (el as HTMLElement).isContentEditable);
const resync = () => window.scrollTo(window.scrollX, window.scrollY);
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (!isEditable(document.activeElement)) resync();
  }, 100);
});
window.visualViewport?.addEventListener('resize', () => {
  const vv = window.visualViewport!;
  // キーボードが閉じた（見えている高さが画面の高さに戻った）
  if (vv.height >= window.innerHeight - 1 && !isEditable(document.activeElement)) resync();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
