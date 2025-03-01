import type { HonoAppType } from '@/lib/hono.js'
import { client, isReady } from '@/lib/whatsappClient.js'
import { z } from '@hono/zod-openapi'

export function sendTextMessage(app: HonoAppType): void {
  app.basePath('/whatsapp')
  app.openapi(
    {
      method: 'post',
      path: '/send-text',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                number: z.string().openapi({ example: '556799999999 (sem o dígito 9)' }),
                message: z.string().openapi({ example: 'Olá, tudo bem?' }),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          content: {
            'application/json': {
              schema: z.object({
                status: z.string(),
                message: z.string(),
              }),
            },
          },
          description: 'Envia uma mensagem de texto',
        },
        500: {
          content: {
            'application/json': {
              schema: z.object({
                status: z.string(),
                message: z.string(),
              }),
            },
          },
          description: 'Envia uma mensagem de texto',
        },
      },
    },
    async (c) => {
      if (!isReady) {
        return c.json({
          status: 'error',
          message: 'WhatsApp não está pronto',
        }, 500)
      }

      const { number, message } = await c.req.json()

      try {
        await client.sendMessage(`${number}@c.us`, message)
        return c.json({ status: 'success', message: 'Mensagem enviada com sucesso!' })
      }
      catch (error) {
        return c.json({ status: 'error', message: 'Erro ao enviar mensagem' }, 500)
      }
    },
  )
}
