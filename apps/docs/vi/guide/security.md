---
description: "Hướng dẫn tăng cường bảo mật cho SnapOtter. Bảo mật container, cô lập mạng, Docker secret, triển khai Kubernetes, và các tài liệu tuân thủ."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 832b0a8d9522
i18n_hash_version: 2
---

# Bảo mật & Tăng cường {#security-hardening}

SnapOtter xử lý tập tin hoàn toàn trên hạ tầng của bạn. Nó gửi phân tích sản phẩm và báo cáo sự cố ẩn danh, không chứa nội dung, theo mặc định để giúp cải thiện dự án. Nó không bao giờ gửi tập tin, tên tập tin, nội dung tập tin, kết quả OCR, metadata hình ảnh, hoặc văn bản tài liệu của bạn. Phản hồi tùy chọn chỉ được gửi sau khi người dùng gửi nó, chỉ khi phân tích được bật, và các trường liên hệ chỉ được bao gồm khi có sự đồng ý liên hệ tường minh. Một quản trị viên có thể tắt việc thu thập phân tích và phản hồi chỉ với một cú nhấp trong mục Settings > System > Privacy, không cần xây dựng lại. Việc xử lý tập tin luôn ở bên trong container của bạn.

Container chạy dưới danh nghĩa một người dùng không phải root chuyên dụng (`snapotter`) với tất cả các capability của Linux được loại bỏ ngoại trừ tập tối thiểu cần thiết. Để xem đầy đủ chính sách công bố lỗ hổng và kiến trúc bảo mật, xem [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) trên GitHub.

## Làm cứng thùng chứa {#container-hardening}

Các tệp soạn thảo [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) và [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) chuẩn là nguồn gốc của sự thật. Không sao chép một ví dụ viết tắt vào sản xuất; triển khai tệp từ thẻ phát hành mà bạn đã xác minh.

Cả hai ngăn xếp đều áp dụng các điều khiển sau:

- Các giới hạn về bộ nhớ, trao đổi, CPU và PID chứa quá trình xử lý gốc chạy trốn.
- Mọi dịch vụ đều loại bỏ tất cả các khả năng của Linux. Ứng dụng chỉ bổ sung lại `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` để sở hữu khối lượng, giảm danh tính `gosu` một chiều và chuyển tiếp tín hiệu duyên dáng. PostgreSQL và Redis chỉ nhận được tập hợp con mà điểm truy nhập chính thức của họ cần.
- `security_opt: [no-new-privileges:true]` ngăn các quy trình trong vùng chứa ứng dụng, PostgreSQL và Redis có được các đặc quyền bổ sung. Điều này vẫn tương thích với `gosu`: điểm vào bắt đầu với quyền root, chuẩn bị các ổ đĩa và chỉ giảm xuống người dùng `snapotter` chuyên dụng.
- Đầu vào hình ảnh PostgreSQL và Redis được ghim bằng thông báo. Ứng dụng cũng phải được ghim vào thẻ phát hành hoặc thông báo đã được xác minh thay vì `latest`.
- Kiểm tra tình trạng, xoay vòng nhật ký JSON có giới hạn, Redis AOF bền vững và chính sách khởi động lại được xác định tập trung trong các tệp chuẩn.

Để triển khai qua Internet, hãy liên kết cổng 1349 với loopback và chấm dứt TLS tại proxy ngược được duy trì. Tạo thông tin đăng nhập PostgreSQL và Redis duy nhất, lưu trữ bí mật trong các tệp được bảo vệ hoặc trình quản lý bí mật và thay đổi mật khẩu quản trị viên ban đầu ngay lập tức.

### Tại sao `read_only` không được đặt {#why-read-only-is-not-set}

`read_only: true` không được đặt vì ánh xạ lại PUID/PGID ghi vào `/etc/passwd` và `/etc/group` khi khởi động. Nếu sử dụng cờ `--user` của Docker hoặc Kubernetes `runAsUser` thay vì PUID/PGID, bạn có thể kích hoạt hệ thống tệp gốc chỉ đọc một cách an toàn.

## Cách ly mạng {#network-isolation}

Quá trình xử lý tệp diễn ra cục bộ nhưng cài đặt mặc định **không phải là hệ thống không có đầu ra**. Phân tích sản phẩm ẩn danh sử dụng PostHog và báo cáo sự cố sử dụng Sentry khi bật tính năng đo từ xa. Đặt `SNAPOTTER_TELEMETRY=0` (hoặc tắt phân tích trong Cài đặt > Hệ thống > Quyền riêng tư) để tắt cả hai. SnapOtter không bao giờ bao gồm các tệp đã tải lên, tên tệp, đầu ra OCR, văn bản tài liệu hoặc nội dung tệp khác trong các sự kiện đó.

