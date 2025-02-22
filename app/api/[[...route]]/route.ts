import PostApp from '@api/controllers/posts'
import { Hono } from 'hono'
import { handle } from 'hono/vercel'

export const runtime = 'edge'

const app = new Hono().basePath('/api').notFound(async (c) => {
  return c.json({ error: 'Not found' }, 404)
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app.route('/posts', PostApp)

const handler = handle(app)
export { handler as DELETE,handler as GET, handler as POST, handler as PUT }
export type AppType = typeof routes
