import crypto from 'crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db, uid, agora, type Conn } from './db';
import { exigirRole, tenant } from './auth';
import { wrap, bad, str, r2, hoje, mesAtual, documentoValido } from './http';
import { asaasAtivo, asaasAmbiente, cobrarFatura, cobrarFaturasAbertas, cancelarCobranca } from './asaas';
import { auditar } from './audit';

/**
 * Cobrança dos planos (a sede cobra as paróquias).
 *  - Planos com preço e limites (membros/usuários); valores iniciais são EXEMPLOS editáveis pela sede.
 *  - Nova paróquia começa no plano de menor ordem; no 1º upgrade para plano pago ganha TRIAL_DIAS grátis.
 *  - Fatura mensal por competência (AAAA-MM), vencimento dia 10; carência de CARENCIA_DIAS.
 *  - Inadimplente além da carência => paróquia fica em MODO SOMENTE LEITURA (dados nunca são apagados).
 *  - Recebimento: manual (sede confirma Pix/boleto) ou via webhook assinado (HMAC) de um gateway.
 */
export const TRIAL_DIAS = Number(process.env.TRIAL_DIAS || 30);
export const CARENCIA_DIAS = Number(process.env.CARENCIA_DIAS || 15);
const DIA_VENCIMENTO = 10;

const somaDias = (iso: string, d: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + d * 86400000).toISOString().slice(0, 10);

export async function garantirPlanos(c: Conn = db) {
  if (await c.get('SELECT 1 AS x FROM planos')) return;
  const base = [
    { nome: 'Gratuito', preco: 0, m: 50, u: 2 },
    { nome: 'Paroquial', preco: 49.9, m: 500, u: 10 },
    { nome: 'Distrital', preco: 99.9, m: null, u: null },
  ];
  for (let i = 0; i < base.length; i++) {
    const p = base[i];
    await c.run('INSERT INTO planos (id,nome,precoMensal,limiteMembros,limiteUsuarios,ativo,ordem) VALUES (?,?,?,?,?,1,?)', uid('pl'), p.nome, p.preco, p.m, p.u, i);
  }
}

export async function garantirAssinatura(unidadeId: string, c: Conn = db) {
  if (await c.get('SELECT 1 AS x FROM assinaturas WHERE unidadeId = ?', unidadeId)) return;
  await garantirPlanos(c); // dentro de transação, sempre usar a mesma conexão (PGlite/Postgres)
  const plano = await c.get('SELECT id FROM planos WHERE ativo = 1 ORDER BY ordem LIMIT 1');
  await c.run('INSERT INTO assinaturas (unidadeId,planoId,status,trialAte,criadoEm) VALUES (?,?,?,?,?)', unidadeId, plano.id, 'ATIVA', null, agora());
}

/** Gera as faturas da competência para quem está em plano pago e já saiu do trial. Idempotente. */
export async function gerarFaturas(competencia = mesAtual()) {
  const venc = `${competencia}-${String(DIA_VENCIMENTO).padStart(2, '0')}`;
  const linhas = await db.all(`SELECT a.unidadeId, a.planoId, a.trialAte, a.status, p.precoMensal FROM assinaturas a
    JOIN planos p ON p.id = a.planoId JOIN unidades u ON u.id = a.unidadeId
    WHERE u.status = 'ATIVA' AND u.isSede = 0 AND a.status <> 'CANCELADA' AND p.precoMensal > 0`);
  let criadas = 0;
  for (const l of linhas) {
    if (l.trialAte && l.trialAte >= venc) continue;
    const r = await db.run('INSERT INTO faturas (id,unidadeId,competencia,planoId,valor,vencimento,status,criadoEm) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (unidadeId, competencia) DO NOTHING',
      uid('fa'), l.unidadeId, competencia, l.planoId, r2(l.precoMensal), venc, 'ABERTA', agora());
    criadas += r.changes;
  }
  return criadas;
}

