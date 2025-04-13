import TrainApp from '@api/controllers/train'
import { InitGlobalMiddlewares } from '@api/middlewares/global'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { showRoutes } from 'hono/dev'
import { handle } from 'hono/vercel'

// not supported
// import { createRequire } from "node:module";
// export const runtime = 'edge'

const app = InitGlobalMiddlewares(new Hono())
  .basePath('/api/train')
  .notFound(async (c) => {
    return c.json({ error: 'Not found' }, 404)
  })
  .use(cors())
const routes = app
  // tip: It cannot run on Vercel because it got optimized away.
  .route('/', TrainApp)

const handler = handle(app)

showRoutes(routes)

export { handler as DELETE, handler as GET, handler as POST, handler as PUT }
export type AppType = typeof routes
