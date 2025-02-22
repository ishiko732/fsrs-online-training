import { Hono } from 'hono'
import { handle } from 'hono/vercel'

import PostApp from '@/service/controllers/posts'

export const runtime = 'edge'

const app = new Hono().basePath('/api')

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app.route('/posts', PostApp)

export default handle(app)
export type AppType = typeof routes
