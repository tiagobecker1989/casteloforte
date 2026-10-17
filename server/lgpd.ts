import { Router } from 'express';
import { db, uid, agora } from './db';
import { exigirRole, exigirPerm, temPerm, tenant } from './auth';
import { wrap, bad, str } from './http';
import { auditar } from './audit';
import { TEXTOS, VERSAO_LEGAL } from './legal';
import { liberarCargoDoMembro } from './diretoria';

/** Textos legais (públicos). */
export const legalPublico = Router();
legalPublico.get('/legal', wrap(() => ({ versao: VERSAO_LEGAL, ...TEXTOS })));

const PRIV = ['membros.privacidade'];
const lgpd = Router();

// Registro/revogação de consentimento na ficha do membro
lgpd.put('/membros/:id/consentimento', exigirPerm(...PRIV), wrap(async req => {
  const t = tenant(req), id = String(req.params.id), dar = req.body?.consentido !== false;
  const r = await db.run('UPDATE membros SET consentimentoEm = ?, consentimentoObs = ? WHERE id = ? AND unidadeId = ? AND anonimizadoEm IS NULL',
    dar ? agora() : null, dar ? str(req.body?.obs, 300) : null, id, t);
  if (!r.changes) throw bad('Membro não encontrado', 404);
  await auditar(req, dar ? 'CONSENTIMENTO_REGISTRADO' : 'CONSENTIMENTO_REVOGADO', 'membro', id);
  return { ok: true };
}));

// Portabilidade/acesso: exporta a ficha completa do membro
lgpd.get('/membros/:id/exportar', exigirPerm(...PRIV), wrap(async req => {
  const t = tenant(req), id = String(req.params.id);
  const m = await db.get('SELECT * FROM membros WHERE id = ? AND unidadeId = ?', id, t);
  if (!m) throw bad('Membro não encontrado', 404);
  const cargo = await db.get('SELECT cargo FROM diretoria WHERE unidadeId = ? AND membroId = ?', t, id);
  await auditar(req, 'EXPORTAR', 'membro', id);
  return { exportadoEm: agora(), membro: { ...m, temCargo: !!m.temCargo }, cargoNaDiretoria: cargo?.cargo ?? null };
}));

// Anonimização irreversível (direito do titular / fim da finalidade)
lgpd.post('/membros/:id/anonimizar', exigirPerm(...PRIV), wrap(async req => {
  if (req.body?.confirmar !== true) throw bad('Confirmação obrigatória (confirmar: true). Esta ação é irreversível.');
  const t = tenant(req), id = String(req.params.id);
  await db.tx(async c => {
    const m = await c.get('SELECT status FROM membros WHERE id = ? AND unidadeId = ?', id, t);
    if (!m) throw bad('Membro não encontrado', 404);
    if (!temPerm(req, 'diretoria.direto') && await c.get('SELECT 1 AS x FROM diretoria WHERE unidadeId = ? AND membroId = ?', t, id))
      throw bad('Este membro ocupa um cargo na diretoria. Peça ao presidente para remover o vínculo (pela tela Diretoria) antes de anonimizar.', 409);
    await liberarCargoDoMembro(c, t, id);
    await c.run(`UPDATE membros SET nome = 'Membro anonimizado', telefone = NULL, email = NULL, endereco = NULL, profissao = NULL, familiares = NULL,
      temCargo = 0, cargoDiretoria = NULL, consentimentoEm = NULL, consentimentoObs = NULL, anonimizadoEm = ?, status = ?
      WHERE id = ? AND unidadeId = ?`, agora(), m.status === 'FALECIDO' ? 'FALECIDO' : 'INATIVO', id, t);
    await auditar(req, 'ANONIMIZAR', 'membro', id, null as any, c);
  });
  return { ok: true };
}));

// Cópia completa dos dados da paróquia (portabilidade / encerramento)
lgpd.get('/paroquia/exportar', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const t = tenant(req);
  const tab = (n: string) => db.all(`SELECT * FROM ${n} WHERE unidadeId = ?`, t);
  await auditar(req, 'EXPORTAR', 'paroquia', t);
  return {
    exportadoEm: agora(),
    paroquia: await db.get('SELECT id,nome,tipo,distrito,pastores,endereco,contato,criadoEm FROM unidades WHERE id = ?', t),
    membros: await tab('membros'), diretoria: await tab('diretoria'), lancamentos: await tab('lancamentos'),
    departamentos: await tab('departamentos'), eventos: await tab('eventos'),
    usuarios: await db.all('SELECT id,nome,email,role,ativo,criadoEm FROM usuarios WHERE unidadeId = ?', t),
    faturas: await tab('faturas'),
  };
}));

// Trilha de auditoria da paróquia
lgpd.get('/auditoria', exigirRole('ADMIN_PAROQUIA'), wrap(async req => {
  const t = tenant(req);
  return db.all(`SELECT a.id, a.acao, a.entidade, a.entidadeId, a.detalhe, a.criadoEm, u.nome AS usuario
    FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuarioId WHERE a.unidadeId = ? ORDER BY a.criadoEm DESC LIMIT 200`, t);
}));

export default lgpd;
