---
title: "错误码"
description: "错误响应体的结构、稳定的错误码，以及每种错误的处理方式。"
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 1d6053ddc028
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

## 尚未收录的错误码 {#not-yet-cataloged}

各个功能（例如加密、OIDC、SCIM 和团队）引发的错误码尚未在本页说明。每个错误码都是稳定的；遇到未列出的错误码时，请将其视为不透明值，并按其状态码处理。
