# Castelo Forte — Plataforma SaaS de Gestão Eclesiástica (IELB)

Multi-paróquia: a sede (IELB Castelo Forte) aprova/cadastra paróquias, cobra os planos e consolida os repasses;
cada paróquia gerencia membros, diretoria, finanças, calendário, departamentos e usuários, com dados isolados por paróquia.

## Guia completo
Veja **GUIA-INSTALACAO.md** (o que instalar, rodar local, rede local e publicar na Vercel + Neon).

## Rodar
```
npm install
cp .env.example .env.local   # preencha JWT_SECRET, APP_URL, e-mail, etc.
npm run dev                  # desenvolvimento (http://localhost:3000)
npm run build && npm start   # produção em servidor próprio/VPS (exige JWT_SECRET)
```
Requer Node >= 22.13. Na primeira execução é criado o super admin da sede (veja `SEED_ADMIN_*`).

## Publicar na Vercel + Neon
Veja **DEPLOY-VERCEL.md** (passo a passo, variáveis e cron).

## Testes
`scripts/e2e.mjs` testa a API ponta a ponta (69 verificações): cadastro/aprovação, recuperação de senha, isolamento entre
paróquias, Diretoria, LGPD, planos, limites, inadimplência, webhook e exclusão. Exemplo (SQLite ou `USE_PGLITE=1` para Postgres em memória):
```
NODE_ENV=production JWT_SECRET=x PORT=3121 SEED_ADMIN_EMAIL=sede@cf.org SEED_ADMIN_PASSWORD=Sede@12345 BILLING_WEBHOOK_SECRET=segredo npm start > /tmp/log.txt &
BASE=http://localhost:3121 LOGFILE=/tmp/log.txt BILLING_WEBHOOK_SECRET=segredo node scripts/e2e.mjs
```

## Arquitetura
- `server/db.ts`: SQLite (padrão) ou PostgreSQL (`DATABASE_URL`). O mesmo SQL roda nos dois (adaptado em `adaptPg`). Toda tabela de negócio tem `unidadeId` (tenant).
- `server/auth.ts`: senha com scrypt; token JWT (HS256) validado a cada requisição contra o usuário/paróquia no banco (desativar usuário, trocar senha ou suspender paróquia valem na hora).
- `server/routes.ts`: API. O tenant vem sempre do token, nunca do corpo/URL.
- `server/diretoria.ts`: regra única cargo ↔ pessoa (ficha do membro e tela de Diretoria sempre coerentes).
- `server/lgpd.ts`, `server/legal.ts`, `server/audit.ts`: consentimento, exportação, anonimização, auditoria, textos legais (MODELOS — revisar com advogado).
- `server/billing.ts`: planos, assinaturas, faturas, limites, modo somente leitura por inadimplência, webhook assinado.
- `server/financeiro.ts`: repasses (cotas) das paróquias para a sede.
- `server/mail.ts`: e-mail via SMTP (ou console em desenvolvimento).

## Regras de negócio
- Cadastro: paróquia pede cadastro (`/#/cadastro`, com aceite dos termos) → PENDENTE → sede aprova → e-mail de aprovação.
- Plano: nova paróquia entra no plano de menor ordem; 1º upgrade para plano pago ganha `TRIAL_DIAS` grátis. Fatura mensal (vencimento dia 10).
  Atraso maior que `CARENCIA_DIAS` ⇒ paróquia em modo somente leitura (dados nunca são apagados por inadimplência).
- Planos iniciais (Gratuito, Paroquial, Distrital) e seus valores são EXEMPLOS: ajuste em "Planos e Cobrança".
- Repasse à sede: base = ofertas + dízimos do mês; cotas padrão DIVASI 3% e IELB 6% (editáveis, com ajuste por paróquia).
- IA (Gemini): só Administrador/Pastor; nomes dos membros nunca são enviados ao provedor (pseudonimização).
- Webhook de gateway: `POST /api/webhooks/pagamento` com `x-signature` = HMAC-SHA256 do corpo com `BILLING_WEBHOOK_SECRET`; corpo `{faturaId, status:"PAGA", valor, meio, referencia}`.

