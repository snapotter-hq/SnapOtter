---
description: "為 SnapOtter 設定 SAML 2.0 單一登入。針對 Okta、Azure AD / Entra ID、Google Workspace 及其他 SAML 身分供應商的逐步指南。"
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 8816672cd13a
---

# SAML SSO {#saml-sso}

SnapOtter 支援 SAML 2.0 進行單一登入。使用者可以透過外部身分供應商（Okta、Azure AD / Entra ID、Google Workspace，或任何標準 SAML 2.0 IdP）登入，取代本機使用者名稱／密碼驗證。

::: tip 企業版功能
SAML SSO 需要具備 `saml_sso` 功能的 **team** 或 **enterprise** 授權。若設定了 `SAML_ENABLED=true` 卻沒有有效授權，SAML 路由會被靜默略過並記錄一則警告。
:::

## 先決條件 {#prerequisites}

- 一個可透過公開 URL 存取的執行中 SnapOtter 執行個體
- 將 `EXTERNAL_URL` 設為該公開 URL（例如 `https://photos.example.com`）
- 一個具備 `saml_sso` 功能的 team 或 enterprise 授權金鑰
- 你 SAML 身分供應商的管理員存取權

## 快速開始 {#quick-start}

將這些環境變數加入你的 `docker-compose.yml`：

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

重新啟動容器。登入頁面會出現「使用 SAML 登入」按鈕（或由 `SAML_PROVIDER_NAME` 設定的標籤）。

## 設定參考 {#configuration-reference}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `SAML_ENABLED` | `false` | 啟用 SAML 登入。 |
| `SAML_IDP_SSO_URL` | | IdP 的 SSO 端點 URL。啟用 SAML 時為**必填**。 |
| `SAML_IDP_CERTIFICATE` | | IdP 的 PEM 格式 X.509 簽章憑證（憑證文字本身，而非檔案路徑）。啟用 SAML 時為**必填**。 |
| `EXTERNAL_URL` | | SnapOtter 可被存取的公開 URL。啟用 SAML 時為**必填**。 |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | 送往 IdP 的 SP Entity ID / Audience URI。 |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion Consumer Service（ACS）URL。 |
| `SAML_AUTO_CREATE_USERS` | `true` | 在首次 SAML 登入時自動建立本機使用者帳號。 |
| `SAML_AUTO_LINK_USERS` | `false` | 若電子郵件地址相符，將 SAML 身分連結到現有的本機使用者。 |
| `SAML_DEFAULT_ROLE` | `user` | 指派給自動建立的 SAML 使用者的角色。可為 `admin`、`editor` 或 `user` 其中之一。 |
| `SAML_PROVIDER_NAME` | | 前端 SAML 登入按鈕的顯示標籤（例如「Okta」、「Azure AD」）。若留空，按鈕會顯示「SAML」。 |
| `SAML_USERNAME_ATTRIBUTE` | | 用作使用者名稱的 SAML 斷言屬性。若留空，會回退到電子郵件的本機部分，再回退到 NameID。 |
| `SAML_EMAIL_ATTRIBUTE` | `email` | 用作使用者電子郵件地址的 SAML 斷言屬性。 |

若 `SAML_ENABLED=true` 且缺少三個必填變數（`SAML_IDP_SSO_URL`、`SAML_IDP_CERTIFICATE`、`EXTERNAL_URL`）中的任何一個，伺服器會拒絕啟動。

::: details 安全性注意事項
`wantAuthnResponseSigned` 與 `wantAssertionsSigned` 兩者都硬式編碼為 `true`。SnapOtter 會拒絕未簽章或簽章不正確的 SAML 回應。來自受信任 IdP 的斷言會被視為電子郵件已驗證。

僅支援 SP 發起的登入。SnapOtter 不支援 IdP 發起（未經請求）的登入或單一登出（SLO）。登出 SnapOtter 不會將使用者從 IdP 登出。
:::

## SP 中繼資料與 URL {#sp-metadata-and-urls}

你的 IdP 需要來自 SnapOtter 的三個值：

| 欄位 | 值 |
|---|---|
| **ACS URL**（Assertion Consumer Service） | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata**（XML） | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

舉例來說，如果 `EXTERNAL_URL` 是 `https://photos.example.com`：

- ACS URL：`https://photos.example.com/api/auth/saml/callback`
- Entity ID：`https://photos.example.com/api/auth/saml/metadata`
- 中繼資料端點：`https://photos.example.com/api/auth/saml/metadata`（回傳 XML）

某些 IdP 可以直接匯入 SP 中繼資料 URL，這會自動填入 ACS URL 與 Entity ID。

## 供應商設定 {#provider-setup}

### Okta {#okta}

