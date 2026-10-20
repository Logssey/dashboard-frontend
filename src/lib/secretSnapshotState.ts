const invalidatedSnapshots = new Set<string>()

export function invalidateSecretSnapshot(snapshotId: unknown) {
  if (typeof snapshotId !== 'string' || !snapshotId) return
  invalidatedSnapshots.add(snapshotId)
  if (invalidatedSnapshots.size > 500) invalidatedSnapshots.delete(invalidatedSnapshots.values().next().value!)
}
export function isSecretSnapshotInvalidated(snapshotId: string) {
  return Boolean(snapshotId && invalidatedSnapshots.has(snapshotId))
}
