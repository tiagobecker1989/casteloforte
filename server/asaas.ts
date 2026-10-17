import crypto from 'crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from './db';
import { bad, hoje, r2 } from './http';
import { auditar } from './audit';

/**
 * Integração com o Asaas (https://docs.asaas.com), conforme a documentação consultada:
 *  - Autenticação: cabeçalho `access_token` (+ `User-Agent`). Chaves de sandbox ($aact_hmlg_) e produção ($aact_prod_) são distintas.
 *  - Cliente exige nome e CPF/CNPJ (POST /customers). Cobrança: POST /payments com customer, billingType, value, dueDate, externalReference.
 *  - billingType UNDEFINED deixa o pagador escolher Pix, boleto ou cartão na fatura (invoiceUrl).
 *  - Webhook: cabeçalho `asaas-access-token` com o token que você definiu; entrega "pelo menos uma vez" (precisa ser idempotente).
 * O sistema continua dono das faturas (teste grátis, limites, carência); o Asaas só cobra e avisa o pagamento.
 */
const KEY = process.env.ASAAS_API_KEY || '';
const BASE = (process.env.ASAAS_BASE_URL || (KEY.startsWith('$aact_prod_') ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3')).replace(/\/$/, '');
export const asaasAtivo = () => !!KEY;
export const asaasAmbiente = () => (BASE.includes('sandbox') || !KEY.startsWith('$aact_prod_') ? 'sandbox' : 'producao');

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method, signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', access_token: KEY, 'User-Agent': 'CasteloForte/1.0 (Node.js)' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) throw bad(`Asaas: ${j?.errors?.[0]?.description || `erro ${res.status}`}`, res.status === 401 ? 502 : 422);
    return j as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw bad('Asaas não respondeu a tempo. Tente novamente.', 504);
    throw e;
  } finally { clearTimeout(t); }
}

/** Cria (uma única vez) o cliente da paróquia no Asaas e guarda o id. */
async function garantirCliente(unidadeId: string): Promise<string> {
  const u = await db.get('SELECT nome, cpfCnpj, asaasCustomerId FROM unidades WHERE id = ?', unidadeId);
  if (!u) throw bad('Paróquia não encontrada', 404);
  if (u.asaasCustomerId) return u.asaasCustomerId;
  if (!u.cpfCnpj) throw bad('Informe o CNPJ (ou CPF) da paróquia em "Assinatura" para gerar a cobrança.');
  const adm = await db.get(`SELECT email FROM usuarios WHERE unidadeId = ? AND role = 'ADMIN_PAROQUIA' ORDER BY criadoEm LIMIT 1`, unidadeId);
  const c = await api<{ id: string }>('POST', '/customers', { name: u.nome, cpfCnpj: u.cpfCnpj, email: adm?.email, externalReference: unidadeId });
  await db.run('UPDATE unidades SET asaasCustomerId = ? WHERE id = ?', c.id, unidadeId);
  return c.id;
}

/**
 * Cria a cobrança de uma fatura (idempotente) e devolve o link da fatura do Asaas.
 * Antes de criar consulta por externalReference, para não duplicar após timeout (recomendação da documentação).
 */
