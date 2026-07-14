---
description: "SnapOtter の Docker イメージタグ、GPU ベンチマーク、バージョン固定、および AMD64 と ARM64 のマルチプラットフォーム対応。"
i18n_output_hash: 977a3cec4702
i18n_source_hash: fda322e78b4b
i18n_provenance: human
---

# Docker イメージ {#docker-image}

SnapOtter は単一の Docker イメージとして提供されます。単独で実行すると、ループバックインターフェイス上で組み込みの PostgreSQL 17 と Redis を起動します（組み込みモード）。本番環境では、Compose を使って別々の PostgreSQL 17 と Redis 8 のコンテナと並行して実行してください。アプリケーションイメージはすべてのプラットフォームで動作します。

## クイックスタート {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

`DATABASE_URL` を設定していない場合、これは組み込みモードで実行されます。PostgreSQL と Redis がコンテナ内のループバック上で起動し、すべてのデータは `SnapOtter-data` ボリューム配下に保存されます。外部サービスを使う場合は、（[Compose](#docker-compose) スタックが行っているように）`DATABASE_URL` と `REDIS_URL` を設定してください。[設定](/ja/guide/configuration#embedded-mode) を参照してください。

## NVIDIA CUDA アクセラレーション {#nvidia-cuda-acceleration}

イメージには amd64 上での NVIDIA CUDA サポートが含まれています。[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) をインストールした NVIDIA GPU を使用している場合は、`--gpus all` を追加してください:

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

イメージは実行時に CUDA を自動検出します。`--gpus all` を指定しない場合、または CUDA が利用できない場合、AI ツールは CPU 上で実行されます。どちらの場合も同じイメージです。

VA-API、Quick Sync、または OpenCL を通じた Intel/AMD の iGPU アクセラレーションは、現時点では SnapOtter の AI 推論には対応していません。`/dev/dri` をコンテナにマッピングすればレンダーデバイスを公開できますが、CUDA が利用可能でない限り、AI ランタイムは引き続き CPU を使用します。

### ベンチマーク {#benchmarks}

572x1024 の JPEG ポートレートを使い、NVIDIA RTX 4070（12 GB VRAM）でテストしました。

#### ウォーム時の性能 {#warm-performance}

| ツール | CPU | GPU | 高速化 |
|------|-----|-----|---------|
| 背景除去 (u2net) | 2,415ms | 879ms | 2.7x |
| 背景除去 (isnet) | 2,457ms | 1,137ms | 2.2x |
| 2x アップスケール | 350ms | 309ms | 1.1x |
| 4x アップスケール | 910ms | 310ms | 2.9x |
| 顔ぼかし | 139ms | 122ms | 1.1x |

#### コールドスタート（コンテナ起動後の最初のリクエスト） {#cold-start-first-request-after-container-start}

| ツール | CPU | GPU | 高速化 |
|------|-----|-----|---------|
| 背景除去 | 22,286ms | 4,792ms | 4.7x |
| 2x アップスケール | 3,957ms | 2,318ms | 1.7x |

OCR は、CUDA の比較には含まれません。組み込みの Tesseract 層とオプションの RapidOCR/ONNX 層は両方とも、コンテナーに NVIDIA GPU アクセス権がある場合を含め、CPU を使用します。

### CUDA ヘルスチェック {#cuda-health-check}

最初の AI リクエストの後、管理者向けヘルスエンドポイントが CUDA GPU のステータスを報告します:

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

完全な Compose スタックには、アプリ、PostgreSQL 17、Redis 8 が含まれます。完全な `docker-compose.yml` については [デプロイ](/ja/guide/deployment) を参照してください。最小限の例:

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

Docker Compose 経由の NVIDIA CUDA アクセラレーションには、SnapOtter サービスに deploy セクションを追加してください:

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
| `1.11.0` | 正確なバージョン |
| `1.11` | 1.11.x の最新パッチ |
| `1` | 1.x の最新マイナー |

## プラットフォーム {#platforms}

| アーキテクチャ | GPU サポート | 備考 |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI ツールの完全な CUDA アクセラレーション |
| linux/arm64 | CPU のみ | Raspberry Pi 4/5、Docker Desktop 経由の Apple Silicon |

## 以前のタグからの移行 {#migration-from-previous-tags}

`:cuda` タグを使用していた場合は、`:latest` に切り替えて `--gpus all` をそのまま使用してください。GPU サポートは同じで、統合されたイメージです。

データと設定はボリューム内に保持されます。
