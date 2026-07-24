---
description: "SnapOtter के लिए सुरक्षा हार्डनिंग गाइड। कंटेनर सुरक्षा, नेटवर्क आइसोलेशन, Docker secrets, Kubernetes डिप्लॉयमेंट, और अनुपालन आर्टिफ़ैक्ट।"
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 1072e94c511d
i18n_hash_version: 2
---

# Security & Hardening {#security-hardening}

SnapOtter फ़ाइलों को पूरी तरह आपके इन्फ़्रास्ट्रक्चर पर प्रोसेस करता है। यह प्रोजेक्ट को बेहतर बनाने में मदद के लिए डिफ़ॉल्ट रूप से अनाम, सामग्री-रहित उत्पाद एनालिटिक्स और क्रैश रिपोर्ट भेजता है। यह कभी आपकी फ़ाइलें, फ़ाइल नाम, फ़ाइल सामग्री, OCR आउटपुट, इमेज मेटाडेटा, या दस्तावेज़ टेक्स्ट नहीं भेजता। वैकल्पिक फ़ीडबैक केवल तभी भेजा जाता है जब कोई उपयोगकर्ता उसे सबमिट करता है, केवल तभी जब एनालिटिक्स सक्षम हो, और संपर्क फ़ील्ड केवल स्पष्ट संपर्क सहमति के साथ ही शामिल होते हैं। एक व्यवस्थापक Settings > System > Privacy के अंतर्गत एक क्लिक में एनालिटिक्स और फ़ीडबैक कैप्चर बंद कर सकता है, किसी रीबिल्ड की आवश्यकता नहीं। फ़ाइल प्रोसेसिंग हमेशा आपके कंटेनर के अंदर ही रहती है।

कंटेनर एक समर्पित गैर-root उपयोगकर्ता (`snapotter`) के रूप में चलता है, जिसमें न्यूनतम आवश्यक सेट को छोड़कर सभी Linux क्षमताएँ हटा दी जाती हैं। पूर्ण भेद्यता प्रकटीकरण नीति और सुरक्षा आर्किटेक्चर के लिए, GitHub पर [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) देखें।

## कंटेनर हार्डनिंग {#container-hardening}

विहित [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) और [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) कंपोज़ फ़ाइलें सत्य का स्रोत हैं। किसी संक्षिप्त उदाहरण को उत्पादन में कॉपी न करें; आपके द्वारा सत्यापित रिलीज़ टैग से फ़ाइल को तैनात करें।

दोनों स्टैक निम्नलिखित नियंत्रण लागू करते हैं:

- मेमोरी, स्वैप, सीपीयू और पीआईडी ​​सीमाओं में अप्रचलित देशी प्रोसेसिंग शामिल है।
- प्रत्येक सेवा सभी Linux क्षमताओं को समाप्त कर देती है। एप्लिकेशन वॉल्यूम ओनरशिप, वन-वे `gosu` आइडेंटिटी ड्रॉप और ग्रेसफुल सिग्नल फ़ॉरवर्डिंग के लिए केवल `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` जोड़ता है। PostgreSQL और Redis को केवल वही उपसमुच्चय प्राप्त होता है जिसकी उनके आधिकारिक प्रवेश बिंदुओं को आवश्यकता होती है।
- `security_opt: [no-new-privileges:true]` एप्लिकेशन, PostgreSQL और Redis कंटेनरों में प्रक्रियाओं को अतिरिक्त विशेषाधिकार प्राप्त करने से रोकता है। यह `gosu` के साथ संगत रहता है: एंट्रीपॉइंट रूट के रूप में शुरू होता है, वॉल्यूम तैयार करता है, और केवल समर्पित `snapotter` उपयोगकर्ता तक पहुंचता है।
- PostgreSQL और Redis छवि इनपुट डाइजेस्ट द्वारा पिन किए गए हैं। एप्लिकेशन को `latest` के बजाय सत्यापित रिलीज़ टैग या डाइजेस्ट पर भी पिन किया जाना चाहिए।
- स्वास्थ्य जांच, बंधे हुए JSON लॉग रोटेशन, टिकाऊ Redis AOF और पुनरारंभ नीति को कैनोनिकल फ़ाइलों में केंद्रीय रूप से परिभाषित किया गया है।

