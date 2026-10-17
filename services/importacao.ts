import Papa from 'papaparse';
import * as XLSX from '@e965/xlsx';

/** Leitura de arquivos no navegador: CSV, Excel (xls/xlsx), PDF com texto e OFX. Tudo vira uma grade de textos. */
export type Grade = string[][];
const limpar = (g: any[][]): Grade => g.map(l => l.map(c => String(c ?? '').replace(/\s+/g, ' ').trim())).filter(l => l.some(c => c !== ''));

export function decodificar(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buf); } // exportações do Excel/bancos brasileiros
}

export function lerCsv(buf: ArrayBuffer): Grade {
  const r = Papa.parse<string[]>(decodificar(buf), { skipEmptyLines: true, delimitersToGuess: [';', ',', '\t', '|'] });
  return limpar(r.data as any[][]);
}

const doisDig = (n: number) => String(n).padStart(2, '0');
export function lerPlanilha(buf: ArrayBuffer): Grade {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[nome], { header: 1, raw: true, defval: '', blankrows: false });
    const g = limpar(linhas.map(l => l.map(c => (c instanceof Date ? `${c.getFullYear()}-${doisDig(c.getMonth() + 1)}-${doisDig(c.getDate())}` : typeof c === 'number' ? String(c) : c))));
    if (g.length) return g;
  }
  return [];
}

/** PDF com camada de texto (não escaneado): agrupa o texto por linha e separa colunas pelos espaços largos. */
export async function lerPdf(buf: ArrayBuffer, pdfjs: any): Promise<Grade> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)), useSystemFonts: true, isEvalSupported: false }).promise;
  const saida: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const itens = ((await (await doc.getPage(p)).getTextContent()).items as any[]).filter(i => String(i.str).trim() !== '');
    const linhas: { y: number; itens: any[] }[] = [];
    for (const it of itens.sort((a, b) => b.transform[5] - a.transform[5])) {
      const y = it.transform[5], l = linhas.find(x => Math.abs(x.y - y) <= 2.5);
      if (l) l.itens.push(it); else linhas.push({ y, itens: [it] });
    }
    for (const l of linhas) {
      const cel: string[] = []; let fimAnt = -1e9, atual = '';
      for (const it of l.itens.sort((a, b) => a.transform[4] - b.transform[4])) {
        const x = it.transform[4], gap = x - fimAnt, larg = it.width || 0;
        if (atual && gap > 5) { cel.push(atual); atual = it.str; } else atual += (atual && gap > 0.8 ? ' ' : '') + it.str;
        fimAnt = x + larg;
      }
      if (atual) cel.push(atual);
      saida.push(cel.flatMap(c => c.split(/\s{2,}|\t/)));
    }
  }
  return limpar(saida);
}

export async function lerArquivo(nome: string, buf: ArrayBuffer, pdfjs?: () => Promise<any>): Promise<Grade> {
  const ext = nome.toLowerCase().split('.').pop() || '';
  if (['csv', 'txt', 'tsv'].includes(ext)) return lerCsv(buf);
  if (['xls', 'xlsx', 'xlsm', 'ods'].includes(ext)) return lerPlanilha(buf);
  if (ext === 'pdf') { if (!pdfjs) throw new Error('Leitura de PDF indisponível'); return lerPdf(buf, await pdfjs()); }
  throw new Error('Formato não suportado. Use CSV, XLS, XLSX ou PDF.');
}

