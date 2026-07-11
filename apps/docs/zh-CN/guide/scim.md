---
description: "设置 SCIM 2.0 预配以将用户和组从你的身份提供商同步到 SnapOtter。涵盖 Okta、Azure AD / Entra ID 以及自定义集成。"
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 70121241a9af
---

# SCIM 预配 {#scim-provisioning}

SnapOtter 实现了 SCIM 2.0（System for Cross-domain Identity Management，跨域身份管理系统），用于自动化的用户和组预配。你的身份提供商可以自动创建、更新、停用和重新激活用户账户，并同步组成员关系。

::: tip 企业版功能
SCIM 预配需要带有 `scim` 功能的 **enterprise** 许可证。它在 team 计划中不可用。若没有该功能，所有 SCIM 端点（除发现端点外）都返回 403。
:::

## 先决条件 {#prerequisites}

- 一个可通过公网 URL 访问的正在运行的 SnapOtter 实例
- 一个带有 `scim` 功能的 enterprise 许可证密钥
- SnapOtter 的管理员访问权限（生成或吊销 SCIM 令牌需要 `users:manage` 权限）
- 你的身份提供商的预配设置的管理员访问权限

## 快速开始 {#quick-start}

1. 生成一个 SCIM bearer 令牌：

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

响应中包含该令牌。请立即保存；它无法再次获取。

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. 在你的身份提供商中，配置 SCIM 预配，设置：
   - **Base URL**：`https://photos.example.com/api/v1/scim/v2`
   - **Authentication**：Bearer token（粘贴步骤 1 中的令牌）

## 身份验证 {#authentication}

SCIM 端点使用专用的 Bearer 令牌，与用户会话和 API 密钥分开。

### 生成令牌 {#generating-a-token}

`POST /api/v1/enterprise/scim/token` 会生成一个新的 SCIM 令牌。此端点需要一个具有 `users:manage` 权限的有效会话。

令牌以明文形式仅返回一次。SnapOtter 只存储 scrypt 哈希值。如果你丢失了令牌，请吊销它并生成一个新的。

同一时间只有一个 SCIM 令牌处于活动状态。生成新令牌会替换先前的令牌。

### 吊销令牌 {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` 会吊销当前的 SCIM 令牌。此端点同样需要 `users:manage`。

### 速率限制 {#rate-limiting}

SCIM 端点按每个令牌每分钟 1000 个请求进行速率限制。超过此限制会返回 HTTP 429。

## 支持的资源 {#supported-resources}

| SCIM 资源 | SnapOtter 概念 | 创建 | 读取 | 更新 | 删除 |
|---|---|---|---|---|---|
| User | 用户账户 | 是 | 是 | 是 | 软删除 |
| Group | 团队 | 是 | 是 | 是 | 是 |

::: warning 
SCIM Group 映射到 SnapOtter **团队**，而非角色。SCIM 无法设置用户的角色。所有通过 SCIM 创建的用户都会被分配 `user` 角色。要更改用户的角色，请使用 SnapOtter 管理界面。
:::

## 用户操作 {#user-operations}

### 创建用户 {#create-user}

`POST /api/v1/scim/v2/Users`

创建一个新的用户账户，其 `authProvider` 设置为 `scim`，角色为 `user`。该用户会被分配到 Default 团队。如果 `active` 为 `false`，则角色改为设置为 `disabled`。

必需属性：`userName`。可选属性：`externalId`、`emails`、`active`（默认为 `true`）。

### 列出和筛选用户 {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

返回分页的用户列表。支持 `startIndex` 和 `count` 查询参数（每页最多 200 条结果）。

筛选仅支持 `eq`（等于），可用于以下属性：

- `userName eq "jane"`
- `externalId eq "ext-12345"`

其他筛选运算符和属性会返回 HTTP 400。

### 获取用户 {#get-user}

`GET /api/v1/scim/v2/Users/:id`

通过 SnapOtter 用户 ID 返回单个用户。

### 替换用户 {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

替换用户的属性。支持 `userName`、`externalId`、`emails` 和 `active`。用户名更改会检查冲突（如果新用户名已被另一用户占用，则返回 409）。

### 修补用户 {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

使用 SCIM PatchOp 进行部分更新。支持的操作：

| 操作 | 路径 |
|---|---|
| `replace` | `active`、`userName`、`externalId`、`emails`、`emails[type eq "work"].value`、`name.formatted`、`displayName` |
| `add` | 同 `replace` |
| `remove` | `externalId`、`emails` |

`name.formatted` 和 `displayName` 路径为兼容性而被接受，但不会产生持久效果（SnapOtter 不单独存储显示名称）。

无值的 `replace` 操作（即值为不含 `path` 的对象）也受支持，可用键为 `userName`、`externalId`、`emails` 和 `active`。

### 停用用户（软删除） {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter 不会通过 SCIM 硬删除用户。DELETE 会执行软停用：

1. 用户的角色从其当前值（例如 `editor`）更改为 `disabled:editor`，同时保留原始角色。
2. 用户的密码被清除。
3. 所有活动会话被吊销。
4. 所有 API 密钥被吊销。

该用户无法再登录或使用任何 API 密钥。其数据（文件、历史记录）会被保留。

### 重新激活用户 {#reactivate-user}

要重新激活先前已停用的用户，请发送带有 `active: true` 的 `PUT` 或 `PATCH` 请求。SnapOtter 会恢复停用前的原始角色（例如 `disabled:editor` 再次变为 `editor`）。如果无法确定原始角色，则回退为 `user`。

::: details 示例：通过 PATCH 停用和重新激活
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

