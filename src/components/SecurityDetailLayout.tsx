import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

/** Full-page detail; return locations are restricted to the current security area. */
export function SecurityDetailLayout({ title, fallback, children }: { title: string; fallback: string; children: ReactNode }) {
  const location = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  const from: unknown = location.state?.from
  const area = `/${fallback.split('/')[1]}`
  const back = typeof from === 'string' && (from === '/actions' || from.startsWith('/actions?') || from === area || from.startsWith(`${area}/`) || from.startsWith(`${area}?`)) ? from : fallback
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [location.pathname])
  return <div className="security-detail-page">
    <Link className="security-back" to={back}>← 목록으로 돌아가기</Link>
    <div className="page-head"><h1 ref={heading} tabIndex={-1}>{title}</h1></div>
    {children}
  </div>
}
