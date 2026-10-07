import type { RiskTrendResponse } from '@/api/types'

/** 템플릿의 위험 추이 차트(직접 그린 SVG)를 실제 API 값으로 그린다. 하루 전체 건수(total) 한 줄 */
export function TrendChart({ days }: { days: RiskTrendResponse['days'] }) {
  const values = days.map((day) => day.total)
  const max = Math.max(5, Math.ceil(Math.max(0, ...values) / 5) * 5)
  const step = values.length > 1 ? 486 / (values.length - 1) : 0
  const x = (index: number) => 42 + index * step
  const y = (value: number) => 155 - (value / max) * 130
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  const labels = days.map((_, index) => {
    const daysAgo = days.length - 1 - index
    if (daysAgo === 0) return '오늘'
    if (daysAgo === 1) return '어제'
    return `${daysAgo}일 전`
  })
  const first = values[0] ?? 0
  const last = values.at(-1) ?? 0

  return (
    <svg
      className="chart"
      viewBox="0 0 560 190"
      role="img"
      aria-label={`최근 ${days.length}일 위험 추이. ${first}건에서 ${last}건.`}
    >
      <defs>
        <linearGradient id="chart-fill" x2="0" y2="1">
          <stop stopColor="#7a56df" stopOpacity=".13" />
          <stop offset="1" stopColor="#7a56df" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line x1="42" x2="528" y1={25 + i * 43.3} y2={25 + i * 43.3} stroke="#e5e8eb" strokeDasharray="3 5" />
          <text x="12" y={29 + i * 43.3}>
            {Math.round(max - (i * max) / 3)}
          </text>
        </g>
      ))}
      {values.length > 0 && (
        <>
          <polygon points={`${x(0)},155 ${points} ${x(values.length - 1)},155`} fill="url(#chart-fill)" />
          <polyline points={points} fill="none" stroke="#9876d9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {labels.map((label, index) => (
        <text key={index} x={x(index)} y="182" textAnchor="middle">
          {label}
        </text>
      ))}
    </svg>
  )
}
