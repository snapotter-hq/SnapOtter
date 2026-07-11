---
description: "使用 OpenID Connect 設定單一登入。針對 Keycloak、Authentik、Google 及其他 OIDC 供應商的逐步指南。"
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 0f8707e9765e
---

# OIDC / 單一登入 {#oidc-single-sign-on}

SnapOtter 支援 OpenID Connect（OIDC）進行單一登入。使用者可以透過外部身分供應商（例如 Keycloak、Authentik 或 Google）登入，取代本機使用者名稱／密碼驗證（或與之並用）。

::: tip 另請參閱
[SAML SSO](/zh-TW/guide/saml) | [SCIM 佈建](/zh-TW/guide/scim) | [使用者、角色與權限](/zh-TW/guide/users-roles)
:::

## 快速開始 {#quick-start}

將這些環境變數加入你的 `docker-compose.yml`：

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

你的供應商所使用的重新導向 URI 一律為：

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

舉例來說，如果 `EXTERNAL_URL` 是 `https://photos.example.com`，請將供應商的重新導向 URI 設定為 `https://photos.example.com/api/auth/oidc/callback`。

## 設定參考 {#configuration-reference}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `OIDC_ENABLED` | `false` | 啟用 OIDC 登入。登入頁面會出現「使用 SSO 登入」按鈕。 |
| `OIDC_ISSUER_URL` | | 供應商的簽發者（issuer）URL。必須支援 OIDC Discovery（`/.well-known/openid-configuration`）。 |
| `OIDC_CLIENT_ID` | | 向你的供應商註冊的 OAuth 用戶端 ID。 |
| `OIDC_CLIENT_SECRET` | | OAuth 用戶端密鑰。 |
| `OIDC_SCOPES` | `openid profile email` | 以空格分隔的要求範圍（scope）清單。 |
| `OIDC_AUTO_CREATE_USERS` | `true` | 在首次 OIDC 登入時自動建立本機使用者帳號。 |
| `OIDC_DEFAULT_ROLE` | `user` | 指派給自動建立的 OIDC 使用者的角色。可為 `admin`、`editor` 或 `user` 其中之一。 |
| `OIDC_AUTO_LINK_USERS` | `false` | 若電子郵件地址相符，將 OIDC 身分連結到現有的本機使用者。 |
| `OIDC_PROVIDER_NAME` | | 顯示在登入按鈕上的顯示名稱（例如「Keycloak」、「Google」）。若留空，按鈕會顯示「SSO」。 |
| `OIDC_CLOCK_TOLERANCE` | `30` | 用於權杖驗證的時鐘偏差容忍度（秒）。 |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | 用作新帳號使用者名稱的 ID 權杖宣告（claim）。 |
| `EXTERNAL_URL` | | SnapOtter 可被存取的公開 URL。OIDC 需要此值以建立正確的重新導向 URI。 |
| `COOKIE_SECRET` | 自動產生 | 用於簽署工作階段 cookie 的密鑰。執行多個複本時請明確設定此值。 |

## 供應商指南 {#provider-guides}

### Keycloak {#keycloak}

1. 建立新的 realm（或使用現有的）。
2. 前往 **Clients** 並建立新的用戶端：
   - **Client ID**：`snapotter`
   - **Client authentication**：開啟（confidential）
   - **Authentication flow**：Standard flow（Authorization Code）
3. 在該用戶端的 **Settings** 分頁下，將 **Valid redirect URIs** 設為你的回呼 URL（例如 `https://photos.example.com/api/auth/oidc/callback`）。
4. 從 **Credentials** 分頁複製 **Client secret**。
5. 將 `OIDC_ISSUER_URL` 設為 `https://keycloak.example.com/realms/your-realm`。

### Authentik {#authentik}

1. 在管理介面中，前往 **Applications > Providers** 並建立新的 **OAuth2/OpenID Provider**。
   - **Client type**：Confidential
   - **Redirect URIs**：你的回呼 URL
   - **Signing key**：選擇現有金鑰或建立一個
2. 建立一個 **Application** 並將其連結到該供應商。
3. 從供應商設定中複製 **Client ID** 與 **Client Secret**。
4. 將 `OIDC_ISSUER_URL` 設為 `https://authentik.example.com/application/o/snapotter/`（結尾的斜線很重要）。

