import { useEffect } from 'react';
import { useRoute, type Route } from './router';
import { TripListScreen } from './screens/TripListScreen';
import { TripFormScreen } from './screens/TripFormScreen';
import { TripScreen } from './screens/TripScreen';
import { ToastHost } from './components/Toast';

function renderRoute(route: Route) {
  switch (route.name) {
    case 'list':
      return <TripListScreen />;
    case 'newTrip':
      return <TripFormScreen key="new" />;
    case 'editTrip':
      return <TripFormScreen key={route.tripId} tripId={route.tripId} />;
    case 'trip':
      return <TripScreen key={route.tripId} tripId={route.tripId} tab={route.tab} />;
  }
}

export function App() {
  const route = useRoute();

  // 画面が変わったら先頭へスクロール
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name]);

  return (
    <>
      {renderRoute(route)}
      <ToastHost />
    </>
  );
}
