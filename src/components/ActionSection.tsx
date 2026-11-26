import type { ReactNode } from 'react'
import './action-records.css'

/** All security areas use this order; each area retains its own verification rules. */
export function ActionSection({ step, children }: { step: 1 | 2 | 3 | 4; children: ReactNode }) {
  const title = { 1: '담당자', 2: '처리 상태', 3: '조치 내용', 4: '확인 결과' }[step]
  return <section className="action-section" aria-label={title}>
    <h3><span className="caption">{step}.</span> {title}</h3>
    <div className="action-section-content">{children}</div>
  </section>
}
