import { describe, expect, it } from 'vitest';
import { dayShiftLabel, diffLabel, hasTimeDiff, localMinutes, msToIso, msToWall, otherZoneTime, wallToMs } from './timezone';

describe('timezone', () => {
  it('壁時計と瞬間の行き来', () => {
    const ms = wallToMs('2026-12-01', '10:00', 'Pacific/Honolulu');
    expect(msToWall(ms, 'Asia/Tokyo')).toEqual({ date: '2026-12-02', time: '05:00' });
    expect(msToIso(ms, 'Pacific/Honolulu')).toBe('2026-12-01T10:00:00-10:00');
  });

  it('夏時間（ニューヨーク 7月は -4、12月は -5）', () => {
    expect(msToWall(wallToMs('2026-07-01', '09:00', 'America/New_York'), 'Asia/Tokyo').time).toBe('22:00');
    expect(msToWall(wallToMs('2026-12-01', '09:00', 'America/New_York'), 'Asia/Tokyo').time).toBe('23:00');
  });

  it('時差の有無と説明', () => {
    expect(hasTimeDiff({ timeZone: 'Asia/Seoul', startDate: '2026-12-01' })).toBe(false);
    expect(hasTimeDiff({ timeZone: 'Pacific/Honolulu', startDate: '2026-12-01' })).toBe(true);
    expect(hasTimeDiff({ startDate: '2026-12-01' })).toBe(false);
    expect(diffLabel('Pacific/Honolulu', '2026-12-01')).toBe('日本より19時間遅い');
    expect(diffLabel('Asia/Bangkok', '2026-12-01')).toBe('日本より2時間遅い');
    expect(diffLabel('Pacific/Auckland', '2026-12-01')).toBe('日本より4時間進んでいる');
  });

  it('もう片方の時間帯で表す', () => {
    const hi = { timeZone: 'Pacific/Honolulu' };
    expect(otherZoneTime(hi, '2026-12-01', '10:00', 'local')).toEqual({ label: '日本', time: '05:00', shift: '翌日' });
    expect(otherZoneTime(hi, '2026-12-01', '20:00', 'japan')).toEqual({ label: '現地', time: '01:00', shift: '' });
    expect(otherZoneTime(hi, '2026-12-01', '03:00', 'japan')).toEqual({ label: '現地', time: '08:00', shift: '前日' });
  });

  it('並べ替えのキー（現地のその日の0時からの分）', () => {
    const hi = { timeZone: 'Pacific/Honolulu' };
    expect(localMinutes(hi, '2026-12-01', '2026-12-01', '10:00', 'local')).toBe(600);
    // 日本 12/2 06:00 = 現地 12/1 11:00
    expect(localMinutes(hi, '2026-12-01', '2026-12-02', '06:00', 'japan')).toBe(660);
    expect(dayShiftLabel('2026-12-01', '2026-12-03')).toBe('2日後');
  });
});

import { inputToIso, isoDate, isoTime, isoToInput } from './datetime';

describe('支出の日時（現地時間）', () => {
  it('現地時間で入力して、現地時間で表示する', () => {
    const iso = inputToIso('2026-12-01T19:30', 'Pacific/Honolulu')!;
    expect(iso).toBe('2026-12-01T19:30:00-10:00');
    expect(isoToInput(iso, 'Pacific/Honolulu')).toBe('2026-12-01T19:30');
    expect(isoDate(iso, 'Pacific/Honolulu')).toBe('2026-12-01');
    // 日本時間だと翌日
    expect(isoDate(iso, 'Asia/Tokyo')).toBe('2026-12-02');
    expect(isoTime(iso, 'Asia/Tokyo')).toBe('14:30');
  });
});
