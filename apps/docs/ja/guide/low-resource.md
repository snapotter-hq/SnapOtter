---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 66eba29afc81
---
# 低リソース環境のセットアップ {#low-resource-setups}

SnapOtter は小さなハードウェアでも快適に動作します。Raspberry Pi 4 や 5、古いラップトップ、2 GB の VPS などです。このページはそうしたマシンのための実践ガイドです。何が期待できるか、無理のない上限を設定したコピー＆ペーストで使えるセットアップ、そしてどの機能を見送るべきかを扱います。これらの数値の裏付けとなる完全なベンチマークデータは [ハードウェア要件](/ja/guide/deployment#hardware-requirements) にあります。

まず、2 つの厳しい制約があります。

- **64 ビットのみ。** イメージは `linux/amd64` と `linux/arm64` 向けにビルドされています。32 ビット ARM（`armv7`/`armhf`）はサポートされないため、初代 Pi と Pi Zero ファミリーは対象外です。
- **メモリの下限は 2 GB。** 512 MB ではスタックを起動できず、1 GB では複数ファイルのバッチで失敗します。2 コアと 2 GB が、余裕を持って動作する最小構成です。

## 小さなハードウェアで快適に動くもの {#what-runs-well}

AI 以外のすべてのツールは 2 GB / 2 コアのマシンで動作します。画像とファイルのセクション全体、PDF ツール、そしてストリームコピーのビデオ・オーディオ操作（トリミング、ミュート、コンテナのリマックス）です。ほとんどは 1 秒未満で完了します。

例外となるワークロードは 2 つです。

- **ビデオの再エンコード**（コーデック間の変換）は CPU に依存します。高速なデスクトップ CPU で約 40 秒かかる 1080p のクリップは、Pi クラスの CPU では数分かかることがあります。ストリームコピーの操作は引き続き一瞬で終わります。
- **AI ツール**には RAM（4 GB 推奨）とディスク（大きなバンドルは 1 つあたり 4〜5 GB）が必要で、重いもの（アップスケーリング、写真の復元、背景除去）は Pi クラスの CPU では現実的ではありません。顔検出や OCR のような軽い AI は、そのためのメモリがあれば利用できます。

どちらも使わない限りインストールも実行もされません。AI バンドルを何もインストールしていなければアプリはアイドル時に約 360 MB で動作し、AI バンドルは管理者が有効化したときにのみダウンロードされます。

## Raspberry Pi / 古いラップトップでの手順 {#walkthrough}

これは [はじめに](/ja/guide/getting-started) の標準的な Compose インストールに、リソース制限と控えめな上限を加えたものです。64 ビット OS を前提としています（Pi の場合: Raspberry Pi OS 64-bit または Ubuntu Server arm64）。

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi クラスのマシン向けの注意点:

- **データボリュームと Postgres には SD カードより USB SSD を優先してください。** ジョブのワークスペースは実際にディスク IO を行い、SD カードは遅いうえに摩耗も早いためです。
- **オールインワンの単一コンテナもここで動作します**（`DATABASE_URL`/`REDIS_URL` が未設定のときに組み込みの Postgres と Redis が使われます）。メモリに余裕のないホストでは、`REDIS_MAXMEMORY` で組み込み Redis の上限を下げてください（[設定](/ja/guide/configuration) を参照）。Compose のほうがサービスごとの細かい制御ができるため、この手順では Compose を使っています。
- **2 GB のデバイスにはスワップを追加してください。** 時折のスパイク（大きな PDF、上限をかけ忘れたバッチ）がアウトオブメモリのキルで終わるのを防ぎます。zram は SD カードにやさしい選択肢です。
- arm64 イメージは CPU のみです。ARM ボードに CUDA はありません。

## チューニング項目 {#tuning-knobs}

上限はすべて環境変数で、[設定](/ja/guide/configuration) に完全なドキュメントがあります。`0` は無制限または自動を意味します。小さなハードウェアで重要なのは次のとおりです。

| 変数 | 小型マシンでの推奨値 | 何を守るか |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | 並列で実行されるジョブの数。自動検出は CPU コア数マイナス 1 を使います。大きなマシンでは適切ですが、メモリが厳しい 2 コアのマシンには積極的すぎます。 |
| `MAX_WORKER_THREADS` | `2` | 画像処理のスレッドプール。 |
| `MAX_BATCH_SIZE` | `5` | 1〜2 GB のマシンが最初にメモリ不足に陥るのはバッチです。 |
| `MAX_UPLOAD_SIZE_MB` | `100` | 1 つの巨大なファイルがワークスペース全体を占有するのを防ぎます。 |
| `MAX_MEGAPIXELS` | `50` | 100 MP 超の画像のデコードは、ファイルサイズに関係なく RAM を消費します。 |
| `MAX_VIDEO_DURATION_S` | `300` | 長いトランスコードは、小さな CPU を数分から数時間占有します。 |
| `PROCESSING_TIMEOUT_S` | `600` | 暴走したジョブでも最終的にはマシンを解放させるための強制的な上限です。 |

これらの上限はサーバーが受け付けるものに適用されるため、できるだけ小さくするのではなく、実際の用途に合わせて設定してください。ビデオをまったく扱わないなら `MAX_VIDEO_DURATION_S` の上限にコストはありません。毎日ドキュメントをスキャンするなら、`MAX_PDF_PAGES` に上限をかけないでください。

## 見送るべきもの {#what-to-skip}

- **重い AI バンドル。** アップスケーリング、写真の復元、背景除去は GPU か高速なメニーコア CPU を必要とし、各バンドルはディスクを 4〜5 GB 消費します。小さなマシンでは、そもそもインストールしないでください。バンドルがないツールは、実行される代わりにインストールを促す画面を表示します。
- **日常的なワークロードとしてのビデオ再エンコード。** 時折のトランスコードは問題ありません（単に遅いだけです）。継続的なトランスコードのキューに必要なのは CPU コアであって、Pi ではありません。
- **使わないツール全般。** 管理者は Settings で個々のツールを無効にでき、無効にしたツールは UI から消え、その API ルートも登録されなくなります。それ自体でメモリが節約されるわけではありませんが、共有の小さなインスタンスが、ハードウェアには耐えられない唯一のワークロードのために使われてしまうのを防げます。

後でインスタンスをより大きなハードウェアに移す場合は、上限を外せば（`0` に戻せば）、同じデータボリュームをそのまま引き継げます。
