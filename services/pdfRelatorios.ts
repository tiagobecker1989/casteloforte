import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Geração de PDF desenhando direto com jsPDF (sem html2canvas): não depende de elementos na tela,
 * por isso não sai em branco. Todas as funções são puras (recebem dados, devolvem o documento).
 */
const AZUL: [number, number, number] = [0, 40, 120];
const CINZA: [number, number, number] = [100, 116, 139];
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n: number) => (n === 0 ? '-' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dataBr = (iso: string) => iso.split('-').reverse().join('/');
export const TIPO_EVENTO: Record<string, string> = { CULTO: 'Culto', REUNIAO: 'Reunião', ESTUDO: 'Estudo', FESTA: 'Festa', OUTRO: 'Outro' };

function cabecalho(doc: jsPDF, titulo: string, subtitulo: string, paroquia: string, logo?: string) {
  const w = doc.internal.pageSize.getWidth();
  if (logo) { try { doc.addImage(logo, 'PNG', 12, 8, 24, 17.5); } catch { /* sem logo */ } }
  doc.setTextColor(...AZUL).setFont('helvetica', 'bold').setFontSize(15).text(titulo, logo ? 40 : 12, 14);
  doc.setTextColor(...CINZA).setFont('helvetica', 'normal').setFontSize(10).text(subtitulo, logo ? 40 : 12, 20);
  doc.setFontSize(8).text(`${paroquia} - Emitido em ${new Date().toLocaleDateString('pt-BR')}`, logo ? 40 : 12, 25);
  doc.setDrawColor(...AZUL).setLineWidth(0.6).line(12, 28, w - 12, 28);
  doc.setTextColor(0, 0, 0);
  return 32;
}
function rodape(doc: jsPDF) {
  const n = doc.getNumberOfPages(), w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7).setTextColor(...CINZA).text(`Página ${i} de ${n}`, w - 12, h - 6, { align: 'right' }); }
}
const estiloTabela = { theme: 'grid' as const, headStyles: { fillColor: AZUL, textColor: 255, fontSize: 8 }, styles: { fontSize: 8, cellPadding: 1.6, lineColor: [226, 232, 240] as [number, number, number] } };
const ultimoY = (doc: jsPDF) => (doc as any).lastAutoTable.finalY as number;

