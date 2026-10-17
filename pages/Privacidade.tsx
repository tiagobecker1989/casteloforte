import React, { useEffect, useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { apiService, RegistroAuditoria } from '../services/apiService';
import { baixarJson } from '../services/download';

const ROTULO: Record<string, string> = {
  CRIAR: 'Cadastro', ATUALIZAR: 'Alteração', EXCLUIR: 'Exclusão', EXPORTAR: 'Exportação', ANONIMIZAR: 'Anonimização',
  CONSENTIMENTO_REGISTRADO: 'Consentimento registrado', CONSENTIMENTO_REVOGADO: 'Consentimento revogado',
  USUARIO_CRIADO: 'Usuário criado', USUARIO_ALTERADO: 'Usuário alterado', PLANO_ALTERADO: 'Plano alterado', SENHA_REDEFINIDA: 'Senha redefinida',
};

const Privacidade: React.FC = () => {
  const [log, setLog] = useState<RegistroAuditoria[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { apiService.getAuditoria().then(setLog).catch(e => setMsg(e.message)); }, []);
  const exportar = async () => {
    try { baixarJson(`paroquia_${new Date().toISOString().slice(0, 10)}.json`, await apiService.exportarParoquia()); apiService.getAuditoria().then(setLog); }
    catch (e: any) { setMsg(e.message); }
  };
  return (
    <div className="space-y-8">
      <div><h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3"><ShieldCheck className="text-[#002878]" />Privacidade e LGPD</h2>
        <p className="text-slate-500 font-medium">Exportação dos dados da paróquia e registro das operações com dados pessoais.</p></div>
      {msg && <p role="alert" className="text-sm font-bold text-red-600">{msg}</p>}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 flex flex-wrap items-center justify-between gap-4">
        <div><h3 className="font-black text-slate-900">Cópia completa dos dados</h3><p className="text-sm text-slate-500">Membros, diretoria, finanças, departamentos, eventos e usuários (sem senhas), em JSON. Cada exportação fica registrada.</p></div>
        <button onClick={exportar} className="flex items-center gap-2 bg-[#002878] text-white px-5 py-3 rounded-2xl font-bold"><Download size={16} />Exportar tudo</button>
      </div>
      <p className="text-sm text-slate-500">Para atender um titular (acesso, correção, anonimização), abra a ficha do membro em <b>Membros</b>.</p>
      <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="p-4">Quando</th><th className="p-4">Quem</th><th className="p-4">Operação</th><th className="p-4">Registro</th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {log.length === 0 && <tr><td colSpan={4} className="p-6 text-slate-400 font-bold">Nenhum registro ainda.</td></tr>}
            {log.map(a => (
              <tr key={a.id}><td className="p-4 whitespace-nowrap">{new Date(a.criadoEm).toLocaleString('pt-BR')}</td><td className="p-4">{a.usuario || '—'}</td>
                <td className="p-4 font-bold">{ROTULO[a.acao] || a.acao}</td><td className="p-4 text-slate-500">{a.entidade}{a.detalhe ? ` · ${a.detalhe}` : ''}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default Privacidade;
