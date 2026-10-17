import crypto from 'crypto';
import { Router, type Request } from 'express';
import { db, uid, agora, type Conn } from './db';
import { assinar, conferirSenha, exigirLogin, exigirPerm, exigirRole, hashSenha, ipDe, limitarLogin, limitarPorIp, temPerm, tenant, type Role } from './auth';
import { wrap, bad, str, EMAIL, documentoValido, dataValida } from './http';
import { auditar } from './audit';
import { enviarEmail, linkApp } from './mail';
import { VERSAO_LEGAL } from './legal';
import { CARGOS, atribuirCargo, removerCargo, sincronizarDiretoria, liberarCargoDoMembro } from './diretoria';
import { bloqueioEscrita, checarLimite, garantirAssinatura, sedeBilling, paroquiaBilling } from './billing';
import fin from './financeiro';
import lgpd from './lgpd';
import membrosExtra from './membros-extra';
import pendencias, { aplicar as aplicarPend, registrar as registrarPend, type Pend } from './pendencias';
import ofertas from './ofertas';
import topicos from './topicos';
import relatorios from './relatorios';
import banco from './banco';
import documentos from './documentos';
import { CATALOGO, PADROES, normalizar, matrizEfetiva, ajustarPerfil, travasPerfil } from './permissoes';
import { contarPendentes } from './pendencias';

const r = Router();
const ROLES_PAROQUIA: Role[] = ['ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO', 'SECRETARIA'];
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const senhaOk = (s: string) => typeof s === 'string' && s.length >= 8 && s.length <= 128;

// ---------- helpers ----------
async function diretoriaOf(unidadeId: string) {
  const out: Record<string, any> = {};
  for (const d of await db.all('SELECT * FROM diretoria WHERE unidadeId = ?', unidadeId))
    out[d.cargo] = { nome: d.nome, telefone: d.telefone ?? undefined, email: d.email ?? undefined, membroId: d.membroId ?? undefined };
  return out;
}
const unidadeOut = async (u: any) => ({ ...u, pastores: JSON.parse(u.pastores || '[]'), isSede: !!u.isSede, diretoria: await diretoriaOf(u.id) });

async function registrarAceites(c: Conn, usuarioId: string, ip?: string) {
  for (const tipo of ['termos', 'privacidade'])
    await c.run('INSERT INTO aceites (id,usuarioId,tipo,versao,aceitoEm,ip) VALUES (?,?,?,?,?,?)', uid('ac'), usuarioId, tipo, VERSAO_LEGAL, agora(), ip ?? null);
}
async function aceitePendente(usuarioId: string) {
  const n = (await db.get('SELECT COUNT(DISTINCT tipo) AS n FROM aceites WHERE usuarioId = ? AND versao = ?', usuarioId, VERSAO_LEGAL))!.n;
  return n < 2;
}

async function criarParoquia(p: any, adm: any, status: 'PENDENTE' | 'ATIVA', aceitou: boolean, ip?: string) {
  const nome = str(p?.nome), nomeAdm = str(adm?.nome), email = str(adm?.email)?.toLowerCase(), senha = String(adm?.senha || '');
  if (!nome || !nomeAdm || !email) throw bad('Preencha nome da paróquia, nome e e-mail do responsável');
  if (!EMAIL.test(email)) throw bad('E-mail inválido');
  if (!senhaOk(senha)) throw bad('A senha deve ter de 8 a 128 caracteres');
  if (status === 'PENDENTE' && !aceitou) throw bad('É necessário aceitar os Termos de Uso e a Política de Privacidade');
  if (await db.get('SELECT 1 AS x FROM usuarios WHERE email = ?', email)) throw bad('Já existe um usuário com este e-mail', 409);
  const doc = p?.cpfCnpj ? documentoValido(p.cpfCnpj) : null;
  if (p?.cpfCnpj && !doc) throw bad('CNPJ ou CPF inválido');
  const id = uid('un'), uidAdm = uid('u');
  await db.tx(async c => {
    await c.run('INSERT INTO unidades (id,nome,tipo,distrito,pastores,endereco,contato,status,cpfCnpj) VALUES (?,?,?,?,?,?,?,?,?)',
      id, nome, p.tipo === 'COMUNIDADE' ? 'COMUNIDADE' : 'PAROQUIA', str(p.distrito) || '', JSON.stringify(Array.isArray(p.pastores) ? p.pastores.map((x: any) => str(x)) : []), str(p.endereco), str(p.contato), status, doc);
    await c.run('INSERT INTO usuarios (id,unidadeId,nome,email,senhaHash,role) VALUES (?,?,?,?,?,?)', uidAdm, id, nomeAdm, email, hashSenha(senha), 'ADMIN_PAROQUIA');
    if (aceitou) await registrarAceites(c, uidAdm, ip);
    if (status === 'ATIVA') await garantirAssinatura(id, c);
  });
  return id;
}

