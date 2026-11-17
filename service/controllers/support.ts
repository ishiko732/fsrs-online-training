import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

const Redirect = z.object({
  url: z.string(),
})

const CallbackMeta = {
  tz: z.string(),
  nextDayStartAt: z.number(),
  total_rows: z.number(),
  total_cards: z.number(),
  total_fsrs_items: z.number(),
}

// FSRS-6 keeps the legacy body without a model_version key.
const Fsrs6CallbackBody = z.object({
  ...CallbackMeta,
  short_term_params: z.array(z.number()),
  long_term_params: z.array(z.number()),
})

const Fsrs7CallbackBody = z.object({
  model_version: z.literal('FSRS-7'),
  ...CallbackMeta,
  penalties_enabled_params: z.array(z.number()).length(34),
  penalties_disabled_params: z.array(z.number()).length(34),
})

export const Callback = z.object({
  url: z.string(),
  body: z.union([Fsrs7CallbackBody, Fsrs6CallbackBody]),
})

export type TCallback = z.infer<typeof Callback>

const SupportApp = new Hono()
  .use(
    cors({
      origin: '*',
      allowMethods: ['POST', 'GET', 'OPTIONS'],
      exposeHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
      maxAge: 600,
      credentials: true,
    })
  )
  .get('/timezones', async (c) => {
    const timezones = Intl.supportedValuesOf('timeZone')
    c.header(
      'Cache-Control',
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    )
    return c.json(timezones)
  })
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
