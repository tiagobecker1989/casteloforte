import React, { useEffect, useState } from 'react';
import { Trash2, Save, Phone, Mail } from 'lucide-react';
import { apiService, PendenciaDiretoria } from '../services/apiService';
import { dataBr } from '../services/formato';
import { useAuth } from '../services/AuthContext';
import { CargoDiretoria, Membro, MembroDiretoria } from '../types';

const CARGOS: { id: CargoDiretoria; label: string }[] = [
  { id: 'PRESIDENTE', label: 'Presidente' }, { id: 'VICE_PRESIDENTE', label: 'Vice-presidente' },
  { id: 'SECRETARIO', label: '1º Secretário' }, { id: 'VICE_SECRETARIO', label: '2º Secretário' },
  { id: 'TESOUREIRO', label: '1º Tesoureiro' }, { id: 'VICE_TESOUREIRO', label: '2º Tesoureiro' },
  { id: 'CONSELHEIRO', label: 'Conselheiro' }, { id: 'VICE_CONSELHEIRO', label: 'Vice-conselheiro' },
  { id: 'FISCAL_1', label: 'Fiscal 1' }, { id: 'FISCAL_2', label: 'Fiscal 2' }, { id: 'FISCAL_3', label: 'Fiscal 3' },
];
const inputCls = 'w-full px-3 py-2 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-600 focus:bg-white outline-none text-sm';