## Pagamento online (Asaas)
1. Crie a conta (CNPJ) e, antes, uma conta **Sandbox** em sandbox.asaas.com. Gere a chave de API do sandbox e coloque em `ASAAS_API_KEY`.
2. Defina `ASAAS_WEBHOOK_TOKEN` (`openssl rand -hex 32`). No painel do Asaas, cadastre um webhook:
   URL `https://SEU-DOMINIO/api/webhooks/asaas`, **token de autenticação** = o mesmo valor, eventos `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`.
3. Cada paróquia informa o CNPJ/CPF em "Assinatura". As faturas viram cobranças no Asaas (pagador escolhe Pix, boleto ou cartão) e a baixa é automática.
4. Troque para a chave de produção só depois de validar tudo no sandbox.
Testes sem internet: `scripts/fake-asaas.mjs` (simulador) + `scripts/e2e-asaas.mjs`.

## Funcionalidades de ofertas, conciliação e relatórios
- **Membros**: data de nascimento, edição do cadastro, aviso de **sobrenome semelhante** com pergunta de parentesco, importação de lista (CSV, Excel, PDF com texto).
- **Ofertas**: lançamento por membro (com mês de referência) e lista de **oferta mensal em atraso** (membros com "oferta mensal combinada" e dia de vencimento configurável).
- **Conciliação Pix**: Pix recebidos direto na conta Sicredi (API Pix) e extrato OFX/CSV (entradas e saídas). A conciliação oferece **somente** os membros com oferta mensal atrasada. Veja **SICREDI-PIX.md**.
- **Despesas e Tópicos**: subsistência do pastor, luz, água, combustível e tópicos criados pela paróquia, mês a mês.
- **Relatórios**: mensal (cada entrada e saída com descrição) e geral anual por tópico, ambos em PDF.
- **Calendário**: PDF refeito (desenhado direto, não sai mais em branco).
- Testes: `scripts/e2e-novos.mjs` (95 verificações; usa `scripts/gen-test-certs.sh` + `scripts/fake-sicredi.mjs`) e `npx tsx scripts/test-front.ts` (leitores de arquivo e PDFs).

## Permissões, segurança da Diretoria, arquivos e exportação
- **Permissões por usuário**: o presidente (perfil "Presidente/Administrador") marca, em *Usuários → Permissões*, quais telas cada pessoa abre e o que pode fazer em cada uma (ver, cadastrar, editar, excluir, exportar etc.). Sem marcação própria vale o padrão do perfil (`server/permissoes.ts`):
  - **Pastor**: sem Financeiro e sem Assinatura.
  - **Tesoureiro**: sem Departamentos.
  - **Secretaria**: ganha a tela *Atas* com importação, edição e exclusão; não cria departamentos; altera cargos da Diretoria só com a confirmação do presidente.
- **Segurança da Diretoria**: quem não tem "Alterar sem confirmação do presidente" gera uma *pendência*; ela aparece como aviso na conta do presidente (faixa no topo, selo no menu e painel na tela Diretoria) e só vale quando ele a confirma digitando a própria senha. Vale também para o cargo marcado na ficha do membro.
- **Atas** (menu "Atas"): todos os usuários da paróquia consultam (abrir, visualizar e baixar); só a Secretaria e o presidente importam, editam (nome e descrição) e excluem. A importação aceita .doc, .docx e .pdf (até 4 MB; 100 por paróquia), guardados no banco, com visualizador (PDF em páginas via pdf.js, .docx formatado via mammoth, .doc só como texto; o original pode ser baixado). O presidente não consegue liberar a alteração das atas para Pastor ou Tesoureiro, nem retirar a consulta de ninguém.
- **Membros**: contadores por situação e exportação em PDF, Excel (.xlsx) e Excel 97-2003 (.xls).
- Testes: `scripts/e2e-permissoes.mjs` (87 verificações; precisa de `scripts/gen-test-docs.sh`, que usa o LibreOffice) e `scripts/test-front.ts` (35).
