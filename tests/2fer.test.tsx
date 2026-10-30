import { expect, mock, test } from 'claude-code/testing'

import { CATEGORIES, isCounted } from '../hooks/catalog'
import { countGrade, countSpeech, dayOf, isSpeech, keyOf, percentOf, placesOf, pointWorth, quotesOf, runsOf, snippetsOf } from '../hooks/speech'

// Made up, in the shape dictation writes: a restart, a filler, two hedges.
const SAID =
  'So I want to change the cache. You should, we could keep like a copy on each server or something like that. ' +
  'And if a server restarts, it can rebuild the copy, right? And the main thing is kind of to keep the database calm.'
// Made up too: the point first, one ask, and a reason.
const CLEAN =
  'Yes, refresh ahead of time. Use a sixty second window. Then add a test for the request that starts just before expiry, because that is the case that broke.'

const REVIEW = {
  scores: { sentences: 3, repetition: 5, transitions: 2, point: 4 },
  notes: {
    sentences: '“You should, we could”',
    repetition: '',
    transitions: 'The most important point comes last.',
    point: 'The ask comes in the last sentence.',
  },
  // The passages the model copies out, word for word, so they can be marked where they were said.
  marks: {
    sentences: ['You should, we could'],
    repetition: [],
    transitions: ['And if a server restarts'],
    point: ['And the main thing is kind of to keep the database calm.'],
  },
  before: 'You should, we could keep like a copy on each server or something like that.',
  after: 'Keep a copy on each server.',
  tip: 'Say the main point first.',
  skeleton: '',
}

const CLEAN_REVIEW = {
  scores: { sentences: 5, repetition: 5, transitions: 5, point: 5 },
  notes: { sentences: '', repetition: '', transitions: '', point: '' },
  marks: {},
  before: '',
  after: '',
  tip: 'Point first, one ask, and a reason. Keep doing this.',
  skeleton: '',
}

const USAGE = { input_tokens: 180, output_tokens: 450, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 }
const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 29, 18)
const COUNTED = CATEGORIES.filter(isCounted)

const ROW = {
  plugin: '2fer',
  component: 'UserMessage',
  requestId: 'm1',
  props: { text: SAID, origin: { kind: 'composer' }, isExpanded: true },
} as const

