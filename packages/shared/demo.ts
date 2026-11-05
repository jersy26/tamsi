// The one demo family. Setup and the server's boot seed both read these, so the
// local database and the one on the Railway volume can't drift apart.
import type { Category } from './categories.ts'

export const DEMO_CARD = {
  label: 'Family card',
  holderName: 'Jun',
  // On-chain per-tap max. It sits below the daily cap so Noir's own over_limit can fire.
  maxPerTapXlm: '10',
  policyDays: 30,
} as const

export const DEMO_RULES = {
  dailyCapXlm: '25',
  iponFloorXlm: '20',
  allowedCategories: ['grocery', 'sari_sari', 'pharmacy', 'school', 'utilities'] as Category[],
  nextPaydayDays: 14,
} as const

// Ids match the keys of MERCHANT_SECRETS.
export const DEMO_MERCHANTS: { id: string; name: string; category: Category }[] = [
  { id: 'grocery', name: "Aling Nena's Store", category: 'grocery' },
  { id: 'pharmacy', name: 'Mabuhay Botika', category: 'pharmacy' },
  { id: 'arcade', name: 'Games arcade', category: 'other' },
]
