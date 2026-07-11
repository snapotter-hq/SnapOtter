---
description: "使用 OpenID Connect 设置单点登录。提供 Keycloak、Authentik、Google 及其他 OIDC 提供商的分步指南。"
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 57678911503c
---

# OIDC / 单点登录 {#oidc-single-sign-on}

SnapOtter 支持使用 OpenID Connect（OIDC）进行单点登录。用户可以使用 Keycloak、Authentik 或 Google 等外部身份提供商登录，作为本地用户名/密码认证的替代方案（或与之并存）。

::: tip 另请参阅
[SAML SSO](/zh-CN/guide/saml) | [SCIM 预置](/zh-CN/guide/scim) | [用户、角色与权限](/zh-CN/guide/users-roles)
:::

## 快速开始 {#quick-start}

将这些环境变量添加到你的 `docker-compose.yml` 中：

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

你的提供商的重定向 URI 始终为：

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

例如，如果 `EXTERNAL_URL` 是 `https://photos.example.com`，请将你的提供商的重定向 URI 配置为 `https://photos.example.com/api/auth/oidc/callback`。

## 配置参考 {#configuration-reference}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `OIDC_ENABLED` | `false` | 启用 OIDC 登录。登录页面上会出现一个“使用 SSO 登录”按钮。 |
| `OIDC_ISSUER_URL` | | 提供商的 issuer URL。必须支持 OIDC 发现（`/.well-known/openid-configuration`）。 |
| `OIDC_CLIENT_ID` | | 在你的提供商处注册的 OAuth 客户端 ID。 |
| `OIDC_CLIENT_SECRET` | | OAuth 客户端密钥。 |
| `OIDC_SCOPES` | `openid profile email` | 要请求的作用域列表，以空格分隔。 |
| `OIDC_AUTO_CREATE_USERS` | `true` | 在首次 OIDC 登录时自动创建本地用户账户。 |
| `OIDC_DEFAULT_ROLE` | `user` | 分配给自动创建的 OIDC 用户的角色。为 `admin`、`editor` 或 `user` 之一。 |
| `OIDC_AUTO_LINK_USERS` | `false` | 如果电子邮件地址匹配，则将 OIDC 身份链接到现有的本地用户。 |
| `OIDC_PROVIDER_NAME` | | 显示在登录按钮上的名称（例如“Keycloak”、“Google”）。如果为空，按钮显示“SSO”。 |
| `OIDC_CLOCK_TOLERANCE` | `30` | 令牌验证时允许的时钟偏差容差（秒）。 |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | 用作新账户用户名的 ID 令牌声明。 |
| `EXTERNAL_URL` | | SnapOtter 可访问的公共 URL。OIDC 构建正确的重定向 URI 时需要此项。 |
| `COOKIE_SECRET` | 自动生成 | 用于签名会话 cookie 的密钥。运行多个副本时请显式设置此项。 |

## 提供商指南 {#provider-guides}

### Keycloak {#keycloak}

1. 创建一个新 realm（或使用现有的 realm）。
2. 进入 **Clients** 并创建一个新 client：
   - **Client ID**：`snapotter`
   - **Client authentication**：On（保密型）
   - **Authentication flow**：Standard flow（授权码）
3. 在该 client 的 **Settings** 选项卡下，将 **Valid redirect URIs** 设置为你的回调 URL（例如 `https://photos.example.com/api/auth/oidc/callback`）。
4. 从 **Credentials** 选项卡复制 **Client secret**。
5. 将 `OIDC_ISSUER_URL` 设置为 `https://keycloak.example.com/realms/your-realm`。

### Authentik {#authentik}

1. 在管理界面中，进入 **Applications > Providers** 并创建一个新的 **OAuth2/OpenID Provider**。
   - **Client type**：Confidential
   - **Redirect URIs**：你的回调 URL
   - **Signing key**：选择现有密钥或创建一个
2. 创建一个 **Application** 并将其链接到该 provider。
3. 从 provider 设置中复制 **Client ID** 和 **Client Secret**。
4. 将 `OIDC_ISSUER_URL` 设置为 `https://authentik.example.com/application/o/snapotter/`（末尾的斜杠很重要）。