// ------------------------------------------------------------------ relatório mensal
export interface RelMensal {
  mes: string; comNomes: boolean; paroquia: string;
  entradas: { data: string; categoriaNome: string; descricao: string; forma?: string | null; valor: number; ofertante?: string | null }[];
  saidas: { data: string; categoriaNome: string; descricao: string; forma?: string | null; valor: number }[];
  porCategoria: { entradas: { nome: string; total: number; quantidade: number }[]; saidas: { nome: string; total: number; quantidade: number }[] };
  totais: { entradas: number; saidas: number; saldo: number };
}
export function pdfMensal(d: RelMensal, logo?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const [ano, mes] = d.mes.split('-');
  let y = cabecalho(doc, 'Relatório Mensal de Entradas e Saídas', `${MESES[Number(mes) - 1]} de ${ano}`, d.paroquia, logo);

  const secao = (titulo: string, linhas: any[], ofertante: boolean, total: number) => {
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL).text(titulo, 12, y + 2); doc.setTextColor(0, 0, 0);
    const head = ['Data', 'Tópico', 'Descrição', ...(ofertante ? ['Ofertante'] : []), 'Valor'];
    const body = linhas.length ? linhas.map(l => [dataBr(l.data), l.categoriaNome, l.descricao, ...(ofertante ? [l.ofertante ?? ''] : []), brl(l.valor)]) : [[{ content: 'Nenhum lançamento no mês.', colSpan: head.length, styles: { halign: 'center' as const, textColor: CINZA } }]];
    autoTable(doc, { ...estiloTabela, startY: y + 4, head: [head], body, foot: [[{ content: `Total de ${titulo.toLowerCase()}`, colSpan: head.length - 1, styles: { halign: 'right' as const } }, brl(total)]],
      footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: 'bold', fontSize: 8 }, columnStyles: { [head.length - 1]: { halign: 'right', cellWidth: 28 }, 0: { cellWidth: 20 } }, margin: { left: 12, right: 12 } });
    y = ultimoY(doc) + 8;
  };
  secao('Entradas', d.entradas, d.comNomes, d.totais.entradas);
  secao('Saídas', d.saidas, false, d.totais.saidas);

  if (y > 230) { doc.addPage(); y = 16; }
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL).text('Resumo por tópico', 12, y + 2); doc.setTextColor(0, 0, 0);
  const resumo = (xs: { nome: string; total: number; quantidade: number }[]) => xs.map(x => [x.nome, String(x.quantidade), brl(x.total)]);
  autoTable(doc, { ...estiloTabela, startY: y + 4, head: [['Entradas por tópico', 'Qtd.', 'Total']], body: resumo(d.porCategoria.entradas).length ? resumo(d.porCategoria.entradas) : [['-', '', '']], columnStyles: { 1: { halign: 'right', cellWidth: 14 }, 2: { halign: 'right', cellWidth: 30 } }, margin: { left: 12, right: 12 } });
  autoTable(doc, { ...estiloTabela, startY: ultimoY(doc) + 4, head: [['Saídas por tópico', 'Qtd.', 'Total']], body: resumo(d.porCategoria.saidas).length ? resumo(d.porCategoria.saidas) : [['-', '', '']], columnStyles: { 1: { halign: 'right', cellWidth: 14 }, 2: { halign: 'right', cellWidth: 30 } }, margin: { left: 12, right: 12 } });
  autoTable(doc, { ...estiloTabela, startY: ultimoY(doc) + 6, body: [['Total de entradas', brl(d.totais.entradas)], ['Total de saídas', brl(d.totais.saidas)], [{ content: 'Saldo do mês', styles: { fontStyle: 'bold' as const } }, { content: brl(d.totais.saldo), styles: { fontStyle: 'bold' as const } }]],
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } }, margin: { left: 12, right: 12 }, tableWidth: 110 });
  rodape(doc);
  return doc;
}

// ------------------------------------------------------------------ relatório anual
export interface LinhaAnual { codigo: string; label: string; meses: number[]; total: number }
export interface RelAnual {
  ano: string; paroquia: string;
  entradas: { linhas: LinhaAnual[]; totalMeses: number[]; total: number };
  saidas: { linhas: LinhaAnual[]; totalMeses: number[]; total: number };
  saldoMeses: number[]; saldo: number;
}
export function pdfAnual(d: RelAnual, logo?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const y0 = cabecalho(doc, 'Relatório Geral Anual', `Entradas e saídas de ${d.ano} (valores em R$)`, d.paroquia, logo);
  const meses = MESES.map(m => m.slice(0, 3));
  const head = [['Tópico', ...meses, 'Total']];
  const linha = (l: LinhaAnual) => [l.label, ...l.meses.map(num), num(l.total)];
  const sub = (txt: string) => [{ content: txt, colSpan: 14, styles: { fillColor: [226, 232, 240] as [number, number, number], fontStyle: 'bold' as const, textColor: AZUL } }];
  const tot = (txt: string, v: number[], t: number) => [txt, ...v.map(num), num(t)].map((c, i) => ({ content: c, styles: { fontStyle: 'bold' as const, fillColor: [241, 245, 249] as [number, number, number], halign: i === 0 ? ('left' as const) : ('right' as const) } }));
  const body: any[] = [sub('ENTRADAS'), ...d.entradas.linhas.map(linha), tot('Total de entradas', d.entradas.totalMeses, d.entradas.total),
    sub('SAÍDAS'), ...d.saidas.linhas.map(linha), tot('Total de saídas', d.saidas.totalMeses, d.saidas.total),
    tot('SALDO (entradas - saídas)', d.saldoMeses, d.saldo)];
  const colunas: Record<number, any> = { 0: { cellWidth: 46 }, 13: { halign: 'right', fontStyle: 'bold', cellWidth: 22 } };
  for (let i = 1; i <= 12; i++) colunas[i] = { halign: 'right', cellWidth: 16.5 };
  autoTable(doc, { ...estiloTabela, startY: y0, head, body, styles: { fontSize: 6.5, cellPadding: 1.1, lineColor: [226, 232, 240] }, columnStyles: colunas, margin: { left: 12, right: 12 }, tableWidth: 'wrap' });
  rodape(doc);
  return doc;
}

