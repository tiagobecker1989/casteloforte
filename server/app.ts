import crypto from 'crypto';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { db } from './db';
import { seed } from './seed';
import api from './routes';
import { legalPublico } from './lgpd';
import { webhookBilling, rodarCobranca } from './billing';
import { limparLimites } from './auth';
import { sincronizarTodas } from './banco';
import { webhookAsaas } from './asaas';
import { exigirLogin, exigirRole, tenant } from './auth';

const app = express();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
// Na Vercel o corpo pode já chegar lido pela plataforma: então não tentamos ler o stream de novo.
app.use((req: any, _res, next) => {
  if (process.env.VERCEL && req.method !== 'GET' && req.method !== 'HEAD') {
    const b = req.body; // o acesso dispara a leitura/parse da plataforma, se houver
    if (Buffer.isBuffer(b)) req._body = true; // upload binário já lido
    else if (b !== undefined && b !== null && typeof b === 'object') { req._body = true; req.rawBody = Buffer.from(JSON.stringify(b)); }
  }
  next();
});
// rawBody é necessário para validar a assinatura (HMAC) do webhook genérico
app.use(express.json({ limit: '1mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
await seed();

// Cron (Vercel Cron chama com GET e Authorization: Bearer CRON_SECRET). Idempotente: pode rodar mais de uma vez.
app.all('/api/cron/cobranca', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado' });
    const recebido = Buffer.from(String(req.headers.authorization || '')), esperado = Buffer.from(`Bearer ${secret}`);
    if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) return res.status(401).json({ error: 'Não autorizado' });
    const faturasCriadas = await rodarCobranca();
    await sincronizarTodas();
    await limparLimites();
    await db.run('DELETE FROM reset_senha WHERE expiraEm < ?', new Date(Date.now() - 24 * 3600_000).toISOString());
    res.json({ ok: true, faturasCriadas });
  } catch (e) { next(e); }
});

app.use('/api', legalPublico);                 // textos legais públicos
app.use('/api/webhooks', webhookBilling);      // webhook genérico (HMAC)
app.use('/api/webhooks', webhookAsaas);        // Asaas (token no cabeçalho asaas-access-token)

// API multi-tenant (auth, sede, paróquia, membros, finanças, cobrança, LGPD...)
app.use('/api', (req, res, next) => (req.path.startsWith('/gemini') ? next() : api(req, res, next)));

// ---------- IA pastoral (Gemini) ----------
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '', httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
app.use('/api/gemini', exigirLogin, exigirRole('ADMIN_PAROQUIA', 'PASTOR'));

/**
 * LGPD: nomes NUNCA vão para o provedor de IA. Cada membro vira "Membro N"; a resposta volta com
 * os nomes reinseridos apenas aqui no servidor, para quem tem permissão de ver a lista.
 */
async function membrosPseudonimizados(req: express.Request) {
  const rows = await db.all(`SELECT nome, ultimaComunhao, pontuacaoEngajamento, temCargo FROM membros WHERE unidadeId = ? AND status = 'ATIVO' AND anonimizadoEm IS NULL ORDER BY id`, tenant(req));
  return {
    dados: rows.map((m, i) => ({ rotulo: `Membro ${i + 1}`, ultimaComunhao: m.ultimaComunhao, pontuacao: m.pontuacaoEngajamento, temCargo: !!m.temCargo })),
    reidentificar: (t: string) => (t || '').replace(/Membro (\d+)/g, (s, n) => rows[Number(n) - 1]?.nome ?? s),
  };
}
const gerar = async (prompt: string) => (await ai.models.generateContent({ model: MODEL, contents: prompt })).text;

app.post('/api/gemini/analyze-health', async (req, res) => {
  try {
    const { dados, reidentificar } = await membrosPseudonimizados(req);
    const prompt = `Analise os dados desta congregação luterana (Igreja Evangélica Luterana do Brasil - IELB).
Membros da unidade (identificados por rótulo): ${JSON.stringify(dados)}

Identifique tendências de evasão e sugira 3 ações pastorais urgentes e práticas para cuidado comunitário e acolhimento. Ao citar pessoas, use apenas o rótulo (ex.: "Membro 3").
Retorne um resumo executivo claro e caloroso em até 3 parágrafos objetivos em português.`;
    return res.json({ text: reidentificar(await gerar(prompt) as string) });
  } catch (error: any) {
    console.error('Erro na API Gemini (analyze-health):', error?.message);
    return res.status(500).json({
      error: error?.message || 'Falha ao analisar a saúde da congregação',
      fallbackText: 'A análise identificou membros que requerem visitação pastoral imediata devido à ausência prolongada na Santa Comunhão. Recomenda-se contato telefônico fraterno e mobilização dos departamentos para reintegração ativa na vida comunitária.',
    });
  }
});

