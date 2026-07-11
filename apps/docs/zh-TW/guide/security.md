---
description: "SnapOtter 的安全強化指南。容器安全、網路隔離、Docker secrets、Kubernetes 部署與合規產出物。"
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: c7ac676acc59
---

# 安全與強化 {#security-hardening}

SnapOtter 完全在你的基礎架構上處理檔案。它預設會傳送匿名、不含內容的產品分析與當機報告，以協助改善這個專案。它絕不會傳送你的檔案、檔案名稱、檔案內容、OCR 輸出、影像中繼資料或文件文字。選用的意見回饋只在使用者提交後、且僅在分析啟用時才會傳送，聯絡欄位也只在明確同意聯絡時才會包含。管理員可在 Settings > System > Privacy 底下一鍵關閉分析與意見回饋擷取，無需重新建置。檔案處理始終留在你的容器內。

容器以專屬的非 root 使用者（`snapotter`）執行，並卸除除最低必需集之外的所有 Linux capabilities。完整的漏洞揭露政策與安全架構，請參閱 GitHub 上的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)。

## 容器強化 {#container-hardening}

[預設的 docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) 包含正式環境安全強化。以下逐一說明每個選項及其重要性：

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

### 為何不設定 `no-new-privileges` {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` 是刻意省略的。進入點以 root 啟動以修正磁碟區擁有權，然後透過 [gosu](https://github.com/tianon/gosu) 降權至 `snapotter` 使用者，這需要 setuid。一旦降權完成，行程即以 `snapotter` 執行，並移除除上述五項之外的所有 capabilities。

如果你使用 Kubernetes 或 Docker 的 `--user` 旗標直接以非 root 執行（繞過 gosu），則 `no-new-privileges` 可安全啟用。

### 為何不設定 `read_only` {#why-read-only-is-not-set}

`read_only: true` 未設定，因為 PUID/PGID 重新對應會在啟動時寫入 `/etc/passwd` 和 `/etc/group`。如果你使用 Docker 的 `--user` 旗標或 Kubernetes `runAsUser` 而非 PUID/PGID，則可安全啟用唯讀根檔案系統。

## 網路隔離 {#network-isolation}

正常運作期間，容器不會建立**任何對外網路連線**。所有檔案處理都使用內建函式庫在本機完成。

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

唯一的例外是 **AI 模型下載**：當使用者透過 UI 安裝 AI 功能套件組時，容器會從 Hugging Face 下載預先建置的套件組封存檔，外加一些來自 GitHub Releases、Google Storage 和 PyPI 的個別模型檔案。這些下載每個套件組只發生一次，並儲存在 `/data` 磁碟區中。

**防火牆建議：**

| 情境 | 對外規則 |
|---|---|
| 氣隙隔離（無 AI） | 封鎖容器的所有對外流量 |
| 需要 AI 套件組 | 安裝期間允許對 `huggingface.co`、`*.xethub.hf.co`、`cdn-lfs.huggingface.co`、`github.com`、`objects.githubusercontent.com`、`storage.googleapis.com`、`pypi.org`、`files.pythonhosted.org` 的 HTTPS，之後封鎖 |
| AI 安裝後 | 封鎖所有對外流量 — 模型已快取於本機 |

套件組封存檔由 Hugging Face 的 Xet 儲存提供，它透過 `*.xethub.hf.co` 端點平行傳輸，正是這讓數 GB 的套件組下載得以快速完成。如果你的防火牆允許 `huggingface.co` 但封鎖 `*.xethub.hf.co`，安裝仍會成功，但會回退至較慢的單串流下載，因此請將 Xet 主機加入允許清單以維持在快速路徑上。完全離線的安裝可略過這一切，改用 [離線套件組匯入](/zh-TW/guide/deployment)。

