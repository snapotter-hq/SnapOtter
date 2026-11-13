---
description: "डिफ़ॉल्ट मानों के साथ SnapOtter के सभी environment variables। auth, स्टोरेज, AI मॉडल, analytics और बहुत कुछ कॉन्फ़िगर करें।"
i18n_source_hash: caa895c0ba16
i18n_provenance: machine
i18n_output_hash: 3a3ecd97b5f3
i18n_hash_version: 2
---

# कॉन्फ़िगरेशन {#configuration}

सारा कॉन्फ़िगरेशन environment variables के ज़रिए किया जाता है। हर variable का एक उचित डिफ़ॉल्ट मान है, इसलिए इनमें से कोई भी सेट किए बिना SnapOtter सीधे काम करता है।

## Environment variables {#environment-variables}

### सर्वर {#server}

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `PORT` | `1349` | वह पोर्ट जिस पर सर्वर सुनता है। |
| `BASE_PATH` | (खाली) | सार्वजनिक डिप्लॉयमेंट पाथ, जैसे `/snapotter`। खाली या `/` होने पर डोमेन के रूट पर सर्व होता है। रनटाइम पर लागू होता है; इमेज को दोबारा बनाने की ज़रूरत नहीं। |
| `RATE_LIMIT_PER_MIN` | `1000` | प्रति IP प्रति मिनट अधिकतम अनुरोध। रेट लिमिटिंग बंद करने के लिए 0 सेट करें। |
| `CORS_ORIGIN` | (खाली) | CORS के लिए अल्पविराम से अलग किए गए अनुमत origins, या केवल same-origin के लिए खाली। |
| `LOG_LEVEL` | `info` | लॉग का विस्तार स्तर। इनमें से एक: `fatal`, `error`, `warn`, `info`, `debug`, `trace`। |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | कौन से peers `X-Forwarded-For` के ज़रिए क्लाइंट IP सेट कर सकते हैं। डिफ़ॉल्ट केवल प्राइवेट-नेटवर्क peer पर भरोसा करता है, इसलिए Docker नेटवर्क या LAN पर मौजूद reverse proxy पर भरोसा किया जाता है और किसी सार्वजनिक क्लाइंट के जाली header पर नहीं। `true` तभी सेट करें जब आपके नियंत्रण वाला कोई proxy सार्वजनिक पते पर सामने बैठा हो। |

### प्रमाणीकरण {#authentication}

नीचे के दोनों boolean केवल `true` और `false` स्वीकार करते हैं। इसके अलावा कुछ भी, `1` या `yes` या `on`, सत्यापन में विफल होता है और सर्वर सुनना शुरू करने से पहले ही बंद हो जाता है।

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `AUTH_ENABLED` | `true` | लॉगिन आवश्यक करें। इसे `false` पर सेट करने से बिना किसी खाते के चलता है, जिससे हर अनुरोध को एडमिन अधिकार मिल जाते हैं, इसलिए इसे केवल भरोसेमंद नेटवर्क तक सीमित रखें। |
| `DEFAULT_USERNAME` | `admin` | शुरुआती एडमिन खाते का उपयोगकर्ता नाम। केवल पहली बार चलाने पर उपयोग होता है। |
| `DEFAULT_PASSWORD` | `admin` | शुरुआती एडमिन खाते का पासवर्ड। पहले लॉगिन के बाद इसे बदल दें। |
| `MAX_USERS` | `0` (असीमित) | पंजीकृत उपयोगकर्ता खातों की अधिकतम संख्या। असीमित के लिए 0 सेट करें। |
| `SESSION_DURATION_HOURS` | `168` | लॉगिन सत्र की अवधि घंटों में (डिफ़ॉल्ट 7 दिन है)। |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | पहले लॉगिन पर ज़बरदस्ती पासवर्ड बदलने का प्रॉम्प्ट छोड़ने के लिए `true` पर सेट करें। |

