---
title: "錯誤碼"
description: "錯誤回應的內容結構、穩定的錯誤碼，以及各項錯誤的處理方式。"
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: c603d3214182
i18n_hash_version: 2
---

# 錯誤碼 {#error-codes}

每個 JSON 錯誤回應都具有相同的結構：

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| 欄位 | 是否一定存在 | 說明 |
|-------|----------------|---------|
| `error` | 是 | 供人閱讀的訊息，可安全地顯示給使用者。請勿對其進行解析。 |
| `code` | 是 | 穩定且可供機器讀取的代碼。請依此進行分支處理。 |
| `requestId` | 是 | 伺服器為此請求指派的 ID。回報問題時請附上，它與伺服器日誌相符。 |
| `details` | 有時 | 部分 4xx 錯誤的額外背景資訊，例如驗證訊息。 |

訊息可能在不同版本之間變動，代碼則不會，因此請依據 `code` 撰寫用戶端邏輯。

## 依 HTTP 狀態碼產生的代碼 {#status-codes}

當路由未設定自己的代碼時，伺服器會依狀態碼推導出一個代碼：

| HTTP 狀態碼 | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

其他任何 4xx 會回退為 `BAD_REQUEST`，其他任何 5xx 則回退為 `INTERNAL_ERROR`。

路由可以設定更具體的代碼，此時回應會改為帶有該代碼。例如，因缺少 AI 套件而無法執行的工具，會回傳該功能專屬的代碼。這些代碼會在引發它們的功能中說明。

## 驗證與存取 {#auth-codes}

| `code` | 狀態碼 | 處理方式 |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | 請以工作階段權杖或 API 金鑰（`si_...`）傳送 `Authorization: Bearer <token>`。 |
| `FORBIDDEN` | 403 | 憑證有效但缺少該權限。請向管理員申請權限。 |
| `MUST_CHANGE_PASSWORD` | 403 | 此帳號必須先變更密碼，才能呼叫其他端點。請使用工作階段權杖呼叫 `POST /api/auth/change-password`，然後重試。 |
| `USER_DISABLED` | 403 | 此帳號已停用，必須由管理員重新啟用。 |
| `LOGIN_THROTTLED` | 429 | 登入失敗次數過多，請稍候再試。 |
| `VALIDATION_ERROR` | 400 | 請求內容或參數未通過驗證。`details` 會指出問題所在。 |

首次執行時的管理員帳號為 `admin`，密碼為 `admin`，除非 `DEFAULT_USERNAME` 或 `DEFAULT_PASSWORD` 已將其變更。除非設定了 `SKIP_MUST_CHANGE_PASSWORD`，否則在密碼變更之前，該帳號的每次呼叫都會得到 `MUST_CHANGE_PASSWORD`。

## 工作 {#job-codes}