/** Mantém o status das assinaturas coerente com trial e faturas em atraso. */
export async function atualizarStatus() {
  const h = hoje();
  await db.run(`UPDATE assinaturas SET status = 'ATIVA' WHERE status = 'TRIAL' AND trialAte < ?`, h);
  const limite = somaDias(h, -CARENCIA_DIAS);
  await db.run(`UPDATE assinaturas SET status = 'INADIMPLENTE' WHERE status IN ('ATIVA','TRIAL')
    AND unidadeId IN (SELECT unidadeId FROM faturas WHERE status = 'ABERTA' AND vencimento < ?)`, limite);
  await db.run(`UPDATE assinaturas SET status = 'ATIVA' WHERE status = 'INADIMPLENTE'
    AND unidadeId NOT IN (SELECT unidadeId FROM faturas WHERE status = 'ABERTA' AND vencimento < ?)`, limite);
}
export async function rodarCobranca() { const n = await gerarFaturas(); await atualizarStatus(); await cobrarFaturasAbertas(); return n; }

export async function pagarFatura(id: string, meio: string, pagoEm: string, gatewayRef?: string | null) {
  const f = await db.get('SELECT id, status FROM faturas WHERE id = ?', id);
  if (!f) throw bad('Fatura não encontrada', 404);
  if (f.status === 'PAGA') return false;
  if (f.status === 'CANCELADA') throw bad('Fatura cancelada');
  await db.run(`UPDATE faturas SET status='PAGA', pagoEm=?, meio=?, gatewayRef=? WHERE id=?`, pagoEm, meio, gatewayRef ?? null, id);
  await atualizarStatus();
  return true;
}

// ---------- bloqueio de escrita (modo somente leitura) ----------
export async function bloqueioEscrita(req: Request, res: Response, next: NextFunction) {
  try {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.sessao?.unidadeId) return next();
    if (/^\/(auth|assinatura)(\/|$)/.test(req.path)) return next(); // permite pagar/trocar plano/alterar senha
    const a = await db.get('SELECT status FROM assinaturas WHERE unidadeId = ?', req.sessao.unidadeId);
    if (a?.status === 'INADIMPLENTE') return res.status(402).json({ error: 'Assinatura com fatura em atraso: a paróquia está em modo somente leitura. Regularize em "Assinatura".' });
    if (a?.status === 'CANCELADA') return res.status(402).json({ error: 'Assinatura cancelada: a paróquia está em modo somente leitura.' });
    next();
  } catch (e) { next(e); }
}

export async function checarLimite(unidadeId: string, tipo: 'membros' | 'usuarios') {
  const p = await db.get('SELECT p.limiteMembros, p.limiteUsuarios, p.nome FROM assinaturas a JOIN planos p ON p.id = a.planoId WHERE a.unidadeId = ?', unidadeId);
  if (!p) return;
  const limite = tipo === 'membros' ? p.limiteMembros : p.limiteUsuarios;
  if (limite == null) return;
  const uso = tipo === 'membros'
    ? (await db.get(`SELECT COUNT(*) AS n FROM membros WHERE unidadeId = ? AND status = 'ATIVO'`, unidadeId)).n
    : (await db.get('SELECT COUNT(*) AS n FROM usuarios WHERE unidadeId = ? AND ativo = 1', unidadeId)).n;
  if (uso >= limite) throw bad(`Limite do plano ${p.nome} atingido (${limite} ${tipo}). Faça upgrade em "Assinatura".`, 402);
}

// ---------- rotas da sede ----------
export const sedeBilling = Router();
sedeBilling.use(exigirRole('SUPER_ADMIN'));

sedeBilling.get('/planos', wrap(async () => { await garantirPlanos(); return db.all('SELECT * FROM planos ORDER BY ordem, nome'); }));
sedeBilling.put('/planos', wrap(async req => {
  const b = req.body || {}, nome = str(b.nome, 60), preco = Number(b.precoMensal);
  if (!nome || !Number.isFinite(preco) || preco < 0) throw bad('Nome e preço válidos são obrigatórios');
  const lim = (v: any) => (v === null || v === '' || v === undefined ? null : Math.max(0, Math.floor(Number(v))));
  const lm = lim(b.limiteMembros), lu = lim(b.limiteUsuarios);
  if ((lm !== null && Number.isNaN(lm)) || (lu !== null && Number.isNaN(lu))) throw bad('Limite inválido');
  const id = b.id && await db.get('SELECT 1 AS x FROM planos WHERE id = ?', b.id) ? String(b.id) : uid('pl');
  const ordem = (await db.get('SELECT COALESCE(MAX(ordem),-1)+1 AS n FROM planos')).n;
  await db.run(`INSERT INTO planos (id,nome,precoMensal,limiteMembros,limiteUsuarios,ativo,ordem) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT (id) DO UPDATE SET nome=excluded.nome, precoMensal=excluded.precoMensal, limiteMembros=excluded.limiteMembros, limiteUsuarios=excluded.limiteUsuarios, ativo=excluded.ativo`,
    id, nome, r2(preco), lm, lu, b.ativo === false ? 0 : 1, ordem);
  return { id };
}));

