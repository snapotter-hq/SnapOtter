---
description: "SnapOtter 的安全強化指南。容器安全、網路隔離、Docker secrets、Kubernetes 部署與合規產出物。"
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 0ec192d6b1ef
i18n_hash_version: 2
---

# 安全與強化 {#security-hardening}

SnapOtter 完全在你的基礎架構上處理檔案。它預設會傳送匿名、不含內容的產品分析與當機報告，以協助改善這個專案。它絕不會傳送你的檔案、檔案名稱、檔案內容、OCR 輸出、影像中繼資料或文件文字。選用的意見回饋只在使用者提交後、且僅在分析啟用時才會傳送，聯絡欄位也只在明確同意聯絡時才會包含。管理員可在 Settings > System > Privacy 底下一鍵關閉分析與意見回饋擷取，無需重新建置。檔案處理始終留在你的容器內。

容器以專屬的非 root 使用者（`snapotter`）執行，並卸除除最低必需集之外的所有 Linux capabilities。完整的漏洞揭露政策與安全架構，請參閱 GitHub 上的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md)。

## 容器硬化 {#container-hardening}

規範的 [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) 和 [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose 檔案是事實來源。不要將縮寫範例複製到生產中；從您驗證的發布標籤部署檔案。

兩個堆疊都應用以下控制：

- 記憶體、交換、CPU 和 PID 限制包含失控的本機處理。
- 每個服務都會放棄所有 Linux 功能。該應用程式僅添加回 `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` 來實現卷所有權、單向 `gosu` 身份刪除以及優雅的信號轉發。 PostgreSQL 和 Redis 僅接收其官方入口點所需的子集。
- `security_opt: [no-new-privileges:true]` 防止應用程式、PostgreSQL 和 Redis 容器中的進程獲得額外權限。這仍然與 `gosu` 相容：入口點以 root 身份開始，準備卷，並且僅下降到專用的 `snapotter` 用戶。
- PostgreSQL 和 Redis 影像輸入由摘要固定。應用程式同樣應該固定到經過驗證的發布標籤或摘要，而不是 `latest`。
- 健康檢查、有界 JSON 日誌輪替、持久的 Redis AOF 和重啟策略在規範文件中集中定義。

對於面向網際網路的部署，將連接埠 1349 綁定到環回並在維護的反向代理處終止 TLS。產生唯一的 PostgreSQL 和 Redis 憑證，將機密儲存在受保護的檔案或機密管理器中，並立即變更初始管理員密碼。

### 為什麼 `read_only` 沒有設定 {#why-read-only-is-not-set}

未設定 `read_only: true`，因為 PUID/PGID 重新映射在啟動時寫入 `/etc/passwd` 和 `/etc/group`。如果您使用 Docker 的 `--user` 標誌或 Kubernetes `runAsUser` 而不是 PUID/PGID，則可以安全地啟用只讀根檔案系統。

## 網路隔離{#network-isolation}

文件處理是本地的，但預設安裝**不是無出口系統**。啟用遙測功能時，匿名產品分析使用 PostHog，崩潰報告使用 Sentry。設定 `SNAPOTTER_TELEMETRY=0`（或在「設定」>「系統」>「隱私權」下停用分析）以關閉兩者。 SnapOtter 絕不會在這些事件中包含上傳的檔案、檔案名稱、OCR 輸出、文件文字或其他文件內容。

其他出站流量是功能驅動的：AI 捆綁包/模型安裝下載簽名發布輸入； URL導入獲取用戶請求的公共URL；並明確配置的 OIDC、SAML、OpenTelemetry、webhooks、S3 兼容存儲或類似集成會聯繫管理員選擇的目標。執行階段模型下載預設為停用。只有在明確選擇啟用自動備援下載時，才設定 `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1`。[離線捆綁導入](/zh-TW/guide/deployment) 可以在沒有運行時模型出口的情況下提供 AI 功能。

**防火牆建議：**

|設想|出站規則|
|---|---|
|氣隙|設定`SNAPOTTER_TELEMETRY=0`和`SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`，使用離線AI捆綁導入，停用URL導入和外部集成，然後阻止出口|
|預設遙測|允許瀏覽器/網頁日誌列出的 PostHog 和 Sentry 端點；如果策略不允許，則停用遙測|
|需要 AI 捆綁包|安裝過程中，允許HTTPS到`huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`；然後阻止這些主機|
|外部集成|僅允許管理員準確配置的 OIDC/SAML/OTLP/webhook/物件儲存目標|

捆綁包檔案由 Hugging Face 的 Xet 儲存空間提供，該儲存透過 `*.xethub.hf.co` 端點並行傳輸，這使得多 GB 捆綁包下載速度更快。如果您的防火牆允許 `huggingface.co` 但阻止 `*.xethub.hf.co`，安裝仍然會成功，但會回退到較慢的單流下載，因此將 Xet 主機列入白名單以保持快速路徑。完全離線安裝可以跳過所有這些並使用[離線捆綁導入](/zh-TW/guide/deployment)。

有關反向代理配置（Nginx、Traefik、Caddy、Cloudflare Tunnels），請參閱[部署指南](/zh-TW/guide/deployment#reverse-proxy)。

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

## 備份與還原 {#backup-and-recovery}

生產 Compose 堆疊定義了四個磁碟區。在進行協調備份之前停止入口並讓活動作業完成，以便 PostgreSQL、Redis 和檔案狀態描述相同的時間點。

|體積|內容|復健治療|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL 使用者、設定、管道、作業、文件元資料和審核日誌|批判的;使用快速故障邏輯轉儲進行可移植恢復|
|`SnapOtter-data`|保存的庫物件、日誌和 AI 狀態 (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|備份整個磁碟區；為了節省空間，故意省略所有 AI 狀態並重新安裝其捆綁包|
|`SnapOtter-redisdata`|Redis AOF 用於持久的 BullMQ 隊列狀態|暫停應用程式並強制`SAVE`後備份；需要準確地恢復排隊的工作|
|`SnapOtter-workspace`|暫存物件儲存鍵 (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|所有作業清空或取消後不要進行備份；當工作處於活動狀態時切勿丟棄它|

Compose 通常在磁碟區名稱前加上項目名稱作為前綴。從已安裝的容器中解析真實的來源卷，而不是假設顯示名稱（例如 `SnapOtter-data`）是 Docker 磁碟區名稱。

### 資料庫備份{#database-backup}

使用 PostgreSQL 的自訂存檔格式並在將備份視為完整之前驗證存檔：

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

透過將每個備份還原到隔離堆疊、檢查資料庫記錄和檔案校驗和以及啟動應用程式來測試每個備份。儲存庫的 `tests/qa/backup-restore-drill.sh` 會針對明確 `QA_IMAGE` 自動執行該發佈閘。

如果您的平台採用崩潰一致的磁碟區快照，請先停止整個堆疊，並將所有關鍵磁碟區快照為一組。來自正在運行的容器的原始 PostgreSQL 資料目錄副本不是受支援的邏輯備份。

### 檔案與佇列備份 {#file-and-queue-backup}

在捕獲文件和隊列卷之前暫停應用程式。使用 `docker inspect` 解析實際磁碟區名稱，強制 Redis 保留其目前狀態，並在保留所有權和權限的情況下進行歸檔：

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

應用前重啟Redis。如果您有意排除 `/data/ai`，請刪除整個 AI 子樹，而不是保留不含模型或虛擬環境的 `installed.json` 記錄。保持備份檔案加密、存取受控，並與執行 SnapOtter 的主機分開。

## 合規工件 {#compliance-artifacts}

每個 SnapOtter 版本都包含以下安全工件：

| 人工製品 | 格式 | 在哪裡可以找到它 |
|---|---|---|
| 釋放主體綁定 | 規範 JSON + GitHub 證明 | [GitHub發布](https://github.com/snapotter-hq/SnapOtter/releases)資產：`snapotter-v{version}-release-subjects.json` |
| 歸檔 SBOM | CycloneDX 和 SPDX JSON | 釋放資產：`snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| 圖片 SBOM | CycloneDX 和 SPDX JSON | 釋放資產：`snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| 漏洞掃描 | Trivy JSON | 發布具有匹配 `archive-linux-{arch}` 或 `image-linux-{arch}` 前綴的資產 |
| 漏洞掃描 | SARIF | [GitHub 安全性](https://github.com/snapotter-hq/SnapOtter/security) 選項卡 |
| 靜態分析 | CodeQL (JS/TS + Python) | [GitHub 安全](https://github.com/snapotter-hq/SnapOtter/security) 選項卡，每週運行 + 每個 PR |
| 依賴性審查 | GitHub 本機 | 按 PR 檢查，高嚴重性添加失敗 |
| Python依賴審計 | pip-audit | CI 在每次推送時執行日誌 |
| 安全政策 | Markdown | 儲存庫中的 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| 依賴項更新 | Dependabot | npm、pip、Docker、Actions 的自動每週 PR |

**執行您自己的掃描:**

下載發布主題清單並驗證它是否已由發布工作流程證明：

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

清單中分別記錄了 `releaseTag`、`releaseCommit` 和 `workflowTriggerCommit`。驗證 `releaseCommit` 是否為從不可變標記中剝離的提交，然後驗證存檔、映像、SBOM 的 SHA-256 摘要，或根據 `subjects` 中的條目進行掃描。這種區別是有意為之的：簽出新建立的發布提交不會更改工作流程的 OIDC 憑證中的提交標識。

您也可以直接掃描下載的 SBOM 或影像：

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
影像 SBOMs 和掃描反映了針對該版本發布的具體架構特定影像。檔案 SBOMs 和掃描分別描述預建存檔。部署後安裝的 AI 模型包不包含在這些 SBOMs 中，因為它們是在執行時下載的。
:::
