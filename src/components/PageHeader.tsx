import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <section className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="subtitle">{description}</p>
      </div>
      {actions && <div className="row">{actions}</div>}
    </section>
  )
}
