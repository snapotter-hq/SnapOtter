---
title: "錯誤碼"
description: "錯誤回應的內容結構、穩定的錯誤碼，以及各項錯誤的處理方式。"
i18n_source_hash: 7e48ef36024d
i18n_provenance: machine
i18n_output_hash: 6a33b43d4b2b
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
| `AUTH_REQUIRED` | 401 | 請傳送 `Authorization: Bearer <token>`，並帶上工作階段權杖或 API 金鑰（`si_...`）。 |
| `FORBIDDEN` | 403 | 憑證有效但缺少該權限。請向管理員申請權限。 |
| `MUST_CHANGE_PASSWORD` | 403 | 此帳號必須先變更密碼，才能呼叫其他端點。請使用工作階段權杖呼叫 `POST /api/auth/change-password`，然後重試。 |
| `USER_DISABLED` | 403 | 此帳號已停用，必須由管理員重新啟用。 |
| `LOGIN_THROTTLED` | 429 | 登入失敗次數過多，請稍候再試。 |
| `VALIDATION_ERROR` | 400 | 請求內容或參數未通過驗證。`details` 會指出問題所在。 |

首次執行時的管理員帳號為 `admin`，密碼為 `admin`，除非 `DEFAULT_USERNAME` 或 `DEFAULT_PASSWORD` 已將其變更。除非設定了 `SKIP_MUST_CHANGE_PASSWORD`，否則在密碼變更之前，該帳號的每次呼叫都會得到 `MUST_CHANGE_PASSWORD`。

## 工作 {#job-codes}

