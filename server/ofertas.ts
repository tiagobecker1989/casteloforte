import { Router } from 'express';
import { db, uid } from './db';
import { exigirPerm, tenant } from './auth';
import { wrap, bad, str, r2, dataValida, competenciaValida, mesAtual, hoje } from './http';
import { auditar } from './audit';

const r = Router();
const VER = ['ofertas.ver'];
const LANCAR = ['ofertas.criar'];
const FORMAS = ['PIX', 'DINHEIRO', 'TRANSFERENCIA', 'CHEQUE', 'OUTRO'];

r.get('/ofertas/config', exigirPerm(...VER), wrap(async req => ({ diaOferta: (await db.get('SELECT diaOferta FROM unidades WHERE id = ?', tenant(req)))?.diaOferta ?? 10 })));
r.put('/ofertas/config', exigirPerm(...LANCAR), wrap(async req => {
  const d = Math.floor(Number(req.body?.diaOferta));
  if (!Number.isFinite(d) || d < 1 || d > 28) throw bad('Informe um dia entre 1 e 28');
  await db.run('UPDATE unidades SET diaOferta = ? WHERE id = ?', d, tenant(req));
  return { ok: true, diaOferta: d };
}));

// Ofertas lançadas por membro numa competência (mês de referência)
r.get('/ofertas', exigirPerm(...VER), wrap(async req => {
  const comp = competenciaValida(req.query.competencia) ?? mesAtual();
  const itens = await db.all(`SELECT l.id, l.valor, l.data, l.competencia, l.forma, l.descricao, l.membroId, m.nome AS membro
    FROM lancamentos l JOIN membros m ON m.id = l.membroId
    WHERE l.unidadeId = ? AND l.categoria = 'OFERTA' AND l.tipo = 'ENTRADA' AND l.competencia = ? ORDER BY l.data DESC, m.nome`, tenant(req), comp);
  return { competencia: comp, itens, total: r2(itens.reduce((s, i) => s + i.valor, 0)) };
}));

r.post('/ofertas', exigirPerm(...LANCAR), wrap(async (req, res) => {
  const t = tenant(req), b = req.body || {};
  const m = await db.get('SELECT id, nome FROM membros WHERE id = ? AND unidadeId = ? AND anonimizadoEm IS NULL', String(b.membroId ?? ''), t);
  if (!m) throw bad('Membro não encontrado nesta paróquia', 404);
  const valor = Number(b.valor), data = dataValida(b.data) ?? hoje(), comp = competenciaValida(b.competencia) ?? data.slice(0, 7);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 10_000_000) throw bad('Informe um valor positivo');
  const forma = FORMAS.includes(b.forma) ? b.forma : 'OUTRO', id = uid('la');
  await db.tx(async c => {
    await c.run(`INSERT INTO lancamentos (id,unidadeId,tipo,categoria,valor,data,descricao,membroId,competencia,forma) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id, t, 'ENTRADA', 'OFERTA', r2(valor), data, str(b.descricao, 200) || `Oferta - ${m.nome}`, m.id, comp, forma);
    await c.run('UPDATE membros SET ultimaOferta = ? WHERE id = ? AND (ultimaOferta IS NULL OR ultimaOferta < ?)', data, m.id, data);
    await auditar(req, 'OFERTA_LANCADA', 'oferta', id, comp, c);
  });
  res.status(201).json({ id });
}));

/** Membros com oferta mensal combinada (valor > 0) que ainda não cobriram o mês depois do dia de vencimento. */
export async function atrasadas(unidadeId: string, comp: string) {
  const diaOferta = (await db.get('SELECT diaOferta FROM unidades WHERE id = ?', unidadeId))?.diaOferta ?? 10;
  const vencimento = `${comp}-${String(diaOferta).padStart(2, '0')}`;
  const membros = await db.all(`SELECT id, nome, telefone, ofertaMensalValor FROM membros
    WHERE unidadeId = ? AND status = 'ATIVO' AND anonimizadoEm IS NULL AND ofertaMensalValor > 0 ORDER BY nome`, unidadeId);
  const pagos = new Map((await db.all(`SELECT membroId, SUM(valor) AS s FROM lancamentos
    WHERE unidadeId = ? AND categoria = 'OFERTA' AND tipo = 'ENTRADA' AND competencia = ? AND membroId IS NOT NULL GROUP BY membroId`, unidadeId, comp)).map(x => [x.membroId, x.s]));
  const venceu = hoje() > vencimento;
  const lista = membros.map(m => {
    const pago = r2(pagos.get(m.id) ?? 0);
    return { id: m.id, nome: m.nome, telefone: m.telefone, esperado: m.ofertaMensalValor, pago, faltante: r2(Math.max(0, m.ofertaMensalValor - pago)) };
  });
  const emAtraso = venceu ? lista.filter(m => m.faltante > 0.004) : [];
  return { competencia: comp, diaOferta, vencimento, venceu, atrasadas: emAtraso, contribuintes: lista.length, emDia: venceu ? lista.length - emAtraso.length : lista.filter(m => m.faltante <= 0.004).length };
}
r.get('/ofertas/atrasadas', exigirPerm(...VER), wrap(async req => atrasadas(tenant(req), competenciaValida(req.query.competencia) ?? mesAtual())));

export default r;
