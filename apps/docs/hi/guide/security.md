---
description: "SnapOtter के लिए सुरक्षा hardening गाइड। Container सुरक्षा, network isolation, Docker secrets, Kubernetes deployment, और compliance artifacts।"
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 558ff20c2ae9
i18n_hash_version: 2
---

# सुरक्षा और Hardening {#security-hardening}

SnapOtter फ़ाइलों को पूरी तरह आपके अपने infrastructure पर प्रोसेस करता है। प्रोजेक्ट को बेहतर बनाने में मदद के लिए यह डिफ़ॉल्ट रूप से गुमनाम, सामग्री-रहित product analytics और crash reports भेजता है। यह आपकी फ़ाइलें, फ़ाइल नाम, फ़ाइल सामग्री, OCR output, image metadata, या दस्तावेज़ का टेक्स्ट कभी नहीं भेजता। वैकल्पिक फ़ीडबैक केवल तब भेजा जाता है जब उपयोगकर्ता उसे सबमिट करे, केवल तब जब analytics सक्षम हो, और संपर्क फ़ील्ड केवल स्पष्ट संपर्क सहमति के साथ शामिल होते हैं। कोई administrator Settings > System > Privacy में एक क्लिक से analytics और फ़ीडबैक कैप्चर बंद कर सकता है, rebuild की ज़रूरत नहीं। फ़ाइल प्रोसेसिंग हमेशा आपके container के भीतर ही रहती है।

Container एक समर्पित non-root उपयोगकर्ता (`snapotter`) के रूप में चलता है, जिसमें न्यूनतम आवश्यक सेट को छोड़कर सभी Linux capabilities हटा दी जाती हैं। पूरी vulnerability disclosure policy और सुरक्षा architecture के लिए GitHub पर [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) देखें।

## Container Hardening {#container-hardening}

Canonical [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) और [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) Compose फ़ाइलें ही सत्य का स्रोत हैं। संक्षिप्त उदाहरण को production में कॉपी न करें; उस release tag की फ़ाइल deploy करें जिसे आपने सत्यापित किया है।

दोनों stacks ये नियंत्रण लागू करते हैं:

- Memory, swap, CPU, और PID सीमाएँ बेकाबू native processing को रोकती हैं।
- हर service सभी Linux capabilities हटा देती है। Application केवल volume ownership, एकतरफ़ा `gosu` identity drop, और graceful signal forwarding के लिए `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` वापस जोड़ता है। PostgreSQL और Redis को केवल वही उपसमूह मिलता है जो उनके आधिकारिक entrypoints को चाहिए।
- `security_opt: [no-new-privileges:true]` application, PostgreSQL, और Redis containers की processes को अतिरिक्त privileges पाने से रोकता है। यह `gosu` के साथ संगत रहता है: entrypoint root के रूप में शुरू होता है, volumes तैयार करता है, और केवल समर्पित `snapotter` उपयोगकर्ता पर आता है।
- PostgreSQL और Redis image इनपुट्स digest द्वारा pin किए गए हैं। Application को भी `latest` के बजाय सत्यापित release tag या digest पर pin किया जाना चाहिए।
- Health checks, सीमित JSON log rotation, durable Redis AOF, और restart policy canonical फ़ाइलों में केंद्रीय रूप से परिभाषित हैं।

इंटरनेट-सामने वाले deployment के लिए, port 1349 को loopback से bind करें और TLS को किसी रखरखाव-युक्त reverse proxy पर समाप्त करें। PostgreSQL और Redis के लिए अलग-अलग credentials बनाएँ, secrets को सुरक्षित फ़ाइलों या secret manager में रखें, और शुरुआती administrator पासवर्ड तुरंत बदल दें।

### `read_only` सेट क्यों नहीं है {#why-read-only-is-not-set}

`read_only: true` सेट नहीं है क्योंकि PUID/PGID remapping startup पर `/etc/passwd` और `/etc/group` में लिखता है। यदि आप PUID/PGID के बजाय Docker के `--user` flag या Kubernetes `runAsUser` का उपयोग करते हैं, तो आप read-only root filesystem सुरक्षित रूप से सक्षम कर सकते हैं।

## Network Isolation {#network-isolation}

फ़ाइल प्रोसेसिंग local है, लेकिन डिफ़ॉल्ट इंस्टॉलेशन **egress-मुक्त सिस्टम नहीं है**। Telemetry सक्षम होने पर गुमनाम product analytics PostHog का और crash reporting Sentry का उपयोग करती है। दोनों बंद करने के लिए `SNAPOTTER_TELEMETRY=0` सेट करें (या Settings > System > Privacy में analytics बंद करें)। SnapOtter उन events में अपलोड की गई फ़ाइलें, फ़ाइल नाम, OCR output, दस्तावेज़ का टेक्स्ट, या अन्य फ़ाइल सामग्री कभी शामिल नहीं करता।

