/** Normalização de nomes e detecção de sobrenomes semelhantes (para perguntar sobre parentesco). */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von', 'la', 'le', 'y']);

export const norm = (s: string) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Sobrenomes = todas as palavras depois do primeiro nome, sem partículas ("de", "da"...) e sem palavras de 1-2 letras. */
export function sobrenomes(nome: string): { orig: string; n: string }[] {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  return partes.slice(1)
    .map(orig => ({ orig, n: norm(orig).replace(/[^a-z]/g, '') }))
    .filter(t => t.n.length >= 3 && !PARTICULAS.has(t.n));
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** Iguais, ou parecidos (1 letra de diferença) quando longos o bastante para não gerar falso alarme (Silva/Silveira não casam). */
export const sobrenomeSemelhante = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && lev(a, b) <= 1);

/** Sobrenomes do cadastro existente que se parecem com algum do nome novo. */
export function sobrenomesEmComum(novo: string, existente: string): string[] {
  const a = sobrenomes(novo), b = sobrenomes(existente), out: string[] = [];
  for (const t of b) if (a.some(x => sobrenomeSemelhante(x.n, t.n)) && !out.includes(t.orig)) out.push(t.orig);
  return out;
}

export const TIPOS_PARENTESCO = ['CONJUGE', 'PAI_MAE', 'FILHO', 'IRMAO', 'AVO', 'NETO', 'TIO', 'SOBRINHO', 'PRIMO', 'SOGRO', 'GENRO_NORA', 'CUNHADO', 'OUTRO'] as const;
export const INVERSO: Record<string, string> = {
  CONJUGE: 'CONJUGE', IRMAO: 'IRMAO', PRIMO: 'PRIMO', CUNHADO: 'CUNHADO', OUTRO: 'OUTRO',
  PAI_MAE: 'FILHO', FILHO: 'PAI_MAE', AVO: 'NETO', NETO: 'AVO', TIO: 'SOBRINHO', SOBRINHO: 'TIO', SOGRO: 'GENRO_NORA', GENRO_NORA: 'SOGRO',
};
