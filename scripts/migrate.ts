// Cria/atualiza o esquema do banco. Roda no build da Vercel (e à mão: npm run db:migrate).
// Para DDL a Neon recomenda a conexão DIRETA (DATABASE_URL_UNPOOLED); se não houver, usa a pooled.
const direta = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
if (direta) process.env.DATABASE_URL = direta;

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.USE_PGLITE) {
  if (process.env.VERCEL) { console.warn('[migrate] DATABASE_URL ausente neste build: esquema NÃO verificado (a função cria no 1º acesso).'); process.exit(0); }
}
const { db } = await import('../server/db'); // importar já garante o esquema
console.log(`[migrate] esquema ok (${db.dialect})`);
await db.close();