// ------------------------------------------------------------------ calendário
export interface EventoPdf { titulo: string; tipo: string; data: string; horario: string; descricao?: string }
export type VisaoCalendario = 'YEAR' | 'MONTH' | 'WEEK' | 'DAY';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function paginaMes(doc: jsPDF, ano: number, mes: number, eventos: EventoPdf[], paroquia: string, logo: string | undefined, titulo: string) {
  const y0 = cabecalho(doc, 'IELB - Planejamento Paroquial', titulo, paroquia, logo);
  const primeiro = new Date(ano, mes, 1).getDay(), dias = new Date(ano, mes + 1, 0).getDate();
  const semanas: any[][] = []; let semana: any[] = Array(primeiro).fill('');
  for (let dia = 1; dia <= dias; dia++) {
    const ds = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const evs = eventos.filter(e => e.data === ds).sort((a, b) => a.horario.localeCompare(b.horario));
    const linhas = evs.slice(0, 3).map(e => `${e.horario} ${e.titulo}`.slice(0, 26));
    if (evs.length > 3) linhas.push(`+${evs.length - 3} mais`);
    semana.push({ content: [String(dia), ...linhas].join('\n'), styles: { fillColor: evs.length ? ([239, 246, 255] as [number, number, number]) : undefined } });
    if (semana.length === 7) { semanas.push(semana); semana = []; }
  }
  if (semana.length) { while (semana.length < 7) semana.push(''); semanas.push(semana); }
  autoTable(doc, { ...estiloTabela, startY: y0, head: [DIAS], body: semanas, styles: { fontSize: 7, cellPadding: 1.2, valign: 'top', minCellHeight: 22, lineColor: [203, 213, 225] },
    headStyles: { fillColor: AZUL, textColor: 255, halign: 'center', fontSize: 8 }, margin: { left: 12, right: 12 } });
}
function tabelaEventos(doc: jsPDF, eventos: EventoPdf[], startY: number) {
  const ev = [...eventos].sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));
  autoTable(doc, { ...estiloTabela, startY, head: [['Data', 'Horário', 'Atividade', 'Tipo', 'Observações']],
    body: ev.length ? ev.map(e => [dataBr(e.data), e.horario, e.titulo, TIPO_EVENTO[e.tipo] ?? e.tipo, e.descricao ?? '']) : [[{ content: 'Nenhuma atividade programada neste período.', colSpan: 5, styles: { halign: 'center' as const, textColor: CINZA } }]],
    margin: { left: 12, right: 12 } });
}

