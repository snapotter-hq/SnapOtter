---
description: "在 SnapOtter 中管理用户、内置角色与自定义角色、权限、API 密钥、团队、会话以及审计日志。"
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: db9aecb6141c
---

# 用户、角色与权限 {#users-roles-permissions}

SnapOtter 提供三个内置角色、17 项细粒度权限，并支持带可选按工具访问控制的自定义角色。本页涵盖完整的授权模型、API 密钥作用域、团队管理以及审计日志。

::: tip 相关页面
[OIDC / SSO](/zh-CN/guide/oidc) | [SAML SSO](/zh-CN/guide/saml) | [SCIM 配置](/zh-CN/guide/scim) | [安全与加固](/zh-CN/guide/security)
:::

## 用户 {#users}

### 创建用户 {#creating-users}

管理员可以通过管理面板或 `POST /api/auth/register` 端点创建用户。每个用户都有用户名、角色、团队分配以及一个可选的电子邮件地址。

### 默认管理员 {#default-admin}

首次启动时，SnapOtter 会创建一个默认管理员账户。凭据来自环境变量：

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | 初始管理员账户的用户名 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理员账户的密码 |

默认管理员在首次登录时必须更改密码。

### 身份验证提供方 {#authentication-providers}

用户可以通过多种方式进行身份验证：

- **本地** - 存储在 SnapOtter 数据库中的用户名和密码
- **OIDC** - 任意 OpenID Connect 提供方（参见 [OIDC / SSO](/zh-CN/guide/oidc)）
- **SAML** - SAML 2.0 身份提供方（参见 [SAML SSO](/zh-CN/guide/saml)）
- **SCIM** - 来自身份提供方的自动化配置（参见 [SCIM 配置](/zh-CN/guide/scim)）

### 禁用身份验证 {#disabling-authentication}

设置 `AUTH_ENABLED=false` 以完全禁用身份验证。在此模式下，所有请求都会使用一个带 `admin` 角色的合成匿名用户。无需登录。

::: warning 
禁用身份验证会向任何能访问该实例的人授予完整的管理员权限。仅在受信任的环境中使用。
:::

## 内置角色 {#built-in-roles}

SnapOtter 包含三个内置角色。它们无法被修改或删除。

### 管理员（Admin） {#admin}

全部 17 项权限。对实例拥有完全控制权。

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### 编辑者（Editor） {#editor}

7 项权限。可以使用所有工具并管理所有文件和流水线，但无法访问管理功能。

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### 用户（User） {#user}

5 项权限。可以使用工具并管理自己的资源。

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## 权限参考 {#permissions-reference}

| Permission | Description |
|---|---|
| `tools:use` | 使用任意处理工具 |
| `files:own` | 查看和管理自己的文件 |
| `files:all` | 查看和管理所有用户的文件 |
| `apikeys:own` | 创建和管理自己的 API 密钥 |
| `apikeys:all` | 查看所有用户的 API 密钥 |
| `pipelines:own` | 创建和管理自己的流水线 |
| `pipelines:all` | 查看和管理所有用户的流水线 |
| `settings:read` | 查看实例设置 |
| `settings:write` | 修改实例设置 |
| `users:manage` | 创建、更新和删除用户账户 |
| `teams:manage` | 创建、更新和删除团队 |
| `features:manage` | 安装和管理 AI 功能包 |
| `system:health` | 访问健康与就绪端点 |
| `audit:read` | 查看审计日志并列出角色 |
| `compliance:manage` | 管理 GDPR 生命周期和合规功能 |
| `webhooks:manage` | 配置出站 webhook |
| `security:manage` | 管理安全设置（IP 允许列表、SSO 强制） |

## 自定义角色 {#custom-roles}

拥有 `security:manage` 权限的管理员可以通过管理面板或角色 API 创建自定义角色。列出角色需要 `audit:read`。

### 创建自定义角色 {#creating-a-custom-role}

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

角色名称必须为 2 到 30 个字符，小写字母数字，可包含连字符和下划线。

### 管理员保留权限 {#admin-reserved-permissions}

有三项权限保留给内置角色，无法分配给自定义角色：

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

角色 API 会拒绝任何包含这些权限的请求。只有内置的 `admin` 角色才能访问它们。

### 工具级权限 {#tool-level-permissions}

自定义角色可以选择性地限制用户可以访问哪些工具。有两种模式可用：

| Mode | Behavior | License requirement |
|---|---|---|
| `category` | 按模态限制（图像、视频、音频、文档、文件） | 无（免费） |
| `tool` | 按单个工具 ID 限制 | 需要 `per_tool_permissions` 企业功能 |

当设置了 `tool` 模式但企业功能不可用时，SnapOtter 会优雅降级，允许访问所有工具。

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

### 删除自定义角色 {#deleting-a-custom-role}

当删除自定义角色时，所有分配到该角色的用户会自动重新分配到 `user` 角色。

## 团队 {#teams}

团队将用户分组，用于存储和保留管理。首次启动时会创建一个 `Default` 团队。

