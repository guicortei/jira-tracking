# Jira Tracking

Dashboard Next.js para listar projetos e tickets do Jira Cloud, com projeção de entrega para o projeto Checkout TechTeam (CT).

## Variáveis de ambiente

Copie `.env.example` para `.env` localmente. Na Vercel, configure em **Project → Settings → Environment Variables**:

| Variável | Descrição |
|----------|-----------|
| `JIRA_EMAIL` | E-mail da conta Atlassian |
| `JIRA_API_KEY` | API token ([id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)) |
| `JIRA_DOMAIN` | Domínio do site, ex: `flowborder.atlassian.net` |
| `AUTH_PASSWORD` | Senha de acesso ao dashboard (login na página inicial) |

## Desenvolvimento local

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Deploy na Vercel

1. Importe o repositório em [vercel.com/new](https://vercel.com/new).
2. Framework: **Next.js** (detectado automaticamente).
3. Adicione as três variáveis de ambiente acima (Production, Preview e Development).
4. Deploy.

Comandos de build padrão (não é preciso alterar):

- **Build Command:** `npm run build`
- **Output:** gerenciado pelo Next.js
- **Install Command:** `npm install`

As rotas `/api/projects/*` usam `maxDuration` de 60s porque buscam changelog do Jira em lote. No plano Hobby o limite da Vercel é 60s; em projetos com muitos tickets, use plano Pro se precisar de mais tempo.

## Scripts

```bash
npm run dev    # desenvolvimento
npm run build  # build de produção
npm run start  # servidor após build
npm run lint   # ESLint
```
