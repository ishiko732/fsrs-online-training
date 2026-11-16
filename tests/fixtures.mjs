// Synthetic, deterministic review logs. No user data is used in tests.

export const CSV_HEADER =
  'review_time,card_id,review_rating,review_duration,review_state'

const HOUR = 3_600_000
const DAY = 24 * HOUR

export function toCsv(rows) {
  return `${[CSV_HEADER, ...rows.map((r) => r.join(','))].join('\n')}\n`
}

// Simple spaced-repetition simulation driven by a seeded LCG.
export function syntheticRevlogCsv({
  cards = 120,
  reviews = 8,
  seed = 7,
} = {}) {
  let state = seed >>> 0
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const start = Date.UTC(2025, 0, 1, 2)
  const rows = []
  for (let card = 0; card < cards; card++) {
    const cardId = 1_700_000_000_000 + card
    let time =
      start + Math.floor(rand() * 60) * DAY + Math.floor(rand() * 12) * HOUR
    rows.push([time, cardId, rand() < 0.3 ? 1 : 3, 5000, 0])
    let interval = 1
    for (let i = 0; i < reviews; i++) {
      time += interval * DAY + Math.floor(rand() * 6) * HOUR
      const p = rand()
      const rating = p < 0.12 ? 1 : p < 0.25 ? 2 : p < 0.9 ? 3 : 4
      rows.push([time, cardId, rating, 4000, rating === 1 ? 3 : 2])
      const factor = { 1: 0, 2: 1.2, 3: 2.5, 4: 3.5 }[rating]
      interval = Math.max(1, Math.round(interval * factor))
    }
  }
  return toCsv(rows)
}

// Header does not match the required CSV fields, so conversion fails.
export const INVALID_CSV = 'foo,bar\n1,2\n'