Lưu lượng truy cập đi khác được điều khiển theo tính năng: Tải xuống bản cài đặt mô hình/gói AI đã ký các đầu vào phát hành; Nhập URL tìm nạp URL công khai do người dùng yêu cầu; và OIDC, SAML, OpenTelemetry, webhooks, bộ lưu trữ tương thích với S3 hoặc các tích hợp tương tự được định cấu hình rõ ràng sẽ liên hệ với các đích đến do quản trị viên chọn. Tải xuống mô hình trong thời gian chạy bị tắt theo mặc định. Chỉ đặt `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` để bật rõ ràng tính năng tải xuống dự phòng tự động. [Nhập gói ngoại tuyến](/vi/guide/deployment) có thể cung cấp các tính năng AI mà không cần xuất ra mô hình thời gian chạy.

**Khuyến nghị về tường lửa:**

|Kịch bản|Quy tắc đi|
|---|---|
|Khe hở không khí|Đặt `SNAPOTTER_TELEMETRY=0` và `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, sử dụng tính năng nhập gói AI ngoại tuyến, tắt tính năng nhập URL và tích hợp bên ngoài, sau đó chặn lối ra|
|đo từ xa mặc định|Cho phép các điểm cuối PostHog và Sentry được liệt kê theo nhật ký trình duyệt/mạng của bạn; vô hiệu hóa đo từ xa nếu chính sách không cho phép chúng|
|Cần có gói AI|Trong quá trình cài đặt, hãy cho phép HTTPS thành `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; sau đó chặn những máy chủ đó|
|Tích hợp bên ngoài|Chỉ cho phép các đích đến OIDC/SAML/OTLP/webhook/object-storage được định cấu hình chính xác bởi quản trị viên|

Các kho lưu trữ gói được cung cấp từ bộ lưu trữ Xet của Hugging Face, lưu trữ này truyền song song qua các điểm cuối `*.xethub.hf.co` và giúp tải xuống gói nhiều GB nhanh chóng. Nếu tường lửa của bạn cho phép `huggingface.co` nhưng chặn `*.xethub.hf.co`, quá trình cài đặt vẫn thành công nhưng quay lại tải xuống một luồng chậm hơn, vì vậy, hãy đưa các máy chủ Xet vào danh sách để tiếp tục hoạt động nhanh chóng. Các bản cài đặt hoàn toàn ngoại tuyến có thể bỏ qua tất cả những điều này và thay vào đó hãy sử dụng [Nhập gói ngoại tuyến](/vi/guide/deployment).

