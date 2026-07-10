---
description: "Gerencie usuários, papéis integrados e personalizados, permissões, chaves de API, times, sessões e o log de auditoria no SnapOtter."
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 520ee01a5650
---

# Usuários, Papéis e Permissões {#users-roles-permissions}

O SnapOtter já vem com três papéis integrados, 17 permissões granulares e suporte a papéis personalizados com controle de acesso por ferramenta opcional. Esta página cobre todo o modelo de autorização, escopo de chaves de API, gerenciamento de times e log de auditoria.

::: tip Páginas relacionadas
[OIDC / SSO](/pt-BR/guide/oidc) | [SAML SSO](/pt-BR/guide/saml) | [Provisionamento SCIM](/pt-BR/guide/scim) | [Segurança e Hardening](/pt-BR/guide/security)
:::

## Usuários {#users}

### Criando usuários {#creating-users}

Os administradores podem criar usuários pelo painel de administração ou pelo endpoint `POST /api/auth/register`. Cada usuário tem um nome de usuário, um papel, uma atribuição de time e um endereço de e-mail opcional.

### Admin padrão {#default-admin}

Na primeira inicialização, o SnapOtter cria uma conta de admin padrão. As credenciais vêm de variáveis de ambiente:

| Variável | Padrão | Descrição |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | Nome de usuário da conta de admin inicial |
| `DEFAULT_PASSWORD` | `admin` | Senha da conta de admin inicial |

O admin padrão é obrigado a alterar a senha no primeiro login.

### Provedores de autenticação {#authentication-providers}

Os usuários podem se autenticar por vários métodos:

- **Local** - nome de usuário e senha armazenados no banco de dados do SnapOtter
- **OIDC** - qualquer provedor OpenID Connect (veja [OIDC / SSO](/pt-BR/guide/oidc))
- **SAML** - provedores de identidade SAML 2.0 (veja [SAML SSO](/pt-BR/guide/saml))
- **SCIM** - provisionamento automatizado a partir de um provedor de identidade (veja [Provisionamento SCIM](/pt-BR/guide/scim))

### Desativando a autenticação {#disabling-authentication}

Defina `AUTH_ENABLED=false` para desativar a autenticação por completo. Nesse modo, um usuário anônimo sintético com o papel `admin` é usado para todas as requisições. Nenhum login é necessário.

::: warning 
Desativar a autenticação concede acesso total de admin a qualquer pessoa que consiga alcançar a instância. Use isso apenas em ambientes confiáveis.
:::

## Papéis integrados {#built-in-roles}

O SnapOtter inclui três papéis integrados. Eles não podem ser modificados nem excluídos.

### Admin {#admin}

Todas as 17 permissões. Controle total sobre a instância.

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 permissões. Pode usar todas as ferramentas e gerenciar todos os arquivos e pipelines, mas não pode acessar funções de administração.

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 permissões. Pode usar ferramentas e gerenciar os próprios recursos.

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## Referência de permissões {#permissions-reference}

| Permissão | Descrição |
|---|---|
| `tools:use` | Usar qualquer ferramenta de processamento |
| `files:own` | Ver e gerenciar os próprios arquivos |
| `files:all` | Ver e gerenciar os arquivos de todos os usuários |
| `apikeys:own` | Criar e gerenciar as próprias chaves de API |
| `apikeys:all` | Ver as chaves de API de todos os usuários |
| `pipelines:own` | Criar e gerenciar os próprios pipelines |
| `pipelines:all` | Ver e gerenciar os pipelines de todos os usuários |
| `settings:read` | Ver as configurações da instância |
| `settings:write` | Modificar as configurações da instância |
| `users:manage` | Criar, atualizar e excluir contas de usuário |
| `teams:manage` | Criar, atualizar e excluir times |
| `features:manage` | Instalar e gerenciar bundles de recursos de IA |
| `system:health` | Acessar os endpoints de health e readiness |
| `audit:read` | Ver o log de auditoria e listar papéis |
| `compliance:manage` | Gerenciar o ciclo de vida de GDPR e recursos de conformidade |
| `webhooks:manage` | Configurar webhooks de saída |
| `security:manage` | Gerenciar configurações de segurança (lista de IPs permitidos, imposição de SSO) |

## Papéis personalizados {#custom-roles}

Os administradores com a permissão `security:manage` podem criar papéis personalizados pelo painel de administração ou pela API de papéis. Listar papéis requer `audit:read`.

### Criando um papel personalizado {#creating-a-custom-role}

```bash
curl -X POST http://localhost:1349/api/v1/roles \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reviewer",
    "description": "Can use tools and view all files",
    "permissions": ["tools:use", "files:own", "files:all", "settings:read"]
  }'
```

Os nomes de papéis devem ter de 2 a 30 caracteres, alfanuméricos em minúsculas, com hifens e underscores.

### Permissões reservadas ao admin {#admin-reserved-permissions}

Três permissões são reservadas aos papéis integrados e não podem ser atribuídas a papéis personalizados:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

A API de papéis rejeita qualquer requisição que inclua essas permissões. Somente o papel integrado `admin` tem acesso a elas.

### Permissões no nível de ferramenta {#tool-level-permissions}

Papéis personalizados podem, opcionalmente, restringir quais ferramentas os usuários podem acessar. Dois modos estão disponíveis:

