import crypto from 'crypto';
import { Router } from 'express';
import { db, uid, agora, type Conn } from './db';
import { assinar, conferirSenha, exigirLogin, exigirRole, hashSenha, ipDe, limitarLogin, limitarPorIp, tenant, type Role } from './auth';
import { wrap, bad, str, EMAIL, documentoValido } from './http';
import { auditar } from './audit';
import { enviarEmail, linkApp } from './mail';
import { VERSAO_LEGAL } from './legal';
import { CARGOS, atribuirCargo, removerCargo, sincronizarDiretoria, liberarCargoDoMembro } from './diretoria';
import { bloqueioEscrita, checarLimite, garantirAssinatura, sedeBilling, paroquiaBilling } from './billing';
import fin from './financeiro';
import lgpd from './lgpd';

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

// Diretoria
r.get('/diretoria', wrap(async req => diretoriaOf(tenant(req))));
r.put('/diretoria/:cargo', exigirRole('ADMIN_PAROQUIA', 'PASTOR', 'SECRETARIA'), wrap(async req => {
  const t = tenant(req), cargo = String(req.params.cargo), b = req.body || {};
  if (!CARGOS.includes(cargo)) throw bad('Cargo inválido');
  let nome = str(b.nome), tel = str(b.telefone), email = str(b.email), membroId: string | null = null;
  if (b.membroId) {
    const m = await db.get('SELECT * FROM membros WHERE id = ? AND unidadeId = ? AND anonimizadoEm IS NULL', b.membroId, t);
    if (!m) throw bad('Membro não encontrado nesta paróquia', 404);
    membroId = m.id; nome = nome || m.nome; tel = tel || m.telefone; email = email || m.email;
  }
  if (!nome) throw bad('Informe o nome');
  await db.tx(c => atribuirCargo(c, t, cargo, { membroId, nome: nome!, telefone: tel, email }));
  return { ok: true };
}));
r.delete('/diretoria/:cargo', exigirRole('ADMIN_PAROQUIA', 'PASTOR', 'SECRETARIA'), wrap(async req => {
  await db.tx(c => removerCargo(c, tenant(req), String(req.params.cargo)));
  return { ok: true };
}));

// Usuários da paróquia
r.get('/usuarios', exigirRole('ADMIN_PAROQUIA'), wrap(async req => db.all('SELECT id, nome, email, role, ativo FROM usuarios WHERE unidadeId = ? ORDER BY nome', tenant(req))));
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
  if (b.ativo === true) await checarLimite(t, 'usuarios');
  const out = await db.run('UPDATE usuarios SET role = COALESCE(?, role), ativo = COALESCE(?, ativo) WHERE id = ? AND unidadeId = ?', b.role ?? null, b.ativo == null ? null : (b.ativo ? 1 : 0), id, t);
  if (!out.changes) throw bad('Usuário não encontrado', 404);
  await auditar(req, 'USUARIO_ALTERADO', 'usuario', id, `${b.role ?? ''} ${b.ativo ?? ''}`.trim());
  return { ok: true };
}));

