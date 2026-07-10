---
description: "設定 SCIM 2.0 佈建，將使用者與群組從您的身分提供者同步至 SnapOtter。涵蓋 Okta、Azure AD / Entra ID 以及自訂整合。"
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 674e1fe7bfc1
---

# SCIM 佈建 {#scim-provisioning}

SnapOtter 實作 SCIM 2.0（System for Cross-domain Identity Management）以進行自動化的使用者與群組佈建。您的身分提供者可以自動建立、更新、停用及重新啟用使用者帳號，並同步群組成員資格。

::: tip 企業版功能
SCIM 佈建需要具備 `scim` 功能的 **enterprise** 授權。team 方案無法使用。若未具備此功能，所有 SCIM 端點（探索端點除外）都會回傳 403。
:::

## 先決條件 {#prerequisites}

- 一個可透過公開網址存取的執行中 SnapOtter 執行個體
- 具備 `scim` 功能的企業版授權金鑰
- SnapOtter 的管理員存取權（產生或撤銷 SCIM 權杖需要 `users:manage` 權限）
- 您身分提供者佈建設定的管理員存取權

## 快速開始 {#quick-start}

1. 產生一個 SCIM bearer 權杖：

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

回應中包含該權杖。請立即儲存；它無法再次取得。

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. 在您的身分提供者中，以下列項目設定 SCIM 佈建：
   - **Base URL**：`https://photos.example.com/api/v1/scim/v2`
   - **Authentication**：Bearer 權杖（貼上步驟 1 中的權杖）

## 驗證 {#authentication}

SCIM 端點使用專屬的 Bearer 權杖，與使用者工作階段及 API 金鑰分開。

### 產生權杖 {#generating-a-token}

`POST /api/v1/enterprise/scim/token` 會產生一個新的 SCIM 權杖。此端點需要具備 `users:manage` 權限的有效工作階段。

該權杖以明文回傳，且僅回傳一次。SnapOtter 只儲存 scrypt 雜湊值。若您遺失權杖，請撤銷它並產生新的權杖。

同一時間只有一個 SCIM 權杖處於使用中狀態。產生新權杖會取代先前的權杖。

### 撤銷權杖 {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` 會撤銷目前的 SCIM 權杖。此端點同樣需要 `users:manage`。

### 速率限制 {#rate-limiting}

SCIM 端點的速率限制為每個權杖每分鐘 1000 個請求。超過此限制會回傳 HTTP 429。

## 支援的資源 {#supported-resources}

| SCIM 資源 | SnapOtter 概念 | 建立 | 讀取 | 更新 | 刪除 |
|---|---|---|---|---|---|
| User | 使用者帳號 | 是 | 是 | 是 | 軟刪除 |
| Group | 團隊 | 是 | 是 | 是 | 是 |

::: warning 
SCIM Group 對應到 SnapOtter 的**團隊**，而非角色。SCIM 無法設定使用者的角色。所有透過 SCIM 建立的使用者都會被指派 `user` 角色。若要變更使用者的角色，請使用 SnapOtter 管理員 UI。
:::

## 使用者操作 {#user-operations}

### 建立使用者 {#create-user}

`POST /api/v1/scim/v2/Users`

建立一個新的使用者帳號，其 `authProvider` 設為 `scim` 並具備 `user` 角色。該使用者會被指派到 Default 團隊。若 `active` 為 `false`，則角色會改設為 `disabled`。

必要屬性：`userName`。選用屬性：`externalId`、`emails`、`active`（預設為 `true`）。

### 列出並篩選使用者 {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

回傳使用者的分頁清單。支援 `startIndex` 與 `count` 查詢參數（每頁最多 200 筆結果）。

篩選僅支援 `eq`（等於），適用於下列屬性：

- `userName eq "jane"`
- `externalId eq "ext-12345"`

其他篩選運算子與屬性會回傳 HTTP 400。

