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
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
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