// ---------- CRUD genérico por tabela, sempre filtrado por unidadeId ----------
interface Cfg {
  table: string; cols: string[]; bools?: string[]; read: Role[]; write: Role[]; search?: string; order: string;
  entidade?: string;                                      // grava auditoria
  antesCriar?: (t: string) => Promise<void>;              // ex.: limite do plano
  depois?: (c: Conn, t: string, row: any) => Promise<void>;
  antesApagar?: (c: Conn, t: string, id: string) => Promise<void>;
}
const ALL: Role[] = ['ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO', 'SECRETARIA'];
function crud(path: string, c: Cfg) {
  const fix = (row: any) => { if (row) for (const b of c.bools || []) row[b] = !!row[b]; return row; };
  const pick = (body: any) => Object.fromEntries(c.cols.filter(k => body?.[k] !== undefined).map(k => [k, (c.bools || []).includes(k) ? (body[k] ? 1 : 0) : body[k]]));
  const buscar = async (cn: Conn, id: string, t: string) => fix(await cn.get(`SELECT * FROM ${c.table} WHERE id = ? AND unidadeId = ?`, id, t));

  r.get(path, exigirRole(...c.read), wrap(async req => {
    const t = tenant(req);
    if (req.query.page) {
      const page = Math.max(1, +req.query.page || 1), limit = Math.min(100, Math.max(1, +req.query.limit || 10));
      const s = c.search && req.query.search ? `%${String(req.query.search).replace(/[%_]/g, '')}%` : null;
      const where = `unidadeId = ?${s ? ` AND ${c.search} LIKE ?` : ''}`, args = s ? [t, s] : [t];
      return { data: (await db.all(`SELECT * FROM ${c.table} WHERE ${where} ORDER BY ${c.order} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit)).map(fix), total: (await db.get(`SELECT COUNT(*) AS n FROM ${c.table} WHERE ${where}`, ...args))!.n };
    }
    return (await db.all(`SELECT * FROM ${c.table} WHERE unidadeId = ? ORDER BY ${c.order}`, t)).map(fix);
  }));
  r.post(path, exigirRole(...c.write), wrap(async (req, res) => {
    const t = tenant(req), d = pick(req.body), id = uid(c.table.slice(0, 2)), keys = Object.keys(d);
    await c.antesCriar?.(t);
    const row = await db.tx(async cn => {
      await cn.run(`INSERT INTO ${c.table} (id, unidadeId${keys.map(k => ', ' + k).join('')}) VALUES (?, ?${keys.map(() => ', ?').join('')})`, id, t, ...Object.values(d));
      const novo = await buscar(cn, id, t);
      await c.depois?.(cn, t, novo);
      if (c.entidade) await auditar(req, 'CRIAR', c.entidade, id, undefined, cn);
      return await buscar(cn, id, t);
    });
    res.status(201).json(row);
  }));
  r.put(`${path}/:id`, exigirRole(...c.write), wrap(async req => {
    const t = tenant(req), id = String(req.params.id), d = pick(req.body), keys = Object.keys(d);
    return db.tx(async cn => {
      if (!(await buscar(cn, id, t))) throw bad('Não encontrado', 404);
      if (keys.length) await cn.run(`UPDATE ${c.table} SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ? AND unidadeId = ?`, ...Object.values(d), id, t);
      const novo = await buscar(cn, id, t);
      await c.depois?.(cn, t, novo);
      if (c.entidade) await auditar(req, 'ATUALIZAR', c.entidade, id, keys.join(','), cn);
      return await buscar(cn, id, t);
    });
  }));
  r.delete(`${path}/:id`, exigirRole(...c.write), wrap(async req => {
    const t = tenant(req), id = String(req.params.id);
    await db.tx(async cn => {
      await c.antesApagar?.(cn, t, id);
      const out = await cn.run(`DELETE FROM ${c.table} WHERE id = ? AND unidadeId = ?`, id, t);
      if (!out.changes) throw bad('Não encontrado', 404);
      if (c.entidade) await auditar(req, 'EXCLUIR', c.entidade, id, undefined, cn);
    });
    return { ok: true };
  }));
}
crud('/membros', {
  table: 'membros', order: 'nome', search: 'nome', read: ALL, write: ['ADMIN_PAROQUIA', 'PASTOR', 'SECRETARIA'], entidade: 'membro',
  cols: ['nome','status','dataBatismo','dataConfirmacao','ultimaComunhao','ultimaPresenca','ultimaOferta','pontuacaoEngajamento','telefone','email','endereco','profissao','familiares','temCargo','cargoDiretoria'],
  bools: ['temCargo'],
  antesCriar: t => checarLimite(t, 'membros'),
  depois: (cn, t, row) => sincronizarDiretoria(cn, t, row),          // cargo na ficha <-> Diretoria
  antesApagar: (cn, t, id) => liberarCargoDoMembro(cn, t, id),
});
crud('/lancamentos', { table: 'lancamentos', order: 'data DESC', read: ['ADMIN_PAROQUIA', 'PASTOR', 'TESOUREIRO'], write: ['ADMIN_PAROQUIA', 'TESOUREIRO'], cols: ['tipo','categoria','valor','data','descricao'] });
crud('/departamentos', { table: 'departamentos', order: 'nome', read: ALL, write: ['ADMIN_PAROQUIA', 'PASTOR', 'SECRETARIA'], cols: ['nome','membrosCount','lider'] });
crud('/eventos', { table: 'eventos', order: 'data, horario', read: ALL, write: ['ADMIN_PAROQUIA', 'PASTOR', 'SECRETARIA'], cols: ['titulo','tipo','data','horario','descricao'] });

r.use(lgpd);
r.use(paroquiaBilling);

export default r;
