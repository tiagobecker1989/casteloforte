import crypto from 'crypto';

/**
 * Criptografia (AES-256-GCM) das credenciais bancárias guardadas no banco de dados.
 * A chave vem de SECRETS_KEY (32 bytes em base64: `openssl rand -base64 32`). Sem ela, nada é salvo.
 */
function chave(): Buffer | null {
  const k = process.env.SECRETS_KEY;
  if (!k) return null;
  const b = Buffer.from(k, 'base64');
  return b.length === 32 ? b : crypto.createHash('sha256').update(k).digest();
}
export const segredosAtivos = () => chave() !== null;

export function cifrar(obj: unknown): string {
  const key = chave();
  if (!key) throw Object.assign(new Error('Defina SECRETS_KEY no ambiente para guardar credenciais bancárias com segurança.'), { status: 503 });
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decifrar<T = any>(s: string): T {
  const key = chave();
  if (!key) throw Object.assign(new Error('SECRETS_KEY não configurada.'), { status: 503 });
  const [v, iv, tag, enc] = s.split(':');
  if (v !== 'v1') throw new Error('Formato de credencial desconhecido');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8'));
}
