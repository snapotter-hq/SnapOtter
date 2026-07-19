---
description: "SnapOtter の PostgreSQL データベーススキーマ、テーブル、マイグレーション、バックアップ手順。"
i18n_source_hash: 50d5d4f220cf
i18n_provenance: human
i18n_output_hash: 1113cd0160d9
---

# データベース {#database}

SnapOtter はデータの永続化に PostgreSQL 17 と [Drizzle ORM](https://orm.drizzle.team/)（pg-core / node-postgres）を使用します。スキーマは `apps/api/src/db/schema.ts` で定義されています。

接続は `DATABASE_URL` 環境変数（デフォルト `postgres://snapotter:snapotter@postgres:5432/snapotter`）で設定します。Docker Compose では、Postgres コンテナが `SnapOtter-pgdata` という名前付きボリュームにデータを保存します。

## テーブル {#tables}

### users {#users}

ユーザーアカウントを保存します。初回起動時に `DEFAULT_USERNAME` と `DEFAULT_PASSWORD` から自動的に作成されます。

| カラム | 型 | 備考 |
|---|---|---|
| `id` | uuid | 主キー |
| `username` | varchar | 一意、必須 |
| `passwordHash` | varchar | scrypt ハッシュ |
| `role` | varchar | `admin`、`editor`、または `user` |
| `mustChangePassword` | boolean | パスワードの強制リセットフラグ |
| `createdAt` | timestamp | 作成日時 |
| `updatedAt` | timestamp | 最終更新日時 |

### sessions {#sessions}

アクティブなログインセッション。各行はセッショントークンをユーザーに紐付けます。

| カラム | 型 | 備考 |
|---|---|---|
| `id` | varchar | 主キー（セッショントークン） |
| `userId` | uuid | `users.id` への外部キー |
| `expiresAt` | timestamp | 有効期限 |
| `createdAt` | timestamp | 作成日時 |

### teams {#teams}

ユーザーを整理するためのグループ。管理者はユーザーをチームに割り当てられます。

| カラム | 型 | 説明 |
|--------|------|-------------|
| `id` | uuid | 主キー |
| `name` | varchar（一意、最大 50 文字） | チーム名 |
| `createdAt` | timestamp | 作成日時 |

### api_keys {#api-keys}

プログラムからのアクセス用の API キー。生のキーは作成時に一度だけ表示され、保存されるのはハッシュのみです。

| カラム | 型 | 備考 |
|---|---|---|
| `id` | uuid | 主キー |
| `userId` | uuid | `users.id` への外部キー |
| `keyHash` | varchar | キーの scrypt ハッシュ |
| `name` | varchar | ユーザーが指定したラベル |
| `createdAt` | timestamp | 作成日時 |
| `lastUsedAt` | timestamp | 認証済みリクエストごとに更新 |

キーは `si_` を接頭辞とし、その後に 96 桁の 16 進数（48 バイトのランダム値）が続きます。

### pipelines {#pipelines}

ユーザーが UI で作成する、保存されたツールチェーン。

| カラム | 型 | 備考 |
|---|---|---|
| `id` | uuid | 主キー |
| `name` | varchar | パイプライン名 |
| `description` | varchar | 任意の説明 |
| `steps` | jsonb | `{ toolId, settings }` オブジェクトの配列 |
| `createdAt` | timestamp | 作成日時 |

### user_files {#user-files}

永続的なファイルライブラリ。保存された編集は、デフォルトでは独立したルート行として挿入され（「新規として保存」: `version` 1、`parentId` null なので元のファイルは一覧に残ります）、元のファイルを上書きした場合は親にリンクされたバージョンとして挿入されます（`parentId` が設定され、`version` が増加し、元のファイルを置き換えます）。`toolChain` カラムには適用されたツールが記録されます。

| カラム | 型 | 説明 |
|--------|------|-------------|
| `id` | uuid | 主キー |
| `userId` | uuid | users への FK（CASCADE DELETE） |
| `originalName` | varchar | アップロード時の元のファイル名 |
| `storedName` | varchar | ディスク上のファイル名 |
| `mimeType` | varchar | MIME タイプ |
| `size` | integer | ファイルサイズ（バイト） |
| `width` | integer | 画像の幅（ピクセル） |
| `height` | integer | 画像の高さ（ピクセル） |
| `version` | integer | バージョン番号（1 = オリジナル） |
| `parentId` | uuid または null | user_files への FK（親バージョン） |
| `toolChain` | jsonb | このバージョンを生成するために順に適用されたツール ID |
| `createdAt` | timestamp | 作成日時 |

### jobs {#jobs}

進捗報告とクリーンアップのために処理ジョブを追跡します。

| カラム | 型 | 備考 |
|---|---|---|
| `id` | uuid | 主キー |
| `type` | varchar | ツールまたはパイプラインの識別子 |
| `status` | varchar | `queued`、`processing`、`completed`、または `failed` |
| `progress` | real | 0.0〜1.0 の割合 |
| `inputFiles` | jsonb | 入力ファイルパスの配列 |
| `outputPath` | varchar | 結果ファイルへのパス |
| `settings` | jsonb | 使用されたツール設定 |
| `error` | varchar | 失敗した場合のエラーメッセージ |
| `createdAt` | timestamp | 作成日時 |
| `completedAt` | timestamp | 完了日時 |

### settings {#settings}

管理者が UI から変更できる、サーバー全体の設定のためのキーバリューストア。

| カラム | 型 | 備考 |
|---|---|---|
| `key` | varchar | 主キー |
| `value` | varchar | 設定値 |
| `updatedAt` | timestamp | 最終更新日時 |

### roles {#roles}

きめ細かな権限を持つカスタムロール。

| カラム | 型 | 備考 |
|---|---|---|
| `id` | uuid | 主キー |
| `name` | varchar | 一意のロール名 |
| `description` | varchar | 任意の説明 |
| `permissions` | jsonb | 権限文字列の配列 |
| `createdAt` | timestamp | 作成日時 |

### audit_log {#audit-log}

セキュリティに関わるアクションのログ。

| カラム | 型 | 備考 |
|---|---|---|
| `id` | uuid | 主キー |
| `userId` | uuid | users への FK |
| `action` | varchar | アクションの種類 |
| `details` | jsonb | アクション固有のデータ |
| `createdAt` | timestamp | アクション日時 |

## マイグレーション {#migrations}

Drizzle がスキーマのマイグレーションを処理します。マイグレーションファイルは `apps/api/drizzle/` にあります。開発中は次のとおりです。

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

本番環境では、保留中のマイグレーションが起動時に自動的に適用されます。

## バックアップとリストア {#backup-and-restore}

リレーショナルデータベースは、アプリの `/data` ボリュームではなく、Postgres コンテナの `SnapOtter-pgdata` ボリュームに存在します。

**オプション 1: pg_dump（推奨）**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**オプション 2: ボリュームスナップショット**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### 1.x（SQLite）からの移行 {#migrating-from-1-x-sqlite}

SnapOtter 1.x からのアップグレードには専用のガイドがあります。[1.x から 2.0 へのアップグレード](./upgrading) を参照してください。要点としては、既存の `/data` ボリュームを再利用すれば、2.0 が初回起動時に `/data/snapotter.db` を自動検出してインポートします（または `SQLITE_MIGRATE_PATH` を設定して明示的に指定します）。まず `snapotter.db` だけでなく `/data` ボリューム全体をバックアップしてください。1.x は SQLite の WAL モードを使うため、停止したコンテナはデータの大半を、ほぼ空の `snapotter.db` のそばにある `snapotter.db-wal` に残していることがよくあります。
