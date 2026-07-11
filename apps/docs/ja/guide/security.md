---
description: "SnapOtter のセキュリティ強化ガイド。コンテナのセキュリティ、ネットワーク分離、Docker シークレット、Kubernetes デプロイ、コンプライアンス成果物を扱います。"
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: eeed28f9ef0c
---

# セキュリティと強化 {#security-hardening}

SnapOtter はファイルを完全にあなたのインフラ上で処理します。プロジェクトの改善に役立てるため、デフォルトで匿名かつ内容を含まないプロダクトアナリティクスとクラッシュレポートを送信します。あなたのファイル、ファイル名、ファイルの内容、OCR の出力、画像のメタデータ、ドキュメントのテキストを送信することは決してありません。任意のフィードバックは、ユーザーが送信したときにのみ、かつアナリティクスが有効な場合にのみ送信され、連絡先フィールドは明示的な連絡先の同意がある場合にのみ含まれます。管理者は Settings > System > Privacy でアナリティクスとフィードバック収集をワンクリックでオフにでき、リビルドは不要です。ファイル処理は常にコンテナ内に留まります。

コンテナは専用の非 root ユーザー（`snapotter`）として実行され、必要最小限のセットを除くすべての Linux capability が削除されています。完全な脆弱性開示ポリシーとセキュリティアーキテクチャについては、GitHub の [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) を参照してください。

## コンテナの強化 {#container-hardening}

[デフォルトの docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) には本番向けのセキュリティ強化が含まれています。各オプションの内訳と、なぜそれが重要なのかを以下に示します：

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
    restart: unless-stopped

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
      start_period: 15s

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
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### なぜ `no-new-privileges` を設定しないのか {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` は意図的に省略されています。エントリーポイントはボリュームの所有権を修正するために root として起動し、その後 [gosu](https://github.com/tianon/gosu) を介して `snapotter` ユーザーに降格します。gosu には setuid が必要です。権限の降格が完了すると、プロセスは上記の 5 つを除くすべての capability が削除された状態で `snapotter` として実行されます。

Kubernetes や Docker の `--user` フラグを使って（gosu を回避して）直接非 root として実行する場合は、`no-new-privileges` を有効にしても安全です。

### なぜ `read_only` を設定しないのか {#why-read-only-is-not-set}

`read_only: true` を設定しないのは、PUID/PGID の再マッピングが起動時に `/etc/passwd` と `/etc/group` に書き込むためです。PUID/PGID の代わりに Docker の `--user` フラグや Kubernetes の `runAsUser` を使う場合は、読み取り専用のルートファイルシステムを安全に有効にできます。

## ネットワーク分離 {#network-isolation}

通常の運用中、コンテナは **アウトバウンドのネットワーク接続をまったく行いません**。すべてのファイル処理は同梱のライブラリを使ってローカルで行われます。

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

唯一の例外は **AI モデルのダウンロード** です。ユーザーが UI から AI 機能バンドルをインストールすると、コンテナは Hugging Face から事前ビルド済みのバンドルアーカイブをダウンロードし、加えて GitHub Releases、Google Storage、PyPI からいくつかの個別モデルファイルをダウンロードします。これらのダウンロードはバンドルごとに一度だけ行われ、`/data` ボリュームに保存されます。

**ファイアウォールの推奨事項：**

| シナリオ | アウトバウンドルール |
|---|---|
| エアギャップ（AI なし） | コンテナからのすべてのアウトバウンドトラフィックをブロックする |
| AI バンドルが必要 | インストール中は `huggingface.co`、`*.xethub.hf.co`、`cdn-lfs.huggingface.co`、`github.com`、`objects.githubusercontent.com`、`storage.googleapis.com`、`pypi.org`、`files.pythonhosted.org` への HTTPS を許可し、その後ブロックする |
| AI インストール後 | すべてのアウトバウンドトラフィックをブロックする。モデルはローカルにキャッシュされている |

バンドルアーカイブは Hugging Face の Xet ストレージから配信されます。これは `*.xethub.hf.co` エンドポイント経由で並列に転送され、数 GB のバンドルダウンロードを高速化するものです。ファイアウォールが `huggingface.co` を許可しても `*.xethub.hf.co` をブロックする場合、インストールは成功しますが、より遅い単一ストリームのダウンロードにフォールバックします。そのため、高速な経路を維持するには Xet ホストを許可リストに入れてください。完全にオフラインのインストールでは、これらすべてを省略して代わりに [オフラインバンドルのインポート](/ja/guide/deployment) を使えます。

