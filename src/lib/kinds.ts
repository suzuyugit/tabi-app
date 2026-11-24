// 予定の種類（自分で追加・編集できる）。最初から入っている種類の ID は固定
import type { ItemKindDef } from '../db/types';

export const OTHER_KIND = 'other';
export const OTHER_CATEGORY = 'cat-07-other';

/** 消せない種類（移動・宿泊は専用の入力欄があり、その他は消したときの受け皿） */
export const LOCKED_KINDS = new Set(['move', 'stay', OTHER_KIND]);
/** 消せないカテゴリ（消したときの受け皿） */
export const LOCKED_CATEGORIES = new Set([OTHER_CATEGORY]);

export const DEFAULT_ITEM_KINDS: ItemKindDef[] = [
  { id: 'move', name: '移動', icon: '🚃', order: 0, categoryId: 'cat-01-transport' },
  { id: 'food', name: '食事', icon: '🍽️', order: 1, categoryId: 'cat-03-food' },
  { id: 'sightseeing', name: '観光', icon: '📸', order: 2, categoryId: 'cat-05-sightseeing' },
  { id: 'stay', name: '宿泊', icon: '🏨', order: 3, categoryId: 'cat-02-hotel' },
  { id: 'shopping', name: '買い物', icon: '🛍️', order: 4, categoryId: 'cat-06-souvenir' },
  { id: OTHER_KIND, name: 'その他', icon: '📌', order: 5, categoryId: OTHER_CATEGORY },
];

/** アイコンの候補（ここにないものはキーボードの絵文字で入れられる） */
export const ICON_CHOICES = [
  '🚃', '🚄', '✈️', '🚌', '🚕', '🚗', '🚲', '🚶', '⛴️', '⛽',
  '🏨', '🛏️', '♨️', '⛺', '🏠',
  '🍽️', '🍚', '🍜', '🍣', '🍖', '🍺', '☕', '🍰', '🍦', '🍙',
  '📸', '🏯', '⛩️', '🏛️', '🎢', '🎡', '🏖️', '⛰️', '🌸', '🎫', '🎨', '🎤', '⚽', '🎮',
  '🛍️', '🎁', '👕', '💊', '💄', '📚',
  '💴', '💳', '📱', '🧾', '🎟️', '📦', '📌', '⭐', '❤️', '🐾',
];