失敗的工作會在工作本身回報原因，而不是透過 HTTP 錯誤。請讀取 `error.code` 與 `error.message`，來源為 `GET /api/v1/jobs/{jobId}`。請參閱[進度追蹤](/zh-TW/api/rest#progress-tracking)。

失敗的工作只有在失敗原因為輸入錯誤或伺服器故障時，才會保留 `error.code`。其他失敗只會附上訊息。

| `code` | 說明 | 處理方式 |
|--------|---------|------------|
| `CANCELED` | 工作已被使用者取消。這不是 HTTP 狀態碼。進度事件會帶有 `phase: failed` 與此代碼。 | 視為使用者取消，請勿自動重試。 |
| `INPUT_MISSING` | 輸入檔案在工作執行前已被移除。 | 請重新上傳檔案。 |
| `ENGINE_UNAVAILABLE` | 伺服器上有必要的引擎無法啟動。 | 請在管理員修復安裝後重試。 |
| `JOB_STALLED` | 不會回傳給用戶端，僅用來標記伺服器的錯誤報告。工作程序遺失工作鎖定的次數超過佇列允許的上限，通常是因為伺服器重新啟動，或記憶體或 CPU 不足。該工作會失敗，並附上說明其遭到中斷的訊息。 | 請重試。若持續發生，請為伺服器增加記憶體，或調低 `CONCURRENT_JOBS`。 |

## 驗證與 MFA {#mfa-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | MFA 政策要求使用者註冊，但此執行個體無法為使用者註冊（沒有企業授權）。有授權的執行個體會改為回傳 200 與 `requiresMfaEnrollment: true`，並引導使用者完成註冊。 | 請勿重試。管理員必須變更政策，或使用離線復原 CLI。 |
| `MFA_POLICY_UNAVAILABLE` | 503 | 伺服器在登入期間無法讀取 MFA 政策。 | 請稍後重試登入。 |
| `INVALID_CODE` | 401 | TOTP 或復原碼不正確。 | 請向使用者索取新的代碼後重試。重複失敗最終會得到 `MFA_ATTEMPTS_EXHAUSTED`。 |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | 錯誤的代碼次數過多，驗證挑戰已被捨棄。 | 請重新開始登入以取得新的驗證挑戰。 |
| `MFA_EXPIRED` | 401 | MFA 或註冊的驗證挑戰已過期或不相符。 | 請重新開始登入。 |
| `MFA_NOT_CONFIGURED` | 401 | 此帳號沒有 TOTP 密鑰，因此無法檢查代碼。 | 請先註冊 MFA，再以代碼登入。 |
| `MFA_ALREADY_ENABLED` | 409 | 此帳號已啟用 MFA。 | 請勿再次註冊。 |
| `NO_PENDING_ENROLLMENT` | 400 | 收到註冊確認，但沒有待處理的註冊。 | 請先呼叫註冊端點。 |
| `MFA_NOT_ENABLED` | 400 | 此動作需要啟用 MFA，但此使用者尚未啟用。 | 請略過此動作，或先啟用 MFA。 |
| `MFA_DECRYPTION_FAILED` | 500 | 儲存的 TOTP 密鑰無法解密。 | 需由營運人員處理。這通常表示加密金鑰已變更。請檢查 `DATA_ENCRYPTION_KEY` 與 `DATA_ENCRYPTION_KEY_PREVIOUS`。 |
| `DECRYPTION_FAILED` | 500 | 儲存的值（設定、webhook 驗證標頭或 TOTP 密鑰）無法解密。 | 同上，需由營運人員處理。請勿重試。 |
| `IDLE_TIMEOUT` | 401 | 工作階段因閒置一段時間而過期。 | 請重新登入。 |
| `INVALID_PASSWORD` | 401 | 變更密碼時，目前的密碼不正確。 | 請向使用者詢問目前的密碼。 |
| `PASSWORD_CHANGED` | 409 | 在此請求執行期間，密碼已在另一個工作階段中變更，或已被管理員重設。 | 請重新登入。 |
| `OIDC_NO_PASSWORD` | 400 | 對透過 SSO 建立的帳號要求變更或重設密碼。 | 請引導使用者前往身分提供者。 |

## OIDC {#oidc-codes}

登入期間的 OIDC 失敗不會回傳 JSON 內容。登入路由會以通用的原因重新導向至登入頁面，稽核日誌則會記錄代碼。當無法連線到身分提供者時，登出路由仍會結束本機工作階段。

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | 無（重新導向） | 簽發者 URL 為 `http`，但 `EXTERNAL_URL` 為 `https`，因此用戶端拒絕進行探索。 | 管理員：請透過 `https` 提供簽發者，或透過 `http` 執行此執行個體。 |
| `OIDC_DISCOVERY_TIMEOUT` | 無（重新導向） | 簽發者的探索逾時。 | 請確認伺服器可以連線到簽發者，然後重試。 |
| `OIDC_DISCOVERY_FAILED` | 無（重新導向） | 探索因其他原因失敗。 | 請檢查簽發者 URL 與伺服器的對外連線。 |
| `OIDC_END_SESSION_INVALID` | 無（登出繼續） | 身分提供者的 `end_session_endpoint` 不是有效的 URL。本機工作階段仍會被清除。 | 管理員：請修正提供者的中繼資料。 |
| `OIDC_END_SESSION_SCHEME` | 無（登出繼續） | `end_session_endpoint` 使用了伺服器不允許的配置。本機工作階段仍會被清除。 | 管理員：請修正提供者的中繼資料。 |

## SAML {#saml-codes}

SAML 失敗不會設定 `code`。失敗的斷言會以 `saml_auth_failed` 重新導向至登入頁面，原因則記錄在 `SAML_LOGIN_FAILED` 稽核事件中。

## SCIM {#scim-codes}

SCIM 路由會以 RFC 7644 的錯誤封包回應（`schemas`、`detail`、`status`，有時還有 `scimType`）。它們不會設定 `code`。請依 HTTP 狀態碼進行分支處理。

## 團隊、角色與使用者 {#team-role-codes}

重複的團隊或角色名稱會回傳通用的 `CONFLICT`，找不到團隊或角色則會回傳 `NOT_FOUND`。

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | 呼叫者的角色不允許此變更。目標的權限高於呼叫者、該角色為內建角色，或請求授予了呼叫者本身不具備的權限。 | 請勿重試。請向權限更高的使用者求助。 |
| `UNKNOWN_ROLE` | 400 | 角色 ID 與任何現有角色都不相符。 | 請修正角色 ID。可列出角色來查找。 |
| `UNKNOWN_TEAM` | 400 | 團隊 ID 與任何現有團隊都不相符。 | 請修正團隊 ID。 |
| `SELF_DEMOTE` | 400 | 管理員嘗試移除自己的管理員角色。 | 請由另一位管理員進行變更。 |
| `SELF_DELETE` | 400 | 管理員嘗試刪除自己的帳號。 | 請由另一位管理員刪除。 |
| `LAST_ADMIN` | 使用者路由為 400，GDPR 清除路由為 409 | 此變更會導致沒有任何管理員，或清除了包含所有管理員的團隊。 | 請先將另一位使用者設為管理員。 |
| `USER_LIMIT_REACHED` | 403 | 此執行個體已達 `MAX_USERS` 上限。 | 請移除一位使用者，或調高 `MAX_USERS`。 |

## 功能與 AI 套件 {#feature-codes}

需要選用 AI 套件的工具、批次執行與管線會使用這些代碼。

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501，或智慧裁切的人臉模式為 400 | 工具，或管線或批次中的某個步驟，需要尚未安裝的套件。內容包含 `feature`（套件 ID）與 `featureName`。 | 請在設定中安裝該套件，然後重試。 |
| `FEATURE_CPU_UNSUPPORTED` | 409 | 安裝或離線匯入遭到拒絕，因為該套件的 x86-64 函式庫需要 AVX，而此伺服器的 CPU 不支援。沒有下載或安裝任何內容。內容包含 `feature`（套件 ID）與 `reason`（`cpu-no-avx`）。`GET /api/v1/features` 會以 `compatibility: "incompatible"` 與 `compatibilityReason: "cpu-no-avx"` 回報同一個套件。 | 請在支援 AVX 的 CPU 或 arm64 上執行 SnapOtter。其他套件仍可安裝。 |
| `FEATURE_INSTALL_BUSY` | 409 | 取消遭到拒絕，因為安裝程式正在寫入共用的 AI 環境，在此時停止它會破壞所有已安裝的 AI 工具。 | 請等待安裝完成，若不想保留該套件，再將其解除安裝。 |
| `FEATURE_INCOMPATIBLE` | 501，或快速 OCR 收到它無法讀取的語言時為 400 | 已安裝的功能無法提供所要求的品質或語言。 | 請變更設定，或安裝支援該項目的套件。 |
| `ENGINE_UNAVAILABLE` | 503 | 必要的引擎無法啟動，或在請求通過驗證後 OCR 執行環境被移除。 | 請在管理員修復或重新安裝該功能後重試。 |
| `BROWSER_NOT_AVAILABLE` | 503 | 未安裝 Chromium，因此 HTML 轉圖片無法執行。 | 請管理員安裝該瀏覽器。 |
| `BROWSER_CRASHED` | 503 | 截圖用的瀏覽器在算繪時當機。 | 請重試該請求。 |

## 工具 {#tool-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | 上傳的輸入檔案在工作執行前已被移除。 | 請重新上傳檔案並提交工作。 |
| `ANALYSIS_EXPIRED` | 410 | 證件照分析在產生前已過期。 | 請重新分析照片，然後再產生。 |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | 去背結果在後續步驟前已過期。 | 請重新去背。 |
| `NOT_ANIMATED` | 400 | 移除 GIF 背景收到的是靜態圖片。 | 靜態圖片請使用移除背景。 |
| `TOO_MANY_FRAMES` | 400 | 動畫的影格數超過伺服器允許的上限（`GIF_BG_MAX_FRAMES`）。 | 請傳送較短的動畫，或請管理員調高上限。 |
| `TOO_MANY_PIXELS` | 400 | 動畫的畫布大小乘以影格數，超過伺服器的上限：移除 GIF 背景為 268,402,689 像素（16383 x 16383），其他動畫工具則為 GIF 工作負載上限。 | 請減少影格數，或傳送較小的動畫。 |
| `MULTI_FRAME_UNSUPPORTED` | 400 | AI 圖片工具收到多頁 TIFF、動態 GIF 或 WebP，而輸出格式會保留每一個影格。這些工具一次只對一張圖片執行模型。 | 請將檔案拆分為個別的圖片。若工具有輸出格式設定，選擇 PNG 等靜態格式只會處理第一個影格。 |
| `IMAGE_TOO_LARGE` | 400 | 圖片的像素數超過解碼器可接受的範圍。 | 請傳送較小的圖片。 |
| `SVG_TOO_COMPLEX` | 400 | SVG 未能在 `JOB_TIMEOUT_FAST_S` 內完成點陣化。常見原因是 `<use>` 重複的圖形上套用了濾鏡，因為每一份複本都會重新繪製濾鏡。 | 請簡化濾鏡或重複的圖形，或請管理員調高上限。 |
| `RESULT_TOO_LARGE` | 400 | 這些設定會產生超出編碼器或像素上限所允許大小的圖片。 | 請使用較小的圖片，或能產生較小結果的設定。 |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice 或 pandoc 無法開啟該文件。文件可能已損毀、受密碼保護，或實際格式與副檔名不符。 | 請確認檔案能在辦公室軟體中開啟，然後重新傳送。 |
| `PDF_DAMAGED` | 400 | PDF 引擎發現文件結構損毀。 | 請先以修復 PDF 處理該檔案，然後重試。 |
| `PDF_PASSWORD_PROTECTED` | 400 | 此 PDF 已加密，這個工具無法開啟。 | 請先以解鎖 PDF 解鎖。 |
| `NO_AUDIO_TRACK` | 400 | 檔案沒有音訊工具可使用的音訊串流。 | 請傳送含有音訊的檔案。 |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg 無法讀取該音訊或影片：找不到封包、找不到編碼參數、找不到 `moov` atom，或資料無法解析。 | 請確認檔案能在媒體播放器中播放，或重新匯出，然後重試。 |
| `ENCODED_TEXT_INVALID` | 400 | Base64 編碼 / 解碼收到不是 Base64 的輸入。空白字元會被忽略，標準與 URL 安全字母表皆可接受。 | 請檢查文字中是否有多餘字元，或結尾被截斷。 |
| `DECODED_DATA_NOT_TEXT` | 400 | 該 Base64 有效，但解碼後是二進位資料，而非 UTF-8 文字。 | 請改用會儲存為檔案而非顯示文字的工具解碼。 |
| `PAGE_OUT_OF_RANGE` | 400 | 頁面範圍指定了 PDF 沒有的頁面。 | 請確認頁數，並傳送在頁數範圍內的區間。 |
| `INVALID_PAGE_RANGE` | 400 | 頁面範圍的語法無效。 | 請使用像 `1-3,5` 這樣的頁碼。 |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | 移除頁面被要求移除所有頁面。 | 請至少保留一頁。 |
| `NESTING_TOO_DEEP` | 400 | JSON 或 XML 的巢狀層級超過 100 層。 | 請先將文件扁平化，然後再轉換。 |
| `IMAGE_UNDECODABLE` | 400 | 無法解碼該圖片，或無法讀取其尺寸。檔案可能已損毀，或使用了解碼器不支援的編碼。 | 請從其他應用程式重新匯出圖片，或先轉換為 PNG 或 JPEG。 |
| `INVALID_SETTINGS` | 400 | 某項設定超出範圍，或不適用於此檔案：裁切範圍在圖片之外、縮放為零、動畫中沒有指定的 GIF 影格、不存在的證件照規格。`error` 文字會指出是哪項設定。 | 請修正 `error` 中指出的設定，然後重試。 |
| `CHART_DATA_INVALID` | 400 | 圖表製作工具無法從檔案讀取圖表資料：CSV 或 JSON 無法解析、沒有數值欄、超過 100 列，或含有負值。`error` 文字會說明是哪一種情況。 | 請傳送最多 100 列的 CSV 或 JSON，每列包含一個標籤與一個大於或等於零的數字。 |
| `NO_FACE_DETECTED` | 400 | 證件照在圖片中找不到人臉。 | 請傳送光線良好、正面清晰的照片。 |
| `TARGET_SIZE_UNREACHABLE` | 400 | 壓縮或證件照的大小限制，即使縮小後也無法讓檔案低於要求的大小。 | 請要求較大的目標大小，或先裁切圖片。 |
| `TOO_MANY_PAGES` | 400 | OCR 被要求處理的頁數超過單一工作可處理的數量。 | 請以頁面範圍選擇較少的頁面。 |
| `OCR_OUTPUT_TOO_LARGE` | 500 | 對多頁 TIFF 執行 OCR 時，各頁讀出的文字超過 1,000,000 位元組，超出單一結果可儲存的大小。 | 請將 TIFF 拆分為較小的檔案，並對每個檔案分別執行 OCR。 |
| `METADATA_DAMAGED` | 400 | 編輯中繼資料發現圖片現有的 EXIF 資料已損毀，因此無法安全地改寫。 | 請先以移除圖片中繼資料清除中繼資料，然後再編輯。 |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML 或 Markdown 轉 PDF 發現對網路上圖片、樣式表或字型的參照，而伺服器不會擷取這些資源。 | 請將資源嵌入檔案中（例如使用 `data:` URI），然後重試。 |

## 檔案 {#file-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | 儲存到檔案會超出使用者的儲存空間配額。 | 請刪除檔案，或請管理員提供更多空間。 |
| `INVALID_STORED_NAME` | 400 | 伺服器拒絕了儲存的檔案名稱。 | 請重新上傳檔案。 |

## 管線與批次 {#pipeline-codes}

管線與批次請求，對於每個需要套件的步驟，會回傳上述的功能代碼。已在使用中的工作 ID 會回傳 `CONFLICT`，狀態碼為 409。請傳送新的工作 ID。

## 設定 {#settings-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | 該金鑰不是已知的設定。 | 請檢查金鑰名稱。 |
| `READONLY_SETTING` | 400 | 此設定無法透過 API 變更。 | 請透過環境變數或管理介面變更。 |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | 新的值與其他設定衝突。內容會在 `setting` 中指出該設定，並在 `validationErrors` 中列出問題。 | 請修正所列出的設定，然後重試。 |
| `SETTING_DECRYPTION_FAILED` | 500 | 儲存的設定無法解密。 | 需由營運人員處理，與 `DECRYPTION_FAILED` 相同。 |

對於設定上的 `VALIDATION_ERROR`，`details` 會包含結構描述的問題。

## 企業版 {#enterprise-codes}

| `code` | 狀態碼 | 說明 | 處理方式 |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | 此設定或政策需要企業授權，例如 SSO 強制執行或 MFA 政策。 | 請使用有授權的執行個體，或保持該設定關閉。 |
| `IP_NOT_ALLOWED` | 403 | 請求的 IP 位址不在允許清單中。 | 請從允許的網路連線。 |
| `INVALID_CIDR` | 400 | 允許清單中的項目不是有效的 CIDR。訊息會列出無效的項目。 | 請修正這些項目後再儲存。 |
| `SELF_LOCKOUT` | 400 | 儲存允許清單會封鎖呼叫者目前的 IP。 | 請先將您目前的 IP 加入清單。 |

GDPR 清除路由在使用者或團隊處於法律保全狀態時，會回傳一般的 `CONFLICT`，狀態碼為 409。

## 用戶端不會收到的代碼 {#internal-codes}

這些代碼存在於伺服器原始碼中，用於日誌、遙測或 Fastify 本身的錯誤。用戶端不會在回應內容或工作資料列中收到它們，因此請勿依據它們撰寫用戶端邏輯。

| `code` | 去向 |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | 由警示評估器回報至錯誤追蹤。警示 webhook 的驗證標頭無法解密。 |
| `SIEM_DECRYPTION_FAILED` | 由 SIEM 轉送回報至錯誤追蹤。SIEM 的驗證標頭無法解密。 |
| `WEBHOOK_DECRYPTION_FAILED` | 回報至錯誤追蹤。遇到同樣失敗的請求會回應 `DECRYPTION_FAILED`。 |
| `STAGED_DISCARD_FAILED` | 當暫存的上傳檔案無法移除時，回報至錯誤追蹤。 |
| `RETENTION_DEADLINE_BACKFILLED` | 當儲存空間 TTL 清理作業為已完成工作補上缺少的團隊保留期限時，回報至錯誤追蹤。該工作的檔案之後會依團隊的保留設定處理。 |
| `USERNAME_RACE_EXHAUSTED` | 當 SSO 自動建立在每次重試都輸掉使用者名稱競爭時引發。登入頁面會改為顯示錯誤。 |
| `ERR_OUT_OF_RANGE` | 物件儲存讀取器遇到無效的位元組範圍時擲回。 |
| `ETIMEDOUT` | 設定在 GDPR 匯出的逾時錯誤上。匯出會失敗，並可再次要求。 |
| `FST_REQ_FILE_TOO_LARGE` | Fastify 對超過上限的上傳所使用的代碼。用戶端會得到帶有 `PAYLOAD_TOO_LARGE` 的 413，或該路由自己的 413 訊息。 |
| `TARGET_SIZE_EXCEEDED` | 目標大小壓縮未達目標時擲回。該錯誤沒有狀態碼或代碼，因此用戶端會得到一般的失敗。 |
| `OCR_CACHE_PERMISSIONS` | 當 AI 資料磁碟區使 OCR 執行環境快取可被任何人寫入時，作為營運故障回報至錯誤追蹤。安裝工作會失敗，並附上指出儲存空間問題的訊息。 |
| `OCR_RUNTIME_UNREACHABLE` | 當伺服器始終無法連線到 huggingface.co 以下載 OCR 執行環境時，作為營運故障回報至錯誤追蹤。安裝工作會失敗，並附上關於網路存取、`HTTPS_PROXY`、`HF_ENDPOINT` 與離線匯入的訊息。 |