リバースプロキシの設定（Nginx、Traefik、Caddy、Cloudflare Tunnels）については、[デプロイガイド](/ja/guide/deployment#reverse-proxy) を参照してください。

## Docker シークレット {#docker-secrets}

本番デプロイでは、シークレットを平文の環境変数として渡すことは避けてください。エントリーポイントは Docker の `_FILE` 規約をサポートしています。シークレットをファイルとしてマウントし、対応する `_FILE` 変数にそのパスを設定します。

**サポートされるシークレット：**

| 変数 | `_FILE` に相当 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose のシークレットを使った例：**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Docker Compose のシークレット（Swarm なし）には Compose v2.23 以降が必要です。
:::

## Kubernetes デプロイ {#kubernetes-deployment}

エントリーポイントは、コンテナがすでに非 root として実行されている（たとえば Kubernetes の `runAsUser` 経由）ことを検出し、gosu の権限降格を自動的にスキップします。その場合、自らマウントされたボリュームを chown できないため、書き込み可能かどうかを検証し、書き込めない場合は実行可能なガイダンスを出して早期に終了します。`fsGroup` や外来 UID の構成（TrueNAS、OpenShift）については [ストレージの権限](/ja/guide/deployment#storage-permissions) を参照してください。

**推奨される Pod の SecurityContext：**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

`runAsUser: 999` が Pod レベルで設定されているため、エントリーポイントは gosu を完全にスキップします。これにより、`allowPrivilegeEscalation: false` と `drop: [ALL]` の capability を競合なしに使えます。

リソースのサイジングについては、[ハードウェア要件](/ja/guide/deployment#hardware-requirements) を参照してください。

## バックアップとリカバリ {#backup-and-recovery}

永続的な状態は 2 つのボリュームに分かれています：

| ボリューム | 内容 | 重要か？ |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL データベース（ユーザー、設定、パイプライン、ジョブ、監査ログ） | はい |
| `/data`（アプリボリューム） | ユーザーがアップロードしたファイル、AI モデル、Python venv | 部分的（下記参照） |

`/data` ボリューム内：

| パス | 内容 | 重要か？ |
|---|---|---|
| `/data/uploads/`、`/data/outputs/` | ユーザーファイルと処理結果 | はい |
| `/data/ai/` | ダウンロードされた AI モデルファイル | いいえ（再ダウンロード可能） |
| `/data/venv/` | Python 仮想環境 | いいえ（起動時に再構築される） |

### データベースのバックアップ {#database-backup}

スタックの稼働中にデータベースをバックアップするには `pg_dump` を使います：

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

あるいは、スタックを停止して `SnapOtter-pgdata` ボリュームのスナップショットを取ります：

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### ユーザーファイルのバックアップ {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

AI モデルは全バンドルで合計およそ 24 GB になります。再ダウンロード可能なので、容量を節約するにはバックアップから `/data/ai/` と `/data/venv/` を除外してください。重要なのはデータベースとユーザーファイルだけです。

## コンプライアンス成果物 {#compliance-artifacts}

各 SnapOtter リリースには以下のセキュリティ成果物が含まれます：

| 成果物 | 形式 | 入手先 |
|---|---|---|
| SBOM（CycloneDX） | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) のアセット: `snapotter-v{version}-sbom.cdx.json` |
| SBOM（SPDX） | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) のアセット: `snapotter-v{version}-sbom.spdx.json` |
| 脆弱性スキャン | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) のアセット: `snapotter-v{version}-trivy.json` |
| 脆弱性スキャン | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) タブ |
| 静的解析 | CodeQL（JS/TS + Python） | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) タブ。週次 + PR ごとに実行 |
| 依存関係レビュー | GitHub ネイティブ | PR ごとのチェック。高深刻度の追加で失敗する |
| Python 依存関係監査 | pip-audit | すべてのプッシュで CI 実行ログ |
| セキュリティポリシー | Markdown | リポジトリ内の [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 依存関係の更新 | Dependabot | npm、pip、Docker、Actions 向けの自動化された週次 PR |

**独自のスキャンを実行する：**

リリースから SBOM をダウンロードし、お好みのツールでスキャンします：

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM と脆弱性スキャンは、そのリリース向けに公開された正確なイメージを反映します。デプロイ後にインストールされる AI モデルバンドルは実行時にダウンロードされるため、SBOM には含まれません。
:::
