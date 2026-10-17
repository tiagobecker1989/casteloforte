import path from 'path';
import fs from 'fs';

/**
 * Camada de dados com dois motores:
 *  - SQLite (padrão, `node:sqlite`): bom para desenvolvimento e poucas paróquias.
 *  - PostgreSQL (`DATABASE_URL=postgres://...`): produção/escala.
 *  - PGlite (`USE_PGLITE=1`): Postgres em memória, usado nos testes automatizados.
 * O SQL é escrito uma vez (placeholders `?`, colunas em camelCase) e adaptado por motor.
 */
export interface Conn {
  all<T = any>(sql: string, ...p: any[]): Promise<T[]>;
  get<T = any>(sql: string, ...p: any[]): Promise<T | undefined>;
  run(sql: string, ...p: any[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
}
export interface Database extends Conn {
  dialect: 'sqlite' | 'pg';
  tx<T>(fn: (c: Conn) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// ---- adaptação de SQL para Postgres (fora de literais 'texto') ----
function adaptPg(sql: string): string {
  let n = 0;
  return sql
    .split(/('(?:[^']|'')*')/)
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // literal
      return seg
        .replace(/\b[a-z]+[A-Z][A-Za-z]*\b/g, '"$&"') // camelCase -> "camelCase"
        .replace(/\?/g, () => `$${++n}`)
        .replace(/\bLIKE\b/g, 'ILIKE');
    })
    .join('');
}
const clean = (p: any[]) => p.map(v => (v === undefined ? null : v));

async function sqliteDriver(file: string): Promise<Database> {
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const conn: Conn = {
    all: async (sql, ...p) => raw.prepare(sql).all(...clean(p)) as any[],
    get: async (sql, ...p) => raw.prepare(sql).get(...clean(p)) as any,
    run: async (sql, ...p) => ({ changes: Number(raw.prepare(sql).run(...clean(p)).changes) }),
    exec: async sql => { raw.exec(sql); },
  };
  // Obs.: as chamadas SQLite são síncronas por baixo; dentro de uma transação só há awaits de
  // promessas já resolvidas, então outra requisição não consegue intercalar comandos.
  let fila: Promise<unknown> = Promise.resolve();
  return {
    ...conn,
    dialect: 'sqlite',
    tx: fn => {
      const exec = fila.then(async () => {
        raw.exec('BEGIN');
        try { const r = await fn(conn); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; }
      });
      fila = exec.catch(() => undefined);
      return exec as Promise<any>;
    },
    close: async () => { raw.close(); },
  };
}

type Queryable = { query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount?: number | null; affectedRows?: number }> };
const pgConn = (c: Queryable): Conn => ({
  all: async (sql, ...p) => (await c.query(adaptPg(sql), clean(p))).rows,
  get: async (sql, ...p) => (await c.query(adaptPg(sql), clean(p))).rows[0],
  run: async (sql, ...p) => { const r = await c.query(adaptPg(sql), clean(p)); return { changes: r.rowCount ?? r.affectedRows ?? 0 }; },
  exec: async sql => { const x: any = c; await (typeof x.exec === 'function' ? x.exec(adaptPg(sql)) : x.query(adaptPg(sql))); }, // PGlite precisa de exec() para múltiplos comandos
});

/** Neon (e Vercel+Neon) entregam a URL em DATABASE_URL (pooled) ou POSTGRES_URL. Remove parâmetros que o driver pg não usa. */
function urlPostgres(): string | undefined {
  const bruta = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!bruta || !/^postgres(ql)?:\/\//.test(bruta)) return undefined;
  try { const u = new URL(bruta); u.searchParams.delete('channel_binding'); return u.toString(); } catch { return bruta; }
}

async function pgDriver(url: string): Promise<Database> {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, v => parseInt(v, 10)); // bigint (COUNT) -> number
  const serverless = !!process.env.VERCEL;
  const pool = new pg.Pool({
    connectionString: url,
    ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
    // Neon pooled (PgBouncer) já multiplexa; aqui só limitamos conexões por instância da função.
    max: serverless ? 5 : 10,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on('error', e => console.error('[pg] conexão ociosa falhou:', e.message));
  return {
    ...pgConn(pool),
    dialect: 'pg',
    tx: async fn => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const r = await fn(pgConn(client)); await client.query('COMMIT'); return r; }
      catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

async function pgliteDriver(): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const lite: any = new PGlite();
  return {
    ...pgConn(lite),
    dialect: 'pg',
    tx: fn => lite.transaction((t: any) => fn(pgConn(t))),
    close: () => lite.close(),
  };
}

async function open(): Promise<Database> {
  if (process.env.USE_PGLITE) return pgliteDriver();
  const url = urlPostgres();
  if (url) return pgDriver(url);
  if (process.env.VERCEL) throw new Error('DATABASE_URL não configurada. Na Vercel é obrigatório informar a connection string do Neon (a "pooled").');
  const dir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return sqliteDriver(path.join(dir, 'ielb.db'));
}

export const db: Database = await open();

const NOW = db.dialect === 'pg' ? `to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')` : `datetime('now')`;

// Multi-tenant: toda tabela de negócio carrega "unidadeId" (a paróquia/tenant).
// Versão do esquema: aumente ao alterar tabelas. Em produção o banco só é tocado se a versão mudou.
const SCHEMA_VERSAO = '7';

async function ensureColumn(c: Conn, table: string, col: string, type: string) {
  const cols = db.dialect === 'sqlite'
    ? (await c.all(`PRAGMA table_info(${table})`)).map((x: any) => x.name)
    : (await c.all(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?`, table)).map((x: any) => x.name);
  if (!cols.includes(col)) await c.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}

async function migrar(c: Conn) {
await c.exec(`
  CREATE TABLE IF NOT EXISTS unidades (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'PAROQUIA',
    distrito TEXT NOT NULL DEFAULT '',
    pastores TEXT NOT NULL DEFAULT '[]',
    endereco TEXT, contato TEXT,
    status TEXT NOT NULL DEFAULT 'PENDENTE',
    isSede INTEGER NOT NULL DEFAULT 0,
    cpfCnpj TEXT, asaasCustomerId TEXT,
    diaOferta INTEGER NOT NULL DEFAULT 10,
    criadoEm TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    unidadeId TEXT REFERENCES unidades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senhaHash TEXT NOT NULL,
    role TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    tokenVersao INTEGER NOT NULL DEFAULT 0,
    permissoes TEXT,
    criadoEm TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE TABLE IF NOT EXISTS membros (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ATIVO',
    dataBatismo TEXT, dataConfirmacao TEXT, ultimaComunhao TEXT, ultimaPresenca TEXT, ultimaOferta TEXT,
    pontuacaoEngajamento INTEGER NOT NULL DEFAULT 50,
    telefone TEXT, email TEXT, endereco TEXT, profissao TEXT, familiares TEXT,
    temCargo INTEGER NOT NULL DEFAULT 0,
    cargoDiretoria TEXT,
    consentimentoEm TEXT, consentimentoObs TEXT, anonimizadoEm TEXT,
    dataNascimento TEXT, ofertaMensalValor DOUBLE PRECISION
  );
  CREATE INDEX IF NOT EXISTS idx_membros_un ON membros(unidadeId, nome);
  CREATE TABLE IF NOT EXISTS diretoria (
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    cargo TEXT NOT NULL,
    membroId TEXT REFERENCES membros(id) ON DELETE SET NULL,
    nome TEXT NOT NULL, telefone TEXT, email TEXT,
    PRIMARY KEY (unidadeId, cargo)
  );
  CREATE TABLE IF NOT EXISTS lancamentos (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, categoria TEXT NOT NULL, valor DOUBLE PRECISION NOT NULL, data TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '',
    membroId TEXT, competencia TEXT, forma TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_lanc_un ON lancamentos(unidadeId, data);
  CREATE TABLE IF NOT EXISTS departamentos (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL, membrosCount INTEGER NOT NULL DEFAULT 0, lider TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS eventos (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'OUTRO', data TEXT NOT NULL, horario TEXT NOT NULL DEFAULT '', descricao TEXT
  );
  CREATE TABLE IF NOT EXISTS cotas_globais (
    id TEXT PRIMARY KEY, nome TEXT NOT NULL, percent DOUBLE PRECISION NOT NULL, ordem INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS cotas_paroquia (
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    cotaId TEXT NOT NULL REFERENCES cotas_globais(id) ON DELETE CASCADE,
    percent DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (unidadeId, cotaId)
  );
  CREATE TABLE IF NOT EXISTS repasses (
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    competencia TEXT NOT NULL,
    valorDevido DOUBLE PRECISION NOT NULL,
    valorPago DOUBLE PRECISION NOT NULL,
    pagoEm TEXT NOT NULL,
    obs TEXT,
    PRIMARY KEY (unidadeId, competencia)
  );
  CREATE TABLE IF NOT EXISTS reset_senha (
    tokenHash TEXT PRIMARY KEY,
    usuarioId TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expiraEm TEXT NOT NULL,
    usadoEm TEXT
  );
  CREATE TABLE IF NOT EXISTS aceites (
    id TEXT PRIMARY KEY,
    usuarioId TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, versao TEXT NOT NULL, aceitoEm TEXT NOT NULL, ip TEXT
  );
  CREATE TABLE IF NOT EXISTS auditoria (
    id TEXT PRIMARY KEY,
    unidadeId TEXT, usuarioId TEXT,
    acao TEXT NOT NULL, entidade TEXT NOT NULL, entidadeId TEXT, detalhe TEXT,
    criadoEm TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_aud_un ON auditoria(unidadeId, criadoEm);
  CREATE TABLE IF NOT EXISTS planos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    precoMensal DOUBLE PRECISION NOT NULL DEFAULT 0,
    limiteMembros INTEGER,
    limiteUsuarios INTEGER,
    ativo INTEGER NOT NULL DEFAULT 1,
    ordem INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS assinaturas (
    unidadeId TEXT PRIMARY KEY REFERENCES unidades(id) ON DELETE CASCADE,
    planoId TEXT NOT NULL REFERENCES planos(id),
    status TEXT NOT NULL DEFAULT 'TRIAL',
    trialAte TEXT,
    criadoEm TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS faturas (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    competencia TEXT NOT NULL,
    planoId TEXT NOT NULL,
    valor DOUBLE PRECISION NOT NULL,
    vencimento TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ABERTA',
    pagoEm TEXT, meio TEXT, gatewayRef TEXT, asaasPaymentId TEXT, linkPagamento TEXT,
    criadoEm TEXT NOT NULL,
    UNIQUE (unidadeId, competencia)
  );
  `);
  await c.exec(`
  CREATE TABLE IF NOT EXISTS parentescos (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    membroAId TEXT NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
    membroBId TEXT NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    UNIQUE (membroAId, membroBId)
  );
  CREATE TABLE IF NOT EXISTS topicos (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'SAIDA',
    ativo INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS banco_transacoes (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    fonte TEXT NOT NULL,
    chave TEXT NOT NULL,
    data TEXT NOT NULL,
    valor DOUBLE PRECISION NOT NULL,
    tipo TEXT NOT NULL,
    nome TEXT, descricao TEXT,
    status TEXT NOT NULL DEFAULT 'PENDENTE',
    lancamentoId TEXT,
    criadoEm TEXT NOT NULL,
    UNIQUE (unidadeId, chave)
  );
  CREATE INDEX IF NOT EXISTS idx_banco_un ON banco_transacoes(unidadeId, data);
  CREATE TABLE IF NOT EXISTS banco_config (
    unidadeId TEXT PRIMARY KEY REFERENCES unidades(id) ON DELETE CASCADE,
    dados TEXT NOT NULL,
    chavePix TEXT,
    ultimaSincronizacao TEXT
  );`);
  await c.exec(`
  CREATE TABLE IF NOT EXISTS documentos (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    tamanho INTEGER NOT NULL,
    conteudo TEXT NOT NULL,
    descricao TEXT,
    enviadoPor TEXT,
    enviadoEm TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_doc_un ON documentos(unidadeId, enviadoEm);
  CREATE TABLE IF NOT EXISTS diretoria_pendencias (
    id TEXT PRIMARY KEY,
    unidadeId TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    solicitanteId TEXT NOT NULL,
    cargo TEXT NOT NULL,
    acao TEXT NOT NULL,
    membroId TEXT,
    nome TEXT, telefone TEXT, email TEXT,
    status TEXT NOT NULL DEFAULT 'PENDENTE',
    criadoEm TEXT NOT NULL,
    decididoEm TEXT, decididoPor TEXT, motivo TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pend_un ON diretoria_pendencias(unidadeId, status);`);
  await c.exec(`CREATE TABLE IF NOT EXISTS limites (chave TEXT PRIMARY KEY, n INTEGER NOT NULL, ate DOUBLE PRECISION NOT NULL)`);
  // Migração para bancos criados em versões anteriores
  await ensureColumn(c, 'usuarios', 'tokenVersao', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(c, 'membros', 'consentimentoEm', 'TEXT');
  await ensureColumn(c, 'membros', 'consentimentoObs', 'TEXT');
  await ensureColumn(c, 'membros', 'anonimizadoEm', 'TEXT');
  await ensureColumn(c, 'unidades', 'cpfCnpj', 'TEXT');
  await ensureColumn(c, 'unidades', 'asaasCustomerId', 'TEXT');
  await ensureColumn(c, 'faturas', 'asaasPaymentId', 'TEXT');
  await ensureColumn(c, 'faturas', 'linkPagamento', 'TEXT');
  await ensureColumn(c, 'usuarios', 'permissoes', 'TEXT');
  await ensureColumn(c, 'membros', 'dataNascimento', 'TEXT');
  await ensureColumn(c, 'membros', 'ofertaMensalValor', 'DOUBLE PRECISION');
  await ensureColumn(c, 'unidades', 'diaOferta', 'INTEGER NOT NULL DEFAULT 10');
  await ensureColumn(c, 'lancamentos', 'membroId', 'TEXT');
  await ensureColumn(c, 'lancamentos', 'competencia', 'TEXT');
  await ensureColumn(c, 'lancamentos', 'forma', 'TEXT');
  await c.run(`INSERT INTO schema_versao (id, versao) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET versao = excluded.versao`, SCHEMA_VERSAO);
}

async function versaoAtual(): Promise<string | undefined> {
  try { return (await db.get('SELECT versao FROM schema_versao WHERE id = 1'))?.versao; } catch { return undefined; } // tabela ainda não existe
}

/** Garante o esquema. Seguro para várias instâncias subindo juntas (lock consultivo no Postgres). */
export async function garantirEsquema() {
  if ((await versaoAtual()) === SCHEMA_VERSAO) return;
  await db.tx(async c => {
    if (db.dialect === 'pg') await c.get('SELECT pg_advisory_xact_lock(727274)');
    await c.exec('CREATE TABLE IF NOT EXISTS schema_versao (id INTEGER PRIMARY KEY, versao TEXT NOT NULL)');
    const v = await c.get('SELECT versao FROM schema_versao WHERE id = 1');
    if (v?.versao !== SCHEMA_VERSAO) await migrar(c);
  });
}
await garantirEsquema();

export const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const agora = () => new Date().toISOString();
