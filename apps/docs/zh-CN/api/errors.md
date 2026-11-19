---
title: "错误码"
description: "错误响应体的结构、稳定的错误码，以及每种错误的处理方式。"
i18n_source_hash: dd2420de1d32
i18n_provenance: machine
i18n_output_hash: 52c87a836054
i18n_hash_version: 2
---

# 错误码 {#error-codes}

每个 JSON 错误响应都具有相同的结构：

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| 字段 | 是否始终存在 | 含义 |
|-------|----------------|---------|
| `error` | 是 | 供人阅读的消息，可以安全地展示给用户。请勿解析它。 |
| `code` | 是 | 稳定的、机器可读的错误码。请根据它进行分支处理。 |
| `requestId` | 是 | 服务器为本次请求分配的 ID。报告问题时请附上它，它与服务器日志相对应。 |
| `details` | 有时 | 部分 4xx 错误的更多上下文，例如校验消息。 |

消息可能会在不同版本之间变化，错误码则不会，因此请基于 `code` 编写客户端逻辑。

## 由 HTTP 状态码得出的错误码 {#status-codes}

当路由没有设置自己的错误码时，服务器会根据状态码推导出一个：

| HTTP 状态码 | `code` |
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

其他任何 4xx 都回退为 `BAD_REQUEST`，其他任何 5xx 回退为 `INTERNAL_ERROR`。

路由可以设置更具体的错误码，此时响应会携带该错误码。例如，某个工具因缺少 AI 功能包而无法运行时，会返回与该功能相关的错误码。这些错误码会在引发它们的功能处说明。

## 身份验证与访问 {#auth-codes}

| `code` | 状态码 | 处理方式 |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | 发送带有会话令牌或 API 密钥的 `Authorization: Bearer <token>`（`si_...`）。 |
| `FORBIDDEN` | 403 | 凭据有效，但缺少相应权限。请向管理员申请该权限。 |
| `MUST_CHANGE_PASSWORD` | 403 | 该账户必须先修改密码，才能调用其他端点。请使用会话令牌调用 `POST /api/auth/change-password`，然后重试。 |
| `USER_DISABLED` | 403 | 该账户已被禁用，需要管理员重新启用。 |
| `LOGIN_THROTTLED` | 429 | 登录失败次数过多。请稍后再试。 |
| `VALIDATION_ERROR` | 400 | 请求体或参数未通过校验。`details` 会指出具体问题。 |

首次运行时的管理员账户为 `admin`，密码为 `admin`，除非 `DEFAULT_USERNAME` 或 `DEFAULT_PASSWORD` 修改了它。除非设置了 `SKIP_MUST_CHANGE_PASSWORD`，否则在密码被修改之前，该账户的每次调用都会得到 `MUST_CHANGE_PASSWORD`。

## 任务 {#job-codes}

