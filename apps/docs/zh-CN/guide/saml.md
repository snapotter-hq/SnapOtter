---
description: "为 SnapOtter 设置 SAML 2.0 单点登录。提供 Okta、Azure AD / Entra ID、Google Workspace 及其他 SAML 身份提供商的分步指南。"
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 75d4acf29255
---

# SAML SSO {#saml-sso}

SnapOtter 支持使用 SAML 2.0 进行单点登录。用户可以通过外部身份提供商（Okta、Azure AD / Entra ID、Google Workspace 或任何标准的 SAML 2.0 IdP）登录，作为本地用户名/密码认证的替代方案。

::: tip 企业功能
SAML SSO 需要具备 `saml_sso` 功能的 **团队** 或 **企业** 许可证。如果设置了 `SAML_ENABLED=true` 但没有有效的许可证，SAML 路由会被静默跳过，并记录一条警告。
:::

## 前置条件 {#prerequisites}

- 一个可通过公共 URL 访问的运行中的 SnapOtter 实例
- 将 `EXTERNAL_URL` 设置为该公共 URL（例如 `https://photos.example.com`）
- 具备 `saml_sso` 功能的团队或企业许可证密钥
- 你的 SAML 身份提供商的管理员访问权限

## 快速开始 {#quick-start}

将这些环境变量添加到你的 `docker-compose.yml` 中：

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

重启容器。登录页面上会出现一个“使用 SAML 登录”按钮（或由 `SAML_PROVIDER_NAME` 设置的标签）。

## 配置参考 {#configuration-reference}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SAML_ENABLED` | `false` | 启用 SAML 登录。 |
| `SAML_IDP_SSO_URL` | | IdP 的 SSO 端点 URL。启用 SAML 时**必填**。 |
| `SAML_IDP_CERTIFICATE` | | IdP 的 PEM 格式 X.509 签名证书（证书文本本身，而非文件路径）。启用 SAML 时**必填**。 |
| `EXTERNAL_URL` | | SnapOtter 可访问的公共 URL。启用 SAML 时**必填**。 |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | 发送给 IdP 的 SP Entity ID / Audience URI。 |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | 断言消费者服务（ACS）URL。 |
| `SAML_AUTO_CREATE_USERS` | `true` | 在首次 SAML 登录时自动创建本地用户账户。 |
| `SAML_AUTO_LINK_USERS` | `false` | 如果电子邮件地址匹配，则将 SAML 身份链接到现有的本地用户。 |
| `SAML_DEFAULT_ROLE` | `user` | 分配给自动创建的 SAML 用户的角色。为 `admin`、`editor` 或 `user` 之一。 |
| `SAML_PROVIDER_NAME` | | 前端 SAML 登录按钮的显示标签（例如“Okta”、“Azure AD”）。如果为空，按钮显示“SAML”。 |
| `SAML_USERNAME_ATTRIBUTE` | | 用作用户名的 SAML 断言属性。如果为空，则回退为电子邮件的本地部分，然后是 NameID。 |
| `SAML_EMAIL_ATTRIBUTE` | `email` | 用作用户电子邮件地址的 SAML 断言属性。 |

如果 `SAML_ENABLED=true` 而三个必填变量（`SAML_IDP_SSO_URL`、`SAML_IDP_CERTIFICATE`、`EXTERNAL_URL`）中有任何一个缺失，服务器将拒绝启动。

::: details 安全说明
`wantAuthnResponseSigned` 和 `wantAssertionsSigned` 都被硬编码为 `true`。SnapOtter 会拒绝未签名或签名不当的 SAML 响应。来自受信任 IdP 的断言被视为已验证电子邮件。

仅支持 SP 发起的登录。SnapOtter 不支持 IdP 发起的（未经请求的）登录或单点登出（SLO）。登出 SnapOtter 不会将用户从 IdP 登出。
:::

## SP 元数据和 URL {#sp-metadata-and-urls}

你的 IdP 需要来自 SnapOtter 的三个值：

| 字段 | 值 |
|---|---|
| **ACS URL**（断言消费者服务） | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP 元数据**（XML） | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

例如，如果 `EXTERNAL_URL` 是 `https://photos.example.com`：

- ACS URL：`https://photos.example.com/api/auth/saml/callback`
- Entity ID：`https://photos.example.com/api/auth/saml/metadata`
- 元数据端点：`https://photos.example.com/api/auth/saml/metadata`（返回 XML）

有些 IdP 可以直接导入 SP 元数据 URL，从而自动填充 ACS URL 和 Entity ID。