// ---------- auth (público) ----------
r.post('/auth/login', limitarLogin, wrap(async (req, res) => {
  const email = str(req.body?.email)?.toLowerCase() || '';
  const u = await db.get('SELECT * FROM usuarios WHERE email = ?', email);
  if (!u || !u.ativo || !conferirSenha(String(req.body?.senha || ''), u.senhaHash)) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  if (u.unidadeId) {
    const un = await db.get('SELECT status FROM unidades WHERE id = ?', u.unidadeId);
    if (un?.status === 'PENDENTE') return res.status(403).json({ error: 'Cadastro da paróquia aguardando aprovação da sede.' });
    if (un?.status === 'SUSPENSA') return res.status(403).json({ error: 'Paróquia suspensa. Entre em contato com a sede.' });
  }
  const token = assinar({ uid: u.id, unidadeId: u.unidadeId, role: u.role, nome: u.nome, v: u.tokenVersao });
  return res.json({ token, usuario: { id: u.id, nome: u.nome, role: u.role, unidadeId: u.unidadeId } });
}));

r.post('/auth/solicitar-cadastro', limitarPorIp('cadastro', 10, 60 * 60_000), wrap(async (req, res) => {
  await criarParoquia(req.body?.paroquia, req.body?.responsavel, 'PENDENTE', req.body?.aceitou === true, ipDe(req));
  res.status(201).json({ ok: true });
}));

// Recuperação de senha: resposta é sempre a mesma (não revela se o e-mail existe)
r.post('/auth/esqueci-senha', limitarPorIp('esqueci', 5, 15 * 60_000), wrap(async req => {
  const email = str(req.body?.email)?.toLowerCase() || '';
  const u = EMAIL.test(email) ? await db.get('SELECT id, nome FROM usuarios WHERE email = ? AND ativo = 1', email) : undefined;
  if (u) {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.tx(async c => {
      await c.run('DELETE FROM reset_senha WHERE usuarioId = ?', u.id);
      await c.run('INSERT INTO reset_senha (tokenHash,usuarioId,expiraEm) VALUES (?,?,?)', sha(token), u.id, new Date(Date.now() + 60 * 60_000).toISOString());
    });
    await enviarEmail(email, 'Recuperação de senha - Castelo Forte',
      `Olá, ${u.nome}.\n\nRecebemos um pedido para redefinir sua senha. Use o link abaixo (válido por 1 hora):\n\n${linkApp(`redefinir-senha/${token}`)}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`);
  }
  return { ok: true };
}));
r.post('/auth/redefinir-senha', limitarPorIp('redefinir', 10, 15 * 60_000), wrap(async req => {
  const token = String(req.body?.token || ''), senha = String(req.body?.senha || '');
  if (!senhaOk(senha)) throw bad('A senha deve ter de 8 a 128 caracteres');
  const t = await db.get('SELECT usuarioId, expiraEm, usadoEm FROM reset_senha WHERE tokenHash = ?', sha(token));
  if (!t || t.usadoEm || new Date(t.expiraEm).getTime() < Date.now()) throw bad('Link inválido ou expirado. Solicite um novo.', 400);
  await db.tx(async c => {
    await c.run('UPDATE usuarios SET senhaHash = ?, tokenVersao = tokenVersao + 1 WHERE id = ?', hashSenha(senha), t.usuarioId); // derruba sessões antigas
    await c.run('UPDATE reset_senha SET usadoEm = ? WHERE tokenHash = ?', agora(), sha(token));
    await auditar(null, 'SENHA_REDEFINIDA', 'usuario', t.usuarioId, undefined, c);
  });
  return { ok: true };
}));

