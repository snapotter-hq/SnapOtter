---
description: "SnapOtter でユーザー、組み込みおよびカスタムロール、権限、API キー、チーム、セッション、監査ログを管理します。"
i18n_source_hash: 5e28af686c96
i18n_provenance: human
i18n_output_hash: 4917b71a173c
---

# ユーザー、ロール、権限 {#users-roles-permissions}

SnapOtter は 3 つの組み込みロール、17 の細粒度な権限、そしてツールごとのアクセス制御を任意で設定できるカスタムロールをサポートします。このページでは、認可モデル全体、API キーのスコープ設定、チーム管理、監査ログについて説明します。

::: tip 関連ページ
[OIDC / SSO](/ja/guide/oidc) | [SAML SSO](/ja/guide/saml) | [SCIM プロビジョニング](/ja/guide/scim) | [セキュリティと堅牢化](/ja/guide/security)
:::

## ユーザー {#users}

### ユーザーの作成 {#creating-users}

管理者は管理パネルまたは `POST /api/auth/register` エンドポイントを通じてユーザーを作成できます。各ユーザーはユーザー名、ロール、チーム割り当て、および任意のメールアドレスを持ちます。

### デフォルト管理者 {#default-admin}

初回起動時に SnapOtter はデフォルトの管理者アカウントを作成します。認証情報は環境変数から取得されます:

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_USERNAME` | `admin` | 初期管理者アカウントのユーザー名 |
| `DEFAULT_PASSWORD` | `admin` | 初期管理者アカウントのパスワード |

デフォルト管理者は初回ログイン時にパスワードの変更を求められます。

### 認証プロバイダー {#authentication-providers}

ユーザーはいくつかの方法で認証できます:

- **ローカル** - SnapOtter データベースに保存されるユーザー名とパスワード
- **OIDC** - 任意の OpenID Connect プロバイダー（[OIDC / SSO](/ja/guide/oidc) を参照）
- **SAML** - SAML 2.0 アイデンティティプロバイダー（[SAML SSO](/ja/guide/saml) を参照）
- **SCIM** - アイデンティティプロバイダーからの自動プロビジョニング（[SCIM プロビジョニング](/ja/guide/scim) を参照）

### 認証の無効化 {#disabling-authentication}

`AUTH_ENABLED=false` を設定すると認証を完全に無効化できます。このモードでは、すべてのリクエストに対して `admin` ロールを持つ合成の匿名ユーザーが使用されます。ログインは不要です。

::: warning 
認証を無効化すると、インスタンスに到達できる誰もが完全な管理者アクセスを得ます。信頼できる環境でのみ使用してください。
:::

## 組み込みロール {#built-in-roles}

SnapOtter には 3 つの組み込みロールが含まれています。これらは変更または削除できません。

### 管理者 (Admin) {#admin}

17 のすべての権限。インスタンスを完全に制御します。

`tools:use` `files:own` `files:all` `apikeys:own` `apikeys:all` `pipelines:own` `pipelines:all` `settings:read` `settings:write` `users:manage` `teams:manage` `features:manage` `system:health` `audit:read` `compliance:manage` `webhooks:manage` `security:manage`

### 編集者 (Editor) {#editor}

7 の権限。すべてのツールを使用し、すべてのファイルとパイプラインを管理できますが、管理者機能にはアクセスできません。

`tools:use` `files:own` `files:all` `apikeys:own` `pipelines:own` `pipelines:all` `settings:read`

### ユーザー (User) {#user}

5 の権限。ツールを使用し、自分自身のリソースを管理できます。

`tools:use` `files:own` `apikeys:own` `pipelines:own` `settings:read`

## 権限リファレンス {#permissions-reference}

| Permission | Description |
|---|---|
| `tools:use` | 任意の処理ツールを使用する |
| `files:own` | 自分のファイルを表示・管理する |
| `files:all` | すべてのユーザーのファイルを表示・管理する |
| `apikeys:own` | 自分の API キーを作成・管理する |
| `apikeys:all` | すべてのユーザーの API キーを表示する |
| `pipelines:own` | 自分のパイプラインを作成・管理する |
| `pipelines:all` | すべてのユーザーのパイプラインを表示・管理する |
| `settings:read` | インスタンス設定を表示する |
| `settings:write` | インスタンス設定を変更する |
| `users:manage` | ユーザーアカウントを作成・更新・削除する |
| `teams:manage` | チームを作成・更新・削除する |
| `features:manage` | AI 機能バンドルをインストール・管理する |
| `system:health` | ヘルスおよびレディネスのエンドポイントにアクセスする |
| `audit:read` | 監査ログを表示し、ロールを一覧表示する |
| `compliance:manage` | GDPR ライフサイクルとコンプライアンス機能を管理する |
| `webhooks:manage` | アウトバウンドの Webhook を設定する |
| `security:manage` | セキュリティ設定を管理する（IP 許可リスト、SSO 強制） |

## カスタムロール {#custom-roles}

`security:manage` 権限を持つ管理者は、管理パネルまたはロール API を通じてカスタムロールを作成できます。ロールの一覧表示には `audit:read` が必要です。

### カスタムロールの作成 {#creating-a-custom-role}

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

ロール名は 2〜30 文字で、ハイフンとアンダースコアを含む小文字の英数字にする必要があります。

### 管理者専用の権限 {#admin-reserved-permissions}

3 つの権限は組み込みロール専用で、カスタムロールには割り当てられません:

- `compliance:manage`
- `webhooks:manage`
- `security:manage`

ロール API はこれらの権限を含むリクエストを拒否します。組み込みの `admin` ロールのみがこれらにアクセスできます。

### ツールレベルの権限 {#tool-level-permissions}

カスタムロールは、ユーザーがアクセスできるツールを任意で制限できます。2 つのモードが利用可能です:

| Mode | Behavior | License requirement |
|---|---|---|
| `category` | モダリティ（image、video、audio、document、file）で制限する | なし（無料） |
| `tool` | 個別のツール ID で制限する | `per_tool_permissions` エンタープライズ機能が必要 |

`tool` モードが設定されているがエンタープライズ機能が利用できない場合、SnapOtter は正常に劣化し、すべてのツールへのアクセスを許可します。

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

### カスタムロールの削除 {#deleting-a-custom-role}

カスタムロールが削除されると、それに割り当てられたすべてのユーザーは自動的に `user` ロールに再割り当てされます。

## チーム {#teams}

チームはストレージと保持の管理のためにユーザーをグループ化します。初回起動時に `Default` チームが作成されます。

| Field | Type | Description |
|---|---|---|
| `name` | string | 一意のチーム名（1〜50 文字） |
| `storageQuota` | number | チームごとのストレージ上限（バイト単位、エンタープライズなしで機能） |
| `retentionHours` | number | この時間数が経過した後に出力を自動削除する（`team_retention_overrides`、エンタープライズが必要） |
| `legalHold` | boolean | チームメンバーのファイルの自動削除を防止する（`legal_hold`、エンタープライズが必要） |

::: info 
`Default` チームは削除できません。メンバーがまだ在籍しているチームは削除できません。先にメンバーを再割り当てしてください。
:::

## API キー {#api-keys}

ユーザーはプログラムからのアクセス用に API キーを生成できます。各キーは `si_` プレフィックスを使用し、作成時に一度だけ表示されます。

### スコープ付き権限 {#scoped-permissions}

API キーは任意で `permissions` 配列を持つことができます。設定されている場合、リクエストの実効権限はユーザーのロール権限とキーのスコープ付き権限の**積集合**になります。つまり、API キーはユーザー自身の権限を超えて昇格することは決してできません。

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

### 有効期限 {#expiration}

キーは任意の `expiresAt` タイムスタンプを受け付けます。期限切れのキーは認証時に拒否されます。

## 監査ログ {#audit-log}

SnapOtter はセキュリティに関連するイベントを `audit_log` データベーステーブルに保存された構造化された監査ログに記録します。

### 監査ログの表示 {#viewing-the-audit-log}

```
GET /api/v1/audit-log?page=1&limit=50&action=LOGIN_FAILED&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z
```

`audit:read` 権限が必要です。ページネーション（`page`、`limit`）とフィルター（`action`、`ip`、`from`、`to`）をサポートします。

### ツール操作の監査 {#tool-operation-auditing}

::: warning 
`TOOL_EXECUTED` イベントはデフォルトでは記録**されません**。次の 2 つの方法のいずれかでオプトインします:

1. `auditToolOperations` 管理設定を `true` に設定する。
2. `audit_export` 機能を持つ有効なライセンスを保持する（team プランと enterprise プランの両方で利用可能）。

これらのいずれかがない場合、個々のツール実行は監査ログに記録されません。
:::

### エクスポート {#exporting}

```
GET /api/v1/enterprise/audit/export?format=csv&from=2026-01-01T00:00:00Z
```

`audit:read` 権限と `audit_export` エンタープライズ機能が必要です（team プランと enterprise プランの両方で利用可能）。CSV と JSON 形式をサポートし、`action`、`actorId`、`targetType`、`targetId`、`from`、`to` でフィルタリングできます。

### 改ざん耐性のある署名 {#tamper-resistant-signing}

有効にすると、各監査ログエントリは `DATA_ENCRYPTION_KEY` から派生した HMAC で署名されます。これには以下が必要です:

1. 環境で `DATA_ENCRYPTION_KEY` を設定する。
2. `tamperResistantAudit` 管理設定を有効にする。
3. `tamper_resistant_audit` 機能を持つエンタープライズライセンス。

### 保持 {#retention}

古いエントリを自動的に削除するには `AUDIT_RETENTION_DAYS` を設定します。デフォルトは `0` で、エントリを無期限に保持することを意味します。

### イベントリファレンス {#event-reference}

| Event | Category |
|---|---|
| `LOGIN_SUCCESS`, `LOGIN_FAILED` | 認証 |
| `OIDC_LOGIN_SUCCESS`, `OIDC_LOGIN_FAILED` | 認証 |
| `SAML_LOGIN_SUCCESS`, `SAML_LOGIN_FAILED` | 認証 |
| `LOGOUT` | 認証 |
| `USER_CREATED`, `USER_UPDATED`, `USER_DELETED` | ユーザー管理 |
| `PASSWORD_CHANGED`, `PASSWORD_RESET` | ユーザー管理 |
| `MFA_ENROLLED`, `MFA_DISABLED`, `MFA_VERIFIED`, `MFA_VERIFY_FAILED` | MFA |
| `MFA_CHALLENGE_ISSUED`, `MFA_RECOVERY_USED`, `MFA_RESET` | MFA |
| `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED` | ロール |
| `API_KEY_CREATED`, `API_KEY_DELETED` | API キー |
| `SETTINGS_UPDATED`, `IP_ALLOWLIST_UPDATED` | 設定 |
| `FILE_UPLOADED`, `FILE_DELETED` | ファイル |
| `TOOL_EXECUTED` | ツール（オプトイン） |
| `SCIM_USER_PROVISIONED`, `SCIM_USER_UPDATED`, `SCIM_USER_DEPROVISIONED` | SCIM |
| `SCIM_GROUP_SYNCED` | SCIM |
| `LEGAL_HOLD_APPLIED`, `LEGAL_HOLD_RELEASED` | コンプライアンス |
| `GDPR_EXPORT_INITIATED`, `GDPR_USER_PURGED`, `GDPR_TEAM_PURGED` | コンプライアンス |
| `CONFIG_EXPORTED`, `CONFIG_IMPORTED` | 設定 |

## セッション管理 {#session-management}

セッションは Cookie ベースで、`SESSION_DURATION_HOURS`（デフォルト: 168 時間 / 7 日）で制御されます。

### ロール変更はセッションを無効化する {#role-changes-invalidate-sessions}

管理者がユーザーのロールを変更すると、そのユーザーのすべてのアクティブなセッションが削除されます。ユーザーは新しい権限を反映するために再度ログインする必要があります。

### 安全ガード {#safety-guards}

- **最後の管理者の保護**: 残っている最後の管理者を下位のロールに降格することはできません。試みると API はエラーを返します。
- **自己削除の防止**: 管理者は API を通じて自分自身のアカウントを削除できません。
