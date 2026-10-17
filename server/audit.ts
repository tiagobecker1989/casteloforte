import type { Request } from 'express';
import { db, uid, agora, type Conn } from './db';

/** Trilha de auditoria (LGPD art. 37: registro das operações com dados pessoais). Nunca grava dados pessoais no detalhe. */
export async function auditar(req: Request | null, acao: string, entidade: string, entidadeId?: string | null, detalhe?: string, c: Conn = db, unidadeId?: string | null) {
  await c.run('INSERT INTO auditoria (id,unidadeId,usuarioId,acao,entidade,entidadeId,detalhe,criadoEm) VALUES (?,?,?,?,?,?,?,?)',
    uid('au'), unidadeId ?? req?.sessao?.unidadeId ?? null, req?.sessao?.uid ?? null, acao, entidade, entidadeId ?? null, detalhe ?? null, agora());
}