| Modo | Comportamento | Requisito de licença |
|---|---|---|
| `category` | Restringir por modalidade (imagem, vídeo, áudio, documento, arquivo) | Nenhum (grátis) |
| `tool` | Restringir por ID individual de ferramenta | Requer o recurso enterprise `per_tool_permissions` |

Quando o modo `tool` está definido mas o recurso enterprise não está disponível, o SnapOtter degrada de forma controlada e permite o acesso a todas as ferramentas.

```json
{
  "name": "image-only",
  "permissions": ["tools:use", "files:own"],
  "toolPermissions": {
    "mode": "category",
    "allowed": ["image"]
  }
}
```

### Excluindo um papel personalizado {#deleting-a-custom-role}

Quando um papel personalizado é excluído, todos os usuários atribuídos a ele são automaticamente reatribuídos ao papel `user`.

## Times {#teams}

Os times agrupam usuários para gerenciamento de armazenamento e retenção. Um time `Default` é criado na primeira inicialização.

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | string | Nome único do time (1-50 caracteres) |
| `storageQuota` | number | Limite de armazenamento por time em bytes (funciona sem enterprise) |
| `retentionHours` | number | Excluir saídas automaticamente após esta quantidade de horas (requer `team_retention_overrides`, enterprise) |
| `legalHold` | boolean | Impedir a exclusão automática dos arquivos dos membros do time (requer `legal_hold`, enterprise) |

::: info 
O time `Default` não pode ser excluído. Times que ainda têm membros não podem ser excluídos. Reatribua os membros primeiro.
:::

## Chaves de API {#api-keys}

Os usuários podem gerar chaves de API para acesso programático. Cada chave usa o prefixo `si_` e é mostrada apenas uma vez, no momento da criação.

### Permissões com escopo {#scoped-permissions}

As chaves de API podem, opcionalmente, carregar um array `permissions`. Quando definido, as permissões efetivas de uma requisição são a **interseção** das permissões do papel do usuário com as permissões escopadas da chave. Isso significa que uma chave de API nunca pode escalar além das próprias permissões do usuário.

```bash
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer si_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI pipeline key",
    "permissions": ["tools:use", "files:own"],
    "expiresAt": "2027-01-01T00:00:00Z"
  }'
```

### Expiração {#expiration}

As chaves aceitam um timestamp `expiresAt` opcional. Chaves expiradas são rejeitadas no momento da autenticação.

## Log de auditoria {#audit-log}

O SnapOtter registra eventos relevantes para segurança em um log de auditoria estruturado, armazenado na tabela `audit_log` do banco de dados.

### Visualizando o log de auditoria {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

Requer a permissão `audit:read`. Suporta paginação (`page`, `limit`) e filtros (`action`, `ip`, `from`, `to`).

### Auditoria de operação de ferramentas {#tool-operation-auditing}

::: warning 
Eventos `TOOL_EXECUTED` **não** são registrados por padrão. Eles são opt-in por meio de um de dois caminhos:

1. Definir a configuração de admin `auditToolOperations` como `true`.
2. Ter uma licença ativa com o recurso `audit_export` (disponível nos planos team e enterprise).

Sem uma dessas condições, execuções individuais de ferramentas não são registradas no log de auditoria.
:::

### Exportando {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

Requer a permissão `audit:read` e o recurso enterprise `audit_export` (disponível nos planos team e enterprise). Suporta os formatos CSV e JSON, filtrados por `action`, `actorId`, `targetType`, `targetId`, `from` e `to`.

### Assinatura resistente a adulteração {#tamper-resistant-signing}

Quando habilitado, cada entrada do log de auditoria é assinada com um HMAC derivado de `DATA_ENCRYPTION_KEY`. Isso requer:

1. Definir `DATA_ENCRYPTION_KEY` no seu ambiente.
2. Habilitar a configuração de admin `tamperResistantAudit`.
3. Uma licença enterprise com o recurso `tamper_resistant_audit`.

### Retenção {#retention}

Defina `AUDIT_RETENTION_DAYS` para eliminar automaticamente entradas antigas. O padrão é `0`, o que significa que as entradas são mantidas indefinidamente.

### Referência de eventos {#event-reference}

| Evento | Categoria |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | Autenticação |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | Autenticação |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | Autenticação |
| `LOGOUT` | Autenticação |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | Gerenciamento de usuários |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | Gerenciamento de usuários |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | Papéis |
| `API_KEY_CREATED`, `API_KEY_DELETED` | Chaves de API |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | Configurações |
| `FILE_UPLOADED`, `FILE_DELETED` | Arquivos |
| `TOOL_EXECUTED` | Ferramentas (opt-in) |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | Conformidade |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | Conformidade |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | Configuração |

## Gerenciamento de sessões {#session-management}

As sessões são baseadas em cookies, controladas por `SESSION_DURATION_HOURS` (padrão: 168 horas / 7 dias).

### Mudanças de papel invalidam sessões {#role-changes-invalidate-sessions}

Quando um admin altera o papel de um usuário, todas as sessões ativas desse usuário são excluídas. O usuário precisa fazer login novamente para receber suas novas permissões.

### Proteções de segurança {#safety-guards}

- **Proteção do último admin**: o último admin restante não pode ser rebaixado para um papel inferior. A API retorna um erro se você tentar.
- **Prevenção de autoexclusão**: os administradores não podem excluir a própria conta pela API.
