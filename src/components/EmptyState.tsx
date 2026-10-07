import { Icon } from './Icon'

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <Icon name="search" />
      <h3>{title}</h3>
      <p className="caption">{description}</p>
    </div>
  )
}
