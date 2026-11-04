---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 0d5a18c766e9
i18n_hash_version: 2
---
# 1.x से 2.0 में अपग्रेड {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x सब कुछ एक ही SQLite फ़ाइल में रखता था और एक container के रूप में चलता था। SnapOtter 2.0 PostgreSQL और Redis का उपयोग करता है। यह गाइड बताती है कि 1.x इंस्टॉलेशन को बिना डेटा खोए 2.0 में कैसे ले जाएँ।

संक्षेप में: अपना मौजूदा `/data` volume दोबारा उपयोग करें, और 2.0 पहले boot पर आपका 1.x डेटाबेस अपने आप import कर लेता है। आपके users, सेव की गई फ़ाइलें, सेटिंग्स, API keys, और pipelines साथ आ जाते हैं। पुराना डेटाबेस कभी बदला नहीं जाता, इसलिए आप हमेशा rollback कर सकते हैं।

::: tip हमारे 1.x उपयोगकर्ताओं के लिए एक संदेश
आप में से कई लोगों ने शुरुआत से SnapOtter पर भरोसा किया है, और आपके फ़ीडबैक ने इस release को आकार दिया है। 2.0 में अंदरूनी तौर पर बहुत कुछ बदला है, और यह गाइड इसलिए है कि इस बदलाव में आपकी किसी ज़रूरी चीज़ का नुकसान न हो। आपके खाते, फ़ाइलें, सेटिंग्स, API keys, और pipelines साथ आते हैं, और आपके पुराने डेटाबेस को छुआ तक नहीं जाता। हमारे साथ अपग्रेड करने के लिए धन्यवाद।
:::

## शुरू करने से पहले: पूरे `/data` volume का backup लें {#before-you-start-back-up-the-whole-data-volume}

यह हर बार सबसे पहले करें। सिर्फ़ `snapotter.db` फ़ाइल का नहीं, **पूरे** `/data` volume का backup लें।

यह क्यों मायने रखता है, यहाँ बताया गया है। 1.x SQLite को WAL मोड में चलाता है, इसलिए रुका हुआ 1.x container अक्सर अपना ज़्यादातर committed डेटा लगभग खाली `snapotter.db` के बगल में `snapotter.db-wal` में छोड़ जाता है। केवल `snapotter.db` कॉपी करने से खाली डेटाबेस मिलता है और सब कुछ चुपचाप खो जाता है। Volume में `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm`, और आपकी `files/` directory एक साथ रहती हैं, और इन्हें एक सेट के रूप में ही ले जाना चाहिए।

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## पहले 1.17.2 पर अपग्रेड करें {#upgrade-to-1-17-2-first}

2.0 पर जाने से पहले अपने 1.x इंस्टॉलेशन को नवीनतम 1.x release (1.17.2) पर अपग्रेड करें। इससे 1.x अपने अंतिम schema migrations खुद चला लेता है, और 2.0 एक ज्ञात, पूर्ण schema से import करता है। पुराने 1.x से सीधे 2.0 पर अपग्रेड करना समर्थित नहीं है।

## अपने volume का नाम जाँचें {#check-your-volume-name}

Importer आपका डेटा तभी देख पाता है जब 2.0 stack वही volume mount करे जो आपके 1.x इंस्टॉलेशन ने उपयोग किया था। Docker volume नाम case sensitive होते हैं, और पुराने README snippets में छोटे अक्षरों वाला `snapotter-data` उपयोग होता था जबकि Compose फ़ाइलें `SnapOtter-data` उपयोग करती हैं। पुष्टि करें कि आपके पास कौन सा है:

```bash
docker volume ls | grep -i snapotter
```

अपने 2.0 कॉन्फ़िगरेशन में यही सटीक नाम उपयोग करें।

## Path A: single container (सबसे तेज़) {#path-a-single-container-quickest}

यदि आप SnapOtter को एक ही `docker run` के साथ चलाते हैं, तो वैसा ही करते रहें। जब आप `DATABASE_URL` या `REDIS_URL` सेट नहीं करते, तो 2.0 container के अंदर embedded PostgreSQL और Redis boot करता है, और पहले boot पर `/data/snapotter.db` का अपने आप पता लगाकर उसे import कर लेता है।

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Logs में इस तरह की एक पंक्ति देखें:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

बस इतना ही। अपनी मौजूदा credentials से login करें।

## Path B: Compose (production के लिए अनुशंसित) {#path-b-compose-recommended-for-production}