const PANE = {
  plugin: '2fer',
  component: 'Pane',
  requestId: '2fer',
  props: {
    title: '2fer',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const SETTINGS_PANE = { ...PANE, requestId: '2fer-settings', props: { ...PANE.props, title: '2fer settings' } } as const
const SESSION_PANE = { ...PANE, requestId: '2fer-session', props: { ...PANE.props, title: 'This session' } } as const

test('the counts and the marks come from code, and only dictated prose is reviewed', () => {
  const c = countSpeech(SAID, COUNTED)
  expect(c.sentences).toBe(4)
  expect(c.openers).toBe(3)
  expect(c.tallies.fillers).toEqual({ like: 1, 'right?': 1 })
  expect(c.tallies.hedging).toEqual({ 'kind of': 1, 'something like that': 1 })
  expect(countGrade(c.tallies.fillers, c.words)).toBe(2)
  expect(countGrade({}, 15)).toBe(5)
  expect(countSpeech("Okay, let's test it. But yeah, that's it. Is that okay with you?", COUNTED).tallies.fillers).toEqual({ okay: 1, yeah: 1 })
  expect(
    countSpeech('I think we should maybe ship it, or something like that, but I guess a little bit later. What kind of build is it?', COUNTED)
      .tallies.hedging,
  ).toEqual({ 'I think': 1, maybe: 1, 'I guess': 1, 'a little bit': 1, 'something like that': 1 })

  // The marks fall where code found the habits, and where the model quoted a restart.
  const runs = runsOf(SAID, COUNTED, [{ text: 'You should, we could', id: 'sentences' }])
  expect(runs.map(r => r.text).join('')).toBe(SAID)
  expect(runs.filter(r => r.marks.length > 0).map(r => `${r.text} | ${r.marks.join('+')}`)).toEqual([
    'You should, we could | sentences',
    'like | fillers',
    'or something like that | hedging',
    'right? | fillers',
    'kind of | hedging',
  ])
  // Where each habit's words fell, and the few words either side the weekly view keeps for two weeks.
  const places = placesOf(SAID, COUNTED)
  expect(places.fillers).toEqual({ like: { middle: 1 }, 'right?': { end: 1 } })
  expect(places.hedging).toEqual({ 'something like that': { end: 1 }, 'kind of': { middle: 1 } })
  const [like, right] = snippetsOf(SAID, COUNTED, []).fillers ?? []
  expect(like?.text).toBe('You should, we could keep like a copy on each server or…')
  expect(like?.text.slice(like.start, like.end)).toBe('like')
  expect(right?.text).toBe('…restarts, it can rebuild the copy, right?')
  expect(snippetsOf(SAID, COUNTED, [{ id: 'sentences', text: 'You should, we could' }]).sentences).toEqual([{ text: 'You should, we could', start: 0, end: 20 }])
  expect(quotesOf('“you can look at the token code, you should look at…” · “But the server”')).toEqual([
    'you can look at the token code, you should look at',
    'But the server',
  ])

  expect(isSpeech(SAID)).toBe(true)
  expect(isSpeech(CLEAN)).toBe(true)
  expect(isSpeech('Yes, do it.')).toBe(false)
  // A pasted post in styled letters reads as prose, but nobody dictated it.
  const post = 'Here is what our team learned this week about shipping small changes often and reviewing them early.'
  expect(isSpeech(`Weekly Notes. ${post}`)).toBe(true)
  expect(isSpeech(`𝗪𝗲𝗲𝗸𝗹𝘆 𝗡𝗼𝘁𝗲𝘀. ${post}`)).toBe(false)
  expect(isSpeech('one thing that i have been pondering is how i can get better at public speaking this year')).toBe(false)
  // "i.e." is no sign of typing, though a lone lowercase "i" is.
  expect(isSpeech('Keep the cache small, i.e. one copy on each server, and add a test for the case that broke.')).toBe(true)
})

test('a dictated message gets the 2fer mark: the pointer shows its pills, and a press opens its card under the message', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const asked: { model: string; system?: string; prompt: string; effort?: string }[] = []
  on('model.complete', (_, e) => {
    asked.push({ model: e.model, system: e.system, prompt: e.prompt, effort: e.effort })
    return { value: { isAnswered: true, text: JSON.stringify(REVIEW), usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  // Stands for the engine's own row, which the mark is drawn under.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the row</Text>
  })

  // The desktop app sends the person's prompts as its SDK host.
  await $.prompt.submit({ text: SAID, origin: { kind: 'sdk' } })
  await clock.settle()
  expect(asked.length).toBe(1)
  expect(asked[0].model).toBe('claude-opus-5-5')
  expect(asked[0].effort).toBe('medium')
  expect(asked[0].prompt).toContain('<message>')
  // The model scores the four judged habits; code counts the other two.
  expect(asked[0].system).toContain('Score 4 things out of 5')
  expect(asked[0].system).toContain('sentences, for incomplete sentences')
  expect(asked[0].system).toContain('"tip": "the 2fer:')
  // Context and courtesy before an ask are no slip: the practice is for talking with people.
  expect(asked[0].system).toContain('a sentence of context or courtesy before an ask is natural, and no slip in any category')
  expect(asked[0].system).toContain('in a message of four sentences or fewer, a point by the third sentence is a 5')
  // They think as they talk: a late point, an abrupt turn or a repeat is a slip only when it is a fault in how it was said.
  expect(asked[0].system).toContain('work out from the message which it is: a fault in how they said what they already had in mind, the natural shape of a thought forming as they spoke, or a repeat that helps the listener')
  expect(asked[0].system).toContain('Nor is a point buried when it came to them as they spoke')
  expect(asked[0].system).toContain('A turn to an idea that came to them as they spoke is the shape of thinking aloud, not a slip')
  expect(asked[0].system).toContain('A repeat that serves the listener is no slip: a closing summary that restates the point or ask')
  expect(asked[0].system).toContain('"repetition": [up to 3 passages copied word for word from the message: each passage that makes a point you counted as repeated, the first time included, but not a closing summary')
  // An incomplete sentence's note says what broke off, not just where.
  expect(asked[0].system).toContain('where they broke off, and how they started again')
  // The judged habits that mark the message ask for their passages word for word.
  expect(asked[0].system).toContain('"point": [up to 3 passages copied word for word from the message: the sentence that carries the main point or ask')

  const key = keyOf(SAID)
  const mark = `2fer-${key}`
  const notice = await $.ui.mount({ ...ROW, props: { ...ROW.props, origin: { kind: 'task-notification' } }, surface: 'desktop' })
  expect(await notice.find({ key: mark })).toBeUndefined()
  await notice.unmount()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...ROW, surface })
    const text = async (rx: RegExp) => (await ui.find({ type: 'Text', text: rx }))?.text
    const peek = async () => ui.find({ type: 'Box', text: /^2Fillers2Hedging3Incomplete5Repetition2Transitions4Buried point$/ })
    expect(await text(/^the row$/)).toBe('the row')
    // Under the message, the mark alone; the card waits for a press.
    const shown = await ui.find({ key: mark })
    expect(shown?.text).toBe(surface === 'terminal' ? '2fer' : '⚭')
    expect(shown?.props.label).toBe(shown?.text)
    expect(await text(/^Out of 5/)).toBeUndefined()
    if (surface === 'desktop') {
      // The pointer on the mark shows every score as a pill, in the card's order, floating over the foot of the message.
      expect((await peek())?.props.display).toBe('none')
      expect((await peek())?.props.bottom).toBe(1)
      // Its hover scope is the keyed Box around the mark.
      expect(await ui.find({ key: `2fer-hover-${key}` })).toBeDefined()
      // The kit reads a box's texts end to end; the surface draws the pills apart.
      expect((await peek())?.text).toBe('2Fillers2Hedging3Incomplete5Repetition2Transitions4Buried point')
      // Its pills wear the session pane's marks: each habit's tint, and the underline for Incomplete.
      expect((await ui.find({ type: 'Box', text: /^2Fillers$/ }))?.props.backgroundColor).toBe('#EB683433')
      expect((await ui.find({ type: 'Box', text: /^4Buried point$/ }))?.props.backgroundColor).toBe('#EDA10040')
      expect((await ui.find({ type: 'Text', text: /^Incomplete$/ }))?.props.underline).toBe(true)
    } else {
      expect(await peek()).toBeUndefined()
    }

    // A press opens the card right under the message.
    await ui.press({ key: mark })
    expect(await peek()).toBeUndefined()
    // The card's pills wear the same marks: the tint where the surface draws one, else the tint's ink.
    // A pill sits in a box that holds its column, so both read "2Fillers".
    if (surface === 'desktop') expect((await ui.findAll({ type: 'Box', text: /^2Fillers$/ })).map(b => b.props.backgroundColor)).toContain('#EB683433')
    else expect((await ui.find({ type: 'Text', text: /^Fillers$/ }))?.props.color).toBe('warning')
    expect((await ui.find({ type: 'Text', text: /^Incomplete$/ }))?.props.underline).toBe(true)
    expect(await text(/ · 45 words$/)).toMatch(/^\d{1,2}:\d{2} · 45 words$/)
    expect(await text(/^“So I want/)).toMatch(/^“So I want to change the cache\. You should, we could keep like .*…”$/)
    expect(await text(/^Out of 5/)).toBe('Out of 5, higher is better')
    // Each scored category is a pill, its score ahead of its name, with its line beside it.
    for (const name of ['Fillers', 'Hedging', 'Incomplete', 'Repetition', 'Transitions', 'Buried point']) {
      expect(await text(new RegExp(`^${name}$`))).toBe(name)
    }
    expect(await text(/^like/)).toBe('like, right?')
    expect(await text(/^kind of/)).toBe('kind of, something like that')
    expect(await text(/^“You should, we could”$/)).toBe('“You should, we could”')
    expect(await text(/^The most important/)).toBe('The most important point comes last. 3 of 4 sentences open with So, And, Like or Right.')
    expect(await text(/^2fer$/)).toBe('2fer')
    expect(await text(/^Say the main point/)).toBe('Say the main point first.')
    expect(await text(/^“Keep a copy/)).toBe('“Keep a copy on each server.”')
    // What the note itself used, as the model call reported it.
    expect(await text(/^Opus 5\.5 ·/)).toBe('Opus 5.5 · 1,630 tokens')
    expect((await ui.find({ key: `2fer-session-${key}` }))?.text).toBe('This session ›')

    // The close mark puts it away again.
    await ui.press({ key: `2fer-close-${key}` })
    expect(await text(/^Out of 5/)).toBeUndefined()
    await ui.unmount()
  }
})

