import type { Conn } from './db';

export const CARGOS = ['PRESIDENTE','VICE_PRESIDENTE','SECRETARIO','VICE_SECRETARIO','TESOUREIRO','VICE_TESOUREIRO','CONSELHEIRO','VICE_CONSELHEIRO','FISCAL_1','FISCAL_2','FISCAL_3'];

/** Tira o membro de qualquer cargo (limpa a ficha e a linha da diretoria). */
export async function liberarCargoDoMembro(c: Conn, unidadeId: string, membroId: string) {
  await c.run('DELETE FROM diretoria WHERE unidadeId = ? AND membroId = ?', unidadeId, membroId);
  await c.run('UPDATE membros SET temCargo = 0, cargoDiretoria = NULL WHERE unidadeId = ? AND id = ?', unidadeId, membroId);
}

/**
 * Fonte única da regra "um cargo ↔ uma pessoa". Usada pela tela da Diretoria e pela ficha do membro,
 * para as duas visões nunca divergirem.
 */
export async function atribuirCargo(c: Conn, unidadeId: string, cargo: string,
  p: { membroId?: string | null; nome: string; telefone?: string | null; email?: string | null }) {
  const atual = await c.get('SELECT membroId FROM diretoria WHERE unidadeId = ? AND cargo = ?', unidadeId, cargo);
  // quem ocupava o cargo antes perde a marcação na ficha
  if (atual?.membroId && atual.membroId !== p.membroId)
    await c.run('UPDATE membros SET temCargo = 0, cargoDiretoria = NULL WHERE unidadeId = ? AND id = ?', unidadeId, atual.membroId);
  if (p.membroId) {
    // um membro ocupa um único cargo
    await c.run('DELETE FROM diretoria WHERE unidadeId = ? AND membroId = ? AND cargo <> ?', unidadeId, p.membroId, cargo);
    await c.run('UPDATE membros SET temCargo = 1, cargoDiretoria = ? WHERE unidadeId = ? AND id = ?', cargo, unidadeId, p.membroId);
  }
  await c.run(`INSERT INTO diretoria (unidadeId,cargo,membroId,nome,telefone,email) VALUES (?,?,?,?,?,?)
    ON CONFLICT (unidadeId, cargo) DO UPDATE SET membroId = excluded.membroId, nome = excluded.nome, telefone = excluded.telefone, email = excluded.email`,
    unidadeId, cargo, p.membroId ?? null, p.nome, p.telefone ?? null, p.email ?? null);
}

export async function removerCargo(c: Conn, unidadeId: string, cargo: string) {
  await c.run('UPDATE membros SET temCargo = 0, cargoDiretoria = NULL WHERE unidadeId = ? AND cargoDiretoria = ?', unidadeId, cargo);
  await c.run('DELETE FROM diretoria WHERE unidadeId = ? AND cargo = ?', unidadeId, cargo);
}

/** Chamado após salvar um membro: alinha a Diretoria com o que está marcado na ficha. */
export async function sincronizarDiretoria(c: Conn, unidadeId: string, m: any) {
  const desligado = m.anonimizadoEm || ['TRANSFERIDO', 'FALECIDO'].includes(m.status);
  if (desligado) { await liberarCargoDoMembro(c, unidadeId, m.id); return; }
  const cargo = m.temCargo && CARGOS.includes(m.cargoDiretoria) ? m.cargoDiretoria : null;
  if (cargo) { await atribuirCargo(c, unidadeId, cargo, { membroId: m.id, nome: m.nome, telefone: m.telefone, email: m.email }); return; }
  if (!m.temCargo) await liberarCargoDoMembro(c, unidadeId, m.id); // desmarcou o cargo na ficha
}
