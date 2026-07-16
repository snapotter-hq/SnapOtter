---
description: "คู่มือการเสริมความแข็งแกร่งด้านความปลอดภัยสำหรับ SnapOtter ความปลอดภัยของคอนเทนเนอร์ การแยกเครือข่าย Docker secrets การปรับใช้ Kubernetes และอาร์ทิแฟกต์ด้านการปฏิบัติตามข้อกำหนด"
i18n_source_hash: 986f7658430c
i18n_provenance: human
i18n_output_hash: 3c4f44580e5e
---

# Security & Hardening {#security-hardening}

SnapOtter ประมวลผลไฟล์ทั้งหมดบนโครงสร้างพื้นฐานของคุณ มันส่งการวิเคราะห์ผลิตภัณฑ์และรายงานการล่มแบบไม่ระบุตัวตนที่ไม่มีเนื้อหาโดยค่าเริ่มต้น เพื่อช่วยปรับปรุงโครงการ มันไม่เคยส่งไฟล์, ชื่อไฟล์, เนื้อหาไฟล์, เอาต์พุต OCR, เมตาดาตาของรูปภาพ หรือข้อความในเอกสารของคุณ ข้อเสนอแนะเสริมจะถูกส่งหลังจากผู้ใช้ส่งเท่านั้น เฉพาะเมื่อเปิดใช้การวิเคราะห์ และฟิลด์ข้อมูลติดต่อจะรวมอยู่ด้วยเฉพาะเมื่อมีความยินยอมด้านการติดต่ออย่างชัดเจน ผู้ดูแลระบบสามารถปิดการวิเคราะห์และการเก็บข้อเสนอแนะได้ในคลิกเดียวภายใต้ Settings > System > Privacy โดยไม่ต้อง build ใหม่ การประมวลผลไฟล์อยู่ภายในคอนเทนเนอร์ของคุณเสมอ

คอนเทนเนอร์รันเป็นผู้ใช้ที่ไม่ใช่ root โดยเฉพาะ (`snapotter`) โดยตัด Linux capabilities ทั้งหมดออก ยกเว้นชุดขั้นต่ำที่จำเป็น สำหรับนโยบายการเปิดเผยช่องโหว่ฉบับเต็มและสถาปัตยกรรมความปลอดภัย ดู [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) บน GitHub

## Container Hardening {#container-hardening}

[docker-compose.yml เริ่มต้น](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) มีการเสริมความแข็งแกร่งด้านความปลอดภัยระดับโปรดักชัน นี่คือรายละเอียดของแต่ละตัวเลือกและเหตุผลที่มันสำคัญ:

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

### Why `no-new-privileges` Is Not Set {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` ถูกละไว้โดยตั้งใจ entrypoint เริ่มเป็น root เพื่อแก้ไขความเป็นเจ้าของของวอลุ่ม จากนั้นลดสิทธิ์เป็นผู้ใช้ `snapotter` ผ่าน [gosu](https://github.com/tianon/gosu) ซึ่งต้องใช้ setuid เมื่อการลดสิทธิ์เสร็จสมบูรณ์ กระบวนการจะรันเป็น `snapotter` โดยตัด capabilities ทั้งหมดออก ยกเว้นห้ารายการที่ระบุไว้ด้านบน

หากคุณใช้ Kubernetes หรือแฟล็ก `--user` ของ Docker เพื่อรันเป็น non-root โดยตรง (ข้าม gosu) การเปิดใช้ `no-new-privileges` ก็ปลอดภัย

### Why `read_only` Is Not Set {#why-read-only-is-not-set}

`read_only: true` ไม่ได้ถูกตั้งค่า เพราะการรีแมป PUID/PGID เขียนลง `/etc/passwd` และ `/etc/group` ตอนเริ่มทำงาน หากคุณใช้แฟล็ก `--user` ของ Docker หรือ `runAsUser` ของ Kubernetes แทน PUID/PGID คุณสามารถเปิดใช้ระบบไฟล์รากแบบอ่านอย่างเดียวได้อย่างปลอดภัย

## Network Isolation {#network-isolation}

