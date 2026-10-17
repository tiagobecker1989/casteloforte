import { Membro, Lancamento, Unidade, Departamento, Evento, UserSession, CargoDiretoria, MembroDiretoria, UserRole, UnidadeStatus } from '../types';

const TOKEN_KEY = 'ielb_token';
export const auth = {
  get token() { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); },
  save(token: string, lembrar: boolean) { (lembrar ? localStorage : sessionStorage).setItem(TOKEN_KEY, token); },
  clear() { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); },
};

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth.token) { auth.clear(); window.location.hash = '#/login'; }
  if (!res.ok) throw new ApiError(res.status, data.error || `Erro ${res.status}`);
  return data as T;
}

export interface ParoquiaSede extends Unidade {
  stats: { ativos: number; inativos: number; transferidos: number };
  admin?: { nome: string; email: string };
}
export type StatusRepasse = 'PAGO' | 'PARCIAL' | 'PENDENTE' | 'ATRASADO' | 'SEM_MOVIMENTO';
export interface CotaItem { cotaId: string; nome: string; percent: number; personalizada: boolean; valor: number }
export interface RepasseParoquia {
  id: string; nome: string; distrito: string; base: number; cotas: CotaItem[]; devido: number;
  valorPago: number; pagoEm: string | null; obs: string | null; status: StatusRepasse;
}
export interface FinanceiroSede {
  competencia: string; vencimento: string; cotas: { id: string; nome: string; percent: number }[]; paroquias: RepasseParoquia[];
  totais: { base: number; devido: number; pago: number; aReceber: number; adimplencia: number | null };
}
export interface HistoricoMes { competencia: string; base: number; devido: number; pago: number }
export interface Plano { id: string; nome: string; precoMensal: number; limiteMembros: number | null; limiteUsuarios: number | null; ativo?: number }
export interface Fatura { linkPagamento?: string | null; id: string; unidadeId?: string; paroquia?: string; competencia: string; valor: number; vencimento: string; status: 'ABERTA' | 'PAGA' | 'CANCELADA'; pagoEm: string | null; meio: string | null }
export interface AssinaturaSede { unidadeId: string; nome: string; distrito: string; status: string; trialAte: string | null; planoId: string; plano: string; precoMensal: number; abertas: number; emAberto: number }
export interface CobrancaSede { gateway?: { ativo: boolean; ambiente: string | null }; assinaturas: AssinaturaSede[]; kpis: { mrr: number; recebidoMes: number; inadimplentes: number; emTrial: number } }
export interface MinhaAssinatura {
  status: string; trialAte: string | null; planoId: string; plano: string; precoMensal: number; limiteMembros: number | null; limiteUsuarios: number | null;
  uso: { membros: number; usuarios: number }; documento: string | null; documentoTravado: boolean; pagamentoOnline: boolean; trialDias: number; carenciaDias: number; pix: string | null; faturas: Fatura[]; planos: Plano[];
}
export interface TextoLegal { titulo: string; paragrafos: string[] }
export interface Legal { versao: string; termos: TextoLegal; privacidade: TextoLegal }
export interface RegistroAuditoria { id: string; acao: string; entidade: string; entidadeId: string | null; detalhe: string | null; criadoEm: string; usuario: string | null }
export interface Similar { id: string; nome: string; status: string; emComum: string[] }
export interface Parentesco { id: string; membroId: string; nome: string; papel: string }
export interface OfertaLancada { id: string; valor: number; data: string; competencia: string; forma: string | null; descricao: string; membroId: string; membro: string }
export interface Atrasada { id: string; nome: string; telefone: string | null; esperado: number; pago: number; faltante: number }
export interface Atrasos { competencia: string; diaOferta: number; vencimento: string; venceu: boolean; atrasadas: Atrasada[]; contribuintes: number; emDia: number }
export interface Topicos { fixos: { codigo: string; label: string; tipo: string }[]; personalizados: { id: string; codigo: string; nome: string; tipo: string; ativo: boolean }[] }
export interface TransacaoBanco { id: string; fonte: string; data: string; valor: number; tipo: 'ENTRADA' | 'SAIDA'; nome: string | null; descricao: string | null; status: 'PENDENTE' | 'CONCILIADO' | 'IGNORADO'; lancamentoId: string | null; sugestao: { membroId: string; nome: string; pontuacao: number } | null }
export interface ConfigBanco { configurado: boolean; chavePix: string | null; ultimaSincronizacao: string | null; certificadoValidoAte: string | null; segredosAtivos: boolean }
export interface UsuarioParoquia { id: string; nome: string; email: string; role: UserRole; ativo: number; personalizada?: number }
export interface TelaPerm { tela: string; rotulo: string; acoes: { id: string; rotulo: string }[] }
export type Matriz = Record<string, string[]>
export interface Documento { id: string; nome: string; tipo: 'pdf' | 'docx' | 'doc'; tamanho: number; descricao: string | null; enviadoEm: string; enviadoPor: string | null }
export interface PendenciaDiretoria { id: string; cargo: string; acao: 'ATRIBUIR' | 'REMOVER'; membroId: string | null; nome: string | null; status: string; criadoEm: string; decididoEm: string | null; motivo: string | null; solicitante: string | null; membroNome: string | null; ocupanteAtual: string | null }
export interface ResumoMembros { ativos: number; inativos: number; transferidos: number; falecidos: number; total: number }

