import { Router } from 'express';
import { db } from './db';
import { exigirPerm, tenant } from './auth';
import { wrap, bad, r2, competenciaValida, mesAtual } from './http';
import { auditar } from './audit';
import { rotulos, PRINCIPAIS_ENTRADA, PRINCIPAIS_SAIDA } from './categorias';

const r = Router();

/** Relatório do mês: cada entrada e cada saída com sua descrição. Nomes de ofertantes só se pedido (dado pessoal). */
r.get('/relatorios/mensal', exigirPerm('relatorios.ver', 'despesas.ver'), wrap(async req => {
  const t = tenant(req), mes = competenciaValida(req.query.mes) ?? mesAtual(), nomes = req.query.nomes === '1';
  const rot = await rotulos(t);
  const linhas = await db.all(`SELECT l.id, l.tipo, l.categoria, l.valor, l.data, l.descricao, l.forma, m.nome AS membro
    FROM lancamentos l LEFT JOIN membros m ON m.id = l.membroId WHERE l.unidadeId = ? AND substr(l.data,1,7) = ? ORDER BY l.data, l.id`, t, mes);
  const item = (l: any) => ({ id: l.id, data: l.data, categoria: l.categoria, categoriaNome: rot(l.categoria), descricao: l.descricao || rot(l.categoria), forma: l.forma, valor: r2(l.valor), ofertante: nomes ? l.membro ?? null : undefined });
  const entradas = linhas.filter(l => l.tipo === 'ENTRADA').map(item), saidas = linhas.filter(l => l.tipo === 'SAIDA').map(item);
  const agrupar = (xs: ReturnType<typeof item>[]) => {
    const m = new Map<string, { categoria: string; nome: string; total: number; quantidade: number }>();
    xs.forEach(x => { const g = m.get(x.categoria) ?? { categoria: x.categoria, nome: x.categoriaNome, total: 0, quantidade: 0 }; g.total = r2(g.total + x.valor); g.quantidade++; m.set(x.categoria, g); });
    return [...m.values()].sort((a, b) => b.total - a.total);
  };
  const te = r2(entradas.reduce((s, x) => s + x.valor, 0)), ts = r2(saidas.reduce((s, x) => s + x.valor, 0));
  await auditar(req, 'RELATORIO_MENSAL', 'relatorio', mes, nomes ? 'com nomes' : 'sem nomes');
  return { mes, comNomes: nomes, paroquia: (await db.get('SELECT nome FROM unidades WHERE id = ?', t))?.nome, entradas, saidas, porCategoria: { entradas: agrupar(entradas), saidas: agrupar(saidas) }, totais: { entradas: te, saidas: ts, saldo: r2(te - ts) } };
}));

/** Relatório anual: uma linha por tópico, uma coluna por mês. Linhas principais sempre aparecem (mesmo zeradas). */
r.get('/relatorios/anual', exigirPerm('relatorios.ver'), wrap(async req => {
  const t = tenant(req), ano = String(req.query.ano ?? new Date().getUTCFullYear());
  if (!/^\d{4}$/.test(ano)) throw bad('Ano inválido');
  const rot = await rotulos(t);
  const soma = await db.all(`SELECT categoria, tipo, substr(data,6,2) AS mes, SUM(valor) AS total FROM lancamentos
    WHERE unidadeId = ? AND substr(data,1,4) = ? GROUP BY categoria, tipo, substr(data,6,2)`, t, ano);
  const ativos = await db.all('SELECT id, tipo FROM topicos WHERE unidadeId = ? AND ativo = 1', t);

  const montar = (tipo: 'ENTRADA' | 'SAIDA', principais: string[]) => {
    const por = new Map<string, number[]>();
    principais.forEach(c => por.set(c, Array(12).fill(0)));
    ativos.filter(a => a.tipo === tipo).forEach(a => por.set(`TOPICO:${a.id}`, por.get(`TOPICO:${a.id}`) ?? Array(12).fill(0)));
    soma.filter(s => s.tipo === tipo).forEach(s => { const v = por.get(s.categoria) ?? Array(12).fill(0); v[Number(s.mes) - 1] = r2(v[Number(s.mes) - 1] + s.total); por.set(s.categoria, v); });
    const linhas = [...por.entries()].map(([codigo, meses]) => ({ codigo, label: rot(codigo), meses, total: r2(meses.reduce((a, b) => a + b, 0)), principal: principais.includes(codigo) }));
    linhas.sort((a, b) => (a.principal === b.principal ? (a.principal ? principais.indexOf(a.codigo) - principais.indexOf(b.codigo) : a.label.localeCompare(b.label)) : a.principal ? -1 : 1));
    const totalMeses = Array.from({ length: 12 }, (_, i) => r2(linhas.reduce((s, l) => s + l.meses[i], 0)));
    return { linhas, totalMeses, total: r2(totalMeses.reduce((a, b) => a + b, 0)) };
  };
  const entradas = montar('ENTRADA', PRINCIPAIS_ENTRADA), saidas = montar('SAIDA', PRINCIPAIS_SAIDA);
  const saldoMeses = entradas.totalMeses.map((v, i) => r2(v - saidas.totalMeses[i]));
  await auditar(req, 'RELATORIO_ANUAL', 'relatorio', ano);
  return { ano, paroquia: (await db.get('SELECT nome FROM unidades WHERE id = ?', t))?.nome, entradas, saidas, saldoMeses, saldo: r2(entradas.total - saidas.total) };
}));

export default r;
