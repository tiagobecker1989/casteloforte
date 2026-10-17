import * as XLSX from '@e965/xlsx';
import { CARGO_ROTULO, SITUACAO, contarSituacoes, type ExportMembros } from './pdfRelatorios';

const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Planilha de membros. "xlsx" = Excel atual; "xls" = Excel 97-2003. Devolve os bytes do arquivo. */
export function gerarPlanilhaMembros(d: ExportMembros, formato: 'xlsx' | 'xls'): Uint8Array {
  const cab = ['Nome', 'Situação', 'Data de nascimento', 'Telefone', 'E-mail', 'Endereço', 'Profissão', 'Data do batismo', 'Data da confirmação', 'Cargo na diretoria', 'Oferta mensal (R$)'];
  const linhas = d.itens.map(m => [m.nome, SITUACAO[m.status] ?? m.status, dataBr(m.dataNascimento), m.telefone ?? '', m.email ?? '', m.endereco ?? '', m.profissao ?? '', dataBr(m.dataBatismo), dataBr(m.dataConfirmacao), m.cargo ? CARGO_ROTULO[m.cargo] ?? m.cargo : '', m.ofertaMensalValor ?? '']);
  const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
  ws['!cols'] = [34, 13, 18, 18, 30, 34, 20, 16, 18, 20, 16].map(wch => ({ wch }));
  const c = contarSituacoes(d.itens);
  const resumo = XLSX.utils.aoa_to_sheet([[d.paroquia], [d.status ? `Situação: ${SITUACAO[d.status] ?? d.status}` : 'Todos os membros'], [], ['Situação', 'Quantidade'], ['Ativos', c.ativos], ['Inativos', c.inativos], ['Transferidos', c.transferidos], ['Falecidos', c.falecidos], ['Total', c.total]]);
  resumo['!cols'] = [{ wch: 28 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Membros'); XLSX.utils.book_append_sheet(wb, resumo, 'Resumo');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: formato === 'xls' ? 'biff8' : 'xlsx' }));
}

export function baixarPlanilhaMembros(d: ExportMembros, formato: 'xlsx' | 'xls') {
  const mime = formato === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gerarPlanilhaMembros(d, formato)], { type: mime }));
  a.download = `membros-${new Date().toISOString().slice(0, 10)}.${formato}`; a.click(); URL.revokeObjectURL(a.href);
}