// ---------- a partir daqui exige login ----------
r.use(exigirLogin);
r.use(bloqueioEscrita);

r.get('/auth/me', wrap(async req => {
  const s = req.sessao!;
  const ass = s.unidadeId ? await db.get('SELECT status, trialAte FROM assinaturas WHERE unidadeId = ?', s.unidadeId) : null;
  return { id: s.uid, nome: s.nome, role: s.role, unidadeId: s.unidadeId, aceitePendente: await aceitePendente(s.uid), assinatura: ass ?? null,
    permissoes: [...(s.perm ?? [])], pendenciasDiretoria: s.role === 'ADMIN_PAROQUIA' && s.unidadeId ? await contarPendentes(s.unidadeId) : 0,
    unidade: s.unidadeId ? await unidadeOut(await db.get('SELECT * FROM unidades WHERE id = ?', s.unidadeId)) : null };
}));
r.post('/auth/aceitar', wrap(async req => {
  if (req.body?.aceitou !== true) throw bad('É necessário aceitar para continuar');
  await db.tx(c => registrarAceites(c, req.sessao!.uid, ipDe(req)));
  return { ok: true };
}));
r.post('/auth/alterar-senha', limitarPorIp('altsenha', 10, 15 * 60_000), wrap(async req => {
  const u = await db.get('SELECT senhaHash, tokenVersao FROM usuarios WHERE id = ?', req.sessao!.uid);
  if (!u || !conferirSenha(String(req.body?.senhaAtual || ''), u.senhaHash)) throw bad('Senha atual incorreta', 403);
  if (!senhaOk(String(req.body?.novaSenha || ''))) throw bad('A nova senha deve ter de 8 a 128 caracteres');
  const v = u.tokenVersao + 1;
  await db.run('UPDATE usuarios SET senhaHash = ?, tokenVersao = ? WHERE id = ?', hashSenha(String(req.body.novaSenha)), v, req.sessao!.uid);
  return { token: assinar({ uid: req.sessao!.uid, unidadeId: req.sessao!.unidadeId, role: req.sessao!.role, nome: req.sessao!.nome, v }) };
}));

// ---------- sede (SUPER_ADMIN) ----------
const sede = Router();
sede.use(exigirRole('SUPER_ADMIN'));
sede.get('/paroquias', wrap(async () => {
  const lista = await db.all('SELECT * FROM unidades WHERE isSede = 0 ORDER BY nome');
  return Promise.all(lista.map(async u => {
    const n = async (st: string) => (await db.get('SELECT COUNT(*) AS n FROM membros WHERE unidadeId = ? AND status = ?', u.id, st))!.n;
    return {
      ...(await unidadeOut(u)),
      stats: { ativos: await n('ATIVO'), inativos: await n('INATIVO'), transferidos: await n('TRANSFERIDO') },
      admin: await db.get(`SELECT nome, email FROM usuarios WHERE unidadeId = ? AND role = 'ADMIN_PAROQUIA' ORDER BY criadoEm LIMIT 1`, u.id),
    };
  }));
}));
sede.post('/paroquias', wrap(async (req, res) => { const id = await criarParoquia(req.body?.paroquia, req.body?.responsavel, 'ATIVA', false); res.status(201).json({ id }); }));
sede.patch('/paroquias/:id/status', wrap(async req => {
  const st = req.body?.status, id = String(req.params.id);
  if (!['ATIVA', 'SUSPENSA', 'PENDENTE'].includes(st)) throw bad('Status inválido');
  const antes = await db.get('SELECT status, nome FROM unidades WHERE id = ? AND isSede = 0', id);
  if (!antes) throw bad('Paróquia não encontrada', 404);
  await db.tx(async c => {
    await c.run('UPDATE unidades SET status = ? WHERE id = ?', st, id);
    if (st === 'ATIVA') await garantirAssinatura(id, c);
  });
  await auditar(req, `PAROQUIA_${st}`, 'paroquia', id, antes.nome, db, null);
  if (st === 'ATIVA' && antes.status === 'PENDENTE') {
    const adm = await db.get(`SELECT email, nome FROM usuarios WHERE unidadeId = ? AND role = 'ADMIN_PAROQUIA' ORDER BY criadoEm LIMIT 1`, id);
    if (adm) await enviarEmail(adm.email, 'Cadastro aprovado - Castelo Forte',
      `Olá, ${adm.nome}.\n\nO cadastro de ${antes.nome} foi aprovado. Você já pode entrar com o e-mail e a senha que cadastrou:\n\n${linkApp('login')}`);
  }
  return { ok: true };
}));
// Encerramento do vínculo: exclusão definitiva (exige digitar o nome exato da paróquia)
sede.post('/paroquias/:id/excluir', wrap(async req => {
  const id = String(req.params.id);
  const u = await db.get('SELECT nome FROM unidades WHERE id = ? AND isSede = 0', id);
  if (!u) throw bad('Paróquia não encontrada', 404);
  if (req.body?.confirmarNome !== u.nome) throw bad('Digite o nome exato da paróquia para confirmar a exclusão definitiva.');
  await db.run('DELETE FROM unidades WHERE id = ?', id); // cascata remove membros, finanças, usuários etc.
  await auditar(req, 'PAROQUIA_EXCLUIDA', 'paroquia', id, u.nome, db, null);
  return { ok: true };
}));
sede.use(fin);
sede.use(sedeBilling);
r.use('/sede', sede);

