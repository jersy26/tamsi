// One tap at a time per card (agents.md rule 9). Each key has its own promise chain,
// so a tap only reads today's spend after the tap before it has been saved.
export class SerialQueue {
  private tails = new Map<string, Promise<unknown>>()

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const tail = this.tails.get(key) ?? Promise.resolve()
    const result = tail.then(task, task)
    const settled = result.catch(() => {})
    this.tails.set(key, settled)
    // Drop finished chains so unknown card hashes can't grow the map forever.
    void settled.then(() => {
      if (this.tails.get(key) === settled) this.tails.delete(key)
    })
    return result
  }
}
