import { Router, type Request, type Response } from 'express';
import { db, uid } from './db';
import { wrap, bad, r2, mesAtual } from './http';

/**
 * Painel financeiro consolidado da sede (somente SUPER_ADMIN; montado dentro de /sede).
 * Regra de negócio assumida (ajustável):
 *  - Base de cálculo do mês = lançamentos ENTRADA de categoria OFERTA + DIZIMO da paróquia.
 *  - Cada cota = percentual sobre essa base. Padrão: DIVASI 3% e IELB 6%, com ajuste por paróquia.
 *  - Vencimento = dia 10 do mês seguinte à competência.
 * A sede enxerga apenas totais por paróquia, nunca os lançamentos individuais.
 */
const f = Router();
const q = <T = any>(sql: string, ...p: any[]) => db.all<T>(sql, ...p);
const one = <T = any>(sql: string, ...p: any[]) => db.get<T>(sql, ...p);
const run = (sql: string, ...p: any[]) => db.run(sql, ...p);
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
const existe = async (t: string, id: string) => !!(await one(`SELECT 1 AS x FROM ${t} WHERE id=?`, id));
const competencia = (v: any) => { const c = String(v || mesAtual()); if (!COMP.test(c)) throw bad('Competência inválida (use AAAA-MM)'); return c; };

async function cotasGlobais() {
  if (!(await one('SELECT 1 AS x FROM cotas_globais'))) {
    await run('INSERT INTO cotas_globais (id,nome,percent,ordem) VALUES (?,?,?,0)', uid('ct'), 'Contribuição DIVASI', 3);
    await run('INSERT INTO cotas_globais (id,nome,percent,ordem) VALUES (?,?,?,1)', uid('ct'), 'Contribuição IELB', 6);
  }
  return await q<{ id: string; nome: string; percent: number }>('SELECT id,nome,percent FROM cotas_globais ORDER BY ordem, nome');
}

function vencimento(comp: string) {
  const [y, m] = comp.split('-').map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 10, 23, 59, 59));
}
function statusDe(comp: string, devido: number, rep?: { valorPago: number; valorDevido: number }) {
  if (rep) return rep.valorPago + 0.005 >= rep.valorDevido ? 'PAGO' : 'PARCIAL';
  if (devido <= 0) return 'SEM_MOVIMENTO';
  return Date.now() > vencimento(comp).getTime() ? 'ATRASADO' : 'PENDENTE';
}

async function calcular(comp: string) {
  const cotas = await cotasGlobais();
  const ativas = await q(`SELECT id,nome,distrito,tipo FROM unidades WHERE isSede = 0 AND status = 'ATIVA' ORDER BY nome`);
  const paroquias = [];
  for (const u of ativas) {
    const base = r2((await one(`SELECT COALESCE(SUM(valor),0) AS s FROM lancamentos WHERE unidadeId=? AND tipo='ENTRADA' AND categoria IN ('OFERTA','DIZIMO') AND substr(data,1,7)=?`, u.id, comp))!.s);
    const over = new Map((await q('SELECT cotaId,percent FROM cotas_paroquia WHERE unidadeId=?', u.id)).map(o => [o.cotaId, o.percent]));
    const itens = cotas.map(c => {
      const percent = over.get(c.id) ?? c.percent;
      return { cotaId: c.id, nome: c.nome, percent, personalizada: over.has(c.id), valor: r2(base * percent / 100) };
    });
    const calculado = r2(itens.reduce((s, i) => s + i.valor, 0));
    const rep = await one('SELECT valorDevido,valorPago,pagoEm,obs FROM repasses WHERE unidadeId=? AND competencia=?', u.id, comp);
    const devido = rep ? rep.valorDevido : calculado;
    paroquias.push({ id: u.id, nome: u.nome, distrito: u.distrito, tipo: u.tipo, base, cotas: itens, devido, valorPago: rep?.valorPago ?? 0, pagoEm: rep?.pagoEm ?? null, obs: rep?.obs ?? null, status: statusDe(comp, devido, rep) });
  }
  const totais = {
    base: r2(paroquias.reduce((s, p) => s + p.base, 0)),
    devido: r2(paroquias.reduce((s, p) => s + p.devido, 0)),
    pago: r2(paroquias.reduce((s, p) => s + p.valorPago, 0)),
  };
  const cobraveis = paroquias.filter(p => p.status !== 'SEM_MOVIMENTO');
  const adimplentes = cobraveis.filter(p => p.status === 'PAGO').length;
  return { competencia: comp, vencimento: vencimento(comp).toISOString().slice(0, 10), cotas, paroquias, totais: { ...totais, aReceber: r2(Math.max(0, totais.devido - totais.pago)), adimplencia: cobraveis.length ? Math.round(adimplentes / cobraveis.length * 100) : null } };
}

