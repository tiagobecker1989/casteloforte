import express, { Router } from 'express';
import WordExtractor from 'word-extractor';
import { db, uid, agora } from './db';
import { exigirPerm, tenant } from './auth';
import { wrap, bad, str } from './http';
import { auditar } from './audit';

/**
 * Arquivos importados pela paróquia (.doc, .docx, .pdf) com visualização no sistema.
 * Ficam no próprio banco (texto base64), por isso há limite de tamanho (4 MB, o teto de corpo da Vercel é 4,5 MB)
 * e de quantidade por paróquia. Para volumes maiores, o ideal é um armazenamento de arquivos (S3/Vercel Blob).
 */
const MAX_BYTES = 4 * 1024 * 1024, MAX_DOCS = 100;
const MIME: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword' };

/** Confere o conteúdo real do arquivo (não só a extensão). */
function tipoPeloConteudo(b: Buffer): 'pdf' | 'docx' | 'doc' | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return b.includes('word/') ? 'docx' : null; // zip com pasta word/
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'doc';           // OLE2
  return null;
}
const nomeSeguro = (n: string) => n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 150);

const r = Router();
r.get('/documentos', exigirPerm('arquivos.ver'), wrap(async req =>
  db.all('SELECT d.id, d.nome, d.tipo, d.tamanho, d.descricao, d.enviadoEm, u.nome AS enviadoPor FROM documentos d LEFT JOIN usuarios u ON u.id = d.enviadoPor WHERE d.unidadeId = ? ORDER BY d.enviadoEm DESC', tenant(req))));

// Envio: corpo binário (application/octet-stream); nome e descrição vão na URL
r.post('/documentos', exigirPerm('arquivos.criar'), express.raw({ type: () => true, limit: '4.5mb' }), wrap(async (req, res) => {
  const t = tenant(req), buf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const nome = nomeSeguro(String(req.query.nome ?? ''));
  if (!nome) throw bad('Informe o nome do arquivo');
  if (!buf.length) throw bad('Arquivo vazio');
  if (buf.length > MAX_BYTES) throw bad('O arquivo passa de 4 MB. Reduza o tamanho ou divida o documento.', 413);
  const ext = (nome.split('.').pop() || '').toLowerCase(), tipo = tipoPeloConteudo(buf);
  if (!['pdf', 'docx', 'doc'].includes(ext)) throw bad('Formato não suportado. Envie arquivos .doc, .docx ou .pdf.');
  if (tipo !== ext) throw bad('O conteúdo do arquivo não corresponde à extensão informada (ou o arquivo está corrompido).');
  if ((await db.get('SELECT COUNT(*) AS n FROM documentos WHERE unidadeId = ?', t))!.n >= MAX_DOCS) throw bad(`Limite de ${MAX_DOCS} arquivos por paróquia atingido. Exclua algum antes de enviar outro.`, 409);
  const id = uid('dc');
  await db.tx(async c => {
    await c.run('INSERT INTO documentos (id,unidadeId,nome,tipo,tamanho,conteudo,descricao,enviadoPor,enviadoEm) VALUES (?,?,?,?,?,?,?,?,?)', id, t, nome, tipo, buf.length, buf.toString('base64'), str(req.query.descricao, 200), req.sessao!.uid, agora());
    await auditar(req, 'DOCUMENTO_ENVIADO', 'documento', id, tipo, c);
  });
  res.status(201).json({ id });
}));

async function carregar(req: express.Request) {
  const d = await db.get('SELECT id, nome, tipo, conteudo FROM documentos WHERE id = ? AND unidadeId = ?', String(req.params.id), tenant(req));
  if (!d) throw bad('Arquivo não encontrado', 404);
  return { ...d, buf: Buffer.from(d.conteudo, 'base64') };
}

r.get('/documentos/:id/arquivo', exigirPerm('arquivos.ver'), wrap(async (req, res) => {
  const d = await carregar(req);
  await auditar(req, 'DOCUMENTO_ABERTO', 'documento', d.id);
  res.setHeader('Content-Type', MIME[d.tipo] ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.nome)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(d.buf);
}));

// Texto de arquivos .doc (formato antigo, que o navegador não abre)
r.get('/documentos/:id/texto', exigirPerm('arquivos.ver'), wrap(async req => {
  const d = await carregar(req);
  if (d.tipo !== 'doc') throw bad('A leitura de texto no servidor é só para arquivos .doc');
  try { const doc = await new WordExtractor().extract(d.buf); return { texto: doc.getBody() }; }
  catch { throw bad('Não foi possível ler este arquivo .doc. Baixe o original para abri-lo no Word.', 422); }
}));

// Edição dos dados da ata (nome e descrição). O conteúdo do arquivo não muda; para trocar o arquivo, exclua e importe de novo.
r.patch('/documentos/:id', exigirPerm('arquivos.editar'), wrap(async req => {
  const t = tenant(req), id = String(req.params.id), b = req.body || {};
  const d = await db.get('SELECT tipo FROM documentos WHERE id = ? AND unidadeId = ?', id, t);
  if (!d) throw bad('Arquivo não encontrado', 404);
  let nome: string | null = null;
  if (b.nome !== undefined) {
    nome = nomeSeguro(String(b.nome));
    if (!nome) throw bad('Informe o nome do arquivo');
    if (!nome.toLowerCase().endsWith(`.${d.tipo}`)) nome = `${nome}.${d.tipo}`; // mantém a extensão coerente com o conteúdo
  }
  const descricao = b.descricao === undefined ? undefined : str(b.descricao, 200);
  await db.run('UPDATE documentos SET nome = COALESCE(?, nome), descricao = ? WHERE id = ? AND unidadeId = ?', nome, descricao === undefined ? (await db.get('SELECT descricao FROM documentos WHERE id = ?', id))!.descricao : descricao, id, t);
  await auditar(req, 'DOCUMENTO_EDITADO', 'documento', id);
  return { ok: true };
}));

r.delete('/documentos/:id', exigirPerm('arquivos.excluir'), wrap(async req => {
  const t = tenant(req), id = String(req.params.id);
  const out = await db.run('DELETE FROM documentos WHERE id = ? AND unidadeId = ?', id, t);
  if (!out.changes) throw bad('Arquivo não encontrado', 404);
  await auditar(req, 'DOCUMENTO_EXCLUIDO', 'documento', id);
  return { ok: true };
}));
export default r;
