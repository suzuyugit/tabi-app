import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Trip } from '../db/types';
import { dayLocations } from '../lib/location';

/** 日付 → その日いる場所（旅程から決める。自分で決めた場所が優先） */
export function useDayPlaces(trip: Pick<Trip, 'id' | 'startDate' | 'endDate' | 'dayPlaces'>): Map<string, string> {
  return (
    useLiveQuery(
      async () => dayLocations(trip, await db.itineraryItems.where('tripId').equals(trip.id).toArray()),
      [trip.id, trip.startDate, trip.endDate, trip.dayPlaces],
    ) ?? new Map()
  );
}
