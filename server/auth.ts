import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { matrizEfetiva, paraConjunto } from './permissoes';

export type Role = 'SUPER_ADMIN' | 'ADMIN_PAROQUIA' | 'PASTOR' | 'TESOUREIRO' | 'SECRETARIA';
export interface Sessao { uid: string; unidadeId: string | null; role: Role; nome: string; v: number; exp: number; perm?: Set<string> }

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) throw new Error('JWT_SECRET é obrigatório em produção');
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, salt, 64);
  return `${b64(salt)}.${b64(h)}`;
}
export function conferirSenha(senha: string, stored: string): boolean {
  const [s, h] = stored.split('.');
  if (!s || !h) return false;
  const calc = crypto.scryptSync(senha, Buffer.from(s, 'base64url'), 64);
  const ref = Buffer.from(h, 'base64url');
  return calc.length === ref.length && crypto.timingSafeEqual(calc, ref);
}

export function assinar(s: Omit<Sessao, 'exp'>, horas = 12): string {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + horas * 3600 }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verificar(token: string): Sessao | null {
  const [h, b, sig] = token.split('.');
  if (!h || !b || !sig) return null;
  const esperado = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest();
  const recebido = Buffer.from(sig, 'base64url');
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString()) as Sessao;
  return p.exp > Date.now() / 1000 ? p : null;
}

declare global { namespace Express { interface Request { sessao?: Sessao } } }

/** Valida o token E o estado atual do usuário/paróquia (desativação e troca de senha valem na hora). */
export async function exigirLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '');
    const s = t ? verificar(t) : null;
    if (!s) return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    const u = await db.get('SELECT nome, role, unidadeId, ativo, tokenVersao, permissoes FROM usuarios WHERE id = ?', s.uid);
    if (!u || !u.ativo || u.tokenVersao !== s.v) return res.status(401).json({ error: 'Sessão inválida ou expirada' });
    if (u.unidadeId) {
      const un = await db.get('SELECT status FROM unidades WHERE id = ?', u.unidadeId);
      if (un?.status !== 'ATIVA') return res.status(403).json({ error: 'Paróquia sem acesso ativo. Entre em contato com a sede.' });
    }
    req.sessao = { ...s, role: u.role, unidadeId: u.unidadeId, nome: u.nome, perm: paraConjunto(matrizEfetiva(u.role, u.permissoes)) };
    next();
  } catch (e) { next(e); }
}
/** Exige UMA das permissões "<tela>.<ação>" (o presidente tem todas). */
export const exigirPerm = (...chaves: string[]) => (req: Request, res: Response, next: NextFunction) =>
  req.sessao && (req.sessao.role === 'ADMIN_PAROQUIA' || chaves.some(k => req.sessao!.perm?.has(k))) ? next() : res.status(403).json({ error: 'Sem permissão' });
export const temPerm = (req: Request, chave: string) => req.sessao?.role === 'ADMIN_PAROQUIA' || !!req.sessao?.perm?.has(chave);

export const exigirRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) =>
  req.sessao && roles.includes(req.sessao.role) ? next() : res.status(403).json({ error: 'Sem permissão' });

/** Tenant da requisição: SEMPRE vem do token, nunca do corpo/query. */
export function tenant(req: Request): string {
  const id = req.sessao?.unidadeId;
  if (!id) throw Object.assign(new Error('Usuário sem paróquia'), { status: 403 });
  return id;
}

/** IP do cliente. Na Vercel, x-forwarded-for/x-real-ip são definidos pela plataforma (não falsificáveis pelo cliente). */
export function ipDe(req: Request): string {
  if (process.env.VERCEL) {
    const h = (req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '') as string;
    const ip = String(h).split(',')[0].trim();
    if (ip) return ip;
  }
  return req.ip || 'desconhecido';
}

/**
 * Limites de tentativas guardados NO BANCO (em serverless a memória não é compartilhada entre instâncias).
 * Uma linha por chave (rota+IP); a janela reinicia quando expira.
 */
async function contar(chave: string, janelaMs: number): Promise<number> {
  const agora = Date.now(), fim = agora + janelaMs;
  const r = await db.get(`INSERT INTO limites (chave, n, ate) VALUES (?, 1, ?)
    ON CONFLICT (chave) DO UPDATE SET n = CASE WHEN limites.ate < ? THEN 1 ELSE limites.n + 1 END, ate = CASE WHEN limites.ate < ? THEN ? ELSE limites.ate END
    RETURNING n`, chave, fim, agora, agora, fim);
  return r?.n ?? 1;
}
export async function limparLimites() { await db.run('DELETE FROM limites WHERE ate < ?', Date.now()); }

// Login: só tentativas que falham (401) contam; após 8 falhas em 10 minutos, bloqueia.
export async function limitarLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const chave = `login:${ipDe(req)}`;
    const t = await db.get('SELECT n, ate FROM limites WHERE chave = ?', chave);
    if (t && t.n >= 8 && t.ate > Date.now()) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    res.on('finish', () => {
      const f = res.statusCode === 401 ? contar(chave, 10 * 60_000) : res.statusCode < 400 && t ? db.run('DELETE FROM limites WHERE chave = ?', chave) : null;
      Promise.resolve(f).catch(() => undefined);
    });
    next();
  } catch (e) { next(e); }
}

/** Limite genérico por IP+rota (todas as chamadas contam). */
export const limitarPorIp = (nome: string, max: number, janelaMs: number) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (await contar(`${nome}:${ipDe(req)}`, janelaMs) > max) return res.status(429).json({ error: 'Muitas solicitações. Tente novamente mais tarde.' });
    next();
  } catch (e) { next(e); }
};
