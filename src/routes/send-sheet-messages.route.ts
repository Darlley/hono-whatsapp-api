import type { HonoAppType } from '@/lib/hono.js'
import { isReady, client } from '@/lib/whatsappClient.js'
import { z } from '@hono/zod-openapi'
import csvParser from 'csv-parser'
import { Readable } from 'stream'

// Função para enviar mensagem para um número
async function sendTextMessage(number: string, message: string): Promise<boolean> {
  try {
    await client.sendMessage(`${number}@c.us`, message)
    console.log(`✅ Mensagem enviada com sucesso para ${number}: "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`)
    return true
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem para ${number}:`, error)
    return false
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
                data: z.object({
                  numbers: z.array(z.string()),
                  messages: z.array(z.string()),
                  totalSent: z.number(),
                  totalFailed: z.number(),
                  results: z.array(
                    z.object({
                      number: z.string(),
                      messagesSent: z.number(),
                      messagesFailed: z.number(),
                    })
                  )
                }),
              }),
            },
          },
          description: 'Mensagens enviadas com sucesso',
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

        // Arrays separados para números e mensagens
        const numbers: string[] = [];
        const messages: string[] = [];

        return new Promise((resolve, reject) => {
          const stream = Readable.fromWeb(response.body as any);
          console.log('Iniciando processamento do CSV');

          stream
            .pipe(csvParser({ headers: ['number', 'message'], skipLines: 1 }))
            .on('data', (data) => {
              console.log('Linha processada:', data);

              // Coleta números (se não estiver vazio)
              if (data.number?.trim()) {
                numbers.push(data.number.trim());
              }
              
              // Coleta mensagens (se não estiver vazio)
              if (data.message?.trim()) {
                messages.push(data.message.trim());
              }
            })
            .on('end', async () => {
              console.log(`Processamento do CSV concluído: ${numbers.length} números e ${messages.length} mensagens encontrados`);
              
              if (numbers.length === 0) {
                return resolve(c.json({ 
                  status: 'error', 
                  message: 'Nenhum número de telefone válido encontrado na planilha'
                }, 400));
              }
              
              if (messages.length === 0) {
                return resolve(c.json({ 
                  status: 'error', 
                  message: 'Nenhuma mensagem válida encontrada na planilha'
                }, 400));
              }
              
              // Array para armazenar os resultados do envio
              const results = [];
              let totalSent = 0;
              let totalFailed = 0;
              
              // Para cada número, envia todas as mensagens
              for (let i = 0; i < numbers.length; i++) {
                const number = numbers[i];
                console.log(`📱 Enviando mensagens para o número ${i+1}/${numbers.length}: ${number}`);
                
                let messagesSent = 0;
                let messagesFailed = 0;
                
                // Enviar cada mensagem para este número
                for (let j = 0; j < messages.length; j++) {
                  const message = messages[j];
                  console.log(`  📝 Enviando mensagem ${j+1}/${messages.length}`);
                  
                  // Envia a mensagem e armazena o resultado
                  const sent = await sendTextMessage(number, message);
                  
                  if (sent) {
                    messagesSent++;
                    totalSent++;
                  } else {
                    messagesFailed++;
                    totalFailed++;
                  }
                  
                  // Pequeno delay entre mensagens para o mesmo número
                  if (j < messages.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                  }
                }
                
                // Armazena os resultados para este número
                results.push({
                  number,
                  messagesSent,
                  messagesFailed
                });
                
                // Delay maior entre números diferentes
                if (i < numbers.length - 1) {
                  await new Promise(r => setTimeout(r, 1000));
                }
              }
              
              console.log(`Envio de mensagens concluído: ${totalSent} enviadas, ${totalFailed} falhas`);
              resolve(c.json({ 
                status: 'success', 
                data: {
                  numbers,
                  messages,
                  totalSent,
                  totalFailed,
                  results
                }
              }, 200));
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