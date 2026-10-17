import { db } from './db';

/** Categorias fixas. As 4 primeiras de saída (subsistência, luz, água, combustível) são as exigidas nos relatórios. */
export const FIXAS: { codigo: string; label: string; tipo: 'ENTRADA' | 'SAIDA' | 'AMBOS' }[] = [
  { codigo: 'OFERTA', label: 'Ofertas mensais', tipo: 'ENTRADA' },
  { codigo: 'DIZIMO', label: 'Dízimo', tipo: 'ENTRADA' },
  { codigo: 'SUBSISTENCIA_PASTOR', label: 'Subsistência do pastor', tipo: 'SAIDA' },
  { codigo: 'LUZ', label: 'Conta de luz', tipo: 'SAIDA' },
  { codigo: 'AGUA', label: 'Conta de água', tipo: 'SAIDA' },
  { codigo: 'COMBUSTIVEL', label: 'Combustível', tipo: 'SAIDA' },
  { codigo: 'COTA_COOPERATIVA', label: 'Cota Cooperativa', tipo: 'AMBOS' },
  { codigo: 'MANUTENCAO', label: 'Manutenção', tipo: 'AMBOS' },
  { codigo: 'SALARIOS', label: 'Salários/Folha', tipo: 'SAIDA' },
  { codigo: 'MISSOES', label: 'Missões', tipo: 'AMBOS' },
  { codigo: 'CONSTRUCAO', label: 'Construção/Reforma', tipo: 'AMBOS' },
];
export const PRINCIPAIS_ENTRADA = ['OFERTA'];
export const PRINCIPAIS_SAIDA = ['SUBSISTENCIA_PASTOR', 'LUZ', 'AGUA', 'COMBUSTIVEL'];

/** Mapa código -> nome legível, incluindo os tópicos cadastrados pela paróquia (categoria "TOPICO:<id>"). */
export async function rotulos(unidadeId: string): Promise<(cat: string) => string> {
  const mapa = new Map(FIXAS.map(f => [f.codigo, f.label]));
  for (const t of await db.all('SELECT id, nome FROM topicos WHERE unidadeId = ?', unidadeId)) mapa.set(`TOPICO:${t.id}`, t.nome);
  return cat => mapa.get(cat) ?? (cat.startsWith('TOPICO:') ? 'Tópico removido' : cat);
}
