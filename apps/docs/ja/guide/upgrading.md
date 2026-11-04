---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 09dc05d1db70
i18n_hash_version: 2
---
# 1.x から 2.0 へのアップグレード {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x はすべてを単一の SQLite ファイルに保存し、1 つのコンテナとして動作していました。SnapOtter 2.0 は PostgreSQL と Redis を使用します。このガイドでは、データを失わずに 1.x のインストールを 2.0 へ移行する手順を説明します。

要点は次のとおりです。既存の `/data` ボリュームを再利用すると、2.0 は初回起動時に 1.x のデータベースを自動的にインポートします。ユーザー、保存したファイル、設定、API キー、パイプラインが引き継がれます。古いデータベースは変更されないため、いつでもロールバックできます。

::: tip 1.x をお使いの皆さまへ
多くの方が最初の日から SnapOtter を信頼してくださり、そのフィードバックがこのリリースを形づくりました。2.0 は内部で多くが変わっているため、このガイドは、移行によって大切なものが失われないようにするためのものです。アカウント、ファイル、設定、API キー、パイプラインは引き継がれ、古いデータベースには一切手を加えません。ともにアップグレードしていただき、ありがとうございます。
:::

## 開始前に: `/data` ボリューム全体をバックアップする {#before-you-start-back-up-the-whole-data-volume}

毎回、最初にこれを行ってください。`snapotter.db` ファイルだけでなく、`/data` ボリューム**全体**をバックアップします。

これが重要な理由は次のとおりです。1.x は SQLite を WAL モードで実行しているため、停止した 1.x コンテナでは、コミット済みのデータの大半が、ほぼ空の `snapotter.db` の隣にある `snapotter.db-wal` に残っていることがよくあります。`snapotter.db` だけをコピーすると、空のデータベースを取得することになり、すべてが気づかないうちに失われます。ボリュームには `snapotter.db`、`snapotter.db-wal`、`snapotter.db-shm`、そして `files/` ディレクトリが一緒に含まれており、これらはひとまとまりで扱う必要があります。

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## まず 1.17.2 にアップグレードする {#upgrade-to-1-17-2-first}

2.0 に移行する前に、1.x のインストールを最新の 1.x リリース（1.17.2）にアップグレードしてください。これにより 1.x が最後のスキーママイグレーションを自身で実行でき、2.0 は既知の完全なスキーマからインポートできます。古い 1.x から直接 2.0 へアップグレードすることはサポートされていません。

## ボリューム名を確認する {#check-your-volume-name}

インポーターがデータを認識できるのは、2.0 スタックが 1.x のインストールで使っていたものと同じボリュームをマウントしている場合だけです。Docker のボリューム名は大文字と小文字を区別します。古い README のスニペットでは小文字の `snapotter-data` を使っていましたが、Compose ファイルでは `SnapOtter-data` を使っています。どちらを使っているか確認してください。

```bash
docker volume ls | grep -i snapotter
```

2.0 の設定には、その正確な名前を使ってください。

## パスA: 単一コンテナ（最も簡単） {#path-a-single-container-quickest}

SnapOtter を単一の `docker run` で実行している場合は、そのまま続けてください。`DATABASE_URL` や `REDIS_URL` を設定しなければ、2.0 はコンテナ内で組み込みの PostgreSQL と Redis を起動し、初回起動時に `/data/snapotter.db` を自動検出してインポートします。

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

ログで次のような行を確認してください。

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

これで完了です。既存の認証情報でログインしてください。

## パスB: Compose（本番環境に推奨） {#path-b-compose-recommended-for-production}

2.0 の Compose スタックは 3 つのサービス（アプリ、Postgres、Redis）を実行します。アプリサービスには 1.x の `/data` ボリュームを再利用してください。アプリは `/data/snapotter.db` を自動検出し、初回起動時に Postgres にインポートします。

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

古いデータベースを明示的に指定したい場合は、`SQLITE_MIGRATE_PATH=/data/snapotter.db` を設定してください。明示的なパスは常に自動検出より優先されます。

## 先にインポートをプレビューする（任意） {#preview-the-import-first-optional}

何も書き込まずに、インポートされる内容を正確に確認するには、データベースファイルに対してドライランを実行します。

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

テーブルごとの行数、ディスク上で見つかった保存済みライブラリのファイル数、正規化されるジョブのステータスが出力されます。実行中の Postgres は不要です。

## 引き継がれるもの、引き継がれないもの {#what-carries-over-and-what-does-not}

引き継がれるもの:

- ユーザーと、ログインできる状態。パスワードのハッシュは変更されないため、同じユーザー名とパスワードが使えます。
- チーム、設定（インスタンスの識別情報を含む）、ロール、API キー（引き続き動作します）、保存したパイプライン。
- ジョブ履歴の記録。
- 保存したファイルのライブラリ。`/data/files` はボリューム上に保持されるため、記録と実際のファイルの両方が引き継がれます。

引き継がれないもの:

- ログインセッション。アップグレード後に全員が一度サインインし直します。認証情報は変わらないため、再ログインは一度だけです。
- 過去の処理ジョブの入力ファイルと出力ファイル。これらは一時的なワークスペースにあり、設計上削除されます。ジョブ履歴の記録は残ります。
- 1.x のユーザーごとの分析同意フラグ。2.0 には対応するものがありません（2.0 の分析はインスタンス単位の設定です）。

## インポートをオフにする {#turning-the-import-off}

ボリューム上に `snapotter.db` があっても、意図的に新しいデータベースを使いたい場合は、`SQLITE_MIGRATE_PATH=off` を設定してください。

## 2.0 のインスタンスにすでにデータがある場合 {#if-you-already-have-data-in-the-2-0-instance}

インポーターは、空のデータベースに対してのみ実行されます。2.0 を新規に起動して（データを作成して）から、後で古い `snapotter.db` をマウントした場合、2.0 はそれを検出しますが、インポートは行いません。2 つのデータセットを統合すると ID が衝突する可能性があるためです。ログに警告が表示されます。1.x のデータをインポートするには、空のインスタンスが必要です。

- 2.0 のインスタンスにデフォルトの管理者しかない場合（実際にはまだ使っていない場合）は、スタックを停止し、Postgres ボリューム（`SnapOtter-pgdata`）を削除して、古い `/data` がある状態で再び起動してください。問題なくインポートされます。これで消去されるのは、一時的な Postgres のデータだけで、1.x のデータベースは消去されません。
- 2.0 のインスタンスに保持したい実際のデータがある場合、2 つのデータセットは自動的に統合できません。必要なものをエクスポートし、1.x のデータは別の新しいデプロイにインポートしてください。

## ロールバック {#rolling-back}

アップグレードで、1.x の `snapotter.db` が変更または削除されることはありません。1.x に戻す必要がある場合は、同じボリュームを使って 1.x のイメージを再デプロイしてください。アップグレード後に 2.0 で作成したものは Postgres にあり、1.x のデータベースには含まれません。ロールバックするなら、早めに行ってください。
