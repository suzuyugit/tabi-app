import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { moveItem } from '../lib/itinerary';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10; // これ以上指が動いたらスクロールとみなして長押しをやめる
const GAP = 10; // カード同士の間隔（CSS の .item-list の gap と合わせる）

type Drag = { id: string; from: number; over: number; startY: number; dy: number; mids: number[]; heights: number[] };

/**
 * 長押しでつかんで、上下に動かして並び替える。
 * つかんでいる間はページのスクロールを止める。
 */
export function useLongPressReorder(ids: string[], onCommit: (ids: string[]) => void) {
  const els = useRef(new Map<string, HTMLElement>());
  const pending = useRef<{ x: number; y: number; timer: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const draggedAt = useRef(0);

  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  // つかんでいる間はタッチでのスクロールを止める（passive: false が必要）
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => document.removeEventListener('touchmove', onTouchMove);
  }, []);

  const clearPending = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  };

  const finish = (commit: boolean) => {
    clearPending();
    const d = dragRef.current;
    if (!d) return;
    draggedAt.current = Date.now();
    setDrag(null);
    if (commit && d.over !== d.from) onCommit(moveItem(ids, d.from, d.over));
  };

  const bind = (id: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) els.current.set(id, el);
      else els.current.delete(id);
    },
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.currentTarget;
      const { pointerId, clientX, clientY } = e;
      clearPending();
      const timer = window.setTimeout(() => {
        pending.current = null;
        const rects = ids.map((i) => els.current.get(i)?.getBoundingClientRect());
        if (rects.some((r) => !r)) return;
        try {
          el.setPointerCapture(pointerId);
        } catch {
          // 指がすでに離れている
          return;
        }
        navigator.vibrate?.(15);
        setDrag({
          id,
          from: ids.indexOf(id),
          over: ids.indexOf(id),
          startY: clientY,
          dy: 0,
          mids: rects.map((r) => r!.top + r!.height / 2),
          heights: rects.map((r) => r!.height),
        });
      }, LONG_PRESS_MS);
      pending.current = { x: clientX, y: clientY, timer };
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      const p = pending.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) clearPending();
      const d = dragRef.current;
      if (!d || d.id !== id) return;
      const dy = e.clientY - d.startY;
      const center = d.mids[d.from] + dy;
      const over = d.mids.filter((m, i) => i !== d.from && m < center).length;
      setDrag({ ...d, dy, over });
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // 並び替えのあとに続けて来るクリックで編集画面が開かないようにする
    onClickCapture: (e: React.MouseEvent) => {
      if (Date.now() - draggedAt.current < 500) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
  });

  /** i 番目のカードに付けるスタイル */
  const styleFor = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (index === drag.from) {
      return { transform: `translateY(${drag.dy}px) scale(1.02)`, zIndex: 5, transition: 'none' };
    }
    const shift = drag.heights[drag.from] + GAP;
    if (drag.from < drag.over && index > drag.from && index <= drag.over) return { transform: `translateY(${-shift}px)` };
    if (drag.from > drag.over && index >= drag.over && index < drag.from) return { transform: `translateY(${shift}px)` };
    return undefined;
  };

  return { bind, styleFor, draggingId: drag?.id };
}
