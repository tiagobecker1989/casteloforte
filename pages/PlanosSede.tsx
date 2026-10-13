import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, XCircle } from 'lucide-react';
import { apiService, CobrancaSede, Fatura, Plano } from '../services/apiService';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const cls = 'px-3 py-2 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-600 focus:bg-white outline-none text-sm';
const BAD: Record<string, string> = { ATIVA: 'bg-emerald-50 text-emerald-700', TRIAL: 'bg-blue-50 text-blue-700', INADIMPLENTE: 'bg-red-50 text-red-700', CANCELADA: 'bg-slate-100 text-slate-500' };
type Edit = { id?: string; nome: string; precoMensal: string; limiteMembros: string; limiteUsuarios: string; ativo: boolean };
const novoEdit = (p?: Plano): Edit => ({ id: p?.id, nome: p?.nome ?? '', precoMensal: String(p?.precoMensal ?? 0), limiteMembros: p?.limiteMembros == null ? '' : String(p.limiteMembros), limiteUsuarios: p?.limiteUsuarios == null ? '' : String(p.limiteUsuarios), ativo: p ? !!p.ativo : true });

const PlanosSede: React.FC = () => {
  const [cob, setCob] = useState<CobrancaSede | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [filtro, setFiltro] = useState('ABERTA');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [av, setAv] = useState({ unidadeId: '', competencia: new Date().toISOString().slice(0, 7), valor: '', vencimento: '' });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const carregar = useCallback(async () => {
    try { const [c, p, f] = await Promise.all([apiService.getCobranca(), apiService.getPlanos(), apiService.getFaturasSede(filtro)]); setCob(c); setPlanos(p); setFaturas(f); }
    catch (e: any) { setMsg({ ok: false, t: e.message }); }
  }, [filtro]);
  useEffect(() => { carregar(); }, [carregar]);

  const exec = async (fn: () => Promise<any>, ok: string) => { try { await fn(); setMsg({ ok: true, t: ok }); await carregar(); } catch (e: any) { setMsg({ ok: false, t: e.message }); } };
  const salvarPlano = (e: React.FormEvent) => {
    e.preventDefault(); if (!edit) return;
    const n = (v: string) => (v.trim() === '' ? null : Number(v));
    exec(() => apiService.salvarPlano({ id: edit.id, nome: edit.nome, precoMensal: Number(edit.precoMensal.replace(',', '.')), limiteMembros: n(edit.limiteMembros), limiteUsuarios: n(edit.limiteUsuarios), ativo: edit.ativo ? 1 : 0 }), 'Plano salvo.').then(() => setEdit(null));
  };
  const k = cob?.kpis;
  return (
    <div className="space-y-8">
      <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Planos e Cobrança</h2><p className="text-slate-500 font-medium">Assinaturas das paróquias, faturas e recebimentos.</p></div>
      {msg && <p role="status" className={`text-sm font-bold rounded-xl px-4 py-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      <p className={`text-xs font-bold ${cob?.gateway?.ativo ? 'text-emerald-600' : 'text-slate-400'}`}>{cob?.gateway?.ativo ? `Pagamento online (Asaas, ${cob.gateway.ambiente === 'sandbox' ? 'ambiente de testes' : 'produção'}) ativo: cobranças e baixas automáticas.` : 'Pagamento online não configurado: confirme os recebimentos manualmente.'}</p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[['Receita mensal recorrente', k ? brl(k.mrr) : '—'], ['Recebido no mês', k ? brl(k.recebidoMes) : '—'], ['Inadimplentes', k ? String(k.inadimplentes) : '—'], ['Em período de teste', k ? String(k.emTrial) : '—']].map(([l, v]) => (
          <div key={l} className="bg-white rounded-3xl border border-slate-100 p-6"><p className="text-2xl font-black text-slate-900">{v}</p><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{l}</p></div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
        <div className="flex justify-between items-center"><h3 className="font-black text-slate-900">Planos</h3><button onClick={() => setEdit(novoEdit())} className="flex items-center gap-1 text-[#002878] font-bold text-sm"><Plus size={16} />Novo plano</button></div>
        <div className="divide-y divide-slate-100">
          {planos.map(p => (
            <div key={p.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-bold text-slate-900">{p.nome}{!p.ativo && <span className="ml-2 text-[10px] text-slate-400 uppercase">inativo</span>}</p><p className="text-xs text-slate-500">{brl(p.precoMensal)}/mês · {p.limiteMembros ?? '∞'} membros · {p.limiteUsuarios ?? '∞'} usuários</p></div>
              <button onClick={() => setEdit(novoEdit(p))} className="text-sm font-bold text-blue-600">Editar</button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">Os valores e limites iniciais são exemplos: ajuste-os à realidade da sede. Em branco = ilimitado.</p>
        {edit && (
          <form onSubmit={salvarPlano} className="bg-slate-50 rounded-2xl p-4 grid md:grid-cols-5 gap-3 items-end">
            <label className="text-xs font-bold text-slate-500">Nome<input required className={`${cls} w-full`} value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} /></label>
            <label className="text-xs font-bold text-slate-500">Preço/mês (R$)<input required className={`${cls} w-full`} inputMode="decimal" value={edit.precoMensal} onChange={e => setEdit({ ...edit, precoMensal: e.target.value })} /></label>
            <label className="text-xs font-bold text-slate-500">Máx. membros<input className={`${cls} w-full`} inputMode="numeric" value={edit.limiteMembros} onChange={e => setEdit({ ...edit, limiteMembros: e.target.value })} /></label>
            <label className="text-xs font-bold text-slate-500">Máx. usuários<input className={`${cls} w-full`} inputMode="numeric" value={edit.limiteUsuarios} onChange={e => setEdit({ ...edit, limiteUsuarios: e.target.value })} /></label>
            <div className="flex items-center gap-3"><label className="text-xs font-bold text-slate-500 flex items-center gap-1"><input type="checkbox" checked={edit.ativo} onChange={e => setEdit({ ...edit, ativo: e.target.checked })} />Ativo</label><button className="bg-[#002878] text-white px-4 py-2 rounded-xl text-sm font-bold">Salvar</button><button type="button" onClick={() => setEdit(null)} className="text-sm text-slate-500">Cancelar</button></div>
          </form>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
        <div className="p-6 flex flex-wrap justify-between gap-3 items-center"><h3 className="font-black text-slate-900">Assinaturas</h3>
          <button onClick={() => exec(async () => { const r = await apiService.gerarFaturas(new Date().toISOString().slice(0, 7)); setMsg({ ok: true, t: `${r.criadas} fatura(s) gerada(s).` }); }, '')} className="flex items-center gap-2 text-sm font-bold text-[#002878]"><RefreshCw size={14} />Gerar faturas do mês</button></div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-6 py-3">Paróquia</th><th className="px-6 py-3">Plano</th><th className="px-6 py-3">Situação</th><th className="px-6 py-3">Em aberto</th><th className="px-6 py-3"></th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {cob?.assinaturas.length === 0 && <tr><td colSpan={5} className="px-6 py-6 text-slate-400 font-bold">Nenhuma paróquia ativa.</td></tr>}
            {cob?.assinaturas.map(a => (
              <tr key={a.unidadeId}>
                <td className="px-6 py-4 font-bold">{a.nome}<span className="block text-[10px] text-slate-400 uppercase">{a.distrito}</span></td>
                <td className="px-6 py-4"><select className={cls} value={a.planoId} onChange={e => exec(() => apiService.alterarAssinatura(a.unidadeId, { planoId: e.target.value }), 'Plano alterado.')} aria-label={`Plano de ${a.nome}`}>{planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></td>
                <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${BAD[a.status] || ''}`}>{a.status}</span>{a.status === 'TRIAL' && <span className="block text-[10px] text-slate-400 mt-1">até {data(a.trialAte)}</span>}</td>
                <td className="px-6 py-4">{a.emAberto > 0 ? `${brl(a.emAberto)} (${a.abertas})` : '—'}</td>
                <td className="px-6 py-4 text-right">{a.status === 'CANCELADA'
                  ? <button onClick={() => exec(() => apiService.alterarAssinatura(a.unidadeId, { status: 'ATIVA' }), 'Assinatura reativada.')} className="text-emerald-600 font-bold">Reativar</button>
                  : <button onClick={() => window.confirm(`Cancelar a assinatura de ${a.nome}? A paróquia ficará em modo somente leitura.`) && exec(() => apiService.alterarAssinatura(a.unidadeId, { status: 'CANCELADA' }), 'Assinatura cancelada.')} className="text-red-600 font-bold">Cancelar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
        <div className="p-6 flex flex-wrap gap-2 items-center justify-between"><h3 className="font-black text-slate-900">Faturas</h3>
          <div className="flex gap-2">{['ABERTA', 'PAGA', 'CANCELADA', ''].map(s => <button key={s || 'T'} onClick={() => setFiltro(s)} className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase ${filtro === s ? 'bg-[#002878] text-white' : 'bg-slate-50 text-slate-500'}`}>{s || 'Todas'}</button>)}</div></div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-6 py-3">Paróquia</th><th className="px-6 py-3">Competência</th><th className="px-6 py-3">Vencimento</th><th className="px-6 py-3">Valor</th><th className="px-6 py-3">Situação</th><th className="px-6 py-3"></th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {faturas.length === 0 && <tr><td colSpan={6} className="px-6 py-6 text-slate-400 font-bold">Nenhuma fatura nesta visão.</td></tr>}
            {faturas.map(f => (
              <tr key={f.id}><td className="px-6 py-4 font-bold">{f.paroquia}</td><td className="px-6 py-4">{f.competencia}</td><td className="px-6 py-4">{data(f.vencimento)}</td><td className="px-6 py-4">{brl(f.valor)}</td>
                <td className="px-6 py-4">{f.status}{f.pagoEm ? ` em ${data(f.pagoEm)}` : ''}{f.linkPagamento && f.status === 'ABERTA' && <a href={f.linkPagamento} target="_blank" rel="noreferrer" className="ml-2 text-blue-600 underline text-xs">link</a>}</td>
                <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">{f.status === 'ABERTA' && <>
                  <button onClick={() => exec(() => apiService.pagarFatura(f.id, 'PIX'), 'Pagamento confirmado.')} className="text-emerald-600 font-bold inline-flex items-center gap-1"><CheckCircle2 size={14} />Confirmar Pix</button>
                  <button onClick={() => exec(() => apiService.cancelarFatura(f.id), 'Fatura cancelada.')} className="text-slate-400 inline-flex items-center gap-1"><XCircle size={14} />Cancelar</button></>}</td></tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={e => { e.preventDefault(); exec(() => apiService.criarFaturaAvulsa({ unidadeId: av.unidadeId, competencia: av.competencia, valor: Number(av.valor.replace(',', '.')), vencimento: av.vencimento }), 'Fatura avulsa criada.'); }} className="p-6 border-t border-slate-100 flex flex-wrap gap-3 items-end">
          <p className="w-full text-xs font-black text-slate-400 uppercase tracking-widest">Fatura avulsa</p>
          <select required className={cls} value={av.unidadeId} onChange={e => setAv({ ...av, unidadeId: e.target.value })} aria-label="Paróquia"><option value="">Paróquia...</option>{cob?.assinaturas.map(a => <option key={a.unidadeId} value={a.unidadeId}>{a.nome}</option>)}</select>
          <input required type="month" className={cls} value={av.competencia} onChange={e => setAv({ ...av, competencia: e.target.value })} aria-label="Competência" />
          <input required className={cls} placeholder="Valor (R$)" inputMode="decimal" value={av.valor} onChange={e => setAv({ ...av, valor: e.target.value })} aria-label="Valor" />
          <input required type="date" className={cls} value={av.vencimento} onChange={e => setAv({ ...av, vencimento: e.target.value })} aria-label="Vencimento" />
          <button className="bg-[#002878] text-white px-4 py-2 rounded-xl text-sm font-bold">Criar</button>
        </form>
      </div>
    </div>
  );
};
export default PlanosSede;