test('the settings choose the model', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, { settings: { model: 'haiku' } })
  const asked: { model: string; system?: string }[] = []
  on('model.complete', (_, e) => {
    asked.push({ model: e.model, system: e.system })
    return { value: { isAnswered: true, text: JSON.stringify(REVIEW), usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the row</Text>
  })

  await $.prompt.submit({ text: SAID, origin: { kind: 'sdk' } })
  await clock.settle()
  expect(asked[0].model).toBe('claude-haiku-5-5')
  // Every note scores the same six habits.
  for (const id of ['sentences', 'repetition', 'transitions', 'point']) expect(asked[0].system).toContain(`${id}, for `)

  const key = keyOf(SAID)
  const ui = await $.ui.mount({ ...ROW, surface: 'desktop' })
  await ui.press({ key: `2fer-${key}` })
  const text = async (rx: RegExp) => (await ui.find({ type: 'Text', text: rx }))?.text
  expect(await text(/^Fillers$/)).toBe('Fillers')
  expect(await text(/^Buried point$/)).toBe('Buried point')
  expect(await text(/^Haiku 5\.5 ·/)).toBe('Haiku 5.5 · 1,630 tokens')
  await ui.unmount()
})

test('a note shows about how much of the 5-hour limit it used, once the window has moved enough to tell', async ($, on) => {
  // One point may be rounding, and a window that reset says nothing.
  expect(pointWorth({ percent: 10, usd: 1 }, { percent: 11, usd: 2 })).toBeUndefined()
  expect(pointWorth({ percent: 10, usd: 1 }, { percent: 12, usd: 2 })).toBe(0.5)
  expect(pointWorth({ percent: 90, usd: 1 }, { percent: 2, usd: 3 })).toBeUndefined()
  expect(['under 0.01%', 'about 0.02%', 'about 0.3%', 'about 1%']).toEqual([0.004, 0.0198, 0.34, 1.4].map(percentOf))

  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: JSON.stringify(REVIEW), usage: USAGE } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the row</Text>
  })
  // The plan reports only how full the whole window is; the session, what it has spent.
  let window: { percent: number; usd: number } | null = { percent: 10, usd: 1 }
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: {} as never,
      rateLimits: window ? [{ kind: 'five_hour', percentUsed: window.percent }] : [],
      ...(window ? { cost: { usd: window.usd } } : {}),
    },
  }))
  const footOf = async (said: string) => {
    await $.prompt.submit({ text: said, origin: { kind: 'sdk' } })
    await clock.settle()
    const ui = await $.ui.mount({ ...ROW, props: { ...ROW.props, text: said }, surface: 'desktop' })
    await ui.press({ key: `2fer-${keyOf(said)}` })
    const foot = (await ui.find({ type: 'Text', text: /^Opus 5\.5 ·/ }))?.text
    await ui.unmount()
    return foot
  }

  // The first note has only a reading to start from.
  expect(await footOf(SAID)).toBe('Opus 5.5 · 1,630 tokens')
  // Two points for a dollar: a point is worth 50 cents, and the note about one cent at list prices.
  window = { percent: 12, usd: 2 }
  expect(await footOf(`${SAID} Okay so that is the whole plan.`)).toBe('Opus 5.5 · 1,630 tokens · about 0.02% of your 5-hour limit')
  // A new window starts its reading over, and keeps what a point was worth.
  window = { percent: 1, usd: 3 }
  expect(await footOf(`${SAID} Okay so that is the plan we want.`)).toBe('Opus 5.5 · 1,630 tokens · about 0.02% of your 5-hour limit')
  // Other sessions filling the window make a point look cheap, so a lower reading changes nothing.
  window = { percent: 5, usd: 3.2 }
  expect(await footOf(`${SAID} Okay so that is the plan we like.`)).toBe('Opus 5.5 · 1,630 tokens · about 0.02% of your 5-hour limit')
  // An API key has no such window, whatever was worked out before.
  window = null
  expect(await footOf(`${SAID} Okay so that is the plan for now.`)).toBe('Opus 5.5 · 1,630 tokens')
})

