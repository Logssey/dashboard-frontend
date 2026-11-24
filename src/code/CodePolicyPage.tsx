import { Badge } from '@/components/Badge'
import { PageHeader } from '@/components/PageHeader'
import { severityLabel, severityTone } from './labels'
import './code.css'

/** 코드 취약점 › 검사 기준·정책 */
export function CodePolicyPage() {
  return (
    <>
      <PageHeader title="검사 기준 · 정책" description="코드 취약점을 어떤 도구와 규칙으로, 어떤 기준으로 검사하는지 정리했어요." />
      <div className="stack">
        <PolicySection />
      </div>
    </>
  )
}

/** 검사 기준·정책 (security-solution-docs code-security/policy.md 요약). 도구·버전을 바꾸면 여기도 함께 바꾼다 */
const POLICY_TOOLS = [
  { repo: 'service-backend', tool: 'Semgrep 1.185.0', rules: 'p/default · p/java · p/typescript · p/owasp-top-ten', target: 'Java API, 채팅 서버(TS), 워크플로' },
  { repo: 'service-backend', tool: 'SpotBugs 6.5.13 + FindSecBugs 1.14.0', rules: 'SECURITY 분류만', target: 'Java API 바이트코드' },
  { repo: 'service-frontend', tool: 'Semgrep 1.185.0', rules: 'p/default · p/typescript · p/react · p/owasp-top-ten', target: 'React·TS, 워크플로' },
]
const POLICY_LEVELS = [
  { level: 'error', severity: 'HIGH' as const, meaning: '악용 경로가 뚜렷한 패턴 (예: 워크플로 쉘 인젝션)' },
  { level: 'warning', severity: 'MEDIUM' as const, meaning: '입력 검증 여부를 사람이 봐야 하는 패턴 (예: 문자열로 만든 SQL)' },
  { level: 'note · 그 밖', severity: 'LOW' as const, meaning: '참고' },
]
const POLICY_DOC = 'https://github.com/Logssey/security-solution-docs/blob/develop/code-security/policy.md'

function PolicySection() {
  return (
    <section className="card list-card" aria-labelledby="code-policy-title">
      <div className="card-head">
        <h2 id="code-policy-title">도구 · 심각도 · 운영 방식</h2>
        <a className="finding-link caption" href={POLICY_DOC} target="_blank" rel="noreferrer">정책 문서 전체 보기</a>
      </div>
      <div className="code-card-body code-policy">
        <h3 className="code-h3">도구와 규칙</h3>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="검사 도구와 규칙 표">
          <table>
            <thead>
              <tr><th scope="col">레포</th><th scope="col">도구</th><th scope="col">규칙 묶음</th><th scope="col">검사 대상</th></tr>
            </thead>
            <tbody>
              {POLICY_TOOLS.map((row) => (
                <tr key={`${row.repo}:${row.tool}`}>
                  <td>{row.repo}</td><td>{row.tool}</td><td className="code-mono">{row.rules}</td><td>{row.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="code-h3">심각도 기준</h3>
        <p className="caption">각 도구가 낸 등급(SARIF level)을 그대로 써요. 두 도구 모두 Critical 등급을 내지 않아 High · Medium · Low 3단계예요.</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="심각도 기준 표">
          <table>
            <thead>
              <tr><th scope="col">도구 등급</th><th scope="col">화면</th><th scope="col">뜻</th></tr>
            </thead>
            <tbody>
              {POLICY_LEVELS.map((row) => (
                <tr key={row.level}>
                  <td className="code-mono">{row.level}</td>
                  <td><Badge label={severityLabel[row.severity]} tone={severityTone[row.severity]} /></td>
                  <td>{row.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="code-h3">운영 방식</h3>
        <ul className="code-policy-list">
          <li><strong>언제</strong>: PR(develop · main 대상)과 develop · main 반영 때마다 검사해 실행 요약에 남겨요. 이 화면에는 develop 결과를 올려요.</li>
          <li><strong>리포트 전용</strong>: 발견이 있어도 검사는 실패하지 않고 머지를 막지 않아요. 오탐을 정리한 뒤 ‘새로 생긴 High만 차단’으로 넘어가요.</li>
          <li><strong>오탐 · 예외</strong>: 코드에 <span className="code-mono">nosemgrep</span> · <span className="code-mono">@SuppressFBWarnings</span>와 이유를 적고 PR로 남겨요. 이 화면에는 예외 관리가 없어요.</li>
          <li><strong>범위 밖</strong>: 라이브러리 취약점은 ‘취약점 관리’, 코드 속 시크릿 대응은 ‘시크릿’이 맡아요. 코드 조각은 저장하지 않고 GitHub 링크로 봐요.</li>
        </ul>
      </div>
    </section>
  )
}
