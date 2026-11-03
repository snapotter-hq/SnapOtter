---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: 5280b5fdddd6
i18n_hash_version: 2
---
# कम-संसाधन वाले सेटअप {#low-resource-setups}

SnapOtter छोटे hardware पर अच्छी तरह चलता है: Raspberry Pi 4 या 5, पुराना laptop, या 2 GB का VPS। यह पेज ऐसी मशीनों के लिए व्यावहारिक मार्गदर्शिका है: क्या उम्मीद रखें, समझदार सीमाओं के साथ कॉपी-पेस्ट सेटअप, और कौन से फ़ीचर्स छोड़ दें। इन आँकड़ों के पीछे का पूरा benchmark डेटा [Hardware Requirements](/hi/guide/deployment#hardware-requirements) में है।

शुरुआत में दो कड़ी शर्तें:

- **केवल 64-bit।** Image `linux/amd64` और `linux/arm64` के लिए बनी है। 32-bit ARM (`armv7`/`armhf`) समर्थित नहीं है, इसलिए पहली पीढ़ी के Pi और Pi Zero परिवार बाहर हैं।
- **2 GB मेमोरी की न्यूनतम सीमा (non-AI tools)।** 512 MB में stack शुरू नहीं हो सकता, और 1 GB पर multi-file batches विफल हो जाते हैं। 2 cores के साथ 2 GB वह सबसे छोटा कॉन्फ़िगरेशन है जिस पर non-AI tools आराम से चलते हैं।

## छोटे hardware पर क्या अच्छी तरह चलता है {#what-runs-well}

हर non-AI tool 2 GB / 2-core मशीन पर काम करता है: पूरा Image और Files सेक्शन, PDF tools, और stream-copy वाले video और audio ऑपरेशन (trim, mute, container remux)। ज़्यादातर एक सेकंड से कम में पूरे हो जाते हैं।

दो workloads अपवाद हैं:

- **Video re-encoding** (codecs के बीच बदलना) CPU-bound है। तेज़ desktop CPU पर ~40 s लेने वाली 1080p क्लिप को Pi-स्तर के CPU पर कई मिनट लग सकते हैं। Stream-copy ऑपरेशन तुरंत होते रहते हैं।
- **AI tools** की प्रति-bundle CPU मेमोरी सीमाएँ हैं: Face Detection और built-in Fast OCR के लिए 2 GB host RAM (0.5 GB खाली), Accurate OCR के लिए 4 GiB कॉन्फ़िगर की गई effective memory, Transcription, Object Eraser & Colorize, Background Removal, Upscale & Enhance, और Photo Restoration के लिए 4 GB host RAM (2 से 3 GB खाली), और High-Quality Inpainting के लिए 8 GB host RAM (6 GB खाली)। 2 GB की मशीन Whisper, RealESRGAN, rembg, या LaMa को OOM-kill हुए बिना नहीं चला सकती, इसलिए SnapOtter Python sidecar को भेजने से पहले खाली मेमोरी जाँचता है और bundle की सीमा से कम होने पर रन को तुरंत अस्वीकार कर देता है।

इनमें से कुछ भी तब तक इंस्टॉल या चालू नहीं होता जब तक आप उसका उपयोग न करें: कोई AI bundle इंस्टॉल न होने पर app लगभग 360 MB पर idle रहता है, और AI bundles तभी डाउनलोड होते हैं जब कोई admin उन्हें सक्षम करे।

## Raspberry Pi / पुराने laptop का walkthrough {#walkthrough}

यह [Getting Started](/hi/guide/getting-started) का मानक Compose इंस्टॉल है, साथ में resource limits और रूढ़िवादी सीमाएँ। यह मानकर चलता है कि आपके पास 64-bit OS है (Pi पर: Raspberry Pi OS 64-bit या Ubuntu Server arm64)।

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi-स्तर की मशीनों के लिए नोट्स:

- डेटा volume और Postgres के लिए **SD card के बजाय USB SSD को प्राथमिकता दें।** Job workspaces में असली disk IO होता है, और SD cards धीमे भी होते हैं और जल्दी घिस भी जाते हैं।
- **ऑल-इन-वन single container भी यहाँ काम करता है** (`DATABASE_URL`/`REDIS_URL` सेट न होने पर embedded Postgres और Redis), और मेमोरी-सीमित host पर आपको उसकी embedded Redis सीमा `REDIS_MAXMEMORY` से घटानी चाहिए ([Configuration](/hi/guide/configuration) देखें)। Compose आपको प्रति-service बेहतर नियंत्रण देता है, इसीलिए यह walkthrough उसका उपयोग करता है।
- **2 GB वाले devices पर swap जोड़ें।** इससे कभी-कभार आने वाला उछाल (बड़ी PDF, या batch जिसे सीमित करना भूल गए) out-of-memory kill पर खत्म नहीं होता। zram SD-card के अनुकूल विकल्प है।
- arm64 image केवल CPU के लिए है; ARM boards पर CUDA नहीं है।

## ट्यूनिंग knobs {#tuning-knobs}

सभी सीमाएँ environment variables हैं, जिनका पूरा वर्णन [Configuration](/hi/guide/configuration) में है। `0` का मतलब है असीमित या auto। छोटे hardware पर जो मायने रखते हैं:

| Variable | छोटे बॉक्स के लिए सुझाव | यह किसे बचाता है |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | कितने jobs समानांतर चलते हैं। Auto-detect CPU cores में से एक घटाकर चुनता है, जो बड़ी मशीनों पर ठीक है और मेमोरी दबाव में 2-core बॉक्स पर ज़रूरत से ज़्यादा उतावला। |
| `MAX_WORKER_THREADS` | `2` | Image-processing thread pool। |
| `MAX_BATCH_SIZE` | `5` | 1-2 GB की मशीनों में सबसे पहले batches में ही मेमोरी खत्म होती है। |
| `MAX_UPLOAD_SIZE_MB` | `100` | एक अकेली विशाल फ़ाइल को पूरे workspace पर कब्ज़ा करने से रोकता है। |
| `MAX_MEGAPIXELS` | `50` | 100+ MP की image decode करने में फ़ाइल के आकार से स्वतंत्र रूप से RAM लगती है। |
| `MAX_VIDEO_DURATION_S` | `300` | लंबे transcodes छोटे CPU को मिनटों से घंटों तक घेरे रखते हैं। |
| `PROCESSING_TIMEOUT_S` | `600` | कठोर सीमा, ताकि भागा हुआ job अंततः बॉक्स को मुक्त कर दे। |

ये सीमाएँ उस पर लागू होती हैं जो server स्वीकार करता है, इसलिए इन्हें जितना हो सके उतना छोटा रखने के बजाय अपने वास्तविक उपयोग के अनुसार सेट करें। यदि आप कभी video नहीं छूते, तो `MAX_VIDEO_DURATION_S` की सीमा कुछ नहीं बिगाड़ती; यदि आप रोज़ documents स्कैन करते हैं, तो `MAX_PDF_PAGES` को सीमित न करें।

## क्या छोड़ दें {#what-to-skip}

- **भारी AI bundles।** Upscaling, photo restoration, और background removal को GPU या तेज़ many-core CPU चाहिए, और हर bundle 4-5 GB disk लेता है। छोटे बॉक्स पर इन्हें बस इंस्टॉल न करें; जिन tools का bundle मौजूद नहीं है वे चलने के बजाय install prompt दिखाते हैं।
- **नियमित workload के रूप में Video re-encoding।** कभी-कभार का transcode ठीक है (बस धीमा है); लगातार चलने वाली transcode queue को CPU cores चाहिए, Pi नहीं।
- **आम तौर पर अनुपयोगी tools।** कोई admin Settings में अलग-अलग tools बंद कर सकता है, जिससे वे UI से हट जाते हैं और उनके API routes रजिस्टर होना बंद हो जाता है। इससे अपने आप मेमोरी नहीं बचती, लेकिन साझा छोटे instance को उस एक workload के लिए इस्तेमाल होने से रोका जा सकता है जिसे hardware सँभाल नहीं सकता।

यदि आप बाद में instance को बड़े hardware पर ले जाते हैं, तो सीमाएँ हटा दें (उन्हें वापस `0` पर सेट करें) और वही डेटा volume साथ चला जाता है।