test('with no model, a note has only the counted habits and costs nothing', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, { settings: { model: 'none' } })
  let calls = 0
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: true, text: JSON.stringify(REVIEW), usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the row</Text>
  })

  await $.prompt.submit({ text: SAID, origin: { kind: 'sdk' } })
  await clock.settle()
  expect(calls).toBe(0)

  const key = keyOf(SAID)
  const ui = await $.ui.mount({ ...ROW, surface: 'desktop' })
  await ui.press({ key: `2fer-${key}` })
  const text = async (rx: RegExp) => (await ui.find({ type: 'Text', text: rx }))?.text
  expect(await text(/^Fillers$/)).toBe('Fillers')
  expect(await text(/^Hedging$/)).toBe('Hedging')
  expect(await text(/^Incomplete$/)).toBeUndefined()
  expect(await text(/^2fer$/)).toBeUndefined()
  expect(await text(/^Word counts only/)).toBe('Word counts only, no model')
  await ui.unmount()
})

test('the settings pane and the command choose the model', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const asked: { model: string }[] = []
  on('model.complete', (_, e) => {
    asked.push({ model: e.model })
    return { value: { isAnswered: true, text: JSON.stringify(REVIEW), usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('command.register', () => ({ value: { command: '2fer' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await $.command.run({ command: '2fer', args: 'settings' })).text).toBe('Opened 2fer settings beside the chat.')
  expect((await $.command.run({ command: '2fer', args: 'session' })).text).toBe('Opened this session’s messages beside the chat.')
  const ui = await $.ui.mount({ ...SETTINGS_PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'model-opus' }))?.text).toBe('● Opus 5.5')
  expect(await ui.find({ type: 'Text', text: /^Categories$/ })).toBeUndefined()
  await ui.press({ key: 'model-haiku' })
  expect((await ui.find({ key: 'model-haiku' }))?.text).toBe('● Haiku 5.5')
  await ui.unmount()

  expect((await $.command.run({ command: '2fer', args: 'model sonnet' })).text).toContain('2fer now uses Sonnet 5.5.')
  expect((await $.command.run({ command: '2fer', args: 'model nonsense' })).text).toBe("2fer's models: opus, sonnet, haiku, none.")
  const again = await $.ui.mount({ ...SETTINGS_PANE, surface: 'terminal' })
  expect((await again.find({ key: 'model-sonnet' }))?.text).toBe('● Sonnet 5.5')
  await again.unmount()

  // The next note goes to the chosen model.
  await $.prompt.submit({ text: SAID, origin: { kind: 'sdk' } })
  await clock.settle()
  expect(asked.length).toBe(1)
  expect(asked[0].model).toBe('claude-sonnet-5-5')
})

test('short, typed and plugin-sent messages get no note', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  let calls = 0
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: true, text: JSON.stringify(REVIEW), usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.prompt.submit({ text: 'Yes, do it.', origin: { kind: 'composer' } })
  await $.prompt.submit({
    text: 'one thing that i have been pondering is how i can get better at public speaking this year',
    origin: { kind: 'composer' },
  })
  await $.prompt.submit({ text: SAID, origin: { kind: 'plugin', name: 'other' } })
  await $.prompt.submit({ text: SAID, origin: { kind: 'task-notification' } })
  await clock.settle()
  expect(calls).toBe(0)
})

test('when the model gives no usable answer, the note keeps the counts and says so', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: 'I cannot help with that.', usage: USAGE } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the row</Text>
  })

  await $.prompt.submit({ text: SAID, origin: { kind: 'composer' } })
  await clock.settle()

  const ui = await $.ui.mount({ ...ROW, surface: 'desktop' })
  await ui.press({ key: `2fer-${keyOf(SAID)}` })
  const text = async (rx: RegExp) => (await ui.find({ type: 'Text', text: rx }))?.text
  expect(await text(/^Fillers$/)).toBe('Fillers')
  expect(await text(/^Hedging$/)).toBe('Hedging')
  expect(await text(/^Incomplete$/)).toBeUndefined()
  expect(await text(/^Word counts only/)).toBe('Word counts only: Opus 5.5 didn’t answer')
  await ui.unmount()
})

