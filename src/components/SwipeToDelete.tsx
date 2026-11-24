import { useRef, useState, type ReactNode } from 'react';

type Props = {
  /** 削除してよいか確認して、消したら true を返す */
  onDelete: () => Promise<boolean> | boolean;
  children: ReactNode;
};

const START = 10; // これ以上横に動いたらスライドとみなす
const RATIO = 0.3; // 行の幅のこの割合を超えて離したら削除の確認

/** 左にスライドすると削除（確認つき）。縦のスクロールとタップはそのまま */
export function SwipeToDelete({ onDelete, children }: Props) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiping = useRef(false);
  const swipedAt = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    setAnimating(true);
    setDx(0);
    start.current = null;
    swiping.current = false;
  };

  return (
    <div className="swipe" ref={rowRef}>
      <div className={`swipe-bg ${dx < -((rowRef.current?.offsetWidth ?? 300) * RATIO) ? 'armed' : ''}`} aria-hidden="true">
        🗑 削除
      </div>
      <div
        className="swipe-front"
        style={{ transform: `translateX(${dx}px)`, transition: animating ? 'transform 0.2s ease' : 'none' }}
        onTransitionEnd={() => setAnimating(false)}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          swiping.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!swiping.current) {
            // 縦に動いたらスクロールに任せる
            if (Math.abs(my) > START && Math.abs(my) > Math.abs(mx)) {
              start.current = null;
              return;
            }
            if (Math.abs(mx) < START) return;
            swiping.current = true;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // 取れなくても動く
            }
          }
          setDx(Math.min(0, mx));
        }}
        onPointerUp={async () => {
          if (!swiping.current) {
            start.current = null;
            return;
          }
          swipedAt.current = Date.now();
          const width = rowRef.current?.offsetWidth ?? 300;
          if (dx < -width * RATIO) {
            const deleted = await onDelete();
            if (deleted) return; // 行ごと消える
          }
          reset();
        }}
        onPointerCancel={reset}
        // スライドした直後のクリックで編集が開かないようにする
        onClickCapture={(e) => {
          if (Date.now() - swipedAt.current < 400) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
