import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import {
  createCustomKeyPattern,
  deleteCustomKeyPattern,
  fetchCustomKeyPatterns,
  fetchFoundCustomKeys,
  previewCustomKeyPattern,
  runCredentialScan,
  type CustomKeyPatternInput,
  type CustomKeyPatternPreview,
  type KeyCharset,
} from '@/api/customKeyPatterns'
import { PageHeader } from '@/components/PageHeader'
import './secret-key-patterns.css'

const QUERY_KEY = ['custom-key-patterns']
const FOUND_QUERY_KEY = ['custom-key-found']
const EMPTY: CustomKeyPatternInput = { name: '', prefix: '', charset: 'HEX_LOWER', length: 32, secret: true, sample: '' }

/** 폼 입력 → 서버가 규칙(정규식) 자동 생성 → DB 저장 → 다음 검사부터 내장 규칙과 함께 검사 */
export function SecretKeyPatternsPage() {
  const client = useQueryClient()
  const list = useQuery({ queryKey: QUERY_KEY, queryFn: fetchCustomKeyPatterns, retry: false, refetchOnWindowFocus: false })
  const [form, setForm] = useState<CustomKeyPatternInput>(EMPTY)
  const [preview, setPreview] = useState<CustomKeyPatternPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 입력이 멈추고 0.3초 뒤에 서버에서 규칙을 미리 만들어 본다 (저장 안 함)
  useEffect(() => {
    if (!form.prefix) { setPreview(null); setPreviewError(null); return }
    const timer = window.setTimeout(() => {
      previewCustomKeyPattern({ ...form, name: form.name || '미리보기' })
        .then((result) => { setPreview(result); setPreviewError(null) })
        .catch((error: unknown) => { setPreview(null); setPreviewError(error instanceof ApiError ? error.message : '규칙을 만들지 못했어요.') })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [form])

  const create = useMutation({
    mutationFn: createCustomKeyPattern,
    onSuccess: (created) => {
      setNotice(`'${created.name}' 형식을 등록했어요. 다음 검사부터 ${created.rule} 모양의 키를 찾아요.`)
      setForm(EMPTY)
      void client.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
  const remove = useMutation({
    mutationFn: deleteCustomKeyPattern,
    onError: (error: unknown) => setNotice(error instanceof ApiError ? error.message : '삭제하지 못했어요.'),
    onSuccess: () => { setNotice('형식을 삭제했어요. 이미 찾은 키 기록은 그대로 남아요.'); void client.invalidateQueries({ queryKey: QUERY_KEY }) },
  })

  const update = <K extends keyof CustomKeyPatternInput>(key: K, value: CustomKeyPatternInput[K]) => {
    setNotice(null)
    create.reset()
    setForm((prev) => ({ ...prev, [key]: value }))
  }
  const found = useQuery({ queryKey: FOUND_QUERY_KEY, queryFn: fetchFoundCustomKeys, retry: false, refetchOnWindowFocus: false })
  const scan = useMutation({
    mutationFn: runCredentialScan,
    onSuccess: () => void client.invalidateQueries({ queryKey: FOUND_QUERY_KEY }),
  })
  const charsets = list.data?.charsets ?? []
  const canManage = list.data?.canManage ?? false
  const createError = create.error instanceof ApiError ? create.error.message : create.isError ? '등록하지 못했어요.' : null

  return <>
    <PageHeader title="키 형식 등록" description="사내에서 쓰는 키 모양을 알려 주면, 정규식은 자동으로 만들어 검사에 더해요." />

    <section className="card key-pattern-form" aria-labelledby="key-pattern-form-title">
      <div className="card-head"><h2 id="key-pattern-form-title">새 형식</h2><span className="caption">기본 규칙(AWS·Notion)은 항상 함께 검사해요</span></div>
      {list.isSuccess && !canManage && <p className="notice" role="note">키 형식 등록·삭제는 관리자만 할 수 있어요. 규칙 미리보기와 샘플 시험은 해 볼 수 있어요.</p>}
      <form className="key-pattern-grid" onSubmit={(event) => { event.preventDefault(); create.mutate(form) }}>
        <label className="field">이름
          <input className="input" value={form.name} maxLength={50} placeholder="예: 사내 RIK 키" onChange={(e) => update('name', e.target.value)} />
        </label>
        <label className="field">접두사
          <input className="input mono" value={form.prefix} maxLength={20} placeholder="예: rik_" onChange={(e) => update('prefix', e.target.value)} />
        </label>
        <label className="field">문자 종류 (접두사 뒤)
          <select className="select" value={form.charset} onChange={(e) => update('charset', e.target.value as KeyCharset)}>
            {charsets.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
        <label className="field">길이 (접두사 뒤 글자 수)
          <input className="input" type="number" min={16} max={128} value={form.length} onChange={(e) => update('length', Number(e.target.value))} />
        </label>
        <fieldset className="field key-pattern-secret">
          <legend>이 값만으로 로그인·호출이 되나요?</legend>
          <label><input type="radio" checked={form.secret} onChange={() => update('secret', true)} /> 네, 비밀값이에요 <span className="caption">(원문 대신 지문만 저장)</span></label>
          <label><input type="radio" checked={!form.secret} onChange={() => update('secret', false)} /> 아니요, 식별자예요 <span className="caption">(ID처럼 저장)</span></label>
        </fieldset>

        <div className="key-pattern-preview" aria-live="polite">
          <span className="caption">자동으로 만들어진 규칙</span>
          {preview ? <code className="key-pattern-rule">{preview.rule}</code> : <code className="key-pattern-rule muted">{previewError ?? '접두사를 입력하면 보여 드려요'}</code>}
          {preview && <span className="caption">이런 모양을 찾아요: <code>{preview.example}</code></span>}
        </div>

        <label className="field key-pattern-sample">샘플로 시험해 보기 <span className="caption">(선택 · 저장하지 않아요)</span>
          <textarea className="input mono" rows={3} value={form.sample} maxLength={10000} placeholder="키가 들어간 글을 붙여 넣으면 잡히는지 바로 보여 드려요" onChange={(e) => update('sample', e.target.value)} />
          {preview && form.sample ? (preview.sampleMatches.length
            ? <span className="badge success">{preview.sampleMatches.length}개 찾음 · {preview.sampleMatches.join(', ')}</span>
            : <span className="badge">샘플에서 찾은 값이 없어요</span>) : null}
        </label>

        <div className="row key-pattern-actions">
          {createError && <p className="field-error" role="alert">{createError}</p>}
          <button className="btn primary" type="submit" disabled={!canManage || !preview || !form.name.trim() || create.isPending} title={canManage ? undefined : "관리자만 등록할 수 있어요"}>{create.isPending ? '등록 중…' : '형식 등록'}</button>
        </div>
      </form>
    </section>

    {notice && <p className="notice" role="status">{notice}</p>}

    <section className="card" aria-labelledby="key-pattern-list-title">
      <div className="card-head"><h2 id="key-pattern-list-title">등록된 형식</h2>{list.data && <span className="caption">{list.data.items.length} / {list.data.limit}개</span>}</div>
      {list.isPending ? <p role="status">불러오는 중이에요.</p>
        : list.isError ? <p className="notice error" role="alert">목록을 불러오지 못했어요. <button className="btn outline small" onClick={() => void list.refetch()}>다시 조회</button></p>
        : list.data.items.length === 0 ? <p className="notice">아직 등록한 형식이 없어요. 위 폼에서 하나 등록해 보세요.</p>
        : <div className="table-scroll" tabIndex={0} role="region" aria-label="등록된 키 형식">
          <table>
            <thead><tr><th>이름</th><th>규칙</th><th>종류</th><th>등록</th><th /></tr></thead>
            <tbody>{list.data.items.map((item) => <tr key={item.id}>
              <td>{item.name}</td>
              <td><code>{item.rule}</code><span className="asset">{item.charsetLabel} · {item.length}자</span></td>
              <td>{item.secret ? <span className="badge critical">비밀값</span> : <span className="badge medium">식별자</span>}</td>
              <td className="caption">{item.createdBy ?? '-'} · {new Date(item.createdAt).toLocaleDateString('ko-KR')}</td>
              <td>{canManage && <button className="btn outline small" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>삭제</button>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>

    <section className="card key-pattern-found" aria-labelledby="key-pattern-found-title">
      <div className="card-head">
        <h2 id="key-pattern-found-title">등록한 형식으로 찾은 키</h2>
        <button className="btn soft" disabled={scan.isPending} onClick={() => scan.mutate()}>{scan.isPending ? '검사 중…' : '지금 검사'}</button>
      </div>
      <p className="caption">수집기에 공유된 Notion 페이지를 기본 규칙(AWS·Notion)과 위에 등록한 형식으로 함께 검사해요. 키 원문은 저장하지 않고 가린 값만 보여요.</p>
      {scan.data && <p className={`notice ${scan.data.status === 'FAILED' || scan.data.status === 'NOT_CONFIGURED' ? 'error' : ''}`.trim()} role="status">
        {scan.data.message}{scan.data.newKeys > 0 && ` 새로 찾은 키 ${scan.data.newKeys}개.`} <span className="caption">({new Date(scan.data.scannedAt).toLocaleString('ko-KR')})</span>
      </p>}
      {scan.isError && <p className="notice error" role="alert">{scan.error instanceof ApiError ? scan.error.message : '검사를 실행하지 못했어요.'}</p>}
      {found.isPending ? <p role="status">불러오는 중이에요.</p>
        : found.isError ? <p className="notice error" role="alert">찾은 키를 불러오지 못했어요. <button className="btn outline small" onClick={() => void found.refetch()}>다시 조회</button></p>
        : found.data.length === 0 ? <p className="notice">아직 찾은 키가 없어요. 형식을 등록한 뒤 지금 검사를 눌러 보세요.</p>
        : <div className="table-scroll" tabIndex={0} role="region" aria-label="등록한 형식으로 찾은 키">
          <table>
            <thead><tr><th>키</th><th>발견 위치</th><th>구성</th></tr></thead>
            <tbody>{found.data.map((key) => <tr key={key.credentialId}>
              <td><code>{key.displayName}</code></td>
              <td>{key.location ?? '위치 정보 없음'}</td>
              <td>{key.componentState === 'CONFIRMED' ? <span className="badge critical">비밀값 노출</span> : <span className="badge medium">식별자만</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>
  </>
}
