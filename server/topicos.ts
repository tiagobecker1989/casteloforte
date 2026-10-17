import { Router } from 'express';
import { db, uid } from './db';
import { exigirPerm, tenant } from './auth';
import { wrap, bad, str } from './http';
import { FIXAS } from './categorias';
import { norm } from './nomes';

const r = Router();
const VER = ['despesas.ver', 'conciliacao.ver'];
const GERIR = ['despesas.criar'];

r.get('/topicos', exigirPerm(...VER), wrap(async req => ({
  fixos: FIXAS,
  personalizados: (await db.all('SELECT id, nome, tipo, ativo FROM topicos WHERE unidadeId = ? ORDER BY nome', tenant(req))).map(t => ({ ...t, codigo: `TOPICO:${t.id}`, ativo: !!t.ativo })),
})));
r.post('/topicos', exigirPerm(...GERIR), wrap(async (req, res) => {
  const t = tenant(req), nome = str(req.body?.nome, 60), tipo = req.body?.tipo === 'ENTRADA' ? 'ENTRADA' : 'SAIDA';
  if (!nome || nome.length < 2) throw bad('Informe o nome do tópico');
  const iguais = [...FIXAS.map(f => f.label), ...(await db.all('SELECT nome FROM topicos WHERE unidadeId = ?', t)).map(x => x.nome)];
  if (iguais.some(n => norm(n) === norm(nome))) throw bad('Já existe um tópico com esse nome', 409);
  const id = uid('tp');
  await db.run('INSERT INTO topicos (id,unidadeId,nome,tipo,ativo) VALUES (?,?,?,?,1)', id, t, nome, tipo);
  res.status(201).json({ id, codigo: `TOPICO:${id}` });
}));
r.patch('/topicos/:id', exigirPerm(...GERIR), wrap(async req => {
  const b = req.body || {}, nome = b.nome === undefined ? null : str(b.nome, 60);
  if (nome !== null && nome.length < 2) throw bad('Nome inválido');
  const out = await db.run('UPDATE topicos SET nome = COALESCE(?, nome), ativo = COALESCE(?, ativo) WHERE id = ? AND unidadeId = ?', nome, b.ativo === undefined ? null : (b.ativo ? 1 : 0), String(req.params.id), tenant(req));
  if (!out.changes) throw bad('Tópico não encontrado', 404);
  return { ok: true };
}));
export default r;
