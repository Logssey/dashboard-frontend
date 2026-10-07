/** 템플릿의 보안 점수 원형 그림 그대로 */
export function ScoreRing({ score }: { score: number }) {
  return (
    <svg className="score-ring" viewBox="0 0 120 120" role="img" aria-label={`보안 점수 ${score}점`}>
      <circle cx="60" cy="60" r="46" fill="none" stroke="#ece5f7" strokeWidth="8" />
      <circle
        cx="60"
        cy="60"
        r="46"
        fill="none"
        stroke="#9b7bd1"
        strokeWidth="8"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${score} 100`}
        transform="rotate(-90 60 60)"
      />
      <path d="m60 40 15 6v12c0 11-15 20-15 20S45 69 45 58V46Z" fill="none" stroke="#9b7bd1" strokeWidth="2.5" />
      <path d="m53 58 5 5 10-12" fill="none" stroke="#9b7bd1" strokeWidth="2.5" />
    </svg>
  )
}