Để biết cấu hình proxy ngược (Nginx, Traefik, Caddy, Cloudflare Tunnels), hãy xem [Hướng dẫn triển khai](/vi/guide/deployment#reverse-proxy).

## Docker Secret {#docker-secrets}

Đối với các triển khai production, tránh truyền secret dưới dạng biến môi trường văn bản thuần. Entrypoint hỗ trợ quy ước `_FILE` của Docker: mount một secret dưới dạng một tập tin và đặt biến `_FILE` tương ứng thành đường dẫn của nó.

**Các secret được hỗ trợ:**

| Biến | Tương đương `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Ví dụ với Docker Compose secret:**

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
Docker Compose secret (không dùng Swarm) yêu cầu Compose v2.23 trở lên.
:::

## Triển khai Kubernetes {#kubernetes-deployment}

Entrypoint phát hiện khi container đã chạy sẵn dưới danh nghĩa không phải root (ví dụ, thông qua `runAsUser` của Kubernetes) và tự động bỏ qua việc hạ đặc quyền gosu. Trong trường hợp đó nó không thể tự chown các volume đã mount, nên nó xác minh rằng chúng có thể ghi được và thoát sớm với hướng dẫn khả thi nếu chúng không thể ghi, xem [Quyền lưu trữ](/vi/guide/deployment#storage-permissions) cho các thiết lập `fsGroup` và UID lạ (TrueNAS, OpenShift).

**SecurityContext khuyến nghị cho Pod:**

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

Vì `runAsUser: 999` được đặt ở cấp pod, entrypoint bỏ qua hoàn toàn gosu. Điều này cho phép các capability `allowPrivilegeEscalation: false` và `drop: [ALL]` mà không xung đột.

Để xác định kích cỡ tài nguyên, xem [Yêu cầu phần cứng](/vi/guide/deployment#hardware-requirements).

## Sao lưu và phục hồi {#backup-and-recovery}

Ngăn xếp Compose sản xuất xác định bốn tập. Dừng xâm nhập và để các công việc đang hoạt động kết thúc trước khi thực hiện một bản sao lưu phối hợp để PostgreSQL, Redis và trạng thái tệp mô tả cùng một thời điểm.

|Âm lượng|Nội dung|Điều trị phục hồi|
|---|---|---|
|`SnapOtter-pgdata`|Người dùng PostgreSQL, cài đặt, quy trình, công việc, siêu dữ liệu tệp và nhật ký kiểm tra|Phê bình; sử dụng kết xuất logic không nhanh để khôi phục di động|
|`SnapOtter-data`|Các đối tượng thư viện, nhật ký và trạng thái AI đã lưu (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Sao lưu toàn bộ âm lượng; để tiết kiệm dung lượng, cố tình bỏ qua tất cả trạng thái AI và cài đặt lại các gói của nó|
|`SnapOtter-redisdata`|Redis AOF cho trạng thái hàng đợi BullMQ bền bỉ|Sao lưu sau khi tạm dừng ứng dụng và buộc `SAVE`; bắt buộc phải tiếp tục công việc được xếp hàng đợi một cách chính xác|
|`SnapOtter-workspace`|Khóa lưu trữ đối tượng tạm thời (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Không sao lưu sau khi tất cả công việc đã hoàn thành hoặc bị hủy bỏ; không bao giờ loại bỏ nó trong khi công việc đang hoạt động|

Soạn các tên tập tiền tố thông thường với tên dự án. Giải quyết ổ nguồn thực từ vùng chứa được gắn thay vì giả sử rằng tên hiển thị như `SnapOtter-data` là tên ổ Docker.

### Sao lưu cơ sở dữ liệu {#database-backup}

Sử dụng định dạng lưu trữ tùy chỉnh của PostgreSQL và xác minh kho lưu trữ trước khi xử lý bản sao lưu hoàn chỉnh:

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

Kiểm tra mọi bản sao lưu bằng cách khôi phục nó vào một ngăn xếp riêng biệt, kiểm tra các bản ghi cơ sở dữ liệu và tổng kiểm tra tệp, rồi khởi động ứng dụng. `tests/qa/backup-restore-drill.sh` của kho lưu trữ tự động hóa cổng phát hành đó dựa trên `QA_IMAGE` rõ ràng.

Thay vào đó, nếu nền tảng của bạn thực hiện các ảnh chụp nhanh ổ đĩa nhất quán với sự cố, trước tiên hãy dừng toàn bộ ngăn xếp và chụp nhanh tất cả các ổ đĩa quan trọng dưới dạng một bộ. Bản sao thư mục dữ liệu PostgreSQL thô từ vùng chứa đang chạy không phải là bản sao lưu logic được hỗ trợ.

### Sao lưu tệp và hàng đợi {#file-and-queue-backup}

Tạm dừng ứng dụng trước khi chụp khối lượng tệp và hàng đợi. Sử dụng `docker inspect` để phân giải tên tập thực tế, buộc Redis duy trì trạng thái hiện tại và lưu trữ với quyền sở hữu và quyền được bảo toàn:

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

Khởi động lại Redis trước ứng dụng. Nếu bạn cố tình loại trừ `/data/ai`, hãy xóa toàn bộ cây con AI thay vì lưu giữ bản ghi `installed.json` mà không có mô hình hoặc môi trường ảo của nó. Giữ các tệp sao lưu được mã hóa, kiểm soát quyền truy cập và tách biệt khỏi máy chủ chạy SnapOtter.

## Cấu phần tuân thủ {#compliance-artifacts}

Mỗi bản phát hành SnapOtter bao gồm các tạo phẩm bảo mật sau:

| Cổ vật | Định dạng | Tìm nó ở đâu |
|---|---|---|
| Giải phóng ràng buộc chủ đề | Chứng thực Canonical JSON + GitHub | Nội dung [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| Lưu trữ SBOM | CycloneDX và SPDX JSON | Nội dung phát hành: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Hình ảnh SBOM | CycloneDX và SPDX JSON | Nội dung phát hành: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Quét lỗ hổng | Trivy JSON | Phát hành nội dung có tiền tố `archive-linux-{arch}` hoặc `image-linux-{arch}` phù hợp |
| Quét lỗ hổng | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Phân tích tĩnh | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), chạy hàng tuần + mỗi PR |
| Xem xét phụ thuộc | GitHub bản địa | Kiểm tra mỗi PR, không thành công khi bổ sung mức độ nghiêm trọng cao |
| Kiểm tra phụ thuộc Python | pip-audit | CI chạy nhật ký trên mỗi lần đẩy |
| Chính sách bảo mật | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) trong kho lưu trữ |
| Cập nhật phụ thuộc | Dependabot | PR hàng tuần tự động cho npm, pip, Docker, Hành động |

**Chạy quá trình quét của riêng bạn:**

Tải xuống bản kê khai chủ đề phát hành và xác minh rằng nó đã được chứng thực bởi quy trình phát hành:

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Tệp kê khai ghi lại `releaseTag`, `releaseCommit` và `workflowTriggerCommit` riêng biệt. Xác minh rằng `releaseCommit` là cam kết được tách khỏi thẻ bất biến, sau đó xác minh thông báo SHA-256 của kho lưu trữ, hình ảnh, SBOM hoặc bản quét mà bạn sử dụng đối với mục nhập của nó trong `subjects`. Sự khác biệt này là có chủ ý: việc kiểm tra cam kết phát hành mới được tạo không làm thay đổi danh tính cam kết trong thông tin xác thực OIDC của quy trình làm việc.

Bạn cũng có thể quét trực tiếp SBOM đã tải xuống hoặc hình ảnh:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
Hình ảnh SBOMs và các bản quét phản ánh chính xác hình ảnh theo kiến ​​trúc cụ thể được xuất bản cho bản phát hành đó. Lưu trữ SBOMs và các bản quét mô tả riêng biệt kho lưu trữ dựng sẵn. Các gói mô hình AI được cài đặt sau khi triển khai không được bao gồm trong các SBOMs này vì chúng được tải xuống khi chạy.
:::
