import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '@/components/Icon'
import { secretExportOptions, type SecretExportFormat } from '@/lib/secretExport'

interface Props {
  disabled: boolean
  pending: SecretExportFormat | null
  onSelect: (format: SecretExportFormat) => void
}

/** 키·노출 위치 화면의 내보내기 버튼. 형식을 고르면 바로 내려받는다. */
export function SecretExportMenu({ disabled, pending, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.secret-export-button')?.focus(); return }
    if (!open || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  const busyLabel = pending ? `${secretExportOptions.find((option) => option.format === pending)?.label ?? ''} 준비 중…` : '내보내기'
  return <div className="secret-export-menu" ref={root} onKeyDown={onKeyDown}>
    <button type="button" className="btn secret-export-button" disabled={disabled || pending !== null}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}>
      <Icon name="download" />{busyLabel}
    </button>
    {open && <div className="secret-export-list" role="menu" id={menuId} aria-label="내보내기 형식">
      {secretExportOptions.map((option) => <button key={option.format} type="button" role="menuitem" className="secret-export-item"
        onClick={() => { setOpen(false); onSelect(option.format) }}>
        <strong>{option.label}</strong><span>{option.description}</span>
      </button>)}
      <p className="secret-export-footnote">키 원문·지문·본문은 넣지 않아요. 열람 가능한 위치만 담겨요.</p>
    </div>}
  </div>
}
