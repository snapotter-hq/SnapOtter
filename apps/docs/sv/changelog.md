---
description: "Versionsinformation och versionshistorik för SnapOtter. Se vad som är nytt, förbättrat och åtgärdat i varje version."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 399c33c78f8e
---

# Ändringslogg {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 förvandlar bildverktyget till en komplett svit för filhantering: 200+ verktyg fördelade på fem modaliteter (Image, Video, Audio, PDF och Files), ombyggt på Postgres 17 och en Redis-baserad jobbkö, med en `docker run` som körs med ett enda kommando. Det här är en större version; läs Brytande ändringar innan du uppgraderar från 1.x.

### Nya funktioner {#new-features}

- **Fyra nya verktygsmodaliteter**: Video, Audio, PDF och Files ansluter till Image och tar katalogen till 200+ verktyg.
- **Beständiga bakgrundsjobb**: En Redis-baserad kö (BullMQ) kör varje verktyg som ett spårat jobb med live SSE-förlopp.
- **Allt-i-ett-läge med en enda container**: En `docker run` startar en komplett instans med inbäddad Postgres och Redis.
- **AI-paket på begäran**: Bakgrundsborttagning, OCR, transkribering, uppskalning, ansiktsigenkänning och -förbättring, objektradering, färgläggning och fotorestaurering installeras från gränssnittet. GPU-acceleration upptäcks per ramverk.
- **Signera PDF**: Rita, skriv eller ladda upp en signatur och placera den på en PDF i webbläsaren.
- **Automate**: En visuell pipelinebyggare som kedjar samman verktyg, med nio förbyggda mallar.
- **83 konverteringsförinställningar med ett klick**: Dedikerade konverterare för JPG-till-PNG, MP4-till-GIF och liknande med luddig sökning.
- **Lagerbaserad bildredigerare**: En Konva-driven redigerare på `/editor` med penslar, former, justeringar, filter och kurvor.
- **Files-bibliotek**: Spara valfritt resultat och återanvänd det som indata till ett annat verktyg.
- Fästa verktyg, zoom och panorering i arbetsytan, 21 språk och funktioner för företag (OIDC/SSO, SAML, SCIM, S3-lagring, behörigheter per verktyg, revisionsexport, distribuerad spårning).

### Förbättringar {#improvements}

