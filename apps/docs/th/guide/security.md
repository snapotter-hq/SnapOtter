---
description: "คู่มือการเสริมความแข็งแกร่งด้านความปลอดภัยสำหรับ SnapOtter ความปลอดภัยของคอนเทนเนอร์ การแยกเครือข่าย Docker secrets การปรับใช้ Kubernetes และอาร์ทิแฟกต์ด้านการปฏิบัติตามข้อกำหนด"
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 06f28d0ea62d
i18n_hash_version: 2
---

# Security & Hardening {#security-hardening}

SnapOtter ประมวลผลไฟล์ทั้งหมดบนโครงสร้างพื้นฐานของคุณ มันส่งการวิเคราะห์ผลิตภัณฑ์และรายงานการล่มแบบไม่ระบุตัวตนที่ไม่มีเนื้อหาโดยค่าเริ่มต้น เพื่อช่วยปรับปรุงโครงการ มันไม่เคยส่งไฟล์, ชื่อไฟล์, เนื้อหาไฟล์, เอาต์พุต OCR, เมตาดาตาของรูปภาพ หรือข้อความในเอกสารของคุณ ข้อเสนอแนะเสริมจะถูกส่งหลังจากผู้ใช้ส่งเท่านั้น เฉพาะเมื่อเปิดใช้การวิเคราะห์ และฟิลด์ข้อมูลติดต่อจะรวมอยู่ด้วยเฉพาะเมื่อมีความยินยอมด้านการติดต่ออย่างชัดเจน ผู้ดูแลระบบสามารถปิดการวิเคราะห์และการเก็บข้อเสนอแนะได้ในคลิกเดียวภายใต้ Settings > System > Privacy โดยไม่ต้อง build ใหม่ การประมวลผลไฟล์อยู่ภายในคอนเทนเนอร์ของคุณเสมอ

คอนเทนเนอร์รันเป็นผู้ใช้ที่ไม่ใช่ root โดยเฉพาะ (`snapotter`) โดยตัด Linux capabilities ทั้งหมดออก ยกเว้นชุดขั้นต่ำที่จำเป็น สำหรับนโยบายการเปิดเผยช่องโหว่ฉบับเต็มและสถาปัตยกรรมความปลอดภัย ดู [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) บน GitHub

## การชุบแข็งตู้คอนเทนเนอร์ {#container-hardening}

ไฟล์เขียน Canonical [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) และ [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) เป็นแหล่งที่มาของความจริง อย่าคัดลอกตัวอย่างย่อไปสู่การใช้งานจริง ปรับใช้ไฟล์จากแท็ก release ที่คุณตรวจสอบแล้ว

สแต็กทั้งสองใช้การควบคุมต่อไปนี้:

- ขีดจำกัดหน่วยความจำ, การสลับ, CPU และ PID มีการประมวลผลแบบเนทีฟแบบควบคุมไม่ได้
- ทุกบริการจะลดความสามารถของ Linux ทั้งหมด แอปพลิเคชันเพิ่มกลับเฉพาะ `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` สำหรับการเป็นเจ้าของโวลุ่ม การลดการระบุตัวตน `gosu` ทางเดียว และการส่งต่อสัญญาณที่สวยงาม PostgreSQL และ Redis ได้รับเฉพาะส่วนย่อยที่ต้องการสำหรับจุดเข้าใช้งานอย่างเป็นทางการเท่านั้น
- `security_opt: [no-new-privileges:true]` ป้องกันไม่ให้กระบวนการในแอปพลิเคชัน, PostgreSQL และคอนเทนเนอร์ Redis ได้รับสิทธิพิเศษเพิ่มเติม สิ่งนี้ยังคงเข้ากันได้กับ `gosu`: จุดเข้าใช้งานเริ่มต้นในฐานะรูท เตรียมวอลุ่ม และส่งไปยังผู้ใช้ `snapotter` เฉพาะเท่านั้น
- อินพุตรูปภาพ PostgreSQL และ Redis ถูกตรึงโดยไดเจสต์ นอกจากนี้ ควรปักหมุดแอปพลิเคชันไว้ที่แท็ก Release ที่ได้รับการยืนยันหรือแยกย่อย แทนที่จะปักหมุด `latest`
- การตรวจสอบประสิทธิภาพการทำงาน, การหมุนเวียนบันทึก JSON แบบมีขอบเขต, Redis AOF ที่คงทน และนโยบายการรีสตาร์ทจะถูกกำหนดไว้ที่ส่วนกลางในไฟล์ Canonical

