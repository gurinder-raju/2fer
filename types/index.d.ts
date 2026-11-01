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

/** Which model scores the notes, by its id in hooks/catalog.ts ('none' for counts only), and whether notes are paused. */
export type Settings = {
  model: string
  paused?: boolean
}

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
  /** True when the model gave no usable answer, so the note holds only what code counted. */
  unanswered?: boolean
}

/** Where a counted habit's word fell: opening the message, starting a later sentence, ending one, or in the middle. */
export type Place = 'opener' | 'start' | 'end' | 'middle'

/** A short stretch of a message, and where the words to mark sit in it. */
export type Snippet = { text: string; start: number; end: number }

/** What 2fer keeps of a message's own words, for seven days: a short excerpt, the snippets each habit was found in, and what the model said of them. */
export type Quotes = {
  excerpt: string
  snippets: Record<string, Snippet[]>
  /** The model's note on each judged category, in its words, which may quote the message. */
  notes: Record<string, string>
  /** The 2fer the model gave, in its words, which may quote the message too. */
  tip: string
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
  tokens: number
}

/** The week's best-scored message, as its excerpt keeps it. */
export type Best = { excerpt: string; at: number; average: number; scored: number; allFive: boolean }

/** What the weekly view shows, worked out when it opens. */
export type Weekly = {
  today: string
  /** Up to 26 weeks, the oldest first; the last ends today. */
  weeks: Week[]
  /** What the latest week's kept words show: each habit's examples, the best message, and its 2fers, the oldest first. */
  kept: { examples: Record<string, Snippet[]>; best: Best | null; tips: string[] }
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
    }
  }
}