### स्टोरेज {#storage}

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` या `s3`। S3 और MinIO के लिए s3_storage फ़ीचर वाला लाइसेंस और नीचे दिए गए `S3_*` variables चाहिए। |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL कनेक्शन स्ट्रिंग, और वह कनेक्शन जिस पर हर अनुरोध सर्व होता है। 2.3.0 और बाद के संस्करणों में `DATABASE_MIGRATION_URL` भी सेट करें और यह सबसे कम विशेषाधिकार वाली रनटाइम भूमिका बन जाती है, जिसके पास ऐप की तालिकाओं पर केवल DML होता है और कुछ नहीं। Compose स्टैक इसे अपनी `postgres` सेवा की ओर इंगित करता है; embedded मोड पाने के लिए इसे (`REDIS_URL` के साथ) अनसेट छोड़ दें। |
| `DATABASE_MIGRATION_URL` | (खाली) | विशेषाधिकार प्राप्त कनेक्शन, जो केवल boot के दौरान migrations चलाने और रनटाइम भूमिका को अनुमतियाँ देने के लिए उपयोग होता है, फिर पहले अनुरोध से पहले बंद हो जाता है। इसे खाली छोड़ें तो SnapOtter एकल-भूमिका में चलता है, जहाँ `DATABASE_URL` दोनों काम करता है। देखें [सबसे कम विशेषाधिकार वाली भूमिकाएँ](/hi/guide/database#least-privilege-roles)। |
| `REDIS_URL` | `redis://localhost:6379` | Redis कनेक्शन स्ट्रिंग (BullMQ जॉब कतारों के लिए उपयोग होती है)। Compose इसे अपनी `redis` सेवा की ओर इंगित करता है। |
| `WORKSPACE_PATH` | `./tmp/workspace` | प्रोसेसिंग के दौरान अस्थायी फ़ाइलों की डायरेक्टरी। अपने आप साफ़ हो जाती है। इमेज `/tmp/workspace` सेट करती है। |
| `FILES_STORAGE_PATH` | `./data/files` | स्थायी उपयोगकर्ता फ़ाइलों (अपलोड की गई इमेज, सहेजे गए परिणाम) की डायरेक्टरी। इमेज `/data/files` सेट करती है। |

### S3 ऑब्जेक्ट स्टोरेज {#s3-object-storage}

केवल तब पढ़ा जाता है जब `STORAGE_MODE=s3`। तीन ज़रूरी में से कोई भी छूट जाए तो स्टार्टअप उस variable के नाम के साथ विफल हो जाता है जिसे आपने छोड़ा।

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `S3_BUCKET` | (खाली) | वह bucket जिसमें अपलोड और आउटपुट रहते हैं। आवश्यक। |
| `S3_ACCESS_KEY_ID` | (खाली) | एक्सेस की। आवश्यक। कंटेनर में आप इसे `S3_ACCESS_KEY_ID_FILE` के ज़रिए माउंट भी कर सकते हैं। |
| `S3_SECRET_ACCESS_KEY` | (खाली) | सीक्रेट की। आवश्यक। वही फ़ाइल परिपाटी: `S3_SECRET_ACCESS_KEY_FILE`। |
| `S3_REGION` | `us-east-1` | Bucket का क्षेत्र। |
| `S3_ENDPOINT` | (खाली) | MinIO, R2, Backblaze और अन्य S3-संगत स्टोर के लिए कस्टम endpoint। खाली का अर्थ AWS है। |
| `S3_FORCE_PATH_STYLE` | `false` | MinIO और ऐसी किसी भी चीज़ के लिए `true` पर सेट करें जो virtual-host एड्रेसिंग की जगह `endpoint/bucket/key` चाहती है। |
| `S3_PREFIX` | (खाली) | Key का prefix, ताकि एक bucket में कई instances रह सकें। |

### विश्राम अवस्था में एन्क्रिप्शन {#encryption-at-rest}

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (खाली) | 64 hex अक्षर (32 बाइट)। डेटाबेस में सहेजी गई संवेदनशील सेटिंग्स को एन्क्रिप्ट करता है। 64 hex अक्षरों से अलग कुछ भी स्टार्टअप पर अस्वीकार कर दिया जाता है। |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (खाली) | वह key जिसे आप बदल रहे हैं, उसी प्रारूप में। रोटेशन के दौरान दोनों सेट करें ताकि मौजूदा पंक्तियाँ अब भी डिक्रिप्ट हों, फिर इसे हटा दें। |

