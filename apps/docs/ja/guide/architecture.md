---
description: "SnapOtter のモノレポ構造、アプリとパッケージのアーキテクチャ、リクエストのライフサイクル、リソースフットプリント。"
i18n_source_hash: 9e8f80499a37
i18n_provenance: human
i18n_output_hash: 3a780628a2ab
---

# アーキテクチャ {#architecture}

SnapOtter は、pnpm ワークスペースと Turborepo で管理されるモノレポです。3 コンテナの Docker Compose スタック、すなわち SnapOtter アプリイメージ、PostgreSQL 17、Redis 8 としてデプロイされます。

## プロジェクト構造 {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## パッケージ {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

[Sharp](https://sharp.pixelplumbing.com/) 上に構築されたコア画像処理ライブラリです。AI を使わないすべての操作（リサイズ、クロップ、回転、反転、変換、圧縮、メタデータの削除、色調整（明るさ、コントラスト、彩度、グレースケール、セピア、反転、カラーチャンネル））を処理します。

このパッケージにはネットワーク依存がなく、すべてプロセス内で実行されます。

### `@snapotter/ai` {#snapotter-ai}

ML 操作のために Python スクリプトを呼び出すブリッジ層です。初回使用時、ブリッジは常駐する Python ディスパッチャープロセスを起動し、重いライブラリ（PIL、NumPy、MediaPipe、rembg）を事前にインポートするため、以降の AI 呼び出しはインポートのオーバーヘッドを回避できます。ディスパッチャーがまだ準備できていない場合、ブリッジはリクエストごとに新しい Python サブプロセスを生成するフォールバックに切り替わります。

**モデルは事前ロードされません。** 各ツールスクリプトは、リクエスト時にディスクからモデルの重みを読み込み、リクエストが完了すると破棄します。メモリプロファイルの全容については [リソースフットプリント](#resource-footprint) を参照してください。

サポートされる操作: 背景除去（rembg/BiRefNet）、アップスケーリング（RealESRGAN）、顔のぼかし（MediaPipe）、顔補正（GFPGAN/CodeFormer）、オブジェクト消去（LaMa ONNX）、OCR（PaddleOCR/Tesseract）、カラー化（DDColor）、ノイズ除去、赤目除去、写真復元、証明写真の生成、透明度の修正（BiRefNet HR マッティング）、コンテンツ認識リサイズ（Go caire バイナリ）。

Python スクリプトは `packages/ai/python/` にあります。Docker イメージはビルド時にすべてのモデルの重みを事前ダウンロードするため、コンテナは完全にオフラインで動作します。

### `@snapotter/shared` {#snapotter-shared}

フロントエンドとバックエンドの両方で使用される、共有 TypeScript 型、定数（`APP_VERSION` やツール定義など）、および i18n 翻訳文字列。

## アプリケーション {#applications}

### API (`apps/api`) {#api-apps-api}

5 つのモダリティ（画像、動画、音声、PDF、ファイル）にまたがる 241 のツールルートを公開する Fastify v5 サーバーで、以下を処理します:
- ファイルアップロード、一時的なワークスペース管理、永続的なファイルストレージ
- バージョンチェーン付きのユーザーファイルライブラリ（`user_files` テーブル） - 処理された各結果は元のソースファイルにリンクされ、どのツールが適用されたかを記録します。Files ページ用の自動生成サムネイル付き
- ツール実行（各ツールリクエストを画像エンジンまたは AI ブリッジにルーティング）
- パイプラインのオーケストレーション（複数のツールを順次連結）
- BullMQ ジョブキュー（プール: image、media、ai、docs、system）による並行制御付きのバッチ処理
- ユーザー認証、RBAC（フルの権限セットを持つ admin/user ロール）、API キー管理、レート制限
- チーム管理 - admin 専用の CRUD。ユーザーはプロフィールの `team` フィールドを介してチームに割り当てられます
- ランタイム設定 - `settings` テーブルのキーバリューストアで、再デプロイせずに `disabledTools`、`enableExperimentalTools`、`loginAttemptLimit` などの運用ノブを制御します
- データベースに保存された設定によるカスタムブランディングとランタイム設定
- `/api/docs` での Scalar/OpenAPI ドキュメント
- 本番環境で、ビルドされたフロントエンドを SPA として配信

主な依存関係: Fastify、Drizzle ORM（pg-core、node-postgres）、Sharp、BullMQ、ioredis、検証用の Zod。

サーバーは SIGTERM/SIGINT でのグレースフルシャットダウンを処理します。HTTP 接続をドレインし、BullMQ ワーカーを停止し、Python ディスパッチャーをシャットダウンし、データベース接続を閉じます。

### Web (`apps/web`) {#web-apps-web}

Vite でビルドされた React 19 のシングルページアプリです。状態管理に Zustand、スタイリングに Tailwind CSS v4、アイコンに Lucide を使用します。API とは REST と SSE（進捗トラッキング用）で通信します。

ページには、ツールワークスペース、永続的なアップロードと結果を管理する Files ページ、自動化/パイプラインビルダー、admin 設定パネルが含まれます。

ビルドされたフロントエンドは本番環境で Fastify バックエンドによって配信されるため、Docker コンテナ内に別のウェブサーバーはありません。

### Docs (`apps/docs`) {#docs-apps-docs}

この VitePress サイトです。`main` へのプッシュ時に、Cloudflare Pages へ自動的にデプロイされます。

## リクエストの流れ {#how-a-request-flows}

1. ユーザーが Web UI でツールを選び、ファイルをアップロードします。
2. フロントエンドが、ファイルと設定を添えて `/api/v1/tools/:section/:toolId` へマルチパート POST を送信します。
3. API ルートが Zod で入力を検証し、処理をディスパッチします。
4. 標準ツールの場合、ジョブは適切な BullMQ プール（モダリティに応じて image、media、または docs）にエンキューされます。プロセス内の BullMQ ワーカーが、EXIF メタデータに基づいて画像を自動回転させ、ツールのプロセス関数を実行して結果を返します。
5. AI ツールの場合、TypeScript ブリッジが常駐する Python ディスパッチャーへリクエストを送り（またはフォールバックとして新しいサブプロセスを生成し）、完了を待って出力ファイルを読み取ります。
6. ジョブの進捗は PostgreSQL の `jobs` テーブルに永続化されるため、状態はコンテナの再起動を越えて保持されます。リアルタイム更新は `/api/v1/jobs/:jobId/progress` の SSE で配信されます。
7. API は `jobId` と `downloadUrl` を返します。ユーザーは `/api/v1/download/:jobId/:filename` から処理済みファイルをダウンロードします。

パイプラインの場合、API は各ステップの出力を次のステップの入力として順次実行します。

バッチ処理の場合、API はステップごとの子ジョブを持つ BullMQ フローを使用し、すべての処理済みファイルを含む ZIP ファイルを返します。

## リソースフットプリント {#resource-footprint}

SnapOtter は、アイドル時のメモリ使用量を低く抑えるように設計されています。起動時に事前ロードされたり、ウォームな状態で保持されたりするものはありません。

### アイドル時 {#at-idle}

Node.js/Fastify プロセス、PostgreSQL、Redis が動作しています。典型的なアイドル時の RAM は、3 つのコンテナ（Node.js プロセス、Postgres、Redis）全体で **約 200〜300 MB** です。Python プロセスも、メモリ上のモデルの重みもありません。

### 何が、いつ起動するか {#what-starts-and-when}

| コンポーネント | 起動タイミング | アクティブ時のメモリ |
|-----------|-------------|---------------------|
| Fastify サーバー + Postgres + Redis | コンテナ起動時 | 合計 約 200〜300 MB |
| BullMQ ワーカー | コンテナ起動時（プロセス内） | プールごとに 1 ワーカー（image、media、ai、docs、system） |
| Python ディスパッチャー | 最初の AI ツールリクエスト時 | Python インタープリタ + 事前インポートされたライブラリ（PIL、NumPy、MediaPipe、rembg） - モデルの重みなし |
| AI モデルの重み | 特定のツールのリクエスト中 | ディスクからロードされ、リクエスト完了時に解放される |

### モデルのロード {#model-loading}

すべてのモデル重みファイル（合計で数 GB）は、常に `/opt/models/` のディスク上に置かれています。各 AI ツールスクリプトは、リクエストの間だけ自身のモデルのみをメモリにロードし、その後解放します。一部のスクリプトは、メモリを即座に返却するために推論後に明示的に `del model` と `torch.cuda.empty_cache()` を呼び出します。

リクエスト間のモデルキャッシュはありません。同じ AI ツールを連続して実行すると、その都度モデルが再ロードされます。これにより、AI リクエストのたびにモデルロードの遅延が生じる代わりに、アイドル時のメモリをゼロ近くに保ちます。

### 最初の AI リクエストのコールドスタート {#first-ai-request-cold-start}

コンテナ起動時、Python ディスパッチャーは動作していません。最初の AI リクエストは、2 つのことを並行して引き起こします。ディスパッチャーがバックグラウンドでウォームアップを開始し、リクエスト自体は一回限りの Python サブプロセス生成にフォールバックします。ディスパッチャーが準備完了を通知すると、以降のすべての AI リクエストはそれを直接使用し、サブプロセス生成のコストをスキップします。
