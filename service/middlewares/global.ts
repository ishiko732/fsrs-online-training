import type { Hono, Schema } from 'hono'
import type { BlankEnv, BlankSchema } from 'hono/types'

import { SystemException } from './exception'

export function InitGlobalMiddlewares<E extends BlankEnv, S extends Schema = BlankSchema, BasePath extends string = '/'>(
  app: Hono<E, S, BasePath>,
) {
  app.onError(SystemException())
  return app
}
