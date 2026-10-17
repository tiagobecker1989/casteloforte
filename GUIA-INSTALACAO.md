# Guia completo: instalar, rodar localmente e publicar (Vercel + Neon)

## 1. O que instalar e criar

**No seu computador**
| O quê | Para quê | Onde |
|---|---|---|
| **Node.js 22 LTS** (22.13 ou mais novo; já inclui o npm) | rodar o sistema | nodejs.org |
| **Git** | enviar o código para o GitHub/Vercel | git-scm.com |
| Editor de código (opcional) | editar arquivos | ex.: VS Code |

Confira no terminal: `node -v` (deve mostrar v22.13 ou maior) e `git --version`.
Não precisa instalar banco de dados: localmente o sistema usa SQLite embutido.

**Contas (gratuitas para começar)**
| Conta | Para quê | Obrigatória? |
|---|---|---|
| GitHub (ou GitLab/Bitbucket) | guardar o código e ligar à Vercel | sim, para publicar |
| Vercel | hospedar o site e a API | sim, para publicar |
| Neon | banco Postgres na nuvem | sim, para publicar |
| Provedor de e-mail SMTP | recuperação de senha e aviso de aprovação | recomendado |
| Asaas | cobrança online das paróquias | opcional |
| Google AI Studio | chave do Gemini (IA pastoral) | opcional |

## 2. Rodar na sua máquina

1. Descompacte o zip e abra um terminal na pasta do projeto.
2. Instale as dependências:
   ```
   npm install
   ```
3. Crie o arquivo de configuração a partir do modelo:
   - Windows (PowerShell): `copy .env.example .env.local`
   - Mac/Linux: `cp .env.example .env.local`
4. Abra o `.env.local` e preencha **pelo menos**:
   ```
   JWT_SECRET=uma-frase-longa-e-aleatoria
   SEED_ADMIN_EMAIL=seu-email@exemplo.com
   SEED_ADMIN_PASSWORD=uma-senha-forte
   ```
   (Sem `JWT_SECRET` o sistema funciona, mas todos saem da sessão toda vez que você reinicia.)
5. Inicie:
   ```
   npm run dev
   ```
6. Abra **http://localhost:3000** e entre com o e-mail e a senha do passo 4. Esse é o administrador da **sede**.

Os dados locais ficam em `data/ielb.db` (SQLite). Apague a pasta `data` para recomeçar do zero.

Sem SMTP configurado, os e-mails (recuperação de senha, aprovação) **não são enviados**: o texto e o link aparecem no terminal.

**Modo "produção" local** (testar o site já compilado): `npm run build` e depois `npm start`.

## 3. Acessar de outro aparelho da mesma rede (celular, outro PC)
O servidor já escuta em toda a rede. Descubra o IP do seu computador (`ipconfig` no Windows; `ifconfig` ou `ip a` no Mac/Linux) e, no outro aparelho, abra `http://IP-DO-SEU-PC:3000`.
No Windows, aceite a permissão do Firewall quando ele perguntar. O outro aparelho precisa estar no mesmo Wi-Fi.

## 4. Usar o banco da Neon também na sua máquina (opcional)
Para desenvolver com o mesmo tipo de banco da produção, crie na Neon um *branch* de desenvolvimento e coloque a connection string **pooled** em `DATABASE_URL` no `.env.local`. Use um branch separado: nunca aponte o ambiente local para os dados reais. Depois: `npm run db:migrate` e `npm run dev`.

## 5. Publicar na Vercel com banco na Neon

### 5.1 Neon
1. Crie uma conta e um projeto em neon.tech (escolha a região mais próxima de seus usuários).
2. Clique em **Connect** e copie duas strings:
   - **Pooled** (o host tem `-pooler`) → será o `DATABASE_URL`
   - **Direct** (sem `-pooler`) → será o `DATABASE_URL_UNPOOLED`

### 5.2 GitHub
Na pasta do projeto:
```
git init
git add .
git commit -m "Primeira versão"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```
(Crie antes o repositório vazio no GitHub, de preferência **privado**.) O `.gitignore` já impede o envio de `.env.local` e de `data/`. O arquivo `api/index.js` **deve** ser enviado: ele é a API.

Antes do primeiro envio, garanta que o `api/index.js` está atualizado: `npm run build:api`.

### 5.3 Vercel
1. Em vercel.com: **Add New → Project** e importe o repositório.
2. Em **Environment Variables**, cadastre antes de publicar:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | string pooled da Neon |
| `DATABASE_URL_UNPOOLED` | string direct da Neon |
| `JWT_SECRET` | texto aleatório longo (`openssl rand -hex 32`) |
| `APP_URL` | `https://SEU-PROJETO.vercel.app` (ou seu domínio) |
| `SEED_ADMIN_EMAIL` | e-mail do administrador da sede |
| `SEED_ADMIN_PASSWORD` | senha do administrador da sede |
| `CRON_SECRET` | outro texto aleatório longo |
| `SECRETS_KEY` | `openssl rand -base64 32` (criptografa as credenciais do banco; guarde uma cópia) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | seu provedor de e-mail |
| `DPO_EMAIL`, `OPERADORA_NOME` | textos de LGPD |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | só se usar pagamento online |
| `GEMINI_API_KEY` | só se usar a IA |

3. Clique em **Deploy**. O `vercel.json` já configura tudo (build, rota `/api`, cron diário, região São Paulo).
4. Abra `https://SEU-PROJETO.vercel.app/api/legal`: deve aparecer um JSON. Depois entre no site com o administrador da sede.
5. Se usar o Asaas, cadastre no painel dele o webhook `https://SEU-PROJETO.vercel.app/api/webhooks/asaas` com o mesmo `ASAAS_WEBHOOK_TOKEN`.

### 5.4 Domínio próprio (opcional)
Vercel → Settings → Domains → adicione o domínio e siga as instruções de DNS. Depois atualize `APP_URL` e faça um novo deploy.

## 6. Atualizar o sistema depois
- Mudou algo em `server/`? Rode `npm run build:api` e envie o `api/index.js` junto no commit.
- Mudou tabelas? Aumente `SCHEMA_VERSAO` em `server/db.ts`.
- Então: `git add . && git commit -m "..." && git push`. A Vercel publica sozinha.

## 7. Problemas comuns
| Sintoma | O que fazer |
|---|---|
| `node -v` abaixo de 22.13 | atualize o Node |
| Erro ao abrir o banco local sobre `node:sqlite` | Node antigo: atualize para 22.13+ |
| Local: "Porta 3000 em uso" | defina `PORT=3001` no `.env.local` |
| Vercel: `DATABASE_URL não configurada` | variável ausente no ambiente (Production/Preview) |
| Vercel: `Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD` | cadastre essas duas variáveis e refaça o deploy |
| Vercel: `JWT_SECRET é obrigatório` | cadastre `JWT_SECRET` |
| Login falha com a senha certa na Vercel | veja o log da chamada `/api/auth/login` em Logs |
| Link do e-mail aponta para `localhost` | ajuste `APP_URL` |
| 402 ao salvar | paróquia com fatura em atraso (modo somente leitura) |
| 429 | muitas tentativas de login; espere 10 minutos |