失败的任务会在任务本身上报告原因，而不是通过 HTTP 错误。请从 `GET /api/v1/jobs/{jobId}` 中读取 `error.code` 和 `error.message`。参见[进度跟踪](/zh-CN/api/rest#progress-tracking)。

只有当失败属于输入错误或服务器故障时，失败的任务才会保留 `error.code`。其他失败只携带消息。

| `code` | 含义 | 处理方式 |
|--------|--------|------------|
| `CANCELED` | 任务已被用户取消。它不是 HTTP 状态码。进度事件会携带带有此错误码的 `phase: failed`。 | 将其视为用户取消，请勿自动重试。 |
| `INPUT_MISSING` | 输入在任务运行之前已被删除。 | 重新上传文件。 |
| `ENGINE_UNAVAILABLE` | 服务器上所需的引擎无法启动。 | 请在管理员修复安装后重试。 |
| `JOB_STALLED` | 不会返回给客户端，仅用于标记服务器的错误报告。工作进程丢失任务锁的次数超过了队列允许的上限，通常是因为服务器重启，或内存或 CPU 不足。任务会以一条表示已被中断的消息失败。 | 重试。如果持续发生，请为服务器增加内存，或调低 `CONCURRENT_JOBS`。 |

## 身份验证与 MFA {#mfa-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | MFA 策略要求注册，而此实例无法为用户注册（没有企业许可证）。已获许可的实例会返回 200 和 `requiresMfaEnrollment: true`，并引导用户完成注册。 | 请勿重试。管理员需要修改策略，或使用离线恢复 CLI。 |
| `MFA_POLICY_UNAVAILABLE` | 503 | 服务器在登录期间无法读取 MFA 策略。 | 稍后重新登录。 |
| `INVALID_CODE` | 401 | TOTP 或恢复码错误。 | 请用户提供新的验证码后重试。多次失败会以 `MFA_ATTEMPTS_EXHAUSTED` 结束。 |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | 错误的验证码次数过多。该质询已被丢弃。 | 重新开始登录以获取新的质询。 |
| `MFA_EXPIRED` | 401 | MFA 或注册质询已过期或不匹配。 | 重新开始登录。 |
| `MFA_NOT_CONFIGURED` | 401 | 该账户没有 TOTP 密钥，因此无法校验验证码。 | 在使用验证码登录之前先注册 MFA。 |
| `MFA_ALREADY_ENABLED` | 409 | 该账户已启用 MFA。 | 请勿再次注册。 |
| `NO_PENDING_ENROLLMENT` | 400 | 收到了注册确认，但没有待处理的注册。 | 请先调用注册端点。 |
| `MFA_NOT_ENABLED` | 400 | 该操作需要开启 MFA，而此用户未开启。 | 跳过该操作，或先启用 MFA。 |
| `MFA_DECRYPTION_FAILED` | 500 | 已存储的 TOTP 密钥无法解密。 | 需要运维人员处理。这通常意味着加密密钥已更改。请检查 `DATA_ENCRYPTION_KEY` 和 `DATA_ENCRYPTION_KEY_PREVIOUS`。 |
| `DECRYPTION_FAILED` | 500 | 已存储的值（设置、webhook 认证头或 TOTP 密钥）无法解密。 | 同上，需要运维人员处理。请勿重试。 |
| `IDLE_TIMEOUT` | 401 | 会话在一段时间不活动后已过期。 | 重新登录。 |
| `INVALID_PASSWORD` | 401 | 修改密码时，当前密码错误。 | 请用户提供当前密码。 |
| `PASSWORD_CHANGED` | 409 | 在此请求运行期间，密码已在另一个会话中被修改，或被管理员重置。 | 重新登录。 |
| `OIDC_NO_PASSWORD` | 400 | 对通过 SSO 创建的账户请求了修改或重置密码。 | 引导用户前往身份提供商。 |

## OIDC {#oidc-codes}

登录期间的 OIDC 失败不会返回 JSON 响应体。登录路由会以通用的原因重定向到登录页，审计日志会记录错误码。当无法连接到身份提供商时，登出路由仍会结束本地会话。

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | 无（重定向） | 颁发者 URL 为 `http`，但 `EXTERNAL_URL` 为 `https`，因此客户端拒绝执行发现。 | 管理员：通过 `https` 提供颁发者服务，或通过 `http` 运行该实例。 |
| `OIDC_DISCOVERY_TIMEOUT` | 无（重定向） | 颁发者的发现请求超时。 | 检查服务器能否连接到颁发者，然后重试。 |
| `OIDC_DISCOVERY_FAILED` | 无（重定向） | 发现因其他原因失败。 | 检查颁发者 URL 和服务器的出站访问。 |
| `OIDC_END_SESSION_INVALID` | 无（登出继续） | 身份提供商的 `end_session_endpoint` 不是有效的 URL。本地会话仍会被清除。 | 管理员：修复提供商的元数据。 |
| `OIDC_END_SESSION_SCHEME` | 无（登出继续） | `end_session_endpoint` 使用了服务器不允许的协议。本地会话仍会被清除。 | 管理员：修复提供商的元数据。 |

## SAML {#saml-codes}

SAML 失败不会设置 `code`。断言失败时会重定向到登录页并附带 `saml_auth_failed`，原因会记录在 `SAML_LOGIN_FAILED` 审计事件中。

## SCIM {#scim-codes}

SCIM 路由使用 RFC 7644 的错误信封进行响应（`schemas`、`detail`、`status`，有时还有 `scimType`）。它们不会设置 `code`。请根据 HTTP 状态码进行分支处理。

## 团队、角色和用户 {#team-role-codes}

团队名称或角色名称重复时会返回通用的 `CONFLICT`，团队或角色不存在时会返回 `NOT_FOUND`。

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | 调用者的角色不允许此更改。目标的权限高于调用者，角色是内置的，或请求授予了调用者本身不具备的权限。 | 请勿重试。请向权限更高的用户求助。 |
| `UNKNOWN_ROLE` | 400 | 该角色 ID 与现有角色不匹配。 | 修正角色 ID。可列出角色来查找。 |
| `UNKNOWN_TEAM` | 400 | 该团队 ID 与现有团队不匹配。 | 修正团队 ID。 |
| `SELF_DEMOTE` | 400 | 管理员试图移除自己的管理员角色。 | 请另一位管理员进行此更改。 |
| `SELF_DELETE` | 400 | 管理员试图删除自己的账户。 | 请另一位管理员删除。 |
| `LAST_ADMIN` | 用户路由为 400，GDPR 清除路由为 409 | 该更改会导致没有任何管理员，或清除了包含所有管理员的团队。 | 请先将另一位用户设为管理员。 |
| `USER_LIMIT_REACHED` | 403 | 实例已达到其 `MAX_USERS` 上限。 | 移除一位用户，或调高 `MAX_USERS`。 |

## 功能与 AI 功能包 {#feature-codes}

需要可选 AI 功能包的工具、批处理运行和流水线会使用这些错误码。

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501，或来自智能裁剪人脸模式的 400 | 该工具，或流水线或批处理中的某一步，需要尚未安装的功能包。响应体包含 `feature`（功能包 ID）和 `featureName`。 | 在设置中安装该功能包，然后重试。 |
| `FEATURE_CPU_UNSUPPORTED` | 409 | 安装或离线导入被拒绝，因为该功能包的 x86-64 库需要 AVX，而此服务器的 CPU 不支持。没有下载或安装任何内容。响应体包含 `feature`（功能包 ID）和 `reason`（`cpu-no-avx`）。`GET /api/v1/features` 会用 `compatibility: "incompatible"` 和 `compatibilityReason: "cpu-no-avx"` 报告同一个功能包。 | 在支持 AVX 的 CPU 或 arm64 上运行 SnapOtter。其他功能包仍可安装。 |
| `FEATURE_INCOMPATIBLE` | 501，或在快速 OCR 收到无法识别的语言时为 400 | 已安装的功能无法满足所请求的质量或语言。 | 更改设置，或安装支持它的功能包。 |
| `ENGINE_UNAVAILABLE` | 503 | 所需的引擎无法启动，或在请求通过校验后 OCR 运行时被移除。 | 请在管理员修复或重新安装该功能后重试。 |
| `BROWSER_NOT_AVAILABLE` | 503 | 未安装 Chromium，因此 HTML 转图片无法运行。 | 请管理员安装该浏览器。 |
| `BROWSER_CRASHED` | 503 | 截图浏览器在渲染时崩溃。 | 重试该请求。 |

## 工具 {#tool-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | 上传的输入在任务运行之前已被删除。 | 重新上传文件并提交任务。 |
| `ANALYSIS_EXPIRED` | 410 | 证件照分析在生成之前已过期。 | 重新分析照片，然后再生成。 |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | 背景移除结果在后续步骤之前已过期。 | 重新移除背景。 |
| `NOT_ANIMATED` | 400 | 移除 GIF 背景收到了静态图片。 | 静态图片请使用移除背景。 |
| `TOO_MANY_FRAMES` | 400 | 动画的帧数超过了服务器允许的上限（`GIF_BG_MAX_FRAMES`）。 | 发送更短的动画，或请管理员调高该上限。 |
| `TOO_MANY_PIXELS` | 400 | 动画的画布尺寸乘以帧数超过了服务器的限制：移除 GIF 背景为 268,402,689 像素（16383 x 16383），其他动画工具则为 GIF 工作负载上限。 | 发送更少的帧或更小的动画。 |
| `IMAGE_TOO_LARGE` | 400 | 图片的像素数超过了解码器可接受的范围。 | 发送更小的图片。 |
| `RESULT_TOO_LARGE` | 400 | 这些设置会生成超出编码器或像素限制所允许的更大图片。 | 使用更小的图片，或能生成更小结果的设置。 |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice 或 pandoc 无法打开该文档。它可能已损坏、受密码保护，或实际格式与扩展名不符。 | 确认该文件能在办公软件中打开，然后重新发送。 |
| `PDF_DAMAGED` | 400 | PDF 引擎发现文档结构已损坏。 | 先用修复 PDF 处理该文件，然后重试。 |
| `PDF_PASSWORD_PROTECTED` | 400 | 该 PDF 已加密，此工具无法打开。 | 先用解锁 PDF 将其解锁。 |
| `NO_AUDIO_TRACK` | 400 | 该文件没有可供音频工具使用的音频流。 | 发送包含音频的文件。 |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg 无法读取该音频或视频：找不到数据包、找不到编解码器参数、没有 `moov` atom，或遇到无法解析的数据。 | 确认该文件能在媒体播放器中播放，或重新导出，然后重试。 |
| `PAGE_OUT_OF_RANGE` | 400 | 页码范围包含 PDF 中不存在的页。 | 检查页数，并发送位于其范围内的页码范围。 |
| `INVALID_PAGE_RANGE` | 400 | 页码范围的语法无效。 | 使用类似 `1-3,5` 的页码。 |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | 移除页面被要求移除所有页面。 | 至少保留一页。 |
| `NESTING_TOO_DEEP` | 400 | JSON 或 XML 的嵌套层级超过 100 层。 | 将文档扁平化，然后再转换。 |
| `IMAGE_UNDECODABLE` | 400 | 无法解码该图片，或无法读取其尺寸。文件可能已损坏，或使用了解码器不支持的编码。 | 用其他应用重新导出该图片，或先将其转换为 PNG 或 JPEG。 |
| `INVALID_SETTINGS` | 400 | 某项设置超出范围或不适用于此文件：裁剪区域超出图片、缩放尺寸为零、动画中不存在的 GIF 帧、不存在的证件照规格。`error` 文本会指出具体设置。 | 修正 `error` 中指出的设置，然后重试。 |
| `CHART_DATA_INVALID` | 400 | 图表制作器无法从文件中读取图表数据：CSV 或 JSON 无法解析、没有数值列、超过 100 行，或包含负值。`error` 文本会说明具体原因。 | 发送最多 100 行的 CSV 或 JSON，每行包含一个标签和一个大于等于零的数字。 |
| `NO_FACE_DETECTED` | 400 | 证件照在图片中未检测到人脸。 | 发送光线良好、正面清晰的照片。 |
| `TARGET_SIZE_UNREACHABLE` | 400 | 压缩或证件照的大小限制，即使缩小尺寸后也无法使文件小于所要求的大小。 | 请求更大的目标大小，或先裁剪图片。 |
| `TOO_MANY_PAGES` | 400 | OCR 被要求处理的页数超过了单个任务可处理的上限。 | 通过页码范围选择更少的页。 |
| `METADATA_DAMAGED` | 400 | 编辑元数据发现图片现有的 EXIF 数据已损坏，因此无法安全地重写。 | 先用移除图片元数据清除元数据，然后再编辑。 |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML 或 Markdown 转 PDF 发现了对网络上图片、样式表或字体的引用，而服务器不会获取这些资源。 | 将资源嵌入文件中（例如使用 `data:` URI），然后重试。 |

## 文件 {#file-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | 保存到文件会超出用户的存储配额。 | 删除文件，或请管理员提供更多空间。 |
| `INVALID_STORED_NAME` | 400 | 服务器拒绝了已存储的文件名。 | 重新上传文件。 |

## 流水线与批处理 {#pipeline-codes}

流水线和批处理请求会针对每个需要功能包的步骤返回上述功能错误码。已被占用的任务 ID 会返回 `CONFLICT`，状态码为 409。请发送新的任务 ID。

## 设置 {#settings-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | 该键不是已知的设置。 | 检查键名。 |
| `READONLY_SETTING` | 400 | 该设置无法通过 API 更改。 | 通过环境变量或管理界面更改。 |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | 新值与其他设置冲突。响应体在 `setting` 中指出该设置，并在 `validationErrors` 中列出问题。 | 修正所列出的设置，然后重试。 |
| `SETTING_DECRYPTION_FAILED` | 500 | 已存储的设置无法解密。 | 需要运维人员处理，与 `DECRYPTION_FAILED` 相同。 |

对于设置上的 `VALIDATION_ERROR`，`details` 包含模式问题。

## 企业版 {#enterprise-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | 该设置或策略需要企业许可证，例如 SSO 强制执行或 MFA 策略。 | 使用已获许可的实例，或将该设置保持关闭。 |
| `IP_NOT_ALLOWED` | 403 | 请求的 IP 地址不在允许列表中。 | 从允许的网络连接。 |
| `INVALID_CIDR` | 400 | 允许列表中的某个条目不是有效的 CIDR。消息会列出错误的条目。 | 修正这些条目后重新保存。 |
| `SELF_LOCKOUT` | 400 | 保存允许列表会阻止调用者当前的 IP。 | 请先将你当前的 IP 添加到列表中。 |

当用户或团队处于法律保留状态时，GDPR 清除路由会返回普通的 `CONFLICT`，状态码为 409。

## 客户端不会收到的错误码 {#internal-codes}

这些错误码存在于服务器源码中，用于日志、遥测或 Fastify 自身的错误。客户端不会在响应体或任务记录中得到它们，因此请勿基于它们编写客户端逻辑。

| `code` | 去向 |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | 由告警评估器上报到错误跟踪。告警 webhook 的认证头无法解密。 |
| `SIEM_DECRYPTION_FAILED` | 由 SIEM 转发上报到错误跟踪。SIEM 认证头无法解密。 |
| `WEBHOOK_DECRYPTION_FAILED` | 上报到错误跟踪。遇到同样故障的请求会以 `DECRYPTION_FAILED` 响应。 |
| `STAGED_DISCARD_FAILED` | 当暂存的上传文件无法删除时，上报到错误跟踪。 |
| `USERNAME_RACE_EXHAUSTED` | 当 SSO 自动创建在每次重试中都输掉用户名竞争时抛出。登录页会改为显示错误。 |
| `ERR_OUT_OF_RANGE` | 由对象存储读取器针对无效的字节范围抛出。 |
| `ETIMEDOUT` | 设置在 GDPR 导出的超时错误上。导出会失败，可以重新请求。 |
| `FST_REQ_FILE_TOO_LARGE` | Fastify 针对超出限制的上传所使用的错误码。客户端会得到带有 `PAYLOAD_TOO_LARGE` 的 413，或该路由自己的 413 消息。 |
| `TARGET_SIZE_EXCEEDED` | 当目标大小压缩未达到目标时抛出。该错误没有状态码或错误码，因此客户端会得到通用的失败。 |
| `OCR_CACHE_PERMISSIONS` | 当 AI 数据卷使 OCR 运行时缓存可被任意用户写入时，作为运维故障上报到错误跟踪。安装任务会失败，并给出指出存储问题的消息。 |
| `OCR_RUNTIME_UNREACHABLE` | 当服务器始终无法连接到 huggingface.co 下载 OCR 运行时，作为运维故障上报到错误跟踪。安装任务会失败，并给出关于网络访问、`HTTPS_PROXY` 和离线导入的消息。 |
