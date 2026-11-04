---
title: "错误码"
description: "错误响应体的结构、稳定的错误码，以及每种错误的处理方式。"
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: 3e875ff79dbd
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
| `USER_DISABLED` | 403 | 该账户已被停用。需要由管理员重新启用。 |
| `LOGIN_THROTTLED` | 429 | 登录失败次数过多。请稍后再试。 |
| `VALIDATION_ERROR` | 400 | 请求体或参数未通过校验。`details` 会指明具体问题。 |

首次运行时的管理员账户是 `admin`，密码为 `admin`，除非 `DEFAULT_USERNAME` 或 `DEFAULT_PASSWORD` 修改了它。除非设置了 `SKIP_MUST_CHANGE_PASSWORD`，否则在修改密码之前，该账户的每次调用都会得到 `MUST_CHANGE_PASSWORD`。

## 作业 {#job-codes}

失败的作业会在作业自身上报告原因，而不是通过 HTTP 错误。请从 `GET /api/v1/jobs/{jobId}` 中读取 `error.code` 和 `error.message`。参见[进度跟踪](/zh-CN/api/rest#progress-tracking)。

只有当失败属于输入错误或服务器故障时，失败的作业才会保留 `error.code`。其他失败只携带消息。

| `code` | 含义 | 处理方式 |
|--------|---------|------------|
| `CANCELED` | 作业已被用户取消。它不是 HTTP 状态码。进度事件会携带带有此错误码的 `phase: failed`。 | 将其视为用户取消。不要自动重试。 |
| `INPUT_MISSING` | 输入在作业运行之前被移除。 | 重新上传文件。 |
| `ENGINE_UNAVAILABLE` | 服务器上某个必需的引擎无法启动。 | 等管理员修复安装后再重试。 |

## 身份验证与 MFA {#mfa-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | MFA 策略要求注册，而此实例无法为用户注册（没有企业许可证）。已授权的实例会返回 200 和 `requiresMfaEnrollment: true`，并引导用户完成注册。 | 不要重试。需要管理员更改策略，或使用离线恢复 CLI。 |
| `MFA_POLICY_UNAVAILABLE` | 503 | 服务器在登录期间无法读取 MFA 策略。 | 稍后重试登录。 |
| `INVALID_CODE` | 401 | TOTP 码或恢复码有误。 | 请用户提供新的验证码后重试。多次失败最终会返回 `MFA_ATTEMPTS_EXHAUSTED`。 |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | 输错验证码的次数过多。该质询已被丢弃。 | 重新开始登录以获取新的质询。 |
| `MFA_EXPIRED` | 401 | MFA 或注册质询已过期或不匹配。 | 重新开始登录。 |
| `MFA_NOT_CONFIGURED` | 401 | 该账户没有 TOTP 密钥，因此无法校验验证码。 | 在使用验证码登录之前先注册 MFA。 |
| `MFA_ALREADY_ENABLED` | 409 | 该账户上的 MFA 已处于启用状态。 | 不要再次注册。 |
| `NO_PENDING_ENROLLMENT` | 400 | 收到了注册确认，但没有待处理的注册。 | 请先调用注册端点。 |
| `MFA_NOT_ENABLED` | 400 | 该操作要求开启 MFA，而此用户未开启。 | 跳过该操作，或先启用 MFA。 |
| `MFA_DECRYPTION_FAILED` | 500 | 已存储的 TOTP 密钥无法解密。 | 需要运维人员处理。这通常意味着加密密钥已更改。请检查 `DATA_ENCRYPTION_KEY` 和 `DATA_ENCRYPTION_KEY_PREVIOUS`。 |
| `DECRYPTION_FAILED` | 500 | 某个已存储的值（设置、webhook 认证头或 TOTP 密钥）无法解密。 | 需要运维人员处理，同上。不要重试。 |
| `IDLE_TIMEOUT` | 401 | 会话因一段时间无活动而过期。 | 重新登录。 |
| `INVALID_PASSWORD` | 401 | 修改密码时，当前密码有误。 | 请用户提供当前密码。 |
| `PASSWORD_CHANGED` | 409 | 在此请求运行期间，密码已在另一个会话中被修改，或被管理员重置。 | 重新登录。 |
| `OIDC_NO_PASSWORD` | 400 | 对通过 SSO 创建的账户发起了修改或重置密码的请求。 | 引导用户前往身份提供商。 |

## OIDC {#oidc-codes}

登录期间的 OIDC 失败不会返回 JSON 响应体。登录路由会以一个通用的原因重定向到登录页面，审计日志会记录错误码。当无法连接到身份提供商时，登出路由仍会结束本地会话。

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | 无（重定向） | 颁发者 URL 为 `http`，但 `EXTERNAL_URL` 为 `https`，因此客户端拒绝执行发现。 | 管理员：通过 `https` 提供颁发者服务，或让实例运行在 `http` 之上。 |
| `OIDC_DISCOVERY_TIMEOUT` | 无（重定向） | 颁发者发现超时。 | 检查服务器能否访问颁发者，然后重试。 |
| `OIDC_DISCOVERY_FAILED` | 无（重定向） | 发现因其他原因失败。 | 检查颁发者 URL 和服务器的出站访问。 |
| `OIDC_END_SESSION_INVALID` | 无（登出继续） | 身份提供商的 `end_session_endpoint` 不是有效的 URL。本地会话仍会被清除。 | 管理员：修正提供商的元数据。 |
| `OIDC_END_SESSION_SCHEME` | 无（登出继续） | `end_session_endpoint` 使用了服务器不允许的协议。本地会话仍会被清除。 | 管理员：修正提供商的元数据。 |

## SAML {#saml-codes}

SAML 失败不会设置 `code`。断言失败时会重定向到登录页面并带上 `saml_auth_failed`，原因记录在 `SAML_LOGIN_FAILED` 审计事件中。

## SCIM {#scim-codes}

SCIM 路由使用 RFC 7644 的错误信封作答（`schemas`、`detail`、`status`，有时还有 `scimType`）。它们不会设置 `code`。请根据 HTTP 状态码进行分支处理。

## 团队、角色与用户 {#team-role-codes}

团队或角色名称重复时会返回通用的 `CONFLICT`，找不到团队或角色时会返回 `NOT_FOUND`。

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | 调用者的角色不允许此项更改。目标的权限高于调用者，该角色是内置角色，或者请求授予了调用者本身不具备的权限。 | 不要重试。请联系权限更高的用户。 |
| `UNKNOWN_ROLE` | 400 | 该角色 ID 与任何现有角色都不匹配。 | 修正角色 ID。可列出角色来查找。 |
| `UNKNOWN_TEAM` | 400 | 该团队 ID 与任何现有团队都不匹配。 | 修正团队 ID。 |
| `SELF_DEMOTE` | 400 | 管理员尝试移除自己的管理员角色。 | 请另一位管理员进行此项更改。 |
| `SELF_DELETE` | 400 | 管理员尝试删除自己的账户。 | 请另一位管理员来删除。 |
| `LAST_ADMIN` | 用户路由为 400，GDPR 清除路由为 409 | 此更改会导致没有任何管理员，或清除了包含所有管理员的团队。 | 请先将另一位用户设为管理员。 |
| `USER_LIMIT_REACHED` | 403 | 实例已达到 `MAX_USERS` 上限。 | 移除一位用户，或提高 `MAX_USERS`。 |

## 功能与 AI 功能包 {#feature-codes}

需要可选 AI 功能包的工具、批处理运行和流水线会使用这些错误码。

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | 该工具，或流水线或批处理中的某个步骤，需要一个尚未安装的功能包。响应体包含 `feature`（功能包 ID）和 `featureName`。 | 在设置中安装该功能包，然后重试。 |
| `FEATURE_INCOMPATIBLE` | 501 | 已安装的功能无法满足所请求的质量或语言。 | 更改设置，或安装支持该设置的功能包。 |
| `ENGINE_UNAVAILABLE` | 503 | 某个必需的引擎无法启动，或者 OCR 运行时在请求通过校验后被移除。 | 等管理员修复或重新安装该功能后再重试。 |
| `BROWSER_NOT_AVAILABLE` | 503 | 未安装 Chromium，因此无法运行 HTML 转图片。 | 请管理员安装该浏览器。 |
| `BROWSER_CRASHED` | 503 | 截图浏览器在渲染时崩溃。 | 重试请求。 |

## 工具 {#tool-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | 上传的输入在作业运行之前被移除。 | 重新上传文件并提交作业。 |
| `ANALYSIS_EXPIRED` | 410 | 证件照分析在生成之前已过期。 | 重新分析照片，然后再生成。 |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | 背景移除结果在后续步骤之前已过期。 | 重新移除背景。 |
| `NOT_ANIMATED` | 400 | 移除 GIF 背景收到了静态图片。 | 对静态图片请使用移除背景。 |
| `TOO_MANY_FRAMES` | 400 | 该动画的帧数超过了服务器允许的上限（`GIF_BG_MAX_FRAMES`）。 | 发送较短的动画，或请管理员提高上限。 |

## 文件 {#file-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | 保存到“文件”会超出用户的存储配额。 | 删除文件，或请管理员提供更多空间。 |
| `INVALID_STORED_NAME` | 400 | 服务器拒绝了已存储的文件名。 | 重新上传文件。 |

## 流水线与批处理 {#pipeline-codes}

对于每个需要功能包的步骤，流水线和批处理请求都会返回上文的功能错误码。如果作业 ID 已被占用，则返回 `CONFLICT`，状态码为 409。请发送新的作业 ID。

## 设置 {#settings-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | 该键不是已知的设置。 | 检查键名。 |
| `READONLY_SETTING` | 400 | 该设置无法通过 API 修改。 | 请通过环境变量或管理界面修改。 |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | 新值与其他设置冲突。响应体在 `setting` 中指出该设置，并在 `validationErrors` 中列出问题。 | 修正所列出的设置，然后重试。 |
| `SETTING_DECRYPTION_FAILED` | 500 | 已存储的设置无法解密。 | 需要运维人员处理，与 `DECRYPTION_FAILED` 相同。 |

对于设置上的 `VALIDATION_ERROR`，`details` 中包含模式（schema）问题。

## 企业版 {#enterprise-codes}

| `code` | 状态码 | 含义 | 处理方式 |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | 该设置或策略需要企业许可证，例如 SSO 强制执行或 MFA 策略。 | 使用已授权的实例，或保持该设置关闭。 |
| `IP_NOT_ALLOWED` | 403 | 请求的 IP 地址不在允许列表中。 | 从允许的网络连接。 |
| `INVALID_CIDR` | 400 | 允许列表中的某一项不是有效的 CIDR。消息中会列出无效的条目。 | 修正这些条目后再次保存。 |
| `SELF_LOCKOUT` | 400 | 保存该允许列表会阻止调用者当前的 IP。 | 请先把你当前的 IP 添加到列表中。 |

当用户或团队处于法律保留状态时，GDPR 清除路由会返回普通的 `CONFLICT`，状态码为 409。

## 客户端不会收到的错误码 {#internal-codes}

这些错误码存在于服务器源码中，用于日志、遥测或 Fastify 自身的错误。客户端不会在响应体或作业记录中收到它们，因此不要基于它们编写客户端逻辑。

| `code` | 去向 |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | 由告警评估器上报到错误跟踪。告警 webhook 的认证头无法解密。 |
| `SIEM_DECRYPTION_FAILED` | 由 SIEM 转发上报到错误跟踪。SIEM 的认证头无法解密。 |
| `WEBHOOK_DECRYPTION_FAILED` | 上报到错误跟踪。遇到同样失败的请求会以 `DECRYPTION_FAILED` 作答。 |
| `STAGED_DISCARD_FAILED` | 当暂存的上传无法移除时，上报到错误跟踪。 |
| `USERNAME_RACE_EXHAUSTED` | 当 SSO 自动创建在每次重试中都输掉用户名竞争时抛出。登录页面会显示错误。 |
| `ERR_OUT_OF_RANGE` | 对象存储读取器针对无效的字节范围抛出。 |
| `ETIMEDOUT` | 设置在 GDPR 导出的超时错误上。导出会失败，可以重新请求。 |
| `FST_REQ_FILE_TOO_LARGE` | Fastify 针对超出限制的上传所用的错误码。客户端会得到带有 `PAYLOAD_TOO_LARGE` 的 413，或该路由自己的 413 消息。 |
| `TARGET_SIZE_EXCEEDED` | 当目标大小压缩未达到目标时抛出。该错误没有状态码或错误码，因此客户端会得到通用的失败提示。 |