สำหรับการปรับใช้ผ่านอินเทอร์เน็ต ให้ผูกพอร์ต 1349 เข้ากับลูปแบ็คและยุติ TLS ที่พร็อกซีย้อนกลับที่ได้รับการดูแล สร้างข้อมูลรับรอง PostgreSQL และ Redis ที่ไม่ซ้ำกัน จัดเก็บข้อมูลลับในไฟล์ที่ได้รับการป้องกันหรือเครื่องมือจัดการความลับ และเปลี่ยนรหัสผ่านผู้ดูแลระบบเริ่มต้นทันที

### ทำไม `read_only` ถึงไม่ได้ตั้งค่า {#why-read-only-is-not-set}

ไม่ได้ตั้งค่า `read_only: true` เนื่องจากการรีแมป PUID/PGID เขียนไปยัง `/etc/passwd` และ `/etc/group` เมื่อเริ่มต้น หากคุณใช้แฟล็ก `--user` ของ Docker หรือ Kubernetes `runAsUser` แทน PUID/PGID คุณสามารถเปิดใช้งานระบบไฟล์รูทแบบอ่านอย่างเดียวได้อย่างปลอดภัย

## การแยกเครือข่าย {#network-isolation}

การประมวลผลไฟล์เป็นแบบโลคัล แต่การติดตั้งเริ่มต้นคือ **ไม่ใช่ระบบที่ไม่มีทางออก** การวิเคราะห์ผลิตภัณฑ์แบบไม่เปิดเผยตัวตนใช้ PostHog และการรายงานข้อขัดข้องจะใช้ Sentry เมื่อเปิดใช้งานการวัดและส่งข้อมูลทางไกล ตั้งค่า `SNAPOTTER_TELEMETRY=0` (หรือปิดใช้งานการวิเคราะห์ภายใต้การตั้งค่า > ระบบ > ความเป็นส่วนตัว) เพื่อปิดทั้งสองอย่าง SnapOtter จะไม่รวมไฟล์ที่อัพโหลด ชื่อไฟล์ เอาต์พุต OCR ข้อความในเอกสาร หรือเนื้อหาไฟล์อื่น ๆ ในเหตุการณ์เหล่านั้น

การรับส่งข้อมูลขาออกอื่นๆ ขับเคลื่อนด้วยฟีเจอร์: ดาวน์โหลดการติดตั้งชุด AI/โมเดล อินพุตรีลีสที่เซ็นชื่อ; การนำเข้า URL ดึง URL สาธารณะที่ผู้ใช้ร้องขอ และการกำหนดค่า OIDC, SAML, OpenTelemetry, webhooks, พื้นที่เก็บข้อมูลที่เข้ากันได้กับ S3 หรือการบูรณาการที่คล้ายกันที่กำหนดค่าไว้อย่างชัดเจน จะติดต่อกับปลายทางที่ผู้ดูแลระบบเลือก การดาวน์โหลดโมเดลขณะรันไทม์ถูกปิดใช้งานโดยค่าเริ่มต้น ตั้งค่า `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` เฉพาะเมื่อต้องการเปิดใช้การดาวน์โหลดสำรองอัตโนมัติอย่างชัดเจน [การนำเข้าบันเดิลออฟไลน์](/th/guide/deployment) สามารถจัดเตรียมฟีเจอร์ AI โดยไม่ต้องมีโมเดลรันไทม์ขาออก

**คำแนะนำไฟร์วอลล์:**

|สถานการณ์|กฎขาออก|
|---|---|
|มีช่องว่างอากาศ|ตั้งค่า `SNAPOTTER_TELEMETRY=0` และ `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` ใช้การนำเข้าบันเดิล AI ออฟไลน์ ปิดใช้งานการนำเข้า URL และการผสานรวมภายนอก จากนั้นบล็อกทางออก|
|การวัดและส่งข้อมูลทางไกลเริ่มต้น|อนุญาตตำแหน่งข้อมูล PostHog และ Sentry ที่แสดงโดยบันทึกของเบราว์เซอร์/เครือข่ายของคุณ ปิดใช้งานการวัดและส่งข้อมูลทางไกลหากนโยบายไม่อนุญาต|
|จำเป็นต้องมีชุด AI|ระหว่างการติดตั้ง ให้อนุญาต HTTPS เป็น `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` จากนั้นจึงบล็อกโฮสต์เหล่านั้น|
|การบูรณาการภายนอก|อนุญาตเฉพาะปลายทาง OIDC/SAML/OTLP/webhook/object-storage ที่ผู้ดูแลระบบกำหนดค่าไว้เท่านั้น|

