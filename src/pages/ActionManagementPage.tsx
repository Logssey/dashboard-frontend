import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { fetchActionRecords } from '@/api/actionRecords'
import { actionStatusLabels, verificationLabels } from '@/lib/actionRecords'
import { formatKst } from '@/lib/reach'
import { PageHeader } from '@/components/PageHeader'
import { SecretCasesPage } from './SecretCasesPage'
import { useSecretReadRefresh } from '@/lib/useSecretReadRefresh'
import '@/components/action-records.css'

export function ActionManagementPage({ fixedArea }: { fixedArea?: 'IAC' | 'IMAGE' }) {
  const location = useLocation()
  const [params,setParams]=useSearchParams()
  const client=useQueryClient()
  const refreshSecrets=useSecretReadRefresh()
  const area=fixedArea ?? (['SECRET','IAC','IMAGE'].includes(params.get('area') ?? '') ? params.get('area')! : 'SECRET')
  const assignee=['ALL','ME','UNASSIGNED'].includes(params.get('owner') ?? '') ? params.get('owner')! : 'ALL'
  const raw=Number(params.get('page') ?? 0)
  const page=Number.isSafeInteger(raw) && raw>=0 && raw<=10000 ? raw : 0
  const list=useQuery({queryKey:['action-records',area,assignee,page],queryFn:()=>fetchActionRecords(area,assignee,page),enabled:area!=='SECRET',retry:false})
  return <>
    <PageHeader title={fixedArea === 'IAC' ? 'IaC 조치 관리' : fixedArea === 'IMAGE' ? '이미지 조치 관리' : '조치 관리'} description="담당자와 조치 진행 상황을 확인하고, 검사 결과로 남은 위험을 확인하세요." actions={<button className="btn outline" onClick={()=>{
      if(area==='SECRET') { refreshSecrets(); const next=new URLSearchParams(params); next.delete('snapshotId'); setParams(next,{replace:true}) }
      else void client.invalidateQueries({queryKey:['action-records']})
    }}>결과 새로고침</button>} />
    {!fixedArea && <nav className="row action-management-tabs" aria-label="조치 보안 영역">
      {([['SECRET','시크릿'],['IAC','IaC'],['IMAGE','이미지']] as const).map(([value,label])=><Link key={value} className={`btn ${value===area?'primary':'outline'}`} aria-current={value===area?'page':undefined} to={`/actions?area=${value}`}>{label}</Link>)}
    </nav>}
    {area==='SECRET' ? <SecretCasesPage embedded /> : <>
      <section className="card action-management-list">
        <div className="row between"><label className="field">담당 범위<select className="select" value={assignee} onChange={e=>setParams({area,owner:e.target.value,page:'0'})}><option value="ALL">전체</option><option value="ME">내 담당</option><option value="UNASSIGNED">담당자 미지정</option></select></label>
          <Link className="finding-link" to={area==='IAC'?'/iac/paths':'/vulnerabilities/findings'}>검사 결과에서 조치 시작</Link></div>
        <p className="caption">조치 기록을 시작한 항목이에요. 기록 완료와 검사에서 미발견은 구분해서 표시해요.</p>
        {list.isPending ? <p role="status">조치 목록을 불러오는 중…</p> : list.isError ? <div role="alert"><p>조치 목록을 불러오지 못했어요. 접근 권한과 연결 상태를 확인하세요.</p><button className="btn outline" onClick={()=>void list.refetch()}>다시 조회</button></div> : <>
          <div className="table-scroll"><table><thead><tr><th>대상</th><th>담당자</th><th>진행 상태</th><th>조치 후 검사</th><th>최근 기록</th></tr></thead><tbody>
            {list.data.items.map(item=><tr key={`${item.kind}:${item.id}`}><td><Link className="finding-link" state={{from:`${location.pathname}?${params}`}} to={item.kind==='IMAGE'?`/vulnerabilities/findings/${item.id}?tab=actions`:item.kind==='IAC_PATH'?`/iac/paths/${item.id}?tab=actions`:`/iac/findings/${item.id}`}>{item.title}</Link></td><td>{item.assigneeName ?? '미지정'}</td><td>{actionStatusLabels[item.status]}</td><td>{verificationLabels[item.verification.status]}<span className="asset">{item.verification.checkId ? `검사 #${item.verification.checkId}` : '검사 연결 대기'}</span></td><td>{formatKst(item.updatedAt)}</td></tr>)}
          </tbody></table></div>
          {list.data.items.length===0 && <p>이 조건에 맞는 조치 기록이 없어요. 검사 결과의 상세 화면에서 담당자를 지정하고 조치를 기록하세요.</p>}
          <div className="table-foot"><span>{list.data.total}건</span><div className="row"><button className="btn outline" disabled={page===0} onClick={()=>setParams({area,owner:assignee,page:String(page-1)})}>이전</button><span>{page+1} 페이지</span><button className="btn outline" disabled={(page+1)*30>=list.data.total} onClick={()=>setParams({area,owner:assignee,page:String(page+1)})}>다음</button></div></div>
        </>}
      </section>
    </>}
  </>
}
