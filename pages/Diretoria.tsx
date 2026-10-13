import React, { useEffect, useState } from 'react';
import { Trash2, Save, Phone, Mail } from 'lucide-react';
import { apiService } from '../services/apiService';
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
  const { user } = useAuth();
  const podeEditar = user?.role !== 'TESOUREIRO';
  const [dir, setDir] = useState<Partial<Record<CargoDiretoria, MembroDiretoria>>>({});
  const [membros, setMembros] = useState<Membro[]>([]);
  const [edit, setEdit] = useState<Partial<Record<CargoDiretoria, MembroDiretoria>>>({});
  const [msg, setMsg] = useState('');

  const carregar = async () => {
    const [d, m] = await Promise.all([apiService.getDiretoria(), apiService.getTodosMembros()]);
    setDir(d); setMembros(m); setEdit({});
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
    try { await apiService.setCargo(c, v); setMsg('Cargo salvo.'); await carregar(); } catch (e: any) { setMsg(e.message); }
  };
  const remover = async (c: CargoDiretoria) => { await apiService.removeCargo(c); await carregar(); };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Diretoria</h2>
        <p className="text-slate-500 font-medium">Vincule um membro cadastrado a cada cargo ou informe os dados manualmente.</p>
        {msg && <p role="status" className="mt-2 text-sm font-bold text-emerald-600">{msg}</p>}
      </div>
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
