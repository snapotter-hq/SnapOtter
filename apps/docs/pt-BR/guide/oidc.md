---
description: "Configure o Single Sign-On com OpenID Connect. Guias passo a passo para Keycloak, Authentik, Google e outros provedores OIDC."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: d91e31e0728d
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

O SnapOtter oferece suporte a OpenID Connect (OIDC) para single sign-on. Os usuários podem fazer login com um provedor de identidade externo, como Keycloak, Authentik ou Google, em vez de (ou junto com) a autenticação local por usuário/senha.

::: tip Veja também
[SAML SSO](/pt-BR/guide/saml) | [Provisionamento SCIM](/pt-BR/guide/scim) | [Usuários, Papéis e Permissões](/pt-BR/guide/users-roles)
:::

## Início rápido {#quick-start}

Adicione estas variáveis de ambiente ao seu `docker-compose.yml`:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

A URI de redirecionamento do seu provedor é sempre:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Por exemplo, se `EXTERNAL_URL` for `https://photos.example.com`, configure a URI de redirecionamento do seu provedor como `https://photos.example.com/api/auth/oidc/callback`.

## Referência de configuração {#configuration-reference}

| Variável | Padrão | Descrição |
|---|---|---|
| `OIDC_ENABLED` | `false` | Habilita o login OIDC. Um botão "Entrar com SSO" aparece na página de login. |
| `OIDC_ISSUER_URL` | | URL do issuer do provedor. Deve suportar OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | ID do cliente OAuth registrado com seu provedor. |
| `OIDC_CLIENT_SECRET` | | Segredo do cliente OAuth. |
| `OIDC_SCOPES` | `openid profile email` | Lista de escopos a solicitar, separados por espaço. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Cria automaticamente uma conta de usuário local no primeiro login OIDC. |
| `OIDC_DEFAULT_ROLE` | `user` | Papel atribuído a usuários OIDC criados automaticamente. Um de `admin`, `editor` ou `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Vincula uma identidade OIDC a um usuário local existente se o endereço de e-mail corresponder. |
| `OIDC_PROVIDER_NAME` | | Nome de exibição mostrado no botão de login (por exemplo, "Keycloak", "Google"). Se vazio, o botão diz "SSO". |
| `OIDC_CLOCK_TOLERANCE` | `30` | Tolerância de desvio de relógio em segundos para validação de token. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Claim do token de ID usada como nome de usuário para novas contas. |
| `EXTERNAL_URL` | | A URL pública onde o SnapOtter está acessível. Obrigatória para que o OIDC construa a URI de redirecionamento correta. |
| `COOKIE_SECRET` | gerado automaticamente | Segredo para assinar os cookies de sessão. Defina isto explicitamente ao executar várias réplicas. |

## Guias de provedores {#provider-guides}

### Keycloak {#keycloak}

1. Crie um novo realm (ou use um existente).
2. Vá para **Clients** e crie um novo cliente:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. Na aba **Settings** do cliente, defina **Valid redirect URIs** como sua URL de callback (por exemplo, `https://photos.example.com/api/auth/oidc/callback`).
4. Copie o **Client secret** da aba **Credentials**.
5. Defina `OIDC_ISSUER_URL` como `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. Na interface de administração, vá para **Applications > Providers** e crie um novo **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: Sua URL de callback
   - **Signing key**: Selecione uma chave existente ou crie uma
2. Crie uma **Application** e vincule-a ao provedor.
3. Copie o **Client ID** e o **Client Secret** das configurações do provedor.
4. Defina `OIDC_ISSUER_URL` como `https://authentik.example.com/application/o/snapotter/` (a barra final importa).

### Google {#google}

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Crie um projeto (ou selecione um existente).
3. Navegue até **APIs & Services > OAuth consent screen** e configure-o.
4. Vá para **APIs & Services > Credentials** e crie um **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Sua URL de callback
5. Copie o **Client ID** e o **Client secret**.
6. Defina `OIDC_ISSUER_URL` como `https://accounts.google.com`.
7. Defina `OIDC_USERNAME_CLAIM` como `email` (o Google não fornece `preferred_username`).