// ---------- dados da própria paróquia (tenant vem do token) ----------
r.get('/paroquia', wrap(async req => unidadeOut(await db.get('SELECT * FROM unidades WHERE id = ?', tenant(req)))));
r.put('/paroquia', exigirRole('ADMIN_PAROQUIA', 'PASTOR', 'SECRETARIA'), wrap(async req => {
  const b = req.body || {};
  await db.run('UPDATE unidades SET nome = COALESCE(?, nome), distrito = COALESCE(?, distrito), endereco = ?, contato = ?, pastores = ? WHERE id = ?',
    str(b.nome), str(b.distrito), str(b.endereco), str(b.contato), JSON.stringify(Array.isArray(b.pastores) ? b.pastores.map((x: any) => str(x)) : []), tenant(req));
  return { ok: true };
}));

// Diretoria (quem não tem "alterar sem confirmação" gera uma pendência que o presidente confirma com a senha)
r.get('/diretoria', exigirPerm('diretoria.ver', 'diretoria.alterar'), wrap(async req => diretoriaOf(tenant(req))));
r.put('/diretoria/:cargo', exigirPerm('diretoria.alterar'), wrap(async (req, res) => {
  const t = tenant(req), cargo = String(req.params.cargo), b = req.body || {};
  if (!CARGOS.includes(cargo)) throw bad('Cargo inválido');
  let nome = str(b.nome), tel = str(b.telefone), email = str(b.email), membroId: string | null = null;
  if (b.membroId) {
    const m = await db.get('SELECT * FROM membros WHERE id = ? AND unidadeId = ? AND anonimizadoEm IS NULL', b.membroId, t);
    if (!m) throw bad('Membro não encontrado nesta paróquia', 404);
    membroId = m.id; nome = nome || m.nome; tel = tel || m.telefone; email = email || m.email;
  }
  if (!nome) throw bad('Informe o nome');
  const p = { cargo, acao: 'ATRIBUIR' as const, membroId, nome, telefone: tel, email };
  if (temPerm(req, 'diretoria.direto')) { await db.tx(c => aplicarPend(c, t, p)); return { ok: true }; }
  const id = await db.tx(c => registrarPend(c, req, t, p));
  res.status(202).json({ pendente: true, id });
}));
r.delete('/diretoria/:cargo', exigirPerm('diretoria.alterar'), wrap(async (req, res) => {
  const t = tenant(req), cargo = String(req.params.cargo);
  if (!CARGOS.includes(cargo)) throw bad('Cargo inválido');
  if (temPerm(req, 'diretoria.direto')) { await db.tx(c => removerCargo(c, t, cargo)); return { ok: true }; }
  if (!(await db.get('SELECT 1 AS x FROM diretoria WHERE unidadeId = ? AND cargo = ?', t, cargo))) throw bad('Este cargo não está preenchido', 404);
  const id = await db.tx(c => registrarPend(c, req, t, { cargo, acao: 'REMOVER' }));
  res.status(202).json({ pendente: true, id });
}));
r.use(pendencias);

