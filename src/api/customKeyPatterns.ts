// 사용자 키 형식 (커스텀 키 패턴) API
// 사용자는 정규식을 쓰지 않는다. 접두사·문자 종류·길이만 보내면 서버가 규칙을 만든다.
import { apiRequest } from './client'

export type KeyCharset = 'HEX_LOWER' | 'HEX' | 'ALNUM' | 'ALNUM_UPPER' | 'ALNUM_LOWER' | 'DIGITS' | 'BASE64URL'

export interface CustomKeyPatternInput {
  name: string
  prefix: string
  charset: KeyCharset
  length: number
  secret: boolean
  /** 미리보기에서만 쓰는 샘플 글. 서버는 저장·로그하지 않는다 */
  sample?: string
}

export interface CustomKeyPattern {
  id: number
  name: string
  prefix: string
  charset: KeyCharset
  charsetLabel: string
  length: number
  secret: boolean
  /** 서버가 만든 규칙. 예: rik_[0-9a-f]{32} */
  rule: string
  createdBy: string | null
  createdAt: string
}

export interface CustomKeyPatternList {
  items: CustomKeyPattern[]
  charsets: Array<{ code: KeyCharset; label: string }>
  limit: number
  /** 지금 사용자가 등록·삭제할 수 있는지 (관리자만) */
  canManage: boolean
}

export interface CustomKeyPatternPreview {
  rule: string
  example: string
  /** 샘플에서 찾은 값 (마스킹됨) */
  sampleMatches: string[]
}

const BASE = '/api/v1/credentials/custom-patterns'

export function fetchCustomKeyPatterns(): Promise<CustomKeyPatternList> {
  return apiRequest<CustomKeyPatternList>(BASE)
}

export function previewCustomKeyPattern(input: CustomKeyPatternInput): Promise<CustomKeyPatternPreview> {
  return apiRequest<CustomKeyPatternPreview>(`${BASE}/preview`, { method: 'POST', body: JSON.stringify(input) })
}

export function createCustomKeyPattern(input: CustomKeyPatternInput): Promise<CustomKeyPattern> {
  const { sample: _sample, ...body } = input
  return apiRequest<CustomKeyPattern>(BASE, { method: 'POST', body: JSON.stringify(body) })
}

export function deleteCustomKeyPattern(id: number): Promise<void> {
  return apiRequest<void>(`${BASE}/${id}`, { method: 'DELETE' })
}

/** "지금 스캔" 응답 (백엔드 ScanResult). 내장 규칙 + 등록한 형식으로 Notion 페이지를 검사한다 */
export interface CredentialScanResult {
  status: 'COMPLETED' | 'PARTIAL' | 'NOT_CONFIGURED' | 'FAILED'
  scannedPages: number
  unreadablePages: number
  foundKeys: number
  newKeys: number
  message: string
  scannedAt: string
}

/** 등록한 형식으로 찾은 키 (credentials, issuer = CUSTOM). 원문은 없고 마스킹 값만 온다 */
export interface FoundCustomKey {
  credentialId: number
  displayName: string
  status: string
  location: string | null
  componentState: string
}

export function runCredentialScan(): Promise<CredentialScanResult> {
  return apiRequest<CredentialScanResult>('/api/v1/credentials/scan', { method: 'POST' })
}

export async function fetchFoundCustomKeys(): Promise<FoundCustomKey[]> {
  const response = await apiRequest<{ items: FoundCustomKey[] }>('/api/v1/credentials?issuer=CUSTOM')
  return response.items
}