export function pdfCalendario(p: { visao: VisaoCalendario; data: Date; eventos: EventoPdf[]; paroquia: string; logo?: string }): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const ano = p.data.getFullYear(), mes = p.data.getMonth();
  if (p.visao === 'YEAR') {
    for (let m = 0; m < 12; m++) { if (m > 0) doc.addPage(); paginaMes(doc, ano, m, p.eventos, p.paroquia, p.logo, `Calendário Mensal - ${MESES[m].toUpperCase()} ${ano}`); }
  } else if (p.visao === 'MONTH') {
    paginaMes(doc, ano, mes, p.eventos, p.paroquia, p.logo, `Planejamento Mensal - ${MESES[mes].toUpperCase()} ${ano}`);
    const doMes = p.eventos.filter(e => e.data.startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}`));
    doc.addPage(); const y = cabecalho(doc, 'IELB - Planejamento Paroquial', `Programação de ${MESES[mes]} de ${ano}`, p.paroquia, p.logo); tabelaEventos(doc, doMes, y);
  } else {
    const ini = new Date(p.data); if (p.visao === 'WEEK') ini.setDate(ini.getDate() - ini.getDay());
    const fim = new Date(ini); if (p.visao === 'WEEK') fim.setDate(fim.getDate() + 6);
    const a = iso(ini), b = iso(fim);
    const y = cabecalho(doc, 'IELB - Planejamento Paroquial', p.visao === 'WEEK' ? `Semana de ${dataBr(a)} a ${dataBr(b)}` : `Programação do dia ${dataBr(a)}`, p.paroquia, p.logo);
    tabelaEventos(doc, p.eventos.filter(e => e.data >= a && e.data <= b), y);
  }
  rodape(doc);
  return doc;
}

/** Baixa o PDF no navegador. */
export const baixar = (doc: jsPDF, nome: string) => doc.save(nome);

/** Carrega a marca da igreja como data URL para o cabeçalho dos PDFs (só no navegador). */
export async function carregarLogo(): Promise<string | undefined> {
  try {
    const r = await fetch('/marca-igreja.png'); if (!r.ok) return undefined;
    const blob = await r.blob();
    return await new Promise(res => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = () => res(undefined); f.readAsDataURL(blob); });
  } catch { return undefined; }
}

// ------------------------------------------------------------------ lista de membros
export const SITUACAO: Record<string, string> = { ATIVO: 'Ativo', INATIVO: 'Inativo', TRANSFERIDO: 'Transferido', FALECIDO: 'Falecido' };
export const CARGO_ROTULO: Record<string, string> = {
  PRESIDENTE: 'Presidente', VICE_PRESIDENTE: 'Vice-presidente', SECRETARIO: '1º Secretário', VICE_SECRETARIO: '2º Secretário', TESOUREIRO: '1º Tesoureiro', VICE_TESOUREIRO: '2º Tesoureiro',
  CONSELHEIRO: 'Conselheiro', VICE_CONSELHEIRO: 'Vice-conselheiro', FISCAL_1: 'Fiscal 1', FISCAL_2: 'Fiscal 2', FISCAL_3: 'Fiscal 3',
};
export interface ExportMembros { paroquia: string; status: string | null; itens: any[] }
export const contarSituacoes = (itens: any[]) => ({
  ativos: itens.filter(i => i.status === 'ATIVO').length, inativos: itens.filter(i => i.status === 'INATIVO').length,
  transferidos: itens.filter(i => i.status === 'TRANSFERIDO').length, falecidos: itens.filter(i => i.status === 'FALECIDO').length, total: itens.length,
});

export function pdfMembros(d: ExportMembros, logo?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const c = contarSituacoes(d.itens);
  const y0 = cabecalho(doc, 'Lista de Membros', d.status ? `Situação: ${SITUACAO[d.status] ?? d.status}` : 'Todos os membros', d.paroquia, logo);
  autoTable(doc, { ...estiloTabela, startY: y0, head: [['Ativos', 'Inativos', 'Transferidos', 'Falecidos', 'Total']], body: [[String(c.ativos), String(c.inativos), String(c.transferidos), String(c.falecidos), String(c.total)]],
    styles: { fontSize: 9, halign: 'center', cellPadding: 2 }, headStyles: { fillColor: AZUL, textColor: 255, halign: 'center', fontSize: 8 }, tableWidth: 150, margin: { left: 12 } });
  autoTable(doc, { ...estiloTabela, startY: ultimoY(doc) + 5,
    head: [['Nome', 'Situação', 'Nascimento', 'Telefone', 'E-mail', 'Endereço', 'Cargo na diretoria']],
    body: d.itens.length ? d.itens.map(m => [m.nome, SITUACAO[m.status] ?? m.status, m.dataNascimento ? dataBr(m.dataNascimento) : '', m.telefone ?? '', m.email ?? '', m.endereco ?? '', m.cargo ? CARGO_ROTULO[m.cargo] ?? m.cargo : '']) : [[{ content: 'Nenhum membro nesta situação.', colSpan: 7, styles: { halign: 'center' as const, textColor: CINZA } }]],
    styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [226, 232, 240] }, columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 22 }, 2: { cellWidth: 22 }, 3: { cellWidth: 30 }, 4: { cellWidth: 52 }, 5: { cellWidth: 60 }, 6: { cellWidth: 35 } }, tableWidth: 'wrap', margin: { left: 12, right: 12 } });
  rodape(doc);
  return doc;
}
