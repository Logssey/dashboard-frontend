import type { ReactNode } from 'react'

/** Shared assignment control; each domain retains its permission and save rules. */
export function ActionAssigneeField({ value, options, onChange, disabled, children }: {
  value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void;
  disabled?: boolean; children?: ReactNode
}) {
  return <div className="action-assignee-field">
    <label className="field">조치 담당자<select className="select" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
    {children}
  </div>
}
