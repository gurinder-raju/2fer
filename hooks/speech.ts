// What 2fer works out in code, so the counts, and the scores of the counted
// categories, come out the same every time. The model judges only what code
// can't, and only the categories a person has on.

import type { Grade, Note, Place, Quotes, Reading, Snippet, Usage } from '../types'
import { CATEGORIES, MODELS, countOf } from './catalog'
import type { Counted, Hit, Judged, Piece, Style } from './catalog'

/** What code counts in one message, before any model sees it. */
export type Counts = {
  words: number
  sentences: number
  /** Sentences that open with So, And, Like or Right: words that join ideas without saying how. */
  openers: number
  /** The words each counted category found, and how often. */
  tallies: Record<string, Record<string, number>>
}
/** What the model judges: a score and a note for each judged category, then the rewrite. */
export type Review = Pick<Note, 'before' | 'after' | 'tip' | 'skeleton'> & {
  scores: Record<string, Grade>
  notes: Record<string, string>
  /** The passages the model copied out for each judged category that marks them. */
  marks: Record<string, string[]>
}
/** One reviewed message, as the weekly view keeps it in $.store: no words of the message. */
export type Rec = {
  words: number
  scores: Record<string, Grade>
  tallies: Record<string, Record<string, number>>
  /** Where each counted category's words fell, by category and word. */
  places?: Record<string, Record<string, Partial<Record<Place, number>>>>
  tip: string
  model: string
  usage: Usage | null
}
/** What a note's card shows, in the order it shows it. */
export type Card = {
  /** When the message was sent, and how long it was: "10:02 · 55 words". */
  head: string
  /** Each scored category: its pill, and the line beside it. */
  rows: { short: string; score: Grade; detail: string; style?: Style }[]
  tip: string
  after: string
  before: string
  skeleton: string
  /** Which model scored it and what that used, or that no model did. */
  foot: string
}
/** A stretch of a message, and the categories whose marks cover it. */
export type Run = { text: string; marks: string[] }
/** A category's average over the session, for the pills at the top of the session pane. */
export type Average = { id: string; short: string; style?: Style; value: number }

export const MIN_WORDS = 15

export function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The key a message's note is kept under: its length and an FNV-1a hash. */
export function keyOf(text: string): string {
  const t = normalize(text)
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) {
    h = Math.imul(h ^ t.charCodeAt(i), 0x01000193) >>> 0
  }
  return `${t.length}-${h.toString(16)}`
}

