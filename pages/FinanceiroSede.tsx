import React, { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Banknote, CheckCircle2, ChevronDown, Download, Percent, Plus, Trash2, Undo2, Wallet } from 'lucide-react';
import { apiService, FinanceiroSede, HistoricoMes, RepasseParoquia, StatusRepasse } from '../services/apiService';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const BADGE: Record<StatusRepasse, string> = {
  PAGO: 'bg-emerald-50 text-emerald-700', PARCIAL: 'bg-amber-50 text-amber-700', PENDENTE: 'bg-blue-50 text-blue-700',
  ATRASADO: 'bg-red-50 text-red-700', SEM_MOVIMENTO: 'bg-slate-100 text-slate-500',
};
const LABEL: Record<StatusRepasse, string> = { PAGO: 'Pago', PARCIAL: 'Parcial', PENDENTE: 'A vencer', ATRASADO: 'Atrasado', SEM_MOVIMENTO: 'Sem movimento' };
const inputCls = 'px-3 py-2 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-600 focus:bg-white outline-none text-sm';

const Kpi: React.FC<{ icon: any; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div className="bg-white rounded-3xl border border-slate-100 p-6 flex items-center gap-4">
    <div className="p-3 bg-blue-50 text-[#002878] rounded-2xl"><Icon size={22} /></div>
    <div><p className="text-2xl font-black text-slate-900">{value}</p><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p></div>
  </div>
);

