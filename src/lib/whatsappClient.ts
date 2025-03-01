import qrcode from 'qrcode-terminal'
import { Client } from 'whatsapp-web.js'

const client = new Client({})

// eslint-disable-next-line import/no-mutable-exports
let isReady = false
// eslint-disable-next-line import/no-mutable-exports
let qrCodeData: string | null = null

client.on('qr', (qr) => {
  qrCodeData = qr // Armazena o QR Code para exibição na API
  qrcode.generate(qr, { small: true })
})

client.on('ready', () => {
  console.log('WhatsApp está pronto!')
  isReady = true
  qrCodeData = null // Limpa o QR Code após conexão bem-sucedida
})

client.initialize()

export { client, isReady, qrCodeData }
