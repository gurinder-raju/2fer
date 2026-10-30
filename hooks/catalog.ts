// The six habits 2fer coaches, and the models it can coach with. Every habit
// is named for what goes wrong and scored out of 5, higher is better. Counted
// ones are found in code, for free; judged ones are scored by the model.

import type { Settings } from '../types'
import type { Counts } from './speech'

/** One place code found a word habit: what it found, and where it sits in the normalized message. */
export type Hit = { name: string; start: number; end: number }
/** A word or a sentence of the normalized message, and where it starts. */
export type Piece = { text: string; start: number }
/**
 * How a category's words are marked in a message, in the session pane and
 * the weekly examples: a see-through tint behind them where the surface
 * draws one (with a theme color for the terminal's ink), or an underline.
 */
export type Style = { tint: string; ink: string } | { underline: true }

type Phrases = readonly (readonly [string, RegExp])[]

export type Counted = {
  kind: 'count'
  id: string
  name: string
  /** The name on a pill: a word or two. */
  short: string
  /** One line for the settings pane: what it catches. */
  about: string
  /** How its words are marked in a message; left plain when absent. */
  style?: Style
  /** One thing to try next week, for the weekly view. */
  practice: string
  find: (text: string, words: readonly Piece[], sentences: readonly Piece[]) => Hit[]
}

export type Judged = {
  kind: 'judge'
  id: string
  name: string
  short: string
  about: string
  /** How the passages the model copies are marked in a message; left plain when absent. */
  style?: Style
  /** Which passages the model copies out, word for word, for the marks. */
  quote?: string
  /** One thing to try next week, for the weekly view, until the model sums up a week of notes. */
  practice: string
  /** What the model looks for. */
  rubric: string
  /** What the model writes under the heading. */
  note: string
  /** What code counted that bears on it: given to the model, and shown under the heading. */
  hint?: (c: Counts) => string
}

export type Category = Counted | Judged

