// Ties the decision to the per-card queue. The tap is saved inside its queue slot, so
// the next tap on the card always sees it in today's spend: that closes the cap race.
import { decide, type Chain, type Decision, type DecisionStore, type TapRequest } from './decide.ts'
import { SerialQueue } from './queue.ts'

export interface TapStore extends DecisionStore {
  saveTap(tap: TapRequest, decision: Decision): string
}

export type TapOutcome = Decision & { id: string }

export function createTamsi(deps: { store: TapStore; chain: Chain; now?: () => Date; display?: (stroops: bigint) => string }) {
  const queue = new SerialQueue()
  return {
    tap(request: TapRequest): Promise<TapOutcome> {
      return queue.run(request.deviceHash, async () => {
        const decision = await decide(request, deps)
        return { ...decision, id: deps.store.saveTap(request, decision) }
      })
    },
    // Runs between taps on this card, so nothing can pay during the kill switch.
    exclusive<T>(deviceHash: string, task: () => Promise<T>): Promise<T> {
      return queue.run(deviceHash, task)
    },
  }
}