sedeBilling.get('/cobranca', wrap(async () => {
  await rodarCobranca();
  const assinaturas = await db.all(`SELECT u.id AS unidadeId, u.nome, u.distrito, a.status, a.trialAte, p.id AS planoId, p.nome AS plano, p.precoMensal,
      CAST((SELECT COUNT(*) FROM faturas f WHERE f.unidadeId = u.id AND f.status = 'ABERTA') AS INTEGER) AS abertas,
      COALESCE((SELECT SUM(f.valor) FROM faturas f WHERE f.unidadeId = u.id AND f.status = 'ABERTA'), 0) AS emAberto
    FROM unidades u JOIN assinaturas a ON a.unidadeId = u.id JOIN planos p ON p.id = a.planoId
    WHERE u.isSede = 0 AND u.status = 'ATIVA' ORDER BY u.nome`);
  const mes = mesAtual();
  const recebidoMes = (await db.get(`SELECT COALESCE(SUM(valor),0) AS s FROM faturas WHERE status = 'PAGA' AND substr(pagoEm,1,7) = ?`, mes)).s;
  const mrr = assinaturas.filter(a => a.status === 'ATIVA' || a.status === 'INADIMPLENTE').reduce((s, a) => s + a.precoMensal, 0);
  return {
    assinaturas,
    gateway: { ativo: asaasAtivo(), ambiente: asaasAtivo() ? asaasAmbiente() : null },
    kpis: { mrr: r2(mrr), recebidoMes: r2(recebidoMes), inadimplentes: assinaturas.filter(a => a.status === 'INADIMPLENTE').length, emTrial: assinaturas.filter(a => a.status === 'TRIAL').length },
  };
}));
sedeBilling.get('/faturas', wrap(async req => {
  const w: string[] = [], p: any[] = [];
  if (req.query.status) { w.push('f.status = ?'); p.push(String(req.query.status)); }
  if (req.query.competencia) { w.push('f.competencia = ?'); p.push(String(req.query.competencia)); }
  return db.all(`SELECT f.*, u.nome AS paroquia FROM faturas f JOIN unidades u ON u.id = f.unidadeId ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY f.vencimento DESC, u.nome LIMIT 300`, ...p);
}));
sedeBilling.post('/faturas/gerar', wrap(async req => {
  const c = String(req.body?.competencia || mesAtual());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c)) throw bad('Competência inválida (AAAA-MM)');
  const criadas = await gerarFaturas(c); await atualizarStatus(); return { criadas };
}));
// Fatura avulsa (cobrança retroativa, taxa extra ou ajuste)
sedeBilling.post('/faturas', wrap(async req => {
  const b = req.body || {}, valor = Number(b.valor);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.competencia || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.vencimento || '') || !Number.isFinite(valor) || valor <= 0) throw bad('Informe competência (AAAA-MM), vencimento (AAAA-MM-DD) e valor positivo');
  const a = await db.get('SELECT planoId FROM assinaturas WHERE unidadeId = ?', String(b.unidadeId || ''));
  if (!a) throw bad('Paróquia sem assinatura', 404);
  if (await db.get('SELECT 1 AS x FROM faturas WHERE unidadeId = ? AND competencia = ?', b.unidadeId, b.competencia)) throw bad('Já existe fatura desta competência', 409);
  const id = uid('fa');
  await db.run('INSERT INTO faturas (id,unidadeId,competencia,planoId,valor,vencimento,status,criadoEm) VALUES (?,?,?,?,?,?,?,?)', id, b.unidadeId, b.competencia, a.planoId, r2(valor), b.vencimento, 'ABERTA', agora());
  await atualizarStatus();
  return { id };
}));
sedeBilling.post('/faturas/:id/pagar', wrap(async req => {
  const meio = ['PIX', 'BOLETO', 'CARTAO', 'MANUAL'].includes(req.body?.meio) ? req.body.meio : 'MANUAL';
  const data = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.pagoEm || '') ? req.body.pagoEm : hoje();
  const ok = await pagarFatura(String(req.params.id), meio, data);
  if (ok) await auditar(req, 'FATURA_PAGA', 'fatura', String(req.params.id), meio);
  return { ok: true };
}));
sedeBilling.post('/faturas/:id/cancelar', wrap(async req => {
  const antes = await db.get(`SELECT asaasPaymentId FROM faturas WHERE id=? AND status='ABERTA'`, String(req.params.id));
  const r = await db.run(`UPDATE faturas SET status='CANCELADA' WHERE id=? AND status='ABERTA'`, String(req.params.id));
  if (!r.changes) throw bad('Fatura aberta não encontrada', 404);
  if (antes?.asaasPaymentId) await cancelarCobranca(antes.asaasPaymentId); // melhor esforço: evita que a paróquia pague uma fatura cancelada
  await atualizarStatus(); return { ok: true };
}));
sedeBilling.patch('/assinaturas/:unidadeId', wrap(async req => {
  const id = String(req.params.unidadeId), b = req.body || {};
  if (!(await db.get('SELECT 1 AS x FROM assinaturas WHERE unidadeId = ?', id))) throw bad('Assinatura não encontrada', 404);
  if (b.planoId) {
    if (!(await db.get('SELECT 1 AS x FROM planos WHERE id = ?', b.planoId))) throw bad('Plano não encontrado', 404);
    await db.run('UPDATE assinaturas SET planoId = ? WHERE unidadeId = ?', b.planoId, id);
  }
  if (b.status === 'CANCELADA') await db.run(`UPDATE assinaturas SET status='CANCELADA' WHERE unidadeId=?`, id);
  if (b.status === 'ATIVA') await db.run(`UPDATE assinaturas SET status='ATIVA' WHERE unidadeId=?`, id);
  await atualizarStatus();
  return { ok: true };
}));