## 提供商设置 {#provider-setup}

### Okta {#okta}

1. 在 Okta 管理控制台中，进入 **Applications > Create App Integration**。
2. 选择 **SAML 2.0** 并点击 **Next**。
3. 设置一个名称（例如“SnapOtter”）并点击 **Next**。
4. 配置 SAML 设置：
   - **Single sign-on URL**：你的 ACS URL（例如 `https://photos.example.com/api/auth/saml/callback`）
   - **Audience URI (SP Entity ID)**：你的 Entity ID（例如 `https://photos.example.com/api/auth/saml/metadata`）
   - **Name ID format**：EmailAddress
   - **Application username**：Email
5. 在 **Attribute Statements** 下，添加 `email` 并映射到 `user.email`。
6. 点击 **Next**，然后点击 **Finish**。
7. 进入 **Sign On** 选项卡，点击 **View SAML setup instructions**，并复制：
   - **Identity Provider Single Sign-On URL** 到 `SAML_IDP_SSO_URL`
   - **X.509 Certificate** 到 `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. 在 Azure 门户中，进入 **Microsoft Entra ID > Enterprise applications > New application**。
2. 点击 **Create your own application**，将其命名为“SnapOtter”，并选择 **Integrate any other application you don't find in the gallery**。
3. 进入 **Single sign-on > SAML**，并在 **Basic SAML Configuration** 部分点击 **Edit**：
   - **Identifier (Entity ID)**：你的 Entity ID（例如 `https://photos.example.com/api/auth/saml/metadata`）
   - **Reply URL (ACS URL)**：你的 ACS URL（例如 `https://photos.example.com/api/auth/saml/callback`）
4. 在 **SAML Certificates** 下，下载 **Certificate (Base64)**。
5. 在 **Set up SnapOtter** 下，复制 **Login URL**。
6. 将 `SAML_IDP_SSO_URL` 设置为该 Login URL，并将 `SAML_IDP_CERTIFICATE` 设置为所下载的证书内容。
7. 在 **Users and groups** 下将用户或组分配给该应用。

### Google Workspace {#google-workspace}

1. 在 Google 管理控制台中，进入 **Apps > Web and mobile apps > Add app > Add custom SAML app**。
2. 将该应用命名为“SnapOtter”并点击 **Continue**。
3. 在 **Google Identity Provider details** 页面，复制 **SSO URL** 并下载 **Certificate**。点击 **Continue**。
4. 配置 Service Provider 详情：
   - **ACS URL**：你的 ACS URL（例如 `https://photos.example.com/api/auth/saml/callback`）
   - **Entity ID**：你的 Entity ID（例如 `https://photos.example.com/api/auth/saml/metadata`）
   - **Name ID format**：EMAIL
   - **Name ID**：Basic Information > Primary email
5. 点击 **Continue**，然后点击 **Finish**。
6. 为你的组织单位将该应用设为 **ON**。
7. 将 `SAML_IDP_SSO_URL` 设置为步骤 3 中的 SSO URL，并将 `SAML_IDP_CERTIFICATE` 设置为所下载的证书内容。

### 通用 SAML 2.0 IdP {#generic-saml-2-0-idp}

对于任何符合 SAML 2.0 的身份提供商：

1. 在你的 IdP 中创建一个新的 SAML 应用/服务提供商。
2. 将 **ACS URL** 设置为 `${EXTERNAL_URL}/api/auth/saml/callback`。
3. 将 **Entity ID** / **Audience** 设置为 `${EXTERNAL_URL}/api/auth/saml/metadata`。
4. 配置 IdP 在名为 `email` 的属性中发送用户的电子邮件（或设置 `SAML_EMAIL_ATTRIBUTE` 以匹配你的 IdP 的属性名）。
5. 将 **IdP SSO URL** 和 **签名证书** 复制到 `SAML_IDP_SSO_URL` 和 `SAML_IDP_CERTIFICATE`。

## 用户预置 {#user-provisioning}

### 自动创建 {#auto-create}

当 `SAML_AUTO_CREATE_USERS` 为 `true`（默认）时，会在某人首次通过 SAML 登录时创建一个本地用户账户。角色设置为 `SAML_DEFAULT_ROLE`。

用户名按以下顺序派生：

1. `SAML_USERNAME_ATTRIBUTE` 指定的断言属性的值（如果已设置且存在）
2. 电子邮件地址的本地部分（`@` 之前的所有内容）
3. SAML NameID

如果发生用户名冲突，会追加一个数字后缀（例如 `jane` 变为 `jane_2`）。

