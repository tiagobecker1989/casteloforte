import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiService, Topicos } from '../services/apiService';
import { useAuth } from '../services/AuthContext';
import { brl, cartao, dataBr, hojeIso, inputCls, mesAtual } from '../services/formato';

/** Lançamentos por tópico (subsistência do pastor, luz, água, combustível e tópicos cadastrados pela paróquia). */
const Despesas: React.FC = () => {
  const { pode } = useAuth();
  const gerir = pode('despesas.criar'), podeExcluir = pode('despesas.excluir');
  const [mes, setMes] = useState(mesAtual());
  const [topicos, setTopicos] = useState<Topicos | null>(null);
  const [rel, setRel] = useState<any>(null);
  const [f, setF] = useState({ tipo: 'SAIDA' as 'ENTRADA' | 'SAIDA', categoria: 'SUBSISTENCIA_PASTOR', valor: '', data: hojeIso(), descricao: '' });
  const [novo, setNovo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const carregar = useCallback(async () => {
    try { const [t, r] = await Promise.all([apiService.getTopicos(), apiService.getRelatorioMensal(mes, false)]); setTopicos(t); setRel(r); }
    catch (e: any) { setMsg({ ok: false, t: e.message }); }
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setF(p => ({ ...p, data: mes === mesAtual() ? hojeIso() : `${mes}-01` })); }, [mes]);

  const opcoes = useMemo(() => !topicos ? [] : [
    ...topicos.fixos.filter(c => c.codigo !== 'OFERTA' && (c.tipo === f.tipo || c.tipo === 'AMBOS')).map(c => ({ codigo: c.codigo, label: c.label })),
    ...topicos.personalizados.filter(p => p.ativo && p.tipo === f.tipo).map(p => ({ codigo: p.codigo, label: p.nome })),
  ], [topicos, f.tipo]);
  useEffect(() => { if (opcoes.length && !opcoes.some(o => o.codigo === f.categoria)) setF(p => ({ ...p, categoria: opcoes[0].codigo })); }, [opcoes, f.categoria]);

  const exec = async (fn: () => Promise<any>, ok: string) => { try { await fn(); setMsg({ ok: true, t: ok }); await carregar(); return true; } catch (e: any) { setMsg({ ok: false, t: e.message }); return false; } };
  const lancar = (e: React.FormEvent) => { e.preventDefault(); exec(() => apiService.saveLancamento({ tipo: f.tipo, categoria: f.categoria, valor: Number(f.valor.replace(',', '.')), data: f.data, descricao: f.descricao || opcoes.find(o => o.codigo === f.categoria)?.label || '' }), 'Lançamento salvo.').then(ok => ok && setF(p => ({ ...p, valor: '', descricao: '' }))); };
  const criar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!novo.trim()) return;
    try { const r = await apiService.criarTopico(novo.trim(), f.tipo); setNovo(''); await carregar(); setF(p => ({ ...p, categoria: r.codigo })); setMsg({ ok: true, t: 'Tópico criado.' }); } catch (err: any) { setMsg({ ok: false, t: err.message }); }
  };
  const renomear = (id: string, atual: string) => { const n = window.prompt('Novo nome do tópico:', atual); if (n && n.trim() !== atual) exec(() => apiService.atualizarTopico(id, { nome: n.trim() }), 'Tópico renomeado.'); };

  const linhas = rel ? [...rel.entradas.map((x: any) => ({ ...x, tipo: 'ENTRADA' })), ...rel.saidas.map((x: any) => ({ ...x, tipo: 'SAIDA' }))].sort((a: any, b: any) => b.data.localeCompare(a.data)) : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Despesas e Tópicos</h2><p className="text-slate-500 font-medium">Lance mês a mês subsistência do pastor, luz, água, combustível e outros tópicos que você cadastrar.</p></div>
        <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Mês <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className={`${inputCls} ml-2`} /></label>
      </div>
      {msg && <p role="status" className={`text-sm font-bold rounded-xl px-4 py-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      {gerir && (
        <div className="grid lg:grid-cols-3 gap-6">
          <form onSubmit={lancar} className={`${cartao} p-6 space-y-4 lg:col-span-2`}>
            <h3 className="font-black text-slate-900">Novo lançamento</h3>
            <div className="grid sm:grid-cols-4 gap-3">
              <label className="text-xs font-bold text-slate-500">Tipo<select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as any })} className={`${inputCls} w-full`}><option value="SAIDA">Saída</option><option value="ENTRADA">Entrada</option></select></label>
              <label className="text-xs font-bold text-slate-500 sm:col-span-2">Tópico<select value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} className={`${inputCls} w-full`}>{opcoes.map(o => <option key={o.codigo} value={o.codigo}>{o.label}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-500">Data<input required type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} className={`${inputCls} w-full`} /></label>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-xs font-bold text-slate-500">Valor (R$)<input required inputMode="decimal" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} className={`${inputCls} w-full`} /></label>
              <label className="text-xs font-bold text-slate-500 sm:col-span-2">Descrição (o que é este lançamento)<input value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Conta de luz de março" className={`${inputCls} w-full`} /></label>
            </div>
            <button className="bg-[#002878] text-white px-6 py-3 rounded-2xl font-bold">Salvar lançamento</button>
          </form>
          <div className={`${cartao} p-6 space-y-3 h-fit`}>
            <h3 className="font-black text-slate-900">Tópicos da paróquia</h3>
            <form onSubmit={criar} className="flex gap-2"><input value={novo} onChange={e => setNovo(e.target.value)} placeholder={`Novo tópico de ${f.tipo === 'SAIDA' ? 'saída' : 'entrada'}`} className={`${inputCls} flex-1`} aria-label="Nome do novo tópico" /><button className="bg-slate-100 px-3 rounded-xl" aria-label="Criar tópico"><Plus size={16} /></button></form>
            <ul className="space-y-1">
              {topicos?.personalizados.length === 0 && <li className="text-xs text-slate-400">Nenhum tópico próprio ainda. Ex.: Internet, Manutenção do jardim.</li>}
              {topicos?.personalizados.map(p => (
                <li key={p.id} className="flex items-center justify-between text-sm"><span className={p.ativo ? '' : 'text-slate-400 line-through'}>{p.nome} <span className="text-[10px] text-slate-400">({p.tipo === 'SAIDA' ? 'saída' : 'entrada'})</span></span>
                  <span className="flex gap-2"><button aria-label={`Renomear ${p.nome}`} onClick={() => renomear(p.id, p.nome)} className="text-slate-300 hover:text-slate-700"><Pencil size={14} /></button>
                    <button onClick={() => exec(() => apiService.atualizarTopico(p.id, { ativo: !p.ativo }), p.ativo ? 'Tópico desativado.' : 'Tópico reativado.')} className="text-xs text-slate-400 hover:text-slate-700">{p.ativo ? 'Desativar' : 'Reativar'}</button></span></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className={`${cartao} overflow-x-auto`}>
        <div className="p-6 flex flex-wrap justify-between gap-3"><h3 className="font-black text-slate-900">Lançamentos de {mes.split('-').reverse().join('/')}</h3>
          {rel && <p className="text-sm font-bold text-slate-600">Entradas {brl(rel.totais.entradas)} · Saídas {brl(rel.totais.saidas)} · Saldo <span className={rel.totais.saldo < 0 ? 'text-red-600' : 'text-emerald-700'}>{brl(rel.totais.saldo)}</span></p>}</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-6 py-3">Data</th><th className="px-6 py-3">Tópico</th><th className="px-6 py-3">Descrição</th><th className="px-6 py-3 text-right">Valor</th><th className="px-6 py-3" /></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {linhas.length === 0 && <tr><td colSpan={5} className="px-6 py-6 text-slate-400 font-bold">Nenhum lançamento neste mês.</td></tr>}
            {linhas.map((l: any) => (
              <tr key={l.id}><td className="px-6 py-3">{dataBr(l.data)}</td><td className="px-6 py-3 font-bold">{l.categoriaNome}</td><td className="px-6 py-3 text-slate-600">{l.descricao}</td>
                <td className={`px-6 py-3 text-right font-bold ${l.tipo === 'ENTRADA' ? 'text-emerald-700' : 'text-red-600'}`}>{l.tipo === 'SAIDA' ? '- ' : '+ '}{brl(l.valor)}</td>
                <td className="px-6 py-3 text-right">{podeExcluir && <button aria-label="Apagar lançamento" onClick={() => window.confirm('Apagar este lançamento?') && exec(() => apiService.apagarLancamento(l.id), 'Lançamento apagado.')} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default Despesas;
