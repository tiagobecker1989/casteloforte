/**
 * MODELOS de Termos de Uso e Política de Privacidade.
 * São pontos de partida técnicos e NÃO substituem revisão jurídica. Ajuste os textos e atualize a
 * VERSAO_LEGAL sempre que mudarem: todos os usuários precisarão aceitar de novo no próximo acesso.
 */
export const VERSAO_LEGAL = '2026-10-11';
const DPO = process.env.DPO_EMAIL || 'encarregado@seu-dominio.org.br';
const OPERADORA = process.env.OPERADORA_NOME || 'IELB Castelo Forte';

export const TEXTOS: Record<'termos' | 'privacidade', { titulo: string; paragrafos: string[] }> = {
  termos: {
    titulo: 'Termos de Uso',
    paragrafos: [
      `A plataforma Castelo Forte é operada por ${OPERADORA} ("Sede") e oferecida às paróquias e comunidades luteranas cadastradas para gestão de membros, diretoria, finanças, calendário e departamentos.`,
      'Cada paróquia é responsável pelas informações que cadastra, por manter apenas dados necessários às suas atividades e por conceder acesso apenas a pessoas autorizadas. O administrador da paróquia responde pelos usuários que cria.',
      'Cada usuário deve manter sua senha em sigilo e usar o sistema apenas para fins ligados à vida da comunidade. É proibido acessar dados de outra paróquia ou tentar contornar o isolamento entre paróquias.',
      'Os planos, valores, limites e prazos de pagamento são informados na área "Assinatura". Faturas em atraso além da carência colocam a paróquia em modo somente leitura; os dados não são apagados por inadimplência.',
      'A Sede pode suspender o acesso em caso de uso indevido, descumprimento destes termos ou encerramento do vínculo com a Sede. Ao encerrar, a paróquia pode exportar seus dados antes da exclusão.',
      'Estes termos podem ser atualizados; a continuidade de uso depende de novo aceite.',
    ],
  },
  privacidade: {
    titulo: 'Política de Privacidade',
    paragrafos: [
      'Papéis (LGPD): a paróquia é a controladora dos dados de seus membros, doadores e colaboradores; a Sede, ao operar a plataforma, atua como operadora desses dados e como controladora dos dados de contas de usuário e de cobrança.',
      'Dados tratados: cadastro de membros (nome, contatos, datas de batismo e confirmação, participação em atividades, cargos), lançamentos financeiros da paróquia e dados de acesso dos usuários (nome, e-mail, perfil, registros de aceite e de operações).',
      'Dados sobre a religião ou a vida confessional dos membros são dados pessoais sensíveis (LGPD, art. 11). A paróquia deve registrar a base legal do tratamento e, quando for o consentimento, registrá-lo na ficha do membro.',
      'Finalidades: administração da comunidade, comunicação com os membros, prestação de contas, e cobrança do uso da plataforma. Os dados de uma paróquia não são exibidos a outras paróquias. A Sede vê apenas totais financeiros por paróquia para fins de repasse.',
      'Inteligência artificial: quando administradores ou pastores usam os recursos de IA, os dados enviados ao provedor de IA são pseudonimizados (sem nomes; os nomes são reinseridos apenas na resposta exibida a você).',
      'Segurança: senhas armazenadas com hash, acesso por perfil, registro de auditoria das operações com dados de membros e isolamento lógico por paróquia.',
      'Retenção: os dados ficam enquanto a paróquia estiver ativa. Ao encerrar o vínculo, a paróquia pode exportar seus dados e a Sede pode excluí-los definitivamente.',
      `Direitos do titular (art. 18): confirmação, acesso, correção, anonimização, portabilidade, eliminação e informação sobre compartilhamento. Para exercê-los procure a secretaria da sua paróquia; ela dispõe de ferramentas de exportação e anonimização. Contato do encarregado (DPO): ${DPO}.`,
    ],
  },
};
