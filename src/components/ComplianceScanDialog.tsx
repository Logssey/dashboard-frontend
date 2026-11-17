import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { ComplianceScanScope, ComplianceScopeCatalog } from '@/api/compliance'
import { Icon } from '@/components/Icon'

type ScopeMode = 'all' | 'service' | 'check'

interface Props {
  open: boolean
  catalog?: ComplianceScopeCatalog
  busy: boolean
  error: string | null
  defaultRegions?: string[]
  onClose: () => void
  onSubmit: (environment: 'prod' | 'dev', scope: ComplianceScanScope) => void
}

const suggestedRegions = ['ap-northeast-2', 'us-east-1', 'us-west-2', 'ap-northeast-1']

export function ComplianceScanDialog({ open, catalog, busy, error, defaultRegions, onClose, onSubmit }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [environment, setEnvironment] = useState<'prod' | 'dev'>('prod')
  const [mode, setMode] = useState<ScopeMode>('all')
  const [regions, setRegions] = useState<string[]>(['ap-northeast-2'])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const node = dialog.current
    if (open && node && !node.open) node.showModal()
    if (!open && node?.open) node.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    setEnvironment('prod')
    setMode('all')
    setRegions(defaultRegions?.length ? defaultRegions : ['ap-northeast-2'])
    setSelected([])
    setSearch('')
  }, [defaultRegions, open])

  const options = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (mode === 'service') return (catalog?.services ?? []).filter((item) => item.includes(query)).slice(0, 40)
    if (mode === 'check') return (catalog?.checks ?? []).filter((item) =>
      item.id.includes(query) || item.service.includes(query)).slice(0, 40)
    return []
  }, [catalog, mode, search])

  const chooseMode = (next: ScopeMode) => {
    setMode(next)
    setSelected([])
    setSearch('')
  }

  const toggle = (value: string) => setSelected((current) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (mode !== 'all' && selected.length === 0) return
    onSubmit(environment, {
      regions,
      services: mode === 'service' ? selected : [],
      checks: mode === 'check' ? selected : [],
    })
  }

  return (
    <dialog ref={dialog} className="compliance-scan-dialog" aria-labelledby="compliance-scan-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
      onClose={() => { if (open && !busy) onClose() }}>
      <form onSubmit={submit} className="compliance-scan-form">
        <header className="compliance-scan-head">
          <div><span>PROWLER {catalog?.prowlerVersion ?? '5.46.0'}</span><h2 id="compliance-scan-title">AWS 컴플라이언스 점검</h2></div>
          <button type="button" className="icon-btn" aria-label="점검 설정 닫기" disabled={busy} onClick={onClose}><Icon name="close" /></button>
        </header>

        <div className="compliance-scan-body">
          <section className="compliance-form-section">
            <div className="compliance-form-title"><b>1</b><div><h3>점검 환경</h3><p>결과를 구분할 환경을 선택해 주세요.</p></div></div>
            <div className="compliance-segmented" role="radiogroup" aria-label="점검 환경">
              <button type="button" role="radio" aria-checked={environment === 'prod'} className={environment === 'prod' ? 'active' : ''} onClick={() => setEnvironment('prod')}>운영</button>
              <button type="button" role="radio" aria-checked={environment === 'dev'} className={environment === 'dev' ? 'active' : ''} onClick={() => setEnvironment('dev')}>개발</button>
            </div>
          </section>

          <section className="compliance-form-section">
            <div className="compliance-form-title"><b>2</b><div><h3>점검 범위</h3><p>전체 또는 필요한 범위만 실행할 수 있어요.</p></div></div>
            <div className="compliance-scope-options" role="radiogroup" aria-label="점검 범위">
              {([
                ['all', '전체 점검', 'AWS 전체 Check를 실행해요.'],
                ['service', '서비스 선택', 'S3, IAM처럼 서비스 단위로 실행해요.'],
                ['check', 'Check 선택', '개별 Check만 정확히 실행해요.'],
              ] as const).map(([value, title, description]) => <button type="button" role="radio" aria-checked={mode === value} key={value}
                className={mode === value ? 'active' : ''} onClick={() => chooseMode(value)}>
                <span className="compliance-radio" /><strong>{title}</strong><small>{description}</small>
              </button>)}
            </div>

            {mode !== 'all' && <div className="compliance-picker">
              <label><span>{mode === 'service' ? '서비스 찾기' : 'Check 찾기'}</span>
                <input className="input" value={search} autoFocus placeholder={mode === 'service' ? '예: s3, iam, eks' : 'Check ID 또는 서비스 검색'}
                  onChange={(event) => setSearch(event.target.value)} />
              </label>
              <div className="compliance-picker-list">
                {options.map((option) => {
                  const value = typeof option === 'string' ? option : option.id
                  return <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} />
                    <span><strong>{value}</strong>{typeof option !== 'string' && <small>{option.service}</small>}</span></label>
                })}
                {!options.length && <p>검색 결과가 없어요.</p>}
              </div>
              <p className="compliance-selection-count">{selected.length.toLocaleString()}개 선택</p>
            </div>}
          </section>

          <section className="compliance-form-section">
            <div className="compliance-form-title"><b>3</b><div><h3>AWS 리전</h3><p>선택한 리전과 Prowler의 글로벌 리소스 처리 기준으로 실행해요.</p></div></div>
            <div className="compliance-region-list">
              {suggestedRegions.map((region) => <label key={region}><input type="checkbox" checked={regions.includes(region)}
                onChange={(event) => setRegions((current) => event.target.checked ? [...current, region] : current.filter((item) => item !== region))} />{region}</label>)}
            </div>
          </section>

          {error && <p className="notice error" role="alert">{error}</p>}
        </div>

        <footer className="compliance-scan-foot">
          <p>AWS 읽기 전용 권한을 사용하는 독립 Worker에서 실행돼요.</p>
          <div><button type="button" className="btn outline" disabled={busy} onClick={onClose}>취소</button>
            <button className="btn primary" disabled={busy || (mode !== 'all' && selected.length === 0)}>{busy ? '요청 중…' : '점검 시작'}</button></div>
        </footer>
      </form>
    </dialog>
  )
}