// ------------------------------------------------------------------ valores
export function dataIso(v: string): string | null {
  const s = String(v ?? '').trim(); if (!s) return null;
  let a: number, m: number, d: number, x: RegExpMatchArray | null;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { a = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/))) { d = +x[1]; m = +x[2]; a = +x[3]; if (x[3].length === 2) a += a > (new Date().getFullYear() % 100) ? 1900 : 2000; }
  else if (/^\d{5}(\.\d+)?$/.test(s)) { const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000); return dt.toISOString().slice(0, 10); } // serial do Excel
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}
export function valorBr(v: string): number | null {
  let s = String(v ?? '').replace(/[R$\s]/g, '').replace(/^\((.*)\)$/, '-$1'); if (!s) return null;
  const neg = /-$/.test(s) || /^-/.test(s); s = s.replace(/[-+]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s); return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// ------------------------------------------------------------------ membros
export type CampoMembro = 'nome' | 'dataNascimento' | 'telefone' | 'email' | 'endereco' | 'profissao' | 'dataBatismo' | 'dataConfirmacao' | 'status' | 'ofertaMensalValor';
export const CAMPOS_MEMBRO: { campo: CampoMembro; rotulo: string }[] = [
  { campo: 'nome', rotulo: 'Nome *' }, { campo: 'dataNascimento', rotulo: 'Data de nascimento' }, { campo: 'telefone', rotulo: 'Telefone' }, { campo: 'email', rotulo: 'E-mail' },
  { campo: 'endereco', rotulo: 'Endereço' }, { campo: 'profissao', rotulo: 'Profissão' }, { campo: 'dataBatismo', rotulo: 'Data do batismo' }, { campo: 'dataConfirmacao', rotulo: 'Data da confirmação' },
  { campo: 'status', rotulo: 'Situação' }, { campo: 'ofertaMensalValor', rotulo: 'Oferta mensal (R$)' },
];
const SIN: Record<CampoMembro, string[]> = {
  nome: ['nome', 'nome completo', 'membro', 'nome do membro'],
  dataNascimento: ['nascimento', 'data de nascimento', 'data nascimento', 'dt nascimento', 'dt nasc', 'data nasc', 'aniversario', 'nasc'],
  telefone: ['telefone', 'fone', 'celular', 'whatsapp', 'tel', 'contato'],
  email: ['email', 'e-mail', 'correio eletronico'],
  endereco: ['endereco', 'logradouro', 'rua', 'residencia'],
  profissao: ['profissao', 'ocupacao'],
  dataBatismo: ['batismo', 'data do batismo', 'data batismo', 'dt batismo'],
  dataConfirmacao: ['confirmacao', 'data da confirmacao', 'data confirmacao', 'dt confirmacao'],
  status: ['situacao', 'status', 'condicao'],
  ofertaMensalValor: ['oferta mensal', 'oferta', 'contribuicao', 'contribuicao mensal', 'valor mensal'],
};
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function detectarColunas(g: Grade): { cabecalho: boolean; inicio: number; mapa: Partial<Record<CampoMembro, number>> } {
  // o cabeçalho pode não estar na 1ª linha (ex.: PDF com título acima da tabela): procura nas 8 primeiras
  for (let k = 0; k < Math.min(8, g.length); k++) {
    const mapa: Partial<Record<CampoMembro, number>> = {}, h = g[k].map(semAcento);
    (Object.keys(SIN) as CampoMembro[]).forEach(c => { const i = h.findIndex(x => SIN[c].includes(x)); if (i >= 0 && !Object.values(mapa).includes(i)) mapa[c] = i; });
    if (mapa.nome !== undefined) return { cabecalho: true, inicio: k, mapa };
  }
  // sem cabeçalho: adivinha pelo conteúdo das colunas
  const amostra = g.slice(0, 20), cols = Math.max(...amostra.map(l => l.length), 0), pontos = (re: RegExp | ((s: string) => boolean), i: number) => amostra.filter(l => (typeof re === 'function' ? re(l[i] || '') : re.test(l[i] || ''))).length;
  const m: Partial<Record<CampoMembro, number>> = {};
  for (let i = 0; i < cols; i++) {
    if (m.email === undefined && pontos(/^\S+@\S+\.\S+$/, i) >= amostra.length / 2) m.email = i;
    else if (m.dataNascimento === undefined && pontos(s => !!dataIso(s) && /\d/.test(s), i) >= amostra.length / 2) m.dataNascimento = i;
    else if (m.telefone === undefined && pontos(/^[\d\s().+-]{8,}$/, i) >= amostra.length / 2) m.telefone = i;
  }
  const usadas = Object.values(m); const ci = Array.from({ length: cols }, (_, i) => i).find(i => !usadas.includes(i) && pontos(/[A-Za-zÀ-ÿ]{2,}/, i) >= amostra.length / 2);
  if (ci !== undefined) m.nome = ci;
  return { cabecalho: false, inicio: 0, mapa: m };
}

export interface LinhaMembro { linha: number; nome: string; dataNascimento?: string; telefone?: string; email?: string; endereco?: string; profissao?: string; dataBatismo?: string; dataConfirmacao?: string; status?: string; ofertaMensalValor?: number; avisos: string[] }
export function montarMembros(g: Grade, mapa: Partial<Record<CampoMembro, number>>, cabecalho: boolean, inicio = 0): LinhaMembro[] {
  const out: LinhaMembro[] = [], pula = cabecalho ? inicio + 1 : 0;
  g.slice(pula).forEach((l, idx) => {
    const v = (c: CampoMembro) => (mapa[c] === undefined ? '' : String(l[mapa[c]!] ?? '').trim());
    const nome = v('nome'); if (!nome) return;
    const avisos: string[] = [], reg: LinhaMembro = { linha: idx + 1 + pula, nome, avisos };
    for (const c of ['dataNascimento', 'dataBatismo', 'dataConfirmacao'] as const) { const t = v(c); if (t) { const d = dataIso(t); if (d) reg[c] = d; else avisos.push(`${c === 'dataNascimento' ? 'Nascimento' : c === 'dataBatismo' ? 'Batismo' : 'Confirmação'} "${t}" não reconhecido`); } }
    for (const c of ['telefone', 'email', 'endereco', 'profissao'] as const) if (v(c)) reg[c] = v(c);
    const st = semAcento(v('status')); if (st) reg.status = st.startsWith('ina') ? 'INATIVO' : st.startsWith('transf') ? 'TRANSFERIDO' : st.startsWith('fal') || st.startsWith('obito') ? 'FALECIDO' : 'ATIVO';
    if (v('ofertaMensalValor')) { const n = valorBr(v('ofertaMensalValor')); if (n !== null && n >= 0) reg.ofertaMensalValor = n; else avisos.push('Oferta mensal não reconhecida'); }
    out.push(reg);
  });
  return out;
}
export const MODELO_CSV = 'Nome;Data de nascimento;Telefone;E-mail;Endereço;Profissão;Data do batismo;Data da confirmação;Situação;Oferta mensal\nMaria da Silva;15/03/1980;(51) 99999-0000;maria@email.com;Rua das Flores, 100;Professora;10/05/1981;20/11/1994;Ativo;80,00\n';
