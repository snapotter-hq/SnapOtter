---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: f3290dacec3f
---
# 1.x から 2.0 へのアップグレード {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x はすべてを 1 つの SQLite ファイルに保存し、単一のコンテナとして動作していました。SnapOtter 2.0 は PostgreSQL と Redis を使用します。このガイドでは、データを失わずに 1.x のインストールを 2.0 へ移行する手順を説明します。

要点はこうです。既存の `/data` ボリュームを再利用すれば、2.0 は初回起動時に 1.x のデータベースを自動的にインポートします。ユーザー、保存済みファイル、設定、API キー、パイプラインがそのまま引き継がれます。古いデータベースは一切変更されないため、いつでもロールバックできます。

::: tip 1.x ユーザーの皆さんへ
多くの方が初日から SnapOtter を信頼してくださり、その声がこのリリースを形づくりました。2.0 は内部で多くを変えていますが、このガイドは、皆さんが大切にしているものを一切失わずに移行できるよう用意されています。アカウント、ファイル、設定、API キー、パイプラインは引き継がれ、古いデータベースには手を触れません。一緒にアップグレードしてくださり、ありがとうございます。
:::

## 始める前に: `/data` ボリューム全体をバックアップする {#before-you-start-back-up-the-whole-data-volume}

これは毎回、最初に行ってください。`snapotter.db` ファイルだけでなく、**`/data` ボリューム全体**をバックアップします。

これが重要な理由を説明します。1.x は SQLite を WAL モードで動作させるため、停止した 1.x コンテナは、コミット済みデータの大半をほぼ空の `snapotter.db` の隣にある `snapotter.db-wal` に残すことが日常的にあります。`snapotter.db` だけをコピーすると空のデータベースを取り込むことになり、すべてを静かに失います。ボリュームは `snapotter.db`、`snapotter.db-wal`、`snapotter.db-shm`、そしてあなたの `files/` ディレクトリをまとめて保持しており、これらは 1 つのセットとして一緒に移動させる必要があります。

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## まず 1.17.2 にアップグレードする {#upgrade-to-1-17-2-first}

2.0 へ移行する前に、1.x のインストールを最新の 1.x リリース（1.17.2）へアップグレードしてください。そうすることで 1.x が自身の最終的なスキーマ移行を実行し、2.0 は既知の完全なスキーマからインポートできます。より古い 1.x から直接 2.0 へアップグレードすることはサポートされていません。

## ボリューム名を確認する {#check-your-volume-name}

インポーターは、2.0 スタックが 1.x のインストールで使用したのと同じボリュームをマウントしている場合にのみデータを認識します。Docker のボリューム名は大文字と小文字を区別し、古い README のスニペットは小文字の `snapotter-data` を使用していた一方で、Compose ファイルは `SnapOtter-data` を使用しています。どちらを使っているか確認してください:

```bash
docker volume ls | grep -i snapotter
```

2.0 の設定ではその正確な名前を使用してください。

## パス A: 単一コンテナ（最速） {#path-a-single-container-quickest}

SnapOtter を単一の `docker run` で実行している場合は、そのまま続けてください。2.0 は `DATABASE_URL` や `REDIS_URL` を設定していないと、コンテナ内で組み込みの PostgreSQL と Redis を起動し、初回起動時に `/data/snapotter.db` を自動検出してインポートします。

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

ログに次のような行が出るのを確認してください:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

これで完了です。既存の認証情報でログインしてください。

## パス B: Compose（本番環境で推奨） {#path-b-compose-recommended-for-production}

2.0 の Compose スタックは 3 つのサービス（app、Postgres、Redis）を実行します。app サービスには 1.x の `/data` ボリュームを再利用してください。app は `/data/snapotter.db` を自動検出し、初回起動時に Postgres へインポートします。

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

古いデータベースを明示的に指定したい場合は、`SQLITE_MIGRATE_PATH=/data/snapotter.db` を設定してください。明示的なパスは常に自動検出よりも優先されます。

## 先にインポートをプレビューする（任意） {#preview-the-import-first-optional}

何も書き込まずにインポートされる内容を正確に確認するには、データベースファイルに対してドライランを実行します:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

テーブルごとの行数、ディスク上で見つかった保存ライブラリファイルの数、正規化されるジョブステータスを表示します。Postgres の起動は不要です。

## 引き継がれるものと引き継がれないもの {#what-carries-over-and-what-does-not}

引き継がれるもの:

- ユーザー、およびログインできること。パスワードハッシュは変更されないため、同じユーザー名とパスワードが機能します。
- チーム、設定（インスタンスのアイデンティティを含む）、ロール、API キー（引き続き機能します）、保存済みパイプライン。
- ジョブ履歴レコード。
- 保存ファイルライブラリ。`/data/files` がボリューム上に保持されるため、レコードと実際のファイルの両方が引き継がれます。

引き継がれないもの:

- ログインセッション。アップグレード後は全員が一度サインインします。認証情報は変わらないため、単なる 1 回の再ログインに過ぎません。
- 古い処理ジョブの入力ファイルと出力ファイル。これらは一時的なワークスペースにあり、設計上失われます。ジョブ履歴レコードは残ります。
- 1.x のユーザーごとの分析同意フラグ。2.0 には対応するものがありません（2.0 の分析はインスタンスレベルの設定です）。

## インポートをオフにする {#turning-the-import-off}

ボリューム上に `snapotter.db` が存在していても意図的に新しいデータベースを使いたい場合は、`SQLITE_MIGRATE_PATH=off` を設定してください。

## 2.0 インスタンスに既にデータがある場合 {#if-you-already-have-data-in-the-2-0-instance}

インポーターは空のデータベースに対してのみ実行されます。2.0 を新規に起動してデータを作成し、後から古い `snapotter.db` をマウントした場合、2.0 はそれを検出しますが、2 つのデータセットのマージは ID の衝突を起こす可能性があるためインポートしません。ログに警告が表示されます。1.x データをインポートするには空のインスタンスが必要です:

- 2.0 インスタンスにデフォルトの管理者しか存在しない（実質的に使っていない）場合は、スタックを停止し、Postgres ボリューム（`SnapOtter-pgdata`）を削除し、古い `/data` が存在する状態で再起動してください。クリーンにインポートされます。これは 1.x データベースではなく、使い捨ての Postgres データのみを消去します。
- 2.0 インスタンスに保持したい実データがある場合、2 つのデータセットは自動マージできません。必要なものをエクスポートし、1.x データを別の新規デプロイにインポートしてください。

## ロールバック {#rolling-back}

アップグレードは 1.x の `snapotter.db` を変更したり削除したりすることはありません。1.x に戻す必要がある場合は、同じボリュームに対して 1.x イメージを再デプロイしてください。アップグレード後に 2.0 で作成したものは Postgres に存在し、1.x データベースには含まれないため、戻す場合は速やかに行ってください。
