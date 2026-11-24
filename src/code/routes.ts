// 코드 취약점 주소와 사이드바 하위 메뉴. 사이드바(AppLayout)와 코드 취약점 페이지가 함께 쓴다

export const CODE_PATH = '/code'
export const CODE_POLICY_PATH = '/code/policy'

export const codePages = [
  { path: CODE_PATH, title: '발견 현황' },
  { path: CODE_POLICY_PATH, title: '검사 기준·정책' },
]

export function isCodePath(pathname: string): boolean {
  return pathname === CODE_PATH || pathname.startsWith(`${CODE_PATH}/`)
}
