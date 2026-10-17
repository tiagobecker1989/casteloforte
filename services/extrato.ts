import { decodificar, dataIso, valorBr, type Grade } from './importacao';

/** Extrato bancário (OFX ou grade CSV/planilha) -> lançamentos para conciliação. Valor negativo = saída. */
export interface ItemExtrato { id?: string; data: string; valor: number; descricao: string; nome?: string }

export function lerOfx(buf: ArrayBuffer): ItemExtrato[] {
  const txt = decodificar(buf), itens: ItemExtrato[] = [];
  const campo = (bloco: string, tag: string) => { const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
  for (const bloco of txt.split(/<STMTTRN>/i).slice(1)) {
    const d = campo(bloco, 'DTPOSTED').slice(0, 8), valor = Number(campo(bloco, 'TRNAMT').replace(',', '.'));
    const data = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '';
    if (!data || !Number.isFinite(valor) || valor === 0) continue;
    const memo = campo(bloco, 'MEMO'), nome = campo(bloco, 'NAME');
    itens.push({ id: campo(bloco, 'FITID') || undefined, data, valor, descricao: memo || nome || 'Lançamento', nome: nome || undefined });
  }
  return itens;
}

const sa = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export interface MapaExtrato { data?: number; descricao?: number; valor?: number; credito?: number; debito?: number; nome?: number }
export function detectarExtrato(g: Grade): { cabecalho: boolean; inicio: number; mapa: MapaExtrato } {
  for (let k = 0; k < Math.min(8, g.length); k++) {
  const h = g[k].map(sa), idx = (...ns: string[]) => h.findIndex(x => ns.some(n => x === n || x.includes(n)));
  const mapa: MapaExtrato = { data: idx('data'), descricao: idx('descricao', 'historico', 'lancamento', 'detalhe'), valor: idx('valor'), credito: idx('credito', 'entrada'), debito: idx('debito', 'saida'), nome: idx('favorecido', 'pagador', 'contraparte', 'nome') };
  (Object.keys(mapa) as (keyof MapaExtrato)[]).forEach(k => { if (mapa[k]! < 0) delete mapa[k]; });
  if (mapa.data !== undefined && (mapa.valor !== undefined || mapa.credito !== undefined || mapa.debito !== undefined)) return { cabecalho: true, inicio: k, mapa };
  }
  const amostra = g.slice(0, 15), m: MapaExtrato = {};
  const cols = Math.max(...amostra.map(l => l.length), 0);
  for (let i = 0; i < cols; i++) {
    if (m.data === undefined && amostra.filter(l => dataIso(l[i] || '')).length >= amostra.length / 2) m.data = i;
    else if (m.valor === undefined && amostra.filter(l => valorBr(l[i] || '') !== null && /\d[,.]\d{2}$/.test((l[i] || '').trim())).length >= amostra.length / 2) m.valor = i;
  }
  const t = Array.from({ length: cols }, (_, i) => i).find(i => i !== m.data && i !== m.valor && amostra.filter(l => /[A-Za-z]{3,}/.test(l[i] || '')).length >= amostra.length / 2);
  if (t !== undefined) m.descricao = t;
  return { cabecalho: false, inicio: 0, mapa: m };
}
export function montarExtrato(g: Grade, mapa: MapaExtrato, cabecalho: boolean, inicio = 0): { itens: ItemExtrato[]; ignoradas: number } {
  const itens: ItemExtrato[] = []; let ignoradas = 0;
  for (const l of g.slice(cabecalho ? inicio + 1 : 0)) {
    const data = mapa.data === undefined ? null : dataIso(l[mapa.data] || '');
    let valor: number | null = null;
    if (mapa.valor !== undefined) valor = valorBr(l[mapa.valor] || '');
    else { const c = mapa.credito === undefined ? null : valorBr(l[mapa.credito] || ''), d = mapa.debito === undefined ? null : valorBr(l[mapa.debito] || ''); valor = c ? Math.abs(c) : d ? -Math.abs(d) : null; }
    if (!data || valor === null || valor === 0) { ignoradas++; continue; }
    itens.push({ data, valor, descricao: String(mapa.descricao === undefined ? '' : l[mapa.descricao] || '').slice(0, 200) || 'Lançamento', nome: mapa.nome === undefined ? undefined : l[mapa.nome] || undefined });
  }
  return { itens, ignoradas };
}