इंटरनेट-फ़ेसिंग परिनियोजन के लिए, पोर्ट 1349 को लूपबैक से बाइंड करें और टीएलएस को एक बनाए हुए रिवर्स प्रॉक्सी पर समाप्त करें। अद्वितीय PostgreSQL और Redis क्रेडेंशियल जेनरेट करें, गुप्त फ़ाइलों या गुप्त प्रबंधक में रहस्य संग्रहीत करें, और प्रारंभिक व्यवस्थापक पासवर्ड तुरंत बदलें।

### `read_only` {#why-read-only-is-not-set} क्यों सेट नहीं है

`read_only: true` सेट नहीं है क्योंकि PUID/PGID रीमैपिंग स्टार्टअप पर `/etc/passwd` और `/etc/group` को लिखता है। यदि आप PUID/PGID के बजाय डॉकर के `--user` ध्वज या Kubernetes `runAsUser` का उपयोग करते हैं, तो आप सुरक्षित रूप से केवल पढ़ने योग्य रूट फ़ाइल सिस्टम को सक्षम कर सकते हैं।

## नेटवर्क अलगाव {#network-isolation}

फ़ाइल प्रोसेसिंग स्थानीय है, लेकिन एक डिफ़ॉल्ट इंस्टॉलेशन **एक निकास-मुक्त सिस्टम नहीं** है। अज्ञात उत्पाद विश्लेषण पोस्टहॉग का उपयोग करते हैं और टेलीमेट्री सक्षम होने पर क्रैश रिपोर्टिंग सेंट्री का उपयोग करती है। दोनों को बंद करने के लिए `SNAPOTTER_TELEMETRY=0` सेट करें (या सेटिंग्स > सिस्टम > गोपनीयता के अंतर्गत एनालिटिक्स अक्षम करें)। SnapOtter में उन घटनाओं में कभी भी अपलोड की गई फ़ाइलें, फ़ाइल नाम, ओसीआर आउटपुट, दस्तावेज़ पाठ या अन्य फ़ाइल सामग्री शामिल नहीं होती है।

अन्य आउटबाउंड ट्रैफ़िक सुविधा-संचालित है: एआई बंडल/मॉडल इंस्टॉलेशन डाउनलोड हस्ताक्षरित रिलीज़ इनपुट; यूआरएल आयात उपयोगकर्ता द्वारा अनुरोधित सार्वजनिक यूआरएल लाता है; और स्पष्ट रूप से कॉन्फ़िगर किए गए OIDC, SAML, OpenTelemetry, webhooks, S3-संगत स्टोरेज, या समान एकीकरण व्यवस्थापक द्वारा चुने गए गंतव्यों से संपर्क करते हैं। रनटाइम मॉडल डाउनलोड डिफ़ॉल्ट रूप से अक्षम हैं। स्वचालित फ़ॉलबैक डाउनलोड को स्पष्ट रूप से सक्षम करने के लिए ही `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` सेट करें। एक [ऑफ़लाइन बंडल आयात](/hi/guide/deployment) रनटाइम मॉडल निकास के बिना एआई सुविधाओं का प्रावधान कर सकता है।

**फ़ायरवॉल अनुशंसाएँ:**