// Usuários da paróquia
r.get('/usuarios', exigirRole('ADMIN_PAROQUIA'), wrap(async req => db.all('SELECT id, nome, email, role, ativo, CASE WHEN permissoes IS NULL THEN 0 ELSE 1 END AS personalizada FROM usuarios WHERE unidadeId = ? ORDER BY nome', tenant(req))));
r.post('/usuarios', exigirRole('ADMIN_PAROQUIA'), wrap(async (req, res) => {
  const b = req.body || {}, email = str(b.email)?.toLowerCase() || '', t = tenant(req);
  if (!str(b.nome) || !EMAIL.test(email) || !senhaOk(String(b.senha || ''))) throw bad('Nome, e-mail válido e senha (8+ caracteres) são obrigatórios');
  if (!ROLES_PAROQUIA.includes(b.role)) throw bad('Perfil inválido');
  if (await db.get('SELECT 1 AS x FROM usuarios WHERE email = ?', email)) throw bad('E-mail já cadastrado', 409);
  await checarLimite(t, 'usuarios');
  const id = uid('u');
  await db.run('INSERT INTO usuarios (id,unidadeId,nome,email,senhaHash,role) VALUES (?,?,?,?,?,?)', id, t, str(b.nome), email, hashSenha(String(b.senha)), b.role);
  await auditar(req, 'USUARIO_CRIADO', 'usuario', id, b.role);
  res.status(201).json({ id });
}));
r.patch('/usuarios/:id', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const b = req.body || {}, id = String(req.params.id), t = tenant(req);
  if (b.role && !ROLES_PAROQUIA.includes(b.role)) throw bad('Perfil inválido');
  if (id === req.sessao!.uid && (b.ativo === false || (b.role && b.role !== 'ADMIN_PAROQUIA'))) throw bad('Você não pode rebaixar ou desativar a si mesmo');
  const alvo = await db.get('SELECT id, email, ativo, role FROM usuarios WHERE id = ? AND unidadeId = ?', id, t);
  if (!alvo) throw bad('Usuário não encontrado', 404);
  const nome = b.nome === undefined ? null : str(b.nome, 120), email = b.email === undefined ? null : str(b.email)?.toLowerCase() ?? '';
  if (nome !== null && nome.length < 2) throw bad('Informe o nome');
  if (email !== null) {
    if (!EMAIL.test(email)) throw bad('E-mail inválido');
    if (email !== alvo.email && await db.get('SELECT 1 AS x FROM usuarios WHERE email = ? AND id <> ?', email, id)) throw bad('E-mail já cadastrado', 409);
  }
  if (b.senha !== undefined && !senhaOk(String(b.senha))) throw bad('A nova senha deve ter de 8 a 128 caracteres');
  if (b.ativo === true && !alvo.ativo) await checarLimite(t, 'usuarios');
  await db.tx(async c => {
    await c.run('UPDATE usuarios SET nome = COALESCE(?, nome), email = COALESCE(?, email), role = COALESCE(?, role), ativo = COALESCE(?, ativo) WHERE id = ? AND unidadeId = ?',
      nome, email, b.role ?? null, b.ativo == null ? null : (b.ativo ? 1 : 0), id, t);
    if (b.role && b.role !== alvo.role) await c.run('UPDATE usuarios SET permissoes = NULL WHERE id = ?', id); // trocou de perfil: volta ao padrão do novo perfil
    // senha redefinida pelo administrador ou e-mail trocado: encerra as sessões abertas dessa pessoa
    if (b.senha !== undefined) await c.run('UPDATE usuarios SET senhaHash = ?, tokenVersao = tokenVersao + 1 WHERE id = ?', hashSenha(String(b.senha)), id);
    else if (email !== null && email !== alvo.email) await c.run('UPDATE usuarios SET tokenVersao = tokenVersao + 1 WHERE id = ?', id);
    await auditar(req, 'USUARIO_ALTERADO', 'usuario', id, [nome !== null && 'nome', email !== null && 'email', b.role && 'perfil', b.ativo != null && 'ativo', b.senha !== undefined && 'senha'].filter(Boolean).join(','), c);
  });
  return { ok: true };
}));

