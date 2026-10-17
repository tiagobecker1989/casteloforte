import React, { useEffect, useState } from 'react';
import { Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import { apiService, Matriz, TelaPerm, UsuarioParoquia } from '../services/apiService';
import { useAuth } from '../services/AuthContext';
import { UserRole } from '../types';

const PERFIS: { id: UserRole; label: string }[] = [
  { id: 'ADMIN_PAROQUIA', label: 'Presidente (administrador)' }, { id: 'PASTOR', label: 'Pastor' }, { id: 'TESOUREIRO', label: 'Tesoureiro' }, { id: 'SECRETARIA', label: 'Secretaria' },
];
const inputCls = 'w-full px-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl focus:border-blue-600 focus:bg-white outline-none';

const Usuarios: React.FC = () => {
  const { user } = useAuth();
  const [lista, setLista] = useState<UsuarioParoquia[]>([]);
  const [f, setF] = useState({ nome: '', email: '', senha: '', role: 'SECRETARIA' as UserRole });
  const [erro, setErro] = useState('');
  const [edit, setEdit] = useState<{ id: string; nome: string; email: string; senha: string; role: UserRole } | null>(null);
  const [okEdit, setOkEdit] = useState('');
  const carregar = () => apiService.getUsuarios().then(setLista);
  useEffect(() => { carregar(); }, []);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault(); setErro('');
    try { await apiService.criarUsuario(f); setF({ nome: '', email: '', senha: '', role: 'SECRETARIA' }); carregar(); } catch (err: any) { setErro(err.message); }
  };
  // ----- permissões por tela e por ação (só o presidente) -----
  const [permAlvo, setPermAlvo] = useState<UsuarioParoquia | null>(null);
  const [catalogo, setCatalogo] = useState<TelaPerm[]>([]);
  const [matriz, setMatriz] = useState<Matriz>({});
  const [travas, setTravas] = useState<Record<string, { obrigatorias: string[]; proibidas: string[] }>>({});
  const [permMsg, setPermMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const abrirPerm = async (u: UsuarioParoquia) => {
    setPermMsg(null); setPermAlvo(u);
    try { const [c, p] = await Promise.all([apiService.getCatalogoPermissoes(), apiService.getPermissoes(u.id)]); setCatalogo(c.catalogo); setMatriz(p.matriz); setTravas(p.travas ?? {}); }
    catch (e: any) { setPermMsg({ ok: false, t: e.message }); }
  };
  const alternar = (tela: string, acao: string, marcado: boolean) => setMatriz(m => {
    const tv = travas[tela];
    if (tv && (tv.obrigatorias.includes(acao) || tv.proibidas.includes(acao))) return m; // regra fixa do sistema
    const atual = new Set(m[tela] ?? []);
    if (marcado) { atual.add(acao); if (acao !== 'ver') atual.add('ver'); if (acao === 'direto') atual.add('alterar'); }
    else { atual.delete(acao); if (acao === 'ver') atual.clear(); if (acao === 'alterar') atual.delete('direto'); }
    const n = { ...m }; if (atual.size) n[tela] = [...atual]; else delete n[tela]; return n;
  });
  const salvarPerm = async () => {
    if (!permAlvo) return;
    try { await apiService.setPermissoes(permAlvo.id, matriz); setPermMsg({ ok: true, t: 'Permissões salvas. Valem imediatamente.' }); carregar(); }
    catch (e: any) { setPermMsg({ ok: false, t: e.message }); }
  };
  const restaurarPerm = async () => {
    if (!permAlvo || !window.confirm(`Voltar ${permAlvo.nome} ao padrão do perfil?`)) return;
    try { await apiService.restaurarPermissoes(permAlvo.id); const p = await apiService.getPermissoes(permAlvo.id); setMatriz(p.matriz); setPermMsg({ ok: true, t: 'Padrão do perfil restaurado.' }); carregar(); }
    catch (e: any) { setPermMsg({ ok: false, t: e.message }); }
  };
  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault(); if (!edit) return; setErro(''); setOkEdit('');
    try {
      await apiService.atualizarUsuario(edit.id, { nome: edit.nome, email: edit.email, role: edit.role, ...(edit.senha ? { senha: edit.senha } : {}) });
      setOkEdit(`Cadastro de ${edit.nome} atualizado.`); setEdit(null); carregar();
    } catch (err: any) { setErro(err.message); }
  };
  const alterar = async (id: string, p: { role?: UserRole; ativo?: boolean }) => {
    try { await apiService.atualizarUsuario(id, p); carregar(); } catch (err: any) { setErro(err.message); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Usuários</h2>
        <p className="text-slate-500 font-medium">Quem pode acessar os dados da sua paróquia e com qual perfil.</p>
      </div>
      <form onSubmit={criar} className="bg-white rounded-3xl border border-slate-100 p-6 grid md:grid-cols-5 gap-3 items-start">
        <input required placeholder="Nome" className={inputCls} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} />
        <input required type="email" placeholder="E-mail" className={inputCls} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <input required type="password" minLength={8} placeholder="Senha inicial" className={inputCls} value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} />
        <select className={inputCls} value={f.role} onChange={e => setF({ ...f, role: e.target.value as UserRole })}>{PERFIS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <button className="bg-[#002878] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"><UserPlus size={16} />Adicionar</button>
        {erro && <p role="alert" className="md:col-span-5 text-sm font-bold text-red-600">{erro}</p>}
      </form>
      {okEdit && <p role="status" className="text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">{okEdit}</p>}
      {edit && (
        <form onSubmit={salvarEdicao} className="bg-white rounded-3xl border-2 border-[#002878]/20 p-6 grid md:grid-cols-5 gap-3 items-start">
          <p className="md:col-span-5 font-black text-slate-900">Editar usuário</p>
          <input required className={inputCls} placeholder="Nome" aria-label="Nome" value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} />
          <input required type="email" className={inputCls} placeholder="E-mail" aria-label="E-mail" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} />
          <input type="password" minLength={8} className={inputCls} placeholder="Nova senha (opcional)" aria-label="Nova senha" autoComplete="new-password" value={edit.senha} onChange={e => setEdit({ ...edit, senha: e.target.value })} />
          <select disabled={edit.id === user?.id} className={inputCls} aria-label="Perfil" value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value as UserRole })}>{PERFIS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          <div className="flex gap-2"><button className="bg-[#002878] text-white px-4 py-3 rounded-xl font-bold flex-1">Salvar</button><button type="button" onClick={() => setEdit(null)} className="px-3 text-slate-500 font-bold">Cancelar</button></div>
          <p className="md:col-span-5 text-xs text-slate-400">Se a senha ou o e-mail mudarem, as sessões abertas dessa pessoa são encerradas.</p>
        </form>
      )}
      <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100">
        {lista.map(u => (
          <div key={u.id} className="p-5 flex flex-wrap items-center gap-4 justify-between">
            <div><p className="font-bold text-slate-900">{u.nome}</p><p className="text-xs text-slate-400">{u.email}</p></div>
            <div className="flex items-center gap-3">
              {u.role !== 'ADMIN_PAROQUIA' && <button aria-label={`Permissões de ${u.nome}`} title="Telas e permissões" onClick={() => abrirPerm(u)} className={`flex items-center gap-1 text-xs font-bold ${u.personalizada ? 'text-amber-600' : 'text-slate-400'} hover:text-[#002878]`}><ShieldCheck size={16} />{u.personalizada ? 'Personalizado' : 'Permissões'}</button>}
              <button aria-label={`Editar ${u.nome}`} onClick={() => { setOkEdit(''); setEdit({ id: u.id, nome: u.nome, email: u.email, senha: '', role: u.role }); }} className="text-slate-400 hover:text-[#002878]"><Pencil size={16} /></button>
              <select disabled={u.id === user?.id} value={u.role} onChange={e => alterar(u.id, { role: e.target.value as UserRole })} className="px-3 py-2 bg-slate-50 rounded-xl text-sm">
                {PERFIS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button disabled={u.id === user?.id} onClick={() => alterar(u.id, { ativo: !u.ativo })} className={`text-sm font-bold ${u.ativo ? 'text-red-600' : 'text-emerald-600'} disabled:opacity-30`}>{u.ativo ? 'Desativar' : 'Reativar'}</button>
            </div>
          </div>
        ))}
      </div>
      {permAlvo && (
        <div role="dialog" aria-modal="true" aria-labelledby="perm-t" className="fixed inset-0 z-[150] bg-slate-900/50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-3xl my-8 space-y-4">
            <div className="flex justify-between items-start gap-4">
              <div><h3 id="perm-t" className="text-xl font-black text-slate-900">Telas e permissões de {permAlvo.nome}</h3>
                <p className="text-xs text-slate-500">Perfil: {PERFIS.find(p => p.id === permAlvo.role)?.label}. Marque as telas que a pessoa pode abrir e, em cada uma, o que ela pode fazer.</p></div>
              <button onClick={() => setPermAlvo(null)} className="text-slate-400 hover:text-slate-700 text-sm font-bold">Fechar</button>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
              {catalogo.map(t => (
                <div key={t.tela} className="p-4 grid md:grid-cols-5 gap-2 items-start">
                  <p className="font-black text-sm text-slate-900 md:col-span-1">{t.rotulo}</p>
                  <div className="md:col-span-4 flex flex-wrap gap-x-5 gap-y-1">
                    {t.acoes.map(a => (
                      <label key={a.id} className={`flex items-center gap-2 text-sm ${a.id === 'ver' ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                        <input type="checkbox" checked={!!matriz[t.tela]?.includes(a.id) || !!travas[t.tela]?.obrigatorias.includes(a.id)} disabled={!!travas[t.tela] && (travas[t.tela].obrigatorias.includes(a.id) || travas[t.tela].proibidas.includes(a.id))} onChange={e => alternar(t.tela, a.id, e.target.checked)} aria-label={`${t.rotulo}: ${a.rotulo}`} />{a.rotulo}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">As atas ficam sempre disponíveis para consulta a todos; apenas a Secretaria (e o presidente) pode importar, editar e excluir.</p>
            <p className="text-xs text-slate-500">Sem "Alterar sem confirmação do presidente", qualquer mudança nos cargos da Diretoria só vale depois que você a confirmar com a sua senha.</p>
            {permMsg && <p role="status" className={`text-sm font-bold ${permMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{permMsg.t}</p>}
            <div className="flex flex-wrap gap-3">
              <button onClick={salvarPerm} className="bg-[#002878] text-white px-6 py-3 rounded-2xl font-bold">Salvar permissões</button>
              <button onClick={restaurarPerm} className="px-4 py-3 text-sm font-bold text-slate-600 border border-slate-200 rounded-2xl">Restaurar padrão do perfil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Usuarios;