test('/2fer pause stops notes until /2fer resume, and /2fer help lists the commands', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  let calls = 0
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: true, text: JSON.stringify(REVIEW), usage: USAGE } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('command.register', () => ({ value: { command: '2fer' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the row</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await $.command.run({ command: '2fer', args: 'pause' })).text).toBe('2fer is paused: no notes in any session, until /2fer resume.')
  await $.prompt.submit({ text: SAID, origin: { kind: 'sdk' } })
  await clock.settle()
  expect(calls).toBe(0)
  const paused = await $.ui.mount({ ...ROW, surface: 'desktop' })
  expect(await paused.find({ key: `2fer-${keyOf(SAID)}` })).toBeUndefined()
  await paused.unmount()

  // The settings pane says so, and its button resumes.
  const pane = await $.ui.mount({ ...SETTINGS_PANE, surface: 'desktop' })
  expect((await pane.find({ type: 'Text', text: /^Paused/ }))?.text).toBe('Paused in every session.')
  await pane.press({ key: 'pause' })
  expect((await pane.find({ key: 'pause' }))?.text).toBe('Pause')
  await pane.unmount()
  await $.prompt.submit({ text: SAID, origin: { kind: 'sdk' } })
  await clock.settle()
  expect(calls).toBe(1)

  expect((await $.command.run({ command: '2fer', args: 'pause' })).text).toContain('paused')
  expect((await $.command.run({ command: '2fer', args: 'resume' })).text).toBe('2fer is back on.')

  // Help, or a word it doesn't know, lists the commands instead of opening the week.
  for (const args of ['help', 'nonsense']) {
    const { text } = await $.command.run({ command: '2fer', args })
    expect(text).toContain('/2fer session')
    expect(text).toContain('/2fer pause')
  }
})

