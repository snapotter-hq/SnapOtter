---
description: "在 SnapOtter 中管理使用者、內建與自訂角色、權限、API 金鑰、團隊、工作階段以及稽核日誌。"
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 94865da24af7
---

# 使用者、角色與權限 {#users-roles-permissions}

SnapOtter 內建三種角色、17 項細緻權限，並支援具備可選之每工具存取控制的自訂角色。本頁涵蓋完整的授權模型、API 金鑰範圍限制、團隊管理以及稽核日誌。

::: tip 相關頁面
[OIDC / SSO](/zh-TW/guide/oidc) | [SAML SSO](/zh-TW/guide/saml) | [SCIM 佈建](/zh-TW/guide/scim) | [安全性與強化](/zh-TW/guide/security)
:::

## 使用者 {#users}

### 建立使用者 {#creating-users}

管理員可透過管理面板或 `POST /api/auth/register` 端點建立使用者。每位使用者都有一個使用者名稱、角色、團隊指派，以及一個選用的電子郵件地址。

### 預設管理員 {#default-admin}

首次啟動時，SnapOtter 會建立一個預設管理員帳號。憑證來自環境變數：

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | 初始管理員帳號的使用者名稱 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理員帳號的密碼 |

預設管理員在首次登入時必須變更密碼。

### 驗證提供者 {#authentication-providers}

使用者可透過多種方式進行驗證：

- **本機** - 使用者名稱與密碼儲存在 SnapOtter 資料庫
- **OIDC** - 任何 OpenID Connect 提供者（參閱 [OIDC / SSO](/zh-TW/guide/oidc)）
- **SAML** - SAML 2.0 身分提供者（參閱 [SAML SSO](/zh-TW/guide/saml)）
- **SCIM** - 從身分提供者自動佈建（參閱 [SCIM 佈建](/zh-TW/guide/scim)）

### 停用驗證 {#disabling-authentication}

設定 `AUTH_ENABLED=false` 以完全停用驗證。在此模式下，所有請求都會使用一個具備 `admin` 角色的合成匿名使用者。不需要登入。

::: warning 
停用驗證會授予任何能連上該執行個體的人完整的管理員存取權。僅在受信任的環境中使用。
:::

## 內建角色 {#built-in-roles}

SnapOtter 包含三種內建角色。它們無法被修改或刪除。

### Admin {#admin}

全部 17 項權限。對執行個體有完整控制權。

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### Editor {#editor}

7 項權限。可使用所有工具並管理所有檔案與管線，但無法存取管理功能。

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### User {#user}

5 項權限。可使用工具並管理自己的資源。

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## 權限參考 {#permissions-reference}

| Permission | Description |
|---|---|
| `tools:use` | 使用任何處理工具 |
| `files:own` | 檢視並管理自己的檔案 |
| `files:all` | 檢視並管理所有使用者的檔案 |
| `apikeys:own` | 建立並管理自己的 API 金鑰 |
| `apikeys:all` | 檢視所有使用者的 API 金鑰 |
| `pipelines:own` | 建立並管理自己的管線 |
| `pipelines:all` | 檢視並管理所有使用者的管線 |
| `settings:read` | 檢視執行個體設定 |
| `settings:write` | 修改執行個體設定 |
| `users:manage` | 建立、更新並刪除使用者帳號 |
| `teams:manage` | 建立、更新並刪除團隊 |
| `features:manage` | 安裝並管理 AI 功能套組 |
| `system:health` | 存取健康檢查與就緒狀態端點 |
| `audit:read` | 檢視稽核日誌並列出角色 |
| `compliance:manage` | 管理 GDPR 生命週期與合規功能 |
| `webhooks:manage` | 設定對外 webhook |
| `security:manage` | 管理安全性設定（IP 允許清單、SSO 強制執行） |

## 自訂角色 {#custom-roles}

具備 `security:manage` 權限的管理員可透過管理面板或角色 API 建立自訂角色。列出角色需要 `audit:read`。

### 建立自訂角色 {#creating-a-custom-role}

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

角色名稱必須為 2 至 30 個字元，小寫英數字並可含連字號與底線。

### 保留給管理員的權限 {#admin-reserved-permissions}

有三項權限保留給內建角色，無法指派給自訂角色：

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

角色 API 會拒絕任何包含這些權限的請求。只有內建的 `admin` 角色能存取它們。

### 工具層級權限 {#tool-level-permissions}

自訂角色可選擇性地限制使用者能存取哪些工具。有兩種模式可用：

| Mode | Behavior | License requirement |
|---|---|---|
| `category` | 依模態限制（image、video、audio、document、file） | 無（免費） |
| `tool` | 依個別工具 ID 限制 | 需要 `per_tool_permissions` 企業版功能 |

當設定了 `tool` 模式但企業版功能不可用時，SnapOtter 會優雅降級並允許存取所有工具。

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

### 刪除自訂角色 {#deleting-a-custom-role}

當自訂角色被刪除時，所有指派給它的使用者會自動重新指派到 `user` 角色。

## 團隊 {#teams}

團隊會將使用者分組，以進行儲存與保留管理。首次啟動時會建立一個 `Default` 團隊。

