// What 2fer keeps in $.state. When Note's or Weekly's fields change, change
// that atom's shape tag in hooks/register.tsx, so a reload declines old values.

/** A score out of 5, higher is better: 5 is nothing to fix, 1 loses the listener; 0 is not scored yet. */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5

/** What one note's model call used, in tokens, as the call reported it. */
export type Usage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** Which model scores the notes, by its id in hooks/catalog.ts ('none' for counts only). */
export type Settings = {
  model: string
}

/** A reading of the 5-hour window: how full it was, and what the session had spent by then, in dollars at list prices. */
export type Reading = { percent: number; usd: number }

export type Note = {
  status: 'pending' | 'done'
  /** When the message was sent, in milliseconds since the epoch. */
  at: number
  /** The message as 2fer read it, kept for this session only, for the session pane. */
  text: string
  words: number
  sentences: number
  /** Each scored category's score, by its id. */
  scores: Record<string, Grade>
  /** The line beside each scored category's pill. */
  details: Record<string, string>
  /** The passages the model copied out for each judged category that marks them in the message. */
  marks: Record<string, string[]>
  before: string
  after: string
  tip: string
  skeleton: string
  model: string
  usage: Usage | null
  /** About how much of the 5-hour limit the note used, in percent; absent until there is a reading to go on. */
  share?: number
}

/** Where a counted habit's word fell: opening the message, starting a later sentence, ending one, or in the middle. */
export type Place = 'opener' | 'start' | 'end' | 'middle'

/** A short stretch of a message, and where the words to mark sit in it. */
export type Snippet = { text: string; start: number; end: number }

/** What 2fer keeps of a message's own words, for 14 days: a short excerpt, and the snippets each habit was found in. */
export type Quotes = {
  excerpt: string
  snippets: Record<string, Snippet[]>
  /** The model's note on each judged category, in its words, which may quote the message. */
  notes: Record<string, string>
}

/** Seven days of notes, added up. */
export type Week = {
  /** The first and last day it covers, as YYYY-MM-DD, and its label: "Oct 23". */
  from: string
  to: string
  label: string
  messages: number
  words: number
  /** Each category's average score over the week's notes that scored it. */
  scores: Record<string, number>
  /** How many of the week's notes gave each score, 1 to 5 in that order, by category. */
  grades: Record<string, number[]>
  /** The words each counted category found, and how often. */
  tallies: Record<string, Record<string, number>>
  /** Where those words fell, by category and word. */
  places: Record<string, Record<string, Partial<Record<Place, number>>>>
  /** How many of the week's messages each counted category found anything in. */
  present: Record<string, number>
  tips: string[]
  tokens: number
  /** What those tokens come to at list prices, to weigh them against the 5-hour limit. */
  cost: number
}

/** The week's best-scored message, as its excerpt keeps it. */
export type Best = { excerpt: string; at: number; average: number; scored: number; allFive: boolean }

/** What the weekly view shows, worked out when it opens. */
export type Weekly = {
  today: string
  /** Up to 26 weeks, the oldest first; the last ends today. */
  weeks: Week[]
  /** For the two weeks quotes are kept for, by how many weeks back: each habit's examples, and the best message. */
  kept: { back: number; examples: Record<string, Snippet[]>; best: Best | null }[]
  /** What a point of the 5-hour window is worth, once a note has worked it out. */
  worth?: number
}

/** Which week the view shows, which habit is picked, how far back the chart reaches, and whether it shows a table. */
export type WeekView = { back: number; habit: string; earlier: number; table: boolean }

/** A judged habit's pattern over a week, as the model summed it up. */
export type Pattern = { status: 'pending' | 'done' | 'none'; main: string; practice: string }

declare module 'claude-code' {
  interface PluginState {
    '2fer': {
      notes: Shaped<Record<string, Note>>
      /** The note whose card a click opened, by its key; empty when none is open. */
      opened: string
      /** The habit the session pane is narrowed to, by its category id; empty for every message. */
      focus: string
      weekly: Shaped<Weekly | null>
      view: WeekView
      /** Judged habits' weekly patterns, by "<first day>:<category id>". */
      patterns: Record<string, Pattern>
      prefs: Settings
      /** The 5-hour window's first reading in this session, or since it last reset. */
      reading: Reading | null
    }
  }
}
