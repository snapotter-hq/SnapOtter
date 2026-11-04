---
description: "SnapOtter の Docker イメージタグ、GPU ベンチマーク、バージョン固定、AMD64 と ARM64 のマルチプラットフォーム対応について説明します。"
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 1a88dbc7d221
i18n_hash_version: 2
---

# Docker イメージ {#docker-image}

SnapOtter は単一の Docker イメージとして提供されます。単体で実行すると、組み込みの PostgreSQL 17 と Redis がループバックインターフェースで起動します（組み込みモード）。本番環境では、Compose を使って PostgreSQL 17 と Redis 8 を別々のコンテナで併用してください。アプリイメージはすべてのプラットフォームで動作します。

## クイックスタート {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

`DATABASE_URL` を設定しない場合は組み込みモードで動作します。PostgreSQL と Redis がコンテナ内のループバックで起動し、すべてのデータは `SnapOtter-data` ボリューム配下に保存されます。外部サービスを使うには、（[Compose](#docker-compose) スタックと同様に）`DATABASE_URL` と `REDIS_URL` を設定してください。[設定](/ja/guide/configuration#embedded-mode)を参照してください。

## NVIDIA CUDA アクセラレーション {#nvidia-cuda-acceleration}

このイメージは amd64 で NVIDIA CUDA に対応しています。NVIDIA GPU があり、[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) をインストール済みの場合は、`--gpus all` を追加します。

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

イメージは実行時に CUDA を自動検出します。`--gpus all` がない場合や CUDA が利用できない場合、AI ツールは CPU で実行されます。どちらの場合も同じイメージを使います。

VA-API、Quick Sync、OpenCL による Intel/AMD の iGPU アクセラレーションは、現在 SnapOtter の AI 推論ではサポートされていません。`/dev/dri` をコンテナにマッピングするとレンダーデバイスを公開できますが、CUDA が利用できない限り AI ランタイムは CPU を使用します。

### ベンチマーク {#benchmarks}

NVIDIA RTX 4070（VRAM 12 GB）で、572x1024 の JPEG ポートレートを使ってテストしました。

#### ウォーム時のパフォーマンス {#warm-performance}

| ツール | CPU | GPU | 高速化率 |
|------|-----|-----|---------|
| 背景除去 (u2net) | 2,415ms | 879ms | 2.7x |
| 背景除去 (isnet) | 2,457ms | 1,137ms | 2.2x |
| 2倍アップスケール | 350ms | 309ms | 1.1x |
| 4倍アップスケール | 910ms | 310ms | 2.9x |
| 顔のぼかし | 139ms | 122ms | 1.1x |

#### コールドスタート（コンテナ起動後の最初のリクエスト） {#cold-start-first-request-after-container-start}

| ツール | CPU | GPU | 高速化率 |
|------|-----|-----|---------|
| 背景除去 | 22,286ms | 4,792ms | 4.7x |
| 2倍アップスケール | 3,957ms | 2,318ms | 1.7x |

OCR は CUDA の比較に含まれていません。組み込みの Tesseract ティアも、オプションの RapidOCR/ONNX ティアも、コンテナが NVIDIA GPU にアクセスできる場合を含め、CPU を使用します。

### CUDA ヘルスチェック {#cuda-health-check}

最初の AI リクエストの後、管理者用ヘルスエンドポイントが CUDA GPU の状態を報告します。

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

完全な Compose スタックには、アプリ、PostgreSQL 17、Redis 8 が含まれます。完全な `docker-compose.yml` は[デプロイ](/ja/guide/deployment)を参照してください。最小限の例を示します。

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Docker Compose で NVIDIA CUDA アクセラレーションを使うには、SnapOtter サービスに deploy セクションを追加します。

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## バージョン固定 {#version-pinning}

| タグ | 説明 |
|-----|------------|
| `latest` | 最新リリース |
| `2.2.0` | 正確なバージョン |
| `2.2` | 2.2.x の最新パッチ |
| `2` | 2.x の最新マイナー |

## プラットフォーム {#platforms}

| アーキテクチャ | GPU サポート | 備考 |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI ツールで CUDA を完全にアクセラレーション |
| linux/arm64 | CPU のみ | Raspberry Pi 4/5、Docker Desktop 経由の Apple Silicon |

## 以前のタグからの移行 {#migration-from-previous-tags}

`:cuda` タグを使っていた場合は、`:latest` に切り替えて `--gpus all` を維持してください。GPU サポートは同じで、イメージは統一されています。

データと設定はボリュームに保持されます。
