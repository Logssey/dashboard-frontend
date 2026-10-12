/** 템플릿의 요약 카드 (components.js의 metric) */
export function MetricCard({ label, value, unit, description }: { label: string; value: number | string; unit: string; description: string }) {
  return (
    <article className="card">
      <p className="muted">{label}</p>
      <p className="metric-number">
        {value}
        <span className="unit">{unit}</span>
      </p>
      <p className="caption">{description}</p>
    </article>
  )
}
