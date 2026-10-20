import { Component, Suspense, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

class DetailBoundary extends Component<{ children: ReactNode; returnTo: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <section className="card secret-scan-message" role="alert"><h1>상세 화면을 표시하지 못했어요</h1><p>목록으로 돌아가 다시 열어 주세요. 오류를 검사 성공이나 결과 없음으로 처리하지 않아요.</p><Link className="btn outline" to={this.props.returnTo}>목록으로 돌아가기</Link></section>
  }
}

/** A broken detail must leave the authenticated application shell and a safe return path available. */
export function SecretPageBoundary({ children, returnTo }: { children: ReactNode; returnTo: string }) {
  const location = useLocation()
  return <DetailBoundary key={location.pathname} returnTo={returnTo}><Suspense fallback={<p className="card secret-scan-message" role="status">화면을 불러오는 중이에요.</p>}>{children}</Suspense></DetailBoundary>
}
