import { useEffect } from 'react';
import { useRoute, type Route } from './router';
import { TripListScreen } from './screens/TripListScreen';
import { TripFormScreen } from './screens/TripFormScreen';
import { TripScreen } from './screens/TripScreen';
import { ToastHost } from './components/Toast';
import { UpdateBanner } from './components/UpdateBanner';
import { SettingsScreen } from './screens/SettingsScreen';
import { SummaryScreen } from './screens/SummaryScreen';
import { ShareViewScreen } from './screens/ShareViewScreen';
import { PackingListScreen, PackingListsScreen } from './screens/PackingListsScreen';

function renderRoute(route: Route) {
  switch (route.name) {
    case 'list':
      return <TripListScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'packingLists':
      return <PackingListsScreen />;
    case 'packingList':
      return <PackingListScreen key={route.id} id={route.id} />;
    case 'share':
      return <ShareViewScreen data={route.data} />;
    case 'newTrip':
      return <TripFormScreen key="new" />;
    case 'editTrip':
      return <TripFormScreen key={route.tripId} tripId={route.tripId} />;
    case 'summary':
      return <SummaryScreen key={route.tripId} tripId={route.tripId} />;
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
      <UpdateBanner />
    </>
  );
}
