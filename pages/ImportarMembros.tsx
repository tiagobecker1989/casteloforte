import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileUp, Loader2 } from 'lucide-react';
import { apiService } from '../services/apiService';
import { CAMPOS_MEMBRO, CampoMembro, MODELO_CSV, detectarColunas, lerArquivo, montarMembros, Grade } from '../services/importacao';
import { carregarPdfJs } from '../services/pdfjsBrowser';

const sel = 'px-3 py-2 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-600 focus:bg-white outline-none text-sm w-full';

const ImportarMembros: React.FC = () => {
  const [nomeArq, setNomeArq] = useState('');
  const [grade, setGrade] = useState<Grade>([]);
  const [mapa, setMapa] = useState<Partial<Record<CampoMembro, number>>>({});
  const [cabecalho, setCabecalho] = useState(true);
  const [inicio, setInicio] = useState(0);
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ criados: number; ignorados: { linha: number; nome: string; motivo: string }[] } | null>(null);

  const escolher = async (f?: File) => {
    if (!f) return;
    setErro(''); setResultado(null); setLendo(true); setNomeArq(f.name);
    try {
      const g = await lerArquivo(f.name, await f.arrayBuffer(), carregarPdfJs);
      if (!g.length) throw new Error('Não encontrei linhas no arquivo. Se for um PDF escaneado (imagem), use CSV ou Excel.');
      const d = detectarColunas(g);
      setGrade(g); setMapa(d.mapa); setCabecalho(d.cabecalho); setInicio(d.inicio);
      if (d.mapa.nome === undefined) setErro('Não consegui identificar a coluna do nome. Escolha-a abaixo.');
    } catch (e: any) { setGrade([]); setErro(e.message || 'Não foi possível ler o arquivo.'); } finally { setLendo(false); }
  };

  const linhas = useMemo(() => (grade.length ? montarMembros(grade, mapa, cabecalho, inicio) : []), [grade, mapa, cabecalho, inicio]);
  const colunas = grade.length ? Math.max(...grade.slice(0, 50).map(l => l.length)) : 0;
  const rotuloCol = (i: number) => `Coluna ${i + 1}${cabecalho && grade[inicio]?.[i] ? `: ${grade[inicio][i]}` : grade[0]?.[i] ? ` (ex.: ${grade[0][i].slice(0, 18)})` : ''}`;

  const importar = async () => {
    setEnviando(true); setErro('');
    try { setResultado(await apiService.importarMembros(linhas.map(({ avisos, ...l }) => l))); }
    catch (e: any) { setErro(e.message); } finally { setEnviando(false); }
  };
  const baixarModelo = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + MODELO_CSV], { type: 'text/csv;charset=utf-8' })); a.download = 'modelo-importacao-membros.csv'; a.click(); URL.revokeObjectURL(a.href); };

  return (
    <div className="space-y-8">
      <div>
        <Link to="/membros" className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold text-sm mb-3"><ArrowLeft size={16} /> Voltar para Membros</Link>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Importar lista de membros</h2>
        <p className="text-slate-500 font-medium">Aceita CSV, Excel (.xls, .xlsx) e PDF com texto. O arquivo é lido no seu computador; só os dados das linhas são enviados.</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 bg-[#002878] text-white px-5 py-3 rounded-2xl font-bold cursor-pointer">
            {lendo ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />} Escolher arquivo
            <input type="file" accept=".csv,.txt,.tsv,.xls,.xlsx,.xlsm,.pdf" className="sr-only" onChange={e => escolher(e.target.files?.[0])} aria-label="Arquivo com a lista de membros" />
          </label>
          <button onClick={baixarModelo} className="flex items-center gap-2 text-sm font-bold text-[#002878]"><Download size={16} />Baixar modelo (CSV)</button>
          {nomeArq && <span className="text-sm text-slate-500 font-bold">{nomeArq}</span>}
        </div>
        <p className="text-xs text-slate-400">Em PDF, cada pessoa deve estar em uma linha, com as informações separadas por espaço largo ou em colunas. PDFs escaneados (imagem) não são lidos.</p>
        {erro && <p role="alert" className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-4 py-3">{erro}</p>}
      </div>

      {grade.length > 0 && !resultado && (
        <>
          <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h3 className="font-black text-slate-900">Confira as colunas</h3>
              <label className="text-sm text-slate-600 flex items-center gap-2"><input type="checkbox" checked={cabecalho} onChange={e => setCabecalho(e.target.checked)} />A linha {inicio + 1} é o cabeçalho</label>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAMPOS_MEMBRO.map(c => (
                <label key={c.campo} className="text-xs font-black text-slate-400 uppercase tracking-wider space-y-1 block">{c.rotulo}
                  <select className={sel} value={mapa[c.campo] ?? ''} onChange={e => setMapa({ ...mapa, [c.campo]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">(não importar)</option>
                    {Array.from({ length: colunas }, (_, i) => <option key={i} value={i}>{rotuloCol(i)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 overflow-x-auto">
            <div className="p-6 flex flex-wrap justify-between items-center gap-3">
              <h3 className="font-black text-slate-900">{linhas.length} pessoa(s) encontrada(s) <span className="text-slate-400 font-bold text-sm">· {linhas.filter(l => l.avisos.length).length} com aviso</span></h3>
              <button disabled={!linhas.length || enviando || mapa.nome === undefined} onClick={importar} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-40 flex items-center gap-2">{enviando && <Loader2 size={16} className="animate-spin" />}Importar {linhas.length} membro(s)</button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="px-6 py-3">Linha</th><th className="px-6 py-3">Nome</th><th className="px-6 py-3">Nascimento</th><th className="px-6 py-3">Telefone</th><th className="px-6 py-3">E-mail</th><th className="px-6 py-3">Avisos</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {linhas.slice(0, 10).map(l => (
                  <tr key={l.linha}><td className="px-6 py-3 text-slate-400">{l.linha}</td><td className="px-6 py-3 font-bold">{l.nome}</td><td className="px-6 py-3">{l.dataNascimento?.split('-').reverse().join('/') ?? '—'}</td><td className="px-6 py-3">{l.telefone ?? '—'}</td><td className="px-6 py-3">{l.email ?? '—'}</td><td className="px-6 py-3 text-amber-700">{l.avisos.join('; ')}</td></tr>
                ))}
              </tbody>
            </table>
            {linhas.length > 10 && <p className="px-6 py-3 text-xs text-slate-400">Mostrando as 10 primeiras. Linhas já cadastradas (mesmo nome e nascimento) serão ignoradas.</p>}
          </div>
        </>
      )}

      {resultado && (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
          <p role="status" className="text-lg font-black text-emerald-700">{resultado.criados} membro(s) importado(s).</p>
          {resultado.ignorados.length > 0 && (
            <div>
              <p className="font-bold text-slate-700 mb-2">{resultado.ignorados.length} linha(s) ignorada(s):</p>
              <ul className="text-sm text-slate-600 space-y-1 max-h-64 overflow-y-auto">{resultado.ignorados.map((i, k) => <li key={k}>Linha {i.linha}{i.nome ? ` (${i.nome})` : ''}: {i.motivo}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-slate-400">O aviso de parentesco por sobrenome semelhante é feito no cadastro individual; membros importados podem ter o parentesco registrado depois, na ficha.</p>
          <Link to="/membros" className="inline-block bg-[#002878] text-white px-6 py-3 rounded-2xl font-bold">Ver membros</Link>
        </div>
      )}
    </div>
  );
};
export default ImportarMembros;
