import { NavLink } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { infrastructurePaths, type SectionPage, sectionPages } from '@/lib/routes'

/** 메뉴만 있고 내용은 "준비 중"인 탭 (02 기능 설계 4) */
export function ComingSoonPage({ page }: { page: SectionPage }) {
  const isInfrastructure = infrastructurePaths.includes(page.path)
  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      {isInfrastructure && (
        <nav className="tabs" aria-label="인프라 보안 영역">
          {sectionPages
            .filter((item) => infrastructurePaths.includes(item.path))
            .map((item) => (
              <NavLink key={item.path} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`.trim()} to={item.path}>
                {item.title}
              </NavLink>
            ))}
        </nav>
      )}
      <section className="card">
        <EmptyState title="준비 중이에요" description="이 화면은 다음 단계에서 만들어요." />
      </section>
    </>
  )
}
