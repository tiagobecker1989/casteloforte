
export type UserRole =
  | 'SUPER_ADMIN'      // Sede (IELB Castelo Forte): gerencia todas as paróquias
  | 'ADMIN_PAROQUIA'   // Responsável da paróquia: tudo dentro do próprio tenant
  | 'PASTOR'
  | 'TESOUREIRO'
  | 'SECRETARIA';

export type UnidadeStatus = 'PENDENTE' | 'ATIVA' | 'SUSPENSA';

export type UnidadeType = 'PAROQUIA' | 'COMUNIDADE';

export type CargoDiretoria = 
  | 'PRESIDENTE' 
  | 'VICE_PRESIDENTE' 
  | 'SECRETARIO' 
  | 'VICE_SECRETARIO' 
  | 'TESOUREIRO' 
  | 'VICE_TESOUREIRO' 
  | 'CONSELHEIRO' 
  | 'VICE_CONSELHEIRO' 
  | 'FISCAL_1' 
  | 'FISCAL_2' 
  | 'FISCAL_3';

export interface MembroDiretoria {
  membroId?: string;
  nome: string;
  telefone?: string;
  email?: string;
}

export interface Unidade {
  id: string;
  nome: string;
  tipo: UnidadeType;
  distrito: string;
  pastores: string[];
  endereco?: string;
  contato?: string;
  status?: UnidadeStatus;
  cpfCnpj?: string;
  isSede?: boolean;
  diretoria: Partial<Record<CargoDiretoria, MembroDiretoria>>;
}

// Representa o usuário logado no sistema
export interface UserSession {
  id: string;
  nome: string;
  role: UserRole;
  unidadeId: string | null; // tenant: null apenas para SUPER_ADMIN
  unidade?: Unidade | null;
  aceitePendente?: boolean;
  assinatura?: { status: 'TRIAL' | 'ATIVA' | 'INADIMPLENTE' | 'CANCELADA'; trialAte: string | null } | null;
}

export type MembroStatus = 'ATIVO' | 'INATIVO' | 'TRANSFERIDO' | 'FALECIDO';

export interface Membro {
  id: string;
  nome: string;
  status: MembroStatus;
  dataBatismo?: string;
  dataConfirmacao?: string;
  ultimaComunhao?: string;
  ultimaPresenca?: string;
  ultimaOferta?: string;
  unidadeId: string; // Garante que o membro pertence a uma paróquia específica
  pontuacaoEngajamento: number; 
  telefone?: string;
  email?: string;
  endereco?: string;
  profissao?: string;
  familiares?: string;
  temCargo: boolean;
  cargoDiretoria?: CargoDiretoria;
  consentimentoEm?: string | null;
  consentimentoObs?: string | null;
  anonimizadoEm?: string | null;
}

export interface CotaConfig {
  nome: string;
  percent: number;
}

export interface ParoquiaConsolidada extends Unidade {
  stats: {
    ativos: number;
    inativos: number;
    transferidos: number;
    evasaoMes: number;
  };
  financeiro: {
    ofertasMes: number;
    saldoBruto: number;
    cotas: CotaConfig[];
    statusPagamento: 'PAGO' | 'PENDENTE' | 'ATRASADO';
  };
}

export type LancamentoTipo = 'ENTRADA' | 'SAIDA';
export type CategoriaFinanceira = 'OFERTA' | 'DIZIMO' | 'COTA_COOPERATIVA' | 'MANUTENCAO' | 'SALARIOS' | 'MISSOES' | 'CONSTRUCAO';

export interface Lancamento {
  id: string;
  tipo: LancamentoTipo;
  categoria: CategoriaFinanceira;
  valor: number;
  data: string;
  descricao: string;
  unidadeId: string; // Garante que o dinheiro pertence ao caixa da paróquia correta
}

export interface Departamento {
  id: string;
  nome: string;
  membrosCount: number;
  lider: string;
  unidadeId: string;
}

export type EventoTipo = 'CULTO' | 'REUNIAO' | 'ESTUDO' | 'FESTA' | 'OUTRO';

export interface Evento {
  id: string;
  titulo: string;
  tipo: EventoTipo;
  data: string; 
  horario: string;
  descricao?: string;
  unidadeId: string; // Garante que o evento apareça no calendário da paróquia correta
}
