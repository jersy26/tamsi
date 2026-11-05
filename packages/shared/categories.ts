export const CATEGORIES = ['grocery', 'sari_sari', 'pharmacy', 'school', 'utilities', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

// The middle of the approval sentence: "Paid 5 XLM at the shop — groceries are allowed".
export const CATEGORY_ALLOWED: Record<Category, string> = {
  grocery: 'groceries are allowed',
  sari_sari: 'sari-sari stores are allowed',
  pharmacy: 'medicine is allowed',
  school: 'school costs are allowed',
  utilities: 'bills are allowed',
  other: 'this shop is allowed',
}
