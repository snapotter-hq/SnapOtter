---
description: "Configure o Single Sign-On SAML 2.0 para o SnapOtter. Guias passo a passo para Okta, Azure AD / Entra ID, Google Workspace e outros provedores de identidade SAML."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 043f5614de62
---

# SAML SSO {#saml-sso}

O SnapOtter oferece suporte a SAML 2.0 para single sign-on. Os usuários podem fazer login por meio de um provedor de identidade externo (Okta, Azure AD / Entra ID, Google Workspace ou qualquer IdP SAML 2.0 padrão) em vez da autenticação local por usuário/senha.

::: tip Recurso enterprise
O SAML SSO requer uma licença **team** ou **enterprise** com o recurso `saml_sso`. Se `SAML_ENABLED=true` estiver definido sem uma licença válida, as rotas SAML são ignoradas silenciosamente e um aviso é registrado.
:::

## Pré-requisitos {#prerequisites}

- Uma instância do SnapOtter em execução, acessível em uma URL pública
- `EXTERNAL_URL` definido para essa URL pública (por exemplo, `https://photos.example.com`)
- Uma chave de licença team ou enterprise com o recurso `saml_sso`
- Acesso de administrador ao seu provedor de identidade SAML

## Início rápido {#quick-start}

Adicione estas variáveis de ambiente ao seu `docker-compose.yml`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

Reinicie o contêiner. Um botão "Entrar com SAML" (ou o rótulo definido por `SAML_PROVIDER_NAME`) aparece na página de login.

## Referência de configuração {#configuration-reference}

