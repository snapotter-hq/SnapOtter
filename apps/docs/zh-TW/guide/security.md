---
description: "SnapOtter 的安全強化指南。容器安全、網路隔離、Docker 密鑰、Kubernetes 部署以及合規產物。"
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 7fb808acf5b4
---

# 安全與強化 {#security-hardening}

SnapOtter 完全在您自己的基礎架構上處理檔案。它預設會傳送匿名、不含內容的產品分析與當機回報，以協助改善此專案。它絕不會傳送您的檔案、檔案名稱、檔案內容、OCR 輸出、影像中繼資料或文件文字。選用的意見回饋只有在使用者送出後才會傳送，且僅在啟用分析時傳送，聯絡欄位也僅在明確的聯絡同意下才會納入。管理員可在 Settings > System > Privacy 下一鍵關閉分析與意見回饋擷取，無需重新建置。檔案處理始終留在您的容器內。

容器以專屬的非 root 使用者（`snapotter`）執行，並移除除了最低必要集合以外的所有 Linux capabilities。完整的漏洞揭露政策與安全架構，請參閱 GitHub 上的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)。

## 容器強化 {#container-hardening}

[預設的 docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) 包含生產環境的安全強化設定。以下逐項說明各選項及其重要性：

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

### 為何未設定 `no-new-privileges` {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` 是刻意省略的。entrypoint 以 root 身分啟動以修正磁碟區擁有權，接著透過 [gosu](https://github.com/tianon/gosu) 降權至 `snapotter` 使用者，而這需要 setuid。降權完成後，程序會以 `snapotter` 身分執行，並移除除了上述五項以外的所有 capabilities。

若您使用 Kubernetes 或 Docker 的 `--user` 旗標直接以非 root 身分執行（略過 gosu），則可安全地啟用 `no-new-privileges`。

### 為何未設定 `read_only` {#why-read-only-is-not-set}

`read_only: true` 未設定，因為 PUID/PGID 重新對應會在啟動時寫入 `/etc/passwd` 與 `/etc/group`。若您使用 Docker 的 `--user` 旗標或 Kubernetes `runAsUser` 而非 PUID/PGID，則可安全地啟用唯讀根檔案系統。

## 網路隔離 {#network-isolation}

在正常運作期間，容器**不會建立任何對外網路連線**。所有檔案處理都在本機使用內建函式庫完成。

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

唯一的例外是 **AI 模型下載**：當使用者透過 UI 安裝 AI 功能套件包時，容器會從 GitHub Releases 與 PyPI 下載模型檔案。這些下載每個套件包只發生一次，並儲存在 `/data` 磁碟區中。

**防火牆建議：**

| 情境 | 對外規則 |
|---|---|
| 氣隙環境（無 AI） | 封鎖容器的所有對外流量 |
| 需要 AI 套件包 | 安裝期間允許 HTTPS 連至 `github.com`、`objects.githubusercontent.com`、`pypi.org`、`files.pythonhosted.org`，之後封鎖 |
| AI 安裝完成後 | 封鎖所有對外流量，模型已在本機快取 |

反向代理設定（Nginx、Traefik、Caddy、Cloudflare Tunnels），請參閱[部署指南](/zh-TW/guide/deployment#reverse-proxy)。

## Docker 密鑰 {#docker-secrets}

對於生產環境部署，請避免以純文字環境變數傳遞密鑰。entrypoint 支援 Docker 的 `_FILE` 慣例：將密鑰掛載為檔案，並將對應的 `_FILE` 變數設為其路徑。

**支援的密鑰：**

| 變數 | `_FILE` 對應 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**使用 Docker Compose 密鑰的範例：**

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
Docker Compose 密鑰（未使用 Swarm）需要 Compose v2.23 或更新版本。
:::

## Kubernetes 部署 {#kubernetes-deployment}

entrypoint 會偵測容器是否已以非 root 身分執行（例如透過 Kubernetes `runAsUser`），並自動略過 gosu 降權。在該情況下，它無法自行 chown 掛載的磁碟區，因此會驗證它們是否可寫入，若否則會提早結束並提供可行的指引，請參閱 [Storage permissions](/zh-TW/guide/deployment#storage-permissions) 以了解 `fsGroup` 與外部 UID 設定（TrueNAS、OpenShift）。

**建議的 Pod SecurityContext：**

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

由於 `runAsUser: 999` 是在 pod 層級設定，entrypoint 會完全略過 gosu。這讓 `allowPrivilegeEscalation: false` 與 `drop: [ALL]` capabilities 得以在無衝突的情況下使用。

資源規模調整，請參閱 [Hardware Requirements](/zh-TW/guide/deployment#hardware-requirements)。

## 備份與復原 {#backup-and-recovery}

持久性狀態分散在兩個磁碟區中：

| 磁碟區 | 內容 | 是否關鍵？ |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL 資料庫（使用者、設定、pipelines、jobs、稽核記錄） | 是 |
| `/data`（app 磁碟區） | 使用者上傳的檔案、AI 模型、Python venv | 部分（見下方） |

在 `/data` 磁碟區內：

| 路徑 | 內容 | 是否關鍵？ |
|---|---|---|
| `/data/uploads/`、`/data/outputs/` | 使用者檔案與處理結果 | 是 |
| `/data/ai/` | 已下載的 AI 模型檔案 | 否（可重新下載） |
| `/data/venv/` | Python 虛擬環境 | 否（啟動時重建） |

### 資料庫備份 {#database-backup}

在整個堆疊執行期間，使用 `pg_dump` 來備份資料庫：

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

或者，停止堆疊並快照 `SnapOtter-pgdata` 磁碟區：

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### 使用者檔案備份 {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

所有套件包的 AI 模型合計最多約 24 GB。由於它們可重新下載，請從備份中排除 `/data/ai/` 與 `/data/venv/` 以節省空間。只有資料庫與使用者檔案是關鍵的。

## 合規產物 {#compliance-artifacts}

每個 SnapOtter 版本都包含下列安全產物：

| 產物 | 格式 | 取得位置 |
|---|---|---|
| SBOM（CycloneDX） | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 資產：`snapotter-v{version}-sbom.cdx.json` |
| SBOM（SPDX） | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 資產：`snapotter-v{version}-sbom.spdx.json` |
| 漏洞掃描 | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 資產：`snapotter-v{version}-trivy.json` |
| 漏洞掃描 | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 分頁 |
| 靜態分析 | CodeQL（JS/TS + Python） | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 分頁，每週 + 每次 PR 執行 |
| 相依性審查 | GitHub 原生 | 每次 PR 檢查，在新增高嚴重性項目時失敗 |
| Python 相依性稽核 | pip-audit | 每次 push 的 CI 執行記錄 |
| 安全政策 | Markdown | 存放庫中的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 相依性更新 | Dependabot | 針對 npm、pip、Docker、Actions 的自動化每週 PR |

**執行您自己的掃描：**

從版本下載 SBOM，並以您偏好的工具掃描它：

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM 與漏洞掃描反映的是該版本所發布的確切映像。部署後安裝的 AI 模型套件包不包含在 SBOM 中，因為它們是在執行階段下載的。
:::