關於反向代理設定（Nginx、Traefik、Caddy、Cloudflare Tunnels），請參閱 [部署指南](/zh-TW/guide/deployment#reverse-proxy)。

## Docker Secrets {#docker-secrets}

就正式環境部署而言，請避免將 secrets 以純文字環境變數傳遞。進入點支援 Docker 的 `_FILE` 慣例：將 secret 掛載為檔案，並將對應的 `_FILE` 變數設為其路徑。

**支援的 secrets：**

| 變數 | `_FILE` 對應 |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**使用 Docker Compose secrets 的範例：**

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
Docker Compose secrets（不使用 Swarm）需要 Compose v2.23 或更新版本。
:::

## Kubernetes 部署 {#kubernetes-deployment}

進入點會偵測容器是否已以非 root 執行（例如透過 Kubernetes `runAsUser`），並自動略過 gosu 降權。在此情況下它無法自行 chown 已掛載的磁碟區，因此它會驗證它們是否可寫入，若否則提早退出並提供可行動的指引，請參閱 [儲存權限](/zh-TW/guide/deployment#storage-permissions) 以了解 `fsGroup` 與外來 UID 設定（TrueNAS、OpenShift）。

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

由於 `runAsUser: 999` 是在 pod 層級設定的，進入點會完全略過 gosu。這讓 `allowPrivilegeEscalation: false` 和 `drop: [ALL]` capabilities 可以無衝突地使用。

關於資源規模，請參閱 [硬體需求](/zh-TW/guide/deployment#hardware-requirements)。

## 備份與復原 {#backup-and-recovery}

持久化狀態分散於兩個磁碟區：

| 磁碟區 | 內容 | 是否關鍵？ |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL 資料庫（使用者、設定、管線、作業、稽核記錄） | 是 |
| `/data`（app 磁碟區） | 使用者上傳的檔案、AI 模型、Python venv | 部分（見下文） |

在 `/data` 磁碟區中：

| 路徑 | 內容 | 是否關鍵？ |
|---|---|---|
| `/data/uploads/`、`/data/outputs/` | 使用者檔案與處理結果 | 是 |
| `/data/ai/` | 已下載的 AI 模型檔案 | 否（可重新下載） |
| `/data/venv/` | Python 虛擬環境 | 否（啟動時重建） |

### 資料庫備份 {#database-backup}

在堆疊執行期間，使用 `pg_dump` 備份資料庫：

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

或者，停止堆疊並對 `SnapOtter-pgdata` 磁碟區建立快照：

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

所有套件組的 AI 模型總計最多約 24 GB。由於它們可重新下載，請將 `/data/ai/` 和 `/data/venv/` 排除在備份之外以節省空間。只有資料庫與使用者檔案是關鍵的。

## 合規產出物 {#compliance-artifacts}

每次 SnapOtter 發行都包含下列安全產出物：

| 產出物 | 格式 | 取得位置 |
|---|---|---|
| SBOM（CycloneDX） | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 資產：`snapotter-v{version}-sbom.cdx.json` |
| SBOM（SPDX） | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 資產：`snapotter-v{version}-sbom.spdx.json` |
| 漏洞掃描 | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) 資產：`snapotter-v{version}-trivy.json` |
| 漏洞掃描 | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 分頁 |
| 靜態分析 | CodeQL（JS/TS + Python） | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) 分頁，每週 + 每次 PR 執行 |
| 相依性審查 | GitHub 原生 | 每次 PR 檢查，在新增高嚴重性項目時失敗 |
| Python 相依性稽核 | pip-audit | 每次推送的 CI 執行記錄 |
| 安全政策 | Markdown | 儲存庫中的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 相依性更新 | Dependabot | 針對 npm、pip、Docker、Actions 的每週自動化 PR |

**執行你自己的掃描：**

從發行中下載 SBOM，並用你偏好的工具掃描它：

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM 與漏洞掃描反映的是該發行所發布的確切映像檔。部署後安裝的 AI 模型套件組不包含在 SBOM 中，因為它們是在執行期間下載的。
:::