2.0 Compose stack तीन services चलाता है (app, Postgres, Redis)। app service के लिए अपना 1.x `/data` volume दोबारा उपयोग करें। App `/data/snapotter.db` का अपने आप पता लगाता है और पहले boot पर उसे Postgres में import कर लेता है।

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

यदि आप पुराने डेटाबेस की ओर स्पष्ट रूप से इशारा करना चाहें, तो `SQLITE_MIGRATE_PATH=/data/snapotter.db` सेट करें। स्पष्ट path हमेशा auto-detect पर भारी पड़ता है।

## पहले import का पूर्वावलोकन करें (वैकल्पिक) {#preview-the-import-first-optional}

कुछ भी लिखे बिना यह देखने के लिए कि वास्तव में क्या import होगा, अपनी डेटाबेस फ़ाइल पर dry run चलाएँ:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

यह प्रति table पंक्तियों की संख्या, disk पर मिली सेव-की-गई library फ़ाइलों की संख्या, और वे job statuses दिखाता है जिन्हें यह normalize करेगा। इसे चालू Postgres की ज़रूरत नहीं है।

## क्या साथ आता है, और क्या नहीं {#what-carries-over-and-what-does-not}

साथ आता है:

- Users, और login कर पाने की क्षमता। Password hashes अपरिवर्तित रहते हैं, इसलिए वही username और password काम करते हैं।
- Teams, सेटिंग्स (आपकी instance identity सहित), roles, API keys (वे काम करते रहते हैं), और सेव की गई pipelines।
- Job history रिकॉर्ड।
- आपकी सेव की गई file library, रिकॉर्ड और असली फ़ाइलें दोनों, क्योंकि `/data/files` volume पर सुरक्षित रहता है।

साथ नहीं आता:

- Login sessions। अपग्रेड के बाद सभी को एक बार दोबारा sign in करना होगा। Credentials वही रहती हैं, इसलिए यह बस एक बार का re-login है, इससे ज़्यादा कुछ नहीं।
- पुराने processing jobs की input और output फ़ाइलें। वे अस्थायी workspace में थीं और डिज़ाइन के अनुसार जा चुकी हैं। Job history रिकॉर्ड बने रहते हैं।
- 1.x के प्रति-उपयोगकर्ता analytics-consent flags, जिनका 2.0 में कोई समकक्ष नहीं है (2.0 analytics instance-स्तर की सेटिंग है)।

## Import बंद करना {#turning-the-import-off}

यदि आप volume पर `snapotter.db` मौजूद होने के बावजूद जानबूझकर नया डेटाबेस चाहते हैं, तो `SQLITE_MIGRATE_PATH=off` सेट करें।

## यदि 2.0 instance में पहले से डेटा है {#if-you-already-have-data-in-the-2-0-instance}

Importer केवल खाली डेटाबेस में चलता है। यदि आपने 2.0 को नए सिरे से शुरू किया (डेटा बनाते हुए), और बाद में पुराना `snapotter.db` mount किया, तो 2.0 उसका पता लगा लेगा लेकिन import नहीं करेगा, क्योंकि दो डेटासेट मिलाने पर IDs में टकराव हो सकता है। आपको logs में एक चेतावनी दिखेगी। 1.x डेटा import करने के लिए आपको खाली instance चाहिए:

- यदि 2.0 instance में केवल default admin है (आपने उसे वास्तव में उपयोग नहीं किया है), तो stack रोकें, Postgres volume (`SnapOtter-pgdata`) हटाएँ, और पुराना `/data` मौजूद रखकर दोबारा boot करें। यह साफ़-सुथरे ढंग से import हो जाएगा। इससे केवल फ़ालतू Postgres डेटा मिटता है, आपका 1.x डेटाबेस नहीं।
- यदि 2.0 instance में असली डेटा है जिसे आप रखना चाहते हैं, तो दोनों डेटासेट अपने आप मर्ज नहीं हो सकते। जो चाहिए उसे export करें और 1.x डेटा को किसी अलग नए deployment में import करें।

## Rollback करना {#rolling-back}

अपग्रेड आपके 1.x `snapotter.db` को कभी बदलता या हटाता नहीं है। यदि आपको 1.x पर वापस जाना हो, तो उसी volume के साथ 1.x image दोबारा deploy करें। अपग्रेड के बाद आपने 2.0 में जो कुछ बनाया, वह Postgres में रहता है और 1.x डेटाबेस में नहीं होगा, इसलिए यदि आप वापस जाने वाले हैं तो जल्दी जाएँ।
