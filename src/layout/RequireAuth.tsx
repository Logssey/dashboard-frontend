import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LOGIN_PATH } from '@/lib/routes'
import { useMe } from './useMe'

/** 로그인이 안 되어 있으면 로그인 화면으로 보낸다 */
export function RequireAuth() {
  const { data: me, isPending, isError } = useMe()
  const location = useLocation()

  if (isPending) return <div className="page-loading"><div className="skeleton" /></div>
  if (isError) return <div className="page-loading"><p className="notice error">서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.</p></div>
  if (!me) return <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname }} />
  return <Outlet />
}
