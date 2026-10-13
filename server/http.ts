import type { Request, Response, NextFunction } from 'express';

export const wrap = (fn: (req: Request, res: Response) => any) => async (req: Request, res: Response, next: NextFunction) => {
  try { const out = await fn(req, res); if (out !== undefined && !res.headersSent) res.json(out); } catch (e) { next(e); }
};
export const bad = (msg: string, status = 400) => Object.assign(new Error(msg), { status });
export const str = (v: any, max = 200) => (v == null ? null : String(v).trim().slice(0, max));
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const hoje = () => new Date().toISOString().slice(0, 10);
export const mesAtual = () => new Date().toISOString().slice(0, 7);

/** Valida CPF (11 dígitos) ou CNPJ (14) pelos dígitos verificadores. Retorna só os números ou null. */
export function documentoValido(v: any): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (/^(\d)\1+$/.test(d)) return null;
  const dig = (base: string, pesos: number[]) => { const r = base.split('').reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  if (d.length === 11) {
    const a = dig(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]), b = dig(d.slice(0, 9) + a, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${a}${b}`) ? d : null;
  }
  if (d.length === 14) {
    const a = dig(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]), b = dig(d.slice(0, 12) + a, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d.endsWith(`${a}${b}`) ? d : null;
  }
  return null;
}