const FinanceiroSedePage: React.FC = () => {
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));
  const [dados, setDados] = useState<FinanceiroSede | null>(null);
  const [hist, setHist] = useState<HistoricoMes[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [ov, setOv] = useState<Record<string, string>>({});
  const [cotas, setCotas] = useState<{ id?: string; nome: string; percent: number }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([apiService.getFinanceiroSede(comp), apiService.getHistoricoSede(6)]);
      setDados(d); setHist(h); setCotas(d.cotas.map(c => ({ ...c })));
    } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  }, [comp]);
  useEffect(() => { carregar(); }, [carregar]);

  const aviso = (ok: boolean, t: string) => { setMsg({ ok, t }); setTimeout(() => setMsg(null), 4000); };
  const exec = async (fn: () => Promise<any>, okMsg: string) => {
    try { await fn(); aviso(true, okMsg); await carregar(); } catch (e: any) { aviso(false, e.message); }
  };

  const registrar = (p: RepasseParoquia) => {
    const txt = window.prompt(`Valor recebido de ${p.nome} (${brl(p.devido)} devido):`, String(p.devido).replace('.', ','));
    if (txt === null) return;
    const valor = Number(txt.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) return aviso(false, 'Valor inválido.');
    exec(() => apiService.registrarRepasse({ unidadeId: p.id, competencia: comp, pago: true, valorPago: valor }), 'Recebimento registrado.');
  };

  const abrir = (p: RepasseParoquia) => {
    setAberta(aberta === p.id ? null : p.id);
    setOv(Object.fromEntries(p.cotas.map(c => [c.cotaId, String(c.percent)])));
  };
  const salvarOverrides = (p: RepasseParoquia) => {
    const o = Object.fromEntries(Object.entries(ov).map(([k, v]) => [k, Number(String(v).replace(',', '.'))]));
    exec(() => apiService.salvarCotasParoquia(p.id, o), 'Percentuais da paróquia atualizados.');
  };

  const totalCotas = cotas.reduce((s, c) => s + (Number(c.percent) || 0), 0);

  const exportarCsv = () => {
    if (!dados) return;
    const cab = ['Paróquia', 'Distrito', 'Base (ofertas+dízimos)', ...dados.cotas.map(c => c.nome), 'Devido', 'Pago', 'Status'];
    const linhas = dados.paroquias.map(p => [p.nome, p.distrito, p.base, ...p.cotas.map(c => c.valor), p.devido, p.valorPago, LABEL[p.status]]);
    const csv = [cab, ...linhas].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `repasses_${comp}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const t = dados?.totais;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Financeiro Consolidado</h2>
          <p className="text-slate-500 font-medium">Repasses (cotas) devidos pelas paróquias ativas. A sede vê apenas os totais, não os lançamentos de cada paróquia.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={comp} onChange={e => e.target.value && setComp(e.target.value)} className={inputCls} aria-label="Competência" />
          <button onClick={exportarCsv} disabled={!dados} className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-40"><Download size={16} />CSV</button>
        </div>
      </div>

      {msg && <p role="status" className={`text-sm font-bold rounded-xl px-4 py-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Banknote} label="Ofertas + dízimos (base)" value={t ? brl(t.base) : '—'} />
        <Kpi icon={Percent} label="Repasse devido" value={t ? brl(t.devido) : '—'} />
        <Kpi icon={Wallet} label="Recebido · a receber" value={t ? `${brl(t.pago)} · ${brl(t.aReceber)}` : '—'} />
        <Kpi icon={CheckCircle2} label="Adimplência" value={t?.adimplencia == null ? '—' : `${t.adimplencia}%`} />
      </div>
      {dados && <p className="text-xs text-slate-400 font-bold -mt-4">Vencimento da competência {comp}: {dados.vencimento.split('-').reverse().join('/')}.</p>}

      <div className="bg-white rounded-3xl border border-slate-100 p-6">
        <h3 className="font-black text-slate-900 mb-4">Últimos 6 meses</h3>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={hist}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="competencia" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `R$ ${v}`} width={70} />
              <Tooltip formatter={(v: any) => brl(Number(v))} />
              <Legend />
              <Bar dataKey="devido" name="Devido" fill="#005CB9" radius={[6, 6, 0, 0]} />
              <Bar dataKey="pago" name="Recebido" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100">
        {dados && dados.paroquias.length === 0 && <p className="p-8 text-slate-400 font-bold">Nenhuma paróquia ativa ainda.</p>}
        {dados?.paroquias.map(p => (
          <div key={p.id} className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <button onClick={() => abrir(p)} className="flex items-center gap-2 text-left">
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${aberta === p.id ? 'rotate-180' : ''}`} />
                <div><p className="font-black text-slate-900">{p.nome}</p><p className="text-xs text-slate-400 font-bold uppercase">{p.distrito || 'sem distrito'} · base {brl(p.base)}</p></div>
              </button>
              <div className="flex items-center gap-4">
                <div className="text-right"><p className="font-black text-slate-900">{brl(p.devido)}</p>{p.valorPago > 0 && <p className="text-[11px] text-slate-400">pago {brl(p.valorPago)}{p.pagoEm ? ` em ${p.pagoEm.split('-').reverse().join('/')}` : ''}</p>}</div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${BADGE[p.status]}`}>{LABEL[p.status]}</span>
                {p.pagoEm
                  ? <button onClick={() => exec(() => apiService.registrarRepasse({ unidadeId: p.id, competencia: comp, pago: false }), 'Recebimento desfeito.')} className="flex items-center gap-1 text-slate-500 font-bold text-sm"><Undo2 size={15} />Desfazer</button>
                  : p.devido > 0 && <button onClick={() => registrar(p)} className="flex items-center gap-1 text-emerald-600 font-bold text-sm"><CheckCircle2 size={15} />Registrar recebimento</button>}
              </div>
            </div>
            {aberta === p.id && (
              <div className="mt-5 bg-slate-50 rounded-2xl p-5 space-y-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Cotas desta paróquia</p>
                {p.cotas.map(c => (
                  <div key={c.cotaId} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="flex-1 min-w-[10rem] font-bold text-slate-700">{c.nome}{c.personalizada && <span className="ml-2 text-[10px] font-black text-amber-600 uppercase">personalizada</span>}</span>
                    <input type="number" step="0.01" min="0" max="100" value={ov[c.cotaId] ?? ''} onChange={e => setOv({ ...ov, [c.cotaId]: e.target.value })} disabled={!!p.pagoEm} className={`${inputCls} w-24 text-center`} aria-label={`Percentual ${c.nome}`} />
                    <span className="text-slate-400">%</span>
                    <span className="w-28 text-right font-bold text-slate-900">{brl(c.valor)}</span>
                  </div>
                ))}
                {p.pagoEm
                  ? <p className="text-xs text-slate-400">Competência já recebida: o valor devido ficou congelado. Desfaça o recebimento para recalcular.</p>
                  : <button onClick={() => salvarOverrides(p)} className="bg-[#002878] text-white px-4 py-2 rounded-xl text-sm font-bold">Salvar percentuais desta paróquia</button>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div><h3 className="font-black text-slate-900">Cotas padrão da sede</h3><p className="text-xs text-slate-400">Aplicadas a todas as paróquias, exceto onde houver percentual personalizado. Total: <b>{totalCotas.toLocaleString('pt-BR')}%</b></p></div>
          <button onClick={() => setCotas([...cotas, { nome: 'Nova cota', percent: 0 }])} className="flex items-center gap-1 text-[#002878] font-bold text-sm"><Plus size={16} />Adicionar</button>
        </div>
        {cotas.map((c, i) => (
          <div key={c.id || i} className="flex items-center gap-3">
            <input className={`${inputCls} flex-1`} value={c.nome} onChange={e => setCotas(cotas.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} aria-label="Nome da cota" />
            <input type="number" step="0.01" min="0" max="100" className={`${inputCls} w-24 text-center`} value={c.percent} onChange={e => setCotas(cotas.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) } : x))} aria-label="Percentual" />
            <span className="text-slate-400">%</span>
            <button disabled={cotas.length === 1} onClick={() => setCotas(cotas.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 disabled:opacity-30" title="Remover"><Trash2 size={16} /></button>
          </div>
        ))}
        <button onClick={() => exec(() => apiService.salvarCotasGlobais(cotas), 'Cotas padrão salvas.')} disabled={totalCotas > 100} className="bg-[#002878] text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40">Salvar cotas padrão</button>
        <p className="text-xs text-slate-400">Mudar as cotas padrão altera os meses ainda não recebidos; competências já recebidas permanecem congeladas.</p>
      </div>
    </div>
  );
};
export default FinanceiroSedePage;
