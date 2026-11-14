/** A service label may not embed a source path, address or credential-like token. */
export function validScopeDisplayAlias(value: string | null): boolean {
  if (value === null) return true
  if (!/^[A-Za-z가-힣][A-Za-z0-9가-힣 _-]{0,79}$/.test(value)) return false
  return !/AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|(?:secret_|ntn_)[A-Za-z0-9]{20,}|[A-Za-z0-9_-]{24,}|[0-9]{10,}/.test(value)
}
