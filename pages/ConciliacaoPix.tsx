import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileUp, Landmark, RefreshCw, Undo2 } from 'lucide-react';
import { apiService, ConfigBanco, TransacaoBanco, Atrasos, Topicos } from '../services/apiService';
import { useAuth } from '../services/AuthContext';
import { brl, cartao, dataBr, inputCls, mesAtual } from '../services/formato';
import { decodificar, lerArquivo } from '../services/importacao';
import { detectarExtrato, lerOfx, montarExtrato, ItemExtrato } from '../services/extrato';
import { carregarPdfJs } from '../services/pdfjsBrowser';

const ST: Record<string, string> = { PENDENTE: 'bg-amber-50 text-amber-700', CONCILIADO: 'bg-emerald-50 text-emerald-700', IGNORADO: 'bg-slate-100 text-slate-500' };
const ROT: Record<string, string> = { PENDENTE: 'Pendente', CONCILIADO: 'Conciliado', IGNORADO: 'Ignorado' };

const ConciliacaoPix: React.FC = () => {
  const { user, pode } = useAuth();
  const admin = user?.role === 'ADMIN_PAROQUIA', opera = pode('conciliacao.operar');
  const [mes, setMes] = useState(mesAtual());
  const [status, setStatus] = useState(''); const [tipo, setTipo] = useState(''); const [soPix, setSoPix] = useState(false);
  const [itens, setItens] = useState<TransacaoBanco[]>([]);
  const [atrasos, setAtrasos] = useState<Atrasos | null>(null);
  const [topicos, setTopicos] = useState<Topicos | null>(null);
  const [cfg, setCfg] = useState<ConfigBanco | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [cred, setCred] = useState({ clientId: '', clientSecret: '', certPem: '', keyPem: '', cadeiaPem: '', chavePix: '' });
  const [escolha, setEscolha] = useState<Record<string, { membroId?: string; categoria?: string; descricao?: string; outra?: boolean }>>({});

  const carregar = useCallback(async () => {
    try {
      const [t, tp, c] = await Promise.all([apiService.getTransacoes(mes, { status: status || undefined, tipo: tipo || undefined, pix: soPix }), apiService.getTopicos(), apiService.getConfigBanco()]);
      setItens(t.itens); setAtrasos(t.atrasadas); setTopicos(tp); setCfg(c);
    } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  }, [mes, status, tipo, soPix]);
  useEffect(() => { carregar(); }, [carregar]);

  const exec = async (fn: () => Promise<any>, ok: string) => { setOcupado(true); try { const r = await fn(); setMsg({ ok: true, t: typeof ok === 'string' ? ok : '' }); await carregar(); return r; } catch (e: any) { setMsg({ ok: false, t: e.message }); } finally { setOcupado(false); } };

  const categorias = useMemo(() => (t: 'ENTRADA' | 'SAIDA') => topicos ? [
    ...topicos.fixos.filter(f => f.tipo === t || f.tipo === 'AMBOS').map(f => ({ codigo: f.codigo, label: f.label })),
    ...topicos.personalizados.filter(p => p.ativo && p.tipo === t).map(p => ({ codigo: p.codigo, label: p.nome })),
  ] : [], [topicos]);

  const lerArq = async (f?: File) => {
    if (!f) return;
    setOcupado(true); setMsg(null);
    try {
      const buf = await f.arrayBuffer(), ext = f.name.toLowerCase().split('.').pop();
      let itens: ItemExtrato[] = [], ign = 0;
      if (ext === 'ofx' || ext === 'qfx' || /<OFX>/i.test(decodificar(buf).slice(0, 4000))) itens = lerOfx(buf);
      else { const g = await lerArquivo(f.name, buf, carregarPdfJs), d = detectarExtrato(g), r = montarExtrato(g, d.mapa, d.cabecalho, d.inicio); itens = r.itens; ign = r.ignoradas; }
      if (!itens.length) throw new Error('Não encontrei lançamentos no arquivo. Use o extrato em OFX ou CSV exportado do Internet Banking.');
      const r = await apiService.importarExtrato(itens);
      setMsg({ ok: true, t: `${r.novos} lançamento(s) novo(s) importado(s); ${r.repetidos} já existiam${ign + r.ignorados ? `; ${ign + r.ignorados} linha(s) ignorada(s)` : ''}.` });
      await carregar();
    } catch (e: any) { setMsg({ ok: false, t: e.message }); } finally { setOcupado(false); }
  };
  const lerTexto = async (campo: 'certPem' | 'keyPem' | 'cadeiaPem', f?: File) => { if (f) setCred(c => ({ ...c, [campo]: '' })); if (f) { const t = await f.text(); setCred(c => ({ ...c, [campo]: t })); } };
  const salvarVinculo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await exec(() => apiService.salvarConfigBanco({ ...cred, cadeiaPem: cred.cadeiaPem || undefined, chavePix: cred.chavePix || undefined }), 'Conta vinculada.') !== undefined) { setVincular(false); setCred({ clientId: '', clientSecret: '', certPem: '', keyPem: '', cadeiaPem: '', chavePix: '' }); }
  };

  const conciliar = (t: TransacaoBanco) => {
    const e = escolha[t.id] || {};
    if (t.tipo === 'ENTRADA' && !e.outra) {
      const membroId = e.membroId ?? t.sugestao?.membroId;
      if (!membroId) return setMsg({ ok: false, t: 'Escolha o membro em atraso, ou use "Outra entrada".' });
      return exec(() => apiService.conciliar(t.id, { acao: 'OFERTA', membroId, competencia: mes }), 'Pix conciliado como oferta.');
    }
    if (!e.categoria) return setMsg({ ok: false, t: 'Escolha o tópico.' });
    return exec(() => apiService.conciliar(t.id, { acao: t.tipo === 'ENTRADA' ? 'ENTRADA_OUTRA' : 'SAIDA', categoria: e.categoria, descricao: e.descricao }), 'Lançamento criado.');
  };
  const setE = (id: string, p: any) => setEscolha(s => ({ ...s, [id]: { ...s[id], ...p } }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Conciliação Pix</h2><p className="text-slate-500 font-medium">Confira os Pix da conta bancária e dê baixa nas ofertas mensais em atraso.</p></div>
        <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Mês <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} className={`${inputCls} ml-2`} /></label>
      </div>
      {msg && msg.t && <p role="status" className={`text-sm font-bold rounded-xl px-4 py-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className={`${cartao} p-6 space-y-3 lg:col-span-2`}>
          <h3 className="font-black text-slate-900 flex items-center gap-2"><Landmark size={18} className="text-[#002878]" />Conta Sicredi</h3>
          {cfg?.configurado ? (
            <>
              <p className="text-sm text-slate-600">Conta vinculada{cfg.chavePix ? ` (chave Pix ${cfg.chavePix})` : ''}. Última busca: {cfg.ultimaSincronizacao ? new Date(cfg.ultimaSincronizacao).toLocaleString('pt-BR') : 'ainda não realizada'}.{cfg.certificadoValidoAte && <> Certificado válido até {new Date(cfg.certificadoValidoAte).toLocaleDateString('pt-BR')}.</>}</p>
              <div className="flex flex-wrap gap-3">
                {opera && <button disabled={ocupado} onClick={() => exec(async () => { const r = await apiService.sincronizarBanco(31); setMsg({ ok: true, t: `${r.encontrados} Pix recebido(s) na conta; ${r.novos} novo(s).` }); }, '')} className="flex items-center gap-2 bg-[#002878] text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"><RefreshCw size={15} />Buscar Pix recebidos (últimos 31 dias)</button>}
                {admin && <button onClick={() => window.confirm('Desvincular a conta e apagar as credenciais guardadas?') && exec(() => apiService.removerConfigBanco(), 'Conta desvinculada.')} className="text-sm font-bold text-red-600">Desvincular</button>}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">Vincule a conta para buscar os Pix recebidos direto no banco (API Pix do Sicredi). {admin ? '' : 'Peça ao administrador da paróquia para vincular.'}</p>
              {admin && <button onClick={() => setVincular(v => !v)} className="text-sm font-bold text-[#002878] underline">{vincular ? 'Fechar' : 'Vincular conta Sicredi'}</button>}
            </>
          )}
          {vincular && admin && (
            <form onSubmit={salvarVinculo} className="space-y-3 bg-slate-50 rounded-2xl p-4">
              {cfg && !cfg.segredosAtivos && <p role="alert" className="text-sm font-bold text-red-700">O servidor ainda não tem a variável SECRETS_KEY, necessária para guardar credenciais com segurança. Configure-a antes de vincular.</p>}
              <p className="text-xs text-slate-500">Dados fornecidos pelo Sicredi na adesão à API Pix (Portal do Desenvolvedor). O certificado e a chave devem estar em formato PEM, e a chave sem senha. Ficam criptografados no banco de dados.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <input required value={cred.clientId} onChange={e => setCred({ ...cred, clientId: e.target.value })} placeholder="Client ID" className={inputCls} aria-label="Client ID" />
                <input required type="password" value={cred.clientSecret} onChange={e => setCred({ ...cred, clientSecret: e.target.value })} placeholder="Client Secret" className={inputCls} aria-label="Client Secret" autoComplete="off" />
                <input value={cred.chavePix} onChange={e => setCred({ ...cred, chavePix: e.target.value })} placeholder="Chave Pix da conta (opcional)" className={`${inputCls} sm:col-span-2`} aria-label="Chave Pix" />
              </div>
              {([['certPem', 'Certificado (.pem / .cer em texto)'], ['keyPem', 'Chave privada (.key / .pem, sem senha)'], ['cadeiaPem', 'Cadeia de certificados Sicredi (opcional)']] as const).map(([k, rot]) => (
                <label key={k} className="block text-xs font-bold text-slate-500">{rot}
                  <input type="file" accept=".pem,.cer,.crt,.key,.txt" onChange={e => lerTexto(k, e.target.files?.[0])} className="block mt-1 text-xs" />
                  <span className="text-[11px] font-normal">{cred[k] ? 'Arquivo carregado.' : 'Nenhum arquivo.'}</span>
                </label>
              ))}
              <button disabled={ocupado} className="bg-[#002878] text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">Salvar vínculo</button>
            </form>
          )}
          <p className="text-[11px] text-slate-400">A API Pix informa apenas os Pix <b>recebidos</b>. Para ver também os Pix <b>enviados</b> e as demais saídas, importe o extrato da conta abaixo.</p>
        </div>

        <div className={`${cartao} p-6 space-y-3 h-fit`}>
          <h3 className="font-black text-slate-900 flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" />Oferta mensal em atraso</h3>
          {atrasos && (!atrasos.venceu ? <p className="text-sm text-slate-500 font-bold">Este mês ainda está no prazo (vence dia {atrasos.diaOferta}).</p>
            : atrasos.atrasadas.length === 0 ? <p className="text-sm font-bold text-emerald-700">Ninguém em atraso.</p>
            : <ul className="space-y-1.5">{atrasos.atrasadas.map(a => <li key={a.id} className="text-sm font-bold text-slate-800 bg-amber-50 rounded-lg px-3 py-1.5">{a.nome}</li>)}</ul>)}
        </div>
      </div>

      {opera && (
        <div className={`${cartao} p-6 flex flex-wrap items-center gap-4`}>
          <label className="flex items-center gap-2 bg-white border border-slate-200 text-[#002878] px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer"><FileUp size={16} />Importar extrato (OFX, CSV, Excel)
            <input type="file" accept=".ofx,.qfx,.csv,.txt,.xls,.xlsx,.pdf" className="sr-only" onChange={e => { lerArq(e.target.files?.[0]); e.target.value = ''; }} aria-label="Arquivo do extrato" /></label>
          <p className="text-xs text-slate-500">Exporte o extrato no Internet Banking e envie aqui. Lançamentos repetidos são ignorados.</p>
        </div>
      )}

      <div className={`${cartao} overflow-x-auto`}>
        <div className="p-6 flex flex-wrap gap-3 items-center justify-between">
          <h3 className="font-black text-slate-900">Lançamentos do banco</h3>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls} aria-label="Situação"><option value="">Todas</option><option value="PENDENTE">Pendentes</option><option value="CONCILIADO">Conciliadas</option><option value="IGNORADO">Ignoradas</option></select>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls} aria-label="Tipo"><option value="">Entradas e saídas</option><option value="ENTRADA">Só entradas</option><option value="SAIDA">Só saídas</option></select>
            <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={soPix} onChange={e => setSoPix(e.target.checked)} />Somente Pix</label>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-6 py-3">Data</th><th className="px-6 py-3">Descrição</th><th className="px-6 py-3 text-right">Valor</th><th className="px-6 py-3">Situação</th><th className="px-6 py-3">Conciliar</th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {itens.length === 0 && <tr><td colSpan={5} className="px-6 py-6 text-slate-400 font-bold">Nenhum lançamento nesta visão. Busque os Pix na conta ou importe o extrato.</td></tr>}
            {itens.map(t => {
              const e = escolha[t.id] || {};
              return (
                <tr key={t.id} className="align-top">
                  <td className="px-6 py-3 whitespace-nowrap">{dataBr(t.data)}</td>
                  <td className="px-6 py-3"><b>{t.nome || t.descricao || 'Lançamento'}</b>{t.nome && t.descricao && <span className="block text-xs text-slate-400">{t.descricao}</span>}</td>
                  <td className={`px-6 py-3 text-right font-bold whitespace-nowrap ${t.tipo === 'ENTRADA' ? 'text-emerald-700' : 'text-red-600'}`}>{t.tipo === 'SAIDA' ? '- ' : '+ '}{brl(t.valor)}</td>
                  <td className="px-6 py-3"><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${ST[t.status]}`}>{ROT[t.status]}</span></td>
                  <td className="px-6 py-3">
                    {t.status === 'PENDENTE' && opera && (
                      <div className="flex flex-col gap-2 min-w-[17rem]">
                        {t.tipo === 'ENTRADA' && !e.outra && (
                          <select aria-label="Membro em atraso" value={e.membroId ?? t.sugestao?.membroId ?? ''} onChange={ev => setE(t.id, { membroId: ev.target.value })} className={inputCls}>
                            <option value="">{atrasos?.atrasadas.length ? 'Membro com oferta em atraso...' : 'Ninguém em atraso neste mês'}</option>
                            {atrasos?.atrasadas.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                          </select>
                        )}
                        {t.sugestao && !e.outra && !e.membroId && <span className="text-[11px] text-emerald-700 font-bold">Sugestão pelo nome do pagador: {t.sugestao.nome}</span>}
                        {(t.tipo === 'SAIDA' || e.outra) && (
                          <>
                            <select aria-label="Tópico" value={e.categoria ?? ''} onChange={ev => setE(t.id, { categoria: ev.target.value })} className={inputCls}><option value="">Tópico...</option>{categorias(t.tipo).map(c => <option key={c.codigo} value={c.codigo}>{c.label}</option>)}</select>
                            <input aria-label="Descrição" placeholder="Descrição (opcional)" value={e.descricao ?? ''} onChange={ev => setE(t.id, { descricao: ev.target.value })} className={inputCls} />
                          </>
                        )}
                        <div className="flex gap-3 items-center">
                          <button disabled={ocupado} onClick={() => conciliar(t)} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase disabled:opacity-50">Conciliar</button>
                          {t.tipo === 'ENTRADA' && <button onClick={() => setE(t.id, { outra: !e.outra })} className="text-xs font-bold text-[#002878] underline">{e.outra ? 'Voltar ao membro' : 'Outra entrada'}</button>}
                          <button onClick={() => exec(() => apiService.ignorarTransacao(t.id), 'Transação ignorada.')} className="text-xs text-slate-400 hover:text-slate-700">Ignorar</button>
                        </div>
                      </div>
                    )}
                    {t.status !== 'PENDENTE' && opera && <button onClick={() => exec(() => apiService.reabrirTransacao(t.id), 'Reaberta.')} className="flex items-center gap-1 text-xs font-bold text-slate-500"><Undo2 size={13} />Desfazer</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default ConciliacaoPix;