export const apiService = {
  // AUTH
  login: (email: string, senha: string) => req<{ token: string; usuario: UserSession }>('POST', '/auth/login', { email, senha }),
  solicitarCadastro: (paroquia: Partial<Unidade>, responsavel: { nome: string; email: string; senha: string }, aceitou: boolean) =>
    req<{ ok: true }>('POST', '/auth/solicitar-cadastro', { paroquia, responsavel, aceitou }),
  esqueciSenha: (email: string) => req<{ ok: true }>('POST', '/auth/esqueci-senha', { email }),
  redefinirSenha: (token: string, senha: string) => req<{ ok: true }>('POST', '/auth/redefinir-senha', { token, senha }),
  alterarSenha: (senhaAtual: string, novaSenha: string) => req<{ token: string }>('POST', '/auth/alterar-senha', { senhaAtual, novaSenha }),
  aceitar: () => req<{ ok: true }>('POST', '/auth/aceitar', { aceitou: true }),
  getLegal: () => req<Legal>('GET', '/legal'),

  // LGPD
  setConsentimento: (id: string, consentido: boolean, obs?: string) => req('PUT', `/membros/${id}/consentimento`, { consentido, obs }),
  exportarMembro: (id: string) => req<any>('GET', `/membros/${id}/exportar`),
  anonimizarMembro: (id: string) => req('POST', `/membros/${id}/anonimizar`, { confirmar: true }),
  exportarParoquia: () => req<any>('GET', '/paroquia/exportar'),
  getAuditoria: () => req<RegistroAuditoria[]>('GET', '/auditoria'),

  // COBRANÇA — sede
  getPlanos: () => req<Plano[]>('GET', '/sede/planos'),
  salvarPlano: (p: Partial<Plano>) => req('PUT', '/sede/planos', p),
  getCobranca: () => req<CobrancaSede>('GET', '/sede/cobranca'),
  getFaturasSede: (status = '') => req<Fatura[]>('GET', `/sede/faturas${status ? `?status=${status}` : ''}`),
  gerarFaturas: (competencia: string) => req<{ criadas: number }>('POST', '/sede/faturas/gerar', { competencia }),
  criarFaturaAvulsa: (b: { unidadeId: string; competencia: string; valor: number; vencimento: string }) => req('POST', '/sede/faturas', b),
  pagarFatura: (id: string, meio: string) => req('POST', `/sede/faturas/${id}/pagar`, { meio }),
  cancelarFatura: (id: string) => req('POST', `/sede/faturas/${id}/cancelar`),
  alterarAssinatura: (unidadeId: string, b: { planoId?: string; status?: 'ATIVA' | 'CANCELADA' }) => req('PATCH', `/sede/assinaturas/${unidadeId}`, b),
  excluirParoquia: (id: string, confirmarNome: string) => req('POST', `/sede/paroquias/${id}/excluir`, { confirmarNome }),
  // COBRANÇA — paróquia
  getMinhaAssinatura: () => req<MinhaAssinatura>('GET', '/assinatura'),
  salvarDocumento: (cpfCnpj: string) => req('POST', '/assinatura/documento', { cpfCnpj }),
  pagarOnline: (faturaId: string) => req<{ url: string }>('POST', `/assinatura/faturas/${faturaId}/pagar`),
  trocarPlano: (planoId: string) => req('POST', '/assinatura/plano', { planoId }),
  me: () => req<UserSession>('GET', '/auth/me'),

  // SEDE (SUPER_ADMIN)
  getParoquias: () => req<ParoquiaSede[]>('GET', '/sede/paroquias'),
  criarParoquia: (paroquia: Partial<Unidade>, responsavel: { nome: string; email: string; senha: string }) =>
    req<{ id: string }>('POST', '/sede/paroquias', { paroquia, responsavel }),
  setStatusParoquia: (id: string, status: UnidadeStatus) => req('PATCH', `/sede/paroquias/${id}/status`, { status }),

  getFinanceiroSede: (competencia: string) => req<FinanceiroSede>('GET', `/sede/financeiro?competencia=${competencia}`),
  getHistoricoSede: (meses = 6) => req<HistoricoMes[]>('GET', `/sede/financeiro/historico?meses=${meses}`),
  salvarCotasGlobais: (cotas: { id?: string; nome: string; percent: number }[]) => req('PUT', '/sede/cotas', { cotas }),
  salvarCotasParoquia: (id: string, overrides: Record<string, number>) => req('PUT', `/sede/paroquias/${id}/cotas`, { overrides }),
  registrarRepasse: (b: { unidadeId: string; competencia: string; pago: boolean; valorPago?: number; pagoEm?: string; obs?: string }) => req('POST', '/sede/repasses', b),

  // PARÓQUIA (o tenant vem do token; o parâmetro unidadeId é mantido só por compatibilidade das telas)
  getParoquia: () => req<Unidade>('GET', '/paroquia'),
  updateParoquia: (u: Partial<Unidade>) => req('PUT', '/paroquia', u),
  getDiretoria: () => req<Partial<Record<CargoDiretoria, MembroDiretoria>>>('GET', '/diretoria'),
  setCargo: (cargo: CargoDiretoria, d: Partial<MembroDiretoria>) => req('PUT', `/diretoria/${cargo}`, d),
  removeCargo: (cargo: CargoDiretoria) => req('DELETE', `/diretoria/${cargo}`),
  getUsuarios: () => req<UsuarioParoquia[]>('GET', '/usuarios'),
  criarUsuario: (u: { nome: string; email: string; senha: string; role: UserRole }) => req('POST', '/usuarios', u),
  atualizarUsuario: (id: string, u: { nome?: string; email?: string; senha?: string; role?: UserRole; ativo?: boolean }) => req('PATCH', `/usuarios/${id}`, u),

  // PERMISSÕES (presidente)
  getCatalogoPermissoes: () => req<{ catalogo: TelaPerm[]; padroes: Record<string, Matriz> }>('GET', '/permissoes/catalogo'),
  getPermissoes: (id: string) => req<{ id: string; nome: string; role: UserRole; personalizada: boolean; matriz: Matriz; fixo: boolean; travas?: Record<string, { obrigatorias: string[]; proibidas: string[] }> }>('GET', `/usuarios/${id}/permissoes`),
  setPermissoes: (id: string, matriz: Matriz) => req<{ ok: true; matriz: Matriz }>('PUT', `/usuarios/${id}/permissoes`, { matriz }),
  restaurarPermissoes: (id: string) => req('DELETE', `/usuarios/${id}/permissoes`),

  // DIRETORIA: pendências de confirmação
  getPendencias: () => req<{ pendentes: PendenciaDiretoria[]; minhas: PendenciaDiretoria[] }>('GET', '/diretoria/pendencias'),
  confirmarPendencia: (id: string, senha: string) => req('POST', `/diretoria/pendencias/${id}/confirmar`, { senha }),
  recusarPendencia: (id: string, motivo?: string) => req('POST', `/diretoria/pendencias/${id}/recusar`, { motivo }),
  cancelarPendencia: (id: string) => req('POST', `/diretoria/pendencias/${id}/cancelar`),

  // ARQUIVOS (.doc, .docx, .pdf)
  getDocumentos: () => req<Documento[]>('GET', '/documentos'),
  enviarDocumento: async (arquivo: File, descricao?: string) => {
    const res = await fetch(`/api/documentos?nome=${encodeURIComponent(arquivo.name)}${descricao ? `&descricao=${encodeURIComponent(descricao)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) }, body: arquivo });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, j.error || (res.status === 413 ? 'O arquivo passa de 4 MB.' : `Erro ${res.status}`));
    return j as { id: string };
  },
  baixarDocumento: async (id: string): Promise<ArrayBuffer> => {
    const res = await fetch(`/api/documentos/${id}/arquivo`, { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
    return res.arrayBuffer();
  },
  getTextoDocumento: (id: string) => req<{ texto: string }>('GET', `/documentos/${id}/texto`),
  editarDocumento: (id: string, b: { nome?: string; descricao?: string }) => req('PATCH', `/documentos/${id}`, b),
  excluirDocumento: (id: string) => req('DELETE', `/documentos/${id}`),

  // MEMBROS
  getResumoMembros: () => req<ResumoMembros>('GET', '/membros/resumo'),
  getMembrosExportacao: (status?: string) => req<{ paroquia: string; status: string | null; itens: any[] }>('GET', `/membros/exportacao${status ? `?status=${status}` : ''}`),
  getMembros: (_u: string, page = 1, limit = 10, search = '') =>
    req<{ data: Membro[]; total: number }>('GET', `/membros?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`),
  getTodosMembros: async (): Promise<Membro[]> => (await req<{ data: Membro[] }>('GET', '/membros?page=1&limit=100')).data,
  saveMembro: (m: Partial<Membro>) => (m.id ? req<Membro>('PUT', `/membros/${m.id}`, m) : req<Membro>('POST', '/membros', m)),

  // PARENTESCO / IMPORTAÇÃO
  similares: (nome: string, excluirId?: string) => req<Similar[]>('GET', `/membros/similares?nome=${encodeURIComponent(nome)}${excluirId ? `&excluirId=${excluirId}` : ''}`),
  getParentescos: (id: string) => req<Parentesco[]>('GET', `/membros/${id}/parentescos`),
  setParentescos: (id: string, itens: { membroId: string; tipo: string }[]) => req('PUT', `/membros/${id}/parentescos`, { itens }),
  removerParentesco: (id: string, relId: string) => req('DELETE', `/membros/${id}/parentescos/${relId}`),
  importarMembros: (linhas: any[]) => req<{ criados: number; ignorados: { linha: number; nome: string; motivo: string }[] }>('POST', '/membros/importar', { linhas }),

  // OFERTAS DOS MEMBROS
  getOfertas: (competencia: string) => req<{ competencia: string; itens: OfertaLancada[]; total: number }>('GET', `/ofertas?competencia=${competencia}`),
  lancarOferta: (b: { membroId: string; valor: number; data: string; competencia: string; forma: string; descricao?: string }) => req<{ id: string }>('POST', '/ofertas', b),
  apagarLancamento: (id: string) => req('DELETE', `/lancamentos/${id}`),
  getAtrasadas: (competencia: string) => req<Atrasos>('GET', `/ofertas/atrasadas?competencia=${competencia}`),
  getConfigOferta: () => req<{ diaOferta: number }>('GET', '/ofertas/config'),
  setConfigOferta: (diaOferta: number) => req('PUT', '/ofertas/config', { diaOferta }),

  // TÓPICOS E RELATÓRIOS
  getTopicos: () => req<Topicos>('GET', '/topicos'),
  criarTopico: (nome: string, tipo: 'ENTRADA' | 'SAIDA') => req<{ id: string; codigo: string }>('POST', '/topicos', { nome, tipo }),
  atualizarTopico: (id: string, b: { nome?: string; ativo?: boolean }) => req('PATCH', `/topicos/${id}`, b),
  getRelatorioMensal: (mes: string, nomes: boolean) => req<any>('GET', `/relatorios/mensal?mes=${mes}&nomes=${nomes ? 1 : 0}`),
  getRelatorioAnual: (ano: string) => req<any>('GET', `/relatorios/anual?ano=${ano}`),

  // BANCO / PIX
  getConfigBanco: () => req<ConfigBanco>('GET', '/banco/config'),
  salvarConfigBanco: (b: { clientId: string; clientSecret: string; certPem: string; keyPem: string; cadeiaPem?: string; chavePix?: string }) => req('PUT', '/banco/config', b),
  removerConfigBanco: () => req('DELETE', '/banco/config'),
  sincronizarBanco: (dias: number) => req<{ encontrados: number; novos: number }>('POST', '/banco/sicredi/sincronizar', { dias }),
  importarExtrato: (itens: any[]) => req<{ recebidos: number; novos: number; repetidos: number; ignorados: number }>('POST', '/banco/transacoes/importar', { itens }),
  getTransacoes: (mes: string, filtros: { status?: string; tipo?: string; pix?: boolean } = {}) =>
    req<{ mes: string; atrasadas: Atrasos; itens: TransacaoBanco[]; resumo: any[] }>('GET', `/banco/transacoes?mes=${mes}${filtros.status ? `&status=${filtros.status}` : ''}${filtros.tipo ? `&tipo=${filtros.tipo}` : ''}${filtros.pix ? '&pix=1' : ''}`),
  conciliar: (id: string, b: { acao: 'OFERTA' | 'ENTRADA_OUTRA' | 'SAIDA'; membroId?: string; competencia?: string; categoria?: string; descricao?: string }) => req('POST', `/banco/transacoes/${id}/conciliar`, b),
  ignorarTransacao: (id: string) => req('POST', `/banco/transacoes/${id}/ignorar`),
  reabrirTransacao: (id: string) => req('POST', `/banco/transacoes/${id}/reabrir`),

  // FINANCEIRO
  getLancamentos: (_u?: string) => req<Lancamento[]>('GET', '/lancamentos'),
  saveLancamento: (l: Partial<Lancamento>) => (l.id ? req<Lancamento>('PUT', `/lancamentos/${l.id}`, l) : req<Lancamento>('POST', '/lancamentos', l)),

  // DEPARTAMENTOS / EVENTOS
  getDepartamentos: () => req<Departamento[]>('GET', '/departamentos'),
  saveDepartamento: (d: Partial<Departamento>) => (d.id ? req<Departamento>('PUT', `/departamentos/${d.id}`, d) : req<Departamento>('POST', '/departamentos', d)),
  getEventos: () => req<Evento[]>('GET', '/eventos'),
  saveEvento: (e: Partial<Evento>) => (e.id ? req<Evento>('PUT', `/eventos/${e.id}`, e) : req<Evento>('POST', '/eventos', e)),
};