export async function cobrarFatura(faturaId: string): Promise<string> {
  if (!asaasAtivo()) throw bad('Pagamento online não está configurado.', 503);
  const f = await db.get(`SELECT f.*, p.nome AS plano FROM faturas f JOIN planos p ON p.id = f.planoId WHERE f.id = ?`, faturaId);
  if (!f) throw bad('Fatura não encontrada', 404);
  if (f.status !== 'ABERTA') throw bad('Esta fatura não está em aberto.');
  if (f.linkPagamento) return f.linkPagamento;

  const existente = await api<{ data?: any[] }>('GET', `/payments?externalReference=${encodeURIComponent(faturaId)}&limit=1`);
  let pg = existente.data?.[0];
  if (!pg) {
    const customer = await garantirCliente(f.unidadeId);
    pg = await api('POST', '/payments', {
      customer, billingType: 'UNDEFINED', value: r2(f.valor),
      dueDate: f.vencimento < hoje() ? hoje() : f.vencimento, // o gateway não aceita vencimento no passado
      description: `Plano ${f.plano} - ${f.competencia}`.slice(0, 500),
      externalReference: faturaId,
    });
  }
  if (!pg?.invoiceUrl) throw bad('O Asaas não devolveu o link da fatura.', 502);
  await db.run('UPDATE faturas SET asaasPaymentId = ?, linkPagamento = ? WHERE id = ?', pg.id, pg.invoiceUrl, faturaId);
  return pg.invoiceUrl;
}

/** Remove a cobrança no gateway (melhor esforço; falhas só vão para o log). */
export async function cancelarCobranca(paymentId: string) {
  if (!asaasAtivo()) return;
  try { await api('DELETE', `/payments/${encodeURIComponent(paymentId)}`); } catch (e: any) { console.error('[asaas] não foi possível cancelar a cobrança', paymentId, e.message); }
}

/** Gera as cobranças das faturas abertas que ainda não têm (melhor esforço: falhas só entram no log). */
export async function cobrarFaturasAbertas(): Promise<number> {
  if (!asaasAtivo()) return 0;
  const abertas = await db.all(`SELECT f.id FROM faturas f JOIN unidades u ON u.id = f.unidadeId
    WHERE f.status = 'ABERTA' AND f.linkPagamento IS NULL AND u.cpfCnpj IS NOT NULL AND u.status = 'ATIVA'`);
  let n = 0;
  for (const f of abertas) {
    try { await cobrarFatura(f.id); n++; } catch (e: any) { console.error(`[asaas] fatura ${f.id}:`, e.message); }
  }
  return n;
}

// ---------- webhook ----------
const EVENTOS_PAGO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);
const MEIO: Record<string, string> = { PIX: 'PIX', BOLETO: 'BOLETO', CREDIT_CARD: 'CARTAO', DEBIT_CARD: 'CARTAO' };

export const webhookAsaas = Router();
/**
 * Responde 200 para tudo que for evento legítimo (inclusive os que ignoramos): respostas de erro fazem o Asaas
 * reenviar e, se persistirem, pausar a fila. Só o token inválido recebe 401.
 */
webhookAsaas.post('/asaas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!esperado) return res.status(503).json({ error: 'Webhook não configurado' });
    const recebido = Buffer.from(String(req.headers['asaas-access-token'] || ''));
    const ref = Buffer.from(esperado);
    if (recebido.length !== ref.length || !crypto.timingSafeEqual(recebido, ref)) return res.status(401).json({ error: 'Token inválido' });

    const { event, payment } = req.body || {};
    if (!EVENTOS_PAGO.has(event) || !payment) return res.json({ ok: true, ignorado: true });

    const f = await db.get('SELECT id, valor, status FROM faturas WHERE id = ? OR asaasPaymentId = ? LIMIT 1', String(payment.externalReference || ''), String(payment.id || ''));
    if (!f) { console.warn('[asaas] pagamento sem fatura correspondente:', payment.id); return res.json({ ok: true, ignorado: true }); }
    if (f.status !== 'ABERTA') return res.json({ ok: true, ignorado: true }); // já paga (reenvio) ou cancelada
    if (Number(payment.value) + 0.005 < f.valor) {
      await auditar(null, 'WEBHOOK_VALOR_DIVERGENTE', 'fatura', f.id, `recebido ${payment.value} < devido ${f.valor}`, db, null);
      return res.json({ ok: true, ignorado: true });
    }
    const { pagarFatura } = await import('./billing');
    await pagarFatura(f.id, MEIO[payment.billingType] || 'MANUAL', hoje(), String(payment.id || ''));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
