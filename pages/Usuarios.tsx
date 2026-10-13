import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { apiService, UsuarioParoquia } from '../services/apiService';
import { useAuth } from '../services/AuthContext';
import { UserRole } from '../types';

const PERFIS: { id: UserRole; label: string }[] = [
  { id: 'ADMIN_PAROQUIA', label: 'Administrador' }, { id: 'PASTOR', label: 'Pastor' }, { id: 'TESOUREIRO', label: 'Tesoureiro' }, { id: 'SECRETARIA', label: 'Secretaria' },
];
const inputCls = 'w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-600 focus:bg-white outline-none';

const Usuarios: React.FC = () => {
  const { user } = useAuth();
  const [lista, setLista] = useState<UsuarioParoquia[]>([]);
  const [f, setF] = useState({ nome: '', email: '', senha: '', role: 'SECRETARIA' as UserRole });
  const [erro, setErro] = useState('');
  const carregar = () => apiService.getUsuarios().then(setLista);
  useEffect(() => { carregar(); }, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault(); setErro('');
    try { await apiService.criarUsuario(f); setF({ nome: '', email: '', senha: '', role: 'SECRETARIA' }); carregar(); } catch (err: any) { setErro(err.message); }
  };
  const alterar = async (id: string, p: { role?: UserRole; ativo?: boolean }) => {
    try { await apiService.atualizarUsuario(id, p); carregar(); } catch (err: any) { setErro(err.message); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Usuários</h2>
        <p className="text-slate-500 font-medium">Quem pode acessar os dados da sua paróquia e com qual perfil.</p>
      </div>
      <form onSubmit={criar} className="bg-white rounded-3xl border border-slate-100 p-6 grid md:grid-cols-5 gap-3 items-start">
        <input required placeholder="Nome" className={inputCls} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} />
        <input required type="email" placeholder="E-mail" className={inputCls} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <input required type="password" minLength={8} placeholder="Senha inicial" className={inputCls} value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} />
        <select className={inputCls} value={f.role} onChange={e => setF({ ...f, role: e.target.value as UserRole })}>{PERFIS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <button className="bg-[#002878] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"><UserPlus size={16} />Adicionar</button>
        {erro && <p role="alert" className="md:col-span-5 text-sm font-bold text-red-600">{erro}</p>}
      </form>
      <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100">
        {lista.map(u => (
          <div key={u.id} className="p-5 flex flex-wrap items-center gap-4 justify-between">
            <div><p className="font-bold text-slate-900">{u.nome}</p><p className="text-xs text-slate-400">{u.email}</p></div>
            <div className="flex items-center gap-3">
              <select disabled={u.id === user?.id} value={u.role} onChange={e => alterar(u.id, { role: e.target.value as UserRole })} className="px-3 py-2 bg-slate-50 rounded-xl text-sm">
                {PERFIS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button disabled={u.id === user?.id} onClick={() => alterar(u.id, { ativo: !u.ativo })} className={`text-sm font-bold ${u.ativo ? 'text-red-600' : 'text-emerald-600'} disabled:opacity-30`}>{u.ativo ? 'Desativar' : 'Reativar'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default Usuarios;