## 组操作 {#group-operations}

SCIM Group 映射到 SnapOtter 团队。创建组会创建一个团队。组成员关系控制用户所属的团队。

### 创建组 {#create-group}

`POST /api/v1/scim/v2/Groups`

必需：`displayName`。可选：`members`（`{ value: userId }` 数组）。

### 列出和筛选组 {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

筛选仅支持 `displayName eq "..."`。分页使用 `startIndex` 和 `count`（每页最多 200 条结果）。

### 获取组 {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### 替换组 {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

替换组名称和完整的成员列表。不在新列表中的现有成员会被移至 Default 团队。

### 修补组 {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

支持以下操作：

| 操作 | 路径 | 效果 |
|---|---|---|
| `add` | `members` | 将用户添加到团队 |
| `remove` | `members[value eq "userId"]` | 将用户移至 Default 团队 |
| `replace` | `displayName` | 重命名团队 |
| `replace` | `members` | 替换所有成员（被移除的成员移至 Default 团队） |

### 删除组 {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

删除团队。被删除团队的所有成员都会被移至 Default 团队。用户不会被停用或删除。

## IdP 设置 {#idp-setup}

### Okta {#okta}

1. 在 Okta 管理控制台中，打开你的 SnapOtter 应用程序（或创建一个）。
2. 转到 **Provisioning** 选项卡，然后点击 **Configure API Integration**。
3. 勾选 **Enable API Integration** 并输入：
   - **Base URL**：`https://photos.example.com/api/v1/scim/v2`
   - **API Token**：上面生成的 SCIM bearer 令牌
4. 点击 **Test API Credentials**，然后点击 **Save**。
5. 在 **Provisioning > To App** 下，启用：
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. 在 **Push Groups** 下，配置要作为 SnapOtter 团队同步的 Okta 组。

### Azure AD / Entra ID {#azure-ad-entra-id}

1. 在 Azure 门户中，转到你的 SnapOtter 企业应用程序。
2. 转到 **Provisioning**，并将 **Provisioning Mode** 设置为 **Automatic**。
3. 在 **Admin Credentials** 下，输入：
   - **Tenant URL**：`https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**：上面生成的 SCIM bearer 令牌
4. 点击 **Test Connection**，然后点击 **Save**。
5. 在 **Mappings** 下，配置用户和组的属性映射。默认设置通常有效，但请确认 `userName` 按预期映射到 `userPrincipalName` 或 `mail`。
6. 将 **Provisioning Status** 设置为 **On** 并保存。

Azure 会按固定的同步周期（通常每 40 分钟）预配用户和组。

## 发现端点 {#discovery-endpoints}

以下三个端点无需身份验证即可访问，用于描述 SCIM 服务器的功能：

| 端点 | 说明 |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | 服务器功能和支持的特性 |
| `GET /api/v1/scim/v2/Schemas` | User 和 Group 模式定义 |
| `GET /api/v1/scim/v2/ResourceTypes` | 可用的资源类型（User、Group） |

`ServiceProviderConfig` 会公告以下功能：

| 功能 | 是否支持 |
|---|---|
| Patch | 是 |
| Bulk | 否 |
| Filter | 是（最多 200 条结果，仅 `eq` 运算符） |
| Change password | 否 |
| Sort | 否 |
| ETag | 否 |

## 限制 {#limitations}

- **筛选**：仅支持 `eq` 运算符。复杂筛选、`and`/`or` 运算符、`co`（包含）和 `sw`（以...开头）均未实现。
- **批量操作**：不支持。
- **Sort 和 ETag**：不支持。
- **角色**：SCIM 无法分配 SnapOtter 角色。所有预配的用户都会获得 `user` 角色。
- **MAX_USERS**：`MAX_USERS` 环境变量限制不会在 SCIM 用户创建时强制执行。如果你需要限制用户数量，请在你的 IdP 中管理分配。
- **单一令牌**：同一时间只能有一个 SCIM 令牌处于活动状态。如果多个 IdP 需要 SCIM 访问权限，它们必须共享该令牌。
- **组即团队**：SCIM Group 对应团队，而非角色或权限组。

## 故障排除 {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

你的许可证不包含 `scim` 功能，或者未配置许可证。SCIM 需要 enterprise 计划许可证。请确认已设置 `SNAPOTTER_LICENSE_KEY` 且许可证包含 `scim` 功能。

### 401 "Bearer token required" {#_401-bearer-token-required}

SCIM 请求未包含 `Authorization: Bearer <token>` 标头。请检查你的 IdP 的预配配置。

### 401 "Invalid token" {#_401-invalid-token}

令牌与存储的哈希值不匹配。如果令牌被吊销并重新生成，就会发生这种情况。请在你的 IdP 的预配设置中更新令牌。

### 401 "SCIM not configured" {#_401-scim-not-configured}

尚未生成任何 SCIM 令牌。请使用 `POST /api/v1/enterprise/scim/token` 端点创建一个。

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

已存在同名用户名的用户。当 IdP 重试失败的创建操作时，可能会发生这种情况。请在 SnapOtter 管理面板中检查是否有重复的用户名。

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdP 发送的请求超过每分钟 1000 个。这通常发生在大型初始同步期间。大多数 IdP 会在速率限制窗口重置后自动重试。如果问题持续存在，请检查你的 IdP 的预配同步间隔。

### 用户已取消预配但未从界面中移除 {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE 是软停用。已停用的用户仍会以禁用状态出现在管理员用户列表中。这是有意为之，以便保留他们的数据。他们的角色显示为 `disabled:<original-role>`。