### Embedded मोड {#embedded-mode}

इमेज को `DATABASE_URL` और `REDIS_URL` के बिना चलाएँ और यह कंटेनर के अंदर अपना PostgreSQL 17 और Redis शुरू कर लेता है, जो loopback से बंधे होते हैं और सारा डेटा `/data` वॉल्यूम पर रहता है। यह quick start, homelab और 1.x से अपग्रेड के लिए एक-कमांड वाला `docker run` अनुभव लौटाता है। यह सुविधा का रास्ता है, प्रोडक्शन डिप्लॉयमेंट नहीं: प्रोडक्शन के लिए अलग PostgreSQL और Redis के साथ 3-कंटेनर Compose स्टैक चलाएँ। Embedded मोड के लिए कंटेनर को root के रूप में चलाना ज़रूरी है और यह मनमाने-UID वाले रनटाइम (OpenShift, Kubernetes `runAsNonRoot`) के साथ असंगत है; वहाँ Compose का उपयोग करें।

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `EMBEDDED` | `auto` | जब `DATABASE_URL` और `REDIS_URL` दोनों अनसेट हों तो अपने आप चालू हो जाता है। इसे बंद करने के लिए `0` पर सेट करें (तब ऐप चुपचाप कंटेनर के अंदर डेटाबेस शुरू करने की जगह तुरंत विफल हो जाता है यदि कोई बाहरी `DATABASE_URL`/`REDIS_URL` सेट नहीं है)। |
| `REDIS_MAXMEMORY` | `512mb` | Embedded Redis की मेमोरी सीमा (केवल embedded मोड में)। Raspberry Pi जैसे कम मेमोरी वाले होस्ट पर इसे घटाएँ। |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Boot, embedded Redis के `PING` का उत्तर देने तक कितने सेकंड प्रतीक्षा करता है, फिर हार मान लेता है। टाइमआउट होने पर कंटेनर रुक जाता है और कारण लॉग करता है, अटका नहीं रहता। 1 से 999999 तक पूरे सेकंड; कोई असीमित मान नहीं है, क्योंकि हमेशा के लिए प्रतीक्षा करना ही वह विफलता है जिसे रोकने के लिए यह सीमा है। इसे तभी बढ़ाएँ जब कोई धीमा होस्ट इसे पार कर जाए। |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | वही, embedded PostgreSQL के लिए। घड़ी पहले boot के `initdb` के पूरा होने के बाद शुरू होती है, इसलिए यह शुरुआती डेटाबेस निर्माण की जगह सर्वर स्टार्ट और क्रैश रिकवरी को कवर करती है। |

1.x से अपग्रेड: अपनी पुरानी `snapotter.db` को वॉल्यूम में `/data/snapotter.db` पर रखें और embedded मोड पहले boot पर उसे embedded PostgreSQL में आयात कर लेता है। आयात एक बार चलता है; बाद के boot इसे छोड़ देते हैं।

Telemetry नोट: embedded मोड इमेज का analytics डिफ़ॉल्ट वैसे ही अपनाता है जैसे कोई अन्य कॉन्फ़िगरेशन। प्रकाशित इमेज analytics चालू के साथ आती है; इसे बंद करने के लिए `--build-arg SNAPOTTER_ANALYTICS=off` के साथ बिल्ड करें, या ऐप में एडमिन opt-out का उपयोग करें।

