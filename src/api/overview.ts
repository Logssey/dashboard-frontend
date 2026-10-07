import { apiRequest } from './client'
import type {
  AssetSummaryResponse,
  Environment,
  OverviewSummaryResponse,
  PriorityFindingListResponse,
  RiskTrendResponse,
} from './types'

const base = '/api/v1/overview'

export const fetchSummary = (environment: Environment) =>
  apiRequest<OverviewSummaryResponse>(`${base}/summary?environment=${environment}`)

export const fetchRiskTrend = (environment: Environment, days = 7) =>
  apiRequest<RiskTrendResponse>(`${base}/risk-trend?environment=${environment}&days=${days}`)

export const fetchAssets = (environment: Environment) =>
  apiRequest<AssetSummaryResponse>(`${base}/assets?environment=${environment}`)

export const fetchPriorityFindings = (environment: Environment, limit = 4) =>
  apiRequest<PriorityFindingListResponse>(`${base}/priority-findings?environment=${environment}&limit=${limit}`)
