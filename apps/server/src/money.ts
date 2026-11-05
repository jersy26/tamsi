import { fromStroops } from '@noirx402/agent-sdk'
import type { Money } from '@tamsi/shared'

const STROOPS_PER_XLM_SQUARED = 10n ** 14n

export function toMoney(stroops: bigint, phpPerXlm: bigint | null): Money {
  return {
    xlm: fromStroops(stroops),
    php: phpPerXlm === null ? null : ((stroops * phpPerXlm) / STROOPS_PER_XLM_SQUARED).toString(),
  }
}