## Provisionamento de usuários {#user-provisioning}

### Criação automática {#auto-create}

Quando `OIDC_AUTO_CREATE_USERS` é `true` (o padrão), uma conta de usuário local é criada na primeira vez que alguém faz login via OIDC. O nome de usuário é obtido da claim especificada por `OIDC_USERNAME_CLAIM`, e o papel é definido como `OIDC_DEFAULT_ROLE`.

Se ocorrer uma colisão de nome de usuário, um sufixo numérico é anexado (por exemplo, `jane` vira `jane_2`).

### Vinculação automática {#auto-link}

Quando `OIDC_AUTO_LINK_USERS` é `true`, o SnapOtter vincula uma identidade OIDC a uma conta local existente se os endereços de e-mail corresponderem. Isso é útil quando você tem contas de usuário pré-criadas e quer que elas comecem a usar SSO sem perder seus dados.

::: warning 
Habilite a vinculação automática apenas se você confiar que seu provedor OIDC verifica os endereços de e-mail. Um e-mail não verificado poderia permitir que alguém assumisse a conta de outro usuário.
:::

### Desabilitando o login local {#disabling-local-login}

O OIDC não desabilita o login local por usuário/senha. Ambos os métodos permanecem disponíveis. Os administradores ainda podem fazer login com credenciais locais caso o provedor OIDC esteja inacessível.

## Certificados autoassinados {#self-signed-certificates}

Se o seu provedor OIDC usa um certificado autoassinado ou de uma CA privada, monte o pacote da CA no contêiner e aponte `NODE_EXTRA_CA_CERTS` para ele:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
Não defina `NODE_TLS_REJECT_UNAUTHORIZED=0`. Isso desabilita toda a verificação TLS e é um risco de segurança.
:::

## Solução de problemas {#troubleshooting}

### Incompatibilidade de URI de redirecionamento {#redirect-uri-mismatch}

O erro mais comum. Verifique estas diferenças entre o que seu provedor espera e o que o SnapOtter envia:

- `http` vs `https` - o esquema deve corresponder exatamente
- Barra final - alguns provedores são rigorosos quanto a isso
- Número da porta - inclua a porta se ela não for padrão
- Caminho - deve ser `/api/auth/oidc/callback`

Confira novamente `EXTERNAL_URL`. Ele deve corresponder à URL que os usuários digitam no navegador.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

O provedor OIDC está usando um certificado no qual o Node.js não confia. Veja [Certificados autoassinados](#self-signed-certificates) acima.

### Erros de desvio de relógio {#clock-skew-errors}

Se o relógio do seu servidor e o relógio do provedor OIDC estiverem fora de sincronia, a validação do token pode falhar. Aumente `OIDC_CLOCK_TOLERANCE` (o padrão é 30 segundos). Uma solução melhor é rodar NTP em ambas as máquinas.

### "OIDC provider unreachable" {#oidc-provider-unreachable}

O SnapOtter busca o documento de discovery do provedor na inicialização e durante o login. Verifique:

- Resolução de DNS de dentro do contêiner Docker (`docker exec snapotter nslookup auth.example.com`)
- Regras de firewall entre o contêiner e o provedor
- O valor de `OIDC_ISSUER_URL` - ele deve ser acessível a partir do servidor, não apenas do seu navegador

### Claims ausentes {#missing-claims}

Se os nomes de usuário ou e-mails estiverem vazios após o login, seu provedor pode não estar retornando as claims esperadas. Verifique:

- Os escopos configurados em `OIDC_SCOPES` incluem `profile` e `email`
- O provedor está configurado para incluir a claim especificada em `OIDC_USERNAME_CLAIM` no token de ID
- Alguns provedores exigem configuração explícita de mapper/escopo para liberar as claims