अन्य outbound traffic फ़ीचर-आधारित है: AI bundle/model इंस्टॉलेशन signed release inputs डाउनलोड करता है; URL import उपयोगकर्ता द्वारा माँगा गया सार्वजनिक URL fetch करता है; और स्पष्ट रूप से कॉन्फ़िगर किए गए OIDC, SAML, OpenTelemetry, webhooks, S3-compatible storage, या समान integrations administrator द्वारा चुने गए destinations से संपर्क करते हैं। Runtime model downloads डिफ़ॉल्ट रूप से बंद हैं। स्वचालित fallback downloads को स्पष्ट रूप से चुनने के लिए ही `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` सेट करें। [Offline bundle import](/hi/guide/deployment) runtime model egress के बिना AI फ़ीचर्स उपलब्ध करा सकता है।

**Firewall सुझाव:**

| परिदृश्य | Outbound नियम |
|---|---|
| Air-gapped | `SNAPOTTER_TELEMETRY=0` और `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` सेट करें, offline AI bundle import का उपयोग करें, URL import और बाहरी integrations बंद करें, फिर egress ब्लॉक करें |
| डिफ़ॉल्ट telemetry | आपके browser/network logs में सूचीबद्ध PostHog और Sentry endpoints को अनुमति दें; यदि नीति इनकी अनुमति नहीं देती तो telemetry बंद करें |
| AI bundles चाहिए | इंस्टॉलेशन के दौरान `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` पर HTTPS की अनुमति दें; फिर उन hosts को ब्लॉक करें |
| बाहरी integrations | केवल administrator द्वारा कॉन्फ़िगर किए गए सटीक OIDC/SAML/OTLP/webhook/object-storage destinations को अनुमति दें |

Bundle archives Hugging Face के Xet storage से परोसे जाते हैं, जो `*.xethub.hf.co` endpoints पर समानांतर रूप से ट्रांसफ़र करता है और कई GB के bundle downloads को तेज़ बनाता है। यदि आपका firewall `huggingface.co` को अनुमति देता है लेकिन `*.xethub.hf.co` को ब्लॉक करता है, तो इंस्टॉल फिर भी सफल होते हैं लेकिन धीमे single-stream download पर लौट आते हैं, इसलिए तेज़ रास्ते पर बने रहने के लिए Xet hosts को allowlist करें। पूरी तरह offline इंस्टॉल इस सबको छोड़कर इसके बजाय [Offline Bundle Import](/hi/guide/deployment) का उपयोग कर सकते हैं।

