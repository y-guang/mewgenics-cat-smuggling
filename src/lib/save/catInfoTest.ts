import { readCatsInfo, type CatInfoRecord } from './catInfo'

export interface CatInfoListingResult {
  report: string
  cats: CatInfoRecord[]
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '-'
  return String(v)
}

function oneLine(cat: CatInfoRecord): string {
  const name = cat.name ?? '(unnamed)'
  const lvl = fmt(cat.level)
  const ageDays = cat.ageDays !== null ? `${cat.ageDays}d` : '-'
  const cls = cat.className ?? '-'
  const room = cat.house?.room ?? '-'
  const id64 = cat.id64 ?? '-'

  const stats = cat.stats
    ? `STR:${cat.stats.str} DEX:${cat.stats.dex} CON:${cat.stats.con} INT:${cat.stats.int} SPD:${cat.stats.spd} CHA:${cat.stats.cha} LUCK:${cat.stats.luck}`
    : 'stats:-'

  const flags = cat.flags
    ? `dead:${cat.flags.dead ? 1 : 0} retired:${cat.flags.retired ? 1 : 0} donated:${cat.flags.donated ? 1 : 0}`
    : 'flags:-'

  const issues = cat.issues.length > 0
    ? ` issues=[${cat.issues.map(i => `${i.severity}:${i.message}`).join(' | ')}]`
    : ''

  return `${name} | key=${cat.key} | id64=${id64} | class=${cls} | lv=${lvl} | age=${ageDays} | room=${room} | ${stats} | ${flags}${issues}`
}

export async function runCatInfoListingTest(saveBytes: ArrayBuffer | Uint8Array): Promise<CatInfoListingResult> {
  const info = await readCatsInfo(saveBytes)

  const unnamed = info.cats.filter(c => !c.name).length
  const issueCount = info.cats.reduce((acc, c) => acc + c.issues.length, 0)

  const lines: string[] = []
  lines.push('Cat Info Listing Complete')
  lines.push(`current_day: ${fmt(info.currentDay)}`)
  lines.push(`total_cats: ${info.cats.length}`)
  lines.push(`unnamed_cats: ${unnamed}`)
  lines.push(`total_issues: ${issueCount}`)
  lines.push('')

  for (const cat of info.cats) {
    lines.push(oneLine(cat))
  }

  return {
    report: lines.join('\n'),
    cats: info.cats
  }
}
