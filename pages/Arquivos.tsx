import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, FileUp, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { apiService, Documento } from '../services/apiService';
import { useAuth } from '../services/AuthContext';
import { cartao, dataBr, inputCls } from '../services/formato';
import { carregarPdfJs } from '../services/pdfjsBrowser';

const MAX = 4 * 1024 * 1024;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ROT: Record<string, string> = { pdf: 'PDF', docx: 'Word (.docx)', doc: 'Word (.doc)' };
const ESTILO_DOCX = '<style>body{font-family:Georgia,serif;padding:24px;max-width:820px;margin:auto;line-height:1.55;color:#111}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 8px}</style>';

const Arquivos: React.FC = () => {
  const { pode } = useAuth();
  const [lista, setLista] = useState<Documento[]>([]);
  const [aberto, setAberto] = useState<Documento | null>(null);
  const [html, setHtml] = useState('');
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [editando, setEditando] = useState<{ id: string; nome: string; descricao: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const paginas = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const carregar = useCallback(() => apiService.getDocumentos().then(setLista).catch(e => setMsg({ ok: false, t: e.message })), []);
  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (f?: File) => {
    if (!f) return; setMsg(null);
    const ext = f.name.toLowerCase().split('.').pop() || '';
    if (!['pdf', 'docx', 'doc'].includes(ext)) return setMsg({ ok: false, t: 'Formato não suportado. Envie arquivos .doc, .docx ou .pdf.' });
    if (f.size > MAX) return setMsg({ ok: false, t: 'O arquivo passa de 4 MB. Reduza o tamanho ou divida o documento.' });
    setCarregando(true);
    try { await apiService.enviarDocumento(f, descricao.trim() || undefined); setDescricao(''); setMsg({ ok: true, t: `"${f.name}" importado.` }); await carregar(); }
    catch (e: any) { setMsg({ ok: false, t: e.message }); } finally { setCarregando(false); }
  };

  const abrir = async (d: Documento) => {
    const minha = ++seq.current;
    setAberto(d); setHtml(''); setTexto(''); setMsg(null); setCarregando(true);
    if (paginas.current) paginas.current.innerHTML = '';
    try {
      if (d.tipo === 'doc') { setTexto((await apiService.getTextoDocumento(d.id)).texto || '(documento sem texto)'); return; }
      const buf = await apiService.baixarDocumento(d.id);
      if (minha !== seq.current) return;
      if (d.tipo === 'docx') {
        const m: any = await import('mammoth/mammoth.browser'), mammoth = m.default ?? m;
        const r = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (minha === seq.current) setHtml(ESTILO_DOCX + r.value);
      } else {
        const pdfjs = await carregarPdfJs(), doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise, el = paginas.current;
        if (!el) return;
        const largura = Math.min(el.clientWidth || 800, 980), dpr = window.devicePixelRatio || 1;
        for (let p = 1; p <= Math.min(doc.numPages, 80); p++) {
          if (minha !== seq.current) return;
          const page = await doc.getPage(p), v0 = page.getViewport({ scale: 1 }), escala = largura / v0.width, vp = page.getViewport({ scale: escala * dpr });
          const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          c.style.width = `${Math.floor(vp.width / dpr)}px`; c.style.height = `${Math.floor(vp.height / dpr)}px`; c.className = 'mx-auto mb-4 shadow border border-slate-200 bg-white max-w-full';
          el.appendChild(c);
          await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        }
        if (doc.numPages > 80) { const n = document.createElement('p'); n.className = 'text-center text-sm text-slate-500'; n.textContent = `Mostrando as 80 primeiras de ${doc.numPages} páginas. Baixe o arquivo para ver o restante.`; el.appendChild(n); }
      }
    } catch (e: any) { if (minha === seq.current) setMsg({ ok: false, t: e.message || 'Não foi possível abrir o arquivo.' }); }
    finally { if (minha === seq.current) setCarregando(false); }
  };

  const baixar = async (d: Documento) => {
    try {
      const buf = await apiService.baixarDocumento(d.id), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf])); a.download = d.nome; a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  };
  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editando) return;
    try { await apiService.editarDocumento(editando.id, { nome: editando.nome, descricao: editando.descricao }); setEditando(null); setMsg({ ok: true, t: 'Ata atualizada.' }); await carregar(); if (aberto?.id === editando.id) setAberto(a => a && { ...a, nome: editando.nome }); }
    catch (err: any) { setMsg({ ok: false, t: err.message }); }
  };
  const excluir = async (d: Documento) => {
    if (!window.confirm(`Excluir "${d.nome}"?`)) return;
    try { await apiService.excluirDocumento(d.id); if (aberto?.id === d.id) { seq.current++; setAberto(null); } await carregar(); } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  };

  return (
    <div className="space-y-8">
      <div><h2 className="text-3xl font-black text-slate-900 tracking-tight">Atas</h2><p className="text-slate-500 font-medium">Atas das reuniões da paróquia. Todos os usuários podem consultar; apenas a Secretaria e o presidente importam, editam e excluem.</p></div>
      {msg && <p role="status" className={`text-sm font-bold rounded-xl px-4 py-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.t}</p>}

      {pode('arquivos.criar') && (
        <div className={`${cartao} p-6 space-y-4`}>
          <h3 className="font-black text-slate-900">Importação de Arquivos</h3>
          <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
            <li>Aceita arquivos <b>.doc</b>, <b>.docx</b> e <b>.pdf</b>, com visualizador na própria tela.</li>
            <li>O <b>PDF</b> abre em páginas.</li>
            <li>O <b>.docx</b> abre formatado.</li>
            <li>O <b>.doc</b> abre só como texto, porque o navegador não lê esse formato antigo; o arquivo original continua disponível para baixar.</li>
            <li>Cada arquivo tem no máximo <b>4 MB</b>, e cada paróquia pode ter até <b>100</b>. Eles ficam guardados no próprio banco de dados.</li>
          </ul>
          <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 bg-[#002878] text-white px-5 py-3 rounded-2xl font-bold cursor-pointer">
            {carregando && !aberto ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />} Importar arquivo
            <input type="file" accept=".doc,.docx,.pdf" className="sr-only" onChange={e => { enviar(e.target.files?.[0]); e.target.value = ''; }} aria-label="Arquivo .doc, .docx ou .pdf" />
          </label>
          <input value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={200} placeholder="Descrição (opcional, antes de escolher o arquivo)" className={`${inputCls} flex-1 min-w-[14rem]`} aria-label="Descrição do arquivo" />
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        <div className={`${cartao} lg:col-span-2 overflow-hidden h-fit`}>
          <h3 className="p-5 font-black text-slate-900">Atas ({lista.length})</h3>
          <ul className="divide-y divide-slate-100">
            {lista.length === 0 && <li className="px-5 py-6 text-slate-400 font-bold text-sm">Nenhuma ata importada ainda.</li>}
            {lista.map(d => (
              <li key={d.id} className={`px-5 py-3 ${aberto?.id === d.id ? 'bg-blue-50' : ''}`}>
                {editando?.id === d.id ? (
                  <form onSubmit={salvarEdicao} className="space-y-2">
                    <input required value={editando.nome} onChange={e => setEditando({ ...editando, nome: e.target.value })} className={`${inputCls} w-full`} aria-label="Nome da ata" />
                    <input value={editando.descricao} maxLength={200} onChange={e => setEditando({ ...editando, descricao: e.target.value })} placeholder="Descrição" className={`${inputCls} w-full`} aria-label="Descrição da ata" />
                    <div className="flex gap-3"><button className="bg-[#002878] text-white px-4 py-2 rounded-xl text-sm font-bold">Salvar</button><button type="button" onClick={() => setEditando(null)} className="text-sm text-slate-500 font-bold">Cancelar</button></div>
                  </form>
                ) : (
                <div className="flex items-start gap-3">
                  <FileText size={20} className="text-[#002878] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate" title={d.nome}>{d.nome}</p>
                    <p className="text-[11px] text-slate-400">{ROT[d.tipo]} · {kb(d.tamanho)} · {dataBr(d.enviadoEm)}{d.enviadoPor ? ` · ${d.enviadoPor}` : ''}</p>
                    {d.descricao && <p className="text-xs text-slate-500 mt-0.5">{d.descricao}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => abrir(d)} aria-label={`Abrir ${d.nome}`} className="text-slate-400 hover:text-[#002878]"><Eye size={16} /></button>
                    <button onClick={() => baixar(d)} aria-label={`Baixar ${d.nome}`} className="text-slate-400 hover:text-[#002878]"><Download size={16} /></button>
                    {pode('arquivos.editar') && <button onClick={() => setEditando({ id: d.id, nome: d.nome, descricao: d.descricao ?? '' })} aria-label={`Editar ${d.nome}`} className="text-slate-400 hover:text-[#002878]"><Pencil size={16} /></button>}
                    {pode('arquivos.excluir') && <button onClick={() => excluir(d)} aria-label={`Excluir ${d.nome}`} className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>}
                  </div>
                </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className={`${cartao} lg:col-span-3 p-5 min-h-[24rem]`}>
          {!aberto ? <p className="text-slate-400 font-bold text-sm">Escolha uma ata da lista para visualizar.</p> : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-900 truncate">{aberto.nome}</h3>
                <button onClick={() => { seq.current++; setAberto(null); }} aria-label="Fechar visualizador" className="text-slate-400 hover:text-slate-700"><X size={18} /></button></div>
              {carregando && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Abrindo...</p>}
              {aberto.tipo === 'pdf' && <div ref={paginas} className="max-h-[75vh] overflow-y-auto bg-slate-100 p-3 rounded-xl" />}
              {aberto.tipo === 'docx' && html && <iframe title={`Visualização de ${aberto.nome}`} sandbox="" srcDoc={html} className="w-full h-[75vh] rounded-xl border border-slate-200 bg-white" />}
              {aberto.tipo === 'doc' && texto && (
                <>
                  <p className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">Arquivo .doc (formato antigo do Word): aqui aparece só o texto. Baixe o arquivo para ver a formatação original.</p>
                  <pre className="whitespace-pre-wrap text-sm text-slate-800 max-h-[70vh] overflow-y-auto bg-slate-50 rounded-xl p-4 font-sans">{texto}</pre>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default Arquivos;
