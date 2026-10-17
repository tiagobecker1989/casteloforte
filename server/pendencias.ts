import { Router, type Request } from 'express';
import { db, uid, agora, type Conn } from './db';
import { exigirRole, exigirPerm, tenant, conferirSenha, limitarPorIp } from './auth';
import { wrap, bad, str } from './http';
import { auditar } from './audit';
import { CARGOS, atribuirCargo, removerCargo } from './diretoria';

/**
 * Segurança da Diretoria: quem não tem "alterar sem confirmação" (por padrão a Secretaria) NÃO altera os cargos
 * diretamente. A alteração vira uma PENDÊNCIA que aparece na conta do presidente, e só vale quando ele a confirma
 * digitando a própria senha.
 */
export interface Pend { cargo: string; acao: 'ATRIBUIR' | 'REMOVER'; membroId?: string | null; nome?: string | null; telefone?: string | null; email?: string | null }

/** Aplica a mudança (usada na alteração direta e na confirmação do presidente). */
export async function aplicar(c: Conn, t: string, p: Pend) {
  if (!CARGOS.includes(p.cargo)) throw bad('Cargo inválido');
  if (p.acao === 'REMOVER') { await removerCargo(c, t, p.cargo); return; }
  let nome = p.nome ?? null, tel = p.telefone ?? null, email = p.email ?? null, membroId: string | null = null;
  if (p.membroId) {
    const m = await c.get('SELECT * FROM membros WHERE id = ? AND unidadeId = ? AND anonimizadoEm IS NULL', p.membroId, t);
    if (!m) throw bad('Membro não encontrado nesta paróquia', 404);
    membroId = m.id; nome = nome || m.nome; tel = tel || m.telefone; email = email || m.email;
  }
  if (!nome) throw bad('Informe o nome');
  await atribuirCargo(c, t, p.cargo, { membroId, nome, telefone: tel, email });
}

export async function registrar(c: Conn, req: Request, t: string, p: Pend): Promise<string> {
  const id = uid('dp');
  await c.run(`UPDATE diretoria_pendencias SET status = 'CANCELADA', decididoEm = ?, motivo = 'Substituída por nova solicitação' WHERE unidadeId = ? AND solicitanteId = ? AND cargo = ? AND status = 'PENDENTE'`, agora(), t, req.sessao!.uid, p.cargo);
  await c.run(`INSERT INTO diretoria_pendencias (id,unidadeId,solicitanteId,cargo,acao,membroId,nome,telefone,email,status,criadoEm) VALUES (?,?,?,?,?,?,?,?,?,'PENDENTE',?)`,
    id, t, req.sessao!.uid, p.cargo, p.acao, p.membroId ?? null, p.nome ?? null, p.telefone ?? null, p.email ?? null, agora());
  await auditar(req, 'DIRETORIA_SOLICITADA', 'diretoria', id, `${p.acao} ${p.cargo}`, c);
  (req as any)._pendDir = true; // a resposta da requisição avisa que há alteração aguardando o presidente
  return id;
}

export const contarPendentes = async (t: string) => (await db.get(`SELECT COUNT(*) AS n FROM diretoria_pendencias WHERE unidadeId = ? AND status = 'PENDENTE'`, t))!.n as number;

const r = Router();
r.get('/diretoria/pendencias', exigirPerm('diretoria.ver', 'diretoria.alterar'), wrap(async req => {
  const t = tenant(req), s = req.sessao!;
  const campos = `p.id, p.cargo, p.acao, p.membroId, p.nome, p.status, p.criadoEm, p.decididoEm, p.motivo, u.nome AS solicitante, m.nome AS membroNome, d.nome AS ocupanteAtual`;
  const juncoes = `FROM diretoria_pendencias p LEFT JOIN usuarios u ON u.id = p.solicitanteId LEFT JOIN membros m ON m.id = p.membroId LEFT JOIN diretoria d ON d.unidadeId = p.unidadeId AND d.cargo = p.cargo`;
  return {
    pendentes: s.role === 'ADMIN_PAROQUIA' ? await db.all(`SELECT ${campos} ${juncoes} WHERE p.unidadeId = ? AND p.status = 'PENDENTE' ORDER BY p.criadoEm`, t) : [],
    minhas: await db.all(`SELECT ${campos} ${juncoes} WHERE p.unidadeId = ? AND p.solicitanteId = ? ORDER BY p.criadoEm DESC LIMIT 15`, t, s.uid),
  };
}));

r.post('/diretoria/pendencias/:id/confirmar', exigirRole('ADMIN_PAROQUIA'), limitarPorIp('diretoria-senha', 10, 15 * 60_000), wrap(async req => {
  const t = tenant(req), id = String(req.params.id);
  const eu = await db.get('SELECT senhaHash FROM usuarios WHERE id = ?', req.sessao!.uid);
  if (!eu || !conferirSenha(String(req.body?.senha ?? ''), eu.senhaHash)) throw bad('Senha incorreta. A alteração não foi confirmada.', 403);
  await db.tx(async c => {
    const p = await c.get(`SELECT * FROM diretoria_pendencias WHERE id = ? AND unidadeId = ?`, id, t);
    if (!p) throw bad('Solicitação não encontrada', 404);
    if (p.status !== 'PENDENTE') throw bad('Esta solicitação já foi decidida', 409);
    await aplicar(c, t, p);
    await c.run(`UPDATE diretoria_pendencias SET status = 'CONFIRMADA', decididoEm = ?, decididoPor = ? WHERE id = ?`, agora(), req.sessao!.uid, id);
    await auditar(req, 'DIRETORIA_CONFIRMADA', 'diretoria', id, `${p.acao} ${p.cargo}`, c);
  });
  return { ok: true };
}));
r.post('/diretoria/pendencias/:id/recusar', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const out = await db.run(`UPDATE diretoria_pendencias SET status = 'RECUSADA', decididoEm = ?, decididoPor = ?, motivo = ? WHERE id = ? AND unidadeId = ? AND status = 'PENDENTE'`,
    agora(), req.sessao!.uid, str(req.body?.motivo, 200), String(req.params.id), tenant(req));
  if (!out.changes) throw bad('Solicitação pendente não encontrada', 404);
  await auditar(req, 'DIRETORIA_RECUSADA', 'diretoria', String(req.params.id));
  return { ok: true };
}));
r.post('/diretoria/pendencias/:id/cancelar', exigirPerm('diretoria.alterar'), wrap(async req => {
  const out = await db.run(`UPDATE diretoria_pendencias SET status = 'CANCELADA', decididoEm = ? WHERE id = ? AND unidadeId = ? AND solicitanteId = ? AND status = 'PENDENTE'`, agora(), String(req.params.id), tenant(req), req.sessao!.uid);
  if (!out.changes) throw bad('Solicitação pendente não encontrada', 404);
  return { ok: true };
}));
export default r;