### 取得使用者 {#get-user}

`GET /api/v1/scim/v2/Users/:id`

依 SnapOtter 使用者 ID 回傳單一使用者。

### 取代使用者 {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

取代使用者的屬性。支援 `userName`、`externalId`、`emails` 與 `active`。使用者名稱變更會檢查衝突（若新使用者名稱已被其他使用者佔用則回傳 409）。

### 修補使用者 {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

使用 SCIM PatchOp 進行部分更新。支援的操作：

| 操作 | 路徑 |
|---|---|
| `replace` | `active`、`userName`、`externalId`、`emails`、`emails[type eq "work"].value`、`name.formatted`、`displayName` |
| `add` | 與 `replace` 相同 |
| `remove` | `externalId`、`emails` |

`name.formatted` 與 `displayName` 路徑為了相容性而被接受，但沒有持久效果（SnapOtter 不會另外儲存顯示名稱）。

無值的 `replace` 操作（其值為一個不含 `path` 的物件）同樣受支援，鍵為 `userName`、`externalId`、`emails` 與 `active`。

### 停用使用者（軟刪除） {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter 不會透過 SCIM 硬刪除使用者。相反地，DELETE 會執行軟停用：

1. 使用者的角色會從其目前值（例如 `editor`）變更為 `disabled:editor`，並保留原本的角色。
2. 使用者的密碼會被清除。
3. 所有使用中的工作階段都會被撤銷。
4. 所有 API 金鑰都會被撤銷。

該使用者將無法再登入或使用任何 API 金鑰。他們的資料（檔案、歷史記錄）會被保留。

### 重新啟用使用者 {#reactivate-user}

若要重新啟用先前已停用的使用者，請以 `active: true` 傳送 `PUT` 或 `PATCH` 請求。SnapOtter 會還原停用前的原始角色（例如 `disabled:editor` 會再次變回 `editor`）。若無法判定原始角色，則會回退至 `user`。

::: details 範例：透過 PATCH 停用及重新啟用
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

## 群組操作 {#group-operations}

SCIM Group 對應到 SnapOtter 團隊。建立群組會建立一個團隊。群組成員資格控制使用者所屬的團隊。

### 建立群組 {#create-group}

`POST /api/v1/scim/v2/Groups`

必要：`displayName`。選用：`members`（`{ value: userId }` 的陣列）。

### 列出並篩選群組 {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

篩選僅支援 `displayName eq "..."`。以 `startIndex` 與 `count` 分頁（每頁最多 200 筆結果）。

### 取得群組 {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### 取代群組 {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

取代群組名稱與完整成員清單。不在新清單中的現有成員會被移至 Default 團隊。

### 修補群組 {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

支援下列操作：

| 操作 | 路徑 | 效果 |
|---|---|---|
| `add` | `members` | 將使用者加入團隊 |
| `remove` | `members[value eq "userId"]` | 將使用者移至 Default 團隊 |
| `replace` | `displayName` | 重新命名團隊 |
| `replace` | `members` | 取代所有成員（被移除的成員會移至 Default 團隊） |

### 刪除群組 {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

刪除該團隊。被刪除團隊的所有成員都會被移至 Default 團隊。使用者不會被停用或刪除。

## IdP 設定 {#idp-setup}

### Okta {#okta}

1. 在 Okta 管理員主控台中，開啟您的 SnapOtter 應用程式（或建立一個）。
2. 前往 **Provisioning** 分頁並點選 **Configure API Integration**。
3. 勾選 **Enable API Integration** 並輸入：
   - **Base URL**：`https://photos.example.com/api/v1/scim/v2`
   - **API Token**：上方產生的 SCIM bearer 權杖
4. 點選 **Test API Credentials**，然後點選 **Save**。
5. 在 **Provisioning > To App** 下，啟用：
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. 在 **Push Groups** 下，設定要以 SnapOtter 團隊同步的 Okta 群組。