ระหว่างการทำงานปกติ คอนเทนเนอร์ทำการเชื่อมต่อเครือข่ายขาออก **เป็นศูนย์** การประมวลผลไฟล์ทั้งหมดเกิดขึ้นในเครื่องโดยใช้ไลบรารีที่มาพร้อมกับตัวโปรแกรม

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

ข้อยกเว้นเดียวคือ **การดาวน์โหลดโมเดล AI**: เมื่อผู้ใช้ติดตั้งบันเดิลฟีเจอร์ AI ผ่าน UI คอนเทนเนอร์จะดาวน์โหลดไฟล์เก็บบันเดิลที่สร้างไว้ล่วงหน้าจาก Hugging Face รวมถึงไฟล์โมเดลแต่ละไฟล์อีกไม่กี่ไฟล์จาก GitHub Releases, Google Storage และ PyPI การดาวน์โหลดเหล่านี้เกิดขึ้นครั้งเดียวต่อบันเดิลและเก็บไว้ในวอลุ่ม `/data`

**คำแนะนำเรื่องไฟร์วอลล์:**

| สถานการณ์ | กฎขาออก |
|---|---|
| Air-gapped (ไม่มี AI) | บล็อกทราฟฟิกขาออกทั้งหมดจากคอนเทนเนอร์ |
| ต้องการบันเดิล AI | อนุญาต HTTPS ไปยัง `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` ระหว่างการติดตั้ง จากนั้นบล็อก |
| หลังติดตั้ง AI | บล็อกทราฟฟิกขาออกทั้งหมด โมเดลถูกแคชไว้ในเครื่องแล้ว |

ไฟล์เก็บบันเดิลถูกให้บริการจาก Xet storage ของ Hugging Face ซึ่งถ่ายโอนผ่าน endpoint `*.xethub.hf.co` แบบขนาน และเป็นสิ่งที่ทำให้การดาวน์โหลดบันเดิลขนาดหลาย GB รวดเร็ว หากไฟร์วอลล์ของคุณอนุญาต `huggingface.co` แต่บล็อก `*.xethub.hf.co` การติดตั้งยังคงสำเร็จ แต่จะสำรองไปใช้การดาวน์โหลดแบบสตรีมเดียวที่ช้ากว่า ดังนั้นให้ allowlist โฮสต์ Xet ไว้เพื่อคงอยู่ในเส้นทางที่เร็ว การติดตั้งแบบออฟไลน์ทั้งหมดสามารถข้ามทั้งหมดนี้และใช้ [Offline Bundle Import](/th/guide/deployment) แทนได้