function hitsOf(name: string, text: string, rx: RegExp): Hit[] {
  return [...text.matchAll(rx)].map(m => ({ name, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
}

function phrases(list: Phrases): Counted['find'] {
  return text => list.flatMap(([name, rx]) => hitsOf(name, text, rx))
}

/** How often each thing was found, in the order it was first found. */
export function countOf(hits: readonly Hit[]): Record<string, number> {
  const found: Record<string, number> = {}
  for (const h of hits) found[h.name] = (found[h.name] ?? 0) + 1
  return found
}

// "like" is a filler unless the words beside it make it a verb or a
// comparison: "I like", "looks like", "like this".
const LIKE_BEFORE = new Set([
  'would', "i'd", "you'd", "we'd", "they'd", 'i', 'you', 'we', 'they', 'people',
  'feel', 'feels', 'felt', 'look', 'looks', 'looked', 'seem', 'seems', 'seemed',
  'sound', 'sounds', 'something', 'anything', 'nothing', 'just', 'more', 'less',
  'really', "don't", "didn't", "doesn't", 'do', 'does', 'not',
])
const LIKE_AFTER = new Set(['this', 'that', 'these', 'those', 'to', 'it', 'him', 'her', 'them', 'me', 'us'])

const FILLERS: Phrases = [
  ['uh / um', /\b(?:u+m+|u+h+|e+rm+)\b/gi],
  ['you know', /\byou know\b(?! (?:what|how|why|that|if|when|where|who|about|the)\b)/gi],
  ['basically', /\bbasically\b/gi],
  ['actually', /\bactually\b/gi],
  ['literally', /\bliterally\b/gi],
  ['I mean', /\bI mean\b/gi],
  ['and stuff', /\band (?:stuff|everything|all that|whatnot)\b/gi],
  ['yeah', /\b(?:so|but|and) yeah\b/gi],
]

function fillers(text: string, words: readonly Piece[], sentences: readonly Piece[]): Hit[] {
  const at = (i: number) => words[i]?.text.toLowerCase() ?? ''
  const like = words.flatMap((w, i) =>
    at(i) === 'like' && !LIKE_BEFORE.has(at(i - 1)) && !LIKE_AFTER.has(at(i + 1))
      ? [{ name: 'like', start: w.start, end: w.start + w.text.length }]
      : [],
  )
  // A tag question, whether dictation wrote it "right?" or as its own "Right."
  const right = [
    ...hitsOf('right?', text, /\bright\?/gi),
    ...sentences.filter(s => /^right\.$/i.test(s.text)).map(s => ({ name: 'right?', start: s.start, end: s.start + 5 })),
  ]
  // "Okay" when it opens a sentence: a warm-up before the point.
  const okay = sentences.flatMap(s => {
    const m = /^ok(?:ay)?\b/i.exec(s.text)
    return m ? [{ name: 'okay', start: s.start, end: s.start + m[0].length }] : []
  })
  return [...like, ...right, ...okay, ...phrases(FILLERS)(text, words, sentences)]
}

export const CATEGORIES: readonly Category[] = [
  {
    kind: 'count',
    id: 'fillers',
    name: 'Usage of fillers',
    short: 'Fillers',
    about: 'Words that carry no meaning: like, you know, I mean, basically, actually, right?, an opening “Okay”.',
    practice: 'Pause where the filler would go. A beat of silence sounds surer than a filler.',
    style: { tint: '#EB683433', ink: 'warning' },
    find: fillers,
  },
  {
    kind: 'count',
    id: 'hedging',
    name: 'Hedging',
    short: 'Hedging',
    about: 'Softeners that make a view sound unsure: I think, maybe, probably, I guess, kind of, a little bit, something like that.',
    practice: 'Say your view plainly first, then give the reason; keep “I think” for real doubt.',
    style: { tint: '#2A78D62E', ink: 'suggestion' },
    // "Kind of" is a noun after "what kind of" or "this kind of", and not counted there.
    find: phrases([
      ['I think', /\bI think\b/gi],
      ['maybe', /\bmaybe\b/gi],
      ['probably', /\bprobably\b/gi],
      ['I guess', /\bI guess\b/gi],
      ['I feel like', /\bI feel like\b/gi],
      ['a little bit', /\ba little bit\b/gi],
      ['kind of', /\b(?<!\b(?:what|which|this|that|these|those|some|any|the|a|one|every|each|same|different) )(?:kind|sort) of\b/gi],
      ['something like that', /\b(?:or )?something like that\b|\bor something\b/gi],
    ]),
  },
  {
    kind: 'judge',
    id: 'sentences',
    name: 'Incomplete sentences',
    short: 'Incomplete',
    about: 'Dropping an explanation partway and starting again a different way, without saying so.',
    practice: 'When you change course, say so: “let me put that another way”.',
    style: { underline: true },
    quote: 'each dropped attempt or opening said twice',
    rubric: `the speaker starts to explain something, drops it partway, and starts again a different way without saying so, which leaves the listener wondering what happened to the first attempt. An opening said twice ("we could, we could") is a small slip. A restart the speaker announces ("let me put it another way") is fine.`,
    note: 'one sentence saying what the speaker started to say, where they broke off, and how they started again, quoting the words exactly in “curly quotes”; for example: You start with “But the server”, break off for “when it restarts”, then start again with “it rebuilds”. Or an empty string',
  },
  {
    kind: 'judge',
    id: 'repetition',
    name: 'Unnecessary repetition',
    short: 'Repetition',
    about: 'The same point or ask made again later in the message, without adding anything. A summary at the end is fine.',
    practice: 'Make each point once, then move on. Save the repeat for a short summary at the end.',
    style: { tint: '#6250D62E', ink: 'merged' },
    quote: 'each passage that makes a point you counted as repeated, the first time included, but not a closing summary',
    rubric: 'judge the whole message. Look for the same point or ask made again later, in the same or other words, without adding anything for the listener. A repeat that serves the listener is no slip: a closing summary that restates the point or ask, or a point put again in other words, on purpose, so that it lands ("in other words", "to be clear"). Count a repeat that adds nothing, such as circling back mid-message to a point already made, unmarked, or making it again and again. A word said twice in a row is a stumble, not repetition.',
    note: 'one sentence naming the point said again without need, and how many times, or an empty string',
  },
  {
    kind: 'judge',
    id: 'transitions',
    name: 'Unclear transitions',
    short: 'Transitions',
    about: 'Moving to the next idea without saying how it relates, or starting a list and not finishing it. An idea that comes to you as you speak is fine.',
    practice: 'Before a new idea, say how it connects: because, but, for example, the second thing.',
    style: { tint: '#1BAF7A33', ink: 'planMode' },
    quote: 'the words that make each jump you counted, such as an opening “And so”',
    rubric: `moving to the next idea without saying how it relates to the last. The usual sign is a sentence that opens with a word carrying no meaning, such as "So", "And", "Like" or "Right?", where a connector that names the relation belongs: "because", "but", "for example", "which means", "the second thing". A list that is started and never finished ("The first one is…" with no second) counts too. Count a jump only when the relation was there to be said: the next item of a list they planned, or a reason, contrast or example they knew and joined with a word that names nothing. A turn to an idea that came to them as they spoke is the shape of thinking aloud, not a slip, even with no connector: such an idea is sparked by something just said, or comes with words that mark it as new, such as "actually", "oh, and" or "that reminds me".`,
    note: 'one sentence on the jump that most needs a connector, naming the connector to use, or an empty string',
    hint: c => (c.openers > 0 ? `${c.openers} of ${c.sentences} sentences open with So, And, Like or Right.` : ''),
  },
  {
    kind: 'judge',
    id: 'point',
    name: 'Buried point',
    short: 'Buried point',
    about: 'The main point or request waits behind a long setup, so the listener wonders where it is going. A little context first is fine, and so is a point that comes to you as you speak.',
    practice: 'Give the context in a sentence or two, then say what you want before the setup runs on.',
    style: { tint: '#EDA10040', ink: 'claude' },
    quote: 'the sentence that carries the main point or ask',
    rubric: `whether the listener can tell what the message is for before the setup wears thin. People set the context and are polite before they ask, so a sentence or two of context or courtesy first is natural and no slip: in a message of four sentences or fewer, a point by the third sentence is a 5. Nor is a point buried when it came to them as they spoke: no one can say first what they have not thought of yet. Tell the two apart from the message. A point held back shows in setup aimed at it, such as background that matters only because of the ask, or an opening that promises it ("I have a question"). A point that formed as they spoke is where the message's own reasoning led, such as weighing options out loud and then deciding, or it comes with words that mark a new thought, such as "actually", "oh, and" or "now that I think about it". Score lower only when a point they had in mind waits behind setup long enough that a listener would wonder where it is going: 4 when it waits behind several sentences of setup, 3 when it comes after most of a long message, and 2 when it comes only at the end of a long message. A message whose point never comes clearly is a 1, however it formed.`,
    note: 'one sentence naming the main point or ask and where it arrives, or an empty string when it arrives in good time or came to them as they spoke',
  },
]

export const isCounted = (c: Category): c is Counted => c.kind === 'count'
export const isJudged = (c: Category): c is Judged => c.kind === 'judge'

/** A model a note can be scored with: the id settings keep, the model it asks for, and its API list price in dollars per million tokens (October 2026), which weighs a note against the plan's limit. */
export type Model = {
  id: string
  name: string
  /** The full model id each request names, so a setting means one model; null for no model. */
  model: string | null
  about: string
  price: { input: number; output: number; cacheRead: number; cacheWrite: number } | null
}

export const MODELS: readonly Model[] = [
  {
    id: 'opus',
    name: 'Opus 5.5',
    model: 'claude-opus-5-5',
    about: 'The default, and the most careful judge.',
    price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
  {
    id: 'sonnet',
    name: 'Sonnet 5.5',
    model: 'claude-sonnet-5-5',
    about: 'Balanced: about half of what Opus uses.',
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  },
  {
    id: 'haiku',
    name: 'Haiku 5.5',
    model: 'claude-haiku-5-5',
    about: 'The lightest: about a fortieth of what Opus uses, and it may judge less finely.',
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
  {
    id: 'none',
    name: 'No model',
    model: null,
    about: 'Word counts only, and none of your limit: fillers and hedging, with no rewrite and no 2fer.',
    price: null,
  },
]

export const DEFAULTS: Settings = { model: 'opus' }

/** Settings as stored, with the default model for one that is missing or that the catalog no longer has. */
export function toSettings(v: unknown): Settings {
  const s = typeof v === 'object' && v !== null ? (v as Partial<Settings>) : {}
  return {
    model: MODELS.some(m => m.id === s.model) ? (s.model as string) : DEFAULTS.model,
    ...(s.paused === true ? { paused: true } : {}),
  }
}
