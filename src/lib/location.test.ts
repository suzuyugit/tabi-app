import { describe, expect, it } from 'vitest';
import { dayLocations } from './location';

const trip = { startDate: '2026-01-01', endDate: '2026-01-04' };
const base = { places: [] as string[], order: 0 };

describe('その日どこにいるか', () => {
  it('宿 → 着いた場所 → 前の日を引き継ぐ。自分で決めた場所がいちばん', () => {
    const items = [
      { ...base, kind: 'stay', date: '2026-01-01', title: 'ホテル東京', places: ['東京'], checkOutDate: '2026-01-02' },
      { ...base, kind: 'move', date: '2026-01-02', time: '09:00', title: '飛行機', to: '新千歳空港', arrivalTime: '11:00' },
      { ...base, kind: 'move', date: '2026-01-02', time: '12:00', title: '電車', to: '札幌', arrivalTime: '13:00' },
    ];
    const m = dayLocations(trip, items);
    expect([...m.entries()]).toEqual([
      ['2026-01-01', '東京'],
      ['2026-01-02', '札幌'], // 最後に着いた場所
      ['2026-01-03', '札幌'], // 前の日を引き継ぐ
      ['2026-01-04', '札幌'],
    ]);
    const m2 = dayLocations({ ...trip, dayPlaces: { '2026-01-03': '小樽' } }, items);
    expect(m2.get('2026-01-03')).toBe('小樽');
    expect(m2.get('2026-01-04')).toBe('小樽');
  });

  it('連泊の宿は名前でもよい。情報がない日は出さない', () => {
    const items = [{ ...base, kind: 'stay', date: '2026-01-02', title: '旅館 京の宿', checkOutDate: '2026-01-04' }];
    const m = dayLocations(trip, items);
    expect(m.has('2026-01-01')).toBe(false);
    expect(m.get('2026-01-02')).toBe('旅館 京の宿');
    expect(m.get('2026-01-03')).toBe('旅館 京の宿');
    expect(m.get('2026-01-04')).toBe('旅館 京の宿'); // チェックアウトの日は前の日を引き継ぐ
  });
});
