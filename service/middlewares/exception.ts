import { loggerError } from '@api/utils/logger'
import type { Context } from 'hono'
import type { HTTPResponseError } from 'hono/types'

export function SystemException() {
  return (err: Error | HTTPResponseError, c: Context) => {
    loggerError('SystemException', err)
    return c.json({ message: 'Internal Server Error', error: err }, 500)
  }
}
