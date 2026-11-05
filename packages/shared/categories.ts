export const CATEGORIES = ['grocery', 'sari_sari', 'pharmacy', 'school', 'utilities', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

// Words as they read in the middle of a sentence: "groceries are allowed".
export const CATEGORY_LABELS: Record<Category, string> = {
  grocery: 'groceries',
  sari_sari: 'sari-sari stores',
  pharmacy: 'medicine',
  school: 'school costs',
  utilities: 'bills',
  other: 'this kind of shop',
}
