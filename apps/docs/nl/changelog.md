---
description: "Release notes en versiegeschiedenis voor SnapOtter. Bekijk wat er nieuw, verbeterd en opgelost is in elke release."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: cce795711e73
---

# Changelog {#changelog}

## v2.2.0 {#v2-2-0}

Het grootste deel van 2.2 draait om hardening. Een niet-beheerder met een gedelegeerde `users:manage`-rol kon een instance overnemen, en elk tool-endpoint bleek zijn permissiecontrole te missen. Upgrade als je meer dan één gebruiker hebt.

De rest zit in de lange staart van self-hosting: downloads die startten en nooit afmaakten, presets die braken zodra je een tweede bestand toevoegde, containers die in een crash-lus zaten terwijl Postgres nog opstartte. Er zijn ook twee nieuwe tools bijgekomen. Documentatie en de website zijn nu vertaald in 21 talen, en de interface voldoet eindelijk aan de WCAG AA-contrastnorm.

> [!IMPORTANT]
> Als je `users:manage` via een aangepaste rol aan een niet-beheerder hebt gegeven, kon die rol beheerdersaccounts overnemen in 2.0.0 tot en met 2.1.0. Details staan onder Beveiliging.

### Beveiliging {#v2-2-0-security}

- **Privilege-escalatie via een gedelegeerde `users:manage`-rol (GHSA-9xgh-95qh-2x7h).** Een niet-beheerder met `users:manage` via een aangepaste rol kon het wachtwoord van een account met hogere rechten resetten of dat account verwijderen, een ingebouwde beheerder inbegrepen, en de instance overnemen. Wachtwoordreset en accountverwijdering controleren nu de autoriteit van de aanroeper over het doelwit, zodat een gedelegeerde rol niet boven zijn eigen niveau kan komen. Getroffen: 2.0.0 tot en met 2.1.0. Gemeld door 李春来 (Chunlai Li). (#616)
- **Elk tool-endpoint is nu afgeschermd.** Tooltoegang werd per route afgedwongen, dus alle 45 handgeschreven routes moesten dezelfde aanroep onthouden en geen enkele deed dat. Een rol zonder `tools:use` kon nog steeds image-to-pdf, erase-object, upscale, sign-pdf en de rest draaien. De controle zit nu in één preHandler die is gekoppeld aan de gematchte route, zodat hij subpaden en elke later toegevoegde route dekt. (#646)
- **Ratelimiting was te omzeilen op Docker-installaties.** De image leverde `TRUST_PROXY=true`, dus het client-IP kwam uit een requestheader en een vervalste `X-Forwarded-For` kwam voorbij de login-limiter. De standaard is nu een trustlijst voor privénetwerken. (#649)
- **Schrijfacties naar instellingen worden per instelling gecontroleerd**, niet één keer bij de ingang, en configuratie-import is nu transactioneel, zodat een geweigerde sleutel niet een half toegepaste configuratie kan achterlaten. (#618)
- **Bibliotheekbestandsnamen kunnen niet buiten hun opslagroot komen.** Een gemanipuleerde opgeslagen naam, die een kwaadaardige 1.x SQLite-import letterlijk kopieert, kon bestanden buiten de files-map lezen of verwijderen. Alleen bereikbaar nadat een beheerder een door een aanvaller aangeleverde 1.x SQLite-database importeert, het enige pad waarlangs een opgeslagen naam kan worden gekozen. Gemeld door @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Taakannulering dwingt eigenaarschap af**, zodat een geauthenticeerde gebruiker niet langer de taak van een andere gebruiker op id kan annuleren. Gemeld door @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Een hercontrole van de hele 2.0-codebase vond wat nog open stond**: een onderschepte SAML-assertie kon opnieuw worden afgespeeld, een MFA-uitdaging overleefde elk aantal foute codes, de API-sleutelopzoeking per verzoek was een volledige tabelscan, `MAX_WORKSPACE_SIZE_GB` was dode configuratie, en de SVG-sanitizer liet ongequote `javascript:`-hrefs door. (#620)
- **Negen bekendgemaakte CVE's gepatcht**: fast-uri, svgo, sharp en tar transitief (#619), plus Pillow 12.3.0 (#517). RAW-decodering op arm64 bouwt nu LibRaw 0.22.2 uit de broncode in plaats van een ongepatchte systeemkopie te linken. (#649)

### Nieuwe functies {#v2-2-0-new-features}

- **Rounded Crop**: afgeronde vierkante en iOS-achtige squircle-maskers, met een regelaar voor de hoekradius. Gebouwd voor favicons en app-iconen. (#602)
- **Remove GIF Background**: verwijder de achtergrond uit een geanimeerde GIF, WebP of APNG frame voor frame en krijg een transparante animatie terug. (#502)
- **Object Eraser met lasso en High Quality-modus**: sleep een vrije lus in plaats van elke pixel te schilderen, en installeer optioneel een diffusion-inpaintingbundel voor schonere vullingen van grote vlakken. (#503, #566)
- **Opslaan als nieuw bestand, of overschrijven.** Het bewerken van een bibliotheekbestand verving vroeger stilzwijgend het origineel. Je kiest nu per bewerking, en de standaard behoudt het origineel. (#564, #577)
- **Beeldverhoudingspresets in Resize.** Kies 1:1, 4:3 of 16:9 en de twee afmetingen blijven vergrendeld, zonder upscaling. (#530)
- **OCR in twee lagen**: een snelle laag is in de image ingebakken en draait offline zonder download, en een nauwkeuriger runtime installeert op aanvraag. (#519)
- **Typ ergens om te zoeken.** Begin te typen op het dashboard of de homepage en je belandt in het zoekvak. (#644)
- **Documentatie en website in 21 talen**: de documentatiesite, de landingspagina's en de API-referentie zijn nu allemaal vertaald, naast de app-interface. Een nieuwe implementatiehandleiding voor low-resourceomgevingen behandelt Raspberry Pi en machines met 2 GB. (#548)
- **Duidelijkere toolnamen**: 18 dubbelzinnige namen kwalificeren zich nu zelf, dus "Compress" werd "Compress Image". Tool-id's en routes zijn ongewijzigd, dus geen enkele bladwijzer raakt stuk. (#520)

### Verbeteringen {#v2-2-0-improvements}

- **WCAG AA-contrast door de hele interface**: het palet is opnieuw afgestemd zodat levendig oranje op vullingen blijft en tekst en labels toegankelijke inktkleuren gebruiken, en alle 57 focusindicatoren halen nu de 3:1-norm voor niet-tekst. (#567, #574)
- **Upscale en achtergrondverwijdering lijken niet meer bevroren**: de voortgangsbalk loopt door tijdens inferentie in plaats van op 30% te blijven staan, en beide tools waarschuwen nu dat een host met alleen CPU veel langzamer is. (#605, #608)
- **Time-outmeldingen noemen de echte oorzaak** en houden rekening met hosts met alleen CPU in plaats van de upload de schuld te geven. (#596)
- **SnapOtter wacht bij het opstarten op Postgres en Redis** in plaats van in een crash-lus te belanden, zowel in Compose als in de all-in-one image. Een Proxmox LXC-installatie herstartte 76 keer voordat dit werd opgelost. (#537, #595)
- **Downloads overleven een reverse proxy**: SnapOtter vraagt nginx en compatibele proxy's om bestandsantwoorden niet te bufferen, wat de gebruikelijke reden is dat een self-hosted download start en nooit eindigt. (#604, #607)
- **Compress PDF komt dicht bij de doelgrootte**, en zegt het eerlijk wanneer een doel buiten bereik is. (#522)
- **Bedieningselementen van mobiele tools blijven bereikbaar** nu de app-shells zich aan de dynamische viewport aanpassen. (#559)
- **Convert Audio toont een instelling voor de samplerate.** (#561)
- **Beheerders kunnen de minimale wachtwoordlengte versoepelen**, tot 1 voor een vertrouwde LAN-instance. (#543)
- **MFA is selfservice**, de lockout van het beleid is gedicht, en OIDC- of SAML-aanmeldingen krijgen een echte MFA-uitdaging in plaats van een harde blokkade. (#531, #536)
- **Een kale `Error: Error` noemt nu zijn oorzaak.** Sharp-encodefouten, afsluitingen van de AI-sidecar, niet-JSON-uitvoer van de document-sidecar en fouten bij achtergrondverwijdering kwamen vroeger allemaal aan met de reden weggepoetst. (#532, #534, #535, #538, #612)
- **De helpdialoog is vertaald.** De labels van sneltoetsen en de getting-started-tekst waren hardgecodeerd Engels terwijl afgewerkte vertalingen ongebruikt in alle 21 localebestanden stonden. (#647)

### Opgeloste fouten {#v2-2-0-bug-fixes}

- **iPhone HEIC-bestanden werden afgewezen** als onleesbaar voordat ze de decoder bereikten die ze aankan. (#631)
- **Conversiepresets faalden bij een tweede bestand**: jpg-to-pdf en zijn image-to-pdf-broers, plus pdf-to-png, pdf-to-jpg en pdf-to-tiff, gaven allemaal `Tool not found` zodra je twee bestanden uploadde. (#633, #643)
- **PDF-conversiepresets verloren hun downloadknop.** (#629)
- **Een onbeperkte verwerkingstime-out werd niet gerespecteerd**, en vastgelopen voortgangsstromen herstellen nu in plaats van de interface te laten wachten. (#638)
- **Downloads bleven hangen in plaats van te falen** wanneer een opgeslagen bestand korter bleek dan zijn geregistreerde lengte. (#617)
- **PDF-paginatools faalden op korte en versleutelde bestanden**: Remove Pages viel terug op een paginabereik dat geen enkel document onder zes pagina's heeft, en met een wachtwoord beveiligde pdf's faalden cryptisch in de worker. (#594)
- **PDF naar tekst gaf stil een leeg bestand terug** voor gescande pdf's. Het wijst je nu op OCR en levert tekst als UTF-8. (#603)
- **PDF naar Word liet gekleurde tekstblokken vallen** en splitste ze over de pagina. (#500)
- **Object Eraser liet spookresten achter** en vervaagde kleine objecten in afbeeldingen met hoge resolutie. (#501)
- **Stabilize Video schreef onafspeelbare uitvoer** zonder faststart. (#593)
- **Reparaties in de beeldeditor**: roteren, spiegelen, formaat wijzigen, niveaus, curven, filters en laagvergrendeling. (#597)
- **Sign PDF toonde een leeg canvas** in plaats van te melden waarom een pdf niet kon worden geladen. (#545)
- **De bestandsbibliotheek registreerde afmetingen van 0x0** en sloeg previews over voor HEIC-, RAW- en PSD-uploads. (#636, #637)
- **Meer dan één AI-bundel installeren** liet de gedeelde virtualenv met meerdere versies achter en brak stil drie tools. (#649)
- **Converteren naar JXL op kwaliteit 1 tot en met 4 gaf een 500**, en een ontbrekende ffmpeg werd aan je gemeld als een beschadigde upload. (#649)
- **Een tijdelijke Postgres-storing strandde afgeronde taken**, waardoor uitvoer op schijf achterbleef zonder rij die ernaar wees. Een reconciler neemt dat werk nu over in plaats van het te laten vallen. (#649)
- **Een Redis-endpoint dat van adres veranderde, klemde elke consumer vast** terwijl health checks nog steeds 200 antwoordden. (#649)
- **Oplossingen voor website en documentatie**: gelokaliseerde links laten geen `#`-fragmenten of kleine letters in `zh-CN` meer vallen, de documentatienavigatie blijft op tablets binnen de viewport, en geen van beide sites roept de GitHub-API meer aan vanuit je browser. (#516, #562, #570, #560)

### Upgrade-opmerkingen {#v2-2-0-upgrade-notes}

Niets om te migreren, maar twee meegeleverde standaardwaarden zijn gewijzigd:

- **`TRUST_PROXY` staat nu standaard op `loopback,linklocal,uniquelocal`** in plaats van elke peer te vertrouwen. Docker bridge- en Compose-netwerken vallen binnen dat bereik, dus de meeste opstellingen hoeven niets te wijzigen. Als je reverse proxy SnapOtter vanaf een openbaar adres bereikt, stel `TRUST_PROXY` dan expliciet in, anders schrijven ratelimiting en auditlogs elk verzoek toe aan de proxy.
- **`MAX_AI_JOBS_PER_USER` staat standaard op 5** gelijktijdige AI-taken met één bestand per gebruiker. Batch- en pijplijn-AI-runs blijven onbeperkt.

Nieuwe optionele instellingen: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (standaard uit) en `GIF_BG_MAX_FRAMES`.

### Dankbetuigingen {#v2-2-0-acknowledgements}

Een groot deel van deze release begon als de bugmelding van iemand anders.

Code en bijdragen:

- **@mvanhorn** ❤️: Herschreef de time-outfout van remove-background naar een bericht dat zegt wat je eraan kunt doen, in plaats van een kale time-out. (#518, #494)
- **@EuanTop** ❤️: Herstelde de downloadactie op de presetpagina's van PDF-conversies door de synchrone route het standaard tool-result-contract te laten teruggeven. (#629, #623)
- **@harshjainnn** ❤️: Diagnosticeerde de download die start en nooit eindigt, en stelde de socket-reset-richting voor waarop de fix is gebouwd. (#617, #590)

Beveiligingsmeldingen:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Meldde privé de privilege-escalatie via een gedelegeerde `users:manage`-rol, met een volledige source-to-sink-analyse en een werkende exploitketen. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Meldde een geauthenticeerde IDOR bij taakannulering, en een path traversal in opgeslagen bibliotheekbestandsnamen die bereikbaar is na een kwaadaardige 1.x SQLite-import, met voor elk een werkend proof of concept. (#599, #600)

Bugmeldingen:

- **@riz467** ❤️: Echte iPhone HEIC-bestanden die bij validatie werden afgewezen, met de grondoorzaak uitgewerkt in het rapport. (#622)
- **@coupej** ❤️: Presetpagina's van PDF die voor altijd hingen, en jpg-to-pdf dat faalde zodra een tweede bestand werd toegevoegd. Twee verschillende bugs, correct gescheiden. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` gedocumenteerd als onbeperkt maar afgekapt op vijf minuten. (#630)
- **@bezibaerchen** ❤️: Convert Audio verborg de samplerate-instelling die de eigen beschrijving beloofde. (#558)
- **@hell-toupee** ❤️: De nauwkeurige OCR-bundel die niet wilde installeren met een `libpaddle`-fout. (#505)
- **@Michael1260** ❤️ en **@And-CSH** ❤️: Bevestigden die OCR-installatiefout onafhankelijk en stelden vast dat handmatig uitpakken werkt terwijl het installatieprogramma in de app dat niet doet, wat de bug op het installatieprogramma vastpinde. (#505)
- **@TomErnst1972** ❤️: Het inschakelen van het MFA-verplicht-beleid dat een beheerder buitensloot van zijn eigen instance. (#515)
- **@thokich** ❤️: Objectverwijdering die wazige, onbruikbare vullingen opleverde, wat zowel de HD-inpainting-herbouw als de optionele high-quality-bundel aandreef. (#141)
- **@Hennie-git** ❤️: Een Proxmox LXC-installatie die 76 keer herstartte tegen een Postgres die nog geen verbindingen accepteerde. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Triageerde dat rapport in realtime en leverde de diagnose waarop de opstartfix is gebouwd. (#537)

Functieverzoeken en feedback:

- **@LECOQQ** ❤️: Vroeg om versoepeling van de wachtwoordcomplexiteit op een thuisinstallatie. (#136)
- **@killervette42** ❤️: Vroeg om een Unraid Community App, nu gepubliceerd in de Unraid CA-store. (#96)
- **@alienatedsec** ❤️: Wees erop attent dat de fix voor GPU-terugval naar CPU begraven lag in een gesloten issue en onvindbaar was, wat de reden is dat die nu in de implementatiedocumentatie staat. (#490, #587)
- **@neilp316** ❤️: Bevestigde de Blackwell-GPU-fout op een RTX 5060 en bracht een werkend upgradepad naar CUDA 12.8 in kaart. (#120)
- **@Roiki11** ❤️: Pleitte voor gedeelde opslag met padverwijzingen in plaats van HTTP-bestandsoverdracht voor AI-compute buiten de machine. (#189)

Dank ook aan de communityleden die deze meldingen via Discord en e-mail deden en wier namen we niet hebben vastgelegd: het squircle-cropverzoek (#602), de image-to-PDF-download die startte en nooit eindigde (#604, #607), de Delete Pages-tool die vastliep (#594), Arabische tekst die ontbrak bij pdf-to-text (#603), en de diagnose achter de ONNX GPU-terugval (#490).

[Volledige diff op GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 maakt van de beeldtoolkit een volledige suite voor bestandsbewerking: 200+ tools verdeeld over vijf modaliteiten (Image, Video, Audio, PDF en Files), herbouwd op Postgres 17 en een op Redis gebaseerde taakwachtrij, met een `docker run` die je met één commando start. Dit is een grote release; lees Ingrijpende wijzigingen voordat je vanaf 1.x upgradet.

### Nieuwe functies {#new-features}

- **Vier nieuwe toolmodaliteiten**: Video, Audio, PDF en Files komen naast Image, waarmee de catalogus op 200+ tools komt.
- **Duurzame achtergrondtaken**: Een op Redis gebaseerde wachtrij (BullMQ) voert elke tool uit als een gevolgde taak met live SSE-voortgang.
- **All-in-one modus met één container**: Eén `docker run` start een complete instance met ingebedde Postgres en Redis.
- **AI-bundels op aanvraag**: Achtergrondverwijdering, OCR, transcriptie, upscaling, gezichtsdetectie en -verbetering, objectgum, inkleuren en fotorestauratie installeren vanuit de UI. GPU-acceleratie wordt per framework gedetecteerd.
- **PDF ondertekenen**: Teken, typ of upload een handtekening en plaats deze op een PDF in de browser.
- **Automate**: Een visuele pijplijnbouwer die tools aan elkaar koppelt, met negen kant-en-klare templates.
- **83 conversiepresets met één klik**: Speciale converters voor JPG-naar-PNG, MP4-naar-GIF en dergelijke met fuzzy zoeken.
- **Op lagen gebaseerde beeldeditor**: Een door Konva aangedreven editor op `/editor` met penselen, vormen, aanpassingen, filters en curves.
- **Files-bibliotheek**: Sla elk resultaat op en gebruik het opnieuw als invoer voor een andere tool.
- Vastgemaakte tools, in-canvas zoomen en pannen, 21 talen en enterprisemogelijkheden (OIDC/SSO, SAML, SCIM, S3-opslag, permissies per tool, audit-export, distributed tracing).

### Verbeteringen {#improvements}

- Een lopend proces annuleren. (#137)
- RAW-decodering op volledige resolutie via LibRaw, inclusief DNG. (#289)
- Deployments zonder root en met vreemde UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Nauwkeurige detectie van AI-installaties en een gehard installatieproces. (#214, #352)
- Privacyversterking: geen automatische egress naar derden, plus een optionele strikte offline modus.
- Altijd zichtbare feedbackknop, ook als analytics uit staat.

### Opgeloste fouten {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` schakelt rate limiting voor toolroutes weer uit. (#271)
- AI-virtualenv-paden binnen de Docker-image hersteld. (#390)
- Compatibiliteit met sharp 0.35.2+. (#362)
- Lay-outfixes voor de beeldeditor: linialen, vulgedrag, zijbalk en canvasformaat. (#258, #259)
- Italiaanse vertaling voltooid. (#231, #206, #425)
- Audio normalize en loudnorm behouden de samplerate van de bron.
- SSRF-versterking: numerieke IPv6 CIDR-matching en een verbrede URL-voorscan. (#287)
- Gegenereerde PDF's krijgen SnapOtter als Producer gestempeld.
- mediapipe installeert op Python 3.13 en Debian 13.

### Ingrijpende wijzigingen {#breaking-changes}

2.0 vervangt de ingebedde SQLite-database door Postgres 17 en voegt Redis 8 toe voor de taakwachtrij. Je 1.x-gegevens migreren automatisch bij de eerste keer opstarten, maar de containerstack is veranderd, dus maak eerst een back-up van je volledige `/data`-volume (1.x draait SQLite in WAL-modus, dus de vastgelegde gegevens staan meestal in `snapotter.db-wal`). Kies vervolgens de single-container image (ingebedde Postgres en Redis, alleen als root) of de Compose-stack (app plus Postgres 17 en Redis 8). Zie de [migratiegids](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) en de [upgradegids](/nl/guide/upgrading).

### Upgraden {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Of met Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Volledige diff op GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nieuwe HTML-naar-Image-tool, WCAG 2.2 AA-toegankelijkheid, beveiligingsversterking op basis van penetratietests en 5 kritieke Docker-fixes.

### Nieuwe functies {#new-features-1}

- **HTML naar Image**: Maak schermafbeeldingen van URL's of ruwe HTML als PNG/JPEG/WebP. Vastleggingen van volledige pagina's, aangepaste viewports, donkere modus.
- **Docker _FILE-secretconventie**: Koppel gevoelige env-variabelen als bestanden in plaats van als platte tekst. (#205)
- **Enterprise-licentie en S3-opslag**: Optionele commerciële licentiesleutel en S3-compatibele objectopslag.
- **Verbeteringen aan de vormeditor**: Transparantie voor vulling/lijn, RGBA-kleurkiezer, streepjeslijnstijlen.
- **Kant-en-klare release-archieven**: Download tarballs van GitHub Releases voor installaties zonder Docker (Proxmox, bare metal, LXC). (#202)

### Verbeteringen {#improvements-1}

- **WCAG 2.2 AA-toegankelijkheid**: Navigatie overslaan, focus-trapping, aria-live-regio's, ondersteuning voor beperkte beweging, correcte contrastverhoudingen. (#209)
- **Mobiele responsiviteit**: Responsieve instellingen, automatische SSE-reconnect bij het wisselen van mobiele tabbladen. (#203, #204)
- **Kwaliteit van achtergrondverwijdering**: Randverzachting, kleurdecontaminatie, keuze van uitvoerformaat.
- **Italiaanse vertaling**: ~145 nieuwe strings door @albanobattistella. (#206)
- **API-documentatie per tool**: 53 documentatiepagina's met parameters, voorbeelden en responsformaten.
- **AI-modeldownloads**: Retry-logica met exponentiële backoff voor HuggingFace. (#201)

### Opgeloste fouten {#bug-fixes-1}

- Verse Docker-containers waren volledig onbruikbaar (rate limit blokkeerde alle verzoeken).
- AI-tools voor gezichtsdetectie (blur-faces, red-eye-removal, enhance-faces, passport-photo) faalden op alle platforms.
- HEIC-bestanden kapot op ARM (libheif-symboolmismatch).
- AI-bundels voor upscale en restore-photo faalden bij de installatie op ARM.
- OCR gebruikte de verkeerde CUDA-versie op GPU-containers.
- Bypass van de SSRF-bescherming via hex IPv4-mapped IPv6-adressen. (Met dank aan: @tonghuaroot)
- iPhone-HEIC-decodering met hulpafbeeldingen. (#183, #199)
- Real-ESRGAN CUDA OOM op 8 GB-GPU's. (#200)
- 6 Sentry-fouten in productie en 7 QA-bugs. (#208)

### Beveiliging {#security}

- 10 bevindingen uit de penetratietest aangepakt (XFF-bypass, crashes door misvormde JSON, ongelimiteerde pijplijnen, XSS in de auditlog, TRACE-methode en meer). (#207)
- SSRF hex IPv6-bypass geblokkeerd. (Met dank aan: @tonghuaroot)
- Dockerfile-basisimages vastgezet per digest.

### Upgraden {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Of met Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Volledige diff op GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Live demo, landingspagina's per tool en een reeks poetsfixes.

### Nieuwe functies {#new-features-2}

- **Live demo** - [demo.snapotter.com](https://demo.snapotter.com) laat mensen SnapOtter proberen zonder iets te installeren.
- **Tools-indexpagina** - Blader door alle 50+ tools op `/tools` met zoeken en categoriefilters.
- **50+ SEO-landingspagina's** - Elke tool heeft nu een eigen landingspagina met FAQ's, use cases en vergelijkingstabellen.
- **Achtergrondvoorbeeld** - Een voor-na-schuifregelaar toont een geblokte achtergrond achter transparante afbeeldingen.
- **Generator voor sterke wachtwoorden** - Knop met één klik in het formulier Leden toevoegen.

### Opgeloste fouten {#bug-fixes-2}

- De HEIC/HEIF-infotool faalt niet meer (pre-decode toegevoegd).
- De installatie van AI-modelbundels toont betere foutmeldingen en respecteert resourcelimieten.
- Bibliotheekminiaturen laden correct (auth-headers ontbraken).
- Dropdown-menu's worden niet meer afgeknipt in de instellingentabellen van Mensen en Teams.
- Percentage voor formaatvergelijking verborgen bij tools zonder compressie.
- Dubbele link naar het privacybeleid verwijderd.
- Italiaanse vertaling toegevoegd voor de instellingen van AI-functies.
- Hernoemde Lucide-iconen bijgewerkt (Wand2, Columns).

### Infrastructuur {#infrastructure}

- OpenSSF Scorecard verhard van 4.3 naar ~7.0.
- CI-tests geparallelliseerd in 4 shards met verkleinde fixtures.
- 41 dependency-updates.

### Upgraden {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Of met Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Volledige diff op GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Vijf nieuwe tools, een volledige beeldeditor, SSO-login, 20 talen. Waarschijnlijk hadden dit drie afzonderlijke releases moeten zijn, maar zo is het nu eenmaal.

### Nieuwe functies {#new-features-3}

- **Beeldeditor** - Lagen, penselen, vormen, aanpassingen, filters, curves, sneltoetsen. Draait in je browser, verwerkt op je eigen hardware.
- **OIDC / SSO-authenticatie** - Log in met Google, GitHub, Okta of een willekeurige OpenID Connect-provider. Stel een paar env-variabelen in en je team gebruikt zijn bestaande accounts.
- **Meme-generator** - 100 ingebouwde templates met tekstweergave via opentype.js. Of upload je eigen afbeelding.
- **Beautify** - Zet een schermafbeelding erin, krijg een verzorgde afbeelding eruit. Apparaatframes (macOS, Windows, browser), schaduwen, gradiënten, presets voor social media.
- **Simulatie van kleurenblindheid** - Bekijk hoe afbeeldingen eruitzien bij protanopie, deuteranopie, tritanopie en andere afwijkingen in het kleurenzien.
- **Fixer voor PNG-transparantie** - Detecteert nep-transparante PNG's en repareert ze met BiRefNet HR-matting. Optionele watermerkverwijdering via LaMa-inpainting.
- **AI-canvasuitbreiding** - Breid de grenzen van een afbeelding uit met AI-vulling. Drie kwaliteitsniveaus (snel, gebalanceerd, kwaliteit) afhankelijk van hoeveel GPU-tijd je ervoor over hebt.
- **20 talen** - Arabisch, Chinees (vereenvoudigd/traditioneel), Tsjechisch, Nederlands, Frans, Duits, Hindi, Indonesisch, Italiaans, Japans, Koreaans, Pools, Portugees, Russisch, Spaans, Thais, Turks, Oekraïens, Vietnamees. RTL werkt voor Arabisch.
- **URL-import** - Plak URL's in de dropzone of importeer in bulk vanuit een lijst. Server-side ophalen met SSRF-bescherming.
- **Multi-file gum** - Teken gummaskers over meerdere afbeeldingen, verwerk ze allemaal met één klik. Streken blijven per afbeelding behouden.
- **Pijplijn import/export** - Sla toolketens op als JSON en deel ze met anderen.
- **17 nieuwe camera-RAW-formaten** via exiftool, plus QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ en APNG als invoer. Nieuwe uitvoercodecs voor BMP, ICO, JP2, QOI. AVIF-, TIFF-, GIF-, JXL- en PSD-export teruggehaald uit een eerder verloren branch.

### Verbeteringen {#improvements-2}

- **Beeldverbetering** - De oude pijplijn vervangen door CLAHE + normalise + gamma. Een nieuwe Deep Enhance-schakelaar gebruikt het AI-model voor agressievere resultaten.
- **Foto herstellen** - Krasdetectie herschreven met Otsu-filtering onder 8 hoeken. LaMa-inpainting draait nu op de oorspronkelijke resolutie.
- **Exotische formaten overal** - OCR, image-to-PDF, favicon-generator, compositie, stitch en vectorize decoderen nu allemaal HEIC, RAW en PSD.
- **Comprimeren** - Tolerantie voor de doelgrootte aangescherpt van 5% naar 1%. Doelgrootte is de standaardmodus. Stepper-knoppen en een KB/MB-eenheidskiezer toegevoegd.
- **Sentry-opschoning** - 644 niet-actiegerichte events gefilterd. Echte fouten worden nu correct afgehandeld.
- **GPU-detectie** - Betere diagnostiek voor containers waar CUDA aanwezig is maar nvidia-smi niet.
- **Modus met uitgeschakelde authenticatie** - Een anonieme gebruiker wordt in de DB aangemaakt met de admin-rol. API-sleutels, pijplijnen en gebruikersbestanden breken niet langer op FK-constraints.
- **2.705+ nieuwe tests** verdeeld over unit-, integratie- en E2E-tests.

### Opgeloste fouten {#bug-fixes-3}

- Upscale op CPU loopt niet meer af op een timeout op NAS-apparaten en hardware met weinig vermogen.
- Het logo op een QR-code laat het voorbeeld niet meer permanent verdwijnen.
- Crop-overflow opgelost voor hoge portretafbeeldingen.
- TIFF-alpha-bestanden forceren nu correct PNG-uitvoer in plaats van corruptie te produceren.
- HDR/EXR-decodering converteert naar 8-bit vóór CLAHE, waarmee decodeerfouten worden opgelost.
- Invoerbuffers voor gezichtslandmarks worden naar PNG geconverteerd vóór de Python-sidecar, waarmee crashes worden opgelost.
- Duplicaten zoeken verwerkt batches met gemengde formaten en netwerkfouten.
- Het Beautify-voorbeeld werkt in realtime bij.
- Voortgangsbalken voor stitch en vectorize.
- SVGZ afgehandeld door SVG-naar-raster.
- Niet-ASCII-bestandsnamen opgelost via een percent-gecodeerde X-File-Results-header.

### Upgraden {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Of met Docker Compose:

```bash
docker compose pull && docker compose up -d
```

[Volledige diff op GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Geünificeerde Docker-image met automatische GPU-detectie. Eén image handelt zowel CPU- als GPU-workloads af. Compose vereenvoudigd tot één bestand met logrotatie. Model-pre-downloads bevatten nu verificatie en een smoke test.

---

## v1.13.0 {#v1-13-0}

Rolgebaseerde toegangscontrole (RBAC). 14 granulaire permissies, drie ingebouwde rollen (admin, editor, user), ondersteuning voor aangepaste rollen. Permissiecontroles op alle API-routes. Frontend-tabbladen gefilterd op basis van gebruikerspermissies.

---

## v1.12.0 {#v1-12-0}

PDF-naar-Image-tool. Zet PDF-pagina's om naar PNG, JPEG, WebP of TIFF op een aangepaste DPI. Geünificeerde Docker-image met automatische GPU-detectie.

---

## v1.11.0 {#v1-11-0}

Automatisch gegenereerde llms.txt via vitepress-plugin-llms voor AI-vriendelijke documentatie.

---

## v1.10.0 {#v1-10-0}

Contentbewust vergroten/verkleinen (seam carving) met gezichtsbescherming. Verklein afbeeldingen terwijl belangrijke content behouden blijft.

---

## v1.9.0 {#v1-9-0}

Stitch / Combine-tool. Voeg afbeeldingen naast elkaar, verticaal gestapeld of in een aangepast raster samen.

---

## v1.8.0 {#v1-8-0}

Metadata bewerken-tool. Bekijk en bewerk EXIF-, IPTC- en XMP-metadata met een granulaire interface voor verwijderen/behouden.

---

## Oudere releases {#older-releases}

Voor de volledige changelog op commit-niveau, inclusief patch-releases, zie [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
