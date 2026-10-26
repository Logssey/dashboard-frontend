// 취약점 관리(Reach) 주소와 사이드바 하위 메뉴. 사이드바(AppLayout)와 Reach 페이지가 함께 쓴다

export const VULNERABILITIES_PATH = '/vulnerabilities'
export const VULNERABILITY_FINDINGS_PATH = '/vulnerabilities/findings'

/** 사이드바 "취약점 관리" 아래에 펼치는 하위 메뉴 (Reach 화면 명세 COM-04 중 1단계 범위: 요약, Finding) */
export const vulnerabilityPages = [
  { path: VULNERABILITIES_PATH, title: '요약' },
  { path: VULNERABILITY_FINDINGS_PATH, title: 'Finding 목록' },
]

export function isVulnerabilityPath(pathname: string): boolean {
  return pathname === VULNERABILITIES_PATH || pathname.startsWith(`${VULNERABILITIES_PATH}/`)
}
