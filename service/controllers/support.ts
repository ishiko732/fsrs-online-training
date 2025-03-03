import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

const Redirect = z.object({
  url: z.string(),
})

const Callback = z.object({
  url: z.string(),
  body: z.object({
    tz: z.string(),
    nextDayStartAt: z.number(),
    total_rows: z.number(),
    total_cards: z.number(),
    total_fsrs_items: z.number(),
    short_term_params: z.array(z.number()),
    long_term_params: z.array(z.number()),
  }),
})

const SupportApp = new Hono()
  .get('/redirect', zValidator('query', Redirect), async (c) => {
    const { url } = c.req.valid('query')

    return fetch(url).then((res) => res)
  })
  .post('/callback', zValidator('json', Callback), async (c) => {
    const { url, body } = c.req.valid('json')
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then((res) => res)
  })

export default SupportApp
