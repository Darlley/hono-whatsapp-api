import { createHonoApp } from "./lib/hono.js"
import { sendTextMessage } from "./routes/send-message.js"
import { setWhatsAppClient } from "./routes/setup-whatsapp.route.js"

const app = createHonoApp()

setWhatsAppClient(app)
sendTextMessage(app)

app.get('/error', (c) => {
  c.status(422)
  throw new Error('Oh No!')
})



export default app
