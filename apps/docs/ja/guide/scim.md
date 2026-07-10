---
description: "アイデンティティプロバイダーからSnapOtterへユーザーとグループを同期するSCIM 2.0プロビジョニングを設定します。Okta、Azure AD / Entra ID、カスタム連携をカバーします。"
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 0918605decee
---

# SCIMプロビジョニング {#scim-provisioning}

SnapOtterは、ユーザーとグループの自動プロビジョニングのためにSCIM 2.0 (System for Cross-domain Identity Management) を実装しています。アイデンティティプロバイダーは、ユーザーアカウントの作成、更新、無効化、再有効化を行い、グループメンバーシップを自動的に同期できます。

::: tip エンタープライズ機能
SCIMプロビジョニングには、`scim`機能を含む**エンタープライズ**ライセンスが必要です。teamプランでは利用できません。この機能がない場合、SCIMエンドポイントは(ディスカバリを除いて)すべて403を返します。
:::

## 前提条件 {#prerequisites}

- 公開URLで到達可能な、稼働中のSnapOtterインスタンス
- `scim`機能を含むエンタープライズライセンスキー
- SnapOtterへの管理者アクセス(SCIMトークンの生成または失効には`users:manage`権限が必要)
- アイデンティティプロバイダーのプロビジョニング設定への管理者アクセス

## クイックスタート {#quick-start}

1. SCIMベアラートークンを生成します:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

レスポンスにトークンが含まれます。すぐに保存してください。再取得はできません。

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. アイデンティティプロバイダーで、次の内容でSCIMプロビジョニングを設定します:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Authentication**: ベアラートークン(ステップ1のトークンを貼り付ける)

## 認証 {#authentication}

SCIMエンドポイントは、ユーザーセッションやAPIキーとは別の専用ベアラートークンを使用します。

### トークンの生成 {#generating-a-token}

`POST /api/v1/enterprise/scim/token`は新しいSCIMトークンを生成します。このエンドポイントには`users:manage`権限を持つ有効なセッションが必要です。

トークンは平文で一度だけ返されます。SnapOtterはscryptハッシュのみを保存します。トークンを紛失した場合は、失効させて新しく生成してください。

同時に有効なSCIMトークンは1つだけです。新しいトークンを生成すると、以前のものが置き換えられます。

### トークンの失効 {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token`は現在のSCIMトークンを失効させます。このエンドポイントにも`users:manage`が必要です。

### レート制限 {#rate-limiting}

SCIMエンドポイントは、トークンごとに1分あたり1000リクエストのレート制限があります。この制限を超えるとHTTP 429を返します。

## サポートされるリソース {#supported-resources}

| SCIMリソース | SnapOtterの概念 | 作成 | 読み取り | 更新 | 削除 |
|---|---|---|---|---|---|
| User | ユーザーアカウント | 可 | 可 | 可 | ソフト削除 |
| Group | チーム | 可 | 可 | 可 | 可 |

::: warning 
SCIMのGroupはロールではなくSnapOtterの**チーム**にマッピングされます。SCIMではユーザーのロールを設定できません。SCIM経由で作成されたすべてのユーザーには`user`ロールが割り当てられます。ユーザーのロールを変更するには、SnapOtterの管理UIを使用してください。
:::

## ユーザー操作 {#user-operations}

### ユーザーの作成 {#create-user}

`POST /api/v1/scim/v2/Users`

`authProvider`を`scim`に、ロールを`user`にして新しいユーザーアカウントを作成します。ユーザーはDefaultチームに割り当てられます。`active`が`false`の場合、ロールは代わりに`disabled`に設定されます。

必須属性: `userName`。省略可能: `externalId`、`emails`、`active` (デフォルトは`true`)。

### ユーザーの一覧とフィルタリング {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

ページ分割されたユーザー一覧を返します。`startIndex`および`count`クエリパラメータをサポートします(1ページあたり最大200件)。

フィルタリングは、次の属性に対して`eq` (equals) のみをサポートします:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

その他のフィルタ演算子や属性はHTTP 400を返します。

