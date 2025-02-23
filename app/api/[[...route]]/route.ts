import TrainApp from '@api/controllers/train'
import { Hono } from 'hono'
import { handle } from 'hono/vercel'

// not supported
// import { createRequire } from "node:module";
// export const runtime = 'edge'

const app = new Hono().basePath('/api').notFound(async (c) => {
  return c.json({ error: 'Not found' }, 404)
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app
// tip: It cannot run on Vercel because it got optimized away.
.route('/train', TrainApp)

const handler = handle(app)
export { handler as DELETE, handler as GET, handler as POST, handler as PUT }
export type AppType = typeof routes
