import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, PauseCircle, PlayCircle, Plus, Users, Clock, X } from 'lucide-react';
import { apiService, ParoquiaSede } from '../services/apiService';
import { UnidadeStatus } from '../types';

const BADGE: Record<UnidadeStatus, string> = {
  PENDENTE: 'bg-amber-50 text-amber-700', ATIVA: 'bg-emerald-50 text-emerald-700', SUSPENSA: 'bg-red-50 text-red-700',
};
const inputCls = 'w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-600 focus:bg-white outline-none';
const VAZIO = { nome: '', tipo: 'PAROQUIA', distrito: '', endereco: '', contato: '', pastor: '', rNome: '', rEmail: '', rSenha: '' };

const Paroquias: React.FC = () => {
  const [lista, setLista] = useState<ParoquiaSede[]>([]);
  const [filtro, setFiltro] = useState<'TODAS' | UnidadeStatus>('TODAS');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [f, setF] = useState(VAZIO);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = () => apiService.getParoquias().then(setLista).finally(() => setLoading(false));
  useEffect(() => { carregar(); }, []);

  const visiveis = useMemo(() => lista.filter(p => filtro === 'TODAS' || p.status === filtro), [lista, filtro]);
  const pendentes = lista.filter(p => p.status === 'PENDENTE').length;
  const totalMembros = lista.reduce((s, p) => s + p.stats.ativos, 0);

  const mudar = async (id: string, status: UnidadeStatus) => { await apiService.setStatusParoquia(id, status); carregar(); };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault(); setErro('');
    try {
      await apiService.criarParoquia(
        { nome: f.nome, tipo: f.tipo as any, distrito: f.distrito, endereco: f.endereco, contato: f.contato, pastores: f.pastor ? [f.pastor] : [] },
        { nome: f.rNome, email: f.rEmail, senha: f.rSenha });
      setModal(false); setF(VAZIO); carregar();
    } catch (err: any) { setErro(err.message); }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Paróquias</h2>
          <p className="text-slate-500 font-medium">Cadastre, aprove e acompanhe as paróquias da plataforma.</p>
        </div>
        <button onClick={() => setModal(true)} className="bg-[#002878] text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2"><Plus size={18} /> Nova paróquia</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[{ l: 'Paróquias', v: lista.length, i: Building2 }, { l: 'Aguardando aprovação', v: pendentes, i: Clock }, { l: 'Membros ativos', v: totalMembros, i: Users }].map(k => (
          <div key={k.l} className="bg-white rounded-3xl border border-slate-100 p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-[#002878] rounded-2xl"><k.i size={22} /></div>
            <div><p className="text-2xl font-black text-slate-900">{k.v}</p><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{k.l}</p></div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['TODAS', 'PENDENTE', 'ATIVA', 'SUSPENSA'] as const).map(s => (
          <button key={s} onClick={() => setFiltro(s)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${filtro === s ? 'bg-[#002878] text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>{s}</button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100">
        {loading && <p className="p-8 text-slate-400 font-bold">Carregando...</p>}
        {!loading && visiveis.length === 0 && <p className="p-8 text-slate-400 font-bold">Nenhuma paróquia nesta visão.</p>}
        {visiveis.map(p => (
          <div key={p.id} className="p-6">
            <div className="flex flex-wrap items-center gap-4 justify-between">
              <button onClick={() => setAberta(aberta === p.id ? null : p.id)} className="text-left">
                <p className="font-black text-slate-900">{p.nome}</p>
                <p className="text-xs text-slate-400 font-bold uppercase">{p.tipo === 'COMUNIDADE' ? 'Comunidade' : 'Paróquia'} · {p.distrito || 'sem distrito'} · {p.stats.ativos} membros ativos</p>
              </button>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${BADGE[p.status || 'PENDENTE']}`}>{p.status}</span>
                {p.status !== 'ATIVA' && <button onClick={() => mudar(p.id, 'ATIVA')} className="flex items-center gap-1 text-emerald-600 font-bold text-sm"><CheckCircle2 size={16} />{p.status === 'PENDENTE' ? 'Aprovar' : 'Reativar'}</button>}
                {p.status === 'ATIVA' && <button onClick={() => mudar(p.id, 'SUSPENSA')} className="flex items-center gap-1 text-red-600 font-bold text-sm"><PauseCircle size={16} />Suspender</button>}
              </div>
            </div>
            {aberta === p.id && (
              <div className="mt-4 grid md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-1 text-slate-600">
                  <p><b>Responsável:</b> {p.admin ? `${p.admin.nome} (${p.admin.email})` : '—'}</p>
                  <p><b>Pastores:</b> {p.pastores.join(', ') || '—'}</p>
                  <p><b>Endereço:</b> {p.endereco || '—'}</p>
                  <p><b>Contato:</b> {p.contato || '—'}</p>
                  <button onClick={async () => { const n = window.prompt(`EXCLUSÃO DEFINITIVA de todos os dados de "${p.nome}" (membros, finanças, usuários). Digite o nome exato da paróquia para confirmar:`); if (n === null) return; try { await apiService.excluirParoquia(p.id, n); carregar(); } catch (e: any) { window.alert(e.message); } }} className="mt-2 text-xs font-bold text-red-600 underline">Excluir paróquia definitivamente</button>
                </div>
                <div>
                  <p className="font-black text-xs uppercase tracking-wider text-slate-400 mb-2">Diretoria</p>
                  {Object.keys(p.diretoria).length === 0 && <p className="text-slate-400">Ainda não cadastrada.</p>}
                  {(Object.entries(p.diretoria) as [string, { nome: string }][]).map(([cargo, m]) => <p key={cargo} className="text-slate-600"><b>{cargo.replace('_', ' ')}:</b> {m.nome}</p>)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={criar} className="bg-white rounded-3xl p-8 w-full max-w-xl space-y-4">
            <div className="flex justify-between items-center"><h3 className="text-xl font-black">Nova paróquia</h3><button type="button" onClick={() => setModal(false)}><X /></button></div>
            <input required placeholder="Nome da paróquia" className={inputCls} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <select className={inputCls} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="PAROQUIA">Paróquia</option><option value="COMUNIDADE">Comunidade</option></select>
              <input placeholder="Distrito" className={inputCls} value={f.distrito} onChange={e => setF({ ...f, distrito: e.target.value })} />
            </div>
            <input placeholder="Endereço" className={inputCls} value={f.endereco} onChange={e => setF({ ...f, endereco: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Telefone" className={inputCls} value={f.contato} onChange={e => setF({ ...f, contato: e.target.value })} />
              <input placeholder="Pastor titular" className={inputCls} value={f.pastor} onChange={e => setF({ ...f, pastor: e.target.value })} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest pt-2">Administrador da paróquia</p>
            <input required placeholder="Nome" className={inputCls} value={f.rNome} onChange={e => setF({ ...f, rNome: e.target.value })} />
            <input required type="email" placeholder="E-mail" className={inputCls} value={f.rEmail} onChange={e => setF({ ...f, rEmail: e.target.value })} />
            <input required type="password" minLength={8} placeholder="Senha inicial (mín. 8)" className={inputCls} value={f.rSenha} onChange={e => setF({ ...f, rSenha: e.target.value })} />
            {erro && <p role="alert" className="text-sm font-bold text-red-600">{erro}</p>}
            <button className="w-full bg-[#002878] text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2"><PlayCircle size={18} />Criar e ativar</button>
          </form>
        </div>
      )}
    </div>
  );
};
export default Paroquias;