Reverse proxy कॉन्फ़िगरेशन (Nginx, Traefik, Caddy, Cloudflare Tunnels) के लिए [Deployment guide](/hi/guide/deployment#reverse-proxy) देखें।

## Docker Secrets {#docker-secrets}

Production deployments में secrets को plain-text environment variables के रूप में पास करने से बचें। Entrypoint Docker की `_FILE` परिपाटी का समर्थन करता है: secret को फ़ाइल के रूप में mount करें और संबंधित `_FILE` variable को उसके path पर सेट करें।

**समर्थित secrets:**

| Variable | `_FILE` समकक्ष |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose secrets के साथ उदाहरण:**

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
Docker Compose secrets (Swarm के बिना) के लिए Compose v2.23 या उससे नया संस्करण चाहिए।
:::

## Kubernetes Deployment {#kubernetes-deployment}

Entrypoint पहचान लेता है कि container पहले से non-root के रूप में चल रहा है (जैसे Kubernetes `runAsUser` के ज़रिए) और gosu privilege drop अपने आप छोड़ देता है। उस स्थिति में वह mount किए गए volumes पर खुद chown नहीं कर सकता, इसलिए वह जाँचता है कि वे writable हैं या नहीं, और न होने पर उपयोगी मार्गदर्शन के साथ जल्दी बाहर निकल जाता है। `fsGroup` और foreign-UID सेटअप (TrueNAS, OpenShift) के लिए [Storage permissions](/hi/guide/deployment#storage-permissions) देखें।

**अनुशंसित Pod SecurityContext:**

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

क्योंकि `runAsUser: 999` pod स्तर पर सेट है, entrypoint gosu को पूरी तरह छोड़ देता है। इससे `allowPrivilegeEscalation: false` और `drop: [ALL]` capabilities बिना टकराव के काम करती हैं।

Resource sizing के लिए [Hardware Requirements](/hi/guide/deployment#hardware-requirements) देखें।

## Backup और Recovery {#backup-and-recovery}

Production Compose stack चार volumes परिभाषित करता है। समन्वित backup लेने से पहले ingress रोकें और सक्रिय jobs को पूरा होने दें, ताकि PostgreSQL, Redis, और फ़ाइल स्थिति एक ही समय बिंदु का वर्णन करें।

| Volume | सामग्री | Recovery में व्यवहार |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL users, सेटिंग्स, pipelines, jobs, फ़ाइल metadata, और audit log | महत्वपूर्ण; portable recovery के लिए fail-fast logical dump का उपयोग करें |
| `SnapOtter-data` | सेव किए गए library objects, logs, और AI स्थिति (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | पूरे volume का backup लें; जगह बचाने के लिए सारी AI स्थिति को जानबूझकर छोड़ दें और उसके bundles दोबारा इंस्टॉल करें |
| `SnapOtter-redisdata` | Durable BullMQ queue स्थिति के लिए Redis AOF | ऐप को pause करके और `SAVE` को बाध्य करके backup लें; queued काम को ठीक वहीं से शुरू करने के लिए आवश्यक |
| `SnapOtter-workspace` | अस्थायी object-storage keys (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | सभी jobs के drain या रद्द होने के बाद backup न लें; jobs सक्रिय रहते हुए इसे कभी न हटाएँ |

Compose आम तौर पर volume नामों के आगे project का नाम जोड़ता है। असली source volume को mount किए गए container से पता करें, यह मानकर न चलें कि `SnapOtter-data` जैसा कोई प्रदर्शित नाम ही Docker volume का नाम है।

### Database backup {#database-backup}

PostgreSQL के custom archive format का उपयोग करें और backup को पूर्ण मानने से पहले archive सत्यापित करें:

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

हर backup को एक अलग stack में restore करके, database रिकॉर्ड और फ़ाइल checksums जाँचकर, और application शुरू करके परखें। रिपॉज़िटरी का `tests/qa/backup-restore-drill.sh` उस release gate को किसी स्पष्ट `QA_IMAGE` के विरुद्ध स्वचालित करता है।

यदि आपका platform इसके बजाय crash-consistent volume snapshots लेता है, तो पहले पूरे stack को रोकें और सभी महत्वपूर्ण volumes का एक सेट के रूप में snapshot लें। चालू container से PostgreSQL data-directory की कच्ची कॉपी समर्थित logical backup नहीं है।

### फ़ाइल और queue backup {#file-and-queue-backup}

फ़ाइल और queue volumes कैप्चर करने से पहले application को pause करें। वास्तविक volume नाम पता करने, Redis को उसकी मौजूदा स्थिति persist कराने, और ownership व permissions सुरक्षित रखते हुए archive बनाने के लिए `docker inspect` का उपयोग करें:

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

Application से पहले Redis को दोबारा शुरू करें। यदि आप जानबूझकर `/data/ai` को बाहर रखते हैं, तो models या virtual environment के बिना `installed.json` रिकॉर्ड रखने के बजाय पूरा AI subtree हटा दें। Backup फ़ाइलों को encrypted, access-controlled, और SnapOtter चलाने वाले host से अलग रखें।

## Compliance Artifacts {#compliance-artifacts}

हर SnapOtter release में ये सुरक्षा artifacts शामिल होते हैं:

| Artifact | Format | कहाँ मिलेगा |
|---|---|---|
| Release subject binding | Canonical JSON + GitHub attestation | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) asset: `snapotter-v{version}-release-subjects.json` |
| Archive SBOM | CycloneDX और SPDX JSON | Release assets: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Image SBOM | CycloneDX और SPDX JSON | Release assets: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Vulnerability scans | Trivy JSON | मेल खाते `archive-linux-{arch}` या `image-linux-{arch}` prefixes वाले Release assets |
| Vulnerability scan | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) टैब |
| Static analysis | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) टैब, साप्ताहिक + प्रति PR चलता है |
| Dependency review | GitHub native | प्रति-PR जाँच, उच्च-गंभीरता वाले जोड़ों पर विफल होती है |
| Python dependency audit | pip-audit | हर push पर CI run log |
| Security policy | Markdown | रिपॉज़िटरी में [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| Dependency updates | Dependabot | npm, pip, Docker, Actions के लिए स्वचालित साप्ताहिक PRs |

**अपना स्कैन चलाना:**

Release-subject manifest डाउनलोड करें और सत्यापित करें कि release workflow ने उसे attest किया था:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifest `releaseTag`, `releaseCommit`, और `workflowTriggerCommit` को अलग-अलग दर्ज करता है। सत्यापित करें कि `releaseCommit` वही commit है जो immutable tag से निकाला गया है, फिर जिस archive, image, SBOM, या scan का आप उपयोग करते हैं उसके SHA-256 digest को `subjects` में उसकी प्रविष्टि से सत्यापित करें। यह भेद जानबूझकर रखा गया है: नए बनाए गए release commit को checkout करने से workflow के OIDC credential में commit पहचान नहीं बदलती।

आप डाउनलोड किए गए SBOM या image को सीधे भी स्कैन कर सकते हैं:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
Image SBOMs और scans उस release के लिए प्रकाशित सटीक architecture-विशिष्ट image को दर्शाते हैं। Archive SBOMs और scans पहले से बने archive का अलग से वर्णन करते हैं। Deployment के बाद इंस्टॉल किए गए AI model bundles इन SBOMs में शामिल नहीं हैं क्योंकि वे runtime पर डाउनलोड होते हैं।
:::
