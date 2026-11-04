---
description: "Docker を使って SnapOtter を 1 つのコマンドでインストールします。Docker Compose のセットアップ、ソースからのビルド、機能の概要も含まれます。"
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: 2447aac7a3bd
i18n_hash_version: 2
---

# はじめに {#getting-started}

::: tip インストール前に試す
[demo.snapotter.com](https://demo.snapotter.com) で UI 全体を確認できます。登録もインストールも不要です。
:::

## クイックスタート {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

この 1 つのコンテナだけで、必要なものがすべて動きます。`DATABASE_URL` を設定しない場合、独自の PostgreSQL と Redis をループバックインターフェースで起動し（組み込みモード）、すべてのデータを `SnapOtter-data` ボリュームに保存します。SnapOtter を手早く試したり、ホームラボでセルフホストしたりするのに最適な方法です。本番環境では、PostgreSQL と Redis を別々のコンテナで動かす[標準の Docker Compose スタック](#docker-compose)を使ってください。組み込みモードは root（デフォルト）で動作し、`DATABASE_URL` を設定すると自動的に無効になります。

Raspberry Pi、古いノート PC、小規模な VPS にインストールしますか。調整済みの手順と、制約のあるハードウェアで期待できる動作については[低リソース環境のセットアップ](/ja/guide/low-resource)を参照してください。

初回ログイン時にパスワードの変更を求められます。

::: tip 匿名のプロダクト分析
SnapOtter にはデフォルトで匿名のプロダクト分析が含まれています。無効にするには、**Settings → System → Privacy** を開き、**Anonymous Product Analytics** をオフにします。インスタンス全体で即座に停止します。

環境変数 `SNAPOTTER_TELEMETRY=0`（`false` と `off` も使えます）を設定すると、再ビルドなしでインスタンスのすべてのテレメトリを無効にできます。

エラー監視には [Sentry](https://sentry.io) を使用しています。Sentry はオープンソースプログラムを通じて SnapOtter をスポンサーしています。

収集される内容の詳細は、[SnapOtter が収集する情報](/ja/guide/telemetry)を参照してください。
:::

::: tip NVIDIA CUDA アクセラレーション
背景除去、アップスケール、顔の補正、復元を NVIDIA CUDA で高速化するには、`--gpus all` を追加します。OCR は引き続き CPU ベースで、GPU アクセスの有無にかかわらず同じイメージで動作します。

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) が必要です。CUDA が利用できない場合は自動的に CPU にフォールバックします。VA-API、Quick Sync、OpenCL による Intel/AMD の iGPU アクセラレーションは、現在 AI 推論ではサポートされていません。ベンチマークは [Docker タグ](/ja/guide/docker-tags)を参照してください。`--gpus all` を指定しても AI ツールが CPU で動作する場合は、[GPU アクセラレーションの確認](/ja/guide/deployment#verify-gpu-acceleration)を参照してください。
:::

::: details GHCR でも利用可能
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

どちらのレジストリでも、リリースごとに同じイメージが公開されます。
:::

## Docker Compose {#docker-compose}

このページの簡略化した Compose の例をコピーするのではなく、リリースごとにメンテナンスおよびテストされている本番用ファイルを使ってください。

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

標準の [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) には、4 つのランタイムボリューム、ヘルスチェック、リソース制限、永続的な Redis 設定、固定されたデータベース/キャッシュイメージ、最新のコンテナハードニングがすべて含まれています。初回ログイン後すぐに、デフォルトの管理者パスワードを変更してください。再現性のあるデプロイにするには、`latest` に追従するのではなく、検証済みのリリースタグまたはダイジェストに SnapOtter アプリケーションイメージを固定してください。

すべての環境変数は[設定](/ja/guide/configuration)を、シークレット、ネットワークポリシー、バックアップについては[セキュリティとハードニング](/ja/guide/security)を参照してください。

## ソースからのビルド {#build-from-source}

**前提条件:** Node.js 22.22+、pnpm 9+、Docker（Postgres と Redis 用）、Python 3.11+（AI 機能用）、Git。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- フロントエンド: [http://localhost:1351](http://localhost:1351)
- バックエンド: [http://localhost:13490](http://localhost:13490)

## できること {#what-you-can-do}

### ファイル処理（200以上のツール） {#file-processing-200-tools}

| モダリティ | 数 | ツールの例 |
|----------|-------|---------------|
| **画像** | 112 | リサイズ、切り抜き、圧縮、変換、背景除去、アップスケール、OCR、透かし、コラージュ、カラー化、GIF ツール、フォーマットプリセット |
| **動画** | 57 | トリミング、切り抜き、圧縮、変換、結合、音声抽出、自動字幕、動画から GIF へ、リサイズ、手ぶれ補正、フォーマットプリセット |
| **音声** | 27 | トリミング、結合、変換、正規化、ノイズ低減、文字起こし、ピッチシフト、フェード、着信音メーカー、フォーマットプリセット |
| **PDF / ドキュメント** | 35 | 結合、分割、圧縮、OCR、透かし、墨消し、Word から PDF へ、Excel から PDF へ、回転、保護、修復 |
| **ファイル** | 23 | CSV から JSON へ、JSON から XML へ、CSV の結合、CSV の分割、ZIP の作成、ZIP の展開、グラフメーカー、YAML/JSON |

### パイプライン {#pipelines}

ツールをつなげて複数ステップのワークフローを作り、1 枚の画像またはバッチ全体に適用できます。

1. サイドバーで **Pipelines** を開きます。
2. ステップを追加します（任意のツール、任意の設定）。
3. 1 つのファイル、またはバッチ全体に対して一度に実行します。
4. 後で再利用できるようにパイプラインを保存します。

パイプラインはデフォルトで 20 ステップまで可能です。`MAX_PIPELINE_STEPS=0` を設定すると、制限なしになります。

### ファイルライブラリ {#file-library}

処理したファイルはすべて **Files** ライブラリに保存できます。SnapOtter は完全なバージョン履歴を記録するため、元のアップロードから最終出力までのすべての処理ステップをたどれます。

保存は明示的な操作です。ライブラリに保存した結果は削除するまで保持され、処理後に保存しなかった結果は 72 時間後に自動的に消去されます（`FILE_MAX_AGE_HOURS` で設定可能）。

### REST API と API キー {#rest-api-api-keys}

すべてのツールは HTTP 経由で利用できます。

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

API キーは **Settings → API Keys** で生成します。すべてのエンドポイントは [REST API リファレンス](/ja/api/rest)を、インタラクティブなリファレンスは [http://localhost:1349/api/docs](http://localhost:1349/api/docs) を参照してください。

### マルチユーザーとチーム {#multi-user-teams}

ロールベースのアクセス制御で、複数のユーザーを有効にできます。

- **Admin**: フルアクセス。ユーザー、チーム、設定、すべてのファイル、パイプライン、API キーを管理できます
- **User**: ツールを使用し、自分のファイル、パイプライン、API キーを管理できます

**Settings → Teams** でチームを作成して、ユーザーをグループ化します。

`AUTH_ENABLED=true` を設定します（ログインなしの個人利用の場合は `false`）。

## スマートフォンで使う {#use-it-from-your-phone}

SnapOtter はモバイルブラウザで動作し、アプリとしてインストールすることもできます。スマートフォンでインスタンスを開き、次の操作を行います。

- **iPhone / iPad (Safari):** 共有をタップし、**ホーム画面に追加**を選びます。
- **Android (Chrome):** ブラウザのメニューを開き、**アプリをインストール**をタップします。

インストールしたアプリは独自のウィンドウで開き、そのままインスタンスに接続します。

注意点が 1 つあります。ブラウザがインストールのプロンプトを表示するのは HTTPS の場合のみです。LAN 上のプレーンな HTTP アドレスでもブラウザのタブでは問題なく使えますが、実際にインストールするには、証明書付きのリバースプロキシの背後にインスタンスを置いてください（[デプロイガイド](/ja/guide/deployment)を参照）。

スマートフォンやタブレットでは、画像ツールのアップロードボタンの横に **写真を撮る** ボタンが表示されます。レシートやホワイトボードを撮影すると、そのままツールに取り込まれます。