test('this session lists your messages in order, marked where the habits showed, under a top that stays put', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  on('model.complete', (_, e) => ({
    value: { isAnswered: true, text: JSON.stringify(e.prompt.includes('sixty second') ? CLEAN_REVIEW : REVIEW), usage: USAGE },
  }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.prompt.submit({ text: SAID, origin: { kind: 'sdk' } })
  await clock.settle()
  await clock.advance(7 * 60_000)
  await $.prompt.submit({ text: CLEAN, origin: { kind: 'sdk' } })
  await clock.settle()

  const ui = await $.ui.mount({ ...SESSION_PANE, surface: 'desktop' })
  const text = async (rx: RegExp) => (await ui.find({ type: 'Text', text: rx }))?.text
  expect(await text(/ · averages out of 5$/)).toMatch(/^2 messages · \d{1,2}:\d{2} to \d{1,2}:\d{2} · averages out of 5$/)
  // The pills at the top carry the session's averages.
  expect(await text(/^3\.5$/)).toBe('3.5')
  expect(await text(/^4\.5$/)).toBe('4.5')
  // The top rides at the window's first row, so it stays in view as the list scrolls.
  expect((await ui.find({ key: 'session-top' }))?.props.top).toBe(0)
  // The first message's habits are marked where they were said, in the pills' colors.
  expect((await ui.find({ type: 'Text', text: /^like$/ }))?.props.backgroundColor).toBe('#EB683433')
  expect((await ui.find({ type: 'Text', text: /^kind of$/ }))?.props.backgroundColor).toBe('#2A78D62E')
  expect((await ui.find({ type: 'Text', text: /^You should, we could$/ }))?.props.underline).toBe(true)
  // The judged habits are marked at the passages the model copied out, each in its own color.
  expect((await ui.find({ type: 'Text', text: /^And if a server restarts$/ }))?.props.backgroundColor).toBe('#1BAF7A33')
  expect((await ui.find({ type: 'Text', text: /^And the main thing is $/ }))?.props.backgroundColor).toBe('#EDA10040')
  // The pills at the top wear the same marks, and say so.
  expect(await text(/^Marks in your words/)).toBe('Marks in your words match these pills. Click a pill to see only the messages where that habit slipped.')
  // Each message has a line for every habit under 5, its pill beside the note that explains its mark.
  expect(await text(/ · 45 words$/)).toMatch(/^\d{1,2}:\d{2} · 45 words$/)
  expect(await text(/^like, right\?$/)).toBe('like, right?')
  expect(await text(/^The ask comes in the last sentence\.$/)).toBe('The ask comes in the last sentence.')
  expect((await ui.find({ type: 'Text', text: /^Incomplete$/ }))?.props.underline).toBe(true)
  expect(await text(/^Say it as:$/)).toBe('Say it as:')
  // A message with nothing to fix gets praise in place of the lines.
  expect(await text(/^All six at 5$/)).toBe('All six at 5')
  expect(await text(/^Transitions$/)).toBe('Transitions')
  // A pill narrows the list to the messages where its habit slipped, and says how many.
  expect((await ui.find({ key: 'focus-point' }))?.text).toBe('4.5 Buried point')
  await ui.press({ key: 'focus-point' })
  expect(await text(/^All six at 5$/)).toBeUndefined()
  expect(await text(/ where Buried point slipped$/)).toBe('1 of 2 messages where Buried point slipped')
  expect((await ui.find({ key: 'focus-point' }))?.text).toBe('✓ 4.5 Buried point')
  // Show all, or the same pill again, brings every message back.
  await ui.press({ key: 'focus-all' })
  expect(await text(/^All six at 5$/)).toBe('All six at 5')
  // A habit that never slipped this session says so.
  await ui.press({ key: 'focus-repetition' })
  expect(await text(/^No message this session/)).toBe('No message this session where Repetition slipped.')
  await ui.press({ key: 'focus-repetition' })
  expect(await text(/^All six at 5$/)).toBe('All six at 5')
  await ui.unmount()

  // Drawn again after a scroll, the top moves to the window's new first row.
  const scrolled = await $.ui.mount({ ...SESSION_PANE, props: { ...SESSION_PANE.props, scroll: { offset: 12, bodyRows: 20 } }, surface: 'desktop' })
  expect((await scrolled.find({ key: 'session-top' }))?.props.top).toBe(12)
  await scrolled.unmount()
})

test('/2fer opens the week: its scores, the picked habit week by week, what kept happening, and the best message', async ($, on) => {
  mock.clock(on, { now: NOW })
  const usage = { input: 180, output: 450, cacheRead: 1000, cacheWrite: 0 }
  const rec = (scores: Record<string, number>, tallies: Record<string, Record<string, number>>, places: object, tip: string) => ({
    words: 120,
    scores,
    tallies,
    places,
    tip,
    model: 'sonnet',
    usage,
  })
  const last = NOW - 8 * DAY
  const b = NOW - 2 * DAY
  const c = NOW - DAY
  mock.store(on, {
    'point-worth': 0.5,
    [`msg:${dayOf(last)}:${last}:a`]: rec({ fillers: 2, point: 2 }, { fillers: { like: 3 } }, { fillers: { like: { middle: 3 } } }, 'Open with the ask: say it first.'),
    [`msg:${dayOf(b)}:${b}:b`]: rec(
      { fillers: 3, point: 3 },
      { fillers: { like: 2, okay: 1 } },
      { fillers: { like: { middle: 2 }, okay: { opener: 1 } } },
      'Open with the ask: lead with it.',
    ),
    [`msg:${dayOf(c)}:${c}:c`]: rec({ fillers: 5, point: 5 }, { fillers: {} }, {}, 'Open with the ask. Keep doing this.'),
    [`quote:${dayOf(b)}:${b}:b`]: {
      excerpt: 'Okay so the cache, like, needs a copy.',
      snippets: { fillers: [{ text: 'so the cache, like, needs a copy.', start: 14, end: 18 }] },
      notes: { point: 'The ask comes last.' },
    },
    [`quote:${dayOf(c)}:${c}:c`]: { excerpt: 'Keep a copy on each server.', snippets: {}, notes: {} },
  })
  const asked: string[] = []
  const how: { model: string; effort?: string }[] = []
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    how.push({ model: e.model, effort: e.effort })
    return { value: { isAnswered: true, text: '{"main": "You save the ask for the end.", "practice": "Say the ask in your first sentence."}', usage: USAGE } }
  })
  on('command.register', () => ({ value: { command: '2fer' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await $.command.run({ command: '2fer', args: '' })).text).toBe('Opened your week beside the chat.')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const text = async (rx: RegExp) => (await ui.find({ type: 'Text', text: rx }))?.text
  expect(await text(/^Week of /)).toBe('Week of Oct 23')
  expect(await text(/minutes of speaking$/)).toBe('Fri Oct 23 to Thu Oct 29 · 2 messages · about 2 minutes of speaking')
  // A card for each habit scored this week; the lowest is picked to start.
  expect((await ui.find({ key: 'habit-fillers' }))?.text).toBe('Fillers 4.0')
  expect((await ui.find({ key: 'habit-point' }))?.text).toBe('Buried point 4.0')
  // The picked habit week by week, from the first week with notes.
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Usage of fillers by week: Oct 16 2.0, Oct 23 4.0')
  // What kept happening, worked out in code: where its words fell, and an example in the person's words.
  expect(await text(/^“like” /)).toBe('“like” in the middle of a sentence, all 2 times.')
  expect(await text(/^“okay” /)).toBe('“okay” to open a message, 1 time.')
  expect(await text(/^Fillers showed up/)).toBe('Fillers showed up in 1 of 2 messages.')
  expect((await ui.find({ type: 'Text', text: /^like$/ }))?.props.backgroundColor).toBe('#EB683433')
  expect(await text(/^Pause where/)).toBe('Pause where the filler would go. A beat of silence sounds surer than a filler.')
  expect(await text(/ went from /)).toBe('“like” went from 3 to 2.')
  // The best message, and the 2fer the week kept giving.
  expect(await text(/^“Keep a copy/)).toBe('“Keep a copy on each server.”')
  expect(await text(/ · 5 on both$/)).toMatch(/^\w{3} \d{1,2}:\d{2} · 5 on both$/)
  expect(await text(/^Open with the ask\.$/)).toBe('Open with the ask.')
  expect(await text(/^In 2 of /)).toBe('In 2 of this week’s 2 notes')
  expect(await text(/^2fer’s own use/)).toBe('2fer’s own use this week: 2 notes · 3.3k tokens · about 0.02% of a 5-hour limit')
  expect(asked.length).toBe(0)

  // The same numbers as a table.
  await ui.press({ key: 'chart-table' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await text(/^Week of Oct 23 · /)).toBe('Week of Oct 23 · Fillers 4.0 · 2 messages')
  await ui.press({ key: 'chart-table' })

  // A judged habit: one model request sums up the week's notes on it.
  await ui.press({ key: 'habit-point' })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('- The ask comes last.')
  expect(how[0]).toEqual({ model: 'claude-opus-5-5', effort: 'medium' })
  expect(await text(/^You save the ask/)).toBe('You save the ask for the end.')
  expect(await text(/^Say the ask in/)).toBe('Say the ask in your first sentence.')
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('Buried point by week: Oct 16 2.0, Oct 23 4.0')
  await ui.unmount()

  // The terminal draws no SVG, so it gets the table.
  const plain = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await plain.find({ type: 'Text', text: /^Week of Oct 23 · Buried point 4\.0/ })).toBeDefined()
  await plain.unmount()
})