| Field | Type | Description |
|---|---|---|
| `name` | string | 唯一的團隊名稱（1 至 50 個字元） |
| `storageQuota` | number | 每個團隊的儲存上限（位元組）（無需企業版也可運作） |
| `retentionHours` | number | 在這麼多小時後自動刪除輸出（需要 `team_retention_overrides`，企業版） |
| `legalHold` | boolean | 防止自動刪除團隊成員的檔案（需要 `legal_hold`，企業版） |

::: info 
`Default` 團隊無法刪除。仍有成員的團隊無法刪除。請先重新指派成員。
:::

## API 金鑰 {#api-keys}

使用者可產生 API 金鑰以進行程式化存取。每把金鑰使用 `si_` 前綴，且只會在建立時顯示一次。

### 範圍限定的權限 {#scoped-permissions}

API 金鑰可選擇性地攜帶一個 `permissions` 陣列。設定後，某次請求的有效權限是使用者角色權限與金鑰範圍權限的**交集**。這表示 API 金鑰永遠無法提升到超過使用者自身的權限。

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

### 到期 {#expiration}

金鑰接受一個選用的 `expiresAt` 時間戳記。過期的金鑰會在驗證時被拒絕。

## 稽核日誌 {#audit-log}

SnapOtter 會在儲存於 `audit_log` 資料庫資料表的結構化稽核日誌中記錄與安全相關的事件。

### 檢視稽核日誌 {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

需要 `audit:read` 權限。支援分頁（`page`、`limit`）與篩選（`action`、`ip`、`from`、`to`）。

### 工具操作稽核 {#tool-operation-auditing}

::: warning 
預設**不會**記錄 `TOOL_EXECUTED` 事件。它們需透過下列兩種途徑之一選擇加入：

1. 將 `auditToolOperations` 管理設定設為 `true`。
2. 持有具備 `audit_export` 功能的有效授權（team 與 enterprise 方案皆可使用）。

若不具備上述其一，個別的工具執行不會被記錄在稽核日誌中。
:::

### 匯出 {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

需要 `audit:read` 權限與 `audit_export` 企業版功能（team 與 enterprise 方案皆可使用）。支援 CSV 與 JSON 格式，並可依 `action`、`actorId`、`targetType`、`targetId`、`from` 與 `to` 篩選。

### 防竄改簽章 {#tamper-resistant-signing}

啟用後，每筆稽核日誌項目都會以從 `DATA_ENCRYPTION_KEY` 衍生的 HMAC 簽章。這需要：

1. 在你的環境中設定 `DATA_ENCRYPTION_KEY`。
2. 啟用 `tamperResistantAudit` 管理設定。
3. 具備 `tamper_resistant_audit` 功能的企業版授權。

### 保留 {#retention}

設定 `AUDIT_RETENTION_DAYS` 以自動清除舊項目。預設值是 `0`，代表項目會無限期保留。

### 事件參考 {#event-reference}

| Event | Category |
|---|---|
| `LOGIN_SUCCESS`、`LOGIN_FAILED` | Authentication |
| `OIDC_LOGIN_SUCCESS`、`OIDC_LOGIN_FAILED` | Authentication |
| `SAML_LOGIN_SUCCESS`、`SAML_LOGIN_FAILED` | Authentication |
| `LOGOUT` | Authentication |
| `USER_CREATED`、`USER_UPDATED`、`USER_DELETED` | User management |
| `PASSWORD_CHANGED`、`PASSWORD_RESET` | User management |
| `MFA_ENROLLED`、`MFA_DISABLED`、`MFA_VERIFIED`、`MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`、`MFA_RECOVERY_USED`、`MFA_RESET` | MFA |
| `ROLE_CREATED`、`ROLE_UPDATED`、`ROLE_DELETED` | Roles |
| `API_KEY_CREATED`、`API_KEY_DELETED` | API keys |
| `SETTINGS_UPDATED`、`IP_ALLOWLIST_UPDATED` | Settings |
| `FILE_UPLOADED`、`FILE_DELETED` | Files |
| `TOOL_EXECUTED` | Tools (opt-in) |
| `SCIM_USER_PROVISIONED`、`SCIM_USER_UPDATED`、`SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`、`LEGAL_HOLD_RELEASED` | Compliance |
| `GDPR_EXPORT_INITIATED`、`GDPR_USER_PURGED`、`GDPR_TEAM_PURGED` | Compliance |
| `CONFIG_EXPORTED`、`CONFIG_IMPORTED` | Configuration |

## 工作階段管理 {#session-management}

工作階段以 cookie 為基礎，由 `SESSION_DURATION_HOURS` 控制（預設：168 小時 / 7 天）。

### 角色變更會使工作階段失效 {#role-changes-invalidate-sessions}

當管理員變更某位使用者的角色時，該使用者所有作用中的工作階段都會被刪除。使用者必須重新登入才能取得新權限。

### 安全防護 {#safety-guards}

- **最後管理員保護**：最後剩下的一位管理員無法被降級為較低角色。若你嘗試這麼做，API 會回傳錯誤。
- **防止自我刪除**：管理員無法透過 API 刪除自己的帳號。
