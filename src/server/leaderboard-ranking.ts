export interface LeaderboardRunScore {
  readonly runId: bigint
  readonly maxHeightMm: number
  readonly firstTickAtMaxHeight: number
  readonly completed: boolean
  readonly completionTick: number | null
}

function assertRankable(run: LeaderboardRunScore): void {
  if (!Number.isSafeInteger(run.maxHeightMm)) throw new Error('Invalid max height')
  if (!Number.isInteger(run.firstTickAtMaxHeight) || run.firstTickAtMaxHeight <= 0) throw new Error('Invalid first tick at max height')
  if (run.completed) {
    if (!Number.isInteger(run.completionTick) || (run.completionTick as number) <= 0) throw new Error('Completed run needs completion tick')
  } else if (run.completionTick !== null) {
    throw new Error('Incomplete run cannot have completion tick')
  }
}

/** Negative means a ranks ahead of b. Mirrors the SQL view ordering. */
export function compareLeaderboardRuns(a: LeaderboardRunScore, b: LeaderboardRunScore): number {
  assertRankable(a)
  assertRankable(b)
  if (a.completed !== b.completed) return a.completed ? -1 : 1
  if (a.completed) {
    const aTick = a.completionTick as number
    const bTick = b.completionTick as number
    if (aTick !== bTick) return aTick < bTick ? -1 : 1
  } else {
    if (a.maxHeightMm !== b.maxHeightMm) return a.maxHeightMm > b.maxHeightMm ? -1 : 1
    if (a.firstTickAtMaxHeight !== b.firstTickAtMaxHeight) return a.firstTickAtMaxHeight < b.firstTickAtMaxHeight ? -1 : 1
  }
  if (a.runId === b.runId) return 0
  return a.runId < b.runId ? -1 : 1
}
