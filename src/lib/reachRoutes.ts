// 취약점 관리(Reach) 주소와 사이드바 하위 메뉴. 사이드바(AppLayout)와 Reach 페이지가 함께 쓴다

export const VULNERABILITIES_PATH = '/vulnerabilities'
export const VULNERABILITY_FINDINGS_PATH = '/vulnerabilities/findings'
export const VULNERABILITY_WORKLOADS_PATH = '/vulnerabilities/workloads'
export const VULNERABILITY_SCANS_PATH = '/vulnerabilities/scans'
export const VULNERABILITY_RULES_PATH = '/vulnerabilities/rules'

/** 사이드바 "취약점 관리" 아래에 펼치는 하위 메뉴 (Reach 화면 명세 COM-04) */
export const vulnerabilityPages = [
  { path: VULNERABILITIES_PATH, title: '요약' },
  { path: VULNERABILITY_FINDINGS_PATH, title: 'Finding 목록' },
  { path: VULNERABILITY_WORKLOADS_PATH, title: '워크로드' },
  { path: VULNERABILITY_SCANS_PATH, title: '스캔' },
  { path: VULNERABILITY_RULES_PATH, title: '규칙' },
]

export function isVulnerabilityPath(pathname: string): boolean {
  return pathname === VULNERABILITIES_PATH || pathname.startsWith(`${VULNERABILITIES_PATH}/`)
}
