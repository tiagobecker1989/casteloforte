import React, { useState } from 'react';
import PublicShell, { inputCls } from '../components/PublicShell';
import { apiService } from '../services/apiService';

const EsqueciSenha: React.FC = () => {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErro('');
    try { await apiService.esqueciSenha(email); setEnviado(true); } catch (err: any) { setErro(err.message); } finally { setLoading(false); }
  };
  return (
    <PublicShell titulo="Recuperar senha" subtitulo="Enviaremos um link para o seu e-mail.">
      {enviado ? (
        <p role="status" className="text-slate-600 font-medium">Se houver uma conta com <b>{email}</b>, você receberá em instantes um e-mail com o link para criar uma nova senha. O link vale por 1 hora.</p>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} aria-label="E-mail" />
          {erro && <p role="alert" className="text-sm font-bold text-red-600">{erro}</p>}
          <button disabled={loading} className="w-full bg-[#002878] text-white py-3.5 rounded-2xl font-bold disabled:opacity-50">{loading ? 'Enviando...' : 'Enviar link de recuperação'}</button>
        </form>
      )}
    </PublicShell>
  );
};
export default EsqueciSenha;