| Field | Type | Description |
|---|---|---|
| `name` | string | 唯一的团队名称（1 到 50 个字符） |
| `storageQuota` | number | 每团队的存储上限，单位为字节（无需企业版即可使用） |
| `retentionHours` | number | 在这么多小时之后自动删除输出（需要 `team_retention_overrides`，企业版） |
| `legalHold` | boolean | 阻止自动删除团队成员的文件（需要 `legal_hold`，企业版） |

::: info 
`Default` 团队无法删除。仍有成员的团队无法删除。请先重新分配成员。
:::

## API 密钥 {#api-keys}

用户可以生成 API 密钥用于编程访问。每个密钥使用 `si_` 前缀，且仅在创建时展示一次。

### 作用域权限 {#scoped-permissions}

API 密钥可以选择性地携带一个 `permissions` 数组。设置后，一个请求的有效权限是用户角色权限与该密钥作用域权限的**交集**。这意味着 API 密钥永远无法超出用户自身的权限进行提权。

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

### 过期 {#expiration}

密钥接受一个可选的 `expiresAt` 时间戳。过期的密钥会在身份验证时被拒绝。

## 审计日志 {#audit-log}

SnapOtter 会在存储于 `audit_log` 数据库表中的结构化审计日志里记录与安全相关的事件。

### 查看审计日志 {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

需要 `audit:read` 权限。支持分页（`page`、`limit`）和过滤（`action`、`ip`、`from`、`to`）。

### 工具操作审计 {#tool-operation-auditing}

::: warning 
`TOOL_EXECUTED` 事件默认**不**记录。它们可以通过以下两种途径之一选择性开启：

1. 将 `auditToolOperations` 管理员设置设为 `true`。
2. 持有一份带 `audit_export` 功能的有效许可证（团队版和企业版计划均提供）。

若不满足其中之一，单个工具的执行不会记录到审计日志中。
:::

### 导出 {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

需要 `audit:read` 权限以及 `audit_export` 企业功能（团队版和企业版计划均提供）。支持 CSV 和 JSON 格式，可按 `action`、`actorId`、`targetType`、`targetId`、`from` 和 `to` 过滤。

### 防篡改签名 {#tamper-resistant-signing}

启用后，每条审计日志条目都会用一个从 `DATA_ENCRYPTION_KEY` 派生的 HMAC 进行签名。这需要：

1. 在你的环境中设置 `DATA_ENCRYPTION_KEY`。
2. 启用 `tamperResistantAudit` 管理员设置。
3. 一份带 `tamper_resistant_audit` 功能的企业许可证。

### 保留 {#retention}

设置 `AUDIT_RETENTION_DAYS` 以自动清除旧条目。默认值为 `0`，表示条目会无限期保留。

### 事件参考 {#event-reference}

| Event | Category |
|---|---|
| `LOGIN_SUCCESS`、`LOGIN_FAILED` | 身份验证 |
| `OIDC_LOGIN_SUCCESS`、`OIDC_LOGIN_FAILED` | 身份验证 |
| `SAML_LOGIN_SUCCESS`、`SAML_LOGIN_FAILED` | 身份验证 |
| `LOGOUT` | 身份验证 |
| `USER_CREATED`、`USER_UPDATED`、`USER_DELETED` | 用户管理 |
| `PASSWORD_CHANGED`、`PASSWORD_RESET` | 用户管理 |
| `MFA_ENROLLED`、`MFA_DISABLED`、`MFA_VERIFIED`、`MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`、`MFA_RECOVERY_USED`、`MFA_RESET` | MFA |
| `ROLE_CREATED`、`ROLE_UPDATED`、`ROLE_DELETED` | 角色 |
| `API_KEY_CREATED`、`API_KEY_DELETED` | API 密钥 |
| `SETTINGS_UPDATED`、`IP_ALLOWLIST_UPDATED` | 设置 |
| `FILE_UPLOADED`、`FILE_DELETED` | 文件 |
| `TOOL_EXECUTED` | 工具（选择性开启） |
| `SCIM_USER_PROVISIONED`、`SCIM_USER_UPDATED`、`SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`、`LEGAL_HOLD_RELEASED` | 合规 |
| `GDPR_EXPORT_INITIATED`、`GDPR_USER_PURGED`、`GDPR_TEAM_PURGED` | 合规 |
| `CONFIG_EXPORTED`、`CONFIG_IMPORTED` | 配置 |

## 会话管理 {#session-management}

会话基于 cookie，由 `SESSION_DURATION_HOURS` 控制（默认值：168 小时 / 7 天）。

### 角色变更会使会话失效 {#role-changes-invalidate-sessions}

当管理员更改某个用户的角色时，该用户所有活动会话都会被删除。用户必须重新登录才能获得其新权限。

### 安全防护 {#safety-guards}

- **最后管理员保护**：最后一个剩余的管理员无法被降级到更低的角色。如果你尝试这么做，API 会返回错误。
- **防止自删除**：管理员无法通过 API 删除自己的账户。
