import { create } from 'zustand'
import type { Environment } from '@/api/types'

/** 통합 현황 상단의 환경 선택 (전체/운영/개발) */
interface EnvironmentState {
  environment: Environment
  setEnvironment: (environment: Environment) => void
}

export const useEnvironmentStore = create<EnvironmentState>((set) => ({
  environment: 'ALL',
  setEnvironment: (environment) => set({ environment }),
}))
