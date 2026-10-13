# dashboard-frontend

Logssey 보안 대시보드 화면. 설계 문서는 `dashboard-design-docs` 저장소를 따른다.

## 실행 (로컬)

준비: Node 24 이상, 백엔드(`dashboard-backend`)가 8080번에서 켜져 있어야 한다.

```
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 연다. `/api` 요청은 Vite 프록시가 백엔드(8080)로 전달한다.
백엔드 주소가 다르면 `.env` 파일에 `VITE_API_PROXY_TARGET=http://localhost:포트`를 적는다.

## 구조

| 폴더 | 내용 |
| --- | --- |
| `src/api` | 백엔드 호출 (API 응답 이름 그대로 사용, CSRF 헤더 자동 첨부) |
| `src/layout` | 사이드바·상단 바, 로그인 확인 |
| `src/pages` | 로그인, 통합 현황, 시크릿 보안, 준비 중 탭 |
| `src/components` | 템플릿을 React로 옮긴 공통 화면 조각 |
| `src/styles` | 진호 님 UI 템플릿 스타일 (`tokens.css`, `ui.css`) + 템플릿에 없는 화면용 `app.css` |

시크릿 보안 화면은 관리자 세션으로 승인된 활성 연결을 조회하고 `POST /api/v1/secrets/runs`에 수동 검사를 등록한다. 반환된 실행 ID를 주소의 `run` 파라미터에 두고 상태를 조회하므로 새로고침 후에도 진행 상황을 볼 수 있다. 키 목록·발견 위치는 `/api/v1/secrets`에서 읽는다. 화면에는 마스킹된 키만 표시한다.