|परिदृश्य|आउटबाउंड नियम|
|---|---|
|हवा से ही गैप|`SNAPOTTER_TELEMETRY=0` और `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` सेट करें, ऑफ़लाइन AI बंडल आयात का उपयोग करें, URL आयात और बाहरी एकीकरण अक्षम करें, फिर निकास को रोकें|
|डिफ़ॉल्ट टेलीमेट्री|अपने ब्राउज़र/नेटवर्क लॉग द्वारा सूचीबद्ध पोस्टहॉग और सेंट्री एंडपॉइंट को अनुमति दें; यदि नीति उन्हें अनुमति नहीं देती है तो टेलीमेट्री अक्षम करें|
|एआई बंडल की जरूरत है|स्थापना के दौरान, HTTPS को `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` की अनुमति दें; फिर उन होस्ट्स को ब्लॉक करें|
|बाहरी एकीकरण|केवल सटीक व्यवस्थापक-कॉन्फ़िगर OIDC/SAML/OTLP/webhook/ऑब्जेक्ट-स्टोरेज गंतव्यों की अनुमति दें|

बंडल अभिलेखागार को हगिंग फेस के एक्सट स्टोरेज से परोसा जाता है, जो समानांतर में `*.xethub.hf.co` एंडपॉइंट पर स्थानांतरित होता है और यही मल्टी-जीबी बंडल डाउनलोड को तेज़ बनाता है। यदि आपका फ़ायरवॉल `huggingface.co` की अनुमति देता है लेकिन `*.xethub.hf.co` को ब्लॉक करता है, तो इंस्टॉल अभी भी सफल होता है लेकिन धीमी सिंगल-स्ट्रीम डाउनलोड पर वापस आ जाता है, इसलिए तेज़ पथ पर बने रहने के लिए Xet होस्ट को अनुमति दें। पूर्णतः ऑफ़लाइन इंस्टॉल यह सब छोड़ सकते हैं और इसके बजाय [ऑफ़लाइन बंडल आयात](/hi/guide/deployment) का उपयोग कर सकते हैं।

