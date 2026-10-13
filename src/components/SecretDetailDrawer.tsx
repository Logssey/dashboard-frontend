import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSecretDetail } from '@/api/secrets'
import { componentStateLabel, credentialTypeLabel, issuerLabel, secretEnvironmentLabel, secretValidationLabel, secretValidationReasonLabel } from '@/lib/labels'
import { Badge } from './Badge'
import { Icon } from './Icon'

const koreaDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })

export function SecretDetailDrawer({ secretId, onClose }: { secretId: number | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const detail = useQuery({
    queryKey: ['secret-detail', secretId],
    queryFn: () => fetchSecretDetail(secretId!),
    enabled: secretId !== null,
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (secretId !== null && !dialog.open) dialog.showModal()
    if (secretId === null && dialog.open) dialog.close()
  }, [secretId])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
  }

  return <dialog ref={dialogRef} className="drawer" aria-labelledby="secret-detail-title" onClose={onClose} onClick={handleBackdropClick}>
    {secretId !== null && <>
      <div className="drawer-head"><h2 id="secret-detail-title">키 상세</h2>
        <button className="icon-btn" onClick={onClose} aria-label="상세 패널 닫기"><Icon name="close" /></button>
      </div>
      <div className="drawer-body">
        {detail.isPending ? <div className="skeleton" /> : detail.isError ? <p className="notice error">키 상세를 불러오지 못했어요.</p> : <>
          <div className="row"><Badge label="미평가" /><Badge label={componentStateLabel[detail.data.componentState]} /></div>
          <h3 className="detail-title">{detail.data.maskedLabel || '마스킹된 키'}</h3>
          <dl className="facts">
            <dt>발급자</dt><dd>{issuerLabel[detail.data.issuer]}</dd>
            <dt>키 종류</dt><dd>{credentialTypeLabel(detail.data.credentialType)}</dd>
            <dt>검증</dt><dd>{secretValidationLabel(detail.data.validationStatus)}</dd>
            {detail.data.validatedAt && <><dt>검증 기록 시각</dt><dd>{koreaDate.format(new Date(detail.data.validatedAt))}</dd></>}
            {detail.data.validationReasonCode && <><dt>검증 근거</dt><dd>{secretValidationReasonLabel(detail.data.validationReasonCode)}</dd></>}
            <dt>발견 위치</dt><dd>{detail.data.occurrenceCount}곳</dd>
          </dl>
          <section><h3>발견 위치</h3>
            {detail.data.occurrences.length ? <ul className="secret-occurrences">
              {detail.data.occurrences.map((occurrence) => <li key={occurrence.id}>
                <strong>{occurrence.sourceObjectRef}</strong>
                <span className="caption">{occurrence.locationKey || '위치 미확인'} · {secretEnvironmentLabel[occurrence.environment]}</span>
                <span className="caption">마지막 발견 {koreaDate.format(new Date(occurrence.lastSeenAt))}</span>
              </li>)}
            </ul> : <p className="muted">확인된 발견 위치가 없어요.</p>}
          </section>
          <p className="notice">형식 탐지 결과는 미평가예요. 유효성·권한·노출 범위 확인 뒤 심각도를 정해요.</p>
        </>}
      </div>
      <div className="drawer-foot"><button className="btn outline" onClick={onClose}>닫기</button></div>
    </>}
  </dialog>
}
