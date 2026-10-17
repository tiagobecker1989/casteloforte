import type { Role } from './auth';

/**
 * Permissões por tela e por ação. O PRESIDENTE (perfil ADMIN_PAROQUIA) marca, usuário por usuário, as telas
 * e as alterações permitidas; sem marcação própria vale o padrão do perfil (PADROES). O presidente tem tudo.
 * Chave de permissão: "<tela>.<ação>", por exemplo "membros.criar".
 */
export interface TelaPerm { tela: string; rotulo: string; acoes: { id: string; rotulo: string }[] }
const A = (id: string, rotulo: string) => ({ id, rotulo });

export const CATALOGO: TelaPerm[] = [
  { tela: 'dashboard', rotulo: 'Dashboard', acoes: [A('ver', 'Ver')] },
  { tela: 'membros', rotulo: 'Membros', acoes: [A('ver', 'Ver'), A('criar', 'Cadastrar'), A('editar', 'Editar'), A('excluir', 'Excluir'), A('exportar', 'Exportar (PDF/Excel)'), A('importar', 'Importar lista'), A('privacidade', 'Privacidade (LGPD)')] },
  { tela: 'diretoria', rotulo: 'Diretoria', acoes: [A('ver', 'Ver'), A('alterar', 'Alterar cargos'), A('direto', 'Alterar sem confirmação do presidente')] },
  { tela: 'financeiro', rotulo: 'Financeiro', acoes: [A('ver', 'Ver'), A('criar', 'Lançar'), A('editar', 'Editar'), A('excluir', 'Excluir')] },
  { tela: 'ofertas', rotulo: 'Ofertas', acoes: [A('ver', 'Ver'), A('criar', 'Lançar ofertas'), A('excluir', 'Excluir')] },
  { tela: 'conciliacao', rotulo: 'Conciliação Pix', acoes: [A('ver', 'Ver'), A('operar', 'Conciliar / importar extrato')] },
  { tela: 'despesas', rotulo: 'Despesas e Tópicos', acoes: [A('ver', 'Ver'), A('criar', 'Lançar e criar tópicos'), A('excluir', 'Excluir')] },
  { tela: 'relatorios', rotulo: 'Relatórios', acoes: [A('ver', 'Ver')] },
  { tela: 'calendario', rotulo: 'Calendário', acoes: [A('ver', 'Ver'), A('criar', 'Criar eventos'), A('editar', 'Editar'), A('excluir', 'Excluir')] },
  { tela: 'departamentos', rotulo: 'Departamentos', acoes: [A('ver', 'Ver'), A('criar', 'Criar departamentos'), A('editar', 'Editar'), A('excluir', 'Excluir')] },
  { tela: 'assinatura', rotulo: 'Assinatura', acoes: [A('ver', 'Ver'), A('pagar', 'Pagar faturas')] },
  { tela: 'arquivos', rotulo: 'Atas (importação de arquivos .doc, .docx, .pdf)', acoes: [A('ver', 'Ver / abrir / baixar'), A('criar', 'Importar'), A('editar', 'Editar'), A('excluir', 'Excluir')] },
];

export type Matriz = Record<string, string[]>;
const TODAS = (): Matriz => Object.fromEntries(CATALOGO.map(t => [t.tela, t.acoes.map(a => a.id)]));

