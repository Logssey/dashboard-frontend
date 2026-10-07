export function Badge({ label, tone = '' }: { label: string; tone?: string }) {
  return <span className={`badge ${tone}`.trim()}>{label}</span>
}
