---
description: "Configure o provisionamento SCIM 2.0 para sincronizar usuários e grupos do seu provedor de identidade com o SnapOtter. Abrange Okta, Azure AD / Entra ID e integrações personalizadas."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 6140de972193
---

# Provisionamento SCIM {#scim-provisioning}

O SnapOtter implementa o SCIM 2.0 (System for Cross-domain Identity Management) para o provisionamento automatizado de usuários e grupos. Seu provedor de identidade pode criar, atualizar, desativar e reativar contas de usuário e sincronizar associações a grupos automaticamente.

::: tip Recurso enterprise
O provisionamento SCIM requer uma licença **enterprise** com o recurso `scim`. Ele não está disponível no plano team. Sem o recurso, todos os endpoints SCIM (exceto discovery) retornam 403.
:::

## Pré-requisitos {#prerequisites}

- Uma instância do SnapOtter em execução, acessível em uma URL pública
- Uma chave de licença enterprise com o recurso `scim`
- Acesso de administrador ao SnapOtter (a permissão `users:manage` é necessária para gerar ou revogar um token SCIM)
- Acesso de administrador às configurações de provisionamento do seu provedor de identidade

## Início rápido {#quick-start}

1. Gere um token bearer SCIM:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

A resposta contém o token. Salve-o imediatamente; ele não pode ser recuperado novamente.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. No seu provedor de identidade, configure o provisionamento SCIM com:
   - **URL base**: `https://photos.example.com/api/v1/scim/v2`
   - **Autenticação**: token bearer (cole o token da etapa 1)

## Autenticação {#authentication}

Os endpoints SCIM usam um token Bearer dedicado, separado das sessões de usuário e das chaves de API.

### Gerando um token {#generating-a-token}

`POST /api/v1/enterprise/scim/token` gera um novo token SCIM. Este endpoint requer uma sessão válida com a permissão `users:manage`.

O token é retornado em texto simples exatamente uma vez. O SnapOtter armazena apenas um hash scrypt. Se você perder o token, revogue-o e gere um novo.

Apenas um token SCIM fica ativo por vez. Gerar um novo token substitui o anterior.

### Revogando um token {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` revoga o token SCIM atual. Este endpoint também requer `users:manage`.

### Limite de taxa {#rate-limiting}

Os endpoints SCIM têm limite de taxa de 1000 requisições por minuto por token. Exceder esse limite retorna HTTP 429.

## Recursos suportados {#supported-resources}

| Recurso SCIM | Conceito no SnapOtter | Criar | Ler | Atualizar | Excluir |
|---|---|---|---|---|---|
| User | Conta de usuário | Sim | Sim | Sim | Exclusão suave |
| Group | Team | Sim | Sim | Sim | Sim |

::: warning 
Os Groups do SCIM mapeiam para **teams** do SnapOtter, não para papéis. O SCIM não pode definir o papel de um usuário. Todos os usuários criados via SCIM recebem o papel `user`. Para alterar o papel de um usuário, use a interface de administração do SnapOtter.
:::

## Operações de usuário {#user-operations}

### Criar usuário {#create-user}

`POST /api/v1/scim/v2/Users`

Cria uma nova conta de usuário com `authProvider` definido como `scim` e o papel `user`. O usuário é atribuído ao team Default. Se `active` for `false`, o papel é definido como `disabled` em vez disso.

Atributos obrigatórios: `userName`. Opcionais: `externalId`, `emails`, `active` (padrão `true`).

### Listar e filtrar usuários {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Retorna uma lista paginada de usuários. Suporta os parâmetros de consulta `startIndex` e `count` (máximo de 200 resultados por página).

A filtragem suporta apenas `eq` (igual), nestes atributos:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Outros operadores de filtro e atributos retornam HTTP 400.

### Obter usuário {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Retorna um único usuário pelo seu ID de usuário no SnapOtter.

### Substituir usuário {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Substitui os atributos do usuário. Suporta `userName`, `externalId`, `emails` e `active`. Alterações de nome de usuário são verificadas quanto a conflitos (409 se o novo nome de usuário já estiver em uso por outro usuário).

### Aplicar patch em usuário {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Atualização parcial usando SCIM PatchOp. Operações suportadas:

| Operação | Caminhos |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Igual a `replace` |
| `remove` | `externalId`, `emails` |

Os caminhos `name.formatted` e `displayName` são aceitos por compatibilidade, mas não têm efeito persistente (o SnapOtter não armazena um nome de exibição separado).

Operações `replace` sem valor (onde o valor é um objeto sem um `path`) também são suportadas, com as chaves `userName`, `externalId`, `emails` e `active`.

### Desativar usuário (exclusão suave) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

O SnapOtter não exclui usuários permanentemente via SCIM. Em vez disso, o DELETE realiza uma desativação suave:

1. O papel do usuário é alterado do seu valor atual (por exemplo, `editor`) para `disabled:editor`, preservando o papel original.
2. A senha do usuário é apagada.
3. Todas as sessões ativas são revogadas.
4. Todas as chaves de API são revogadas.

O usuário não pode mais fazer login nem usar nenhuma chave de API. Seus dados (arquivos, histórico) são mantidos.

### Reativar usuário {#reactivate-user}

Para reativar um usuário previamente desativado, envie uma requisição `PUT` ou `PATCH` com `active: true`. O SnapOtter restaura o papel original de antes da desativação (por exemplo, `disabled:editor` volta a ser `editor`). Se o papel original não puder ser determinado, ele recorre a `user`.

