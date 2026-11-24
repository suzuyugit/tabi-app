import { describe, expect, it } from 'vitest';
import { continuesOn, fallbackTitle, nightsOf, stayOn, insertIndex, itemIcon, moveItem, nearestItem, normalizeUrl, routeUrl, tripDays } from './itinerary';

describe('itinerary', () => {
  it('tripDays：月をまたぐ', () => {
    expect(tripDays({ startDate: '2026-11-30', endDate: '2026-12-02' }).map((d) => [d.label, d.date])).toEqual([
      ['1日目', '2026-11-30'],
      ['2日目', '2026-12-01'],
      ['3日目', '2026-12-02'],
    ]);
  });

  it('insertIndex：時刻順の位置。時刻なしは最後', () => {
    const day = [540, undefined, 720];
    expect(insertIndex(day, 600)).toBe(2);
    expect(insertIndex(day, 480)).toBe(0);
    expect(insertIndex(day, 780)).toBe(3);
    expect(insertIndex(day, undefined)).toBe(3);
  });

  it('insertIndex：最後に未定がまとまっていたら、その上に入れる', () => {
    expect(insertIndex([480, undefined], 720)).toBe(1);
    expect(insertIndex([undefined, undefined], 720)).toBe(0);
  });

  it('moveItem', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('nearestItem：今日の予定で時刻がいちばん近いもの', () => {
    const now = new Date(2026, 10, 24, 12, 10);
    const items = [
      { id: 'a', date: '2026-11-24', time: '09:00' },
      { id: 'b', date: '2026-11-24', time: '13:00' },
      { id: 'c', date: '2026-11-25', time: '12:10' },
      { id: 'd', date: '2026-11-24', time: undefined },
    ];
    expect(nearestItem(items, now)?.id).toBe('b');
    expect(nearestItem([items[2]], now)).toBeUndefined();
  });

  it('normalizeUrl', () => {
    expect(normalizeUrl('example.com/a')).toBe('https://example.com/a');
    expect(normalizeUrl('http://x.jp')).toBe('http://x.jp');
    expect(normalizeUrl('  ')).toBeUndefined();
  });

  it('移動：アイコン・代わりのタイトル・経路 URL', () => {
    expect(itemIcon({ kind: 'move', transport: 'plane' })).toBe('✈️');
    expect(itemIcon({ kind: 'food' })).toBe('🍽️');
    expect(fallbackTitle({ kind: 'move', transport: 'taxi' })).toBe('タクシー');
    const u = new URL(routeUrl('羽田空港', '新千歳空港', 'taxi'));
    expect(u.searchParams.get('origin')).toBe('羽田空港');
    expect(u.searchParams.get('destination')).toBe('新千歳空港');
    expect(u.searchParams.get('travelmode')).toBe('driving');
    expect(new URL(routeUrl('a', 'b', 'plane')).searchParams.get('travelmode')).toBe('transit');
  });

  it('continuesOn：日をまたぐ移動は到着日と途中の日にも出す', () => {
    const ship = { kind: 'move' as const, date: '2026-12-01', arrivalDate: '2026-12-03' };
    expect(continuesOn(ship, '2026-12-01')).toBe(false);
    expect(continuesOn(ship, '2026-12-02')).toBe(true);
    expect(continuesOn(ship, '2026-12-03')).toBe(true);
    expect(continuesOn(ship, '2026-12-04')).toBe(false);
    expect(continuesOn({ ...ship, kind: 'food' as const }, '2026-12-02')).toBe(false);
  });

  it('stayOn：3泊なら間の2日は連泊中、最後の日はチェックアウト', () => {
    const hotel = { kind: 'stay' as const, date: '2026-12-01', checkOutDate: '2026-12-04' };
    expect(nightsOf(hotel)).toBe(3);
    expect(stayOn(hotel, '2026-12-01')).toBeUndefined();
    expect(stayOn(hotel, '2026-12-02')).toBe('night');
    expect(stayOn(hotel, '2026-12-03')).toBe('night');
    expect(stayOn(hotel, '2026-12-04')).toBe('checkout');
    expect(stayOn(hotel, '2026-12-05')).toBeUndefined();
    expect(stayOn({ ...hotel, kind: 'food' as const }, '2026-12-02')).toBeUndefined();
  });
});
