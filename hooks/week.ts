// The weekly view's arithmetic: seven-day weeks ending today, what each one
// added up to, and the patterns behind a habit's words. Pure, so the tests
// can check it without the engine.

import type { Best, Place, Quotes, Snippet, Week } from '../types'
import { CATEGORIES } from './catalog'
import { costOf, dayOf, tokensOf } from './speech'
import type { Rec } from './speech'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A stored note: the day and time it was kept under, and its record. */
export type Entry = { day: string; at: number; rec: Rec }
/** A stored note whose words are still kept, beside its record. */
export type Kept = Entry & { quotes: Quotes }

function dateOf(day: string): Date {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The day n days after a YYYY-MM-DD day, or before it when n is negative. */
export function addDays(day: string, n: number): string {
  const d = dateOf(day)
  d.setDate(d.getDate() + n)
  return dayOf(d.getTime())
}

/** A day as the weekly view names it: "Oct 23". */
export function labelOf(day: string): string {
  const d = dateOf(day)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** The name of the weekday a time falls on: "Thu". */
export function weekdayOf(ms: number): string {
  return DAYS[new Date(ms).getDay()] ?? ''
}

/** A week's span in words: "Fri Oct 23 to Thu Oct 29". */
export function spanOf(w: Week): string {
  const name = (day: string) => `${DAYS[dateOf(day).getDay()]} ${labelOf(day)}`
  return `${name(w.from)} to ${name(w.to)}`
}

/** About how many minutes a week's messages took to say, at 150 words a minute. */
export function minutesOf(w: Week): number {
  return Math.round(w.words / 150)
}

function weekOf(from: string, to: string, recs: readonly Rec[]): Week {
  const w: Week = {
    from,
    to,
    label: labelOf(from),
    messages: recs.length,
    words: 0,
    scores: {},
    grades: {},
    tallies: {},
    places: {},
    present: {},
    tips: [],
    tokens: 0,
    cost: 0,
  }
  for (const c of CATEGORIES) {
    const xs = recs.map(r => r.scores[c.id] ?? 0).filter(g => g > 0)
    if (xs.length === 0) continue
    w.scores[c.id] = xs.reduce((a, b) => a + b, 0) / xs.length
    w.grades[c.id] = [1, 2, 3, 4, 5].map(g => xs.filter(x => x === g).length)
  }
  for (const r of recs) {
    w.words += r.words
    if (r.tip) w.tips.push(r.tip)
    if (r.usage) {
      w.tokens += tokensOf(r.usage)
      w.cost += costOf(r.model, r.usage)
    }
    for (const [id, found] of Object.entries(r.tallies)) {
      const tally = (w.tallies[id] ??= {})
      for (const [name, n] of Object.entries(found)) tally[name] = (tally[name] ?? 0) + n
      if (Object.values(found).some(n => n > 0)) w.present[id] = (w.present[id] ?? 0) + 1
    }
    for (const [id, byWord] of Object.entries(r.places ?? {})) {
      for (const [name, at] of Object.entries(byWord)) {
        const into = ((w.places[id] ??= {})[name] ??= {})
        for (const [p, n] of Object.entries(at) as [Place, number][]) into[p] = (into[p] ?? 0) + n
      }
    }
  }
  return w
}

/** The last `count` seven-day weeks, the oldest first: the last ends today, and each ends the day before the next begins. */
export function weeksOf(entries: readonly Entry[], today: string, count: number): Week[] {
  const weeks: Week[] = []
  for (let k = count - 1; k >= 0; k--) {
    const to = addDays(today, -7 * k)
    const from = addDays(to, -6)
    weeks.push(weekOf(from, to, entries.filter(e => e.day >= from && e.day <= to).map(e => e.rec)))
  }
  return weeks
}

const WHERE: Record<Place, string> = {
  opener: 'to open a message',
  start: 'to start a sentence',
  end: 'to end a sentence',
  middle: 'in the middle of a sentence',
}

const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`

function mostOf(at: Partial<Record<Place, number>> | undefined): [Place, number] | undefined {
  return (Object.entries(at ?? {}) as [Place, number][]).sort((a, b) => b[1] - a[1])[0]
}

/** What kept happening with a counted habit in a week: where its most common word fell, then the next two. */
export function patternOf(id: string, w: Week): { main: string; also: string[] } | undefined {
  const ranked = Object.entries(w.tallies[id] ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  const top = ranked[0]
  if (!top) return undefined
  const [name, total] = top
  const place = mostOf(w.places[id]?.[name])
  const main = !place
    ? `“${name}”, ${times(total)}.`
    : place[1] === total
      ? `“${name}” ${WHERE[place[0]]}, all ${times(total)}.`
      : `“${name}” ${WHERE[place[0]]}: ${place[1]} of its ${total} uses.`
  const also = ranked.slice(1, 3).map(([n, count]) => {
    const p = mostOf(w.places[id]?.[n])
    return p ? `“${n}” ${WHERE[p[0]]}, ${times(count)}.` : `“${n}”, ${times(count)}.`
  })
  return { main, also }
}

/** The 2fer a week kept giving: its tips grouped by their lead, up to a colon or a period, when a lead came twice or more. */
export function commonTip(tips: readonly string[]): { text: string; count: number } | undefined {
  const leads = new Map<string, { text: string; count: number }>()
  for (const tip of tips) {
    const lead = tip.split(/[:.]/)[0]?.trim() ?? ''
    if (lead === '') continue
    const seen = leads.get(lead.toLowerCase())
    if (seen) seen.count += 1
    else leads.set(lead.toLowerCase(), { text: `${lead}.`, count: 1 })
  }
  const most = [...leads.values()].sort((a, b) => b.count - a.count)[0]
  return most && most.count >= 2 ? most : undefined
}

/** The week's best-scored message among those whose words are kept: the highest average, then the longest. */
export function bestOf(kept: readonly Kept[]): Best | null {
  let best: Best | null = null
  let words = 0
  for (const k of kept) {
    const xs = Object.values(k.rec.scores).filter(g => g > 0)
    if (xs.length === 0) continue
    const average = xs.reduce((a, b) => a + b, 0) / xs.length
    if (!best || average > best.average || (average === best.average && k.rec.words > words)) {
      best = { excerpt: k.quotes.excerpt, at: k.at, average, scored: xs.length, allFive: xs.every(g => g === 5) }
      words = k.rec.words
    }
  }
  return best
}

/** Up to three examples of each habit from a week's kept words, the latest first. */
export function examplesOf(kept: readonly Kept[]): Record<string, Snippet[]> {
  const found: Record<string, Snippet[]> = {}
  for (const k of [...kept].sort((a, b) => b.at - a.at)) {
    for (const [id, list] of Object.entries(k.quotes.snippets)) {
      const into = (found[id] ??= [])
      for (const s of list) if (into.length < 3) into.push(s)
    }
  }
  return found
}

/** The model's summing-up of a week of notes, or undefined when its reply isn't the JSON asked for. */
export function patternFrom(reply: string): { main: string; practice: string } | undefined {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const o = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>
    const main = typeof o.main === 'string' ? o.main.trim().slice(0, 300) : ''
    const practice = typeof o.practice === 'string' ? o.practice.trim().slice(0, 300) : ''
    return main ? { main, practice } : undefined
  } catch {
    return undefined
  }
}
