import type { RiskAsset, RiskAssetsResponse } from '@/api/secretRisk'
import { riskOptionLabel } from '@/lib/secretRiskForms'

interface Props {
  occurrenceId: number
  evidenceRevision: number
  state: 'LOADING' | 'ERROR' | 'READY'
  data?: RiskAssetsResponse
  selectedAsset: RiskAsset | null
  page: number
  onSelect: (asset: RiskAsset | null) => void
  onPage: (page: number) => void
  onRetry: () => void
}

export function SecretRiskAssetPicker({ occurrenceId, evidenceRevision, state, data, selectedAsset, page, onSelect, onPage, onRetry }: Props) {
  const current = data?.occurrenceId === occurrenceId && data.evidenceRevision === evidenceRevision
  return <div className="secret-risk-asset-picker">
    <h4>등록 자산 연결 (선택)</h4>
    <p className="caption">자료가 설명하는 실제 자산을 연결해요. 연결만으로 이 키의 접근 권한이 확인되지는 않아요.</p>
    {state === 'LOADING' ? <p role="status">연결 가능한 자산을 불러오는 중이에요.</p>
      : state === 'ERROR' ? <p className="notice" role="alert">자산 목록을 불러오지 못했어요. 연결 없이 분류 자료를 제출하거나 <button type="button" className="btn outline" onClick={onRetry}>다시 조회</button>하세요.</p>
        : !current ? <p className="notice">근거가 바뀌었어요. 현재 근거를 다시 조회한 뒤 자산을 선택하세요.</p>
          : !data?.capabilities.canLinkAsset ? <p className="caption">현재 권한으로 자산 연결을 변경할 수 없어요. 분류 자료는 별도로 제출할 수 있어요.</p>
            : <>
              <label>연결할 자산<select className="select" value={selectedAsset?.assetId ?? ''} onChange={(event) => onSelect(data.items.find((asset) => String(asset.assetId) === event.target.value) ?? null)}>
                <option value="">자산 연결 없이 분류 자료만 기록</option>
                {selectedAsset && !data.items.some((asset) => asset.assetId === selectedAsset.assetId) && <option value={selectedAsset.assetId}>{selectedAsset.label} · 선택 유지</option>}
                {data.items.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.label} · {riskOptionLabel(asset.environment)}</option>)}
              </select></label>
              {data.items.length === 0 && <p className="caption">현재 선택할 등록 자산이 없어요. 자산 연결 없이 분류 근거를 기록할 수 있어요.</p>}
              {data.total > data.size && <div className="row">
                <button type="button" className="btn outline" disabled={page === 0} onClick={() => onPage(page - 1)}>자산 이전</button>
                <span>{page + 1} / {Math.ceil(data.total / data.size)}</span>
                <button type="button" className="btn outline" disabled={(page + 1) * data.size >= data.total} onClick={() => onPage(page + 1)}>자산 다음</button>
              </div>}
              {selectedAsset && <><p className="caption">선택 자산 · {selectedAsset.label}. 환경은 등록 자산과 같아야 하며 민감도·중요도는 아래에서 근거에 맞게 각각 확인하세요.</p><p className="caption">연결 자산을 바꾸면 이전 분류·권한 자료는 이력에 보존하고 현재 근거를 다시 확인해요.</p></>}
            </>}
    {selectedAsset && <button type="button" className="btn outline" onClick={() => onSelect(null)}>자산 선택 취소</button>}
  </div>
}