### Google {#google}

1. 进入 [Google Cloud Console](https://console.cloud.google.com/)。
2. 创建一个项目（或选择现有项目）。
3. 导航到 **APIs & Services > OAuth consent screen** 并进行配置。
4. 进入 **APIs & Services > Credentials** 并创建一个 **OAuth 2.0 Client ID**：
   - **Application type**：Web application
   - **Authorized redirect URIs**：你的回调 URL
5. 复制 **Client ID** 和 **Client secret**。
6. 将 `OIDC_ISSUER_URL` 设置为 `https://accounts.google.com`。
7. 将 `OIDC_USERNAME_CLAIM` 设置为 `email`（Google 不提供 `preferred_username`）。

## 用户预置 {#user-provisioning}

### 自动创建 {#auto-create}

当 `OIDC_AUTO_CREATE_USERS` 为 `true`（默认）时，会在某人首次通过 OIDC 登录时创建一个本地用户账户。用户名取自 `OIDC_USERNAME_CLAIM` 指定的声明，角色设置为 `OIDC_DEFAULT_ROLE`。

如果发生用户名冲突，会追加一个数字后缀（例如 `jane` 变为 `jane_2`）。

### 自动链接 {#auto-link}

当 `OIDC_AUTO_LINK_USERS` 为 `true` 时，如果电子邮件地址匹配，SnapOtter 会将 OIDC 身份链接到现有的本地账户。当你已预先创建用户账户，并希望他们在不丢失数据的情况下开始使用 SSO 时，这很有用。

::: warning 
只有在你信任 OIDC 提供商会验证电子邮件地址的情况下，才启用自动链接。未经验证的电子邮件可能会让某人接管另一个用户的账户。
:::

### 禁用本地登录 {#disabling-local-login}

OIDC 不会禁用本地用户名/密码登录。两种方式都仍然可用。如果 OIDC 提供商无法访问，管理员仍可使用本地凭据登录。

## 自签名证书 {#self-signed-certificates}

如果你的 OIDC 提供商使用自签名或私有 CA 证书，请将 CA 证书包挂载到容器中，并将 `NODE_EXTRA_CA_CERTS` 指向它：

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
请勿设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。这会禁用所有 TLS 验证，存在安全风险。
:::

## 故障排查 {#troubleshooting}

### 重定向 URI 不匹配 {#redirect-uri-mismatch}

最常见的错误。检查你的提供商所期望的内容与 SnapOtter 发送的内容之间是否存在以下差异：

- `http` 与 `https` 之间，scheme 必须完全一致
- 末尾斜杠，有些提供商对此很严格
- 端口号，如果是非标准端口，请包含端口
- 路径，必须是 `/api/auth/oidc/callback`

请再次核对 `EXTERNAL_URL`。它必须与用户在浏览器中输入的 URL 一致。

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

OIDC 提供商使用了 Node.js 不信任的证书。请参阅上文的[自签名证书](#self-signed-certificates)。

### 时钟偏差错误 {#clock-skew-errors}

如果你的服务器时钟与 OIDC 提供商时钟不同步，令牌验证可能会失败。增大 `OIDC_CLOCK_TOLERANCE`（默认为 30 秒）。更好的办法是在两台机器上都运行 NTP。

### “OIDC 提供商无法访问” {#oidc-provider-unreachable}

SnapOtter 会在启动时和登录期间获取提供商的发现文档。请检查：

- 从 Docker 容器内部进行的 DNS 解析（`docker exec snapotter nslookup auth.example.com`）
- 容器与提供商之间的防火墙规则
- `OIDC_ISSUER_URL` 的值，它必须能从服务器访问，而不仅仅是从你的浏览器访问

### 缺少声明 {#missing-claims}

如果登录后用户名或电子邮件为空，你的提供商可能没有返回预期的声明。请验证：

- 在 `OIDC_SCOPES` 中配置的作用域包含 `profile` 和 `email`
- 提供商已配置为在 ID 令牌中包含 `OIDC_USERNAME_CLAIM` 指定的声明
- 有些提供商需要显式的 mapper/scope 配置才能释放声明