export function wordsOf(text: string): string[] {
  return text.match(/[A-Za-z']+/g) ?? []
}

/** The words of a normalized message, and where each starts. */
export function wordsAt(t: string): Piece[] {
  return [...t.matchAll(/[A-Za-z']+/g)].map(m => ({ text: m[0], start: m.index ?? 0 }))
}

/** The sentences of a normalized message as dictation broke them, and where each starts. */
export function sentencesAt(t: string): Piece[] {
  const found: Piece[] = []
  let from = 0
  for (const s of t.split(/(?<=[.!?])\s+/)) {
    const start = t.indexOf(s, from)
    from = start + s.length
    if (/[A-Za-z]/.test(s)) found.push({ text: s, start })
  }
  return found
}

/**
 * Whether a message reads as dictated speech: long enough, capitalised the
 * way dictation writes it, and prose rather than code or a paste.
 */
export function isSpeech(text: string): boolean {
  const t = normalize(text)
  const words = wordsOf(t)
  if (words.length < MIN_WORDS) return false
  // Dictation capitalises the first word and every "I"; typing often doesn't.
  if (/^[a-z]/.test(t) || /(?<![A-Za-z'])i(?![A-Za-z'])/.test(t)) return false
  if (/```|<\/?[a-z_-]+>/i.test(t)) return false
  // Pastes read as prose too: styled letters, a transcript's timestamps, or a length nobody dictates.
  if (/[\u{1D400}-\u{1D7FF}]/u.test(t) || (t.match(/\b\d{1,2}:\d{2}\b/g)?.length ?? 0) >= 3 || words.length > 900) return false
  return words.length / t.split(' ').length >= 0.75
}

export function countSpeech(text: string, counted: readonly Counted[]): Counts {
  const t = normalize(text)
  const words = wordsAt(t)
  const sentences = sentencesAt(t)
  return {
    words: words.length,
    sentences: sentences.length,
    openers: sentences.filter(s => /^(?:so|and|like|right)\b/i.test(s.text)).length,
    tallies: Object.fromEntries(counted.map(c => [c.id, countOf(c.find(t, words, sentences))])),
  }
}

/**
 * Counted categories are scored in code, out of 5 like the rest: 5 under 1
 * per 100 words, 4 for a single one or under 2, 3 under 4, 2 under 7, else 1.
 */
export function countGrade(found: Record<string, number>, words: number): Grade {
  const n = Object.values(found).reduce((a, b) => a + b, 0)
  const per100 = (100 * n) / Math.max(1, words)
  if (per100 < 1) return 5
  if (n === 1 || per100 < 2) return 4
  if (per100 < 4) return 3
  if (per100 < 7) return 2
  return 1
}

/** The one user message the model gets: what code counted, then the message as data. */
export function ask(text: string, c: Counts, counted: readonly Counted[], judged: readonly Judged[]): string {
  const hints = judged.flatMap(k => {
    const hint = k.hint?.(c) ?? ''
    return hint ? [`${k.name}: ${hint}`] : []
  })
  return [
    `Counted in code, so don't recount: ${c.words} words, ${c.sentences} sentences.`,
    ...counted.map(k => `${k.name}: ${tally(c.tallies[k.id] ?? {}) || 'none'}.`),
    ...hints,
    '',
    'The message, exactly as dictated:',
    '<message>',
    normalize(text),
    '</message>',
  ].join('\n')
}

/** The model's JSON reply as a Review of the judged categories, or undefined when it isn't one. */
export function parseReview(reply: string, judged: readonly Judged[]): Review | undefined {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  let value: unknown
  try {
    value = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const o = value as Record<string, unknown>
  const text = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '')
  const grade = (x: unknown): Grade => {
    const g = typeof x === 'number' || typeof x === 'string' ? Number(x) : 0
    return Number.isInteger(g) && g >= 1 && g <= 5 ? (g as Grade) : 0
  }
  const field = (x: unknown) => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {})
  const scores = field(o.scores)
  const notes = field(o.notes)
  const marks = field(o.marks)
  const passages = (x: unknown) =>
    Array.isArray(x) ? x.map(p => text(p, 240)).filter(p => p !== '').slice(0, 3) : []
  return {
    scores: Object.fromEntries(judged.map(k => [k.id, grade(scores[k.id])])),
    notes: Object.fromEntries(judged.map(k => [k.id, text(notes[k.id], 400)])),
    marks: Object.fromEntries(judged.filter(k => k.quote).map(k => [k.id, passages(marks[k.id])])),
    before: text(o.before, 600),
    after: text(o.after, 600),
    tip: text(o.tip, 300),
    skeleton: text(o.skeleton, 1500),
  }
}

/** Words found and how often, most often first: "like ×3, right?". */
export function tally(found: Record<string, number>): string {
  return Object.entries(found)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(', ')
}

export function tokensOf(u: Usage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite
}

/** What a call's tokens come to at the model's API list price, in dollars: how they are weighed against the plan's limit. */
export function costOf(model: string, u: Usage | null): number {
  const p = MODELS.find(m => m.id === model)?.price
  if (!u || !p) return 0
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6
}

function thousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function kilo(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

// How far the 5-hour window must move, in its whole points, to say what one is worth.
const POINTS_TO_TELL = 2

/** A share of the 5-hour limit, to one figure, which is all the estimate can bear. */
export function percentOf(x: number): string {
  return x < 0.01 ? 'under 0.01%' : `about ${Number(x.toPrecision(1))}%`
}

/**
 * What one point of the 5-hour window is worth at list prices, from how far
 * it moved while the session spent. The window is reported in whole points,
 * so it has to move a little before this can tell.
 */
export function pointWorth(from: Reading, now: Reading): number | undefined {
  const moved = now.percent - from.percent
  return moved >= POINTS_TO_TELL && now.usd > from.usd ? (now.usd - from.usd) / moved : undefined
}

/** The local time of day, as the card and the session pane show it: "10:02". */
export function clockOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Which model scored a note and what that used, or that no model did. */
function usedOf(n: Note): string {
  if (n.model === 'none') return 'Word counts only, no model'
  const name = MODELS.find(m => m.id === n.model)?.name ?? n.model
  if (!n.usage) return `Scored by ${name}`
  const used = `${name} · ${thousands(tokensOf(n.usage))} tokens`
  return n.share === undefined ? used : `${used} · ${percentOf(n.share)} of your 5-hour limit`
}

/** What a note's card shows: each scored category as a pill with its line, then the 2fer and the rewrite. */
export function cardOf(n: Note): Card {
  return {
    head: `${clockOf(n.at)} · ${n.words} words`,
    rows: CATEGORIES.filter(c => (n.scores[c.id] ?? 0) > 0).map(c => ({
      short: c.short,
      score: n.scores[c.id] ?? 0,
      detail: n.details[c.id] ?? '',
      style: c.style,
    })),
    tip: n.tip,
    after: n.after,
    before: n.before,
    skeleton: n.skeleton,
    foot: usedOf(n),
  }
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** A small count as a word: "six". */
export function numberWord(n: number): string {
  return NUMBERS[n] ?? String(n)
}

/** The pill a message gets when nothing is under 4. */
export function praiseOf(n: Note): string {
  const scored = CATEGORIES.filter(c => (n.scores[c.id] ?? 0) > 0)
  if (!scored.every(c => n.scores[c.id] === 5)) return 'Nothing under 4'
  return `All ${numberWord(scored.length)} at 5`
}

/** Each category's average over the session's notes, for those any note scored. */
export function averagesOf(list: readonly Note[]): Average[] {
  return CATEGORIES.flatMap(c => {
    const xs = list.map(n => n.scores[c.id] ?? 0).filter(g => g > 0)
    if (xs.length === 0) return []
    return [{ id: c.id, short: c.short, ...(c.style ? { style: c.style } : {}), value: xs.reduce((a, b) => a + b, 0) / xs.length }]
  })
}

/** The passages a model's note quotes, between curly quotes, with any trailing ellipsis dropped. */
export function quotesOf(note: string): string[] {
  return [...note.matchAll(/“([^”]+)”/g)]
    .map(m => (m[1] ?? '').replace(/^[\s.…]+|[\s.…]+$/g, ''))
    .filter(q => q.length > 0)
}

/**
 * A message cut into runs at every word habit code finds and every passage
 * the model copied out, so the session pane can mark them where they were
 * said; each run names the categories whose marks cover it.
 */
export function runsOf(text: string, counted: readonly Counted[], quoted: readonly { text: string; id: string }[]): Run[] {
  const t = normalize(text)
  const words = wordsAt(t)
  const sentences = sentencesAt(t)
  const spans: { start: number; end: number; mark: string }[] = []
  for (const c of counted) {
    if (!c.style) continue
    for (const h of c.find(t, words, sentences)) spans.push({ start: h.start, end: h.end, mark: c.id })
  }
  for (const q of quoted) {
    const exact = t.indexOf(q.text)
    const at = exact >= 0 ? exact : t.toLowerCase().indexOf(q.text.toLowerCase())
    if (at >= 0) spans.push({ start: at, end: at + q.text.length, mark: q.id })
  }
  const cuts = [...new Set([0, t.length, ...spans.flatMap(s => [s.start, s.end])])].sort((a, b) => a - b)
  const runs: Run[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i] ?? 0
    const b = cuts[i + 1] ?? 0
    const marks = [...new Set(spans.filter(s => s.start <= a && s.end >= b).map(s => s.mark))]
    const last = runs[runs.length - 1]
    // Neighbours marked alike join, so the plain stretches stay whole.
    if (last && last.marks.join() === marks.join()) last.text += t.slice(a, b)
    else runs.push({ text: t.slice(a, b), marks })
  }
  return runs
}

function sentenceAt(sentences: readonly Piece[], at: number): Piece | undefined {
  return sentences.find(s => at >= s.start && at < s.start + s.text.length)
}

function placeOf(h: Hit, sentences: readonly Piece[]): Place {
  if (h.start === 0) return 'opener'
  const s = sentenceAt(sentences, h.start)
  if (!s) return 'middle'
  if (h.start === s.start) return 'start'
  return /^[\s.,!?…]*$/.test(s.text.slice(h.end - s.start)) ? 'end' : 'middle'
}

/** Where each counted category's words fell in a message, by category and word: the weekly view's patterns. */
export function placesOf(text: string, counted: readonly Counted[]): NonNullable<Rec['places']> {
  const t = normalize(text)
  const words = wordsAt(t)
  const sentences = sentencesAt(t)
  const found: NonNullable<Rec['places']> = {}
  for (const c of counted) {
    for (const h of c.find(t, words, sentences)) {
      const byWord = (found[c.id] ??= {})
      const at = (byWord[h.name] ??= {})
      const p = placeOf(h, sentences)
      at[p] = (at[p] ?? 0) + 1
    }
  }
  return found
}

// Words kept either side of a habit's words in a snippet, within its sentence.
const AROUND = 6

function around(t: string, words: readonly Piece[], sentences: readonly Piece[], h: Hit): Snippet {
  const s = sentenceAt(sentences, h.start)
  const lo = s?.start ?? 0
  const hi = s ? s.start + s.text.length : t.length
  const inside = words.filter(w => w.start >= lo && w.start < hi)
  const first = inside.findIndex(w => w.start >= h.start)
  const after = inside.findIndex(w => w.start >= h.end)
  const from = Math.min(inside[Math.max(0, first - AROUND)]?.start ?? h.start, h.start)
  const lastWord = inside[Math.min(inside.length - 1, (after < 0 ? inside.length : after) - 1 + AROUND)]
  let to = Math.max(lastWord ? lastWord.start + lastWord.text.length : h.end, h.end)
  // A sentence's closing mark belongs to it.
  if (/^[\s.,!?…]*$/.test(t.slice(to, hi))) to = hi
  const pre = from > lo ? '…' : ''
  const post = to < hi ? '…' : ''
  return { text: `${pre}${t.slice(from, to)}${post}`, start: pre.length + h.start - from, end: pre.length + h.end - from }
}

/**
 * Up to three short stretches of a message for each habit: a few words either
 * side of what code found, and the passages the model quoted, whole.
 */
export function snippetsOf(text: string, counted: readonly Counted[], quoted: readonly { id: string; text: string }[]): Record<string, Snippet[]> {
  const t = normalize(text)
  const words = wordsAt(t)
  const sentences = sentencesAt(t)
  const found: Record<string, Snippet[]> = {}
  for (const c of counted) {
    const hits = c.find(t, words, sentences).sort((a, b) => a.start - b.start).slice(0, 3)
    if (hits.length > 0) found[c.id] = hits.map(h => around(t, words, sentences, h))
  }
  for (const q of quoted) {
    const list = (found[q.id] ??= [])
    if (list.length < 3) list.push({ text: q.text, start: 0, end: q.text.length })
  }
  return found
}

/** The message's start, kept for the weekly view's best message: a sentence or two, at most 200 characters. */
export function excerptOf(text: string, max = 200): string {
  const t = normalize(text)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))}…`
}

/** The local calendar day of a time, as YYYY-MM-DD. */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toUsage(v: unknown): Usage | null {
  if (typeof v !== 'object' || v === null) return null
  const u = v as Record<string, unknown>
  const n = (x: unknown) => (typeof x === 'number' ? x : 0)
  return { input: n(u.input), output: n(u.output), cacheRead: n(u.cacheRead), cacheWrite: n(u.cacheWrite) }
}

/** A stored record as a Rec, whichever version of 2fer kept it, or undefined when it is none. */
export function toRec(v: unknown): Rec | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const r = v as Record<string, unknown>
  if (typeof r.words !== 'number') return undefined
  const obj = (x: unknown) => (typeof x === 'object' && x !== null ? (x as Record<string, never>) : undefined)
  return {
    words: r.words,
    // Earlier versions kept the scores as grades, and only the fillers and hedges they found.
    scores: obj(r.scores) ?? obj(r.grades) ?? {},
    tallies: obj(r.tallies) ?? { fillers: obj(r.fillers) ?? {}, hedging: obj(r.hedges) ?? {} },
    ...(obj(r.places) ? { places: obj(r.places) } : {}),
    tip: typeof r.tip === 'string' ? r.tip : '',
    model: typeof r.model === 'string' ? r.model : 'sonnet',
    usage: toUsage(r.usage),
  }
}

/** A stored quote record as Quotes, or undefined when it is none. */
export function toQuotes(v: unknown): Quotes | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const q = v as Record<string, unknown>
  if (typeof q.excerpt !== 'string') return undefined
  const obj = (x: unknown) => (typeof x === 'object' && x !== null ? (x as Record<string, never>) : {})
  return { excerpt: q.excerpt, snippets: obj(q.snippets), notes: obj(q.notes) }
}
