import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import { apiService, MinhaAssinatura } from '../services/apiService';
import { useAuth } from '../services/AuthContext';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const ST: Record<string, { t: string; c: string }> = {
  ATIVA: { t: 'Ativa', c: 'bg-emerald-50 text-emerald-700' }, TRIAL: { t: 'Período de teste', c: 'bg-blue-50 text-blue-700' },
  INADIMPLENTE: { t: 'Em atraso (somente leitura)', c: 'bg-red-50 text-red-700' }, CANCELADA: { t: 'Cancelada', c: 'bg-slate-100 text-slate-500' },
};
const FT: Record<string, string> = { ABERTA: 'Em aberto', PAGA: 'Paga', CANCELADA: 'Cancelada' };
const lim = (n: number | null) => (n == null ? 'ilimitado' : String(n));

const Assinatura: React.FC = () => {
  const { user, refresh } = useAuth();
  const [d, setD] = useState<MinhaAssinatura | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const admin = user?.role === 'ADMIN_PAROQUIA';
  const [doc, setDoc] = useState('');
  const [pagando, setPagando] = useState<string | null>(null);
  const carregar = () => apiService.getMinhaAssinatura().then(setD).catch(e => setMsg({ ok: false, t: e.message }));
  useEffect(() => { carregar(); }, []);

  const trocar = async (id: string, nome: string, preco: number) => {
    const aviso = preco > 0 && !d?.trialAte ? `Você ganha ${d?.trialDias} dias de teste grátis. ` : '';
    if (!window.confirm(`${aviso}Mudar para o plano ${nome}?`)) return;
    try { await apiService.trocarPlano(id); setMsg({ ok: true, t: 'Plano alterado.' }); await carregar(); await refresh(); } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  };

  const salvarDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await apiService.salvarDocumento(doc); setMsg({ ok: true, t: 'Documento salvo.' }); setDoc(''); await carregar(); } catch (err: any) { setMsg({ ok: false, t: err.message }); }
  };
  const pagar = async (f: { id: string; linkPagamento?: string | null }) => {
    setPagando(f.id);
    try {
      const url = f.linkPagamento || (await apiService.pagarOnline(f.id)).url;
      const w = window.open(url, '_blank', 'noopener');
      if (!w) window.location.assign(url);
      await carregar();
    } catch (err: any) { setMsg({ ok: false, t: err.message }); } finally { setPagando(null); }
  };

  if (!d) return <p className="text-slate-400 font-bold">{msg?.t || 'Carregando...'}</p>;
  const st = ST[d.status] || ST.ATIVA;
  const uso = (n: number, l: number | null) => (l == null ? `${n} (ilimitado)` : `${n} de ${l}`);
  return (
    <div className="space-y-8">
      <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Assinatura</h2><p className="text-slate-500 font-medium">Plano, uso e faturas da sua paróquia.</p></div>
      {msg && <p role="status" className={`text-sm font-bold rounded-xl px-4 py-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}
      {d.status === 'INADIMPLENTE' && (
        <div role="alert" className="flex gap-3 bg-red-50 text-red-800 rounded-2xl p-4"><AlertTriangle className="shrink-0" /><p className="text-sm font-bold">Há fatura em atraso há mais de {d.carenciaDias} dias. Os dados continuam acessíveis para consulta, mas alterações estão bloqueadas até o pagamento.</p></div>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl border border-slate-100 p-6"><p className="text-xs font-bold text-slate-400 uppercase">Plano atual</p><p className="text-2xl font-black text-slate-900">{d.plano}</p><p className="text-sm text-slate-500">{d.precoMensal > 0 ? `${brl(d.precoMensal)}/mês` : 'Gratuito'}</p><span className={`inline-block mt-3 px-3 py-1 rounded-full text-[10px] font-black uppercase ${st.c}`}>{st.t}</span>{d.status === 'TRIAL' && <p className="text-xs text-slate-400 mt-2">Teste grátis até {data(d.trialAte)}</p>}</div>
        <div className="bg-white rounded-3xl border border-slate-100 p-6"><p className="text-xs font-bold text-slate-400 uppercase">Membros ativos</p><p className="text-2xl font-black text-slate-900">{uso(d.uso.membros, d.limiteMembros)}</p></div>
        <div className="bg-white rounded-3xl border border-slate-100 p-6"><p className="text-xs font-bold text-slate-400 uppercase">Usuários</p><p className="text-2xl font-black text-slate-900">{uso(d.uso.usuarios, d.limiteUsuarios)}</p></div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 p-6">
        <h3 className="font-black text-slate-900 mb-4">Planos disponíveis</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {d.planos.map(p => (
            <div key={p.id} className={`rounded-2xl border-2 p-5 ${p.id === d.planoId ? 'border-[#002878]' : 'border-slate-100'}`}>
              <p className="font-black text-slate-900">{p.nome}</p>
              <p className="text-xl font-black text-[#002878]">{p.precoMensal > 0 ? brl(p.precoMensal) : 'Grátis'}<span className="text-xs text-slate-400 font-bold">{p.precoMensal > 0 ? '/mês' : ''}</span></p>
              <p className="text-xs text-slate-500 mt-2">Até {lim(p.limiteMembros)} membros · {lim(p.limiteUsuarios)} usuários</p>
              {p.id === d.planoId ? <p className="mt-3 text-xs font-black text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} />Seu plano</p>
                : admin && <button onClick={() => trocar(p.id, p.nome, p.precoMensal)} className="mt-3 w-full bg-[#002878] text-white py-2 rounded-xl text-sm font-bold">Escolher</button>}
            </div>
          ))}
        </div>
      </div>

      {d.pagamentoOnline && !d.documento && admin && (
        <form onSubmit={salvarDoc} className="bg-amber-50 border border-amber-100 rounded-3xl p-6 space-y-3">
          <h3 className="font-black text-slate-900">CNPJ ou CPF para cobrança</h3>
          <p className="text-sm text-slate-600">Para pagar online (Pix, boleto ou cartão) precisamos do CNPJ da paróquia (ou CPF do responsável). Depois de enviado ao gateway de pagamento, só a sede consegue alterar.</p>
          <div className="flex gap-3"><input required value={doc} onChange={e => setDoc(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" className="flex-1 px-4 py-3 bg-white rounded-xl border border-amber-200" aria-label="CNPJ ou CPF" /><button className="bg-[#002878] text-white px-5 rounded-xl font-bold">Salvar</button></div>
        </form>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
        <div className="p-6 flex flex-wrap items-center justify-between gap-3"><h3 className="font-black text-slate-900">Faturas</h3>
          {!d.pagamentoOnline && d.pix && <button onClick={() => navigator.clipboard?.writeText(d.pix!)} className="flex items-center gap-2 text-sm font-bold text-[#002878]"><Copy size={14} />Chave Pix: {d.pix}</button>}</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-6 py-3">Competência</th><th className="px-6 py-3">Vencimento</th><th className="px-6 py-3">Valor</th><th className="px-6 py-3">Situação</th><th className="px-6 py-3"></th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {d.faturas.length === 0 && <tr><td colSpan={5} className="px-6 py-6 text-slate-400 font-bold">Nenhuma fatura.</td></tr>}
            {d.faturas.map(f => (
              <tr key={f.id}><td className="px-6 py-4 font-bold">{f.competencia}</td><td className="px-6 py-4">{data(f.vencimento)}</td><td className="px-6 py-4">{brl(f.valor)}</td>
                <td className="px-6 py-4">{FT[f.status]}{f.pagoEm ? ` em ${data(f.pagoEm)}` : ''}</td>
                <td className="px-6 py-4 text-right">{f.status === 'ABERTA' && d.pagamentoOnline && (d.documento || f.linkPagamento) && (
                  <button disabled={pagando === f.id} onClick={() => pagar(f)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase disabled:opacity-50">{pagando === f.id ? 'Abrindo...' : 'Pagar online'}</button>)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="px-6 py-4 text-xs text-slate-400">{d.pagamentoOnline ? 'O pagamento é confirmado automaticamente em poucos instantes (Pix) ou em até alguns dias úteis (boleto).' : 'Após o pagamento, a sede confirma o recebimento e o acesso é normalizado. Informe o nome da paróquia no comprovante.'}</p>
      </div>
    </div>
  );
};
export default Assinatura;
