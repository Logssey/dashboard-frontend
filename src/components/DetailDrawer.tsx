import { useEffect, useRef } from 'react'
import type { PriorityFinding } from '@/api/types'
import { COMING_SOON_MESSAGE, domainLabel, environmentLabel, severityLabel, severityTone } from '@/lib/labels'
import { Badge } from './Badge'
import { EmptyState } from './EmptyState'
import { assetText } from './FindingTable'
import { Icon } from './Icon'

/**
 * 탐지 상세 패널 (02 기능 설계 3.3)
 * - 영역·탐지 근거·권장 대응이 모두 비어 있으면 상세 대신 "정보 없음" 안내
 * - 일부만 비어 있으면 상세를 열고 빈 칸은 비워 둔다
 * - "검토 완료로 표시"는 누르면 "준비 중" 알림창만 띄운다 (3.4)
 */
export function DetailDrawer({ finding, onClose }: { finding: PriorityFinding | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (finding && !dialog.open) dialog.showModal()
    if (!finding && dialog.open) dialog.close()
  }, [finding])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    const outside =
      event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    if (outside) onClose()
  }

  const noDetail = finding !== null && !finding.domain && !finding.evidence && !finding.recommendation

  return (
    <dialog ref={dialogRef} className="drawer" aria-labelledby="detail-title" onClose={onClose} onClick={handleBackdropClick}>
      {finding && (
        <>
          <div className="drawer-head">
            <h2 id="detail-title">탐지 상세</h2>
            <button className="icon-btn" onClick={onClose} aria-label="상세 패널 닫기">
              <Icon name="close" />
            </button>
          </div>

          {noDetail ? (
            <div className="drawer-body">
              <EmptyState title="정보 없음" description="이 탐지의 영역·탐지 근거·권장 대응 정보가 아직 없어요." />
            </div>
          ) : (
            <div className="drawer-body">
              <div className="row">
                <span className="caption">{finding.displayId ?? ''}</span>
                <Badge label={severityLabel[finding.severity]} tone={severityTone[finding.severity]} />
                <Badge
                  label={finding.reviewStatus === 'REVIEWED' ? '검토 완료' : '미검토'}
                  tone={finding.reviewStatus === 'REVIEWED' ? 'success' : ''}
                />
              </div>
              <h3 className="detail-title">{finding.title}</h3>
              <dl className="facts">
                <dt>영향받는 자산</dt>
                <dd>{assetText(finding)}</dd>
                <dt>환경</dt>
                <dd>{environmentLabel[finding.environment]}</dd>
                <dt>담당 팀</dt>
                <dd>{finding.ownerTeam}</dd>
                <dt>보안 영역</dt>
                <dd>{finding.domain ? domainLabel[finding.domain] : ''}</dd>
              </dl>
              <section>
                <h3>
                  탐지 근거 <Badge label="예시" />
                </h3>
                <pre className="evidence">{finding.evidence ?? ''}</pre>
              </section>
              <section>
                <h3>권장 대응</h3>
                <p className="muted" style={{ marginTop: 10 }}>
                  {finding.recommendation ?? ''}
                </p>
              </section>
              <p className="notice">검토 여부는 위험 해소와 별개예요. 검토 상태 저장 기능은 준비 중이에요.</p>
            </div>
          )}

          <div className="drawer-foot">
            <button className="btn outline" onClick={onClose}>
              닫기
            </button>
            {!noDetail && (
              <button className="btn primary" onClick={() => window.alert(COMING_SOON_MESSAGE)}>
                <Icon name="check" />
                검토 완료로 표시
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  )
}
