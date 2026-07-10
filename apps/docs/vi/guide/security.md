---
description: "Hướng dẫn tăng cường bảo mật cho SnapOtter. Bảo mật container, cô lập mạng, Docker secrets, triển khai Kubernetes, và các tài liệu tuân thủ."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 7c20083858ca
---

# Bảo mật & Tăng cường {#security-hardening}

SnapOtter xử lý tệp hoàn toàn trên hạ tầng của bạn. Theo mặc định, nó gửi dữ liệu phân tích sản phẩm ẩn danh, không chứa nội dung, cùng các báo cáo sự cố để giúp cải thiện dự án. Nó không bao giờ gửi tệp, tên tệp, nội dung tệp, kết quả OCR, siêu dữ liệu hình ảnh, hay văn bản tài liệu của bạn. Phản hồi tùy chọn chỉ được gửi sau khi người dùng gửi nó, chỉ khi phân tích được bật, và các trường liên hệ chỉ được bao gồm khi có sự đồng ý liên hệ rõ ràng. Quản trị viên có thể tắt phân tích và thu thập phản hồi chỉ với một cú nhấp trong Settings > System > Privacy, không cần build lại. Việc xử lý tệp luôn nằm bên trong container của bạn.

Container chạy dưới một người dùng non-root chuyên dụng (`snapotter`) với tất cả các capability của Linux đã bị loại bỏ ngoại trừ tập tối thiểu cần thiết. Để xem chính sách công bố lỗ hổng đầy đủ và kiến trúc bảo mật, hãy xem [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) trên GitHub.

## Tăng cường Container {#container-hardening}

[docker-compose.yml mặc định](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) bao gồm việc tăng cường bảo mật cho môi trường production. Dưới đây là phân tích từng tùy chọn và lý do nó quan trọng:

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

### Tại sao `no-new-privileges` không được đặt {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` được bỏ qua một cách có chủ đích. Entrypoint khởi động dưới quyền root để sửa quyền sở hữu volume, sau đó hạ xuống người dùng `snapotter` thông qua [gosu](https://github.com/tianon/gosu), vốn yêu cầu setuid. Khi việc hạ đặc quyền hoàn tất, tiến trình chạy dưới `snapotter` với tất cả capability đã bị loại bỏ ngoại trừ năm capability được liệt kê ở trên.

Nếu bạn dùng Kubernetes hoặc cờ `--user` của Docker để chạy trực tiếp dưới non-root (bỏ qua gosu), thì `no-new-privileges` có thể được bật an toàn.

### Tại sao `read_only` không được đặt {#why-read-only-is-not-set}

`read_only: true` không được đặt vì việc ánh xạ lại PUID/PGID ghi vào `/etc/passwd` và `/etc/group` khi khởi động. Nếu bạn dùng cờ `--user` của Docker hoặc `runAsUser` của Kubernetes thay cho PUID/PGID, bạn có thể bật an toàn hệ thống tệp root ở chế độ chỉ đọc.

## Cô lập mạng {#network-isolation}

Trong quá trình vận hành bình thường, container thực hiện **không có kết nối mạng ra ngoài nào**. Toàn bộ việc xử lý tệp diễn ra cục bộ bằng các thư viện đi kèm.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Ngoại lệ duy nhất là **tải mô hình AI**: khi người dùng cài đặt một gói tính năng AI thông qua giao diện, container tải các tệp mô hình từ GitHub Releases và PyPI. Các lượt tải này diễn ra một lần cho mỗi gói và được lưu trong volume `/data`.

**Khuyến nghị về tường lửa:**

| Kịch bản | Quy tắc ra ngoài |
|---|---|
| Cách ly mạng (không có AI) | Chặn toàn bộ lưu lượng ra ngoài từ container |
| Cần các gói AI | Cho phép HTTPS tới `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` trong khi cài đặt, sau đó chặn |
| Sau khi cài AI | Chặn toàn bộ lưu lượng ra ngoài - các mô hình được lưu cache cục bộ |

