import type { HonoAppType } from '@/lib/honojs/create-hono-app.js'
import { isReady, qrCodeData } from '@/lib/whatsappClient.js'
import { z } from '@hono/zod-openapi'

export function setWhatsAppClient(app: HonoAppType): void {
  app.openapi(
    {
      method: 'get',
      path: '/whatsapp',
      responses: {
        200: {
          content: {
            'application/json': {
              schema: z
                .object({
                  status: z.string().openapi({
                    example: 'success',
                  }),
                  data: z.object({
                    ready: z.boolean().openapi({
                      example: true,
                    }),
                    qrCode: z.string().nullable().openapi({
                      example: 'base64-qrcode-data',
                    }),
                  }),
                })
                .openapi('WhatsAppStatus'),
            },
          },
          description: 'WhatsApp status',
        },
      },
    },
    (c) => {
      return c.json({
        status: 'success',
        data: {
          ready: isReady,
          qrCode: isReady ? null : qrCodeData,
        },
      })
    }
  )
}
