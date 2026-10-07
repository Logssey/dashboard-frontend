import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { App } from '@/App'
import { ME_QUERY_KEY } from '@/layout/useMe'
import './styles/tokens.css'
import './styles/ui.css'
import './styles/app.css'

// 어떤 API에서든 401(로그인 풀림·세션 1시간 만료)이 오면 로그인 상태를 지워서 로그인 화면으로 보낸다
const handleUnauthenticated = (error: Error) => {
  if (error instanceof ApiError && error.status === 401 && !error.message.includes('아이디 또는 비밀번호')) {
    queryClient.setQueryData(ME_QUERY_KEY, null)
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthenticated }),
  mutationCache: new MutationCache({ onError: handleUnauthenticated }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