Để cấu hình reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), hãy xem [Hướng dẫn triển khai](/vi/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Đối với các triển khai production, hãy tránh truyền secret dưới dạng biến môi trường văn bản thuần túy. Entrypoint hỗ trợ quy ước `_FILE` của Docker: gắn một secret dưới dạng tệp và đặt biến `_FILE` tương ứng thành đường dẫn của nó.

**Các secret được hỗ trợ:**

| Biến | Tương đương `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Ví dụ với Docker Compose secrets:**

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
Docker Compose secrets (không dùng Swarm) yêu cầu Compose v2.23 trở lên.
:::

## Triển khai Kubernetes {#kubernetes-deployment}

Entrypoint phát hiện khi container đã chạy dưới non-root (ví dụ, qua `runAsUser` của Kubernetes) và tự động bỏ qua việc hạ đặc quyền gosu. Trong trường hợp đó, nó không thể tự chown các volume đã gắn, nên nó xác minh chúng có thể ghi được và thoát sớm với hướng dẫn cụ thể nếu không thể ghi. Xem [Quyền lưu trữ](/vi/guide/deployment#storage-permissions) cho các thiết lập `fsGroup` và UID lạ (TrueNAS, OpenShift).

**SecurityContext của Pod được khuyến nghị:**

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

Vì `runAsUser: 999` được đặt ở cấp pod, entrypoint bỏ qua gosu hoàn toàn. Điều này cho phép các capability `allowPrivilegeEscalation: false` và `drop: [ALL]` mà không xung đột.

Để định cỡ tài nguyên, hãy xem [Yêu cầu phần cứng](/vi/guide/deployment#hardware-requirements).

## Sao lưu và Khôi phục {#backup-and-recovery}

Trạng thái lâu bền được chia trên hai volume:

| Volume | Nội dung | Quan trọng? |
|---|---|---|
| `SnapOtter-pgdata` | Cơ sở dữ liệu PostgreSQL (người dùng, cài đặt, pipeline, job, nhật ký kiểm toán) | Có |
| `/data` (volume ứng dụng) | Tệp do người dùng tải lên, mô hình AI, Python venv | Một phần (xem bên dưới) |

Trong volume `/data`:

| Đường dẫn | Nội dung | Quan trọng? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Tệp người dùng và kết quả xử lý | Có |
| `/data/ai/` | Các tệp mô hình AI đã tải | Không (có thể tải lại) |
| `/data/venv/` | Môi trường ảo Python | Không (được build lại khi khởi động) |

### Sao lưu cơ sở dữ liệu {#database-backup}

Dùng `pg_dump` để sao lưu cơ sở dữ liệu trong khi stack đang chạy:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Hoặc, dừng stack và chụp snapshot của volume `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Sao lưu tệp người dùng {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Các mô hình AI cộng lại lên tới khoảng 24 GB trên tất cả các gói. Vì chúng có thể tải lại, hãy loại trừ `/data/ai/` và `/data/venv/` khỏi các bản sao lưu để tiết kiệm dung lượng. Chỉ cơ sở dữ liệu và tệp người dùng là quan trọng.

## Tài liệu tuân thủ {#compliance-artifacts}

Mỗi bản phát hành SnapOtter bao gồm các tài liệu bảo mật sau:

| Tài liệu | Định dạng | Nơi tìm |
|---|---|---|
| SBOM (CycloneDX) | JSON | Tài sản [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Tài sản [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Quét lỗ hổng | Trivy JSON | Tài sản [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Quét lỗ hổng | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Phân tích tĩnh | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), chạy hàng tuần + mỗi PR |
| Đánh giá phụ thuộc | GitHub native | Kiểm tra mỗi PR, thất bại khi có bổ sung mức độ nghiêm trọng cao |
| Kiểm toán phụ thuộc Python | pip-audit | Nhật ký chạy CI trên mỗi lần push |
| Chính sách bảo mật | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) trong kho lưu trữ |
| Cập nhật phụ thuộc | Dependabot | PR tự động hàng tuần cho npm, pip, Docker, Actions |

**Chạy quét của riêng bạn:**

Tải SBOM từ bản phát hành và quét nó bằng công cụ ưa thích của bạn:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM và bản quét lỗ hổng phản ánh chính xác image được xuất bản cho bản phát hành đó. Các gói mô hình AI được cài đặt sau khi triển khai không được bao gồm trong SBOM vì chúng được tải xuống trong thời gian chạy.
:::