สำหรับการกำหนดค่า reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels) ดู [คู่มือ Deployment](/th/guide/deployment#reverse-proxy)

## Docker Secrets {#docker-secrets}

สำหรับการปรับใช้ในโปรดักชัน ควรหลีกเลี่ยงการส่งความลับเป็นตัวแปรสภาพแวดล้อมแบบข้อความธรรมดา entrypoint รองรับข้อกำหนด `_FILE` ของ Docker: เมานต์ความลับเป็นไฟล์แล้วตั้งค่าตัวแปร `_FILE` ที่สอดคล้องกันให้เป็นพาธของมัน

**ความลับที่รองรับ:**

| ตัวแปร | `_FILE` ที่เทียบเท่า |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**ตัวอย่างกับ Docker Compose secrets:**

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
Docker Compose secrets (โดยไม่มี Swarm) ต้องใช้ Compose v2.23 ขึ้นไป
:::

## Kubernetes Deployment {#kubernetes-deployment}

entrypoint ตรวจจับเมื่อคอนเทนเนอร์รันเป็น non-root อยู่แล้ว (เช่น ผ่าน `runAsUser` ของ Kubernetes) และข้ามการลดสิทธิ์ด้วย gosu โดยอัตโนมัติ ในกรณีนั้นมันไม่สามารถ chown วอลุ่มที่เมานต์ได้เอง ดังนั้นมันจะตรวจสอบว่าวอลุ่มเขียนได้ และออกก่อนกำหนดพร้อมคำแนะนำที่นำไปปฏิบัติได้หากเขียนไม่ได้ ดู [Storage permissions](/th/guide/deployment#storage-permissions) สำหรับ `fsGroup` และการตั้งค่าแบบ UID ต่างถิ่น (TrueNAS, OpenShift)

**SecurityContext ของ Pod ที่แนะนำ:**

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

เนื่องจาก `runAsUser: 999` ถูกตั้งค่าที่ระดับ pod entrypoint จึงข้าม gosu ทั้งหมด สิ่งนี้อนุญาต capabilities `allowPrivilegeEscalation: false` และ `drop: [ALL]` โดยไม่ขัดแย้งกัน

สำหรับการกำหนดขนาดทรัพยากร ดู [Hardware Requirements](/th/guide/deployment#hardware-requirements)

## Backup and Recovery {#backup-and-recovery}

สถานะถาวรถูกแบ่งออกเป็นสองวอลุ่ม:

| วอลุ่ม | เนื้อหา | สำคัญไหม? |
|---|---|---|
| `SnapOtter-pgdata` | ฐานข้อมูล PostgreSQL (ผู้ใช้, การตั้งค่า, ไปป์ไลน์, งาน, บันทึกการตรวจสอบ) | ใช่ |
| `/data` (วอลุ่มแอป) | ไฟล์ที่ผู้ใช้อัปโหลด, โมเดล AI, Python venv | บางส่วน (ดูด้านล่าง) |

ภายในวอลุ่ม `/data`:

| พาธ | เนื้อหา | สำคัญไหม? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | ไฟล์ผู้ใช้และผลการประมวลผล | ใช่ |
| `/data/ai/` | ไฟล์โมเดล AI ที่ดาวน์โหลด | ไม่ (ดาวน์โหลดใหม่ได้) |
| `/data/venv/` | Python virtual environment | ไม่ (สร้างใหม่ตอนเริ่ม) |

### Database backup {#database-backup}

ใช้ `pg_dump` เพื่อสำรองฐานข้อมูลขณะที่สแตกกำลังรัน:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

หรืออีกทางเลือกหนึ่ง ให้หยุดสแตกและ snapshot วอลุ่ม `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### User files backup {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

โมเดล AI รวมกันมีขนาดสูงสุดราว 24 GB สำหรับบันเดิลทั้งหมด เนื่องจากมันดาวน์โหลดใหม่ได้ ให้ยกเว้น `/data/ai/` และ `/data/venv/` จากการสำรองข้อมูลเพื่อประหยัดพื้นที่ มีเพียงฐานข้อมูลและไฟล์ผู้ใช้เท่านั้นที่สำคัญ

## Compliance Artifacts {#compliance-artifacts}

แต่ละรีลีสของ SnapOtter มีอาร์ทิแฟกต์ด้านความปลอดภัยต่อไปนี้:

| อาร์ทิแฟกต์ | รูปแบบ | หาได้ที่ไหน |
|---|---|---|
| SBOM (CycloneDX) | JSON | asset ของ [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | asset ของ [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| การสแกนช่องโหว่ | Trivy JSON | asset ของ [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| การสแกนช่องโหว่ | SARIF | แท็บ [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| การวิเคราะห์แบบสถิต | CodeQL (JS/TS + Python) | แท็บ [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), รันรายสัปดาห์ + ต่อ PR |
| การตรวจสอบ dependency | GitHub native | การตรวจสอบต่อ PR ล้มเหลวเมื่อมีการเพิ่มความรุนแรงสูง |
| การตรวจสอบ dependency ของ Python | pip-audit | ล็อกการรัน CI ในทุก push |
| นโยบายความปลอดภัย | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) ในที่เก็บ |
| การอัปเดต dependency | Dependabot | PR อัตโนมัติรายสัปดาห์สำหรับ npm, pip, Docker, Actions |

**การรันสแกนของคุณเอง:**

ดาวน์โหลด SBOM จากรีลีสและสแกนด้วยเครื่องมือที่คุณต้องการ:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM และการสแกนช่องโหว่สะท้อนอิมเมจที่เผยแพร่สำหรับรีลีสนั้นอย่างแน่นอน บันเดิลโมเดล AI ที่ติดตั้งหลังการปรับใช้ไม่ได้รวมอยู่ใน SBOM เนื่องจากดาวน์โหลดขณะรันไทม์
:::