::: details Exemplo: desativar e reativar via PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Operações de grupo {#group-operations}

Os Groups do SCIM mapeiam para teams do SnapOtter. Criar um grupo cria um team. A associação a grupos controla a qual team um usuário pertence.

### Criar grupo {#create-group}

`POST /api/v1/scim/v2/Groups`

Obrigatório: `displayName`. Opcional: `members` (array de `{ value: userId }`).

### Listar e filtrar grupos {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

A filtragem suporta apenas `displayName eq "..."`. Paginado com `startIndex` e `count` (máximo de 200 resultados por página).

### Obter grupo {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Substituir grupo {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Substitui o nome do grupo e a lista completa de membros. Membros existentes que não estão na nova lista são movidos para o team Default.

### Aplicar patch em grupo {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Suporta estas operações:

| Operação | Caminho | Efeito |
|---|---|---|
| `add` | `members` | Adiciona usuários ao team |
| `remove` | `members[value eq "userId"]` | Move o usuário para o team Default |
| `replace` | `displayName` | Renomeia o team |
| `replace` | `members` | Substitui todos os membros (membros removidos são movidos para o team Default) |

### Excluir grupo {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Exclui o team. Todos os membros do team excluído são movidos para o team Default. Os usuários não são desativados nem excluídos.

## Configuração do IdP {#idp-setup}

### Okta {#okta}

1. No console de administração do Okta, abra seu aplicativo SnapOtter (ou crie um).
2. Vá para a aba **Provisioning** e clique em **Configure API Integration**.
3. Marque **Enable API Integration** e insira:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: o token bearer SCIM gerado acima
4. Clique em **Test API Credentials** e depois em **Save**.
5. Em **Provisioning > To App**, ative:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. Em **Push Groups**, configure quais grupos do Okta sincronizar como teams do SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. No portal do Azure, vá para seu aplicativo enterprise do SnapOtter.
2. Vá para **Provisioning** e defina **Provisioning Mode** como **Automatic**.
3. Em **Admin Credentials**, insira:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: o token bearer SCIM gerado acima
4. Clique em **Test Connection** e depois em **Save**.
5. Em **Mappings**, configure os mapeamentos de atributos de usuário e grupo. Os padrões geralmente funcionam, mas verifique se `userName` mapeia para `userPrincipalName` ou `mail` conforme desejado.
6. Defina **Provisioning Status** como **On** e salve.

O Azure provisiona usuários e grupos em um ciclo de sincronização fixo (normalmente a cada 40 minutos).

## Endpoints de discovery {#discovery-endpoints}

Estes três endpoints estão disponíveis sem autenticação e descrevem as capacidades do servidor SCIM:

| Endpoint | Descrição |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Capacidades do servidor e recursos suportados |
| `GET /api/v1/scim/v2/Schemas` | Definições de schema de User e Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Tipos de recurso disponíveis (User, Group) |

O `ServiceProviderConfig` anuncia estas capacidades:

| Recurso | Suportado |
|---|---|
| Patch | Sim |
| Bulk | Não |
| Filter | Sim (máx. 200 resultados, apenas o operador `eq`) |
| Change password | Não |
| Sort | Não |
| ETag | Não |

## Limitações {#limitations}

- **Filtragem**: Apenas o operador `eq` é suportado. Filtros complexos, os operadores `and`/`or`, `co` (contém) e `sw` (começa com) não são implementados.
- **Operações em lote**: Não suportadas.
- **Sort e ETag**: Não suportados.
- **Papéis**: O SCIM não pode atribuir papéis do SnapOtter. Todos os usuários provisionados recebem o papel `user`.
- **MAX_USERS**: O limite da variável de ambiente `MAX_USERS` não é aplicado na criação de usuários via SCIM. Se você precisar limitar a contagem de usuários, gerencie as atribuições no seu IdP.
- **Um token**: Apenas um token SCIM pode ficar ativo por vez. Se vários IdPs precisarem de acesso SCIM, eles precisam compartilhar o token.
- **Grupos são teams**: Os Groups do SCIM correspondem a teams, não a papéis ou grupos de permissão.

## Solução de problemas {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Sua licença não inclui o recurso `scim`, ou nenhuma licença está configurada. O SCIM requer uma licença de plano enterprise. Verifique se `SNAPOTTER_LICENSE_KEY` está definido e se a licença inclui o recurso `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

A requisição SCIM não incluiu um cabeçalho `Authorization: Bearer <token>`. Verifique a configuração de provisionamento do seu IdP.

### 401 "Invalid token" {#_401-invalid-token}

O token não corresponde ao hash armazenado. Isso acontece se o token foi revogado e regerado. Atualize o token nas configurações de provisionamento do seu IdP.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Nenhum token SCIM foi gerado ainda. Use o endpoint `POST /api/v1/enterprise/scim/token` para criar um.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Já existe um usuário com o mesmo nome de usuário. Isso pode acontecer quando um IdP tenta novamente uma criação que falhou. Verifique se há nomes de usuário duplicados no painel de administração do SnapOtter.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

O IdP está enviando mais de 1000 requisições por minuto. Isso normalmente acontece durante uma grande sincronização inicial. A maioria dos IdPs tenta novamente automaticamente após a redefinição da janela de limite de taxa. Se o problema persistir, verifique o intervalo de sincronização de provisionamento do seu IdP.

### Usuários desprovisionados, mas não removidos da interface {#users-deprovisioned-but-not-removed-from-the-ui}

O DELETE do SCIM é uma desativação suave. Usuários desativados ainda aparecem na lista de usuários do administrador com um status desabilitado. Isso é intencional, para que seus dados sejam preservados. O papel deles aparece como `disabled:<original-role>`.
