import { useEffect, useId, useRef, type ReactNode } from 'react'
import './secret-detail-panel.css'
export function SecretDetailPanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId()
  useEffect(() => { const node = dialog.current; if (!node) return; if (open && !node.open) node.showModal(); else if (!open && node.open) node.close() }, [open])
  // A data refresh may close and reopen the node before its queued close event fires.
  // Only a native close of the currently open selection should clear that selection.
  return <dialog ref={dialog} className="secret-detail-panel" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClose={() => { if (open && !dialog.current?.open) onClose() }}>
    {open && <><header><h2 id={titleId}>{title}</h2><button className="btn outline" onClick={onClose} aria-label="위치 근거 닫기">닫기</button></header><div className="secret-detail-panel-body">{children}</div></>}
  </dialog>
}
