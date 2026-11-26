// 사이드바 메뉴와 탭 (02 기능 설계 화면 목록). 제목·설명은 템플릿 문구

export interface SectionPage {
  path: string
  title: string
  description: string
}

export const OVERVIEW_PATH = '/overview'
export const LOGIN_PATH = '/login'

export const sectionPages: SectionPage[] = [
  { path: '/secrets', title: '시크릿 현황', description: '발견한 시크릿과 대응 현황을 확인하세요.' },
  { path: '/secrets/findings', title: '발견된 키', description: '발견한 키 후보와 검증 상태를 확인하세요.' },
  { path: '/secrets/triage', title: '확인 대기열', description: '근거 확인·추가 조사·대응 연결 작업을 확인하세요.' },
  { path: '/secrets/cases', title: '대응 관리', description: '시크릿 대응 건과 담당자 변경 이력을 확인하세요.' },
  { path: '/secrets/connections', title: '연결 및 설정', description: '승인된 수집 연결과 연결 상태를 확인하세요.' },
  { path: '/secrets/history', title: '검사 이력', description: '검사 실행과 부분 실패 범위를 확인하세요.' },
  { path: '/secrets/key-patterns', title: '키 형식 등록', description: '사내 키 모양을 등록해 검사에 더하세요.' },
  { path: '/configuration', title: '컴플라이언스', description: '클라우드와 Kubernetes의 설정을 세 가지 규제 기준으로 함께 점검하세요.' },
  { path: '/identities', title: '신원·권한', description: '누가 무엇에 접근하는지 확인하고 필요한 권한을 검토하세요.' },
  { path: '/runtime', title: '런타임 보안', description: '실행 중인 워크로드의 이벤트와 조사 근거를 확인하세요.' },
  { path: '/iac', title: 'IaC 보안', description: '인프라 코드 변경이 만드는 공격 경로, 상태 파일과 설정 변경을 확인하세요.' },
  { path: '/vulnerabilities', title: '이미지 보안', description: '취약 함수 호출 가능 여부와 실행 기록을 확인하세요.' },
  { path: '/vulnerabilities/findings', title: '취약점 목록', description: '판정 상태와 근거로 취약점을 걸러 보세요.' },
  { path: '/vulnerabilities/workloads', title: '실행 중 워크로드', description: '실행 중인 이미지가 검사한 이미지와 같은지 확인하세요.' },
  { path: '/vulnerabilities/scans', title: '이미지 검사', description: '검사를 요청하고 진행 상태와 이력을 확인하세요.' },
  { path: '/vulnerabilities/rules', title: '검사 기준', description: '판정에 쓰는 규칙·사실·취약 함수 데이터를 확인하세요.' },
  { path: '/code', title: '코드 보안', description: '서비스 코드 정적 분석 결과를 확인하세요.' },
  { path: '/code/policy', title: '검사 기준·정책', description: '코드 보안 검사 도구와 기준을 확인하세요.' },
  { path: '/reports', title: '리포트', description: '파트별 보안 결과를 같은 기준으로 묶은 스냅샷을 만들고 확인하세요.' },
]

/** 인프라 보안 메뉴 아래 하위 탭 3개 */
export const infrastructurePaths = ['/configuration', '/identities', '/runtime', '/iac']

export function pageTitle(pathname: string): string {
  if (pathname.startsWith('/iac/prs/')) return 'PR 검사 상세'
  if (pathname.startsWith('/iac/paths/')) return '공격 경로 상세'
  if (pathname.startsWith('/vulnerabilities/findings/')) return '이미지 취약점 상세'
  const iacTitle = ({ '/iac/prs': 'PR 검사', '/iac/paths': '현재 공격 경로', '/iac/changes': '변경 감시', '/iac/checks': '검사 이력' } as Record<string, string>)[pathname]
  if (iacTitle) return iacTitle
  if (pathname === OVERVIEW_PATH) return '통합 현황'
  if (pathname === '/secrets/triage') return '확인 대기열'
  if (pathname.startsWith('/secrets/triage/investigations')) return '추가 조사'
  if (pathname.startsWith('/secrets/triage/alerts')) return '실키 경고'
  if (pathname.endsWith('/fixture-attestations')) return '테스트용 키 근거'
  if (pathname.startsWith('/secrets/triage/')) return '위치 확인'
  if (pathname.startsWith('/secrets/history/')) return '검사 상세'
  if (pathname.startsWith('/secrets/cases/')) return '대응 상세'
  if (pathname.startsWith('/secrets/connections/')) return '연결 범위'
  if (/^\/secrets\/\d+$/.test(pathname)) return '키 상세'
  if (/^\/reports\/\d+$/.test(pathname)) return '리포트 보기'
  return sectionPages.find((page) => page.path === pathname)?.title ?? '통합 현황'
}