const MEMBROS_COMPLETO = ['ver', 'criar', 'editar', 'excluir', 'exportar', 'importar', 'privacidade'];
/** Padrões por perfil. Equivalem ao acesso que cada perfil já tinha, com os ajustes pedidos (veja comentários). */
export const PADROES: Record<Exclude<Role, 'SUPER_ADMIN'>, Matriz> = {
  ADMIN_PAROQUIA: TODAS(),
  // Pastor: SEM Financeiro e SEM Assinatura
  PASTOR: {
    dashboard: ['ver'], membros: MEMBROS_COMPLETO, diretoria: ['ver', 'alterar', 'direto'],
    ofertas: ['ver'], conciliacao: ['ver'], despesas: ['ver'], relatorios: ['ver'],
    calendario: ['ver', 'criar', 'editar', 'excluir'], departamentos: ['ver', 'criar', 'editar', 'excluir'],
    arquivos: ['ver'],
  },
  // Tesoureiro: SEM Departamentos
  TESOUREIRO: {
    dashboard: ['ver'], membros: ['ver', 'exportar'], diretoria: ['ver'],
    financeiro: ['ver', 'criar', 'editar', 'excluir'], ofertas: ['ver', 'criar', 'excluir'], conciliacao: ['ver', 'operar'],
    despesas: ['ver', 'criar', 'excluir'], relatorios: ['ver'], calendario: ['ver'], assinatura: ['ver', 'pagar'],
    arquivos: ['ver'],
  },
  // Secretaria: + Importação de arquivos; não cria departamentos; altera cargos da diretoria SÓ com confirmação do presidente (sem "direto")
  SECRETARIA: {
    dashboard: ['ver'], membros: MEMBROS_COMPLETO, diretoria: ['ver', 'alterar'],
    calendario: ['ver', 'criar', 'editar', 'excluir'], departamentos: ['ver', 'editar', 'excluir'],
    arquivos: ['ver', 'criar', 'editar', 'excluir'],
  },
};

/**
 * Atas: TODOS os usuários da paróquia as consultam ("ver" é obrigatório e não pode ser retirado);
 * só a Secretaria e o presidente alteram (importar, editar, excluir). O presidente pode reduzir o que a Secretaria faz,
 * mas não pode liberar a alteração das atas para Pastor ou Tesoureiro.
 */
export function travasPerfil(role: Role): { arquivos: { obrigatorias: string[]; proibidas: string[] } } {
  return { arquivos: { obrigatorias: ['ver'], proibidas: role === 'SECRETARIA' ? [] : ['criar', 'editar', 'excluir'] } };
}
export function ajustarPerfil(role: Role, m: Matriz): Matriz {
  if (role === 'ADMIN_PAROQUIA' || role === 'SUPER_ADMIN') return m;
  const t = travasPerfil(role).arquivos, out: Matriz = { ...m };
  const atuais = new Set([...(out.arquivos ?? []), ...t.obrigatorias].filter(a => !t.proibidas.includes(a)));
  out.arquivos = (CATALOGO.find(x => x.tela === 'arquivos')!.acoes.map(a => a.id)).filter(a => atuais.has(a));
  return out;
}

/** Valida e normaliza uma matriz enviada pelo presidente. "alterar sem confirmação" implica "alterar"; qualquer ação implica "ver". */
export function normalizar(m: any): Matriz {
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw Object.assign(new Error('Matriz de permissões inválida'), { status: 400 });
  const out: Matriz = {};
  for (const [tela, acoes] of Object.entries(m)) {
    const def = CATALOGO.find(t => t.tela === tela);
    if (!def) throw Object.assign(new Error(`Tela desconhecida: ${tela}`), { status: 400 });
    if (!Array.isArray(acoes)) throw Object.assign(new Error('Matriz de permissões inválida'), { status: 400 });
    const validas = new Set(def.acoes.map(a => a.id)), set = new Set<string>();
    for (const a of acoes) { if (!validas.has(String(a))) throw Object.assign(new Error(`Ação desconhecida em ${tela}: ${a}`), { status: 400 }); set.add(String(a)); }
    if (set.has('direto')) set.add('alterar');
    if (set.size && !set.has('ver')) set.add('ver');
    if (set.size) out[tela] = def.acoes.map(a => a.id).filter(a => set.has(a));
  }
  return out;
}

export function matrizEfetiva(role: Role, json: string | null | undefined): Matriz {
  if (role === 'ADMIN_PAROQUIA') return TODAS();
  if (role === 'SUPER_ADMIN') return {};
  if (json) { try { return ajustarPerfil(role, normalizar(JSON.parse(json))); } catch { /* cai no padrão */ } }
  return ajustarPerfil(role, PADROES[role] ?? {});
}
export const paraConjunto = (m: Matriz) => new Set(Object.entries(m).flatMap(([t, acoes]) => acoes.map(a => `${t}.${a}`)));