- Avbryt en pågående process. (#137)
- RAW-avkodning i full upplösning via LibRaw, inklusive DNG. (#289)
- Distributioner som inte körs som root och med främmande UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Korrekt identifiering av AI-installationer och ett härdat installationsflöde. (#214, #352)
- Härdad integritet: ingen automatisk tredjepartstrafik utåt, plus ett valfritt strikt offline-läge.
- Alltid tillgänglig feedbackknapp, även med analys avstängd.

### Felrättningar {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` inaktiverar hastighetsbegränsning för verktygsrutter igen. (#271)
- Reparerade sökvägar för AI-virtualenv inuti Docker-avbildningen. (#390)
- Kompatibilitet med sharp 0.35.2+. (#362)
- Layoutfixar i bildredigeraren: linjaler, fyllnadsbeteende, sidopanel och storleksändring av arbetsytan. (#258, #259)
- Slutförde den italienska översättningen. (#231, #206, #425)
- Ljudnormalisering och loudnorm bevarar källans samplingsfrekvens.
- SSRF-härdning: numerisk IPv6 CIDR-matchning och en breddad förhandsgranskning av URL:er. (#287)
- Genererade PDF:er stämplas med SnapOtter som Producer.
- mediapipe installeras på Python 3.13 och Debian 13.

### Brytande ändringar {#breaking-changes}

2.0 ersätter den inbäddade SQLite-databasen med Postgres 17 och lägger till Redis 8 för jobbkön. Dina 1.x-data migreras automatiskt vid första start, men containerstacken har ändrats, så säkerhetskopiera hela din `/data`-volym först (1.x kör SQLite i WAL-läge, så de committade data ligger vanligtvis i `snapotter.db-wal`). Välj sedan avbildningen med en enda container (inbäddad Postgres och Redis, endast root) eller Compose-stacken (app plus Postgres 17 och Redis 8). Se [migreringsguiden](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) och [uppgraderingsguiden](/sv/guide/upgrading).

### Uppgradering {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Eller med Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Fullständig diff på GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nytt verktyg för HTML till bild, WCAG 2.2 AA-tillgänglighet, säkerhetshärdning från penetrationstestning och 5 kritiska Docker-fixar.

### Nya funktioner {#new-features-1}

- **HTML till bild**: Fånga skärmbilder av URL:er eller rå HTML som PNG/JPEG/WebP. Helsidesfångster, anpassade visningsytor, mörkt läge.
- **Docker _FILE-hemlighetskonvention**: Montera känsliga miljövariabler som filer i stället för klartext. (#205)
- **Företagslicensiering och S3-lagring**: Valfri kommersiell licensnyckel och S3-kompatibel objektlagring.
- **Förbättringar av formredigeraren**: Genomskinlighet för fyllnad/kontur, RGBA-färgväljare, streckade linjestilar.
- **Förbyggda release-arkiv**: Ladda ner tarballs från GitHub Releases för installationer utan Docker (Proxmox, bare metal, LXC). (#202)

### Förbättringar {#improvements-1}

- **WCAG 2.2 AA-tillgänglighet**: Hoppa över navigering, fokusfällor, aria-live-regioner, stöd för reducerad rörelse, korrekta kontrastförhållanden. (#209)
- **Mobilanpassning**: Responsiva inställningar, automatisk SSE-återanslutning vid byte av mobilflik. (#203, #204)
- **Kvalitet på bakgrundsborttagning**: Kantutjämning, färgdekontaminering, val av utdataformat.
- **Italiensk översättning**: ~145 nya strängar av @albanobattistella. (#206)
- **API-dokumentation per verktyg**: 53 dokumentsidor med parametrar, exempel och svarsformat.
- **Nedladdning av AI-modeller**: Återförsökslogik med exponentiell backoff för HuggingFace. (#201)

### Felrättningar {#bug-fixes-1}

- Nya Docker-containrar var helt oanvändbara (hastighetsbegränsningen blockerade alla förfrågningar).
- AI-verktyg för ansiktsigenkänning (blur-faces, red-eye-removal, enhance-faces, passport-photo) misslyckades på alla plattformar.
- HEIC-filer trasiga på ARM (symbolmatchningsfel i libheif).
- AI-paketen upscale och restore-photo misslyckades att installeras på ARM.
- OCR använde fel CUDA-version på GPU-containrar.
- Kringgående av SSRF-skydd via hex-IPv4-mappade IPv6-adresser. (Tack: @tonghuaroot)
- HEIC-avkodning från iPhone med hjälpbilder. (#183, #199)
- Real-ESRGAN CUDA OOM på 8GB-GPU:er. (#200)
- 6 Sentry-fel i produktion och 7 QA-buggar. (#208)

### Säkerhet {#security}

- 10 fynd från penetrationstest åtgärdade (XFF-kringgående, krascher vid felformaterad JSON, obegränsade pipelines, XSS i revisionslogg, TRACE-metod med mera). (#207)
- SSRF-kringgående med hex-IPv6 blockerat. (Tack: @tonghuaroot)
- Dockerfile-basavbildningar fästa via digest.

### Uppgradering {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Eller med Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Fullständig diff på GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Live-demo, landningssidor per verktyg och en omgång putsande fixar.

### Nya funktioner {#new-features-2}

- **Live-demo** - [demo.snapotter.com](https://demo.snapotter.com) låter folk prova SnapOtter utan att installera något.
- **Verktygsindexsida** - Bläddra bland alla 50+ verktyg på `/tools` med sökning och kategorifilter.
- **50+ SEO-landningssidor** - Varje verktyg har nu en dedikerad landningssida med vanliga frågor, användningsfall och jämförelsetabeller.
- **Bakgrundsförhandsgranskning** - Ett före-efter-reglage visar en rutig bakgrund bakom genomskinliga bilder.
- **Generator för starka lösenord** - Knapp med ett klick i formuläret Lägg till medlemmar.

### Felrättningar {#bug-fixes-2}

- Info-verktyget för HEIC/HEIF misslyckas inte längre (föravkodning tillagd).
- Installation av AI-modellpaket visar bättre felmeddelanden och respekterar resursgränser.
- Bibliotekets miniatyrbilder laddas korrekt (autentiseringshuvuden saknades).
- Rullgardinsmenyer klipps inte längre i inställningstabellerna för People och Teams.
- Procentandel för storleksjämförelse dold på verktyg som inte komprimerar.
- Dubblerad länk till integritetspolicy borttagen.
- Italiensk översättning tillagd för inställningar av AI-funktioner.
- Omdöpta Lucide-ikoner uppdaterade (Wand2, Columns).

### Infrastruktur {#infrastructure}

- OpenSSF Scorecard härdat från 4.3 till ~7.0.
- CI-tester parallelliserade i 4 shards med förminskade fixturer.
- 41 beroendeuppdateringar.

### Uppgradering {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Eller med Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Fullständig diff på GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Fem nya verktyg, en fullständig bildredigerare, SSO-inloggning, 20 språk. Borde nog ha varit tre separata versioner, men här är vi.

### Nya funktioner {#new-features-3}

- **Bildredigerare** - Lager, penslar, former, justeringar, filter, kurvor, tangentbordsgenvägar. Körs i din webbläsare, bearbetar på din hårdvara.
- **OIDC/SSO-autentisering** - Logga in med Google, GitHub, Okta eller valfri OpenID Connect-leverantör. Ställ in några få miljövariabler så använder ditt team sina befintliga konton.
- **Meme-generator** - 100 inbyggda mallar med textrendering via opentype.js. Eller ladda upp din egen bild.
- **Beautify** - Släpp in en skärmbild, få en polerad bild ut. Enhetsramar (macOS, Windows, webbläsare), skuggor, gradienter, förinställningar för sociala medier.
- **Simulering av färgblindhet** - Förhandsgranska hur bilder ser ut med protanopi, deuteranopi, tritanopi och andra färgsynsavvikelser.
- **PNG-genomskinlighetsfixare** - Upptäcker falskt genomskinliga PNG:er och åtgärdar dem med BiRefNet HR-matting. Valfri borttagning av vattenstämpel via LaMa-inpainting.
- **AI-arbetsyteutökning** - Utöka bildgränser med AI-fyllning. Tre kvalitetsnivåer (snabb, balanserad, kvalitet) beroende på hur mycket GPU-tid du vill byta bort.
- **20 språk** - Arabiska, kinesiska (förenklad/traditionell), tjeckiska, nederländska, franska, tyska, hindi, indonesiska, italienska, japanska, koreanska, polska, portugisiska, ryska, spanska, thailändska, turkiska, ukrainska, vietnamesiska. RTL fungerar för arabiska.
- **URL-import** - Klistra in URL:er i släppzonen eller massimportera från en lista. Serversidig hämtning med SSRF-skydd.
- **Flerfilsradering** - Rita raderingsmasker över flera bilder, bearbeta dem alla med ett klick. Penseldrag bevaras per bild.
- **Pipeline-import/-export** - Spara verktygskedjor som JSON, dela dem med andra.
- **17 nya kamera-RAW-format** via exiftool, plus QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ och APNG som indata. Nya utdatakodekar för BMP, ICO, JP2, QOI. Export till AVIF, TIFF, GIF, JXL och PSD återställd från en tidigare förlorad gren.

### Förbättringar {#improvements-2}

- **Bildförbättring** - Ersatte den gamla pipelinen med CLAHE + normalise + gamma. En ny Deep Enhance-växel använder AI-modellen för mer aggressiva resultat.
- **Restaurera foto** - Reptdetektering omskriven med 8-vinklad Otsu-filtrering. LaMa-inpainting körs nu i inbyggd upplösning.
- **Exotiska format överallt** - OCR, bild-till-PDF, favicon-generator, komposition, hopfogning och vektorisering avkodar alla HEIC, RAW, PSD nu.
- **Komprimera** - Toleransen för målstorlek strammades åt från 5% till 1%. Målstorlek är standardläget. Lade till stegknappar och enhetsväljare för KB/MB.
- **Sentry-rensning** - 644 ej åtgärdbara händelser filtrerade. Verkliga fel hanteras nu korrekt.
- **GPU-detektering** - Bättre diagnostik för containrar där CUDA finns men nvidia-smi inte gör det.
- **Läge med autentisering avstängd** - En anonym användare seedas i databasen med admin-roll. API-nycklar, pipelines och användarfiler bryts inte längre av FK-begränsningar.
- **2 705+ nya tester** över enhets-, integrations- och E2E-tester.

### Felrättningar {#bug-fixes-3}

- Uppskalning på CPU får inte längre timeout på NAS-boxar och lågeffektshårdvara.
- QR-kodslogotyp får inte längre förhandsgranskningen att försvinna permanent.
- Beskärningsöverflöde åtgärdat för höga porträttbilder.
- TIFF-alfafiler tvingar korrekt PNG-utdata i stället för att producera korruption.
- HDR/EXR-avkodning konverterar till 8-bit före CLAHE, vilket åtgärdar avkodningsfel.
- Indatabuffertar för ansiktslandmärken konverteras till PNG före Python-sidovagnen, vilket åtgärdar krascher.
- Hitta dubbletter hanterar batchar med blandade format och nätverksfel.
- Beautify-förhandsgranskning uppdateras i realtid.
- Förloppsindikatorer för hopfogning och vektorisering.
- SVGZ hanteras av SVG-till-raster.
- Filnamn med icke-ASCII åtgärdade via procentkodat X-File-Results-huvud.

### Uppgradering {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Eller med Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Fullständig diff på GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Enhetlig Docker-avbildning med automatisk GPU-detektering. En avbildning hanterar både CPU- och GPU-arbetsbelastningar. Förenklad compose till en enda fil med loggrotation. Modellförnedladdningar inkluderar nu verifiering och ett röktest.

---

## v1.13.0 {#v1-13-0}

Rollbaserad åtkomstkontroll (RBAC). 14 granulära behörigheter, tre inbyggda roller (admin, editor, user), stöd för anpassade roller. Behörighetskontroller på alla API-rutter. Frontend-flikar filtrerade efter användarbehörigheter.

---

## v1.12.0 {#v1-12-0}

Verktyg för PDF till bild. Konvertera PDF-sidor till PNG, JPEG, WebP eller TIFF med anpassad DPI. Enhetlig Docker-avbildning med automatisk GPU-detektering.

---

## v1.11.0 {#v1-11-0}

Autogenererad llms.txt via vitepress-plugin-llms för AI-vänlig dokumentation.

---

## v1.10.0 {#v1-10-0}

Innehållsmedveten storleksändring (seam carving) med ansiktsskydd. Ändra storlek på bilder samtidigt som viktigt innehåll bevaras.

---

## v1.9.0 {#v1-9-0}

Verktyg för hopfogning/kombination. Foga samman bilder sida vid sida, staplade vertikalt eller i ett anpassat rutnät.

---

## v1.8.0 {#v1-8-0}

Verktyg för att redigera metadata. Visa och redigera EXIF-, IPTC- och XMP-metadata med ett granulärt gränssnitt för att ta bort/behålla.

---

## Äldre versioner {#older-releases}

För den fullständiga ändringsloggen på commit-nivå inklusive patch-versioner, se [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
