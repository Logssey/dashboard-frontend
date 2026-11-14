import { useEffect, useId, useRef, useState } from 'react'
import { safeSecretSearch, secretSearchErrorMessage, validSecretSearch } from '@/lib/secretReadSelection'
import './secret-filter-disclosure.css'

export interface SecretFilterField {
  key: string
  label: string
  options: Record<string, string>
  defaultValue: string
  inputType?: 'datetime-local'
}

interface FilterProps {
  label: string
  fields: SecretFilterField[]
  values: Record<string, string>
  search?: boolean
  searchPlaceholder?: string
  busy?: boolean
  searchRejected?: boolean
  onApply: (values: Record<string, string>) => void
  onReset: () => void
}

export function secretFilterSubmission(values: Record<string, string>, draft: Record<string, string>, intent: 'search' | 'filters', searchValue?: string) {
  const next = { ...(intent === 'filters' ? draft : values), ...(searchValue === undefined ? {} : { q: safeSecretSearch(searchValue) }) }
  if (next.q !== undefined) next.q = safeSecretSearch(next.q)
  return next
}

export function SecretFilterDisclosure({ label, fields, values, search = false, searchPlaceholder = '키·발견 위치·담당자 검색', busy = false, searchRejected = false, onApply, onReset }: FilterProps) {
  const panelId = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(values)
  const appliedSearch = validSecretSearch(values.q ?? '') ? values.q ?? '' : ''
  const [searchValue, setSearchValue] = useState(appliedSearch)
  const [searchError, setSearchError] = useState(searchRejected || !validSecretSearch(values.q ?? ''))
  const signature = JSON.stringify(values)
  useEffect(() => { setDraft(JSON.parse(signature)) }, [signature])
  useEffect(() => {
    setSearchValue(validSecretSearch(values.q ?? '') ? values.q ?? '' : '')
    if (!validSecretSearch(values.q ?? '')) setSearchError(true)
  }, [values.q])
  useEffect(() => { if (searchRejected) setSearchError(true) }, [searchRejected])
  const chips = fields.filter((field) => values[field.key] && values[field.key] !== field.defaultValue)
  const count = chips.length + (search && appliedSearch ? 1 : 0)
  const close = () => { setOpen(false); toggle.current?.focus() }
  const cancel = () => { setDraft(values); close() }
  const apply = (next: Record<string, string>) => {
    const safeQuery = validSecretSearch(next.q ?? '') ? next.q ?? '' : ''
    const safe = secretFilterSubmission(values, next, 'filters', search ? safeQuery : undefined)
    setDraft(safe)
    onApply(safe)
    close()
  }

  return <section className="secret-filter-disclosure" aria-label={label}>
    <form onSubmit={(event) => {
      event.preventDefault()
      if (search && !validSecretSearch(searchValue)) {
        setSearchValue('')
        setSearchError(true)
        searchInput.current?.focus()
        return
      }
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
      const intent = submitter?.value === 'filters' || !search ? 'filters' : 'search'
      const next = secretFilterSubmission(values, draft, intent, search ? searchValue : undefined)
      setSearchError(false)
      setDraft(next)
      onApply(next)
      setOpen(false)
      if (intent === 'filters') toggle.current?.focus()
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { event.preventDefault(); cancel() }
    }}>
      <div className="secret-filter-toolbar">
        {search && <div className="secret-filter-search">
          <label className="sr-only" htmlFor={`${panelId}-search`}>{label} 검색</label>
          <input ref={searchInput} id={`${panelId}-search`} className="input" type="search" value={searchValue} maxLength={100}
            aria-invalid={searchError} aria-describedby={searchError ? `${panelId}-search-error` : undefined}
            placeholder={searchPlaceholder} onChange={(event) => { setSearchValue(event.target.value); setSearchError(false) }} />
          <button className="btn outline" type="submit" name="filterAction" value="search" aria-busy={busy}>검색</button>
        </div>}
        <button ref={toggle} className="btn outline secret-filter-toggle" type="button" aria-expanded={open} aria-controls={panelId}
          onClick={() => open ? cancel() : setOpen(true)}>필터{count > 0 && <span>{count}</span>}</button>
        {count > 0 && <button className="btn outline" type="button" disabled={busy} onClick={() => { setSearchValue(''); setSearchError(false); onReset(); close() }}>초기화</button>}
      </div>
      {open && <div id={panelId} className="secret-filter-panel">
        <div className="secret-filter-fields">{fields.map((field) => <label key={field.key}>{field.label}
          {field.inputType ? <input className="input" type={field.inputType} value={draft[field.key] ?? ''}
            onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} /> : <select className="select" value={draft[field.key] ?? field.defaultValue} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}>
            {Object.entries(field.options).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>}
        </label>)}</div>
        <div className="secret-filter-panel-actions">
          <button className="btn outline" type="button" onClick={cancel}>취소</button>
          <button className="btn primary" type="submit" name="filterAction" value="filters" disabled={busy}>조건 적용</button>
        </div>
      </div>}
    </form>
    {search && searchError && <p id={`${panelId}-search-error`} className="notice error" role="alert">{secretSearchErrorMessage}</p>}
    {count > 0 && <div className="secret-filter-chips" aria-label="적용한 조회 조건">
      {search && appliedSearch && <button type="button" onClick={() => { setSearchValue(''); apply({ ...values, q: '' }) }} aria-label={`검색 ${appliedSearch} 해제`}>검색 {appliedSearch}<span aria-hidden="true">×</span></button>}
      {chips.map((field) => <button key={field.key} type="button" onClick={() => apply({ ...values, [field.key]: field.defaultValue })}
        aria-label={`${field.label} ${field.options[values[field.key]] ?? values[field.key]} 해제`}>
        {field.label} {field.options[values[field.key]] ?? values[field.key]}<span aria-hidden="true">×</span>
      </button>)}
    </div>}
  </section>
}
