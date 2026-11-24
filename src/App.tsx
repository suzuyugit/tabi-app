import { useEffect } from 'react';
import { useRoute } from './router';
import { TripListScreen } from './screens/TripListScreen';
import { TripFormScreen } from './screens/TripFormScreen';
import { TripScreen } from './screens/TripScreen';

export function App() {
  const route = useRoute();

  // 画面が変わったら先頭へスクロール
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name]);

  switch (route.name) {
    case 'list':
      return <TripListScreen />;
    case 'newTrip':
      return <TripFormScreen key="new" />;
    case 'editTrip':
      return <TripFormScreen key={route.tripId} tripId={route.tripId} />;
    case 'trip':
      return <TripScreen tripId={route.tripId} tab={route.tab} />;
  }
}
