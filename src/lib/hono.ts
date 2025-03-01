import type { Env } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { notFound, onError, serveEmojiFavicon } from 'stoker/middlewares'

/* eslint-disable ts/no-empty-object-type */
export type HonoAppType = OpenAPIHono<Env, {}, '/'>

export function createHonoApp(): HonoAppType {
  const app = new OpenAPIHono()
  app.use(serveEmojiFavicon('🚀'))
  app.use(logger())

  app.notFound(notFound)
  app.onError(onError)

  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'My API',
    },
  })

  app.get('/', swaggerUI({ url: '/doc' }))

  return app
}