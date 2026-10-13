import crypto from 'crypto';
import { db, uid } from './db';
import { hashSenha } from './auth';
import { garantirPlanos } from './billing';

/** Cria a sede (IELB Castelo Forte) e o super admin na primeira execução. */
export async function seed() {
  await garantirPlanos();
  if (await db.get('SELECT 1 AS x FROM unidades WHERE isSede = 1')) return;
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@castelofortesaas.local').toLowerCase();
  const gerada = !process.env.SEED_ADMIN_PASSWORD;
  if (gerada && (process.env.VERCEL || process.env.NODE_ENV === 'production'))
    throw new Error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (a senha do administrador da sede) antes do primeiro acesso: em produção ela não é gerada nem exibida.');
  const senha = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const sedeId = uid('un');
  await db.tx(async c => {
    await c.run(`INSERT INTO unidades (id,nome,tipo,distrito,status,isSede) VALUES (?,?,?,?,?,1)`, sedeId, 'IELB Castelo Forte', 'PAROQUIA', 'Sede', 'ATIVA');
    await c.run('INSERT INTO usuarios (id,unidadeId,nome,email,senhaHash,role) VALUES (?,?,?,?,?,?)', uid('u'), null, 'Administração Castelo Forte', email, hashSenha(senha), 'SUPER_ADMIN');
  });
  console.log(`\n[seed] Super admin criado: ${email}${gerada ? `  senha: ${senha}  (anote — não será exibida novamente)` : ''}\n`);
}