### Azure AD / Entra ID {#azure-ad-entra-id}

1. 在 Azure 入口網站中，前往您的 SnapOtter 企業應用程式。
2. 前往 **Provisioning** 並將 **Provisioning Mode** 設為 **Automatic**。
3. 在 **Admin Credentials** 下，輸入：
   - **Tenant URL**：`https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**：上方產生的 SCIM bearer 權杖
4. 點選 **Test Connection**，然後點選 **Save**。
5. 在 **Mappings** 下，設定使用者與群組屬性對應。預設值通常可正常運作，但請確認 `userName` 依需求對應到 `userPrincipalName` 或 `mail`。
6. 將 **Provisioning Status** 設為 **On** 並儲存。

Azure 會依固定的同步週期（通常每 40 分鐘）佈建使用者與群組。

## 探索端點 {#discovery-endpoints}

下列三個端點無需驗證即可使用，並描述 SCIM 伺服器的功能：

| 端點 | 說明 |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | 伺服器功能與支援的特性 |
| `GET /api/v1/scim/v2/Schemas` | User 與 Group 結構定義 |
| `GET /api/v1/scim/v2/ResourceTypes` | 可用的資源類型（User、Group） |

`ServiceProviderConfig` 會宣告下列功能：

| 特性 | 是否支援 |
|---|---|
| Patch | 是 |
| Bulk | 否 |
| Filter | 是（最多 200 筆結果，僅 `eq` 運算子） |
| Change password | 否 |
| Sort | 否 |
| ETag | 否 |

## 限制 {#limitations}

- **篩選**：僅支援 `eq` 運算子。複雜篩選、`and`/`or` 運算子、`co`（contains）與 `sw`（starts with）皆未實作。
- **批次操作**：不支援。
- **Sort 與 ETag**：不支援。
- **角色**：SCIM 無法指派 SnapOtter 角色。所有佈建的使用者都會取得 `user` 角色。
- **MAX_USERS**：SCIM 建立使用者時不會強制執行 `MAX_USERS` 環境變數限制。若您需要限制使用者數量，請在您的 IdP 中管理指派。
- **單一權杖**：同一時間只能有一個 SCIM 權杖處於使用中狀態。若多個 IdP 需要 SCIM 存取權，它們必須共用該權杖。
- **群組即團隊**：SCIM Group 對應到團隊，而非角色或權限群組。

## 疑難排解 {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

您的授權未包含 `scim` 功能，或未設定任何授權。SCIM 需要企業版方案授權。請確認 `SNAPOTTER_LICENSE_KEY` 已設定，且該授權包含 `scim` 功能。

### 401 "Bearer token required" {#_401-bearer-token-required}

SCIM 請求未包含 `Authorization: Bearer <token>` 標頭。請檢查您 IdP 的佈建設定。

### 401 "Invalid token" {#_401-invalid-token}

權杖與已儲存的雜湊值不符。這會在權杖已被撤銷並重新產生時發生。請在您 IdP 的佈建設定中更新該權杖。

### 401 "SCIM not configured" {#_401-scim-not-configured}

尚未產生任何 SCIM 權杖。請使用 `POST /api/v1/enterprise/scim/token` 端點來建立一個。

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

已存在使用相同使用者名稱的使用者。這可能在 IdP 重試失敗的建立操作時發生。請在 SnapOtter 管理面板中檢查是否有重複的使用者名稱。

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP 每分鐘傳送超過 1000 個請求。這通常在大型初始同步期間發生。大多數 IdP 會在速率限制視窗重設後自動重試。若問題持續存在，請檢查您 IdP 的佈建同步間隔。

### 使用者已解除佈建但未從 UI 移除 {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE 是軟停用。已停用的使用者仍會以停用狀態顯示在管理員使用者清單中。這是刻意的設計，以便保留他們的資料。他們的角色會顯示為 `disabled:<original-role>`。
