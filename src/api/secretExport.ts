import { ApiError } from '@/api/client'
import type { InventoryFilter } from '@/api/secrets'
import { safeSecretSearch } from '@/lib/secretReadSelection'
import { secretExportFilename, secretExportPath, type ServerExportFormat } from '@/lib/secretExport'

/** 서버가 권한·스냅샷을 다시 확인한 뒤 만든 파일을 받는다. 파일 내용은 화면에 띄우거나 저장소에 남기지 않는다. */
export async function fetchSecretExport(format: ServerExportFormat, filters: InventoryFilter): Promise<{ blob: Blob; filename: string }> {
  const safeFilters = { ...filters, q: filters.q ? safeSecretSearch(filters.q) : undefined }
  const response = await fetch(secretExportPath(format, safeFilters), { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) {
    let code: string | null = null
    let message = '요청을 처리하지 못했어요.'
    try {
      const body = (await response.json()) as { code?: string; message?: string }
      code = body.code ?? null
      message = body.message ?? message
    } catch {
      // 본문이 없는 오류
    }
    throw new ApiError(response.status, code, message)
  }
  return { blob: await response.blob(), filename: secretExportFilename(format, response.headers.get('Content-Disposition')) }
}
