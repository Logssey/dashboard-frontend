import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchRuntimeFinding,
  fetchRuntimeFindings,
  fetchRuntimeOverview,
  fetchRuntimeSensors,
  type RuntimeFindingFilter,
  updateRuntimeFinding,
} from '@/api/runtime'
import type {
  RuntimeActionStatus,
  RuntimeDisposition,
  RuntimeFinding,
  RuntimeReviewStatus,
} from '@/api/types'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Icon } from '@/components/Icon'
import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import {
  runtimeActionLabel,
  runtimeCollectionLabel,
  runtimeDispositionLabel,
  runtimeEvaluationLabel,
  runtimePriorityLabel,
  runtimePriorityTone,
  runtimeReviewLabel,
} from '@/lib/labels'

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function formatTime(value: string | null): string {
  return value ? timeFormat.format(new Date(value)) : '기록 없음'
}

function processLine(finding: RuntimeFinding): string {
  const parent = finding.process.parentExecutable ?? '부모 Process 미확인'
  const executable = finding.process.executable ?? '실행 파일 미확인'
  return `${parent} → ${executable}`
}

export function RuntimePage() {
  const [filter, setFilter] = useState<RuntimeFindingFilter>({
    clusterId: 'logssey-prod',
    namespace: 'ALL',
    reviewStatus: 'ALL',
    ruleKey: 'ALL',
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const overview = useQuery({
    queryKey: ['runtime', 'overview', filter.clusterId],
    queryFn: () => fetchRuntimeOverview(filter.clusterId),
    refetchInterval: 30_000,
  })
  const findings = useQuery({
    queryKey: ['runtime', 'findings', filter],
    queryFn: () => fetchRuntimeFindings(filter),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
  const sensors = useQuery({
    queryKey: ['runtime', 'sensors', filter.clusterId],
    queryFn: () => fetchRuntimeSensors(filter.clusterId),
    refetchInterval: 30_000,
  })
  const selected = useQuery({
    queryKey: ['runtime', 'finding', selectedId],
    queryFn: () => fetchRuntimeFinding(selectedId as number),
    enabled: selectedId !== null,
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['runtime'] })
  const summary = overview.data?.summary
  const collectionState = overview.data?.collectionState ?? sensors.data?.collectionState

  return (
    <>
      <PageHeader
        title="런타임 보안"
        description="실행 중인 워크로드의 Process 행위와 조사 근거를 확인하세요."
        actions={
          <button className="btn outline" onClick={refresh}>
            <Icon name="activity" />
            새로고침
          </button>
        }
      />

      <div className="runtime-mode-bar">
        <span className="status runtime-detect-only">탐지 전용</span>
        <span>현재 Finding은 자동으로 차단하지 않아요.</span>
        {collectionState && <Badge label={runtimeCollectionLabel[collectionState]} tone={collectionState === 'HEALTHY' ? 'success' : 'high'} />}
      </div>

      {collectionState === 'NOT_INSTALLED' && (
        <p className="notice runtime-sensor-notice" role="status">
          Worker에 Falco와 Tetragon이 아직 연결되지 않았어요. 센서를 설치하면 실제 Event가 이 화면에 표시됩니다.
        </p>
      )}

      <div className="stack">
        <section className="runtime-metric-grid">
          <MetricCard label="미확인 Finding" value={summary?.unreviewedFindingCount ?? '—'} unit="건" description="담당자가 아직 확인하지 않음" />
          <MetricCard label="영향 Workload" value={summary?.affectedWorkloadCount ?? '—'} unit="개" description="최근 24시간 기준" />
          <MetricCard label="Runtime Event" value={summary?.runtimeEventCount ?? '—'} unit="건" description="최근 24시간 정규화 Event" />
          <MetricCard label="자산 연결 실패" value={summary?.unresolvedAssetEventCount ?? '—'} unit="건" description="Pod Context 재연결 필요" />
        </section>

        <section className="card list-card">
          <div className="card-head">
            <div>
              <h2>탐지 결과</h2>
              <p className="section-intro">반복 Event는 5분 단위 Finding으로 묶어 보여줘요.</p>
            </div>
            <span className="caption">최근 발생순</span>
          </div>
          <div className="toolbar runtime-toolbar">
            <div className="row">
              <select className="select" aria-label="Cluster" value={filter.clusterId} onChange={(event) => setFilter({ ...filter, clusterId: event.target.value })}>
                <option value="logssey-prod">logssey-prod</option>
              </select>
              <select className="select" aria-label="Namespace" value={filter.namespace} onChange={(event) => setFilter({ ...filter, namespace: event.target.value })}>
                <option value="ALL">모든 Namespace</option>
                <option value="reused">reused</option>
                <option value="attack-lab">attack-lab</option>
              </select>
              <select className="select" aria-label="검토 상태" value={filter.reviewStatus} onChange={(event) => setFilter({ ...filter, reviewStatus: event.target.value as RuntimeFindingFilter['reviewStatus'] })}>
                <option value="ALL">모든 검토 상태</option>
                <option value="UNREVIEWED">미확인</option>
                <option value="REVIEWED">확인함</option>
              </select>
              <select className="select" aria-label="규칙" value={filter.ruleKey} onChange={(event) => setFilter({ ...filter, ruleKey: event.target.value })}>
                <option value="ALL">모든 규칙</option>
                <option value="RUN-001">RUN-001 · 컨테이너 셸 실행</option>
              </select>
            </div>
          </div>

          {findings.isPending ? (
            <div className="runtime-loading"><div className="skeleton" /><div className="skeleton" /></div>
          ) : findings.isError ? (
            <div className="runtime-loading"><p className="notice error">런타임 탐지 결과를 불러오지 못했어요.</p></div>
          ) : findings.data.items.length ? (
            <FindingTable items={findings.data.items} onSelect={setSelectedId} />
          ) : (
            <EmptyState
              title={collectionState === 'NOT_INSTALLED' ? '연결된 런타임 센서가 없어요' : '조건에 맞는 Finding이 없어요'}
              description={collectionState === 'NOT_INSTALLED' ? 'Sensor 상태에서 설치 대상을 확인하세요.' : '필터를 바꾸거나 수집 상태를 확인해 보세요.'}
            />
          )}
          <div className="table-foot" role="status">
            {findings.data?.totalCount ?? 0}개 Finding · 마지막 갱신 {formatTime(overview.data?.generatedAt ?? null)}
          </div>
        </section>

        <SensorSection sensors={sensors.data} loading={sensors.isPending} />
      </div>

      {selectedId !== null && (
        <FindingDrawer
          key={selectedId}
          finding={selected.data ?? null}
          loading={selected.isPending}
          onClose={() => setSelectedId(null)}
          onUpdated={(finding) => {
            queryClient.setQueryData(['runtime', 'finding', finding.findingId], finding)
            void queryClient.invalidateQueries({ queryKey: ['runtime', 'findings'] })
            void queryClient.invalidateQueries({ queryKey: ['runtime', 'overview'] })
          }}
        />
      )}
    </>
  )
}

function FindingTable({ items, onSelect }: { items: RuntimeFinding[]; onSelect: (id: number) => void }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="런타임 Finding 목록">
      <table>
        <thead>
          <tr>
            <th scope="col">Finding</th>
            <th scope="col">발생 위치</th>
            <th scope="col">Process</th>
            <th scope="col">센서 등급</th>
            <th scope="col">판정</th>
            <th scope="col">최근 발생</th>
          </tr>
        </thead>
        <tbody>
          {items.map((finding) => (
            <tr key={finding.findingId}>
              <td>
                <button className="finding-link" onClick={() => onSelect(finding.findingId)}>
                  {finding.rule.title}
                </button>
                <span className="asset">{finding.displayId} · {finding.rule.key} · {finding.occurrenceCount}회</span>
              </td>
              <td>
                {finding.asset?.workloadName ?? finding.asset?.podName ?? '자산 연결 대기'}
                <span className="asset">{finding.asset ? `${finding.asset.namespace} / ${finding.asset.containerName ?? 'Container 미확인'}` : 'Context 재연결 중'}</span>
              </td>
              <td>
                {finding.process.executable ?? '미확인'}
                <span className="asset">부모 {finding.process.parentExecutable ?? '미확인'} · UID {finding.process.userId ?? '미확인'}</span>
              </td>
              <td><Badge label={runtimePriorityLabel[finding.sourcePriority]} tone={runtimePriorityTone[finding.sourcePriority]} /></td>
              <td>
                <Badge label={runtimeReviewLabel[finding.reviewStatus]} tone={finding.reviewStatus === 'UNREVIEWED' ? 'primary' : 'success'} />
                <span className="asset">{runtimeDispositionLabel[finding.disposition]}</span>
              </td>
              <td>{formatTime(finding.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SensorSection({ sensors, loading }: { sensors: Awaited<ReturnType<typeof fetchRuntimeSensors>> | undefined; loading: boolean }) {
  return (
    <section className="card list-card">
      <div className="card-head">
        <div><h2>Sensor 상태</h2><p className="section-intro">Worker별 Falco·Tetragon 연결 상태입니다.</p></div>
        {sensors && <Badge label={runtimeCollectionLabel[sensors.collectionState]} tone={sensors.collectionState === 'HEALTHY' ? 'success' : 'high'} />}
      </div>
      {loading ? (
        <div className="runtime-loading"><div className="skeleton" /></div>
      ) : sensors?.items.length ? (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Node</th><th>Sensor</th><th>상태</th><th>Version</th><th>마지막 Heartbeat</th><th>마지막 Event</th></tr></thead>
            <tbody>
              {sensors.items.map((sensor) => (
                <tr key={sensor.sensorId}>
                  <td>{sensor.nodeName}</td><td>{sensor.type}</td><td><span className={`status ${sensor.status === 'HEALTHY' ? 'done' : ''}`}>{sensor.status}</span></td>
                  <td>{sensor.version ?? '미확인'}</td><td>{formatTime(sensor.lastHeartbeatAt)}</td><td>{formatTime(sensor.lastEventAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="등록된 Sensor가 없어요" description="Worker 3대의 Falco 설치부터 시작합니다." />
      )}
    </section>
  )
}

function FindingDrawer({ finding, loading, onClose, onUpdated }: {
  finding: RuntimeFinding | null
  loading: boolean
  onClose: () => void
  onUpdated: (finding: RuntimeFinding) => void
}) {
  const [reviewStatus, setReviewStatus] = useState<RuntimeReviewStatus>(finding?.reviewStatus ?? 'UNREVIEWED')
  const [actionStatus, setActionStatus] = useState<RuntimeActionStatus>(finding?.actionStatus ?? 'OPEN')
  const [disposition, setDisposition] = useState<RuntimeDisposition>(finding?.disposition ?? 'UNDECIDED')
  const [note, setNote] = useState(finding?.note ?? '')

  useEffect(() => {
    if (!finding) return
    setReviewStatus(finding.reviewStatus)
    setActionStatus(finding.actionStatus)
    setDisposition(finding.disposition)
    setNote(finding.note ?? '')
  }, [finding])

  const mutation = useMutation({
    mutationFn: () => updateRuntimeFinding(finding!.findingId, {
      version: finding!.version,
      reviewStatus,
      actionStatus,
      disposition,
      assigneeUserId: finding!.assigneeUserId,
      note,
    }),
    onSuccess: onUpdated,
  })

  return (
    <dialog className="drawer runtime-drawer" open aria-label="런타임 Finding 상세">
      <div className="drawer-head">
        <div><span className="caption">{finding?.displayId ?? 'Finding 불러오는 중'}</span><h2>{finding?.rule.title ?? '런타임 Finding'}</h2></div>
        <button className="icon-btn" aria-label="상세 닫기" onClick={onClose}><Icon name="close" /></button>
      </div>
      {loading || !finding ? (
        <div className="drawer-body"><div className="skeleton" /><div className="skeleton" /></div>
      ) : (
        <>
          <div className="drawer-body runtime-drawer-body">
            <div className="runtime-detail-lead">
              <div className="row">
                <Badge label={runtimePriorityLabel[finding.sourcePriority]} tone={runtimePriorityTone[finding.sourcePriority]} />
                <Badge label={runtimeEvaluationLabel[finding.evaluationStatus]} />
                {finding.sensors.map((sensor) => <Badge key={sensor} label={sensor} tone="primary" />)}
              </div>
              <p className="runtime-process-line">{processLine(finding)}</p>
              <p className="caption">UID {finding.process.userId ?? '미확인'} · {finding.occurrenceCount}회 · 마지막 {formatTime(finding.lastSeenAt)}</p>
            </div>

            <section><h3>발생 위치</h3><dl className="facts runtime-facts">
              <dt>Cluster</dt><dd>{finding.asset?.clusterId ?? '연결 대기'}</dd>
              <dt>Workload</dt><dd>{finding.asset ? `${finding.asset.namespace} / ${finding.asset.workloadName ?? finding.asset.podName}` : '연결 대기'}</dd>
              <dt>Pod</dt><dd>{finding.asset?.podName ?? '연결 대기'}</dd>
              <dt>Container</dt><dd>{finding.asset?.containerName ?? '연결 대기'}</dd>
              <dt>Image</dt><dd>{finding.asset?.image ?? '미확인'}<span className="asset">{finding.asset?.imageDigest ?? 'Digest 미확인'}</span></dd>
              <dt>Node</dt><dd>{finding.asset?.nodeName ?? '미확인'}</dd>
              <dt>ServiceAccount</dt><dd>{finding.asset?.serviceAccountName ?? '미확인'}</dd>
            </dl></section>

            <section className="runtime-investigation"><h3>조사 정보</h3>
              <label className="field">검토 상태<select className="select" value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as RuntimeReviewStatus)}><option value="UNREVIEWED">미확인</option><option value="REVIEWED">확인함</option></select></label>
              <label className="field">조치 상태<select className="select" value={actionStatus} onChange={(event) => setActionStatus(event.target.value as RuntimeActionStatus)}>{Object.entries(runtimeActionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field">판정<select className="select" value={disposition} onChange={(event) => setDisposition(event.target.value as RuntimeDisposition)}>{Object.entries(runtimeDispositionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field">메모<textarea className="input runtime-note" maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="확인한 근거와 다음 조치를 기록하세요." /></label>
              {mutation.isError && <p className="notice error">변경 내용을 저장하지 못했어요. 최신 내용을 다시 열어 주세요.</p>}
            </section>
          </div>
          <div className="drawer-foot"><button className="btn outline" onClick={onClose}>닫기</button><button className="btn primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? '저장 중…' : '조사 내용 저장'}</button></div>
        </>
      )}
    </dialog>
  )
}
