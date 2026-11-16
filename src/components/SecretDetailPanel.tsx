import { useEffect, useId, useRef, type ReactNode } from 'react'
import './secret-detail-panel.css'
export function SecretDetailPanel({ open, title, onClose, children, className = '', closeLabel = '위치 근거 닫기', closeDisabled = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string; closeLabel?: string; closeDisabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null), returnFocus = useRef<HTMLElement | null>(null), titleId = useId()
  useEffect(() => {
    const node = dialog.current; if (!node) return
    if (open && !node.open) { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; node.showModal(); heading.current?.focus() }
    else if (!open && node.open) { node.close(); if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true }) }
  }, [open])
  useEffect(() => {
    const node = dialog.current
    return () => {
      if (!node?.open) return
      node.close()
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
    }
  }, [])
  // A data refresh may close and reopen the node before its queued close event fires.
  // Only a native close of the currently open selection should clear that selection.
  return <dialog ref={dialog} className={`secret-detail-panel ${className}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!closeDisabled) onClose() }} onClose={() => { if (open && !dialog.current?.open) onClose() }}>
    {open && <><header><h2 ref={heading} tabIndex={-1} id={titleId}>{title}</h2><button className="btn outline" disabled={closeDisabled} onClick={onClose} aria-label={closeLabel}>닫기</button></header><div className="secret-detail-panel-body">{children}</div></>}
  </dialog>
}