// Permissões por usuário (só o presidente): quais telas e quais alterações dentro de cada tela
r.get('/permissoes/catalogo', exigirRole('ADMIN_PAROQUIA'), wrap(async () => ({ catalogo: CATALOGO, padroes: { PASTOR: PADROES.PASTOR, TESOUREIRO: PADROES.TESOUREIRO, SECRETARIA: PADROES.SECRETARIA } })));
async function alvoPermissoes(req: Request) {
  const u = await db.get('SELECT id, nome, role, permissoes FROM usuarios WHERE id = ? AND unidadeId = ?', String(req.params.id), tenant(req));
  if (!u) throw bad('Usuário não encontrado', 404);
  return u;
}
r.get('/usuarios/:id/permissoes', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const u = await alvoPermissoes(req);
  return { id: u.id, nome: u.nome, role: u.role, personalizada: !!u.permissoes, matriz: matrizEfetiva(u.role, u.permissoes), fixo: u.role === 'ADMIN_PAROQUIA', travas: travasPerfil(u.role) };
}));
r.put('/usuarios/:id/permissoes', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const u = await alvoPermissoes(req);
  if (u.role === 'ADMIN_PAROQUIA') throw bad('O presidente sempre tem acesso total; as permissões dele não podem ser restringidas.');
  const m = ajustarPerfil(u.role, normalizar(req.body?.matriz));
  await db.run('UPDATE usuarios SET permissoes = ? WHERE id = ?', JSON.stringify(m), u.id);
  await auditar(req, 'PERMISSOES_ALTERADAS', 'usuario', u.id, Object.keys(m).join(','));
  return { ok: true, matriz: m };
}));
r.delete('/usuarios/:id/permissoes', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const u = await alvoPermissoes(req);
  await db.run('UPDATE usuarios SET permissoes = NULL WHERE id = ?', u.id);
  await auditar(req, 'PERMISSOES_RESTAURADAS', 'usuario', u.id);
  return { ok: true, matriz: matrizEfetiva(u.role, null) };
}));

