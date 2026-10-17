import https from 'https';
import crypto from 'crypto';
import tls from 'tls';
import { bad } from './http';

/**
 * Cliente da API Pix do Sicredi (padrão BACEN) conforme o "Guia Técnico Integrações API Pix Sicredi":
 *  - mTLS obrigatório em toda chamada (certificado .CER em PEM + chave privada sem senha);
 *  - POST /oauth/token (Authorization: Basic base64(client_id:client_secret), grant_type=client_credentials, scope);
 *  - recursos em /api/v2 (aqui: GET /pix = "Consultar Pix recebidos").
 * ATENÇÃO: esta API só informa Pix RECEBIDOS. Pix enviados e extrato vêm da importação de extrato.
 */
export interface CredSicredi { clientId: string; clientSecret: string; certPem: string; keyPem: string; cadeiaPem?: string }
const BASE = () => (process.env.SICREDI_BASE_URL || 'https://api-pix.sicredi.com.br').replace(/\/$/, '');

function chamar(cred: CredSicredi, method: string, caminho: string, opts: { headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE() + caminho);
    const extra = process.env.SICREDI_CA_PEM || cred.cadeiaPem; // cadeia Sicredi (e CA de testes)
    const agent = new https.Agent({ cert: cred.certPem, key: cred.keyPem, ca: extra ? [...tls.rootCertificates, extra] : undefined, keepAlive: false });
    const req = https.request(url, { method, agent, timeout: 20_000, headers: { 'User-Agent': 'CasteloForte/1.0', ...(opts.headers ?? {}), ...(opts.body ? { 'Content-Length': String(Buffer.byteLength(opts.body)) } : {}) } }, res => {
      let raw = ''; res.on('data', d => raw += d);
      res.on('end', () => { let json: any = null; try { json = raw ? JSON.parse(raw) : null; } catch { json = { raw: raw.slice(0, 300) }; } resolve({ status: res.statusCode || 0, json }); });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', e => reject(e));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const cache = new Map<string, { token: string; ate: number }>(); // o guia pede reaproveitar o token até expirar

function traduzir(status: number, json: any): string {
  const det = json?.detail || json?.error_description || json?.message || json?.raw || '';
  if (status === 403) return 'Sicredi recusou a conexão (403). Confira se o certificado e a chave correspondem entre si e se o certificado está em formato PEM.';
  if (status === 401) return 'Credenciais recusadas (401). Confira o Client ID e o Client Secret (produção x homologação).';
  if (status === 400) return `Sicredi recusou o pedido (400)${det ? `: ${det}` : ''}. Pode faltar o escopo "pix.read" na adesão à API Pix.`;
  return `Sicredi respondeu ${status}${det ? `: ${det}` : ''}`;
}

async function token(chaveCache: string, cred: CredSicredi): Promise<string> {
  const c = cache.get(chaveCache);
  if (c && c.ate > Date.now() + 30_000) return c.token;
  const basic = Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString('base64');
  const r = await chamar(cred, 'POST', '/oauth/token', { headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials&scope=pix.read' });
  if (r.status !== 200 || !r.json?.access_token) throw bad(traduzir(r.status, r.json), 502);
  cache.set(chaveCache, { token: r.json.access_token, ate: Date.now() + Number(r.json.expires_in ?? 3600) * 1000 });
  return r.json.access_token;
}

export interface PixRecebido { endToEndId: string; valor: number; horario: string; nome: string | null; info: string | null; txid: string | null }

/** Pix recebidos entre dois instantes ISO (paginado, conforme a especificação do BACEN). */
export async function pixRecebidos(chaveCache: string, cred: CredSicredi, inicio: Date, fim: Date): Promise<PixRecebido[]> {
  const out: PixRecebido[] = [];
  for (let pagina = 0; pagina < 50; pagina++) {
    const qs = new URLSearchParams({ inicio: inicio.toISOString(), fim: fim.toISOString(), 'paginacao.paginaAtual': String(pagina), 'paginacao.itensPorPagina': '100' });
    let r = await chamar(cred, 'GET', `/api/v2/pix?${qs}`, { headers: { Authorization: `Bearer ${await token(chaveCache, cred)}` } });
    if (r.status === 401) { cache.delete(chaveCache); r = await chamar(cred, 'GET', `/api/v2/pix?${qs}`, { headers: { Authorization: `Bearer ${await token(chaveCache, cred)}` } }); }
    if (r.status !== 200) throw bad(traduzir(r.status, r.json), 502);
    for (const p of r.json?.pix ?? []) {
      const valor = Number(p.valor);
      if (!p.endToEndId || !Number.isFinite(valor)) continue;
      out.push({ endToEndId: String(p.endToEndId), valor, horario: String(p.horario), nome: p.pagador?.nome ?? null, info: p.infoPagador ?? null, txid: p.txid ?? null });
    }
    const total = Number(r.json?.parametros?.paginacao?.quantidadeDePaginas ?? 1);
    if (pagina + 1 >= total) break;
  }
  return out;
}

export function validarCredenciais(c: Partial<CredSicredi>): CredSicredi {
  if (!c.clientId || !c.clientSecret) throw bad('Informe o Client ID e o Client Secret.');
  const certPem = String(c.certPem ?? '').trim(), keyPem = String(c.keyPem ?? '').trim();
  if (!certPem.includes('BEGIN CERTIFICATE')) throw bad('O certificado precisa estar em formato PEM (começa com -----BEGIN CERTIFICATE-----). Se o arquivo .CER estiver ilegível (binário/DER), converta como no guia da Sicredi.');
  if (!/BEGIN (RSA |EC )?PRIVATE KEY/.test(keyPem)) throw bad('A chave privada precisa estar em PEM e SEM senha (-----BEGIN PRIVATE KEY----- ou RSA PRIVATE KEY).');
  try {
    const x = new crypto.X509Certificate(certPem), k = crypto.createPrivateKey(keyPem);
    if (!x.checkPrivateKey(k)) throw bad('O certificado e a chave privada não correspondem. Use a chave gerada junto com o pedido (CSR) deste certificado.');
  } catch (e: any) { if (e?.status) throw e; throw bad('Não foi possível ler o certificado ou a chave privada. Confira se estão completos e sem senha.'); }
  return { clientId: String(c.clientId).trim(), clientSecret: String(c.clientSecret).trim(), certPem, keyPem, cadeiaPem: c.cadeiaPem ? String(c.cadeiaPem).trim() : undefined };
}