रिवर्स प्रॉक्सी कॉन्फ़िगरेशन (Nginx, ट्रैफ़िक, Caddy, Cloudflare टनल) के लिए, [परिनियोजन गाइड](/hi/guide/deployment#reverse-proxy) देखें।

## Docker Secrets {#docker-secrets}

प्रोडक्शन डिप्लॉयमेंट के लिए, secrets को सादा-टेक्स्ट एनवायरनमेंट वेरिएबल के रूप में पास करने से बचें। एंट्रीपॉइंट Docker के `_FILE` कन्वेंशन को सपोर्ट करता है: एक secret को फ़ाइल के रूप में माउंट करें और संबंधित `_FILE` वेरिएबल को उसके पथ पर सेट करें।

**सपोर्टेड secrets:**

| वेरिएबल | `_FILE` समकक्ष |
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
Docker Compose secrets (Swarm के बिना) के लिए Compose v2.23 या बाद का संस्करण आवश्यक है।
:::

## Kubernetes Deployment {#kubernetes-deployment}

एंट्रीपॉइंट पता लगाता है कि कंटेनर पहले से गैर-root के रूप में चल रहा है (उदा., Kubernetes `runAsUser` के माध्यम से) और स्वचालित रूप से gosu विशेषाधिकार गिरना छोड़ देता है। उस स्थिति में यह माउंट किए गए वॉल्यूम को स्वयं chown नहीं कर सकता, इसलिए यह सत्यापित करता है कि वे लिखने योग्य हैं और यदि नहीं हैं तो कार्रवाई-योग्य मार्गदर्शन के साथ जल्दी बाहर निकल जाता है, `fsGroup` और विदेशी-UID सेटअप (TrueNAS, OpenShift) के लिए [Storage permissions](/hi/guide/deployment#storage-permissions) देखें।

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

चूँकि `runAsUser: 999` पॉड स्तर पर सेट है, एंट्रीपॉइंट gosu को पूरी तरह छोड़ देता है। यह `allowPrivilegeEscalation: false` और `drop: [ALL]` क्षमताओं को बिना टकराव के अनुमति देता है।

रिसोर्स आकार निर्धारण के लिए, [Hardware Requirements](/hi/guide/deployment#hardware-requirements) देखें।

## बैकअप और रिकवरी {#backup-and-recovery}

प्रोडक्शन कंपोज़ स्टैक चार खंडों को परिभाषित करता है। प्रवेश रोकें और समन्वित बैकअप लेने से पहले सक्रिय नौकरियों को समाप्त होने दें ताकि PostgreSQL, Redis और फ़ाइल स्थिति एक ही समय बिंदु का वर्णन करें।

|आयतन|अंतर्वस्तु|पुनर्प्राप्ति उपचार|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL उपयोगकर्ता, सेटिंग्स, पाइपलाइन, नौकरियां, फ़ाइल मेटाडेटा और ऑडिट लॉग|गंभीर; पोर्टेबल पुनर्प्राप्ति के लिए फ़ेल-फ़ास्ट लॉजिकल डंप का उपयोग करें|
|`SnapOtter-data`|सहेजे गए लाइब्रेरी ऑब्जेक्ट, लॉग और AI स्थिति (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|संपूर्ण वॉल्यूम का बैकअप लें; स्थान बचाने के लिए, जानबूझकर सभी AI स्थिति को छोड़ दें और उसके बंडलों को पुनः स्थापित करें|
|`SnapOtter-redisdata`|टिकाऊ बुलएमक्यू कतार स्थिति के लिए रेडिस एओएफ|ऐप को रोकने और `SAVE` को बाध्य करने के बाद बैकअप लें; पंक्तिबद्ध कार्य को ठीक से फिर से शुरू करने के लिए आवश्यक है|
|`SnapOtter-workspace`|अस्थायी वस्तु-भंडारण कुंजियाँ (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|सभी कार्य ख़त्म हो जाने या रद्द हो जाने के बाद बैकअप न लें; जब नौकरियाँ सक्रिय हों तो इसे कभी न छोड़ें|

प्रोजेक्ट नाम के साथ सामान्य रूप से उपसर्ग वॉल्यूम नाम लिखें। यह मानने के बजाय कि `SnapOtter-data` जैसा डिस्प्ले नाम डॉकर वॉल्यूम नाम है, माउंट किए गए कंटेनर से वास्तविक स्रोत वॉल्यूम का समाधान करें।

### डेटाबेस बैकअप {#database-backup}

PostgreSQL के कस्टम संग्रह प्रारूप का उपयोग करें और बैकअप को पूर्ण मानने से पहले संग्रह को सत्यापित करें:

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

प्रत्येक बैकअप को एक अलग स्टैक में पुनर्स्थापित करके, डेटाबेस रिकॉर्ड और फ़ाइल चेकसम की जाँच करके और एप्लिकेशन शुरू करके उसका परीक्षण करें। रिपॉजिटरी का `tests/qa/backup-restore-drill.sh` उस रिलीज़ गेट को एक स्पष्ट `QA_IMAGE` के विरुद्ध स्वचालित करता है।

यदि आपका प्लेटफ़ॉर्म इसके बजाय क्रैश-संगत वॉल्यूम स्नैपशॉट लेता है, तो पहले पूरे स्टैक को रोकें और सभी महत्वपूर्ण वॉल्यूम को एक सेट के रूप में स्नैपशॉट लें। चल रहे कंटेनर से एक कच्ची PostgreSQL डेटा-निर्देशिका प्रतिलिपि समर्थित तार्किक बैकअप नहीं है।

### फ़ाइल और कतार बैकअप {#file-and-queue-backup}

फ़ाइल और क्यू वॉल्यूम कैप्चर करने से पहले एप्लिकेशन को रोकें। वास्तविक वॉल्यूम नाम को हल करने के लिए `docker inspect` का उपयोग करें, Redis को उसकी वर्तमान स्थिति को बनाए रखने के लिए बाध्य करें, और स्वामित्व और अनुमतियों को संरक्षित करके संग्रहीत करें:

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

एप्लिकेशन से पहले Redis को पुनरारंभ करें। यदि आप जानबूझकर `/data/ai` को बाहर करते हैं, तो `installed.json` रिकॉर्ड को उसके मॉडल या वर्चुअल वातावरण के बिना संरक्षित करने के बजाय संपूर्ण AI सबट्री को हटा दें। बैकअप फ़ाइलों को एन्क्रिप्टेड, एक्सेस-नियंत्रित और SnapOtter चलाने वाले होस्ट से अलग रखें।

## अनुपालन कलाकृतियाँ {#compliance-artifacts}

प्रत्येक SnapOtter रिलीज़ में निम्नलिखित सुरक्षा कलाकृतियाँ शामिल हैं:

| विरूपण साक्ष्य | प्रारूप | इसे कहां खोजें |
|---|---|---|
| विषय बाइंडिंग जारी करें | कैनोनिकल JSON + GitHub सत्यापन | [GitHub रिलीज़](https://github.com/snapotter-hq/SnapOtter/releases) संपत्ति: `snapotter-v{version}-release-subjects.json` |
| पुरालेख SBOM | CycloneDX और SPDX JSON | रिलीज़ परिसंपत्तियाँ: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| छवि SBOM | CycloneDX और SPDX JSON | रिलीज़ परिसंपत्तियाँ: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| भेद्यता स्कैन | Trivy JSON | मिलान वाले `archive-linux-{arch}` या `image-linux-{arch}` उपसर्गों के साथ संपत्तियाँ जारी करें |
| भेद्यता स्कैन | SARIF | [GitHub सुरक्षा](https://github.com/snapotter-hq/SnapOtter/security) टैब |
| स्थैतिक विश्लेषण | CodeQL (JS/TS + Python) | [GitHub सुरक्षा](https://github.com/snapotter-hq/SnapOtter/security) टैब, साप्ताहिक + प्रति पीआर चलता है |
| निर्भरता की समीक्षा | GitHub मूलनिवासी | प्रति-पीआर जाँच, उच्च-गंभीरता वाले परिवर्धन पर विफल रहती है |
| Python निर्भरता ऑडिट | pip-audit | प्रत्येक पुश पर सीआई रन लॉग |
| सुरक्षा नीति | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) भंडार में |
| निर्भरता अद्यतन | Dependabot | एनपीएम, पिप, Docker, क्रियाओं के लिए स्वचालित साप्ताहिक पीआर |

**अपना स्वयं का स्कैन चला रहा है:**

रिलीज़-विषय मेनिफ़ेस्ट डाउनलोड करें और सत्यापित करें कि यह रिलीज़ वर्कफ़्लो द्वारा प्रमाणित किया गया था:

```bash
gh attestation verify snapotter-v2.1.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

मेनिफेस्ट `releaseTag`, `releaseCommit` और `workflowTriggerCommit` को अलग-अलग रिकॉर्ड करता है। सत्यापित करें कि `releaseCommit` अपरिवर्तनीय टैग से निकाली गई प्रतिबद्धता है, फिर संग्रह, छवि, SBOM के SHA-256 डाइजेस्ट को सत्यापित करें, या `subjects` में इसकी प्रविष्टि के विरुद्ध आपके द्वारा उपभोग किए गए स्कैन को सत्यापित करें। यह अंतर जानबूझकर किया गया है: नव निर्मित रिलीज़ कमिट की जाँच करने से वर्कफ़्लो के OIDC क्रेडेंशियल में कमिट की पहचान नहीं बदलती है।

आप डाउनलोड किए गए SBOM या छवि को सीधे स्कैन भी कर सकते हैं:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.1.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.1.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.1.0
```

::: info
छवि SBOMs और स्कैन उस रिलीज़ के लिए प्रकाशित सटीक वास्तुकला-विशिष्ट छवि को दर्शाते हैं। पुरालेख SBOMs और स्कैन पूर्वनिर्मित पुरालेख का अलग से वर्णन करते हैं। तैनाती के बाद स्थापित AI मॉडल बंडल इन SBOMs में शामिल नहीं हैं क्योंकि वे रनटाइम पर डाउनलोड किए जाते हैं।
:::