// ---------- CRUD genérico por tabela, sempre filtrado por unidadeId ----------
interface Cfg {
  table: string; cols: string[]; bools?: string[]; search?: string; order: string;
  perm: { ver: string[]; criar: string[]; editar: string[]; excluir: string[] };   // permissões "<tela>.<ação>" (qualquer uma)
  entidade?: string;                                      // grava auditoria
  validar?: (corpo: any) => void;                         // rejeita dados inválidos (lança bad())
  antesCriar?: (t: string) => Promise<void>;              // ex.: limite do plano
  /** Pode retirar campos de `d` que o usuário não pode alterar e devolver pendências a registrar depois de salvar. */
  restringir?: (req: Request, t: string, antes: any | null, d: Record<string, any>) => Promise<((id: string) => Pend)[]>;
  depois?: (c: Conn, t: string, row: any, req: Request) => Promise<void>;
  antesApagar?: (c: Conn, t: string, id: string, req: Request) => Promise<void>;
}
function crud(path: string, c: Cfg) {
  const fix = (row: any) => { if (row) for (const b of c.bools || []) row[b] = !!row[b]; return row; };
  const pick = (body: any) => Object.fromEntries(c.cols.filter(k => body?.[k] !== undefined).map(k => [k, (c.bools || []).includes(k) ? (body[k] ? 1 : 0) : (body[k] === '' && ['dataNascimento', 'ofertaMensalValor'].includes(k) ? null : body[k])]));
  const buscar = async (cn: Conn, id: string, t: string) => fix(await cn.get(`SELECT * FROM ${c.table} WHERE id = ? AND unidadeId = ?`, id, t));

  r.get(path, exigirPerm(...c.perm.ver), wrap(async req => {
    const t = tenant(req);
    if (req.query.page) {
      const page = Math.max(1, +req.query.page || 1), limit = Math.min(100, Math.max(1, +req.query.limit || 10));
      const s = c.search && req.query.search ? `%${String(req.query.search).replace(/[%_]/g, '')}%` : null;
      const where = `unidadeId = ?${s ? ` AND ${c.search} LIKE ?` : ''}`, args = s ? [t, s] : [t];
      return { data: (await db.all(`SELECT * FROM ${c.table} WHERE ${where} ORDER BY ${c.order} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit)).map(fix), total: (await db.get(`SELECT COUNT(*) AS n FROM ${c.table} WHERE ${where}`, ...args))!.n };
    }
    return (await db.all(`SELECT * FROM ${c.table} WHERE unidadeId = ? ORDER BY ${c.order}`, t)).map(fix);
  }));
  r.post(path, exigirPerm(...c.perm.criar), wrap(async (req, res) => {
    const t = tenant(req), d = pick(req.body), id = uid(c.table.slice(0, 2));
    c.validar?.(req.body);
    await c.antesCriar?.(t);
    const pend = (await c.restringir?.(req, t, null, d)) ?? [], keys = Object.keys(d);
    const row = await db.tx(async cn => {
      await cn.run(`INSERT INTO ${c.table} (id, unidadeId${keys.map(k => ', ' + k).join('')}) VALUES (?, ?${keys.map(() => ', ?').join('')})`, id, t, ...Object.values(d));
      const novo = await buscar(cn, id, t);
      await c.depois?.(cn, t, novo, req);
      for (const mk of pend) await registrarPend(cn, req, t, mk(id));
      if (c.entidade) await auditar(req, 'CRIAR', c.entidade, id, undefined, cn);
      return await buscar(cn, id, t);
    });
    res.status(201).json((req as any)._pendDir ? { ...row, _pendenciaDiretoria: true } : row);
  }));
  r.put(`${path}/:id`, exigirPerm(...c.perm.editar), wrap(async req => {
    const t = tenant(req), id = String(req.params.id), d = pick(req.body);
    c.validar?.(req.body);
    return db.tx(async cn => {
      const antes = await buscar(cn, id, t);
      if (!antes) throw bad('Não encontrado', 404);
      const pend = (await c.restringir?.(req, t, antes, d)) ?? [], keys = Object.keys(d);
      if (keys.length) await cn.run(`UPDATE ${c.table} SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ? AND unidadeId = ?`, ...Object.values(d), id, t);
      const novo = await buscar(cn, id, t);
      await c.depois?.(cn, t, novo, req);
      for (const mk of pend) await registrarPend(cn, req, t, mk(id));
      if (c.entidade) await auditar(req, 'ATUALIZAR', c.entidade, id, keys.join(','), cn);
      const out = await buscar(cn, id, t);
      return (req as any)._pendDir ? { ...out, _pendenciaDiretoria: true } : out;
    });
  }));
  r.delete(`${path}/:id`, exigirPerm(...c.perm.excluir), wrap(async req => {
    const t = tenant(req), id = String(req.params.id);
    await db.tx(async cn => {
      await c.antesApagar?.(cn, t, id, req);
      const out = await cn.run(`DELETE FROM ${c.table} WHERE id = ? AND unidadeId = ?`, id, t);
      if (!out.changes) throw bad('Não encontrado', 404);
      if (c.entidade) await auditar(req, 'EXCLUIR', c.entidade, id, undefined, cn);
    });
    return { ok: true };
  }));
}
crud('/membros', {
  table: 'membros', order: 'nome', search: 'nome', entidade: 'membro',
  perm: { ver: ['membros.ver', 'dashboard.ver', 'diretoria.alterar', 'ofertas.criar'], criar: ['membros.criar'], editar: ['membros.editar'], excluir: ['membros.excluir'] },
  cols: ['nome','status','dataBatismo','dataConfirmacao','ultimaComunhao','ultimaPresenca','ultimaOferta','pontuacaoEngajamento','telefone','email','endereco','profissao','familiares','temCargo','cargoDiretoria','dataNascimento','ofertaMensalValor'],
  bools: ['temCargo'],
  validar: b => {
    if (b?.dataNascimento != null && b.dataNascimento !== '' && (!dataValida(b.dataNascimento) || b.dataNascimento > new Date().toISOString().slice(0, 10))) throw bad('Data de nascimento inválida');
    if (b?.ofertaMensalValor != null && b.ofertaMensalValor !== '' && (!Number.isFinite(Number(b.ofertaMensalValor)) || Number(b.ofertaMensalValor) < 0)) throw bad('Oferta mensal inválida');
  },
  antesCriar: t => checarLimite(t, 'membros'),
  // Sem "alterar cargos sem confirmação" o vínculo de cargo marcado na ficha NÃO é alterado: vira pendência para o presidente
  restringir: async (req, t, antes, d) => {
    if (temPerm(req, 'diretoria.direto')) return [];
    const toca = 'temCargo' in d || 'cargoDiretoria' in d;
    if (!toca) return [];
    const novoTem = 'temCargo' in d ? !!d.temCargo : !!antes?.temCargo, novoCargo = 'cargoDiretoria' in d ? d.cargoDiretoria : antes?.cargoDiretoria;
    const desejado: string | null = novoTem && CARGOS.includes(novoCargo) ? novoCargo : null;
    const atual: string | null = antes ? (await db.get('SELECT cargo FROM diretoria WHERE unidadeId = ? AND membroId = ?', t, antes.id))?.cargo ?? null : null;
    delete d.temCargo; delete d.cargoDiretoria;
    if (desejado && desejado !== atual) return [(id: string) => ({ cargo: desejado, acao: 'ATRIBUIR' as const, membroId: id })];
    if (!desejado && atual) return [() => ({ cargo: atual, acao: 'REMOVER' as const })];
    return [];
  },
  depois: async (cn, t, row, req) => {
    if (temPerm(req, 'diretoria.direto')) return sincronizarDiretoria(cn, t, row);   // cargo na ficha <-> Diretoria
    await cn.run('UPDATE diretoria SET nome = ?, telefone = ?, email = ? WHERE unidadeId = ? AND membroId = ?', row.nome, row.telefone ?? null, row.email ?? null, t, row.id); // só mantém os dados de contato em dia
    const desligado = row.anonimizadoEm || ['TRANSFERIDO', 'FALECIDO'].includes(row.status);
    const cargo = desligado ? (await cn.get('SELECT cargo FROM diretoria WHERE unidadeId = ? AND membroId = ?', t, row.id))?.cargo : null;
    if (cargo) await registrarPend(cn, req, t, { cargo, acao: 'REMOVER' });             // sair da diretoria também precisa da confirmação
  },
  antesApagar: async (cn, t, id, req) => {
    if (!temPerm(req, 'diretoria.direto') && await cn.get('SELECT 1 AS x FROM diretoria WHERE unidadeId = ? AND membroId = ?', t, id))
      throw bad('Este membro ocupa um cargo na diretoria. Peça ao presidente para remover o vínculo (tela Diretoria) antes de excluir.', 409);
    await liberarCargoDoMembro(cn, t, id); await cn.run('UPDATE lancamentos SET membroId = NULL WHERE unidadeId = ? AND membroId = ?', t, id);
  },
});
crud('/lancamentos', { table: 'lancamentos', order: 'data DESC', cols: ['tipo','categoria','valor','data','descricao'],
  perm: { ver: ['financeiro.ver'], criar: ['financeiro.criar', 'despesas.criar'], editar: ['financeiro.editar'], excluir: ['financeiro.excluir', 'despesas.excluir', 'ofertas.excluir'] },
  antesApagar: async (cn, t, id) => { await cn.run(`UPDATE banco_transacoes SET status = 'PENDENTE', lancamentoId = NULL WHERE unidadeId = ? AND lancamentoId = ?`, t, id); } });
crud('/departamentos', { table: 'departamentos', order: 'nome', cols: ['nome','membrosCount','lider'],
  perm: { ver: ['departamentos.ver'], criar: ['departamentos.criar'], editar: ['departamentos.editar'], excluir: ['departamentos.excluir'] } });
crud('/eventos', { table: 'eventos', order: 'data, horario', cols: ['titulo','tipo','data','horario','descricao'],
  perm: { ver: ['calendario.ver'], criar: ['calendario.criar'], editar: ['calendario.editar'], excluir: ['calendario.excluir'] } });

r.use(lgpd);
r.use(membrosExtra);
r.use(ofertas);
r.use(topicos);
r.use(relatorios);
r.use(banco);
r.use(documentos);
r.use(paroquiaBilling);

export default r;