ไฟล์เก็บถาวรแบบบันเดิลให้บริการจากพื้นที่จัดเก็บ Xet ของ Hugging Face ซึ่งถ่ายโอนผ่านตำแหน่งข้อมูล `*.xethub.hf.co` แบบขนาน และเป็นสิ่งที่ทำให้การดาวน์โหลดบันเดิลหลาย GB รวดเร็ว หากไฟร์วอลล์ของคุณอนุญาต `huggingface.co` แต่บล็อก `*.xethub.hf.co` การติดตั้งยังคงสำเร็จแต่กลับไปดาวน์โหลดแบบสตรีมเดี่ยวที่ช้ากว่า ดังนั้นให้อนุญาตโฮสต์ Xet ให้อยู่ในเส้นทางที่รวดเร็ว การติดตั้งแบบออฟไลน์โดยสมบูรณ์สามารถข้ามทั้งหมดนี้ได้และใช้ [การนำเข้าชุดออฟไลน์](/th/guide/deployment) แทน

สำหรับการกำหนดค่าพร็อกซีย้อนกลับ (Nginx, Traefik, Caddy, Cloudflare Tunnels) โปรดดู [คู่มือการปรับใช้](/th/guide/deployment#reverse-proxy)

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

## สำรองและกู้คืน {#backup-and-recovery}

สแต็ก Compose ที่ใช้งานจริงจะกำหนดสี่วอลุ่ม หยุดข้อมูลเข้าและปล่อยให้งานที่ใช้งานอยู่เสร็จสิ้นก่อนทำการสำรองข้อมูลแบบประสานงาน ดังนั้น PostgreSQL, Redis และสถานะไฟล์จะอธิบายจุดเวลาเดียวกัน

|ปริมาณ|สารบัญ|การบำบัดฟื้นฟู|
|---|---|---|
|`SnapOtter-pgdata`|ผู้ใช้ PostgreSQL การตั้งค่า ไปป์ไลน์ งาน ข้อมูลเมตาของไฟล์ และบันทึกการตรวจสอบ|วิกฤต; ใช้การถ่ายโอนข้อมูลแบบลอจิคัลที่รวดเร็วเมื่อล้มเหลวสำหรับการกู้คืนแบบพกพา|
|`SnapOtter-data`|ออบเจ็กต์ไลบรารี บันทึก และสถานะ AI ที่บันทึกไว้ (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|สำรองข้อมูลทั้งหมด เพื่อประหยัดพื้นที่ จงละเว้นสถานะ AI ทั้งหมดอย่างจงใจ และติดตั้งบันเดิลใหม่|
|`SnapOtter-redisdata`|Redis AOF สำหรับสถานะคิว BullMQ ที่ทนทาน|สำรองข้อมูลหลังจากหยุดแอปชั่วคราวและบังคับให้ `SAVE`; จำเป็นต้องกลับมาทำงานต่อคิวอย่างแน่นอน|
|`SnapOtter-workspace`|คีย์การจัดเก็บอ็อบเจ็กต์ชั่วคราว (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|อย่าสำรองข้อมูลหลังจากที่งานทั้งหมดหมดหรือยกเลิก อย่าทิ้งมันในขณะที่งานกำลังทำงานอยู่|

โดยปกติแล้ว เขียนคำนำหน้าชื่อวอลุ่มด้วยชื่อโปรเจ็กต์ แก้ไขวอลลุมแหล่งที่มาจริงจากคอนเทนเนอร์ที่เมาท์ แทนที่จะสมมติว่าชื่อที่แสดง เช่น `SnapOtter-data` เป็นชื่อวอลลุม Docker

### สำรองฐานข้อมูล {#database-backup}

ใช้รูปแบบไฟล์เก็บถาวรที่กำหนดเองของ PostgreSQL และตรวจสอบไฟล์เก็บถาวรก่อนที่จะดำเนินการกับการสำรองข้อมูลว่าเสร็จสมบูรณ์:

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

ทดสอบการสำรองข้อมูลทุกครั้งโดยการกู้คืนลงในสแต็กแยก ตรวจสอบบันทึกฐานข้อมูลและเช็คซัมไฟล์ และเริ่มต้นแอปพลิเคชัน `tests/qa/backup-restore-drill.sh` ของที่เก็บจะปล่อยเกตโดยอัตโนมัติกับ `QA_IMAGE` ที่ชัดเจน

หากแพลตฟอร์มของคุณใช้สแนปช็อตปริมาณที่สอดคล้องกับข้อขัดข้องแทน ให้หยุดทั้งสแต็กก่อนและสแน็ปช็อตวอลุ่มที่สำคัญทั้งหมดเป็นชุดเดียว สำเนาไดเรกทอรีข้อมูล PostgreSQL แบบ Raw จากคอนเทนเนอร์ที่ทำงานอยู่ไม่ใช่การสำรองข้อมูลแบบลอจิคัลที่รองรับ

### ไฟล์และคิวสำรอง {#file-and-queue-backup}

หยุดแอปพลิเคชันชั่วคราวก่อนจับปริมาณไฟล์และคิว ใช้ `docker inspect` เพื่อแก้ไขชื่อวอลุ่มจริง บังคับให้ Redis คงสถานะปัจจุบันไว้ และเก็บถาวรโดยคงความเป็นเจ้าของและสิทธิ์ไว้:

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

รีสตาร์ท Redis ก่อนแอปพลิเคชัน หากคุณตั้งใจยกเว้น `/data/ai` ให้ลบทรีย่อย AI ทั้งหมด แทนที่จะเก็บบันทึก `installed.json` โดยไม่มีโมเดลหรือสภาพแวดล้อมเสมือน เก็บไฟล์สำรองเข้ารหัส ควบคุมการเข้าถึง และแยกจากโฮสต์ที่ใช้งาน SnapOtter

## สิ่งประดิษฐ์การปฏิบัติตามข้อกำหนด {#compliance-artifacts}

SnapOtter แต่ละรุ่นมีอาร์ติแฟกต์ด้านความปลอดภัยต่อไปนี้:

| สิ่งประดิษฐ์ | รูปแบบ | จะหาได้ที่ไหน |
|---|---|---|
| ปล่อยเรื่องผูกมัด | การรับรอง Canonical JSON + GitHub | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) เนื้อหา: `snapotter-v{version}-release-subjects.json` |
| เก็บถาวร SBOM | CycloneDX และ SPDX JSON | เนื้อหาที่เผยแพร่: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| รูปภาพ SBOM | CycloneDX และ SPDX JSON | เนื้อหาที่เผยแพร่: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| การสแกนช่องโหว่ | Trivy JSON | เผยแพร่เนื้อหาที่มีคำนำหน้า `archive-linux-{arch}` หรือ `image-linux-{arch}` ที่ตรงกัน |
| การสแกนช่องโหว่ | SARIF | แท็บ [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| การวิเคราะห์แบบคงที่ | CodeQL (JS/TS + Python) | แท็บ [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) รันรายสัปดาห์ + ต่อ PR |
| การตรวจสอบการพึ่งพา | GitHub เนทิฟ | การตรวจสอบต่อ PR ล้มเหลวในการเพิ่มที่มีความรุนแรงสูง |
| การตรวจสอบการพึ่งพา Python | pip-audit | CI รันบันทึกทุกครั้งที่กด |
| นโยบายความปลอดภัย | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) ในพื้นที่เก็บข้อมูล |
| การอัปเดตการพึ่งพา | Dependabot | PR รายสัปดาห์อัตโนมัติสำหรับ npm, pip, Docker, Actions |

**เรียกใช้การสแกนของคุณเอง:**

ดาวน์โหลดรายการหัวข้อการเผยแพร่และตรวจสอบว่าได้รับการยืนยันโดยเวิร์กโฟลว์การเผยแพร่:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

ไฟล์ Manifest จะบันทึก `releaseTag`, `releaseCommit` และ `workflowTriggerCommit` แยกกัน ตรวจสอบว่า `releaseCommit` เป็นคอมมิตที่ลอกออกจากแท็กที่ไม่เปลี่ยนรูปแบบ จากนั้นตรวจสอบการแยกย่อย SHA-256 ของไฟล์เก็บถาวร รูปภาพ SBOM หรือการสแกนที่คุณใช้โดยเทียบกับรายการใน `subjects` ความแตกต่างนี้มีเจตนา: การตรวจสอบการคอมมิตรีลีสที่สร้างขึ้นใหม่จะไม่เปลี่ยนเอกลักษณ์การคอมมิตในข้อมูลรับรอง OIDC ของเวิร์กโฟลว์

คุณยังสามารถสแกน SBOM ที่ดาวน์โหลดมาหรือรูปภาพได้โดยตรง:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
รูปภาพ SBOMs และการสแกนสะท้อนถึงรูปภาพเฉพาะทางสถาปัตยกรรมที่เผยแพร่สำหรับรุ่นนั้น ไฟล์เก็บถาวร SBOMs และการสแกนจะอธิบายไฟล์เก็บถาวรที่สร้างไว้ล่วงหน้าแยกกัน บันเดิลโมเดล AI ที่ติดตั้งหลังจากการปรับใช้จะไม่รวมอยู่ใน SBOMs เหล่านี้ เนื่องจากมีการดาวน์โหลดขณะรันไทม์
:::
