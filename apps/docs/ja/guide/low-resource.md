---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: e373edfd9537
i18n_hash_version: 2
---
# 低リソース環境のセットアップ {#low-resource-setups}

SnapOtter は小規模なハードウェアでも快適に動作します。Raspberry Pi 4 または 5、古いノート PC、2 GB の VPS などです。このページは、そうしたマシン向けの実践的なガイドです。想定される動作、適切な上限を設定したコピー＆ペースト用のセットアップ、スキップすべき機能を説明します。これらの数値の元になった詳細なベンチマークデータは、[ハードウェア要件](/ja/guide/deployment#hardware-requirements)にあります。

最初に、2 つの厳しい制約があります。

- **64 ビットのみ。** イメージは `linux/amd64` と `linux/arm64` 向けにビルドされています。32 ビット ARM（`armv7`/`armhf`）はサポートされないため、初代の Pi や Pi Zero シリーズは対象外です。
- **メモリは最低 2 GB（AI 以外のツール）。** 512 MB ではスタックを起動できず、1 GB では複数ファイルのバッチで失敗します。AI 以外のツールを快適に動かせる最小構成は、2 コアで 2 GB です。

## 小規模なハードウェアで快適に動くもの {#what-runs-well}

AI 以外のツールはすべて、2 GB / 2 コアのマシンで動作します。画像とファイルのセクション全体、PDF ツール、ストリームコピーによる動画と音声の操作（トリミング、ミュート、コンテナの再マルチプレックス）が含まれます。ほとんどは 1 秒未満で終わります。

次の 2 つのワークロードは例外です。

- **動画の再エンコード**（コーデック間の変換）は CPU に依存します。高速なデスクトップ CPU で約 40 秒かかる 1080p のクリップは、Pi クラスの CPU では数分かかることがあります。ストリームコピーの操作は引き続き一瞬で終わります。
- **AI ツール**には、バンドルごとの CPU メモリの下限があります。顔検出と組み込みの高速 OCR にはホスト RAM 2 GB（空き 0.5 GB）、高精度 OCR には設定上の実効メモリ 4 GiB、文字起こし、オブジェクト消去とカラー化、背景除去、アップスケールと補正、写真の復元にはホスト RAM 4 GB（空き 2 から 3 GB）、高品質インペインティングにはホスト RAM 8 GB（空き 6 GB）が必要です。2 GB のマシンでは、Whisper、RealESRGAN、rembg、LaMa を OOM キルなしで実行できません。そのため SnapOtter は、Python サイドカーに処理を渡す前に空きメモリを確認し、バンドルの下限を下回る場合は直ちに実行を拒否します。

どちらも、使わない限りインストールも実行もされません。AI バンドルがインストールされていなければ、アプリはアイドル時に約 360 MB で動作し、AI バンドルは管理者が有効にしたときにのみダウンロードされます。

## Raspberry Pi / 古いノート PC での手順 {#walkthrough}

これは[はじめに](/ja/guide/getting-started)の標準的な Compose インストールに、リソース制限と控えめな上限を加えたものです。64 ビットの OS を前提としています（Pi の場合は Raspberry Pi OS 64-bit または Ubuntu Server arm64）。

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi クラスのマシンに関する注意点:

- データボリュームと Postgres には、SD カードよりも **USB SSD を使うことをお勧めします**。ジョブのワークスペースでは実際にディスク IO が発生し、SD カードは遅い上に摩耗も早いためです。
- **オールインワンの単一コンテナもここで動作します**（`DATABASE_URL`/`REDIS_URL` が未設定の場合は、組み込みの Postgres と Redis を使用）。メモリが限られたホストでは、`REDIS_MAXMEMORY` で組み込み Redis の上限を下げてください（[設定](/ja/guide/configuration)を参照）。Compose ならサービスごとにきめ細かく制御できるため、この手順では Compose を使っています。
- **2 GB のデバイスではスワップを追加してください。** 大きな PDF や上限を設定し忘れたバッチなどで一時的に負荷が急増しても、メモリ不足によるキルを避けられます。SD カードに優しい方法は zram です。
- arm64 イメージは CPU のみです。ARM ボードでは CUDA は使えません。

## チューニング項目 {#tuning-knobs}

上限はすべて環境変数で、詳細は[設定](/ja/guide/configuration)に記載されています。`0` は無制限または自動を意味します。小規模なハードウェアで重要なものは次のとおりです。

| 変数 | 小規模マシン向けの推奨値 | 保護する対象 |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | 並列で実行するジョブの数。自動検出では CPU コア数から 1 を引いた値を使います。大きなマシンでは問題ありませんが、メモリに余裕のない 2 コアのマシンでは過剰です。 |
| `MAX_WORKER_THREADS` | `2` | 画像処理のスレッドプール。 |
| `MAX_BATCH_SIZE` | `5` | 1 から 2 GB のマシンでは、まずバッチでメモリが不足します。 |
| `MAX_UPLOAD_SIZE_MB` | `100` | 巨大なファイル 1 つがワークスペース全体を占有するのを防ぎます。 |
| `MAX_MEGAPIXELS` | `50` | 100 MP を超える画像のデコードは、ファイルサイズにかかわらず RAM を消費します。 |
| `MAX_VIDEO_DURATION_S` | `300` | 長時間のトランスコードは、小さな CPU を数分から数時間占有します。 |
| `PROCESSING_TIMEOUT_S` | `600` | 暴走したジョブがいずれマシンを解放するための厳格な上限。 |

これらの上限はサーバーが受け付ける内容に適用されます。できるだけ小さくするのではなく、実際の使い方に合わせて設定してください。動画をまったく使わないなら `MAX_VIDEO_DURATION_S` の上限は問題になりませんが、毎日ドキュメントをスキャンするなら `MAX_PDF_PAGES` に上限を設けないでください。

## スキップすべきもの {#what-to-skip}

- **重い AI バンドル。** アップスケール、写真の復元、背景除去には、GPU か高速なマルチコア CPU が必要で、各バンドルは 4 から 5 GB のディスクを消費します。小規模なマシンでは、インストールしないでください。バンドルがないツールは、実行される代わりにインストールを促す表示になります。
- **日常的なワークロードとしての動画の再エンコード。** たまにトランスコードする程度なら問題ありません（遅いだけです）。しかし、継続的なトランスコードのキューには Pi ではなく CPU コアが必要です。
- **使わないツール全般。** 管理者は Settings で個々のツールをオフにでき、UI から削除され、API ルートも登録されなくなります。それだけではメモリは節約できませんが、共有の小規模なインスタンスが、ハードウェアが対応できない用途に使われるのを防げます。

後でインスタンスをより大きなハードウェアに移す場合は、上限を削除して（`0` に戻します）、同じデータボリュームをそのまま引き継げます。
