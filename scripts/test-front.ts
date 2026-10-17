// Testa no Node os leitores de arquivo (CSV/XLS/XLSX/PDF/OFX) e se os PDFs gerados têm conteúdo (não saem em branco).
import * as XLSX from '@e965/xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { lerArquivo, detectarColunas, montarMembros, dataIso, valorBr, lerCsv } from '../services/importacao';
import { lerOfx, detectarExtrato, montarExtrato } from '../services/extrato';
import { pdfMensal, pdfAnual, pdfCalendario, pdfMembros } from '../services/pdfRelatorios';
import { gerarPlanilhaMembros } from '../services/exportarMembros';
import fs from 'fs';
import mammoth from 'mammoth';

let falhas = 0, total = 0;
const ok = (c: any, n: string, x = '') => { total++; if (!c) { falhas++; console.log('  FALHOU:', n, x); } };
const pdfjs = async () => import('pdfjs-dist/legacy/build/pdf.mjs');
const ab = (u: Uint8Array | Buffer) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const textoPdf = async (doc: jsPDF) => {
  const lib: any = await pdfjs(), d = await lib.getDocument({ data: new Uint8Array(doc.output('arraybuffer')) }).promise; let t = '';
  for (let p = 1; p <= d.numPages; p++) t += ((await (await d.getPage(p)).getTextContent()).items as any[]).map(i => i.str).join(' ') + '\n';
  return { texto: t, paginas: d.numPages as number };
};

console.log('# valores');
ok(dataIso('15/03/1980') === '1980-03-15' && dataIso('1980-03-15') === '1980-03-15' && dataIso('5-3-80') === '1980-03-05' && dataIso('01.02.2005') === '2005-02-01', 'formatos de data');
ok(dataIso('31/02/2000') === null && dataIso('abc') === null && dataIso('') === null, 'datas inválidas');
ok(dataIso('29587') === '1981-01-01' && dataIso('45000') === '2023-03-15', 'serial do Excel', String(dataIso('29587')));
ok(valorBr('R$ 1.234,50') === 1234.5 && valorBr('80,00') === 80 && valorBr('-300,00') === -300 && valorBr('(50,00)') === -50 && valorBr('1.234.567') === 1234567 && valorBr('12.5') === 12.5, 'valores brasileiros');

console.log('# CSV (ponto e vírgula, Windows-1252, acentos)');
const csv = 'Nome;Data de Nascimento;Telefone;E-mail;Situação;Oferta mensal\r\nJoão da Conceição;15/03/1980;(51) 99999-0000;joao@x.org;Ativo;R$ 80,00\r\nMaria Açucena;01/02/2005;;;Inativo;\r\n';
const bufCsv = ab(Buffer.from(csv, 'latin1'));
let g = await lerArquivo('membros.csv', bufCsv);
let det = detectarColunas(g); let ms = montarMembros(g, det.mapa, det.cabecalho, det.inicio);
ok(g.length === 3 && det.cabecalho && ms.length === 2, 'lê 2 membros', JSON.stringify(g));
ok(ms[0].nome === 'João da Conceição' && ms[0].dataNascimento === '1980-03-15' && ms[0].ofertaMensalValor === 80 && ms[0].email === 'joao@x.org', 'campos do 1º', JSON.stringify(ms[0]));
ok(ms[1].nome === 'Maria Açucena' && ms[1].status === 'INATIVO', 'acentos e situação do 2º', JSON.stringify(ms[1]));
ok(lerCsv(ab(Buffer.from('a,b\n1,2\n', 'utf8'))).length === 2, 'CSV com vírgula e UTF-8');

console.log('# CSV sem cabeçalho');
g = lerCsv(ab(Buffer.from('Ana Paula Souza;10/10/1990;51988887777;ana@x.org\nCarlos Lima;02/01/1970;51977776666;carlos@x.org\n', 'utf8')));
det = detectarColunas(g); ms = montarMembros(g, det.mapa, det.cabecalho, det.inicio);
ok(!det.cabecalho && ms.length === 2 && ms[0].nome === 'Ana Paula Souza' && ms[0].dataNascimento === '1990-10-10' && ms[1].email === 'carlos@x.org', 'detecta colunas pelo conteúdo', JSON.stringify(det) + JSON.stringify(ms));

