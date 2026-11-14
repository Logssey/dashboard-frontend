import type { SecretDetail } from '@/api/secrets'
import { scanDate } from '@/lib/secretScan'

export function SecretIamUsageMetadata({ metadata }: { metadata: SecretDetail['iamMetadata'] }) {
  if (!metadata) return null
  const service = metadata.lastUsedService && /^[a-z0-9-]{1,40}$/.test(metadata.lastUsedService) ? metadata.lastUsedService : '미확인'
  const region = metadata.lastUsedRegion && /^[a-z]{2}(?:-[a-z]+)+-\d$/.test(metadata.lastUsedRegion) ? metadata.lastUsedRegion : '미확인'
  return <section className="secret-usage-metadata" aria-label="IAM 최근 사용 메타데이터">
    <h3>IAM 최근 사용 정보</h3>
    <dl className="secret-scan-facts"><div><dt>마지막 사용 시각</dt><dd>{scanDate(metadata.lastUsedAt)}</dd></div><div><dt>서비스</dt><dd>{service}</dd></div><div><dt>리전</dt><dd>{region}</dd></div><div><dt>자료 관측 시각</dt><dd>{scanDate(metadata.observedAt)}</dd></div></dl>
    <p className="caption">IAM이 제공한 최근 사용 메타데이터예요. 전체 사용 이벤트와 정상 업무·사고 여부는 따로 확인해야 해요.</p>
  </section>
}
