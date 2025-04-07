import { evaluateByFormData, trainByFormData } from '@api/services/train_task'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { EvaluateFormData, TrainFormData } from './train.schema'

const TrainApp = new Hono()
  .post('/', zValidator('form', TrainFormData), async (c) => {
    const formData = c.req.valid('form')
    return trainByFormData(c, formData)
  })
  .post('/evaluate', zValidator('form', EvaluateFormData), async (c) => {
    const formData = c.req.valid('form')
    return evaluateByFormData(c, formData)
  })

export default TrainApp