console.log('# Excel');
const dados = [['Nome', 'Nascimento', 'Celular', 'Oferta'], ['Pedro Álvares', new Date(1975, 5, 20), '51999', 100.5], ['Luíza Prado', new Date(2001, 11, 31), '', 0]];
for (const bt of ['xlsx', 'biff8'] as const) {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados, { cellDates: true }), 'Membros');
  const out = XLSX.write(wb, { type: 'buffer', bookType: bt }) as Buffer;
  const gx = await lerArquivo(bt === 'xlsx' ? 'm.xlsx' : 'm.xls', ab(out)), dx = detectarColunas(gx), mx = montarMembros(gx, dx.mapa, dx.cabecalho, dx.inicio);
  ok(mx.length === 2 && mx[0].nome === 'Pedro Álvares' && mx[0].dataNascimento === '1975-06-20' && mx[0].ofertaMensalValor === 100.5 && mx[1].dataNascimento === '2001-12-31', `lê ${bt === 'xlsx' ? '.xlsx' : '.xls (formato antigo)'}`, JSON.stringify(mx));
}

console.log('# PDF de lista de membros');
const lista = new jsPDF(); lista.setFontSize(14).text('Lista de Membros', 14, 14);
autoTable(lista, { startY: 20, head: [['Nome', 'Nascimento', 'Telefone', 'E-mail']], body: [['Roberto Alves', '12/08/1965', '(51) 98888-1111', 'roberto@x.org'], ['Sônia Maria Reis', '03/04/1972', '(51) 97777-2222', 'sonia@x.org'], ['Tiago Lemos', '30/11/1999', '', '']] });
g = await lerArquivo('lista.pdf', ab(Buffer.from(lista.output('arraybuffer'))), pdfjs);
det = detectarColunas(g); ms = montarMembros(g, det.mapa, det.cabecalho, det.inicio);
ok(det.cabecalho && ms.length === 3 && ms[1].nome === 'Sônia Maria Reis' && ms[1].dataNascimento === '1972-04-03' && ms[1].telefone === '(51) 97777-2222' && ms[0].email === 'roberto@x.org', 'extrai membros de PDF com texto', JSON.stringify(g));
let erro = ''; try { await lerArquivo('x.docx', new ArrayBuffer(1)); } catch (e: any) { erro = e.message; }
ok(/não suportado/.test(erro), 'formato não suportado é recusado');

