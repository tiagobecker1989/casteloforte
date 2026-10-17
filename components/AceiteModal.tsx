import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { apiService } from '../services/apiService';
import { useAuth } from '../services/AuthContext';

/** Bloqueia o uso até o usuário aceitar a versão vigente dos Termos e da Política de Privacidade. */
const AceiteModal: React.FC = () => {
  const { refresh, logout } = useAuth();
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState('');
  const aceitar = async () => { try { await apiService.aceitar(); await refresh(); } catch (e: any) { setErro(e.message); } };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="aceite-t" className="fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full space-y-5">
        <div className="flex items-center gap-3"><ShieldCheck className="text-[#002878]" /><h2 id="aceite-t" className="text-xl font-black">Termos e privacidade</h2></div>
        <p className="text-slate-600 text-sm">Para continuar, leia e aceite os documentos abaixo. Eles explicam como os dados da sua paróquia e dos seus membros são tratados.</p>
        <p className="text-sm font-bold"><a href="#/legal/termos" target="_blank" rel="noreferrer" className="text-blue-600 underline">Termos de Uso</a> · <a href="#/legal/privacidade" target="_blank" rel="noreferrer" className="text-blue-600 underline">Política de Privacidade</a></p>
        <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-1" />Li e aceito os Termos de Uso e a Política de Privacidade.</label>
        {erro && <p role="alert" className="text-sm font-bold text-red-600">{erro}</p>}
        <div className="flex gap-3">
          <button disabled={!ok} onClick={aceitar} className="flex-1 bg-[#002878] text-white py-3 rounded-2xl font-bold disabled:opacity-40">Aceitar e continuar</button>
          <button onClick={logout} className="px-4 text-slate-500 font-bold">Sair</button>
        </div>
      </div>
    </div>
  );
};
export default AceiteModal;
