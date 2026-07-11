---
description: "Release notes en versiegeschiedenis voor SnapOtter. Bekijk wat er nieuw, verbeterd en opgelost is in elke release."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: d60a06326675
---

# Changelog {#changelog}

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
