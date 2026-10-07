// 사이드바 메뉴와 탭 (02 기능 설계 화면 목록). 제목·설명은 템플릿 문구

export interface SectionPage {
  path: string
  title: string
  description: string
}

export const OVERVIEW_PATH = '/overview'
export const LOGIN_PATH = '/login'

export const sectionPages: SectionPage[] = [
  { path: '/secrets', title: '시크릿 보안', description: '노출 가능성이 있는 인증정보와 사용처를 확인하세요.' },
  { path: '/configuration', title: '보안 설정·컴플라이언스', description: '클라우드와 Kubernetes의 설정을 보안 기준에 따라 점검하세요.' },
  { path: '/identities', title: '신원·권한', description: '누가 무엇에 접근하는지 확인하고 필요한 권한을 검토하세요.' },
  { path: '/runtime', title: '런타임 보안', description: '실행 중인 워크로드의 이벤트와 조사 근거를 확인하세요.' },
  { path: '/vulnerabilities', title: '취약점 관리', description: '업데이트가 필요한 이미지와 패키지를 확인하세요.' },
]

/** 인프라 보안 메뉴 아래 하위 탭 3개 */
export const infrastructurePaths = ['/configuration', '/identities', '/runtime']

export function pageTitle(pathname: string): string {
  if (pathname === OVERVIEW_PATH) return '통합 현황'
  return sectionPages.find((page) => page.path === pathname)?.title ?? '통합 현황'
}
