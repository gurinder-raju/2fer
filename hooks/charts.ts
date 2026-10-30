// The weekly view's charts, as SVG for the surfaces that draw it. A drawing
// can't see the person's theme, so its colors are mid-tones that read on a
// light ground and a dark one alike. Text stays in that muted ink, never in
// a series color, and each week or bar carries a tooltip for the pointer.

import type { Week } from '../types'

const ACCENT = '#3B82D9'
const INK = '#8A8780'
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'

// The plot's frame, shared so the score chart's weeks and the bars' weeks line up.
const W = 760
const LEFT = 44
const RIGHT = 736

const r1 = (n: number) => Math.round(n * 10) / 10

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function xOf(n: number): (i: number) => number {
  return i => r1(n <= 1 ? (LEFT + RIGHT) / 2 : LEFT + 30 + (i * (RIGHT - LEFT - 60)) / (n - 1))
}

function halfOf(n: number): number {
  return n <= 1 ? 60 : (RIGHT - LEFT - 60) / (n - 1) / 2
}

function svg(width: number, height: number, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${FONT}" font-size="12" fill="${INK}">` +
    `<style>.guide{opacity:0}.wk:hover .guide{opacity:1}.bar:hover .mark{fill-opacity:1}</style>${body}</svg>`
  )
}

/** The runs of consecutive weeks that have a value, so a line breaks over a week that has none. */
function runs(points: readonly ([number, number] | null)[]): [number, number][][] {
  const found: [number, number][][] = []
  let run: [number, number][] = []
  for (const p of points) {
    if (p) run.push(p)
    else if (run.length > 0) {
      found.push(run)
      run = []
    }
  }
  if (run.length > 0) found.push(run)
  return found
}

/** One habit's score by week, with the other habits in gray behind it and a guide and a tooltip on each week. */
export function trendSvg(weeks: readonly Week[], id: string, name: string, others: readonly string[]): string {
  const top = 20
  const bottom = 212
  const x = xOf(weeks.length)
  const y = (v: number) => r1(bottom - ((v - 1) * (bottom - top)) / 4)
  const grid = [1, 2, 3, 4, 5]
    .map(
      v =>
        `<line x1="${LEFT}" y1="${y(v)}" x2="${RIGHT}" y2="${y(v)}" stroke="${INK}" stroke-opacity="${v === 1 ? 0.55 : 0.22}"/>` +
        `<text x="${LEFT - 12}" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
    )
    .join('')
  const line = (cid: string, color: string, opacity: number) =>
    runs(weeks.map((w, i) => (w.scores[cid] === undefined ? null : [x(i), y(w.scores[cid] ?? 0)])))
      .map(
        pts =>
          `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
      )
      .join('')
  const dots = weeks
    .map((w, i) => (w.scores[id] === undefined ? '' : `<circle cx="${x(i)}" cy="${y(w.scores[id] ?? 0)}" r="4.5" fill="${ACCENT}"/>`))
    .join('')
  const last = weeks.reduce((at, w, i) => (w.scores[id] === undefined ? at : i), -1)
  const lastScore = weeks[last]?.scores[id]
  const end = lastScore === undefined ? '' : `<text x="${x(last) + 10}" y="${y(lastScore) + 4}" font-weight="600">${lastScore.toFixed(1)}</text>`
  const half = r1(halfOf(weeks.length))
  const hover = weeks
    .map((w, i) => {
      const v = w.scores[id]
      const tip = `Week of ${w.label} · ${name} ${v === undefined ? 'not scored' : v.toFixed(1)} · ${w.messages} ${w.messages === 1 ? 'message' : 'messages'}`
      return (
        `<g class="wk"><rect x="${r1(x(i) - half)}" y="${top}" width="${r1(half * 2)}" height="${bottom - top}" fill="transparent"/>` +
        `<line class="guide" x1="${x(i)}" y1="${top}" x2="${x(i)}" y2="${bottom}" stroke="${INK}" stroke-opacity="0.7"/><title>${esc(tip)}</title></g>`
      )
    })
    .join('')
  const labels = weeks.map((w, i) => `<text x="${x(i)}" y="${bottom + 26}" text-anchor="middle">${esc(w.label)}</text>`).join('')
  return svg(W, 250, `${grid}${others.map(o => line(o, INK, 0.4)).join('')}${line(id, ACCENT, 1)}${dots}${end}${hover}${labels}`)
}