f.get('/financeiro', wrap(async req => calcular(competencia(req.query.competencia))));

f.get('/financeiro/historico', wrap(async req => {
  const n = Math.min(24, Math.max(1, +(req.query.meses as string) || 6));
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const c = x.toISOString().slice(0, 7);
    const { totais } = await calcular(c);
    out.push({ competencia: c, base: totais.base, devido: totais.devido, pago: totais.pago });
  }
  return out;
}));

// Cotas globais (substitui a lista inteira)
f.put('/cotas', wrap(async req => {
  const lista = req.body?.cotas;
  if (!Array.isArray(lista) || lista.length === 0) throw bad('Informe ao menos uma cota');
  let total = 0;
  const limpas = await Promise.all(lista.map(async (c: any, i: number) => {
    const nome = String(c?.nome || '').trim().slice(0, 80), percent = Number(c?.percent);
    if (!nome || !Number.isFinite(percent) || percent < 0 || percent > 100) throw bad('Cota inválida: nome obrigatório e percentual entre 0 e 100');
    total += percent;
    return { id: typeof c.id === 'string' && (await existe('cotas_globais', c.id)) ? c.id : uid('ct'), nome, percent, ordem: i };
  }));
  if (total > 100) throw bad('A soma das cotas não pode passar de 100%');
  await db.tx(async c => {
    const manter = limpas.map(x => x.id);
    for (const x of await c.all('SELECT id FROM cotas_globais')) if (!manter.includes(x.id)) await c.run('DELETE FROM cotas_globais WHERE id=?', x.id);
    for (const x of limpas) await c.run('INSERT INTO cotas_globais (id,nome,percent,ordem) VALUES (?,?,?,?) ON CONFLICT (id) DO UPDATE SET nome=excluded.nome,percent=excluded.percent,ordem=excluded.ordem', x.id, x.nome, x.percent, x.ordem);
  });
  return await cotasGlobais();
}));

// Percentuais específicos de uma paróquia ({ cotaId: percent }); objeto vazio = voltar ao padrão
f.put('/paroquias/:id/cotas', wrap(async req => {
  const id = String(req.params.id);
  if (!(await one('SELECT 1 AS x FROM unidades WHERE id=? AND isSede=0', id))) throw bad('Paróquia não encontrada', 404);
  const ov = req.body?.overrides && typeof req.body.overrides === 'object' ? req.body.overrides : {};
  const globais = await cotasGlobais();
  let total = 0;
  const finais = globais.map(g => { const v = ov[g.id] == null ? g.percent : Number(ov[g.id]); if (!Number.isFinite(v) || v < 0 || v > 100) throw bad('Percentual inválido'); total += v; return { g, v }; });
  if (total > 100) throw bad('A soma das cotas não pode passar de 100%');
  await db.tx(async c => {
    await c.run('DELETE FROM cotas_paroquia WHERE unidadeId=?', id);
    for (const { g, v } of finais) if (ov[g.id] != null && v !== g.percent) await c.run('INSERT INTO cotas_paroquia (unidadeId,cotaId,percent) VALUES (?,?,?)', id, g.id, v);
  });
  return { ok: true };
}));

// Registrar / desfazer recebimento do repasse de uma paróquia numa competência
f.post('/repasses', wrap(async req => {
  const b = req.body || {}, comp = competencia(b.competencia), id = String(b.unidadeId || '');
  if (!(await one('SELECT 1 AS x FROM unidades WHERE id=? AND isSede=0', id))) throw bad('Paróquia não encontrada', 404);
  if (b.pago === false) { await run('DELETE FROM repasses WHERE unidadeId=? AND competencia=?', id, comp); return { ok: true }; }
  const atual = (await calcular(comp)).paroquias.find(p => p.id === id);
  const devido = atual ? atual.devido : 0;
  const pago = b.valorPago == null || b.valorPago === '' ? devido : Number(b.valorPago);
  if (!Number.isFinite(pago) || pago < 0) throw bad('Valor pago inválido');
  const data = b.pagoEm && /^\d{4}-\d{2}-\d{2}$/.test(b.pagoEm) ? b.pagoEm : new Date().toISOString().slice(0, 10);
  await run('INSERT INTO repasses (unidadeId,competencia,valorDevido,valorPago,pagoEm,obs) VALUES (?,?,?,?,?,?) ON CONFLICT(unidadeId,competencia) DO UPDATE SET valorPago=excluded.valorPago,pagoEm=excluded.pagoEm,obs=excluded.obs',
    id, comp, devido, r2(pago), data, b.obs ? String(b.obs).slice(0, 300) : null);
  return { ok: true };
}));

export default f;
