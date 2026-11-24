import { useEffect, useState } from 'react';

/** 今の時刻（ms）。interval ミリ秒ごとに更新する */
export function useNow(interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