### Google {#google}

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立專案（或選擇現有的）。
3. 導覽至 **APIs & Services > OAuth consent screen** 並進行設定。
4. 前往 **APIs & Services > Credentials** 並建立 **OAuth 2.0 Client ID**：
   - **Application type**：Web application
   - **Authorized redirect URIs**：你的回呼 URL
5. 複製 **Client ID** 與 **Client secret**。
6. 將 `OIDC_ISSUER_URL` 設為 `https://accounts.google.com`。
7. 將 `OIDC_USERNAME_CLAIM` 設為 `email`（Google 不提供 `preferred_username`）。

## 使用者佈建 {#user-provisioning}

### 自動建立 {#auto-create}

當 `OIDC_AUTO_CREATE_USERS` 為 `true`（預設）時，會在有人首次透過 OIDC 登入時建立本機使用者帳號。使用者名稱取自由 `OIDC_USERNAME_CLAIM` 指定的宣告，角色則設為 `OIDC_DEFAULT_ROLE`。

若發生使用者名稱衝突，會附加一個數字後綴（例如 `jane` 會變成 `jane_2`）。

### 自動連結 {#auto-link}

當 `OIDC_AUTO_LINK_USERS` 為 `true` 時，若電子郵件地址相符，SnapOtter 會將 OIDC 身分連結到現有的本機帳號。當你已預先建立使用者帳號，並希望他們在不遺失資料的情況下開始使用 SSO 時，這很有用。

::: warning 
只有在你信任你的 OIDC 供應商會驗證電子郵件地址時，才啟用自動連結。未經驗證的電子郵件可能讓某人接管其他使用者的帳號。
:::

### 停用本機登入 {#disabling-local-login}

OIDC 不會停用本機使用者名稱／密碼登入。兩種方法都仍可使用。若 OIDC 供應商無法連線，管理員仍可使用本機憑證登入。

## 自簽憑證 {#self-signed-certificates}

如果你的 OIDC 供應商使用自簽或私有 CA 憑證，請將 CA 套件掛載進容器，並讓 `NODE_EXTRA_CA_CERTS` 指向它：

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
請勿設定 `NODE_TLS_REJECT_UNAUTHORIZED=0`。這會停用所有 TLS 驗證，是一項安全風險。
:::

## 疑難排解 {#troubleshooting}

### 重新導向 URI 不相符 {#redirect-uri-mismatch}

最常見的錯誤。請檢查你的供應商所預期的內容與 SnapOtter 所送出的內容之間是否有以下差異：

- `http` 對 `https`，配置方式必須完全相符
- 結尾斜線，某些供應商對此很嚴格
- 連接埠號碼，若非標準連接埠請一併納入
- 路徑，必須是 `/api/auth/oidc/callback`

請再次確認 `EXTERNAL_URL`。它必須與使用者在瀏覽器中輸入的 URL 相符。

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

OIDC 供應商所使用的憑證不受 Node.js 信任。請參閱上方的 [自簽憑證](#self-signed-certificates)。

### 時鐘偏差錯誤 {#clock-skew-errors}

如果你的伺服器時鐘與 OIDC 供應商時鐘不同步，權杖驗證可能會失敗。請提高 `OIDC_CLOCK_TOLERANCE`（預設為 30 秒）。更好的做法是在兩台機器上都執行 NTP。

### 「OIDC provider unreachable」 {#oidc-provider-unreachable}

SnapOtter 會在啟動時以及登入期間擷取供應商的探索文件。請檢查：

- 從 Docker 容器內部進行的 DNS 解析（`docker exec snapotter nslookup auth.example.com`）
- 容器與供應商之間的防火牆規則
- `OIDC_ISSUER_URL` 值，它必須能從伺服器連線，而不僅僅是從你的瀏覽器

### 缺少宣告 {#missing-claims}

如果登入後使用者名稱或電子郵件為空，你的供應商可能沒有回傳預期的宣告。請驗證：

- 在 `OIDC_SCOPES` 中設定的範圍包含 `profile` 與 `email`
- 供應商已設定為在 ID 權杖中包含由 `OIDC_USERNAME_CLAIM` 指定的宣告
- 某些供應商需要明確的對應（mapper）／範圍設定才能釋出宣告
