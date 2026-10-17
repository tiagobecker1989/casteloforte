import React, { useEffect, useState } from 'react';
import { Download, Pencil, ShieldCheck, Trash2, X } from 'lucide-react';
import { apiService, Parentesco } from '../services/apiService';
import { rotuloParentesco } from '../services/parentesco';
import { baixarJson } from '../services/download';
import { Membro } from '../types';

/** Ficha do membro com as ações de LGPD: consentimento, exportação (acesso/portabilidade) e anonimização. */
const FichaMembroModal: React.FC<{ membro: Membro; podeGerir: boolean; onClose: () => void; onChanged: () => void; onEditar?: (m: Membro) => void }> = ({ membro, podeGerir, onClose, onChanged, onEditar }) => {
  const [parentes, setParentes] = useState<Parentesco[]>([]);
  const carregarParentes = () => apiService.getParentescos(membro.id).then(setParentes).catch(() => setParentes([]));
  useEffect(() => { carregarParentes(); }, [membro.id]);
  const [obs, setObs] = useState(membro.consentimentoObs || '');
  const [confirma, setConfirma] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const anon = !!membro.anonimizadoEm;
  const exec = async (fn: () => Promise<any>, ok: string, fecha = false) => {
    try { await fn(); setMsg({ ok: true, t: ok }); onChanged(); if (fecha) setTimeout(onClose, 800); } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ficha-t" className="fixed inset-0 z-[150] bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl p-8 w-full max-w-lg space-y-5">
        <div className="flex justify-between items-start"><div><h3 id="ficha-t" className="text-xl font-black text-slate-900">{membro.nome}</h3><p className="text-xs font-bold text-slate-400 uppercase">{membro.status}{anon ? ' · anonimizado' : ''}</p></div><button aria-label="Fechar" onClick={onClose}><X /></button></div>
        {!anon && (
          <dl className="text-sm text-slate-600 space-y-1">
            {membro.telefone && <div><b>Telefone:</b> {membro.telefone}</div>}{membro.email && <div><b>E-mail:</b> {membro.email}</div>}
            {membro.dataNascimento && <div><b>Nascimento:</b> {membro.dataNascimento.split('-').reverse().join('/')}</div>}
            {membro.ofertaMensalValor ? <div><b>Oferta mensal combinada:</b> {Number(membro.ofertaMensalValor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div> : null}
            {membro.dataBatismo && <div><b>Batismo:</b> {membro.dataBatismo}</div>}{membro.dataConfirmacao && <div><b>Confirmação:</b> {membro.dataConfirmacao}</div>}
          </dl>
        )}
        {!anon && parentes.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-black text-[#002878] uppercase tracking-widest">Parentescos</p>
            {parentes.map(p => (
              <p key={p.id} className="text-sm text-slate-600 flex items-center gap-2">
                <span><b>{rotuloParentesco(p.papel)}:</b> {p.nome}</span>
                {onEditar && <button aria-label={`Remover parentesco com ${p.nome}`} className="text-slate-300 hover:text-red-500" onClick={() => apiService.removerParentesco(membro.id, p.id).then(carregarParentes)}><X size={14} /></button>}
              </p>
            ))}
          </div>
        )}
        {!anon && onEditar && (
          <button onClick={() => onEditar(membro)} className="flex items-center gap-2 text-sm font-bold text-[#002878]"><Pencil size={16} />Editar cadastro</button>
        )}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="flex items-center gap-2 text-xs font-black text-[#002878] uppercase tracking-widest"><ShieldCheck size={14} />Privacidade (LGPD)</p>
          <p className="text-sm text-slate-600">Consentimento: {membro.consentimentoEm ? <b className="text-emerald-700">registrado em {new Date(membro.consentimentoEm).toLocaleDateString('pt-BR')}</b> : <b className="text-slate-500">não registrado</b>}</p>
          {podeGerir && !anon && (<>
            <input className="w-full px-3 py-2 bg-white rounded-xl text-sm border border-slate-200" placeholder="Observação (ex.: ficha assinada em 10/10)" value={obs} onChange={e => setObs(e.target.value)} aria-label="Observação do consentimento" />
            <div className="flex gap-3 flex-wrap">
              <button onClick={() => exec(() => apiService.setConsentimento(membro.id, true, obs), 'Consentimento registrado.')} className="bg-[#002878] text-white px-4 py-2 rounded-xl text-sm font-bold">Registrar consentimento</button>
              {membro.consentimentoEm && <button onClick={() => exec(() => apiService.setConsentimento(membro.id, false), 'Consentimento revogado.')} className="text-sm font-bold text-slate-600 underline">Revogar</button>}
            </div></>)}
        </div>
        {podeGerir && !anon && (
          <button onClick={() => exec(async () => baixarJson(`membro_${membro.id}.json`, await apiService.exportarMembro(membro.id)), 'Ficha exportada.')} className="flex items-center gap-2 text-sm font-bold text-[#002878]"><Download size={16} />Exportar ficha (acesso/portabilidade)</button>
        )}
        {podeGerir && !anon && (
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <p className="text-sm font-bold text-red-700 flex items-center gap-2"><Trash2 size={14} />Anonimizar (irreversível)</p>
            <p className="text-xs text-slate-500">Apaga nome, contatos, endereço, profissão e familiares. Os totais estatísticos são mantidos e a pessoa sai da Diretoria. Digite ANONIMIZAR para confirmar.</p>
            <div className="flex gap-2"><input className="flex-1 px-3 py-2 bg-white rounded-xl text-sm border border-slate-200" value={confirma} onChange={e => setConfirma(e.target.value)} aria-label="Digite ANONIMIZAR" />
              <button disabled={confirma !== 'ANONIMIZAR'} onClick={() => exec(() => apiService.anonimizarMembro(membro.id), 'Membro anonimizado.', true)} className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40">Anonimizar</button></div>
          </div>
        )}
        {msg && <p role="status" className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.t}</p>}
      </div>
    </div>
  );
};
export default FichaMembroModal;