app.post('/api/gemini/pastoral-report', async (req, res) => {
  try {
    const { dados, reidentificar } = await membrosPseudonimizados(req);
    const prompt = `Você é um Consultor Estratégico para Pastores da IELB (Igreja Evangélica Luterana do Brasil).
Analise profundamente os seguintes dados de membros (identificados por rótulo; cite pessoas apenas pelo rótulo, ex.: "Membro 3"):
${JSON.stringify(dados)}

Sua tarefa é gerar um RELATÓRIO ESTRATÉGICO DE CUIDADO PASTORAL formatado em Markdown com as seguintes seções:
1. **Panorama Geral da Saúde Comunitária**
2. **Identificação de Grupos de Risco e Sinais de Evasão**
3. **Plano de Ação Personalizado para Visitação**
4. **Sugestões para Departamentos (Juventude, Senhoras, Homens, Casais)**
5. **Conclusão e Encorajamento Pastoral**

Use um tom profissional, acolhedor e focado em soluções práticas para reduzir a evasão e fortalecer a comunhão da congregação.`;
    return res.json({ text: reidentificar(await gerar(prompt) as string) });
  } catch (error: any) {
    console.error('Erro na API Gemini (pastoral-report):', error?.message);
    return res.status(500).json({ error: error?.message || 'Falha ao processar o relatório pastoral estratégico' });
  }
});

app.post('/api/gemini/baptism-message', async (req, res) => {
  const nome = String(req.body?.nomeMembro || '').trim().slice(0, 80);
  try {
    const anos = Math.max(1, Math.min(120, Number(req.body?.anos) || 1));
    const prompt = `Escreva uma mensagem curta e calorosa de um pastor para um membro que está completando ${anos} anos de batismo hoje. Use exatamente o marcador [NOME] no lugar do nome da pessoa.
A mensagem deve ser enviada por WhatsApp.
Contexto: Igreja Evangélica Luterana do Brasil (IELB).
Inclua um versículo bíblico curto sobre batismo ou fidelidade de Deus e um convite carinhoso para o próximo culto.
Mantenha um tom amigável, pastoral, acolhedor e adequado para WhatsApp.`;
    const texto = (await gerar(prompt)) as string;
    return res.json({ text: texto.replace(/\[NOME\]/g, nome.split(' ')[0] || 'irmão(ã)') });
  } catch (error: any) {
    console.error('Erro na API Gemini (baptism-message):', error?.message);
    return res.status(500).json({
      error: error?.message || 'Falha ao gerar mensagem de batismo',
      fallbackText: `Olá ${nome || 'irmão(ã)'}, celebramos hoje seu aniversário de batismo! Que a graça de nosso Senhor continue iluminando seus passos na fé. Esperamos você no próximo culto de nossa congregação!`,
    });
  }
});

app.post('/api/gemini/engagement-prediction', async (req, res) => {
  try {
    const m = await db.get('SELECT ultimaComunhao, pontuacaoEngajamento FROM membros WHERE id = ? AND unidadeId = ? AND anonimizadoEm IS NULL', String(req.body?.membroId || ''), tenant(req));
    if (!m) return res.status(404).json({ error: 'Membro não encontrado' });
    const prompt = `Baseado no perfil de um membro com última comunhão em ${m.ultimaComunhao} e score de ${m.pontuacaoEngajamento}%, qual a probabilidade de desengajamento nos próximos 6 meses e quais passos pastorais são indicados?`;
    return res.json({ text: await gerar(prompt) });
  } catch (error: any) {
    console.error('Erro na API Gemini (engagement-prediction):', error?.message);
    return res.status(500).json({ error: error?.message || 'Previsão indisponível no momento' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erro interno' : err.message });
});


export default app;
