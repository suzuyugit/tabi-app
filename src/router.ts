import { useEffect, useState } from 'react';

// GitHub Pages ではサーバー側のルーティングが使えないので、ハッシュ（#/...）で画面を切り替える。
// 共有リンク（#share=...）はステップ4でここに追加する。

export type TabKey = 'itinerary' | 'money' | 'settle' | 'packing';
export const TAB_KEYS: TabKey[] = ['itinerary', 'money', 'settle', 'packing'];

export type Route =
  | { name: 'list' }
  | { name: 'settings' }
  | { name: 'newTrip' }
  | { name: 'editTrip'; tripId: string }
  | { name: 'trip'; tripId: string; tab: TabKey };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'new') return { name: 'newTrip' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'trip' && parts[1]) {
    if (parts[2] === 'edit') return { name: 'editTrip', tripId: parts[1] };
    const tab = TAB_KEYS.includes(parts[2] as TabKey) ? (parts[2] as TabKey) : 'itinerary';
    return { name: 'trip', tripId: parts[1], tab };
  }
  return { name: 'list' };
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'list':
      return '#/';
    case 'settings':
      return '#/settings';
    case 'newTrip':
      return '#/new';
    case 'editTrip':
      return `#/trip/${encodeURIComponent(r.tripId)}/edit`;
    case 'trip':
      return `#/trip/${encodeURIComponent(r.tripId)}/${r.tab}`;
  }
}

export function navigate(r: Route, opts: { replace?: boolean } = {}): void {
  const hash = routeToHash(r);
  if (opts.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