### 自动链接 {#auto-link}

当 `SAML_AUTO_LINK_USERS` 为 `true` 时，如果电子邮件地址匹配，SnapOtter 会将 SAML 身份链接到现有的本地账户。当你已预先创建用户账户，并希望他们在不丢失数据的情况下开始使用 SSO 时，这很有用。

::: warning 
只有在你信任 SAML IdP 会验证电子邮件地址的情况下，才启用自动链接。来自配置错误的 IdP 的未经验证的电子邮件可能会让某人接管另一个用户的账户。
:::

### 属性映射 {#attribute-mapping}

| SnapOtter 字段 | 来源 | 配置 |
|---|---|---|
| 电子邮件 | 断言属性 | `SAML_EMAIL_ATTRIBUTE`（默认：`email`） |
| 用户名 | 断言属性、电子邮件或 NameID | `SAML_USERNAME_ATTRIBUTE`（见上文派生顺序） |
| 外部 ID | NameID | 始终为 SAML NameID，不可配置 |

## SSO 强制 {#sso-enforcement}

如果你希望要求所有用户都通过 SAML（或 OIDC）登录并阻止本地密码登录，请启用 SSO 强制：

1. 确保 `sso_enforcement` 企业功能已获授权（在团队和企业方案上可用）。
2. 在 **Admin Settings > Security** 中，打开 **SSO Enforcement**。
3. 设置一个 **应急用户名**：这是唯一一个在 IdP 无法访问时仍可使用密码登录以进行紧急访问的本地账户。

当 SSO 强制处于激活状态时，任何本地登录尝试（应急用户除外）都会返回 403 错误，消息为“Local password login is disabled. Please use SSO.”

::: tip 
在启用 SSO 强制之前，请务必先配置一个应急用户名。否则，如果你的 IdP 宕机，你可能会被锁在 SnapOtter 之外。
:::

## 将 SAML 与 OIDC 并用 {#using-saml-alongside-oidc}

SAML 和 OIDC 可以同时启用。当两者都处于激活状态时，登录页面会为每个提供商显示各自的按钮（由 `SAML_PROVIDER_NAME` 和 `OIDC_PROVIDER_NAME` 标注）。用户可以使用任一方式登录。

两个提供商各自独立地共享相同的自动创建、自动链接和 SSO 强制设置：每个都有自己的 `*_AUTO_CREATE_USERS`、`*_AUTO_LINK_USERS` 和 `*_DEFAULT_ROLE` 变量。

## 故障排查 {#troubleshooting}

### 断言验证失败 {#assertion-validation-failed}

无法验证 SAML 响应签名或断言签名。请检查：

- `SAML_IDP_CERTIFICATE` 中的证书与你的 IdP 中当前的签名证书是否匹配（证书会轮换，因此请检查是否过期）
- 证书是否为 PEM 格式（以 `-----BEGIN CERTIFICATE-----` 开头）
- 证书是否为完整文本，而非文件路径
- 你的 IdP 中配置的 ACS URL 和 Entity ID 是否与 SnapOtter 的值完全一致（scheme、host、port、path）

### 缺少属性 {#missing-attributes}

如果登录后用户名或电子邮件为空，你的 IdP 可能没有发送预期的属性。请检查：

- 你的 IdP 已配置为释放一个 `email` 属性（或 `SAML_EMAIL_ATTRIBUTE` 所设置的值）
- 如果使用 `SAML_USERNAME_ATTRIBUTE`，请验证该属性已包含在断言中
- 有些 IdP 需要显式的属性映射配置才能释放声明

### 时钟偏差 {#clock-skew}

SAML 断言包含时间戳条件（`NotBefore`、`NotOnOrAfter`）。如果你的服务器时钟与 IdP 时钟不同步，断言验证会失败。在两台机器上都运行 NTP 以保持时钟对齐。

### “SAML is enabled via env but saml_sso enterprise feature is not licensed” {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

当 `SAML_ENABLED=true` 但许可证不包含 `saml_sso` 功能时，服务器日志中会出现此警告。请核对你的许可证密钥和方案。`saml_sso` 功能在团队和企业方案上可用。

### 登录重定向回来并带有错误 {#login-redirects-back-with-error}

如果点击 SAML 登录按钮后重定向回登录页面并带有错误，请查看服务器日志以了解详情。常见原因：

- 从服务器无法访问 IdP SSO URL
- IdP 拒绝了认证请求（请查看 IdP 的审计日志）
- IdP 返回了未签名的响应（SnapOtter 要求响应和断言都必须签名）
