import { describe, expect, it } from 'vitest';
import { parseYenInput, sortTrips, tripStatus, validateTrip, type TripInput } from './trips';
import { dayCount, formatRange } from './date';

const t = (id: string, startDate: string, endDate: string) => ({ id, startDate, endDate, createdAt: '2026-01-01T00:00:00Z' });

describe('tripStatus / sortTrips', () => {
  const today = '2026-11-24';
  it('旅行中・これから・終わったを判定する', () => {
    expect(tripStatus(t('a', '2026-11-23', '2026-11-25'), today)).toBe('ongoing');
    expect(tripStatus(t('a', '2026-11-24', '2026-11-24'), today)).toBe('ongoing');
    expect(tripStatus(t('a', '2026-12-01', '2026-12-02'), today)).toBe('upcoming');
    expect(tripStatus(t('a', '2026-11-01', '2026-11-23'), today)).toBe('past');
  });

  it('旅行中 → 近い順のこれから → 最近終わった順', () => {
    const trips = [
      t('past-old', '2026-01-01', '2026-01-02'),
      t('future-far', '2027-03-01', '2027-03-02'),
      t('past-recent', '2026-11-10', '2026-11-12'),
      t('ongoing', '2026-11-24', '2026-11-26'),
      t('future-near', '2026-12-01', '2026-12-03'),
    ];
    expect(sortTrips(trips, today).map((x) => x.id)).toEqual([
      'ongoing',
      'future-near',
      'future-far',
      'past-recent',
      'past-old',
    ]);
  });
});

describe('validateTrip', () => {
  const ok: TripInput = {
    name: '京都',
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    budget: 90000,
    members: [
      { id: '1', name: '鈴木', isMe: true },
      { id: '2', name: '佐藤', isMe: false },
    ],
  };
  it('正しい入力ならエラーなし', () => expect(validateTrip(ok)).toEqual([]));
  it('名前が空', () => expect(validateTrip({ ...ok, name: ' ' })).toHaveLength(1));
  it('終了日が開始日より前', () => expect(validateTrip({ ...ok, endDate: '2026-11-30' })).toHaveLength(1));
  it('予算が負・小数', () => {
    expect(validateTrip({ ...ok, budget: -1 })).toHaveLength(1);
    expect(validateTrip({ ...ok, budget: 1.5 })).toHaveLength(1);
  });
  it('メンバー名の重複・空', () => {
    expect(validateTrip({ ...ok, members: [...ok.members, { id: '3', name: '佐藤', isMe: false }] })).toHaveLength(1);
    expect(validateTrip({ ...ok, members: [...ok.members, { id: '3', name: '', isMe: false }] }).length).toBeGreaterThan(0);
  });
  it('自分がいない', () => {
    expect(validateTrip({ ...ok, members: ok.members.map((m) => ({ ...m, isMe: false })) })).toHaveLength(1);
  });
});

describe('parseYenInput', () => {
  it('数字・全角・カンマ・空', () => {
    expect(parseYenInput('12000')).toBe(12000);
    expect(parseYenInput('１２,０００円')).toBe(12000);
    expect(parseYenInput('')).toBeUndefined();
    expect(parseYenInput('12.5')).toBeNaN();
    expect(parseYenInput('-3')).toBeNaN();
  });
});

describe('date', () => {
  it('日数と表示', () => {
    expect(dayCount('2026-12-30', '2027-01-01')).toBe(3);
    expect(formatRange('2026-11-24', '2026-11-26')).toBe('2026/11/24(火)〜11/26(木)・2泊3日');
    expect(formatRange('2026-11-24', '2026-11-24')).toBe('2026/11/24(火)・日帰り');
  });
});