| Variável | Padrão | Descrição |
|---|---|---|
| `SAML_ENABLED` | `false` | Habilita o login SAML. |
| `SAML_IDP_SSO_URL` | | URL do endpoint SSO do IdP. **Obrigatória** quando o SAML está habilitado. |
| `SAML_IDP_CERTIFICATE` | | Certificado de assinatura X.509 do IdP em formato PEM (o texto do certificado em si, não um caminho de arquivo). **Obrigatório** quando o SAML está habilitado. |
| `EXTERNAL_URL` | | A URL pública onde o SnapOtter está acessível. **Obrigatória** quando o SAML está habilitado. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI enviado ao IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL do Assertion Consumer Service (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Cria automaticamente uma conta de usuário local no primeiro login SAML. |
| `SAML_AUTO_LINK_USERS` | `false` | Vincula uma identidade SAML a um usuário local existente se o endereço de e-mail corresponder. |
| `SAML_DEFAULT_ROLE` | `user` | Papel atribuído a usuários SAML criados automaticamente. Um de `admin`, `editor` ou `user`. |
| `SAML_PROVIDER_NAME` | | Rótulo de exibição para o botão de login SAML no frontend (por exemplo, "Okta", "Azure AD"). Se vazio, o botão diz "SAML". |
| `SAML_USERNAME_ATTRIBUTE` | | Atributo da asserção SAML usado como nome de usuário. Se vazio, recorre à parte local do e-mail e, então, ao NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Atributo da asserção SAML usado como endereço de e-mail do usuário. |

O servidor se recusa a iniciar se `SAML_ENABLED=true` e qualquer uma das três variáveis obrigatórias (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) estiver ausente.

::: details Notas de segurança
Tanto `wantAuthnResponseSigned` quanto `wantAssertionsSigned` estão fixados em `true`. O SnapOtter rejeita respostas SAML não assinadas ou assinadas incorretamente. Asserções de um IdP confiável são tratadas como e-mail verificado.

Apenas login iniciado pelo SP é suportado. O SnapOtter não suporta login iniciado pelo IdP (não solicitado) nem Single Logout (SLO). Sair do SnapOtter não desconecta o usuário do IdP.
:::

## Metadados do SP e URLs {#sp-metadata-and-urls}

Seu IdP precisa de três valores do SnapOtter:

| Campo | Valor |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Por exemplo, se `EXTERNAL_URL` for `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Endpoint de metadados: `https://photos.example.com/api/auth/saml/metadata` (retorna XML)

Alguns IdPs conseguem importar a URL de metadados do SP diretamente, o que preenche automaticamente a ACS URL e o Entity ID.

## Configuração do provedor {#provider-setup}

### Okta {#okta}

1. No console de administração do Okta, vá para **Applications > Create App Integration**.
2. Selecione **SAML 2.0** e clique em **Next**.
3. Defina um nome (por exemplo, "SnapOtter") e clique em **Next**.
4. Configure as definições SAML:
   - **Single sign-on URL**: Sua ACS URL (por exemplo, `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Seu Entity ID (por exemplo, `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. Em **Attribute Statements**, adicione `email` mapeado para `user.email`.
6. Clique em **Next**, depois em **Finish**.
7. Vá para a aba **Sign On**, clique em **View SAML setup instructions** e copie:
   - **Identity Provider Single Sign-On URL** para `SAML_IDP_SSO_URL`
   - **X.509 Certificate** para `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. No portal do Azure, vá para **Microsoft Entra ID > Enterprise applications > New application**.
2. Clique em **Create your own application**, nomeie-a como "SnapOtter" e selecione **Integrate any other application you don't find in the gallery**.
3. Vá para **Single sign-on > SAML** e clique em **Edit** na seção **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Seu Entity ID (por exemplo, `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Sua ACS URL (por exemplo, `https://photos.example.com/api/auth/saml/callback`)
4. Em **SAML Certificates**, baixe o **Certificate (Base64)**.
5. Em **Set up SnapOtter**, copie a **Login URL**.
6. Defina `SAML_IDP_SSO_URL` como a Login URL e `SAML_IDP_CERTIFICATE` como o conteúdo do certificado baixado.
7. Atribua usuários ou grupos ao aplicativo em **Users and groups**.

### Google Workspace {#google-workspace}

1. No console de administração do Google, vá para **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Nomeie o app como "SnapOtter" e clique em **Continue**.
3. Na página **Google Identity Provider details**, copie a **SSO URL** e baixe o **Certificate**. Clique em **Continue**.
4. Configure os detalhes do Service Provider:
   - **ACS URL**: Sua ACS URL (por exemplo, `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Seu Entity ID (por exemplo, `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Clique em **Continue**, depois em **Finish**.
6. Ative o app (**ON**) para suas unidades organizacionais.
7. Defina `SAML_IDP_SSO_URL` como a SSO URL da etapa 3 e `SAML_IDP_CERTIFICATE` como o conteúdo do certificado baixado.

### IdP SAML 2.0 genérico {#generic-saml-2-0-idp}

Para qualquer provedor de identidade compatível com SAML 2.0:

1. Crie um novo aplicativo/service provider SAML no seu IdP.
2. Defina a **ACS URL** como `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Defina o **Entity ID** / **Audience** como `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Configure o IdP para enviar o e-mail do usuário em um atributo chamado `email` (ou defina `SAML_EMAIL_ATTRIBUTE` para corresponder ao nome do atributo do seu IdP).
5. Copie a **IdP SSO URL** e o **certificado de assinatura** para `SAML_IDP_SSO_URL` e `SAML_IDP_CERTIFICATE`.

## Provisionamento de usuários {#user-provisioning}

### Criação automática {#auto-create}

Quando `SAML_AUTO_CREATE_USERS` é `true` (o padrão), uma conta de usuário local é criada na primeira vez que alguém faz login via SAML. O papel é definido como `SAML_DEFAULT_ROLE`.

O nome de usuário é derivado nesta ordem:

1. O valor do atributo da asserção especificado por `SAML_USERNAME_ATTRIBUTE` (se definido e presente)
2. A parte local do endereço de e-mail (tudo antes de `@`)
3. O NameID do SAML

Se ocorrer uma colisão de nome de usuário, um sufixo numérico é anexado (por exemplo, `jane` vira `jane_2`).

### Vinculação automática {#auto-link}

Quando `SAML_AUTO_LINK_USERS` é `true`, o SnapOtter vincula uma identidade SAML a uma conta local existente se os endereços de e-mail corresponderem. Isso é útil quando você tem contas de usuário pré-criadas e quer que elas comecem a usar SSO sem perder seus dados.

::: warning 
Habilite a vinculação automática apenas se você confiar que seu IdP SAML verifica os endereços de e-mail. Um e-mail não verificado de um IdP mal configurado poderia permitir que alguém assumisse a conta de outro usuário.
:::

### Mapeamento de atributos {#attribute-mapping}

| Campo do SnapOtter | Origem | Configuração |
|---|---|---|
| E-mail | Atributo da asserção | `SAML_EMAIL_ATTRIBUTE` (padrão: `email`) |
| Nome de usuário | Atributo da asserção, e-mail ou NameID | `SAML_USERNAME_ATTRIBUTE` (veja a ordem de derivação acima) |
| ID externo | NameID | Sempre o NameID do SAML, não configurável |

## Aplicação obrigatória de SSO {#sso-enforcement}

Se você quiser exigir que todos os usuários façam login via SAML (ou OIDC) e bloquear o login local por senha, habilite a aplicação obrigatória de SSO:

1. Garanta que o recurso enterprise `sso_enforcement` esteja licenciado (disponível nos planos team e enterprise).
2. Em **Admin Settings > Security**, ative a opção **SSO Enforcement**.
3. Defina um **break-glass username**: esta é a única conta local que ainda pode fazer login com senha, para acesso de emergência caso o IdP esteja inacessível.

Quando a aplicação obrigatória de SSO está ativa, qualquer tentativa de login local (exceto para o usuário break-glass) retorna um erro 403 com a mensagem "Local password login is disabled. Please use SSO."

::: tip 
Sempre configure um break-glass username antes de habilitar a aplicação obrigatória de SSO. Sem ele, você poderá ficar bloqueado fora do SnapOtter se o seu IdP cair.
:::

## Usando SAML junto com OIDC {#using-saml-alongside-oidc}

SAML e OIDC podem ser habilitados simultaneamente. Quando ambos estão ativos, a página de login mostra botões separados para cada provedor (rotulados por `SAML_PROVIDER_NAME` e `OIDC_PROVIDER_NAME`). Os usuários podem fazer login com qualquer um dos métodos.

Ambos os provedores compartilham as mesmas configurações de criação automática, vinculação automática e aplicação obrigatória de SSO de forma independente: cada um tem suas próprias variáveis `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` e `*_DEFAULT_ROLE`.

## Solução de problemas {#troubleshooting}

### Falha na validação da asserção {#assertion-validation-failed}

A assinatura da resposta SAML ou a assinatura da asserção não pôde ser verificada. Verifique:

- O certificado em `SAML_IDP_CERTIFICATE` corresponde ao certificado de assinatura atual no seu IdP (certificados são renovados, então verifique a expiração)
- O certificado está em formato PEM (começa com `-----BEGIN CERTIFICATE-----`)
- O certificado é o texto completo, não um caminho de arquivo
- A ACS URL e o Entity ID configurados no seu IdP correspondem exatamente aos valores do SnapOtter (esquema, host, porta, caminho)

### Atributos ausentes {#missing-attributes}

Se os nomes de usuário ou e-mails estiverem vazios após o login, seu IdP pode não estar enviando os atributos esperados. Verifique:

- Seu IdP está configurado para liberar um atributo `email` (ou o que quer que `SAML_EMAIL_ATTRIBUTE` esteja definido)
- Se estiver usando `SAML_USERNAME_ATTRIBUTE`, verifique se esse atributo está incluído na asserção
- Alguns IdPs exigem configuração explícita de mapeamento de atributos antes de liberarem as claims

### Desvio de relógio {#clock-skew}

As asserções SAML incluem condições de timestamp (`NotBefore`, `NotOnOrAfter`). Se o relógio do seu servidor e o relógio do IdP estiverem fora de sincronia, a validação da asserção falha. Rode NTP em ambas as máquinas para manter os relógios alinhados.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Este aviso aparece nos logs do servidor quando `SAML_ENABLED=true` mas a licença não inclui o recurso `saml_sso`. Verifique sua chave de licença e seu plano. O recurso `saml_sso` está disponível nos planos team e enterprise.

### O login redireciona de volta com erro {#login-redirects-back-with-error}

Se clicar no botão de login SAML redireciona de volta para a página de login com um erro, verifique os logs do servidor para detalhes. Causas comuns:

- A IdP SSO URL está inacessível a partir do servidor
- O IdP rejeitou a requisição de autenticação (verifique os logs de auditoria do IdP)
- O IdP retornou uma resposta não assinada (o SnapOtter exige que tanto a resposta quanto a asserção sejam assinadas)
