import type { ReachL3Detail } from '@/api/reach'
import { formatKst, shortDigest } from '@/lib/reach'
import { l3Headline, l3PathsByProgress, l3PathText, l3RegionText, l3RequestSummary, l3Requests, shortFunction, shortPathStep } from '@/lib/reachL3'
import { labelOf, reachL3UncheckedLabel } from '@/lib/reachLabels'
import { ReachL3Badge } from './ReachBadges'

/** 구간 목록을 "어느 요청에서"로 풀어 쓴다. 많으면 앞의 몇 개와 개수만 */
function Requests({ during, run, limit = 4 }: { during: ReachL3Detail['during']; run: ReachL3Detail['run']; limit?: number }) {
  const lines = l3Requests(during, run)
  if (lines.length === 0) return <span className="caption">실행한 요청 없음</span>
  const shown = lines.slice(0, limit)
  return (
    <>
      <span className="caption">{l3RequestSummary(during, run)}</span>
      <ul className="reach-l3-requests">
        {shown.map((line) => (
          <li key={line.segment}>
            {line.request ? <code>{line.request}</code> : <span>{line.name}</span>}
            {line.request && <span className="caption"> {line.name}</span>}
            {line.count !== undefined && line.count > 1 && <span className="caption"> ×{line.count}</span>}
          </li>
        ))}
        {lines.length > shown.length && <li className="caption">외 {lines.length - shown.length}개</li>}
      </ul>
    </>
  )
}

/**
 * SCR-03 "실제 실제 실행 기록" 절. 이미지를 실제로 띄워 시나리오를 보냈을 때 취약 코드 쪽으로 어디까지 실행됐는지,
 * 어느 요청에서였는지를 근거로 보인다. 판정을 올렸는지는 판정 요약 띠가 보인다
 */
export function ReachL3Section({ l3 }: { l3: ReachL3Detail | null | undefined }) {
  if (!l3) {
    return (
      <section className="reach-section">
        <h3>실제 실행 (L3)</h3>
        <p className="caption">
          이 이미지를 띄워 시나리오를 보낸 결과가 없어요. 판정 데이터가 없는 취약점이거나, 서비스 저장소에 L3 시나리오가 없거나, 대시보드에서 [새 검사]으로 요청한 검사인 경우예요(앱은 PR 이미지가 빌드될 때만 띄워요).
        </p>
      </section>
    )
  }
  const functions = l3.functions ?? []
  const regions = l3.regions ?? []
  const paths = l3PathsByProgress(l3.paths)
  const run = l3.run
  const configKeys = run.configKeys ?? []

  return (
    <section className="reach-section">
      <h3>실제 실행 (L3)</h3>
      <div className={`reach-l3-summary ${l3.reached.toLowerCase().replace('_', '-')}`}>
        <ReachL3Badge l3={l3} />
        <p className="reach-l3-headline">{l3Headline(l3)}</p>
      </div>
      <p className="caption">이미지를 실제로 띄워 본 근거예요. 실행이 이 취약점의 조건을 보여 주는 만큼만 서버가 판정을 올려요.</p>

      {(l3.reached === 'REGION' || l3.reached === 'FUNCTION') && (
        <>
          <h4>어느 요청에서</h4>
          <Requests during={l3.during} run={run} />
        </>
      )}

      {(functions.length > 0 || regions.length > 0) && (
        <>
          <h4>어디까지 실행됐나</h4>
          <ul className="reach-l3-steps">
            {functions.map((item) => (
              <li key={item.function} className="ran">
                <span className="reach-l3-mark" aria-hidden="true">●</span>
                <div>
                  <code title={item.function}>{shortFunction(item.function)}</code> <span className="caption">취약 함수 · 실행됨</span>
                  <div className="caption">{l3RequestSummary(item.during, run)}</div>
                </div>
              </li>
            ))}
            {regions.map((region, index) => (
              <li key={`${region.class}#${region.method}#${index}`} className={region.executed ? 'ran' : region.unchecked ? 'unknown' : 'missed'}>
                <span className="reach-l3-mark" aria-hidden="true">{region.executed ? '●' : '○'}</span>
                <div>
                  <code title={`${region.class}#${region.method}`}>{shortFunction(`${region.class}#${region.method}`)}</code>{' '}
                  <span className="caption">
                    취약 구간 {l3RegionText(region)} ·{' '}
                    {region.executed
                      ? region.executedLines?.length
                        ? `실행됨 (${region.executedLines.join(', ')}줄)`
                        : '실행됨'
                      : region.unchecked
                        ? `확인 못 함 — ${labelOf(reachL3UncheckedLabel, region.unchecked)}`
                        : '실행 안 됨'}
                  </span>
                  {region.executed && <div className="caption">{l3RequestSummary(region.during, run)}</div>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {l3.note && <p className="caption">참고: {l3.note}</p>}

      {paths.length > 0 && (
        <>
          <h4>L2가 찾은 호출 경로를 실제로 탔나</h4>
          <p className="caption">진입점부터 끊기지 않고 실행된 단계까지만 세요. 중간 메서드가 다른 길로 실행된 것은 세지 않아요.</p>
          <ul className="reach-l3-paths">
            {paths.slice(0, 5).map((path) => (
              <li key={path.target}>
                <div>
                  → <code title={path.target}>{shortFunction(path.target)}</code> <span className="caption">{l3PathText(path)}</span>
                </div>
                {path.steps && (
                  <ol className="reach-l3-path-steps">
                    {path.steps.map((step, index) => (
                      <li key={`${step.method}#${index}`} className={step.executed ? 'ran' : step.executed === false ? 'missed' : 'unknown'}>
                        <span className="reach-l3-mark" aria-hidden="true">{step.executed ? '●' : '○'}</span>
                        <code title={step.method}>{shortPathStep(step.method)}</code>
                        {step.executed === null && <span className="caption"> 확인 못 함</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
            {paths.length > 5 && <li className="caption">외 {paths.length - 5}개 경로</li>}
          </ul>
        </>
      )}

      <h4>이 실행</h4>
      <dl className="reach-kv">
        <div className="reach-kv-row">
          <dt>관측</dt>
          <dd>
            {formatKst(run.observedAt)} · 검사 #{run.scanId} · 시나리오 {run.scenario}
            {run.rematch && (
              <div className="caption">
                앱을 다시 띄운 것이 아니에요. 위 시각에 남긴 실행 기록을 검사 #{run.scanId}에서 지금의 판정 데이터로 다시 대조한 결과예요.
              </div>
            )}
          </dd>
        </div>
        {run.build?.imageDigest && (
          <div className="reach-kv-row">
            <dt>이미지</dt>
            <dd>
              <code title={run.build.imageDigest}>{shortDigest(run.build.imageDigest)}</code>
            </dd>
          </div>
        )}
        <div className="reach-kv-row">
          <dt>보낸 요청</dt>
          <dd>시나리오 {run.invocations?.length ?? 0}단계</dd>
        </div>
        {configKeys.length > 0 && (
          <div className="reach-kv-row">
            <dt>설정</dt>
            <dd>
              {configKeys.map((key) => (
                <span key={key.name} className={`badge reach-config ${key.enabled ? 'on' : 'off'}`} title={key.enabled ? '켜짐' : '꺼짐'}>
                  {key.name}
                  {!key.enabled && ' (꺼짐)'}
                </span>
              ))}
              <div className="caption">이름과 켜짐 여부만 남겨요. 러너의 설정이 운영과 다르면 결과가 다를 수 있어요.</div>
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}