### प्रोसेसिंग सीमाएँ {#processing-limits}

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (असीमित) | प्रति अपलोड अधिकतम फ़ाइल आकार मेगाबाइट में। असीमित के लिए 0 सेट करें। प्रकाशित इमेज `0` के साथ आती है; सोर्स बिल्ड 100 से शुरू होता है। |
| `MAX_BATCH_SIZE` | `0` (असीमित) | एक batch अनुरोध में फ़ाइलों की अधिकतम संख्या। असीमित के लिए 0 सेट करें। प्रकाशित इमेज `0` के साथ आती है; सोर्स बिल्ड 100 से शुरू होता है। |
| `CONCURRENT_JOBS` | `0` (ऑटो) | समानांतर चलने वाले batch जॉब की संख्या। उपलब्ध CPU कोर के आधार पर अपने आप पता लगाने के लिए 0 सेट करें। |
| `MAX_MEGAPIXELS` | `0` (असीमित) | अनुमत अधिकतम इमेज रेज़ोल्यूशन मेगापिक्सल में। असीमित के लिए 0 सेट करें। |
| `MAX_WORKER_THREADS` | `0` (ऑटो) | इमेज प्रोसेसिंग के लिए अधिकतम worker threads। उपलब्ध CPU कोर के आधार पर अपने आप पता लगाने के लिए 0 सेट करें। |
| `PROCESSING_TIMEOUT_S` | `0` (कोई सीमा नहीं) | प्रति अनुरोध अधिकतम प्रोसेसिंग समय सेकंड में। बिना टाइमआउट के लिए 0 सेट करें। |
| `MAX_PIPELINE_STEPS` | `20` | एक pipeline में चरणों की अधिकतम संख्या। बिना सीमा के लिए 0 सेट करें। |
| `MAX_CANVAS_PIXELS` | `0` (कोई सीमा नहीं) | आउटपुट इमेज के लिए अधिकतम कैनवास आकार पिक्सल में। बिना सीमा के लिए 0 सेट करें। |
| `MAX_SVG_SIZE_MB` | `50` | सैनिटाइज़ करने से पहले स्वीकार की जाने वाली सबसे बड़ी SVG, मेगाबाइट में। `0` यहाँ आसपास की पंक्तियों से अलग व्यवहार करता है। यह पार्स से पहले की आकार सीमा को बढ़ाने की जगह पूरी तरह हटा देता है, इसलिए इसे सेट ही रहने दें। |
| `MAX_PDF_PAGES` | `0` (असीमित) | PDF से इमेज रूपांतरण के लिए PDF पृष्ठों की अधिकतम संख्या। असीमित के लिए 0 सेट करें। |

### इंजन {#engines}

SnapOtter कंटेनर के अंदर `$PATH` पर हर प्रोसेसिंग binary को खोजता है, इसलिए ये खाली रहते हैं जब तक आप अपना खुद का बिल्ड माउंट न करें।

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `FFMPEG_PATH` | (खाली) | वीडियो और ऑडियो टूल के पीछे की `ffmpeg` binary का पाथ। |
| `FFPROBE_PATH` | (खाली) | `ffprobe` का पाथ, जो मीडिया फ़ाइलों को प्रोसेस होने से पहले पढ़ता है। इसे `FFMPEG_PATH` के उसी बिल्ड की ओर इंगित करें। |
| `QPDF_PATH` | (खाली) | `qpdf` का पाथ, जो PDF टूल में और अपलोड किए गए PDF जाँचने में उपयोग होता है। |
| `SOFFICE_PATH` | (खाली) | LibreOffice के `soffice` का पाथ, जो ऑफ़िस दस्तावेज़ रूपांतरण के लिए उपयोग होता है। |
| `PDFCPU_PATH` | (खाली) | `pdfcpu` का पाथ, जो कुछ PDF टूल में उपयोग होता है। |
| `SNAPOTTER_HW_ACCEL` | (खाली) | हार्डवेयर वीडियो एन्कोडर परिवार, `nvenc` या `vaapi`। खाली होने पर सॉफ़्टवेयर से एन्कोड होता है। |