/** Messages per week as columns on the same weeks: this week's in the full accent, the rest lighter. */
export function messagesSvg(weeks: readonly Week[]): string {
  const top = 22
  const bottom = 118
  const x = xOf(weeks.length)
  const most = Math.max(1, ...weeks.map(w => w.messages))
  const step = most <= 10 ? 2 : most <= 25 ? 5 : most <= 50 ? 10 : most <= 100 ? 20 : 50
  const ceil = Math.ceil(most / step) * step
  const y = (v: number) => r1(bottom - (v * (bottom - top)) / ceil)
  const ticks: number[] = []
  for (let v = 0; v <= ceil; v += step) ticks.push(v)
  const grid = ticks
    .map(
      v =>
        `<line x1="${LEFT}" y1="${y(v)}" x2="${RIGHT}" y2="${y(v)}" stroke="${INK}" stroke-opacity="${v === 0 ? 0.55 : 0.22}"/>` +
        `<text x="${LEFT - 12}" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
    )
    .join('')
  const bars = weeks
    .map((w, i) => {
      const cx = x(i)
      const cap = y(w.messages)
      const r = Math.min(4, bottom - cap)
      const now = i === weeks.length - 1
      const tip = `Week of ${w.label} · ${w.messages} ${w.messages === 1 ? 'message' : 'messages'}`
      const column =
        w.messages === 0
          ? ''
          : `<path class="mark" d="M${cx - 12},${bottom} V${cap + r} Q${cx - 12},${cap} ${cx - 12 + r},${cap} H${cx + 12 - r} Q${cx + 12},${cap} ${cx + 12},${cap + r} V${bottom} Z" fill="${ACCENT}" fill-opacity="${now ? 1 : 0.45}"/>`
      const value = now && w.messages > 0 ? `<text x="${cx}" y="${cap - 6}" text-anchor="middle" font-weight="600">${w.messages}</text>` : ''
      return `<g class="bar"><rect x="${cx - 18}" y="${top}" width="36" height="${bottom - top}" fill="transparent"/>${column}${value}<title>${esc(tip)}</title></g>`
    })
    .join('')
  const labels = weeks.map((w, i) => `<text x="${x(i)}" y="${bottom + 24}" text-anchor="middle">${esc(w.label)}</text>`).join('')
  return svg(W, 150, `${grid}${bars}${labels}`)
}

/** Horizontal bars for this week, a tick at last week's count, and the count at the end: a habit's words, or how its notes scored. */
export function barsSvg(rows: readonly { name: string; now: number; last: number }[]): string {
  const width = 440
  const left = 96
  const right = 392
  const rowH = 30
  const most = Math.max(1, ...rows.flatMap(r => [r.now, r.last]))
  const x = (v: number) => r1(left + (v * (right - left)) / most)
  const body = rows
    .map((r, i) => {
      const top = 8 + i * rowH
      const end = x(r.now)
      const rad = Math.min(4, end - left)
      const bar =
        r.now > 0
          ? `<path class="mark" d="M${left},${top} H${end - rad} Q${end},${top} ${end},${top + rad} V${top + 14 - rad} Q${end},${top + 14} ${end - rad},${top + 14} H${left} Z" fill="${ACCENT}" fill-opacity="0.85"/>`
          : ''
      const tick = r.last > 0 ? `<line x1="${x(r.last)}" y1="${top - 3}" x2="${x(r.last)}" y2="${top + 17}" stroke="${INK}" stroke-width="2"/>` : ''
      const tip = `${r.name}: ${r.now} this week, ${r.last} last week`
      return (
        `<g class="bar"><rect x="0" y="${top - 6}" width="${width}" height="${rowH}" fill="transparent"/>` +
        `<text x="0" y="${top + 12}">${esc(r.name)}</text>${bar}${tick}` +
        `<text x="${width - 2}" y="${top + 12}" text-anchor="end" font-weight="600">${r.now}</text><title>${esc(tip)}</title></g>`
      )
    })
    .join('')
  return svg(width, 10 + rows.length * rowH, body)
}
