import type { HonoAppType } from '@/lib/hono.js'
import { client, isReady } from '@/lib/whatsappClient.js'
import { z } from '@hono/zod-openapi'
import csvParser from 'csv-parser'
import { Readable } from 'stream'

export type SheetType = { 
  number: string; 
  message: string 
}

// Função para formatar e validar o número de telefone
function formatPhoneNumber(number: string): string {
  // Remove caracteres não numéricos
  let formatted = number.replace(/\D/g, '');
  
  // Verifica se o número já possui o código do país
  if (!formatted.startsWith('55')) {
    formatted = '55' + formatted;
  }
  
  return formatted;
}

// Função para enviar mensagem para um número
async function sendWhatsAppMessage(number: string, message: string): Promise<boolean> {
  try {
    // Formata o número e adiciona o sufixo @c.us
    const formattedNumber = `${formatPhoneNumber(number)}@c.us`;
    console.log(`Enviando mensagem para: ${formattedNumber}`);
    
    // Envia a mensagem
    await client.sendMessage(formattedNumber, message);
    return true;
  } catch (error) {
    console.error(`Erro ao enviar mensagem para ${number}:`, error);
    return false;
  }
}

export function sendSheetMessages(app: HonoAppType): void {
  app.basePath('/sheets')

  app.openapi(
    {
      method: 'post',
      path: '/read',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                sheetUrl: z.string().url().openapi({ example: 'https://docs.google.com/spreadsheets/d/SEU_ID/edit' }),
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
                status: z.literal('success'),
                data: z.array(
                  z.object({
                    number: z.string(),
                    message: z.string(),
                    sent: z.boolean(),
                  })
                ),
              }),
            },
          },
          description: 'Planilha lida com sucesso e mensagens enviadas',
        },
        400: {
          content: {
            'application/json': {
              schema: z.object({
                status: z.literal('error'),
                message: z.string(),
              }),
            },
          },
          description: 'Erro de requisição',
        },
        500: {
          content: {
            'application/json': {
              schema: z.object({
                status: z.literal('error'),
                message: z.string(),
              }),
            },
          },
          description: 'Erro interno do servidor',
        },
      },
    },
    async (c) => {
      console.log('Recebida requisição para ler planilha')
      if (!isReady) {
        console.error('WhatsApp não está pronto')
        return c.json({
          status: 'error',
          message: 'WhatsApp não está pronto',
        }, 500)
      }

      const { sheetUrl } = await c.req.json()
      console.log('URL da planilha recebida:', sheetUrl)

      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
      if (!match) {
        console.error('URL inválida')
        return c.json({ status: 'error', message: 'URL inválida' }, 400)
      }

      const sheetId = match[1]
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`
      console.log('URL do CSV gerada:', csvUrl)

      try {
        // Adiciona cabeçalhos para possível problema de autenticação
        const headers = {
          'Accept': 'text/csv,application/json;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };
        
        const response = await fetch(csvUrl, { headers });
        console.log('Resposta da requisição ao Google Sheets:', response.status);
        
        if (!response.ok) {
          console.error('Erro ao acessar a planilha. Verifique se ela está pública.');
          return c.json({ 
            status: 'error', 
            message: 'Erro ao acessar a planilha. Verifique se ela está configurada como "qualquer pessoa com o link pode visualizar"' 
          }, 401);
        }

        const results: Array<SheetType & { sent: boolean }> = [];

        return new Promise((resolve, reject) => {
          const stream = Readable.fromWeb(response.body as any);
          console.log('Iniciando processamento do CSV');

          stream
            .pipe(csvParser({ headers: ['number', 'message'], skipLines: 1 }))
            .on('data', (data) => {
              console.log('Linha processada:', data);

              // Filtramos apenas entradas válidas
              if (data.number?.trim() && data.message?.trim()) {
                results.push({...data, sent: false});
              }
            })
            .on('end', async () => {
              console.log('Processamento do CSV concluído, enviando mensagens...');
              
              // Declara a função fora do loop
              async function sendTextMessage(number: string, message: string): Promise<boolean> {
                try {
                  await client.sendMessage(`${number}@c.us`, message)
                  return true
                } catch (error) {
                  return false
                }
              }

              // No loop
              for (let i = 0; i < results.length; i++) {
                const { number, message } = results[i];
                console.log(`Enviando mensagem ${i+1}/${results.length}: ${number}`);
                
                // Envia a mensagem e atualiza o status
                results[i].sent = await sendTextMessage(number, message);
                
                // Pequeno delay para evitar bloqueio do WhatsApp
                if (i < results.length - 1) {
                  await new Promise(r => setTimeout(r, 1000));
                }
              }
              
              console.log('Envio de mensagens concluído');
              resolve(c.json({ status: 'success', data: results }, 200));
            })
            .on('error', (error) => {
              console.error('Erro ao processar CSV:', error);
              reject(c.json({ status: 'error', message: error.message }, 500));
            });
        });
      } catch (error) {
        console.error('Erro ao processar a planilha:', error);
        return c.json({ status: 'error', message: 'Erro ao processar a planilha' }, 500);
      }
    }
  )
}