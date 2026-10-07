// 템플릿 아이콘 그대로 (components.js의 paths)
const paths = {
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z|m8 12 3 3 5-6',
  grid: 'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z',
  cloud: 'M6 18a5 5 0 1 1 0-10 7 7 0 0 1 13 2 4 4 0 0 1-1 8H6',
  key: 'M15 3a6 6 0 1 1-4.8 9.6L3 20v-4l6.4-6.4A6 6 0 0 1 15 3Z|M16 7h.01',
  layers: 'm12 3 10 5-10 5L2 8l10-5Z|m2 12 10 5 10-5M2 16l10 5 10-5',
  activity: 'M2 12h5l3-8 4 16 3-8h5',
  search: 'M21 21l-5-5|M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  download: 'M12 3v12m-5-5 5 5 5-5|M4 15v5h16v-5',
  check: 'm5 12 4 4L19 6',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16',
  plus: 'M12 4v16M4 12h16',
} as const

export type IconName = keyof typeof paths

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].split('|').map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
