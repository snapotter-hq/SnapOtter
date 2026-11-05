---
title: "錯誤碼"
description: "錯誤回應的內容結構、穩定的錯誤碼，以及各項錯誤的處理方式。"
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 3ef752e65340
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

## 尚未編目 {#not-yet-cataloged}

個別功能（例如加密、OIDC、SCIM 與團隊）所引發的代碼尚未在本頁說明。每一個都是穩定的代碼；請將未列出的代碼視為不透明，並依其狀態碼處理。
