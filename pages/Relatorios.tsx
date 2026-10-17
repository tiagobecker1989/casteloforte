import React, { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { apiService } from '../services/apiService';
import { brl, cartao, dataBr, inputCls, mesAtual } from '../services/formato';
import { MESES, baixar, carregarLogo, pdfAnual, pdfMensal } from '../services/pdfRelatorios';

const Relatorios: React.FC = () => {
  const [aba, setAba] = useState<'mensal' | 'anual'>('mensal');
  const [mes, setMes] = useState(mesAtual());
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [nomes, setNomes] = useState(false);
  const [m, setM] = useState<any>(null);
  const [a, setA] = useState<any>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try { if (aba === 'mensal') setM(await apiService.getRelatorioMensal(mes, nomes)); else setA(await apiService.getRelatorioAnual(ano)); }
    catch (e: any) { setErro(e.message); }
  }, [aba, mes, ano, nomes]);
  useEffect(() => { carregar(); }, [carregar]);

  const pdf = async () => {
    const logo = await carregarLogo();
    if (aba === 'mensal' && m) baixar(pdfMensal(m, logo), `Relatorio-mensal-${m.mes}.pdf`);
    if (aba === 'anual' && a) baixar(pdfAnual(a, logo), `Relatorio-anual-${a.ano}.pdf`);
  };
  const n = (v: number) => (v === 0 ? '-' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const Tabela = ({ titulo, linhas, ofertante }: { titulo: string; linhas: any[]; ofertante?: boolean }) => (
    <div className={`${cartao} overflow-x-auto`}>
      <h3 className="p-6 font-black text-slate-900">{titulo}</h3>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-6 py-3">Data</th><th className="px-6 py-3">Tópico</th><th className="px-6 py-3">Descrição</th>{ofertante && <th className="px-6 py-3">Ofertante</th>}<th className="px-6 py-3 text-right">Valor</th></tr></thead>
        <tbody className="divide-y divide-slate-50">
          {linhas.length === 0 && <tr><td colSpan={5} className="px-6 py-5 text-slate-400 font-bold">Nenhum lançamento no mês.</td></tr>}
          {linhas.map((l: any) => <tr key={l.id}><td className="px-6 py-3">{dataBr(l.data)}</td><td className="px-6 py-3 font-bold">{l.categoriaNome}</td><td className="px-6 py-3 text-slate-600">{l.descricao}</td>{ofertante && <td className="px-6 py-3">{l.ofertante ?? ''}</td>}<td className="px-6 py-3 text-right">{brl(l.valor)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Relatórios</h2><p className="text-slate-500 font-medium">Entradas e saídas do mês e visão geral do ano.</p></div>
        <button onClick={pdf} className="flex items-center gap-2 bg-[#002878] text-white px-5 py-3 rounded-2xl font-bold"><Download size={16} />Baixar PDF</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {(['mensal', 'anual'] as const).map(t => <button key={t} onClick={() => setAba(t)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${aba === t ? 'bg-[#002878] text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>{t === 'mensal' ? 'Mensal' : 'Geral anual'}</button>)}
        {aba === 'mensal'
          ? <><input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className={inputCls} aria-label="Mês" /><label className="text-sm text-slate-600 flex items-center gap-2"><input type="checkbox" checked={nomes} onChange={e => setNomes(e.target.checked)} />Mostrar o nome de quem ofertou</label></>
          : <input type="number" min={2000} max={2100} value={ano} onChange={e => /^\d{4}$/.test(e.target.value) && setAno(e.target.value)} className={`${inputCls} w-28`} aria-label="Ano" />}
      </div>
      {erro && <p role="alert" className="text-sm font-bold text-red-600">{erro}</p>}

      {aba === 'mensal' && m && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">{[['Entradas', m.totais.entradas], ['Saídas', m.totais.saidas], ['Saldo do mês', m.totais.saldo]].map(([l, v]) => <div key={l as string} className={`${cartao} p-6`}><p className={`text-2xl font-black ${l === 'Saldo do mês' && (v as number) < 0 ? 'text-red-600' : 'text-slate-900'}`}>{brl(v as number)}</p><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{l as string}</p></div>)}</div>
          <Tabela titulo={`Entradas de ${MESES[Number(m.mes.split('-')[1]) - 1]}`} linhas={m.entradas} ofertante={m.comNomes} />
          <Tabela titulo={`Saídas de ${MESES[Number(m.mes.split('-')[1]) - 1]}`} linhas={m.saidas} />
        </>
      )}

      {aba === 'anual' && a && (
        <div className={`${cartao} overflow-x-auto`}>
          <table className="w-full text-xs">
            <thead><tr className="text-left uppercase tracking-wider text-slate-400"><th className="px-4 py-3 sticky left-0 bg-white">Tópico</th>{MESES.map(x => <th key={x} className="px-2 py-3 text-right">{x.slice(0, 3)}</th>)}<th className="px-4 py-3 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {(['entradas', 'saidas'] as const).map(sec => (
                <React.Fragment key={sec}>
                  <tr className="bg-slate-100"><td colSpan={14} className="px-4 py-2 font-black text-[#002878] uppercase">{sec === 'entradas' ? 'Entradas' : 'Saídas'}</td></tr>
                  {a[sec].linhas.map((l: any) => <tr key={l.codigo}><td className="px-4 py-2 font-bold sticky left-0 bg-white">{l.label}</td>{l.meses.map((v: number, i: number) => <td key={i} className="px-2 py-2 text-right text-slate-600">{n(v)}</td>)}<td className="px-4 py-2 text-right font-black">{n(l.total)}</td></tr>)}
                  <tr className="bg-slate-50 font-black"><td className="px-4 py-2 sticky left-0 bg-slate-50">Total de {sec === 'entradas' ? 'entradas' : 'saídas'}</td>{a[sec].totalMeses.map((v: number, i: number) => <td key={i} className="px-2 py-2 text-right">{n(v)}</td>)}<td className="px-4 py-2 text-right">{n(a[sec].total)}</td></tr>
                </React.Fragment>
              ))}
              <tr className="bg-blue-50 font-black"><td className="px-4 py-3 sticky left-0 bg-blue-50">SALDO</td>{a.saldoMeses.map((v: number, i: number) => <td key={i} className={`px-2 py-3 text-right ${v < 0 ? 'text-red-600' : ''}`}>{n(v)}</td>)}<td className="px-4 py-3 text-right">{n(a.saldo)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
export default Relatorios;