1. 在 Okta 管理主控台中，前往 **Applications > Create App Integration**。
2. 選擇 **SAML 2.0** 並點按 **Next**。
3. 設定名稱（例如「SnapOtter」）並點按 **Next**。
4. 設定 SAML 設定：
   - **Single sign-on URL**：你的 ACS URL（例如 `https://photos.example.com/api/auth/saml/callback`）
   - **Audience URI (SP Entity ID)**：你的 Entity ID（例如 `https://photos.example.com/api/auth/saml/metadata`）
   - **Name ID format**：EmailAddress
   - **Application username**：Email
5. 在 **Attribute Statements** 下，新增對應到 `user.email` 的 `email`。
6. 點按 **Next**，再點按 **Finish**。
7. 前往 **Sign On** 分頁，點按 **View SAML setup instructions**，並複製：
   - 將 **Identity Provider Single Sign-On URL** 填入 `SAML_IDP_SSO_URL`
   - 將 **X.509 Certificate** 填入 `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. 在 Azure 入口網站中，前往 **Microsoft Entra ID > Enterprise applications > New application**。
2. 點按 **Create your own application**，命名為「SnapOtter」，並選擇 **Integrate any other application you don't find in the gallery**。
3. 前往 **Single sign-on > SAML** 並在 **Basic SAML Configuration** 區段點按 **Edit**：
   - **Identifier (Entity ID)**：你的 Entity ID（例如 `https://photos.example.com/api/auth/saml/metadata`）
   - **Reply URL (ACS URL)**：你的 ACS URL（例如 `https://photos.example.com/api/auth/saml/callback`）
4. 在 **SAML Certificates** 下，下載 **Certificate (Base64)**。
5. 在 **Set up SnapOtter** 下，複製 **Login URL**。
6. 將 `SAML_IDP_SSO_URL` 設為 Login URL，並將 `SAML_IDP_CERTIFICATE` 設為下載的憑證內容。
7. 在 **Users and groups** 下將使用者或群組指派給此應用程式。

### Google Workspace {#google-workspace}

1. 在 Google 管理主控台中，前往 **Apps > Web and mobile apps > Add app > Add custom SAML app**。
2. 將應用程式命名為「SnapOtter」並點按 **Continue**。
3. 在 **Google Identity Provider details** 頁面，複製 **SSO URL** 並下載 **Certificate**。點按 **Continue**。
4. 設定 Service Provider 詳細資訊：
   - **ACS URL**：你的 ACS URL（例如 `https://photos.example.com/api/auth/saml/callback`）
   - **Entity ID**：你的 Entity ID（例如 `https://photos.example.com/api/auth/saml/metadata`）
   - **Name ID format**：EMAIL
   - **Name ID**：Basic Information > Primary email
5. 點按 **Continue**，再點按 **Finish**。
6. 為你的組織單位將應用程式**開啟（ON）**。
7. 將 `SAML_IDP_SSO_URL` 設為步驟 3 的 SSO URL，並將 `SAML_IDP_CERTIFICATE` 設為下載的憑證內容。

### 通用 SAML 2.0 IdP {#generic-saml-2-0-idp}

對於任何符合 SAML 2.0 規範的身分供應商：

1. 在你的 IdP 中建立新的 SAML 應用程式／服務供應商。
2. 將 **ACS URL** 設為 `${EXTERNAL_URL}/api/auth/saml/callback`。
3. 將 **Entity ID** / **Audience** 設為 `${EXTERNAL_URL}/api/auth/saml/metadata`。
4. 設定 IdP 在名為 `email` 的屬性中送出使用者的電子郵件（或設定 `SAML_EMAIL_ATTRIBUTE` 以符合你 IdP 的屬性名稱）。
5. 將 **IdP SSO URL** 與 **signing certificate** 複製到 `SAML_IDP_SSO_URL` 與 `SAML_IDP_CERTIFICATE`。

## 使用者佈建 {#user-provisioning}

### 自動建立 {#auto-create}

當 `SAML_AUTO_CREATE_USERS` 為 `true`（預設）時，會在有人首次透過 SAML 登入時建立本機使用者帳號。角色會設為 `SAML_DEFAULT_ROLE`。

使用者名稱按以下順序衍生：

1. 由 `SAML_USERNAME_ATTRIBUTE` 指定的斷言屬性值（若已設定且存在）
2. 電子郵件地址的本機部分（`@` 之前的所有內容）
3. SAML NameID

若發生使用者名稱衝突，會附加一個數字後綴（例如 `jane` 會變成 `jane_2`）。

### 自動連結 {#auto-link}