失敗的工作會在工作本身回報原因，而不是透過 HTTP 錯誤。請從 `GET /api/v1/jobs/{jobId}` 讀取 `error.code` 與 `error.message`。請參閱[進度追蹤](/zh-TW/api/rest#progress-tracking)。

只有當失敗原因是輸入錯誤或伺服器故障時，失敗的工作才會保留 `error.code`。其他失敗只會帶有訊息。

| `code` | 說明 | 處理方式 |
|--------|---------|------------|
| `CANCELED` | 工作已由使用者取消。這不是 HTTP 狀態碼。進度事件會帶有此代碼的 `phase: failed`。 | 視為使用者取消，請勿自動重試。 |
| `INPUT_MISSING` | 輸入檔案在工作執行前已被移除。 | 請重新上傳檔案。 |
| `ENGINE_UNAVAILABLE` | 伺服器上有必要的引擎無法啟動。 | 請在管理員修復安裝後重試。 |

## 驗證與 MFA {#mfa-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | MFA 政策要求註冊，而此執行個體無法為使用者註冊（沒有企業授權）。有授權的執行個體則會回傳 200 與 `requiresMfaEnrollment: true`，並引導使用者完成註冊。 | 請勿重試。管理員必須變更政策，或使用離線復原 CLI。 |
| `MFA_POLICY_UNAVAILABLE` | 503 | 伺服器在登入期間無法讀取 MFA 政策。 | 請稍後重新登入。 |
| `INVALID_CODE` | 401 | TOTP 或復原碼不正確。 | 請向使用者索取新的驗證碼後重試。多次失敗會以 `MFA_ATTEMPTS_EXHAUSTED` 作結。 |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | 錯誤的驗證碼次數過多，挑戰已作廢。 | 請重新開始登入以取得新的挑戰。 |
| `MFA_EXPIRED` | 401 | MFA 或註冊挑戰已過期或不相符。 | 請重新開始登入。 |
| `MFA_NOT_CONFIGURED` | 401 | 此帳號沒有 TOTP 密鑰，因此無法檢查驗證碼。 | 請先註冊 MFA，再以驗證碼登入。 |
| `MFA_ALREADY_ENABLED` | 409 | 此帳號已啟用 MFA。 | 請勿再次註冊。 |
| `NO_PENDING_ENROLLMENT` | 400 | 收到註冊確認，但沒有待處理的註冊。 | 請先呼叫註冊端點。 |
| `MFA_NOT_ENABLED` | 400 | 此操作需要開啟 MFA，但此使用者已關閉。 | 請略過此操作，或先啟用 MFA。 |
| `MFA_DECRYPTION_FAILED` | 500 | 儲存的 TOTP 密鑰無法解密。 | 需由營運人員處理。這通常表示加密金鑰已變更。請檢查 `DATA_ENCRYPTION_KEY` 與 `DATA_ENCRYPTION_KEY_PREVIOUS`。 |
| `DECRYPTION_FAILED` | 500 | 儲存的值（設定、Webhook 驗證標頭或 TOTP 密鑰）無法解密。 | 同上，需由營運人員處理。請勿重試。 |
| `IDLE_TIMEOUT` | 401 | 工作階段因閒置一段時間而過期。 | 請重新登入。 |
| `INVALID_PASSWORD` | 401 | 變更密碼時，目前的密碼不正確。 | 請向使用者索取目前的密碼。 |
| `PASSWORD_CHANGED` | 409 | 在此請求執行期間，密碼已在另一個工作階段中變更，或已由管理員重設。 | 請重新登入。 |
| `OIDC_NO_PASSWORD` | 400 | 對透過 SSO 建立的帳號要求變更或重設密碼。 | 請引導使用者前往身分提供者。 |

## OIDC {#oidc-codes}

登入期間的 OIDC 失敗不會回傳 JSON 內容。登入路由會以一般性的原因重新導向至登入頁面，稽核日誌則會記錄代碼。當無法連線到身分提供者時，登出路由仍會結束本機工作階段。

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | 無（重新導向） | 簽發者 URL 為 `http`，但 `EXTERNAL_URL` 為 `https`，因此用戶端拒絕進行探索。 | 管理員：請透過 `https` 提供簽發者，或以 `http` 執行此執行個體。 |
| `OIDC_DISCOVERY_TIMEOUT` | 無（重新導向） | 簽發者的探索已逾時。 | 請確認伺服器可以連線到簽發者，然後重試。 |
| `OIDC_DISCOVERY_FAILED` | 無（重新導向） | 探索因其他原因而失敗。 | 請檢查簽發者 URL 與伺服器的對外連線。 |
| `OIDC_END_SESSION_INVALID` | 無（登出會繼續） | 身分提供者的 `end_session_endpoint` 不是有效的 URL。本機工作階段仍會被清除。 | 管理員：請修正提供者的中繼資料。 |
| `OIDC_END_SESSION_SCHEME` | 無（登出會繼續） | `end_session_endpoint` 使用了伺服器不允許的配置。本機工作階段仍會被清除。 | 管理員：請修正提供者的中繼資料。 |

## SAML {#saml-codes}

SAML 失敗不會設定 `code`。失敗的斷言會以 `saml_auth_failed` 重新導向至登入頁面，並由 `SAML_LOGIN_FAILED` 稽核事件記錄原因。

## SCIM {#scim-codes}

SCIM 路由會以 RFC 7644 的錯誤封套回應（`schemas`、`detail`、`status`，有時還有 `scimType`）。它們不會設定 `code`。請依 HTTP 狀態碼進行分支處理。

## 團隊、角色與使用者 {#team-role-codes}

團隊或角色名稱重複時會回傳一般的 `CONFLICT`，找不到團隊或角色時則回傳 `NOT_FOUND`。

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | 呼叫者的角色不允許此變更。目標的權限高於呼叫者、該角色為內建角色，或請求授予了呼叫者本身沒有的權限。 | 請勿重試。請聯絡權限更高的使用者。 |
| `UNKNOWN_ROLE` | 400 | 角色 ID 與任何現有角色都不相符。 | 請修正角色 ID。可列出角色來查找。 |
| `UNKNOWN_TEAM` | 400 | 團隊 ID 與任何現有團隊都不相符。 | 請修正團隊 ID。 |
| `SELF_DEMOTE` | 400 | 管理員嘗試移除自己的管理員角色。 | 請由另一位管理員進行變更。 |
| `SELF_DELETE` | 400 | 管理員嘗試刪除自己的帳號。 | 請由另一位管理員刪除。 |
| `LAST_ADMIN` | 使用者路由為 400，GDPR 清除路由為 409 | 此變更會導致沒有任何管理員，或清除了包含所有管理員的團隊。 | 請先將另一位使用者設為管理員。 |
| `USER_LIMIT_REACHED` | 403 | 此執行個體已達到 `MAX_USERS` 上限。 | 請移除一位使用者，或調高 `MAX_USERS`。 |

## 功能與 AI 套件 {#feature-codes}

需要選用 AI 套件的工具、批次執行與管線會使用這些代碼。

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | 工具，或管線與批次中的某個步驟，需要尚未安裝的套件。內容包含 `feature`（套件 ID）與 `featureName`。 | 請在設定中安裝該套件，然後重試。 |
| `FEATURE_INCOMPATIBLE` | 501 | 已安裝的功能無法提供所要求的品質或語言。 | 請變更設定，或安裝支援該項目的套件。 |
| `ENGINE_UNAVAILABLE` | 503 | 必要的引擎無法啟動，或 OCR 執行環境在請求通過驗證後被移除。 | 請在管理員修復或重新安裝該功能後重試。 |
| `BROWSER_NOT_AVAILABLE` | 503 | 未安裝 Chromium，因此無法執行 HTML 轉圖片。 | 請管理員安裝該瀏覽器。 |
| `BROWSER_CRASHED` | 503 | 螢幕截圖瀏覽器在算繪時當機。 | 請重試該請求。 |

## 工具 {#tool-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | 已上傳的輸入檔案在工作執行前被移除。 | 請重新上傳檔案並提交工作。 |
| `ANALYSIS_EXPIRED` | 410 | 證件照分析在產生之前已過期。 | 請重新分析照片，然後再產生。 |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | 去背結果在後續步驟之前已過期。 | 請重新去背。 |
| `NOT_ANIMATED` | 400 | 移除 GIF 背景收到的是靜態圖片。 | 靜態圖片請使用移除背景。 |
| `TOO_MANY_FRAMES` | 400 | 動畫的影格數超過伺服器允許的上限（`GIF_BG_MAX_FRAMES`）。 | 請傳送較短的動畫，或請管理員調高上限。 |

## 檔案 {#file-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | 儲存到檔案會超過使用者的儲存配額。 | 請刪除檔案，或向管理員申請更多空間。 |
| `INVALID_STORED_NAME` | 400 | 伺服器拒絕了已儲存的檔案名稱。 | 請重新上傳檔案。 |

## 管線與批次 {#pipeline-codes}

管線與批次請求會對每個需要套件的步驟回傳上述的功能代碼。已被使用的工作 ID 會回傳 `CONFLICT`，狀態碼為 409。請傳送新的工作 ID。

## 設定 {#settings-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | 此鍵不是已知的設定。 | 請檢查鍵名。 |
| `READONLY_SETTING` | 400 | 此設定無法透過 API 變更。 | 請透過環境變數或管理介面變更。 |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | 新的值與其他設定衝突。內容會在 `setting` 中指出該設定，並在 `validationErrors` 中列出問題。 | 請修正所列出的設定，然後重試。 |
| `SETTING_DECRYPTION_FAILED` | 500 | 儲存的設定無法解密。 | 需由營運人員處理，與 `DECRYPTION_FAILED` 相同。 |

對設定發生 `VALIDATION_ERROR` 時，`details` 會包含結構描述的問題。

## 企業版 {#enterprise-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | 該設定或政策需要企業授權，例如 SSO 強制執行或 MFA 政策。 | 請使用有授權的執行個體，或保持該設定關閉。 |
| `IP_NOT_ALLOWED` | 403 | 請求的 IP 位址不在允許清單中。 | 請從允許的網路連線。 |
| `INVALID_CIDR` | 400 | 允許清單中的項目不是有效的 CIDR。訊息會列出有問題的項目。 | 請修正這些項目後再次儲存。 |
| `SELF_LOCKOUT` | 400 | 儲存此允許清單會封鎖呼叫者目前的 IP。 | 請先將您目前的 IP 加入清單。 |

當使用者或團隊處於法律保全狀態時，GDPR 清除路由會回傳單純的 `CONFLICT`，狀態碼為 409。

## 用戶端不會收到的代碼 {#internal-codes}

這些代碼存在於伺服器原始碼中，用於日誌、遙測或 Fastify 自身的錯誤。用戶端不會在回應內容或工作資料列中收到它們，因此請勿針對它們撰寫用戶端邏輯。

| `code` | 去向 |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | 由警示評估器回報給錯誤追蹤。警示 Webhook 的驗證標頭無法解密。 |
| `SIEM_DECRYPTION_FAILED` | 由 SIEM 轉送回報給錯誤追蹤。SIEM 的驗證標頭無法解密。 |
| `WEBHOOK_DECRYPTION_FAILED` | 回報給錯誤追蹤。遇到相同失敗的請求會以 `DECRYPTION_FAILED` 回應。 |
| `STAGED_DISCARD_FAILED` | 當暫存的上傳檔案無法移除時，回報給錯誤追蹤。 |
| `USERNAME_RACE_EXHAUSTED` | 當 SSO 自動建立在每次重試中都輸掉使用者名稱競爭時引發。登入頁面會改為顯示錯誤。 |
| `ERR_OUT_OF_RANGE` | 由物件儲存讀取器在位元組範圍無效時擲出。 |
| `ETIMEDOUT` | 設定在 GDPR 匯出的逾時錯誤上。匯出會失敗，可重新要求。 |
| `FST_REQ_FILE_TOO_LARGE` | Fastify 用於上傳超過限制的代碼。用戶端會收到帶有 `PAYLOAD_TOO_LARGE` 的 413，或該路由自己的 413 訊息。 |
| `TARGET_SIZE_EXCEEDED` | 當目標大小壓縮未達目標時擲出。此錯誤沒有狀態碼或代碼，因此用戶端會收到一般的失敗訊息。 |