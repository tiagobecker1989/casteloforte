import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PublicShell, { inputCls } from '../components/PublicShell';
import { apiService } from '../services/apiService';

const RedefinirSenha: React.FC = () => {
  const { token = '' } = useParams();
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setErro('');
    if (s1.length < 8) return setErro('A senha deve ter ao menos 8 caracteres.');
    if (s1 !== s2) return setErro('As senhas não conferem.');
    setLoading(true);
    try { await apiService.redefinirSenha(token, s1); setOk(true); } catch (err: any) { setErro(err.message); } finally { setLoading(false); }
  };
  return (
    <PublicShell titulo="Nova senha">
      {ok ? (
        <div className="space-y-4"><p role="status" className="text-emerald-700 font-bold">Senha alterada com sucesso.</p><Link to="/login" className="inline-block bg-[#002878] text-white px-6 py-3 rounded-2xl font-bold">Entrar</Link></div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <input type="password" required minLength={8} value={s1} onChange={e => setS1(e.target.value)} placeholder="Nova senha (mín. 8 caracteres)" className={inputCls} aria-label="Nova senha" />
          <input type="password" required value={s2} onChange={e => setS2(e.target.value)} placeholder="Confirmar nova senha" className={inputCls} aria-label="Confirmar nova senha" />
          {erro && <p role="alert" className="text-sm font-bold text-red-600">{erro} {erro.includes('expirado') && <Link to="/esqueci-senha" className="underline">Solicitar novo link</Link>}</p>}
          <button disabled={loading} className="w-full bg-[#002878] text-white py-3.5 rounded-2xl font-bold disabled:opacity-50">{loading ? 'Salvando...' : 'Salvar nova senha'}</button>
        </form>
      )}
    </PublicShell>
  );
};
export default RedefinirSenha;
