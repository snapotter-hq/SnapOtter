---
description: SnapOtterのセキュリティ強化ガイド。コンテナセキュリティ、ネットワーク分離、Dockerシークレット、Kubernetesデプロイ、コンプライアンス成果物。
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: e71d62cc0f53
---

# セキュリティと強化 {#security-hardening}

SnapOtterはファイルを完全にご自身のインフラ上で処理します。プロジェクトの改善に役立てるため、デフォルトで匿名かつコンテンツを含まない製品アナリティクスとクラッシュレポートを送信します。ファイル、ファイル名、ファイル内容、OCR出力、画像メタデータ、ドキュメントテキストを送信することは決してありません。任意のフィードバックは、ユーザーが送信した後にのみ、アナリティクスが有効な場合にのみ送信され、連絡先フィールドは明示的な連絡先の同意がある場合にのみ含まれます。管理者は、Settings > System > Privacyでワンクリックでアナリティクスとフィードバック収集をオフにできます。再ビルドは不要です。ファイル処理は常にコンテナ内で完結します。

コンテナは、必要最小限のセットを除くすべてのLinux capabilityを削除した、専用の非rootユーザー(`snapotter`)として実行されます。脆弱性開示ポリシーとセキュリティアーキテクチャの全文については、GitHubの[SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)を参照してください。

## コンテナの強化 {#container-hardening}

[デフォルトのdocker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml)には本番向けのセキュリティ強化が含まれています。各オプションの内訳と、なぜそれが重要かを次に示します:

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

### なぜ`no-new-privileges`が設定されないのか {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]`は意図的に省略されています。エントリポイントはボリュームの所有権を修正するためにrootとして起動し、その後[gosu](https://github.com/tianon/gosu)を介して`snapotter`ユーザーに切り替わりますが、これにはsetuidが必要です。権限の切り替えが完了すると、プロセスは上記の5つを除くすべてのcapabilityが削除された状態で`snapotter`として実行されます。

Kubernetesまたはdockerの`--user`フラグを使用して(gosuを迂回して)直接非rootで実行する場合は、`no-new-privileges`を安全に有効化できます。

### なぜ`read_only`が設定されないのか {#why-read-only-is-not-set}

`read_only: true`が設定されないのは、PUID/PGIDの再マッピングが起動時に`/etc/passwd`と`/etc/group`へ書き込みを行うためです。PUID/PGIDの代わりにDockerの`--user`フラグまたはKubernetesの`runAsUser`を使用する場合は、読み取り専用ルートファイルシステムを安全に有効化できます。

## ネットワーク分離 {#network-isolation}

通常の運用中、コンテナは**アウトバウンドのネットワーク接続を一切行いません**。すべてのファイル処理は、バンドルされたライブラリを使用してローカルで行われます。

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

唯一の例外は**AIモデルのダウンロード**です。ユーザーがUIを通じてAI機能バンドルをインストールすると、コンテナはGitHub ReleasesおよびPyPIからモデルファイルをダウンロードします。これらのダウンロードはバンドルごとに一度だけ行われ、`/data`ボリュームに保存されます。

**ファイアウォールの推奨事項:**

| シナリオ | アウトバウンドルール |
|---|---|
| エアギャップ(AIなし) | コンテナからのすべてのアウトバウンドトラフィックをブロック |
| AIバンドルが必要 | インストール中は`github.com`、`objects.githubusercontent.com`、`pypi.org`、`files.pythonhosted.org`へのHTTPSを許可し、その後ブロック |
| AIインストール後 | すべてのアウトバウンドトラフィックをブロック。モデルはローカルにキャッシュされます |

リバースプロキシの設定(Nginx、Traefik、Caddy、Cloudflare Tunnels)については、[デプロイガイド](/ja/guide/deployment#reverse-proxy)を参照してください。

## Dockerシークレット {#docker-secrets}

本番デプロイでは、シークレットを平文の環境変数として渡すことを避けてください。エントリポイントはDockerの`_FILE`規約をサポートしています。シークレットをファイルとしてマウントし、対応する`_FILE`変数にそのパスを設定します。

**サポートされるシークレット:**

| 変数 | `_FILE`に相当 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Composeシークレットの例:**

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
Docker Composeシークレット(Swarmなし)にはCompose v2.23以降が必要です。
:::

## Kubernetesデプロイ {#kubernetes-deployment}

エントリポイントは、コンテナがすでに非rootで実行されている場合(例: Kubernetesの`runAsUser`経由)を検出し、gosuによる権限切り替えを自動的にスキップします。その場合、マウントされたボリュームを自身でchownできないため、書き込み可能かどうかを検証し、書き込み不可の場合は実行可能なガイダンスとともに早期終了します。`fsGroup`および外部UIDのセットアップ(TrueNAS、OpenShift)については[ストレージ権限](/ja/guide/deployment#storage-permissions)を参照してください。

**推奨されるPod SecurityContext:**

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

`runAsUser: 999`がPodレベルで設定されているため、エントリポイントはgosuを完全にスキップします。これにより、`allowPrivilegeEscalation: false`および`drop: [ALL]`capabilityを競合なく使用できます。

リソースのサイジングについては、[ハードウェア要件](/ja/guide/deployment#hardware-requirements)を参照してください。

## バックアップとリカバリ {#backup-and-recovery}

永続状態は2つのボリュームに分割されています:

| ボリューム | 内容 | 重要か? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQLデータベース(ユーザー、設定、パイプライン、ジョブ、監査ログ) | はい |
| `/data` (アプリボリューム) | ユーザーがアップロードしたファイル、AIモデル、Python venv | 部分的(下記参照) |

`/data`ボリューム内:

| パス | 内容 | 重要か? |
|---|---|---|
| `/data/uploads/`、`/data/outputs/` | ユーザーファイルと処理結果 | はい |
| `/data/ai/` | ダウンロードされたAIモデルファイル | いいえ(再ダウンロード可能) |
| `/data/venv/` | Python仮想環境 | いいえ(起動時に再ビルド) |

### データベースのバックアップ {#database-backup}

スタックの稼働中にデータベースをバックアップするには`pg_dump`を使用します:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

あるいは、スタックを停止して`SnapOtter-pgdata`ボリュームのスナップショットを取得します:

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

AIモデルは全バンドルで合計約24 GBに達します。再ダウンロード可能なため、容量を節約するにはバックアップから`/data/ai/`と`/data/venv/`を除外してください。重要なのはデータベースとユーザーファイルのみです。

## コンプライアンス成果物 {#compliance-artifacts}

各SnapOtterリリースには、次のセキュリティ成果物が含まれます:

| 成果物 | フォーマット | 入手先 |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)アセット: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)アセット: `snapotter-v{version}-sbom.spdx.json` |
| 脆弱性スキャン | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases)アセット: `snapotter-v{version}-trivy.json` |
| 脆弱性スキャン | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)タブ |
| 静的解析 | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security)タブ、毎週 + PRごとに実行 |
| 依存関係レビュー | GitHubネイティブ | PRごとのチェック、高深刻度の追加で失敗 |
| Python依存関係監査 | pip-audit | 毎プッシュのCI実行ログ |
| セキュリティポリシー | Markdown | リポジトリ内の[SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 依存関係の更新 | Dependabot | npm、pip、Docker、Actionsの週次自動PR |

**独自のスキャンの実行:**

リリースからSBOMをダウンロードし、お好みのツールでスキャンします:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOMと脆弱性スキャンは、そのリリースで公開された正確なイメージを反映します。デプロイ後にインストールされたAIモデルバンドルは、実行時にダウンロードされるためSBOMには含まれません。
:::