當 `SAML_AUTO_LINK_USERS` 為 `true` 時，若電子郵件地址相符，SnapOtter 會將 SAML 身分連結到現有的本機帳號。當你已預先建立使用者帳號，並希望他們在不遺失資料的情況下開始使用 SSO 時，這很有用。

::: warning 
只有在你信任你的 SAML IdP 會驗證電子郵件地址時，才啟用自動連結。來自設定錯誤的 IdP 的未經驗證電子郵件，可能讓某人接管其他使用者的帳號。
:::

### 屬性對應 {#attribute-mapping}

| SnapOtter 欄位 | 來源 | 設定 |
|---|---|---|
| Email | 斷言屬性 | `SAML_EMAIL_ATTRIBUTE`（預設：`email`） |
| Username | 斷言屬性、電子郵件或 NameID | `SAML_USERNAME_ATTRIBUTE`（請參閱上方的衍生順序） |
| External ID | NameID | 一律為 SAML NameID，不可設定 |

## SSO 強制 {#sso-enforcement}

如果你想要求所有使用者透過 SAML（或 OIDC）登入，並封鎖本機密碼登入，請啟用 SSO 強制：

1. 確保 `sso_enforcement` 企業版功能已獲授權（team 與 enterprise 方案提供）。
2. 在 **Admin Settings > Security** 中，開啟 **SSO Enforcement**。
3. 設定一個 **break-glass 使用者名稱**：這是唯一在 IdP 無法連線時仍可用密碼登入以進行緊急存取的本機帳號。

當 SSO 強制啟用時，任何本機登入嘗試（break-glass 使用者除外）都會回傳 403 錯誤，訊息為「Local password login is disabled. Please use SSO.」

::: tip 
在啟用 SSO 強制之前，一律要先設定 break-glass 使用者名稱。若沒有它，當你的 IdP 停機時，你可能會被鎖在 SnapOtter 之外。
:::

## 將 SAML 與 OIDC 並用 {#using-saml-alongside-oidc}

SAML 與 OIDC 可以同時啟用。當兩者都啟用時，登入頁面會為每個供應商顯示各自的按鈕（由 `SAML_PROVIDER_NAME` 與 `OIDC_PROVIDER_NAME` 標示）。使用者可以用任一方法登入。

兩個供應商各自獨立共用相同的自動建立、自動連結與 SSO 強制設定：每個都有自己的 `*_AUTO_CREATE_USERS`、`*_AUTO_LINK_USERS` 與 `*_DEFAULT_ROLE` 變數。

## 疑難排解 {#troubleshooting}

### 斷言驗證失敗 {#assertion-validation-failed}

SAML 回應簽章或斷言簽章無法驗證。請檢查：

- `SAML_IDP_CERTIFICATE` 中的憑證與你 IdP 中目前的簽章憑證相符（憑證會輪替，所以請檢查是否過期）
- 憑證為 PEM 格式（以 `-----BEGIN CERTIFICATE-----` 開頭）
- 憑證為完整文字，而非檔案路徑
- 你 IdP 中設定的 ACS URL 與 Entity ID 與 SnapOtter 的值完全相符（配置方式、主機、連接埠、路徑）

### 缺少屬性 {#missing-attributes}

如果登入後使用者名稱或電子郵件為空，你的 IdP 可能沒有送出預期的屬性。請檢查：

- 你的 IdP 已設定為釋出 `email` 屬性（或 `SAML_EMAIL_ATTRIBUTE` 所設定的任何值）
- 若使用 `SAML_USERNAME_ATTRIBUTE`，請驗證該屬性已包含在斷言中
- 某些 IdP 需要明確的屬性對應設定，才會釋出宣告

### 時鐘偏差 {#clock-skew}

SAML 斷言包含時間戳記條件（`NotBefore`、`NotOnOrAfter`）。如果你的伺服器時鐘與 IdP 時鐘不同步，斷言驗證會失敗。在兩台機器上都執行 NTP 以保持時鐘一致。

### 「SAML is enabled via env but saml_sso enterprise feature is not licensed」 {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

當 `SAML_ENABLED=true` 但授權不包含 `saml_sso` 功能時，此警告會出現在伺服器記錄中。請驗證你的授權金鑰與方案。`saml_sso` 功能在 team 與 enterprise 方案提供。

### 登入重新導向後帶著錯誤返回 {#login-redirects-back-with-error}

如果點按 SAML 登入按鈕後帶著錯誤重新導向回登入頁面，請檢查伺服器記錄以取得詳細資訊。常見原因：

- 從伺服器無法連線到 IdP SSO URL
- IdP 拒絕了驗證請求（請檢查 IdP 的稽核記錄）
- IdP 回傳了未簽章的回應（SnapOtter 要求回應與斷言兩者都必須簽章）