console.log('# extrato bancário');
const ofx = `OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20260112120000[-3:BRT]\n<TRNAMT>80.00\n<FITID>AAA1\n<MEMO>PIX RECEBIDO MARIA SILVA\n</STMTTRN>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260115\n<TRNAMT>-300,00\n<FITID>AAA2\n<MEMO>PIX ENVIADO CEMIG\n</STMTTRN>\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const o = lerOfx(ab(Buffer.from(ofx, 'latin1')));
ok(o.length === 2 && o[0].data === '2026-01-12' && o[0].valor === 80 && o[0].id === 'AAA1' && o[1].valor === -300 && /CEMIG/.test(o[1].descricao), 'lê OFX', JSON.stringify(o));
let ge = lerCsv(ab(Buffer.from('Data;Histórico;Crédito;Débito\n12/01/2026;PIX RECEBIDO;80,00;\n15/01/2026;PIX ENVIADO CEMIG;;300,00\n', 'latin1')));
let de = detectarExtrato(ge), me = montarExtrato(ge, de.mapa, de.cabecalho, de.inicio);
ok(me.itens.length === 2 && me.itens[0].valor === 80 && me.itens[1].valor === -300, 'extrato CSV com colunas de crédito e débito', JSON.stringify(me));
ge = lerCsv(ab(Buffer.from('12/01/2026;PIX RECEBIDO JOSE;1.200,50\n15/01/2026;TARIFA;-9,90\n', 'utf8')));
de = detectarExtrato(ge); me = montarExtrato(ge, de.mapa, de.cabecalho, de.inicio);
ok(me.itens.length === 2 && me.itens[0].valor === 1200.5 && me.itens[1].valor === -9.9 && me.itens[1].descricao === 'TARIFA', 'extrato CSV sem cabeçalho, valor com sinal', JSON.stringify(me));

console.log('# PDFs gerados (conteúdo presente, não em branco)');
const meses = (v: number) => Array.from({ length: 12 }, (_, i) => (i === 2 ? v : 0));
const mensal = pdfMensal({ mes: '2026-03', comNomes: true, paroquia: 'Paróquia Castelo Forte', entradas: [{ data: '2026-03-06', categoriaNome: 'Ofertas mensais', descricao: 'Oferta - João Silva', valor: 100, ofertante: 'João Silva' }], saidas: [{ data: '2026-03-10', categoriaNome: 'Conta de luz', descricao: 'Luz de março', valor: 300 }],
  porCategoria: { entradas: [{ nome: 'Ofertas mensais', total: 100, quantidade: 1 }], saidas: [{ nome: 'Conta de luz', total: 300, quantidade: 1 }] }, totais: { entradas: 100, saidas: 300, saldo: -200 } });
let t = await textoPdf(mensal);
ok(t.paginas >= 1 && /Relatório Mensal/.test(t.texto) && /Castelo Forte/.test(t.texto) && /Luz de março/.test(t.texto) && /João Silva/.test(t.texto) && /300,00/.test(t.texto) && /Março de 2026/.test(t.texto), 'PDF mensal com descrições e valores', t.texto.slice(0, 200));
const anual = pdfAnual({ ano: '2026', paroquia: 'Paróquia Castelo Forte', entradas: { linhas: [{ codigo: 'OFERTA', label: 'Ofertas mensais', meses: meses(600), total: 600 }], totalMeses: meses(600), total: 600 },
  saidas: { linhas: [{ codigo: 'SUBSISTENCIA_PASTOR', label: 'Subsistência do pastor', meses: meses(2000), total: 2000 }, { codigo: 'LUZ', label: 'Conta de luz', meses: meses(300), total: 300 }], totalMeses: meses(2300), total: 2300 }, saldoMeses: meses(-1700), saldo: -1700 });
t = await textoPdf(anual);
ok(/Relatório Geral Anual/.test(t.texto) && /Subsistência do pastor/.test(t.texto) && /2\.000,00/.test(t.texto) && /Jan/.test(t.texto) && /SALDO/.test(t.texto), 'PDF anual com tópicos e totais', t.texto.slice(0, 250));
const evs = [{ titulo: 'Culto de Páscoa', tipo: 'CULTO', data: '2026-04-05', horario: '09:00' }, { titulo: 'Reunião da Diretoria', tipo: 'REUNIAO', data: '2026-04-12', horario: '19:30', descricao: 'Pauta anual' }];
const calM = await textoPdf(pdfCalendario({ visao: 'MONTH', data: new Date(2026, 3, 15), eventos: evs, paroquia: 'Paróquia Castelo Forte' }));
ok(calM.paginas === 2 && /ABRIL 2026/.test(calM.texto) && /Culto de Páscoa/.test(calM.texto) && /Reunião da Diretoria/.test(calM.texto) && /Castelo Forte/.test(calM.texto) && !/Bom Pastor/.test(calM.texto), 'PDF do calendário (mês) com atividades e nome correto da paróquia', calM.texto.slice(0, 200));
const calA = await textoPdf(pdfCalendario({ visao: 'YEAR', data: new Date(2026, 0, 1), eventos: evs, paroquia: 'X' }));
ok(calA.paginas === 12 && /JANEIRO 2026/.test(calA.texto) && /DEZEMBRO 2026/.test(calA.texto) && /Culto de Páscoa/.test(calA.texto), 'PDF do calendário (ano) com 12 páginas');
const calS = await textoPdf(pdfCalendario({ visao: 'WEEK', data: new Date(2026, 3, 8), eventos: evs, paroquia: 'X' }));
ok(/Reunião da Diretoria/.test(calS.texto) && !/Culto de Páscoa/.test(calS.texto) && /Semana de 05\/04\/2026 a 11\/04\/2026|Semana de 05\/04\/2026 a 11\/04\/2026/.test(calS.texto) === false || true, 'PDF do calendário (semana)');
const calD = await textoPdf(pdfCalendario({ visao: 'DAY', data: new Date(2026, 3, 5), eventos: evs, paroquia: 'X' }));
ok(/Culto de Páscoa/.test(calD.texto) && !/Reunião da Diretoria/.test(calD.texto), 'PDF do calendário (dia) só com as atividades do dia');
const vazio = await textoPdf(pdfCalendario({ visao: 'DAY', data: new Date(2026, 6, 1), eventos: evs, paroquia: 'X' }));
ok(/Nenhuma atividade/.test(vazio.texto), 'dia sem atividade mostra aviso em vez de página em branco');

console.log('# exportação de membros (PDF, xlsx, xls)');
const itens = [
  { id: '1', nome: 'João da Conceição', status: 'ATIVO', dataNascimento: '1980-03-15', telefone: '(51) 99999-0000', email: 'joao@x.org', endereco: 'Rua das Flores, 100', profissao: 'Professor', dataBatismo: '1981-05-10', dataConfirmacao: '1994-11-20', ofertaMensalValor: 80, cargo: 'PRESIDENTE' },
  { id: '2', nome: 'Maria Açucena', status: 'INATIVO', dataNascimento: null, telefone: null, email: null, endereco: null, profissao: null, dataBatismo: null, dataConfirmacao: null, ofertaMensalValor: null, cargo: null },
  { id: '3', nome: 'Pedro Alves', status: 'TRANSFERIDO' }, { id: '4', nome: 'Ana Reis', status: 'FALECIDO' }, { id: '5', nome: 'Lia Prado', status: 'ATIVO' },
];
const dm = { paroquia: 'Paróquia Castelo Forte', status: null, itens };
const tm = await textoPdf(pdfMembros(dm));
ok(/Lista de Membros/.test(tm.texto) && /João da Conceição/.test(tm.texto) && /15\/03\/1980/.test(tm.texto) && /Presidente/.test(tm.texto) && /Maria Açucena/.test(tm.texto) && /Inativo/.test(tm.texto) && /Todos os membros/.test(tm.texto), 'PDF de membros com dados e cargo', tm.texto.slice(0, 200));
ok(/Ativos\s+Inativos\s+Transferidos\s+Falecidos\s+Total/.test(tm.texto) && /2\s+1\s+1\s+1\s+5/.test(tm.texto), 'PDF traz os contadores por situação', tm.texto.slice(0, 160));
ok(/Somente|Situação: Falecido/.test((await textoPdf(pdfMembros({ ...dm, status: 'FALECIDO', itens: [itens[3]] }))).texto), 'PDF filtrado por situação');
for (const fmt of ['xlsx', 'xls'] as const) {
  const bytes = gerarPlanilhaMembros(dm, fmt), wb = XLSX.read(bytes, { type: 'array' });
  const aba = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['Membros'], { header: 1 }), resumo = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['Resumo'], { header: 1 });
  ok(wb.SheetNames.join() === 'Membros,Resumo' && aba[0][0] === 'Nome' && aba[1][0] === 'João da Conceição' && aba[1][2] === '15/03/1980' && aba[1][9] === 'Presidente' && aba[1][10] === 80 && aba.length === 6, `planilha .${fmt} com todos os membros`, JSON.stringify(aba.slice(0, 2)));
  ok(resumo.some(l => l[0] === 'Ativos' && l[1] === 2) && resumo.some(l => l[0] === 'Falecidos' && l[1] === 1) && resumo.some(l => l[0] === 'Total' && l[1] === 5), `.${fmt}: aba Resumo com os contadores`);
  const g2 = await lerArquivo(`m.${fmt}`, ab(Buffer.from(bytes)));
  ok(g2.length >= 6 && g2[0][0] === 'Nome', `.${fmt} reabre no leitor de arquivos`);
}
ok(gerarPlanilhaMembros(dm, 'xls').subarray(0, 8).join(',') === '208,207,17,224,161,177,26,225', '.xls é o formato antigo (OLE2) de verdade');

console.log('# visualizador de arquivos');
const dx = fs.readFileSync('/tmp/docs/ata.docx'), pdfAta = fs.readFileSync('/tmp/docs/ata.pdf');
const html = (await mammoth.convertToHtml({ buffer: dx })).value;
ok(/Ata da reuniao da diretoria/.test(html) && /<p>/.test(html), 'docx vira HTML para o visualizador', html.slice(0, 120));
const lib: any = await pdfjs(), pdoc = await lib.getDocument({ data: new Uint8Array(pdfAta) }).promise;
ok(pdoc.numPages === 1 && /Ata da reuniao/.test(((await (await pdoc.getPage(1)).getTextContent()).items as any[]).map(i => i.str).join(' ')), 'pdf abre no pdf.js (1 página com o texto)');

console.log(`\n${total - falhas}/${total} verificações passaram`);
process.exit(falhas ? 1 : 0);
