import { useEffect, type ReactNode } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  /** ヘッダー右側（保存ボタンなど） */
  action?: ReactNode;
  /** true なら画面の上のほうまで高さを取る（キーボードが出ても上部が見えるように） */
  tall?: boolean;
  children: ReactNode;
};

/** 下から出てくるシート */
export function Sheet({ title, onClose, action, tall, children }: Props) {
  useEffect(() => {
    // 後ろのページを今の位置で止める。iPhone は overflow: hidden だけだとキーボードの開け閉めで
    // ページが動き、タップの位置が見た目とずれることがあるので、body を固定して閉じるときに元の位置へ戻す
    const body = document.body;
    const y = window.scrollY;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, overflow: body.style.overflow };
    const alreadyLocked = prev.position === 'fixed'; // シートの上にシートを開いたとき
    if (!alreadyLocked) {
      body.style.position = 'fixed';
      body.style.top = `-${y}px`;
      body.style.left = '0';
      body.style.right = '0';
    }
    body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      Object.assign(body.style, prev);
      if (!alreadyLocked) window.scrollTo(0, y);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={`sheet ${tall ? 'sheet-tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-header">
          <button type="button" className="btn-text" onClick={onClose}>
            閉じる
          </button>
          <h2>{title}</h2>
          <div className="sheet-action">{action}</div>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
