import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Search, Trash2 } from 'lucide-react';
import { apiService, Atrasos, OfertaLancada } from '../services/apiService';
import { Membro } from '../types';
import { useAuth } from '../services/AuthContext';
import { brl, cartao, dataBr, hojeIso, inputCls, mesAtual } from '../services/formato';

const FORMAS = [['PIX', 'Pix'], ['DINHEIRO', 'Dinheiro'], ['TRANSFERENCIA', 'Transferência'], ['CHEQUE', 'Cheque'], ['OUTRO', 'Outro']];

const Ofertas: React.FC = () => {
  const { pode } = useAuth();
  const podeLancar = pode('ofertas.criar'), podeExcluir = pode('ofertas.excluir');
  const [mes, setMes] = useState(mesAtual());
  const [lista, setLista] = useState<{ itens: OfertaLancada[]; total: number }>({ itens: [], total: 0 });
  const [atrasos, setAtrasos] = useState<Atrasos | null>(null);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Membro[]>([]);
  const [membro, setMembro] = useState<Membro | null>(null);
  const [f, setF] = useState({ valor: '', data: hojeIso(), competencia: mesAtual(), forma: 'PIX', descricao: '' });
  const [dia, setDia] = useState('10');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const timer = useRef<number>();

  const carregar = useCallback(async () => {
    try {
      const [o, a, c] = await Promise.all([apiService.getOfertas(mes), apiService.getAtrasadas(mes), apiService.getConfigOferta()]);
      setLista(o); setAtrasos(a); setDia(String(c.diaOferta));
    } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setF(p => ({ ...p, competencia: mes })); }, [mes]);

  const pesquisar = (v: string) => {
    setBusca(v); setMembro(null); window.clearTimeout(timer.current);
    if (v.trim().length < 2) return setAchados([]);
    timer.current = window.setTimeout(() => apiService.getMembros('', 1, 8, v.trim()).then(r => setAchados(r.data.filter(m => m.status === 'ATIVO'))).catch(() => setAchados([])), 250);
  };

  const lancar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (!membro) return setMsg({ ok: false, t: 'Escolha o membro na lista de resultados.' });
    try {
      await apiService.lancarOferta({ membroId: membro.id, valor: Number(f.valor.replace(',', '.')), data: f.data, competencia: f.competencia, forma: f.forma, descricao: f.descricao || undefined });
      setMsg({ ok: true, t: `Oferta de ${membro.nome} lançada.` });
      setMembro(null); setBusca(''); setAchados([]); setF(p => ({ ...p, valor: '', descricao: '' })); await carregar();
    } catch (err: any) { setMsg({ ok: false, t: err.message }); }
  };
  const apagar = async (o: OfertaLancada) => {
    if (!window.confirm(`Apagar a oferta de ${o.membro} (${brl(o.valor)})?`)) return;
    try { await apiService.apagarLancamento(o.id); await carregar(); } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  };
  const salvarDia = async () => { try { await apiService.setConfigOferta(Number(dia)); setMsg({ ok: true, t: 'Dia de vencimento salvo.' }); await carregar(); } catch (e: any) { setMsg({ ok: false, t: e.message }); } };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Ofertas dos membros</h2><p className="text-slate-500 font-medium">Lance a oferta de cada membro e acompanhe a oferta mensal em atraso.</p></div>
        <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Mês de referência <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className={`${inputCls} ml-2`} /></label>
      </div>
      {msg && <p role="status" className={`text-sm font-bold rounded-xl px-4 py-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {podeLancar && (
            <form onSubmit={lancar} className={`${cartao} p-6 space-y-4`}>
              <h3 className="font-black text-slate-900">Lançar oferta</h3>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input value={membro ? membro.nome : busca} onChange={e => pesquisar(e.target.value)} placeholder="Digite o nome do membro..." className={`${inputCls} w-full pl-9`} aria-label="Membro" autoComplete="off" />
                {!membro && achados.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {achados.map(m => <li key={m.id}><button type="button" onClick={() => { setMembro(m); setAchados([]); }} className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50">{m.nome}</button></li>)}
                  </ul>
                )}
              </div>
              <div className="grid sm:grid-cols-4 gap-3">
                <label className="text-xs font-bold text-slate-500">Valor (R$)<input required inputMode="decimal" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} className={`${inputCls} w-full`} /></label>
                <label className="text-xs font-bold text-slate-500">Recebida em<input required type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} className={`${inputCls} w-full`} /></label>
                <label className="text-xs font-bold text-slate-500">Referente ao mês<input required type="month" value={f.competencia} onChange={e => setF({ ...f, competencia: e.target.value })} className={`${inputCls} w-full`} /></label>
                <label className="text-xs font-bold text-slate-500">Forma<select value={f.forma} onChange={e => setF({ ...f, forma: e.target.value })} className={`${inputCls} w-full`}>{FORMAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              </div>
              <input value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder="Observação (opcional)" className={`${inputCls} w-full`} aria-label="Observação" />
              <button className="bg-[#002878] text-white px-6 py-3 rounded-2xl font-bold">Lançar oferta</button>
            </form>
          )}

          <div className={`${cartao} overflow-x-auto`}>
            <div className="p-6 flex justify-between items-center"><h3 className="font-black text-slate-900">Ofertas de {mes.split('-').reverse().join('/')}</h3><p className="font-black text-[#002878]">{brl(lista.total)}</p></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-6 py-3">Membro</th><th className="px-6 py-3">Recebida</th><th className="px-6 py-3">Forma</th><th className="px-6 py-3 text-right">Valor</th><th className="px-6 py-3" /></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {lista.itens.length === 0 && <tr><td colSpan={5} className="px-6 py-6 text-slate-400 font-bold">Nenhuma oferta lançada para este mês.</td></tr>}
                {lista.itens.map(o => (
                  <tr key={o.id}><td className="px-6 py-3 font-bold">{o.membro}</td><td className="px-6 py-3">{dataBr(o.data)}</td><td className="px-6 py-3">{FORMAS.find(x => x[0] === o.forma)?.[1] ?? '—'}</td><td className="px-6 py-3 text-right">{brl(o.valor)}</td>
                    <td className="px-6 py-3 text-right">{podeExcluir && <button aria-label={`Apagar oferta de ${o.membro}`} onClick={() => apagar(o)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${cartao} p-6 space-y-4 h-fit`}>
          <h3 className="font-black text-slate-900 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" />Oferta mensal em atraso</h3>
          {atrasos && (
            <>
              <p className="text-xs text-slate-500">Vencimento: dia {atrasos.diaOferta} ({dataBr(atrasos.vencimento)}). {atrasos.contribuintes} contribuinte(s) com valor combinado; {atrasos.emDia} em dia.</p>
              {!atrasos.venceu && <p className="text-sm font-bold text-slate-500">Este mês ainda está no prazo.</p>}
              {atrasos.venceu && atrasos.atrasadas.length === 0 && <p className="text-sm font-bold text-emerald-700">Ninguém em atraso neste mês.</p>}
              <ul className="space-y-2">
                {atrasos.atrasadas.map(a => (
                  <li key={a.id} className="text-sm bg-amber-50 rounded-xl px-3 py-2"><b>{a.nome}</b><span className="block text-xs text-slate-500">falta {brl(a.faltante)}{a.telefone ? ` · ${a.telefone}` : ''}</span></li>
                ))}
              </ul>
              {podeLancar && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <label className="text-xs font-bold text-slate-500">Dia de vencimento da oferta mensal
                    <div className="flex gap-2 mt-1"><input type="number" min={1} max={28} value={dia} onChange={e => setDia(e.target.value)} className={`${inputCls} w-20`} /><button onClick={salvarDia} className="text-sm font-bold text-[#002878]">Salvar</button></div></label>
                  <p className="text-[11px] text-slate-400">Só entram aqui os membros com "Oferta mensal combinada" preenchida no cadastro.</p>
                </div>
              )}
              <Link to="/conciliacao" className="inline-block text-sm font-bold text-[#002878] underline">Conciliar Pix recebidos</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export default Ofertas;