`SNAPOTTER_HW_ACCEL` के लिए उस एन्कोडर परिवार के साथ बना ffmpeg चाहिए, और इमेज के ffmpeg में दोनों में से कोई नहीं है। इमेज की अपनी binary के साथ यह सेटिंग सॉफ़्टवेयर एन्कोडिंग पर लौट जाती है और स्टार्टअप लॉग में यह बताती है। इसका उपयोग करने के लिए अपना ffmpeg बिल्ड माउंट करें, `FFMPEG_PATH` और `FFPROBE_PATH` को उसकी ओर इंगित करें, और कंटेनर को GPU डिवाइस दें। `nvenc` के लिए `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` भी सेट करें: इमेज केवल `compute,utility` माँगती है, और `video` के बिना NVIDIA रनटाइम एन्कोड लाइब्रेरी माउंट नहीं करता, इसलिए एन्कोडर सूचीबद्ध तो होता है पर हर एन्कोड विफल होता है। ऐसा पाथ ओवरराइड जो मौजूद नहीं है या executable नहीं है, वह भी स्टार्टअप लॉग में नामित होता है, और उस binary की ज़रूरत वाला हर जॉब तब तक विफल होता है जब तक आप पाथ ठीक नहीं करते या उसे अनसेट नहीं करते।

प्रकाशित Compose फ़ाइलें ये सभी छह `.env` से आगे पास करती हैं, इसलिए उन्हें वहीं सेट करना पर्याप्त है।

### सफ़ाई {#cleanup}

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | बिना सहेजे प्रोसेसिंग परिणाम (कच्चे अपलोड और टूल आउटपुट) स्वचालित रूप से हटाए जाने से पहले कितनी देर रखे जाते हैं। जिन फ़ाइलों को आप स्पष्ट रूप से Files लाइब्रेरी में सहेजते हैं वे प्रभावित नहीं होतीं और आपके हटाने तक बनी रहती हैं। |
| `CLEANUP_INTERVAL_MINUTES` | `60` | सफ़ाई जॉब कितनी बार चलता है। |

### दिखावट {#appearance}

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `DEFAULT_THEME` | `light` | नए सत्रों के लिए डिफ़ॉल्ट थीम। `light`, `dark`, या `system`। |
| `DEFAULT_LOCALE` | `en` | डिफ़ॉल्ट इंटरफ़ेस भाषा। |
| `DEFAULT_TOOL_VIEW` | `sidebar` | डिफ़ॉल्ट टूल लेआउट। `sidebar` या `fullscreen`। |

### Docker अनुमतियाँ {#docker-permissions}

| Variable | डिफ़ॉल्ट | विवरण |
|---|---|---|
| `PUID` | `999` | कंटेनर प्रोसेस को इस UID के रूप में चलाएँ। bind mounts के लिए इसे अपने होस्ट उपयोगकर्ता से मिलाकर सेट करें (`id -u`)। |
| `PGID` | `999` | कंटेनर प्रोसेस को इस GID के रूप में चलाएँ। bind mounts के लिए इसे अपने होस्ट समूह से मिलाकर सेट करें (`id -g`)। |

## Docker उदाहरण {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

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

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## वॉल्यूम {#volumes}

Docker Compose स्टैक चार वॉल्यूम का उपयोग करता है:

- `/data` (app) - AI मॉडल, Python venv और उपयोगकर्ता फ़ाइलें। रीस्टार्ट के बीच अपलोड की गई फ़ाइलें और इंस्टॉल किए गए AI bundles बनाए रखने के लिए इसे माउंट करें।
- `/tmp/workspace` (app) - प्रोसेस हो रही फ़ाइलों के लिए अस्थायी स्टोरेज। यह अस्थायी हो सकता है, लेकिन इसे माउंट करने से कंटेनर की writable layer भरने से बचती है।
- `SnapOtter-pgdata` (postgres) - PostgreSQL डेटा डायरेक्टरी। इसमें सारा रिलेशनल डेटा रहता है (उपयोगकर्ता, सेटिंग्स, pipelines, जॉब, ऑडिट लॉग)। `pg_dump` या वॉल्यूम स्नैपशॉट से बैकअप लें।
- `SnapOtter-redisdata` (redis) - टिकाऊ जॉब कतारों के लिए Redis append-only फ़ाइल।