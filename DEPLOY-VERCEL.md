# Publicar na Vercel com banco na Neon

Arquitetura: **frontend estático** (Vite, pasta `dist`) + **API Express como uma única função serverless** (`api/index.js`)
+ **Postgres na Neon**. O agendamento de cobrança roda pelo **Vercel Cron**.

## 1. Banco de dados (Neon)
1. Crie um projeto em neon.tech. Se puder escolher a região, use a mais próxima de seus usuários (para o Brasil, São Paulo, se disponível) e a mesma região para as funções da Vercel (`regions` no `vercel.json` está em `gru1`, São Paulo).
2. No painel do projeto, clique em **Connect** e copie duas strings:
   - **Pooled** (host com `-pooler`): vai em `DATABASE_URL`. É a que a aplicação usa.
   - **Direct/Unpooled** (sem `-pooler`): vai em `DATABASE_URL_UNPOOLED`. É usada só para criar as tabelas no build.
3. Não precisa criar tabelas à mão: o esquema é criado sozinho no build (`npm run db:migrate`) e conferido no 1º acesso.

> Atalho: a integração **Neon** do Marketplace da Vercel cria o banco e já preenche `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.

## 2. Projeto na Vercel
1. Suba este projeto para um repositório (GitHub/GitLab) **incluindo `api/index.js`** (arquivo gerado, já vem no zip) e importe na Vercel.
   O `vercel.json` já define: framework Vite, comando de build, saída `dist`, rota `/api/*` → função e o cron diário.
2. Em **Settings → Environment Variables** cadastre (Production, e Preview se quiser testar):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string **pooled** da Neon |
| `DATABASE_URL_UNPOOLED` | connection string **direta** da Neon |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `APP_URL` | `https://seu-projeto.vercel.app` (ou seu domínio) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | login do administrador da sede (criado no 1º acesso). **Obrigatório** |
| `CRON_SECRET` | `openssl rand -hex 32` (a Vercel envia no cabeçalho do cron) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | e-mail transacional (recuperação de senha, aprovação) |
| `DPO_EMAIL`, `OPERADORA_NOME` | textos de LGPD |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | pagamento online (opcional; ver README) |
| `GEMINI_API_KEY` | IA pastoral (opcional) |

3. **Deploy.** Ao terminar: abra a URL, entre com o administrador da sede e confira "Planos e Cobrança".
4. Webhook do Asaas (se usar): `https://SEU-DOMINIO/api/webhooks/asaas`.

## 3. Atualizar o código
- Alterou algo em `server/`? Rode `npm run build:api` e **faça commit do `api/index.js` atualizado**. (O build da Vercel também o regenera.)
- Alterou tabelas? Aumente `SCHEMA_VERSAO` em `server/db.ts`. O build aplica a migração.

## 4. Pontos de atenção
- **Cron:** no plano Hobby a Vercel só permite 1 execução por dia e pode atrasar dentro da janela; o `vercel.json` agenda 09:00 UTC (06:00 em Brasília). O job é idempotente (pode rodar mais de uma vez). Cron só roda em produção.
- **Preview deployments** compartilham as variáveis que você liberar para Preview: use um *branch* do banco na Neon para não misturar dados de teste com os reais.
- **Limites de tentativa de login/cadastro** ficam no banco (tabela `limites`), pois a memória não é compartilhada entre instâncias.
- **Webhook genérico com HMAC** (`/api/webhooks/pagamento`): na Vercel o corpo pode chegar já interpretado; use o webhook do Asaas (token no cabeçalho), que não depende do corpo bruto.
- **Domínio próprio:** configure em Settings → Domains e atualize `APP_URL`.
- **Backup:** use o histórico/branches da Neon; a exportação LGPD da paróquia (tela Privacidade) também serve de cópia por paróquia.
