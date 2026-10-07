import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // 개발할 때 /api 요청을 백엔드(8080)로 대신 전달한다(프록시).
  // 브라우저는 화면(5173)과 같은 곳으로 보낸다고 생각해서 로그인 쿠키가 그대로 오간다.
  const env = loadEnv(mode, currentDirectory, '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(currentDirectory, 'src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