const Diretoria: React.FC = () => {
  const { user, pode, refresh } = useAuth();
  const podeEditar = pode('diretoria.alterar');
  const presidente = user?.role === 'ADMIN_PAROQUIA';
  const [pend, setPend] = useState<{ pendentes: PendenciaDiretoria[]; minhas: PendenciaDiretoria[] }>({ pendentes: [], minhas: [] });
  const [confirmando, setConfirmando] = useState<PendenciaDiretoria | null>(null);
  const [senha, setSenha] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  const rotCargo = (c: string) => CARGOS.find(x => x.id === c)?.label ?? c;
  const [dir, setDir] = useState<Partial<Record<CargoDiretoria, MembroDiretoria>>>({});
  const [membros, setMembros] = useState<Membro[]>([]);
  const [edit, setEdit] = useState<Partial<Record<CargoDiretoria, MembroDiretoria>>>({});
  const [msg, setMsg] = useState('');

  const carregar = async () => {
    const [d, m] = await Promise.all([apiService.getDiretoria(), apiService.getTodosMembros()]);
    setDir(d); setMembros(m); setEdit({});
    apiService.getPendencias().then(setPend).catch(() => setPend({ pendentes: [], minhas: [] }));
    refresh().catch(() => undefined); // atualiza o aviso do presidente
  };
  useEffect(() => { carregar(); }, []);

  const atual = (c: CargoDiretoria) => edit[c] ?? dir[c] ?? ({ nome: '' } as MembroDiretoria);
  const mudar = (c: CargoDiretoria, p: Partial<MembroDiretoria>) => setEdit(e => ({ ...e, [c]: { ...atual(c), ...p } }));

  const escolherMembro = (c: CargoDiretoria, id: string) => {
    const m = membros.find(x => x.id === id);
    mudar(c, m ? { membroId: m.id, nome: m.nome, telefone: m.telefone, email: m.email } : { membroId: undefined });
  };
  const salvar = async (c: CargoDiretoria) => {
    const v = atual(c);
    try { const r: any = await apiService.setCargo(c, v); setMsg(r?.pendente ? 'Alteração enviada ao presidente. Ela só vale depois da confirmação dele (com a senha).' : 'Cargo salvo.'); await carregar(); } catch (e: any) { setMsg(e.message); }
  };
  const remover = async (c: CargoDiretoria) => {
    try { const r: any = await apiService.removeCargo(c); setMsg(r?.pendente ? 'Pedido de remoção enviado ao presidente para confirmação.' : 'Cargo removido.'); await carregar(); } catch (e: any) { setMsg(e.message); }
  };
  const descrever = (p: PendenciaDiretoria) => p.acao === 'ATRIBUIR'
    ? <>colocar <b>{p.membroNome || p.nome}</b> como <b>{rotCargo(p.cargo)}</b>{p.ocupanteAtual ? <> (hoje: {p.ocupanteAtual})</> : null}</>
    : <>remover <b>{p.ocupanteAtual || 'o ocupante'}</b> do cargo <b>{rotCargo(p.cargo)}</b></>;
  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!confirmando) return; setErroSenha('');
    try { await apiService.confirmarPendencia(confirmando.id, senha); setConfirmando(null); setSenha(''); setMsg('Alteração confirmada e aplicada.'); await carregar(); }
    catch (err: any) { setErroSenha(err.message); }
  };
  const recusar = async (p: PendenciaDiretoria) => {
    const motivo = window.prompt('Motivo da recusa (opcional):') ; if (motivo === null) return;
    try { await apiService.recusarPendencia(p.id, motivo || undefined); setMsg('Solicitação recusada.'); await carregar(); } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Diretoria</h2>
        <p className="text-slate-500 font-medium">Vincule um membro cadastrado a cada cargo ou informe os dados manualmente.</p>
        {msg && <p role="status" className="mt-2 text-sm font-bold text-emerald-600">{msg}</p>}
      </div>
      {presidente && pend.pendentes.length > 0 && (
        <section aria-label="Alterações aguardando confirmação" className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-6 space-y-3">
          <h3 className="font-black text-amber-900">Alterações aguardando a sua confirmação ({pend.pendentes.length})</h3>
          <p className="text-sm text-amber-900">Confirme com a sua senha para que a mudança valha. Se não reconhece o pedido, recuse.</p>
          <ul className="space-y-2">
            {pend.pendentes.map(p => (
              <li key={p.id} className="bg-white rounded-2xl p-4 flex flex-wrap items-center gap-3 justify-between">
                <p className="text-sm text-slate-700"><b>{p.solicitante || 'Usuário'}</b> pede para {descrever(p)} <span className="text-xs text-slate-400">· {dataBr(p.criadoEm)}</span></p>
                <div className="flex gap-3"><button onClick={() => { setConfirmando(p); setSenha(''); setErroSenha(''); }} className="bg-[#002878] text-white px-4 py-2 rounded-xl text-sm font-bold">Confirmar com minha senha</button>
                  <button onClick={() => recusar(p)} className="text-sm font-bold text-red-600">Recusar</button></div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!presidente && pend.minhas.length > 0 && (
        <section aria-label="Minhas solicitações" className="bg-white border border-slate-100 rounded-3xl p-6 space-y-2">
          <h3 className="font-black text-slate-900">Minhas solicitações ao presidente</h3>
          <ul className="space-y-1.5">
            {pend.minhas.map(p => (
              <li key={p.id} className="text-sm text-slate-600 flex flex-wrap gap-2 items-center">
                <span>{p.acao === 'ATRIBUIR' ? `${p.membroNome || p.nome} → ${rotCargo(p.cargo)}` : `Remover ${rotCargo(p.cargo)}`}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${p.status === 'PENDENTE' ? 'bg-amber-50 text-amber-700' : p.status === 'CONFIRMADA' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.status === 'PENDENTE' ? 'Aguardando' : p.status === 'CONFIRMADA' ? 'Confirmada' : p.status === 'RECUSADA' ? 'Recusada' : 'Cancelada'}</span>
                {p.motivo && p.status === 'RECUSADA' && <span className="text-xs text-slate-400">({p.motivo})</span>}
                {p.status === 'PENDENTE' && <button onClick={() => apiService.cancelarPendencia(p.id).then(carregar)} className="text-xs font-bold text-slate-500 underline">Cancelar</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirmando && (
        <div role="dialog" aria-modal="true" aria-labelledby="conf-t" className="fixed inset-0 z-[150] bg-slate-900/50 flex items-center justify-center p-4">
          <form onSubmit={confirmar} className="bg-white rounded-3xl p-8 w-full max-w-md space-y-4">
            <h3 id="conf-t" className="text-xl font-black text-slate-900">Confirmar alteração</h3>
            <p className="text-sm text-slate-600"><b>{confirmando.solicitante || 'Usuário'}</b> pede para {descrever(confirmando)}. Digite a sua senha de presidente para confirmar.</p>
            <input type="password" required autoFocus autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Sua senha" aria-label="Senha do presidente" className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none" />
            {erroSenha && <p role="alert" className="text-sm font-bold text-red-600">{erroSenha}</p>}
            <div className="flex gap-3"><button className="flex-1 bg-[#002878] text-white py-3 rounded-2xl font-bold">Confirmar</button><button type="button" onClick={() => setConfirmando(null)} className="px-4 text-slate-500 font-bold">Cancelar</button></div>
          </form>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {CARGOS.map(({ id, label }) => {
          const v = atual(id); const sujo = !!edit[id];
          return (
            <div key={id} className="bg-white rounded-3xl border border-slate-100 p-5 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs font-black text-[#002878] uppercase tracking-widest">{label}</p>
                {dir[id] && podeEditar && <button title="Remover do cargo" onClick={() => remover(id)} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>}
              </div>
              {podeEditar ? (
                <>
                  <select className={inputCls} value={v.membroId || ''} onChange={e => escolherMembro(id, e.target.value)}>
                    <option value="">Pessoa não cadastrada como membro</option>
                    {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <input className={inputCls} placeholder="Nome" value={v.nome} onChange={e => mudar(id, { nome: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputCls} placeholder="Telefone" value={v.telefone || ''} onChange={e => mudar(id, { telefone: e.target.value })} />
                    <input className={inputCls} placeholder="E-mail" value={v.email || ''} onChange={e => mudar(id, { email: e.target.value })} />
                  </div>
                  {sujo && <button onClick={() => salvar(id)} disabled={!v.nome} className="flex items-center gap-2 bg-[#002878] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40"><Save size={14} />Salvar</button>}
                </>
              ) : (
                <div className="text-sm text-slate-600">
                  <p className="font-bold text-slate-900">{v.nome || '—'}</p>
                  {v.telefone && <p className="flex items-center gap-1"><Phone size={12} />{v.telefone}</p>}
                  {v.email && <p className="flex items-center gap-1"><Mail size={12} />{v.email}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default Diretoria;