// ---------- rotas da paróquia ----------
export const paroquiaBilling = Router();
paroquiaBilling.get('/assinatura', exigirRole('ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO'), wrap(async req => {
  const t = tenant(req);
  await garantirAssinatura(t);
  const un = await db.get('SELECT cpfCnpj, asaasCustomerId FROM unidades WHERE id = ?', t);
  const a = await db.get(`SELECT a.status, a.trialAte, p.id AS planoId, p.nome AS plano, p.precoMensal, p.limiteMembros, p.limiteUsuarios
    FROM assinaturas a JOIN planos p ON p.id = a.planoId WHERE a.unidadeId = ?`, t);
  const uso = {
    membros: (await db.get(`SELECT COUNT(*) AS n FROM membros WHERE unidadeId = ? AND status = 'ATIVO'`, t)).n,
    usuarios: (await db.get('SELECT COUNT(*) AS n FROM usuarios WHERE unidadeId = ? AND ativo = 1', t)).n,
  };
  return {
    ...a, uso, trialDias: TRIAL_DIAS, carenciaDias: CARENCIA_DIAS, pix: process.env.PIX_CHAVE || null,
    documento: un?.cpfCnpj ?? null, documentoTravado: !!un?.asaasCustomerId, pagamentoOnline: asaasAtivo(),
    faturas: await db.all('SELECT id,competencia,valor,vencimento,status,pagoEm,meio,linkPagamento FROM faturas WHERE unidadeId = ? ORDER BY competencia DESC LIMIT 12', t),
    planos: await db.all('SELECT id,nome,precoMensal,limiteMembros,limiteUsuarios FROM planos WHERE ativo = 1 ORDER BY ordem'),
  };
}));
// CNPJ/CPF usado na cobrança (o gateway exige). Depois que o cliente existe no gateway, só a sede altera.
paroquiaBilling.post('/assinatura/documento', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const t = tenant(req), doc = documentoValido(req.body?.cpfCnpj);
  if (!doc) throw bad('CNPJ ou CPF inválido');
  const u = await db.get('SELECT asaasCustomerId FROM unidades WHERE id = ?', t);
  if (u?.asaasCustomerId) throw bad('O documento já foi enviado ao gateway de pagamento. Para alterá-lo, fale com a sede.', 409);
  await db.run('UPDATE unidades SET cpfCnpj = ? WHERE id = ?', doc, t);
  await auditar(req, 'DOCUMENTO_COBRANCA', 'paroquia', t);
  await cobrarFaturasAbertas(); // já gera as cobranças das faturas que estavam esperando o documento
  return { ok: true };
}));
// Link de pagamento (Pix/boleto/cartão) de uma fatura da própria paróquia
paroquiaBilling.post('/assinatura/faturas/:id/pagar', exigirRole('ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO'), wrap(async req => {
  const f = await db.get('SELECT id FROM faturas WHERE id = ? AND unidadeId = ?', String(req.params.id), tenant(req));
  if (!f) throw bad('Fatura não encontrada', 404);
  return { url: await cobrarFatura(f.id) };
}));
paroquiaBilling.post('/assinatura/plano', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const t = tenant(req);
  const novo = await db.get('SELECT * FROM planos WHERE id = ? AND ativo = 1', String(req.body?.planoId || ''));
  if (!novo) throw bad('Plano não encontrado', 404);
  const atual = await db.get('SELECT status, trialAte FROM assinaturas WHERE unidadeId = ?', t);
  if (atual?.status === 'INADIMPLENTE' || atual?.status === 'CANCELADA') throw bad('Regularize as faturas em atraso antes de trocar de plano.', 402);
  const m = (await db.get(`SELECT COUNT(*) AS n FROM membros WHERE unidadeId = ? AND status = 'ATIVO'`, t)).n;
  const u = (await db.get('SELECT COUNT(*) AS n FROM usuarios WHERE unidadeId = ? AND ativo = 1', t)).n;
  if (novo.limiteMembros != null && m > novo.limiteMembros) throw bad(`Você tem ${m} membros ativos; o plano ${novo.nome} permite ${novo.limiteMembros}.`);
  if (novo.limiteUsuarios != null && u > novo.limiteUsuarios) throw bad(`Você tem ${u} usuários ativos; o plano ${novo.nome} permite ${novo.limiteUsuarios}.`);
  let trialAte = atual?.trialAte ?? null, status = atual?.status ?? 'ATIVA';
  if (novo.precoMensal > 0 && !trialAte) { trialAte = somaDias(hoje(), TRIAL_DIAS); status = 'TRIAL'; } // trial só na 1ª vez
  if (novo.precoMensal === 0 && status === 'TRIAL') status = 'ATIVA';
  await db.run('UPDATE assinaturas SET planoId = ?, status = ?, trialAte = ? WHERE unidadeId = ?', novo.id, status, trialAte, t);
  await auditar(req, 'PLANO_ALTERADO', 'assinatura', t, novo.nome);
  return { ok: true };
}));

// ---------- webhook de gateway (assinado) ----------
export const webhookBilling = Router();
webhookBilling.post('/pagamento', async (req: Request & { rawBody?: Buffer }, res: Response, next: NextFunction) => {
  try {
    const secret = process.env.BILLING_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: 'Webhook não configurado' });
    const esperado = crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.alloc(0)).digest();
    const recebido = Buffer.from(String(req.headers['x-signature'] || ''), 'hex');
    if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) return res.status(401).json({ error: 'Assinatura inválida' });
    const b = req.body || {};
    const f = await db.get('SELECT id, valor FROM faturas WHERE id = ?', String(b.faturaId || ''));
    if (!f) return res.status(404).json({ error: 'Fatura não encontrada' });
    if (b.status !== 'PAGA') return res.json({ ok: true, ignorado: true });
    if (Number(b.valor) + 0.005 < f.valor) return res.status(422).json({ error: 'Valor inferior ao da fatura' });
    await pagarFatura(f.id, ['PIX', 'BOLETO', 'CARTAO'].includes(b.meio) ? b.meio : 'MANUAL', hoje(), str(b.referencia, 100));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
