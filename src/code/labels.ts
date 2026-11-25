import type { CodeFinding, CodeSeverity } from './types'

export const SEVERITIES: CodeSeverity[] = ['HIGH', 'MEDIUM', 'LOW']

export const severityLabel: Record<CodeSeverity, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }
export const severityTone: Record<CodeSeverity, string> = { HIGH: 'high', MEDIUM: 'medium', LOW: '' }

const toolLabels: Record<string, string> = { semgrep: 'Semgrep', spotbugs: 'SpotBugs·FindSecBugs' }

export function toolLabel(tool: string): string {
  return toolLabels[tool] ?? tool
}

/** Logssey/service-backend → service-backend */
export function repoName(repository: string): string {
  return repository.slice(repository.indexOf('/') + 1)
}

/** Semgrep 규칙 ID 는 길어서 마지막 마디만 보여 준다 (전체는 title) */
export function ruleName(ruleId: string): string {
  const parts = ruleId.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ruleId
}

export function location(finding: Pick<CodeFinding, 'path' | 'line'>): string {
  return finding.line ? `${finding.path}:${finding.line}` : finding.path
}

/** 검사한 커밋의 그 줄 (GitHub) */
export function sourceUrl(finding: Pick<CodeFinding, 'repository' | 'commit' | 'path' | 'line'>): string {
  const path = finding.path.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${finding.repository}/blob/${finding.commit}/${path}${finding.line ? `#L${finding.line}` : ''}`
}

export function commitUrl(repository: string, commit: string): string {
  return `https://github.com/${repository}/commit/${commit}`
}