### ユーザーの取得 {#get-user}

`GET /api/v1/scim/v2/Users/:id`

SnapOtterのユーザーIDで単一のユーザーを返します。

### ユーザーの置換 {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

ユーザーの属性を置換します。`userName`、`externalId`、`emails`、`active`をサポートします。ユーザー名の変更は競合がチェックされます(新しいユーザー名が別のユーザーに使用されている場合は409)。

### ユーザーのパッチ {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

SCIM PatchOpを使用した部分更新。サポートされる操作:

| 操作 | パス |
|---|---|
| `replace` | `active`、`userName`、`externalId`、`emails`、`emails[type eq "work"].value`、`name.formatted`、`displayName` |
| `add` | `replace`と同じ |
| `remove` | `externalId`、`emails` |

`name.formatted`および`displayName`パスは互換性のために受け付けられますが、永続的な効果はありません(SnapOtterは別個の表示名を保存しません)。

値なしの`replace`操作(値が`path`を持たないオブジェクトの場合)もサポートされ、キーは`userName`、`externalId`、`emails`、`active`です。

### ユーザーの無効化(ソフト削除) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtterはSCIM経由でユーザーをハード削除しません。代わりに、DELETEはソフト無効化を実行します:

1. ユーザーのロールが現在の値(例: `editor`)から`disabled:editor`に変更され、元のロールが保持されます。
2. ユーザーのパスワードがクリアされます。
3. すべてのアクティブなセッションが失効します。
4. すべてのAPIキーが失効します。

ユーザーはログインもAPIキーの使用もできなくなります。データ(ファイル、履歴)は保持されます。

### ユーザーの再有効化 {#reactivate-user}

以前に無効化されたユーザーを再有効化するには、`active: true`を指定して`PUT`または`PATCH`リクエストを送信します。SnapOtterは無効化前の元のロールを復元します(例: `disabled:editor`が再び`editor`になります)。元のロールを判別できない場合は、`user`にフォールバックします。

::: details 例: PATCHによる無効化と再有効化
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

## グループ操作 {#group-operations}

SCIMのGroupはSnapOtterのチームにマッピングされます。グループを作成するとチームが作成されます。グループメンバーシップにより、ユーザーがどのチームに属するかが制御されます。

### グループの作成 {#create-group}

`POST /api/v1/scim/v2/Groups`

必須: `displayName`。省略可能: `members` (`{ value: userId }`の配列)。

### グループの一覧とフィルタリング {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

フィルタリングは`displayName eq "..."`のみをサポートします。`startIndex`および`count`でページ分割されます(1ページあたり最大200件)。

### グループの取得 {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### グループの置換 {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

グループ名とメンバーシップリスト全体を置換します。新しいリストに含まれない既存メンバーはDefaultチームに移動されます。

### グループのパッチ {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

次の操作をサポートします:

| 操作 | パス | 効果 |
|---|---|---|
| `add` | `members` | ユーザーをチームに追加します |
| `remove` | `members[value eq "userId"]` | ユーザーをDefaultチームに移動します |
| `replace` | `displayName` | チーム名を変更します |
| `replace` | `members` | 全メンバーを置換します(削除されたメンバーはDefaultチームに移動します) |

### グループの削除 {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

チームを削除します。削除されたチームのすべてのメンバーはDefaultチームに移動されます。ユーザーは無効化も削除もされません。

## IdPのセットアップ {#idp-setup}

### Okta {#okta}

1. Okta管理コンソールで、SnapOtterアプリケーションを開きます(または作成します)。
2. **Provisioning**タブに移動し、**Configure API Integration**をクリックします。
3. **Enable API Integration**をチェックし、次を入力します:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: 上で生成したSCIMベアラートークン
4. **Test API Credentials**をクリックし、次に**Save**します。
5. **Provisioning > To App**で、次を有効にします:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. **Push Groups**で、どのOktaグループをSnapOtterチームとして同期するかを設定します。

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Azureポータルで、SnapOtterエンタープライズアプリケーションに移動します。
2. **Provisioning**に移動し、**Provisioning Mode**を**Automatic**に設定します。
3. **Admin Credentials**で、次を入力します:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: 上で生成したSCIMベアラートークン
4. **Test Connection**をクリックし、次に**Save**します。
5. **Mappings**で、ユーザーおよびグループの属性マッピングを設定します。通常はデフォルトで動作しますが、`userName`が希望どおり`userPrincipalName`または`mail`にマッピングされていることを確認してください。
6. **Provisioning Status**を**On**に設定して保存します。

