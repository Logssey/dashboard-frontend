import { useEffect, useId, useRef, type ReactNode } from 'react'
import './secret-detail-panel.css'
export function SecretDetailPanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  useEffect(() => { const node = dialog.current; if (!node) return; if (open && !node.open) node.showModal(); else if (!open && node.open) node.close() }, [open])
  return <dialog ref={dialog} className="secret-detail-panel" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClose={onClose}>
    {open && <><header><h2 id={titleId}>{title}</h2><button className="btn outline" onClick={onClose} aria-label="위치 근거 닫기">닫기</button></header><div className="secret-detail-panel-body">{children}</div></>}
  </dialog>
}
