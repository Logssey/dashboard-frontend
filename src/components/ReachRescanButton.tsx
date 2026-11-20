import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { createReachScan, type ReachScan } from '@/api/reach'
import { newIdempotencyKey, rescanErrorText } from '@/lib/reach'

// SCR-05-08 [다시 대조]. 성공한 스캔을 한 번 눌러 다시 대조한다 (API-01 rescanOf).
// 대상을 다시 적지 않는다: 서버가 원래 스캔의 대상으로 띄우고, 실행기는 보관한 SBOM을 최신 취약점 DB·판정 데이터와 다시 맞춘다.
// 누가 보일지는 부르는 쪽이 canRescan으로 정한다

export function ReachRescanButton({ scanId, onCreated }: {
  scanId: number
  /** 새로 생긴 스캔. 보통 그 스캔의 상세로 옮긴다 */
  onCreated: (scan: ReachScan) => void
}) {
  const queryClient = useQueryClient()
  // 같은 버튼을 두 번 눌러도(응답이 늦어 다시 누름) 스캔은 하나만 생기게 요청이 끝날 때까지 같은 키를 쓴다
  const [key, setKey] = useState(newIdempotencyKey)
  const create = useMutation({
    mutationFn: () => createReachScan({ rescanOf: scanId }, key),
    onSuccess: (scan) => {
      setKey(newIdempotencyKey())
      void queryClient.invalidateQueries({ queryKey: ['reach-scans'] })
      onCreated(scan)
    },
  })
  const error =
    create.error instanceof ApiError
      ? rescanErrorText(create.error.status, create.error.code, create.error.message)
      : create.error
        ? '다시 대조를 요청하지 못했어요. 연결을 확인하고 다시 시도하세요.'
        : null

  return (
    <>
      <button
        type="button"
        className="btn outline small"
        title="이 스캔의 대상을 보관한 SBOM으로 다시 대조해요. 새 취약점과 새 판정 데이터가 반영돼요."
        disabled={create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? '요청 중…' : '다시 대조'}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