Azureは固定の同期サイクル(通常40分ごと)でユーザーとグループをプロビジョニングします。

## ディスカバリエンドポイント {#discovery-endpoints}

次の3つのエンドポイントは認証なしで利用でき、SCIMサーバーの機能を記述します:

| エンドポイント | 説明 |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | サーバーの機能とサポートされる機能 |
| `GET /api/v1/scim/v2/Schemas` | UserおよびGroupのスキーマ定義 |
| `GET /api/v1/scim/v2/ResourceTypes` | 利用可能なリソースタイプ(User、Group) |

`ServiceProviderConfig`は次の機能を公開します:

| 機能 | サポート |
|---|---|
| Patch | 可 |
| Bulk | 不可 |
| Filter | 可(最大200件、`eq`演算子のみ) |
| Change password | 不可 |
| Sort | 不可 |
| ETag | 不可 |

## 制限事項 {#limitations}

- **フィルタリング**: `eq`演算子のみがサポートされます。複雑なフィルタ、`and`/`or`演算子、`co` (contains)、`sw` (starts with) は実装されていません。
- **バルク操作**: サポートされません。
- **SortとETag**: サポートされません。
- **ロール**: SCIMではSnapOtterのロールを割り当てられません。プロビジョニングされたすべてのユーザーは`user`ロールを取得します。
- **MAX_USERS**: `MAX_USERS`環境変数の制限は、SCIMによるユーザー作成では適用されません。ユーザー数に上限を設ける必要がある場合は、IdP側で割り当てを管理してください。
- **1トークン**: 同時に有効なSCIMトークンは1つだけです。複数のIdPがSCIMアクセスを必要とする場合は、トークンを共有する必要があります。
- **グループはチーム**: SCIMのGroupは、ロールや権限グループではなくチームに対応します。

## トラブルシューティング {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

ライセンスに`scim`機能が含まれていないか、ライセンスが設定されていません。SCIMにはエンタープライズプランのライセンスが必要です。`SNAPOTTER_LICENSE_KEY`が設定されており、ライセンスに`scim`機能が含まれていることを確認してください。

### 401 "Bearer token required" {#_401-bearer-token-required}

SCIMリクエストに`Authorization: Bearer <token>`ヘッダーが含まれていませんでした。IdPのプロビジョニング設定を確認してください。

### 401 "Invalid token" {#_401-invalid-token}

トークンが保存されたハッシュと一致しません。トークンが失効して再生成された場合に発生します。IdPのプロビジョニング設定でトークンを更新してください。

### 401 "SCIM not configured" {#_401-scim-not-configured}

SCIMトークンがまだ生成されていません。`POST /api/v1/enterprise/scim/token`エンドポイントを使用して作成してください。

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

同じユーザー名のユーザーがすでに存在します。IdPが失敗した作成を再試行したときに発生することがあります。SnapOtter管理パネルで重複したユーザー名がないか確認してください。

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

IdPが1分あたり1000件を超えるリクエストを送信しています。これは通常、大規模な初回同期中に発生します。ほとんどのIdPは、レート制限のウィンドウがリセットされた後に自動的に再試行します。問題が続く場合は、IdPのプロビジョニング同期間隔を確認してください。

### ユーザーがデプロビジョニングされたがUIから削除されない {#users-deprovisioned-but-not-removed-from-the-ui}

SCIMのDELETEはソフト無効化です。無効化されたユーザーは、無効ステータスで管理者のユーザー一覧に引き続き表示されます。これはデータを保持するための仕様です。ロールは`disabled:<original-role>`として表示されます。
