import React, { useState } from 'react';
import { apiService, auth } from '../services/apiService';
import { useAuth } from '../services/AuthContext';
import { inputCls } from '../components/PublicShell';

const Conta: React.FC = () => {
  const { user, refresh } = useAuth();
  const [f, setF] = useState({ atual: '', nova: '', nova2: '' });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (f.nova.length < 8) return setMsg({ ok: false, t: 'A nova senha deve ter ao menos 8 caracteres.' });
    if (f.nova !== f.nova2) return setMsg({ ok: false, t: 'As senhas não conferem.' });
    try {
      const { token } = await apiService.alterarSenha(f.atual, f.nova);
      const lembrar = !!localStorage.getItem('ielb_token'); auth.clear(); auth.save(token, lembrar); await refresh();
      setF({ atual: '', nova: '', nova2: '' }); setMsg({ ok: true, t: 'Senha alterada. Outras sessões abertas foram encerradas.' });
    } catch (err: any) { setMsg({ ok: false, t: err.message }); }
  };
  return (
    <div className="space-y-8 max-w-xl">
      <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Minha conta</h2><p className="text-slate-500 font-medium">{user?.nome}</p></div>
      <form onSubmit={salvar} className="bg-white rounded-3xl border border-slate-100 p-6 space-y-3">
        <h3 className="font-black text-slate-900">Alterar senha</h3>
        <input type="password" required className={inputCls} placeholder="Senha atual" value={f.atual} onChange={e => setF({ ...f, atual: e.target.value })} aria-label="Senha atual" />
        <input type="password" required minLength={8} className={inputCls} placeholder="Nova senha (mín. 8)" value={f.nova} onChange={e => setF({ ...f, nova: e.target.value })} aria-label="Nova senha" />
        <input type="password" required className={inputCls} placeholder="Confirmar nova senha" value={f.nova2} onChange={e => setF({ ...f, nova2: e.target.value })} aria-label="Confirmar nova senha" />
        {msg && <p role="status" className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.t}</p>}
        <button className="bg-[#002878] text-white px-6 py-3 rounded-2xl font-bold">Salvar</button>
      </form>
      <p className="text-sm text-slate-500"><a className="text-blue-600 underline" href="#/legal/termos">Termos de Uso</a> · <a className="text-blue-600 underline" href="#/legal/privacidade">Política de Privacidade</a></p>
    </div>
  );
};
export default Conta;
