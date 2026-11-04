---
description: "Release notes en versiegeschiedenis van SnapOtter. Bekijk wat er nieuw, verbeterd en opgelost is in elke release."
i18n_source_hash: 76c6d18aedb4
i18n_provenance: machine
i18n_output_hash: aac564f6ab39
i18n_hash_version: 2
---

# Changelog {#changelog}

## Niet uitgebracht {#unreleased}

### Verouderd {#unreleased-deprecated}

- **De vijf compress-to-size-bewerkingen voor afbeeldingen zijn verouderd.** `/api/v1/tools/image/compress-image-to-20kb`, `-50kb`, `-100kb`, `-200kb` en `-500kb` zijn in de OpenAPI-specificatie als verouderd gemarkeerd en blijven minstens één minor release bestaan. Stuur `POST /api/v1/tools/image/compress` met `settings` ingesteld op `{"mode":"targetSize","targetSizeKb":20}` (of 50, 100, 200, 500). De uitvoer is hetzelfde. De PDF-presetpaden zijn ongewijzigd.

## v2.3.0 {#v2-3-0}

SnapOtter heeft zojuist een miljoen image pulls via Docker Hub en GHCR bereikt, en 3.000 sterren op GitHub. Dat zijn veel zelfgehoste servers, dus deze release is ons bedankje aan iedereen die ze draait.

Upgrade snel. 2.3.0 sluit zes beveiligingsadviezen, waarvan één met hoge ernst. Details staan hieronder in de sectie Beveiliging.

Naast de fixes zijn er nieuwe tools: een PDF Multi-Tool-pagina-editor, compress-to-size-presets met één klik voor afbeeldingen en PDF's, en pagina's ordenen met slepen en neerzetten in Organize PDF. OCR leest nu Arabisch, en pdf-to-text biedt OCR aan wanneer het een gescande PDF tegenkomt. SnapOtter kan achter een reverse proxy onder een subpad draaien, zoals `/snapotter`. De app heeft geen Postgres-superuser meer nodig om te draaien. Beheerders die buitengesloten raken, kunnen herstellen vanaf de opdrachtregel. De rest is ongeveer 1.400 fixes, de meeste voor problemen die u hebt gemeld.

> [!IMPORTANT]
> Alle zes onderstaande adviezen treffen 2.2.0, en sommige reiken terug tot 2.0.0. Als u een instantie met andere gebruikers deelt of buiten uw eigen netwerk blootstelt, upgrade dan.

### Beveiliging {#v2-3-0-security}

- **SVG-uploads konden het opschonen overslaan (GHSA-9c7h-xjrp-8gh3, hoog).** Een SVG die door de afbeeldingsdecoder werd geweigerd, werd ongewijzigd opgeslagen en geserveerd in plaats van opgeschoond. Getroffen: 2.2.0 en eerder. Gemeld door @xaferima. (#1211)
- **De voortgangsstream van jobs controleerde niet wie het vroeg (GHSA-ff22-w6x2-fm98, gemiddeld).** Er is nu inloggen en eigenaarschap van de job vereist. Getroffen: 2.0.0 tot en met 2.2.0. (#1750)
- **Downloadlinks voor resultaten serveerden ook de oorspronkelijke upload (GHSA-jgv3-2jc6-f628, gemiddeld).** Getroffen: 2.2.0 en eerder. Gemeld door @emirhancatkin. (#3623)
- **Pasfoto- en achtergrondeffecten vertrouwden een door de client aangeleverde job-id (GHSA-3c8g-8v4x-qq9j, gemiddeld).** Getroffen: 2.2.0 en eerder. Gemeld door @shaoyuuuuu. (#3623)
- **URL-import, upload en voorbeeld sloegen controles van rol- en API-sleutelrechten over (GHSA-8xxr-g2w8-7f9r, gemiddeld).** Getroffen: 2.2.0 en eerder. Gemeld door @nguyenvantiennani. (#3780, #707)
- **SSO-afdwinging onthulde de break-glass-gebruikersnaam (GHSA-q6fg-vvw9-cr8r, laag).** Een geweigerde lokale login krijgt nu dezelfde 401 als elke andere mislukte login. Getroffen: 2.0.0 tot en met 2.2.0. (#2148)
- **Postgres draait niet langer als superuser.** De app verbindt nu met een rol die alleen gegevens kan lezen en schrijven. Migraties gebruiken een aparte, optionele verbinding. Zie Upgrade-opmerkingen. (#918)
- **Gepatchte afhankelijkheden**: de ondergrenzen voor de overrides van dompurify en handlebars zijn verhoogd naar de gerepareerde versies. (#4247)

### Nieuwe functies {#v2-3-0-new-features}

- **PDF Multi-Tool**: een pagina-editor die pagina's herschikt, dupliceert, roteert en verwijdert, en pagina's uit andere PDF's binnenhaalt. De server stelt het eindbestand samen. (#1338)
- **Comprimeren naar een doelgrootte met één klik**: vijf afbeeldingspresets (20, 50, 100, 200, 500 KB) en vijf PDF-presets (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **SnapOtter onder een subpad draaien**: stel `BASE_PATH=/snapotter` in en dezelfde image serveert vanaf dat pad. Resultaatlinks, cookies, SSO-redirects en de API-documentatie volgen het. (#1252, #1324)
- **Arabische OCR**: kies Arabisch expliciet, of laat de automatische modus het detecteren. Werkt voor OCR op afbeeldingen en PDF's. (#4130, #4183)
- **pdf-to-text biedt OCR aan** wanneer een PDF, of een hele batch, geen tekstlaag heeft, in plaats van een leeg bestand terug te geven. (#4142, #4198)
- **Pagina's ordenen met slepen en neerzetten in Organize PDF**, met muis en aanraking. (#1249, #2601)
- **Bestanden herschikken vóór een run met meerdere bestanden**: merge, stitch, collage en de andere tools voor meerdere bestanden behouden de volgorde die u instelt. (#756, #757)
- **Batch- en pipeline-runs annuleren**, en het werk stopt daadwerkelijk op de server. (#807)
- **`snapotter-admin`-herstelcommando's**: `reset-password`, `create-admin`, `unlock-user` en MFA-reset, voor beheerders die buiten de webinterface zijn gesloten. (#4016)
- **MFA-registratie bij het inloggen**: wanneer MFA vereist is, stellen gebruikers zonder MFA het ter plekke in in plaats van geblokkeerd te worden.
- **Cameraopname en een installeerbare app**: maak op mobiel een foto rechtstreeks in een tool, en installeer SnapOtter als PWA. (#773)
- **Transparante opvulling in het dialoogvenster Canvasgrootte van de editor.** (#4111)
- **Updatemeldingen voor beheerders**: wanneer er een nieuwere SnapOtter is, zien beheerders een melding die ze kunnen wegklikken, met een link naar de release notes. De controle loopt via de bestaande analytics-verbinding, dus staat uit als analytics uit staat.

### Verbeteringen {#v2-3-0-improvements}

- **Achtergrondverwijdering is sneller bij herhaalde runs**: het model blijft tussen verzoeken geladen in plaats van elke keer opnieuw te laden. (#4144)
- **Batch-uploads gebruiken veel minder geheugen**: elk bestand gaat naar tijdelijke schijfruimte en wordt één voor één verwerkt in plaats van in het RAM te staan. (#2687)
- **Installaties van AI-bundels mislukken netjes en worden teruggedraaid** in plaats van een half geïnstalleerde venv achter te laten. Installaties van achtergrondverwijdering op Proxmox LXC werken weer, en hosts met weinig geheugen krijgen verstandige CPU-limieten voordat een job start. (#2628, #2597, #2526, #2546)
- **GPU-detectie is betrouwbaarder**: CUDA wordt via het stuurprogramma gedetecteerd, kaarten uit de RTX 50-serie vallen terug op de CPU in plaats van te mislukken, en hardwarematige video-encoders worden vóór gebruik getest. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` werkt nu**. Het werd geparsed maar nooit toegepast. (#3249)
- **Lange tools krijgen de lange time-out**: pdf-to-word, compress-pdf, convert-document en content-aware resize verlopen niet langer te vroeg bij grote bestanden. (#3276)
- **Compress PDF houdt scans leesbaar**, en meldt het wanneer een doelgrootte niet haalbaar is in plaats van een onleesbaar bestand te maken. (#4112)
- **Mislukte logins worden per gebruikersnaam beperkt**: meer dan tien in vijftien minuten levert een 429 op met `Retry-After`. (#827)
- **Fouten zeggen wat er misging**: ontbrekende programma's, opslagfouten, out-of-memory-kills en uploadlimieten krijgen nu specifieke meldingen in plaats van een kale 500 of 422.
- **Het auditlog dekt tool-, batch- en pipeline-runs**, en gebeurtenissen rond gebruikers, rollen, teams en AVG leggen vast wie wat met wie deed. (#3991, #3984)
- **De all-in-one-container stopt bij een foute eerste start** in plaats van eindeloos te herstarten, en de embedded Postgres en Redis hebben deadlines voor het opstarten. (#3008, #1130)
- **Datums en meervouden volgen uw taal**, en de laatste hardgecodeerde Engelse teksten zijn vertaald.
- **Verfijning voor mobiel en de editor**: schuifregelaar-, Sign PDF- en uitsnede-indelingen op telefoons, slepen met aanraking, snellere pixelpenselen, en Levels en Curves in ongedaan maken en automatisch opslaan.

### Bugfixes {#v2-3-0-bug-fixes}

- **Adjust Colors combineerde instellingen verkeerd**: temperatuur, verzadiging, tint, contrast en sepia overschreven elkaar in plaats van te stapelen. (#3153, #3120, #3469)
- **Pixelate pixeleerde niet**, en PNG-uitvoer werd bij beeldtools stilletjes tot een palet gereduceerd. (#709, #716)
- **Geanimeerde GIF en WebP verloren frames** in verschillende tools, en GIF-paletten en transparantie kwamen verkeerd uit. (#1184, #1225, #3407, #2573)
- **Geroteerde uploads verloren kwaliteit**: auto-oriënteren liet lossless codering, transparantie en 16-bits diepte vallen. Geanimeerde WebP roteert nu elk frame. (#2384, #2529)
- **TIFF's met transparantie, AV1 HEIF-bestanden en verschillende RAW-formaten** mislukten of verloren alfa. (#2609, #2572, #1120)
- **Het formaat van het editorcanvas wijzigen schaalde de afbeelding** in plaats van ruimte eromheen toe te voegen. (#2081)
- **Uitvoerbestandsnamen werden verminkt**: `.jpeg` en `.tif` werden iets anders, en dotfiles of namen die hun extensie herhalen gingen mis. (#3495, #3382)
- **Automatisch opslaan in de bibliotheek negeerde het opslagquotum**, en opslagtellers konden negatief worden. (#2389, #2585)
- **Jobs die na een herstart vastliepen** worden nu bij het opstarten afgehandeld in plaats van eeuwig "bezig met verwerken" te tonen. (#3219, #3193)
- **OIDC-aanmelding noemde elke nieuwe gebruiker "admin"**, en aanmeldingen in iOS Safari eindigden op een foutpagina nadat ze waren gelukt. (#862, #4021)
- **Uitgeschakelde wachtwoordregels werden toch afgedwongen** bij het aanmaken van gebruikers. (#1028)
- **Beschadigde PDF's bleven 30 seconden hangen** voordat ze mislukten. (#920)
- **De schijfcontrole voor AI-bundels vroeg ongeveer 18 GB** om één bundel te installeren. (#1248)
- **Compress Video mislukte bij schermopnamen met variabele framerate.** (#2427)
- **Achtergrondverwijdering in batch verloor voltooide resultaten** wanneer de browser het verzoek opnieuw probeerde. (#2015)
- **Getalvelden in Instellingen konden niet worden gewist** tijdens het typen. (#1449)
- **Analytics uitzetten liet in de wachtrij staande gebeurtenissen** ongeveer 30 seconden later nog versturen. Ze worden nu verwijderd wanneer u zich afmeldt. (#4270)

### Upgrade-opmerkingen {#v2-3-0-upgrade-notes}

Migraties worden bij het opstarten vanzelf uitgevoerd. U hoeft geen SQL uit te voeren.

- **Databaserollen.** Het canonieke Compose-bestand geeft de app nu een rol die alleen gegevens kan lezen en schrijven (`DATABASE_URL`) en een aparte bevoorrechte verbinding (`DATABASE_MIGRATION_URL`) die alleen tijdens het opstarten wordt gebruikt voor migraties en rechten. Een bestaand Compose-bestand blijft werken zoals voorheen: laat `DATABASE_MIGRATION_URL` ongedefinieerd en SnapOtter draait met één rol. Stel voor een niet-lokale implementatie `POSTGRES_APP_PASSWORD` in naast `POSTGRES_PASSWORD`.
- **Strengere opstartcontroles.** Deze mislukten voorheen later of stilzwijgend. Nu stoppen ze de container met een melding die de variabele noemt: een niet-ondersteunde `DEFAULT_LOCALE` (gebruik een ondersteunde code zoals `de`, niet `de_DE`), een misvormde `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` of `OIDC_ISSUER_URL` wanneer SSO aan staat, een ongeldige lijst `TRUST_PROXY`, een foute `BASE_PATH` en een niet-beschrijfbare `LOG_DIR`.
- **`TRUST_PROXY` accepteert geen hop-aantal meer.** Een getal als `TRUST_PROXY=2` stopt de container nu bij het opstarten in plaats van stilzwijgend geen proxy te vertrouwen. Stel het in op de proxyadressen of benoemde bereiken (de standaard is `loopback,linklocal,uniquelocal`), `false` wanneer niets SnapOtter proxyt, of `true` alleen wanneer een proxy onder uw beheer op een openbaar adres ervoor staat. (#998)
- **`MAX_WORKER_THREADS` werkt nu.** Als u het had ingesteld en geen verandering zag, ziet u die nu wel.
- **API-statuscodes.** Engine- en opslagfouten geven 503 `ENGINE_UNAVAILABLE` terug (batch-endpoints gaven voorheen 422). Uploads boven de limiet geven 413 (was 400). Een misvormde `clientJobId` geeft 400 en een hergebruikte 409 (was 500). Het opnieuw afspelen van uw eigen pipeline-batch geeft 202. `mode=targetSize` zonder `targetSizeKb` geeft 400. Een geweigerde lokale login bij SSO-afdwinging geeft 401 in plaats van 403 `SSO_ENFORCED`. Beperkte logins geven 429 `LOGIN_THROTTLED`. Het resultaat van remove-background bevat `originalUrl` niet meer.
- **Nieuwe optionele variabelen**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (standaard 15 minuten, `0` schakelt uit), `EMBEDDED_REDIS_TIMEOUT_S` (180) en `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Compose-bestanden worden met de release meegeleverd.** `docker-compose.yml` en `docker-compose-gpu.yml` zijn aan deze release toegevoegd, zodat u ze rechtstreeks van de releasepagina kunt downloaden.

### Dankbetuigingen {#v2-3-0-acknowledgements}

Een miljoen pulls betekent veel mensen die bugs melden, fixes insturen en ons vertellen wat ontbrak. Deze release is grotendeels hun werk.

Code en bijdragen:

- **@zakka258** ❤️: Bouwde de PDF Multi-Tool-pagina-editor en de implementatie onder een subpad, twee van de grootste functies in deze release, inclusief de tests voor authenticatie en SSO onder een subpad. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Bouwde de compress-to-size-afbeeldingspresets met één klik, loste gelijktijdigheid en opruiming bij voorbeelden op, en voorkwam dat geblokkeerde browseropslag de login-spinner liet hangen. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Voegde het herschikken van pagina's met slepen en neerzetten toe aan Organize PDF, waar ze eerst in Discussions om hadden gevraagd. (#1249, #965)
- **@drakeo338** ❤️: Tien fixes door de hele stack, waaronder auto-oriënteren dat formaat en kwaliteit behoudt, SCIM-groepen die in één transactie worden aangemaakt, AI-installaties onder cgroup v2, en 5xx-fouten die niet meer als 422 worden gemaskeerd. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Voegde transparante canvasopvulling toe aan de editor, loste verouderde doelgrootte-oordelen van Compress PDF op en stond gedeeltelijke teamupdates toe. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Zorgde dat zelfgehoste instanties geen heatmapgegevens meer versturen, valideerde `TRUST_PROXY` bij het opstarten in plaats van te crashen, en loste de verwerking van SCIM-groepsnamen en qpdf-time-outs op. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Veranderde verschillende 500-fouten in correcte 400- en 409-antwoorden voor misvormde job-id's en multipart-imports, en loste het wissen van getalvelden in Instellingen op. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Liet het lezen van barcodes offline werken door de decoder mee te bundelen, loste op dat mediavoorbeelden de invoer toonden, en verbeterde het zoeken op formaat. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Meldde en loste op dat Compress Video mislukte bij schermopnamen met variabele framerate. (#2426, #2427)
- **@dvd233** ❤️: Maakte elk camera-RAW-formaat dat de decoder ondersteunt beschikbaar, en zorgde dat favicon-tools verschijnen bij zoekopdrachten naar ICO. (#1120, #1121)
- **@bercedev** ❤️: Loste bestandsnamen op waarvan de stam de extensie herhaalt, en zorgde dat AI het apparaat meldt waarop het echt draait. (#3382, #3613)
- **@pamod-madubashana** ❤️: Vertaalde de laatste alleen-Engelse MFA-kop en koppelde ongebruikte voortgangsteksten aan. (#1228, #1227)
- **@mvanhorn** ❤️: Loste dubbele toewijzing van gebruikersnamen bij SAML-aanmelding op. (#2640)
- **@peremunoz** ❤️: Voorkwam dat het genereren van barcodes opslag- en geheugenfouten verborg als "Ongeldige tekst". (#4057)
- **@mayuriphad** ❤️: Loste een crash op bij een misvormde opgeslagen auth-header van een alert. (#3080)
- **@DevShoaib78** ❤️: Loste het sluiten van de veelhoekige lasso in de editor op. (#1207)
- **@dltsum** ❤️: Verplaatste voortgangsweergaven naar de gedeelde berichtencatalogus. (#1262)
- **@albanobattistella** ❤️: Vertaalcorrecties. (#1024)
- **@shoaibyazdani** ❤️: Regenereerde de visuele macOS-baselines. (#2475)

Beveiligingsmeldingen:

- **@xaferima** ❤️: Ontdekte dat SVG's die de decoder weigerde het opschonen oversloegen, en werkte de impact samen met ons uit. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Ontdekte dat resultaatlinks ook de oorspronkelijke upload serveerden. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Ontdekte dat pasfoto- en achtergrondeffecten een door de client aangeleverde job-id vertrouwden. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Ontdekte dat URL-import rechtencontroles oversloeg. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Meldde IPv6-omzeilingen van de SSRF-adrescontroles, met werkende proof-of-concepts. De fixes verschenen in 2.0.0, en dit bedankje is achterstallig. (#287)

Bugmeldingen:

- **@kabo** ❤️: Het voorbeeld `docker-compose.yml` werkte niet. (#1027)
- **@xromen** ❤️: Beschadigde PDF's die bleven hangen tot een qpdf-time-out van 30 seconden. (#920)
- **@snmabaur** ❤️: OIDC-aanmelding die elke profielnaam op "admin" zette. (#862)
- **@CodecNomad** ❤️: De Blur-tool die de afbeelding dupliceerde. (#829)
- **@ohora0923** ❤️ en **@Alexis-VS-CSharp** ❤️: Pixelate werkte niet. (#678, #775)
- **@mptpro** ❤️: De AI-download voor achtergrondverwijdering die mislukte. (#714)
- **@dominic427** ❤️: Het formaat van het editorcanvas wijzigen schaalde de afbeelding in plaats van die uit te breiden. (#2016)
- **@CodeByToast** ❤️: Getalvelden in Instellingen die niet konden worden gewist. (#1186)
- **@gioxx** ❤️: De schijfcontrole voor AI-bundels die ongeveer 18 GB eiste voor één bundel. (#1248)
- **@rekcodocker** ❤️ en **@madmike970** ❤️: Installaties van AI-bundels die mislukten op Proxmox LXC, met de containergegevens die hielpen het te achterhalen. (#1030, #352)
- **@wxf26054** ❤️: Uitgeschakelde wachtwoordregels die toch werden afgedwongen bij het aanmaken van gebruikers. (#1028)
- **@ersil** ❤️: iOS Safari die de OIDC-callback twee keer opvroeg en op een foutpagina belandde na een geslaagde aanmelding. (#4021)
- **@casi-3** ❤️: Achtergrondverwijdering in batch die voltooide resultaten verloor wanneer de browser het verzoek opnieuw afspeelde, met een nauwkeurige diagnose. (#2015)
- **@killervette42** ❤️: De Blackwell-GPU-fout op unRaid, die bijdroeg aan de CPU-terugval voor de RTX 50-serie. (#120, #4075)

Functieverzoeken en feedback:

- **@photoevents** ❤️: Mat dat achtergrondverwijdering ongeveer 11 seconden aan het laden van het model besteedde en 1 seconde aan inferentie, stelde het cachen van sessies voor en deelde wat ze hadden geleerd van hun eigen cache. Dat werd de sessiecache in deze release. (#768, #776, #4144)
- **@benbou8231** ❤️: Wees erop dat geïmporteerde bestanden in omgekeerde volgorde in tools voor meerdere bestanden terechtkomen, wat leidde tot herschikken vóór een run. (#729, #756)
- **@cf3901646** ❤️: Herleidde een luidruchtige productiefout tot Postgres-foutklasse 58 en stelde de fix voor. We konden hun PR niet mergen zonder ondertekende CLA, dus schreven we dezelfde fix zelf. (#4210, #4253)
- **@chiliec** ❤️: Zag dat een mislukte auto-oriëntatie stilzwijgend werd ingeslikt en dat de installatievoortgang de vertaalcatalogus negeerde. Beide voorstellen verschenen via PR's van de maintainers. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Stelde voor de import van de enterprise-module single-flight te maken, de fix voor gelijktijdige SCIM-verzoeken die het niet eens waren over de licentie. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Wees erop dat de configuratiehandleiding de overrides van engine-programma's en `SNAPOTTER_HW_ACCEL` nooit noemde, die nu gedocumenteerd zijn. (#1312, #1696)
- **@aron-intframe** ❤️: Reproduceerde een hiaat in de foutafhandeling van exiftool op een verse clone en ontdekte dat de race op het tijdelijke pad erger was dan de issue beschreef. (#3458)

Ook dank aan de leden van de community die dit via Discord en e-mail hebben gemeld en wier namen we niet hebben vastgelegd.

[Volledige diff op GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Het grootste deel van 2.2 is hardening. Een niet-beheerder met een gedelegeerde rol `users:manage` kon een instantie overnemen, en bij elk tool-endpoint ontbrak de rechtencontrole. Upgrade als u met meer dan één gebruiker draait.

De rest is de lange staart van zelfhosting: downloads die begonnen en nooit eindigden, presets die braken zodra u een tweede bestand toevoegde, containers die in een crashloop zaten terwijl Postgres nog opstartte. Er kwamen ook twee nieuwe tools bij. Docs en de website zijn nu vertaald in 21 talen, en de interface haalt eindelijk WCAG AA-contrast.

> [!IMPORTANT]
> Als u `users:manage` via een aangepaste rol aan een niet-beheerder hebt toegekend, kon die rol beheerdersaccounts overnemen in 2.0.0 tot en met 2.1.0. Details bij Beveiliging.

### Beveiliging {#v2-2-0-security}

- **Rechtenescalatie via een gedelegeerde rol `users:manage` (GHSA-9xgh-95qh-2x7h).** Een niet-beheerder met `users:manage` via een aangepaste rol kon het wachtwoord van een account met hogere rechten resetten of dat account verwijderen, een ingebouwde beheerder inbegrepen, en zo de instantie overnemen. Wachtwoordreset en accountverwijdering controleren nu de bevoegdheid van de aanroeper over het doelwit, zodat een gedelegeerde rol niet boven zijn eigen niveau kan reiken. Getroffen: 2.0.0 tot en met 2.1.0. Gemeld door 李春来 (Chunlai Li). (#616)
- **Elk tool-endpoint is nu afgeschermd.** Toegang tot tools werd per route afgedwongen, dus alle 45 handgeschreven routes moesten dezelfde aanroep onthouden en geen enkele deed dat. Een rol zonder `tools:use` kon nog steeds image-to-pdf, erase-object, upscale, sign-pdf en de rest uitvoeren. De controle staat nu in één preHandler op basis van de gematchte route, dus dekt subpaden en elke later toegevoegde route. (#646)
- **Rate limiting was te omzeilen bij Docker-installaties.** De image werd geleverd met `TRUST_PROXY=true`, dus het client-IP kwam uit een request-header en een vervalste `X-Forwarded-For` liep langs de loginlimiter. De standaard is nu een vertrouwenslijst van privénetwerken. (#649)
- **Schrijfacties naar instellingen worden per instelling gecontroleerd**, niet één keer bij de deur, en configuratie-import is nu transactioneel zodat een geweigerde sleutel geen half toegepaste configuratie kan achterlaten. (#618)
- **Bestandsnamen in de bibliotheek kunnen hun opslagroot niet ontsnappen.** Een vervaardigde opgeslagen naam, die een kwaadaardige 1.x SQLite-import ongewijzigd kopieert, kon bestanden buiten de bestandenmap lezen of verwijderen. Alleen bereikbaar nadat een operator een door een aanvaller aangeleverde 1.x SQLite-database importeert, de enige route waarlangs een opgeslagen naam te kiezen is. Gemeld door @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Het annuleren van jobs dwingt eigenaarschap af**, zodat een geauthenticeerde gebruiker de job van een andere gebruiker niet meer kan annuleren via de id. Gemeld door @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Een nieuwe audit van de hele 2.0-boom ving op wat nog openstond**: een onderschepte SAML-assertion kon worden herspeeld, een MFA-uitdaging overleefde een onbeperkt aantal foute codes, het opzoeken van de API-sleutel per verzoek was een volledige tabelscan, `MAX_WORKSPACE_SIZE_GB` was dode configuratie, en de SVG-sanitizer liet hrefs `javascript:` zonder aanhalingstekens door. (#620)
- **Negen bekendgemaakte CVE's gepatcht**: fast-uri, svgo, sharp en tar transitief (#619), plus Pillow 12.3.0 (#517). RAW-decodering op arm64 bouwt nu LibRaw 0.22.2 vanuit de broncode in plaats van te linken met een ongepatchte systeemkopie. (#649)

### Nieuwe functies {#v2-2-0-new-features}

- **Rounded Crop**: maskers met afgeronde vierkanten en squircles in iOS-stijl, met een regelaar voor de hoekstraal. Gemaakt voor favicons en app-iconen. (#602)
- **Remove GIF Background**: verwijder frame voor frame de achtergrond van een geanimeerde GIF, WebP of APNG en krijg een transparante animatie terug. (#502)
- **Lasso en modus Hoge kwaliteit voor Object Eraser**: sleep een vrije lus in plaats van elke pixel te schilderen, en installeer optioneel een diffusion-inpainting-bundel voor schonere vullingen van grote gebieden. (#503, #566)
- **Opslaan als nieuw, of overschrijven.** Het bewerken van een bibliotheekbestand verving stilzwijgend het origineel. U kiest nu per bewerking, en de standaard behoudt het origineel. (#564, #577)
- **Beeldverhoudingspresets in Resize.** Kies 1:1, 4:3 of 16:9 en beide afmetingen blijven vergrendeld, zonder op te schalen. (#530)
- **OCR in twee niveaus**: een snel niveau is in de image ingebakken en draait offline zonder download, en een nauwkeurigere runtime wordt op verzoek geïnstalleerd. (#519)
- **Typ overal om te zoeken.** Begin te typen op het dashboard of de homepage en de tekst komt in het zoekvak terecht. (#644)
- **Documentatie en website in 21 talen**: de docs-site, de landingspagina's en de API-referentie zijn nu allemaal vertaald, naast de app-interface. Een nieuwe handleiding voor implementatie met weinig resources behandelt Raspberry Pi en machines met 2 GB. (#548)
- **Duidelijkere toolnamen**: 18 dubbelzinnige namen kwalificeren zichzelf nu, dus "Compress" werd "Compress Image". Tool-id's en routes zijn ongewijzigd, dus niets wat u als bladwijzer hebt opgeslagen breekt. (#520)

### Verbeteringen {#v2-2-0-improvements}

- **WCAG AA-contrast door de hele interface**: het palet is bijgesteld zodat levendig oranje op vlakken blijft terwijl tekst en labels toegankelijke inkttokens gebruiken, en alle 57 focusindicatoren halen nu de 3:1-norm voor niet-tekst. (#567, #574)
- **Upscale en achtergrondverwijdering lijken niet meer te bevriezen**: de voortgangsbalk loopt op tijdens de inferentie in plaats van op 30% te blijven staan, en beide tools waarschuwen nu dat een host met alleen CPU veel trager is. (#605, #608)
- **Time-outmeldingen noemen de echte oorzaak** en houden rekening met hosts met alleen CPU in plaats van de upload de schuld te geven. (#596)
- **SnapOtter wacht bij het opstarten op Postgres en Redis** in plaats van in een crashloop te raken, zowel in Compose als in de all-in-one-image. Een Proxmox LXC-installatie herstartte hierdoor 76 keer. (#537, #595)
- **Downloads overleven een reverse proxy**: SnapOtter vraagt nginx en compatibele proxy's om bestandsantwoorden niet te bufferen, wat de gebruikelijke reden is dat een zelfgehoste download begint en nooit eindigt. (#604, #607)
- **Compress PDF landt dicht bij de doelgrootte**, en zegt eerlijk wanneer een doel buiten bereik is. (#522)
- **Besturing van tools op mobiel blijft bereikbaar** nu de app-shells meeschalen met de dynamische viewport. (#559)
- **Convert Audio biedt een instelling voor de samplefrequentie.** (#561)
- **Beheerders kunnen de minimale wachtwoordlengte versoepelen**, tot 1 voor een vertrouwd LAN. (#543)
- **MFA is zelfservice**, de beleidsvergrendeling is gesloten, en OIDC- of SAML-logins krijgen een echte MFA-uitdaging in plaats van een harde blokkade. (#531, #536)
- **Een kale `Error: Error` noemt nu zijn oorzaak.** Sharp-encodeerfouten, AI-sidecar-exits, niet-JSON-uitvoer van de documentsidecar en fouten bij achtergrondverwijdering kwamen allemaal aan zonder de reden. (#532, #534, #535, #538, #612)
- **Het helpdialoogvenster is vertaald.** De sneltoetslabels en de starttekst stonden hardgecodeerd in het Engels terwijl complete vertalingen ongebruikt in alle 21 localebestanden stonden. (#647)

### Bugfixes {#v2-2-0-bug-fixes}

- **HEIC-bestanden van iPhones werden geweigerd** als onleesbaar voordat ze de decoder bereikten die ze afhandelt. (#631)
- **Conversiepresets mislukten bij een tweede bestand**: jpg-to-pdf en de verwante image-to-pdf-presets, plus pdf-to-png, pdf-to-jpg en pdf-to-tiff, gaven allemaal `Tool not found` zodra u twee bestanden uploadde. (#633, #643)
- **PDF-conversiepresets verloren hun downloadknop.** (#629)
- **Een onbeperkte verwerkingstime-out werd niet gerespecteerd**, en vastgelopen voortgangsstreams herstellen nu in plaats van de interface te laten wachten. (#638)
- **Downloads bleven hangen in plaats van te mislukken** wanneer een opgeslagen bestand korter bleek dan de vastgelegde lengte. (#617)
- **PDF-paginatools mislukten bij korte en versleutelde bestanden**: Remove Pages gebruikte standaard een paginabereik dat geen document onder zes pagina's heeft, en met een wachtwoord beveiligde PDF's mislukten cryptisch in de worker. (#594)
- **PDF to Text gaf stilzwijgend een leeg bestand terug** voor gescande PDF's. Het wijst u nu naar OCR en serveert tekst als UTF-8. (#603)
- **PDF to Word liet gekleurde tekstblokken vallen** en verdeelde ze over de pagina. (#500)
- **Object Eraser liet spookresten achter** en maakte kleine objecten in afbeeldingen met hoge resolutie wazig. (#501)
- **Stabilize Video schreef onafspeelbare uitvoer** zonder faststart. (#593)
- **Reparaties aan de afbeeldingseditor**: roteren, spiegelen, formaat wijzigen, levels, curves, filters en laagvergrendeling. (#597)
- **Sign PDF toonde een leeg canvas** in plaats van te melden waarom een PDF niet laadde. (#545)
- **De bestandenbibliotheek legde afmetingen van 0x0 vast** en sloeg voorbeelden over voor HEIC-, RAW- en PSD-uploads. (#636, #637)
- **Het installeren van meer dan één AI-bundel** liet de gedeelde virtualenv met meerdere versies achter en brak stilletjes drie tools. (#649)
- **Converteren naar JXL met kwaliteit 1 tot en met 4 gaf een 500**, en een ontbrekende ffmpeg werd aan u gemeld als een corrupte upload. (#649)
- **Een tijdelijke Postgres-storing liet voltooide jobs stranden**, met uitvoer op schijf zonder rij die ernaar verwees. Een reconciler neemt dat werk nu over in plaats van het te laten vallen. (#649)
- **Een Redis-endpoint dat van adres veranderde, blokkeerde elke consumer** terwijl health checks nog steeds 200 antwoordden. (#649)
- **Fixes voor website en docs**: gelokaliseerde links verliezen geen `#`-fragmenten meer en zetten `zh-CN` niet meer om naar kleine letters, de docs-navigatie blijft op tablets binnen de viewport, en geen van beide sites roept nog de GitHub API aan vanuit uw browser. (#516, #562, #570, #560)

### Upgrade-opmerkingen {#v2-2-0-upgrade-notes}

Er hoeft niets gemigreerd te worden, maar twee meegeleverde standaardwaarden zijn gewijzigd:

- **`TRUST_PROXY` is nu standaard `loopback,linklocal,uniquelocal`** in plaats van elke peer te vertrouwen. Docker-bridge- en Compose-netwerken vallen binnen dat bereik, dus de meeste opstellingen hoeven niets te wijzigen. Als uw reverse proxy SnapOtter vanaf een openbaar adres bereikt, stel `TRUST_PROXY` dan expliciet in, anders schrijven rate limiting en auditlogs elk verzoek aan de proxy toe.
- **`MAX_AI_JOBS_PER_USER` is standaard 5** gelijktijdige AI-jobs met één bestand per gebruiker. AI-runs in batch en pipeline blijven onbegrensd.

Nieuwe optionele instellingen: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (standaard uit) en `GIF_BG_MAX_FRAMES`.

### Dankbetuigingen {#v2-2-0-acknowledgements}

Een groot deel van deze release begon als de bugmelding van iemand anders.

Code en bijdragen:

- **@mvanhorn** ❤️: Herschreef de time-outfout van remove-background tot een melding die zegt wat u eraan kunt doen, in plaats van een kale time-out. (#518, #494)
- **@EuanTop** ❤️: Herstelde de downloadactie op de presetpagina's voor PDF-conversie door de synchrone route het standaard toolresultaatcontract te laten teruggeven. (#629, #623)
- **@harshjainnn** ❤️: Stelde de diagnose van de download die begint en nooit eindigt, en stelde de richting van de socketreset voor waarop de fix is gebouwd. (#617, #590)

Beveiligingsmeldingen:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Meldde de rechtenescalatie via een gedelegeerde rol `users:manage` privé, met een volledige analyse van bron tot sink en een werkende exploitketen. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Meldde een geauthenticeerde IDOR bij het annuleren van jobs, en een path traversal in opgeslagen bestandsnamen in de bibliotheek die bereikbaar was na een kwaadaardige 1.x SQLite-import, elk met een werkende proof-of-concept. (#599, #600)

Bugmeldingen:

- **@riz467** ❤️: Echte HEIC-bestanden van iPhones die bij de validatie werden geweigerd, met de grondoorzaak uitgewerkt in de melding. (#622)
- **@coupej** ❤️: Presetpagina's voor PDF die eindeloos bleven hangen, en jpg-to-pdf dat mislukte zodra er een tweede bestand werd toegevoegd. Twee afzonderlijke bugs, correct gescheiden. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` gedocumenteerd als onbeperkt maar begrensd op vijf minuten. (#630)
- **@bezibaerchen** ❤️: Convert Audio verborg de instelling voor de samplefrequentie die de eigen beschrijving beloofde. (#558)
- **@hell-toupee** ❤️: De nauwkeurige OCR-bundel die niet kon worden geïnstalleerd met een fout `libpaddle`. (#505)
- **@Michael1260** ❤️ en **@And-CSH** ❤️: Bevestigden die OCR-installatiefout onafhankelijk en stelden vast dat handmatig uitpakken werkt terwijl het installatieprogramma in de app dat niet doet, waarmee de bug bij het installatieprogramma werd gelokaliseerd. (#505)
- **@TomErnst1972** ❤️: Het inschakelen van het MFA-verplicht-beleid sloot een beheerder buiten zijn eigen instantie. (#515)
- **@thokich** ❤️: Object erasing gaf wazige, onbruikbare vullingen, wat zowel de herschrijving van HD-inpainting als de optionele bundel voor hoge kwaliteit aandreef. (#141)
- **@Hennie-git** ❤️: Een Proxmox LXC-installatie die 76 keer herstartte tegen een Postgres die nog geen verbindingen accepteerde. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Handelde die melding in realtime af en leverde de diagnose waarop de opstartfix is gebouwd. (#537)

Functieverzoeken en feedback:

- **@LECOQQ** ❤️: Vroeg om versoepeling van de wachtwoordcomplexiteit bij een installatie op een thuisserver. (#136)
- **@killervette42** ❤️: Vroeg om een Unraid Community App, nu gepubliceerd in de Unraid CA-store. (#96)
- **@alienatedsec** ❤️: Wees erop dat de fix voor GPU-terugval naar CPU begraven lag in een gesloten issue en onvindbaar was, en staat daarom nu in de implementatiedocs. (#490, #587)
- **@neilp316** ❤️: Bevestigde de Blackwell-GPU-fout op een RTX 5060 en schetste een werkend upgradepad naar CUDA 12.8. (#120)
- **@Roiki11** ❤️: Pleitte voor gedeelde opslag met padverwijzingen in plaats van bestandsoverdracht via HTTP voor AI-rekenkracht buiten de machine. (#189)

Ook dank aan de leden van de community die dit via Discord en e-mail hebben gemeld en wier namen we niet hebben vastgelegd: het verzoek om de squircle-uitsnede (#602), de image-to-PDF-download die begon en nooit eindigde (#604, #607), de tool Delete Pages die bleef hangen (#594), Arabische tekst die ontbrak in pdf-to-text (#603) en de diagnose achter de ONNX-GPU-terugval (#490).

[Volledige diff op GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 maakt van de afbeeldingstoolkit een complete bestandsbewerkingssuite: ruim 200 tools in vijf modaliteiten (Afbeelding, Video, Audio, PDF en Bestanden), herbouwd op Postgres 17 en een Redis-gebaseerde jobwachtrij, met een `docker run` met één commando. Dit is een grote release; lees Brekende wijzigingen voordat u van 1.x upgradet.

### Nieuwe functies {#new-features}

- **Vier nieuwe toolmodaliteiten**: Video, Audio, PDF en Bestanden voegen zich bij Afbeelding, waarmee de catalogus op meer dan 200 tools komt.
- **Duurzame achtergrondjobs**: Een Redis-gebaseerde wachtrij (BullMQ) voert elke tool uit als een gevolgde job met live SSE-voortgang.
- **All-in-one-modus met één container**: Eén `docker run` start een complete instantie met embedded Postgres en Redis.
- **AI-bundels op verzoek**: Achtergrondverwijdering, OCR, transcriptie, upscaling, gezichtsdetectie en -verbetering, object eraser, inkleuren en fotorestauratie worden vanuit de interface geïnstalleerd. GPU-versnelling wordt per framework gedetecteerd.
- **Sign PDF**: Teken, typ of upload een handtekening en plaats die in de browser op een PDF.
- **Automate**: Een visuele pipelinebouwer die tools koppelt, met negen kant-en-klare sjablonen.
- **83 conversiepresets met één klik**: Speciale converters zoals JPG-naar-PNG en MP4-naar-GIF met fuzzy zoeken.
- **Op lagen gebaseerde afbeeldingseditor**: Een Konva-editor op `/editor` met penselen, vormen, aanpassingen, filters en curves.
- **Bestandenbibliotheek**: Sla elk resultaat op en hergebruik het als invoer voor een andere tool.
- Vastgezette tools, zoomen en pannen in het canvas, 21 talen en enterprise-mogelijkheden (OIDC/SSO, SAML, SCIM, S3-opslag, rechten per tool, auditexport, gedistribueerde tracing).

### Verbeteringen {#improvements}

- Een lopend proces annuleren. (#137)
- RAW-decodering op volledige resolutie via LibRaw, inclusief DNG. (#289)
- Implementaties zonder root en met vreemde UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Nauwkeurige detectie van AI-installaties en een geharde installatieflow. (#214, #352)
- Privacy-hardening: geen automatische egress naar derden, plus een optionele strikt-offlinemodus.
- Altijd beschikbare feedbackknop, ook als analytics uit staat.

### Bugfixes {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` schakelt rate limiting voor toolroutes weer uit. (#271)
- AI-virtualenvpaden in de Docker-image hersteld. (#390)
- Compatibiliteit met sharp 0.35.2+. (#362)
- Fixes voor de indeling van de afbeeldingseditor: linialen, vulgedrag, zijbalk en canvasgrootte. (#258, #259)
- De Italiaanse vertaling voltooid. (#231, #206, #425)
- Audio normalize en loudnorm behouden de samplefrequentie van de bron.
- SSRF-hardening: numerieke IPv6 CIDR-matching en een verbrede URL-voorscan. (#287)
- Gegenereerde PDF's krijgen SnapOtter als Producer.
- mediapipe installeert op Python 3.13 en Debian 13.

### Brekende wijzigingen {#breaking-changes}

2.0 vervangt de embedded SQLite-database door Postgres 17 en voegt Redis 8 toe voor de jobwachtrij. Uw 1.x-gegevens worden bij de eerste start automatisch gemigreerd, maar de containerstack is gewijzigd, dus maak eerst een back-up van uw hele volume `/data` (1.x draait SQLite in WAL-modus, dus de vastgelegde gegevens staan meestal in `snapotter.db-wal`). Kies daarna de image met één container (embedded Postgres en Redis, alleen root) of de Compose-stack (app plus Postgres 17 en Redis 8). Zie de [migratiehandleiding](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) en de [upgradehandleiding](/nl/guide/upgrading).

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

Nieuwe tool HTML to Image, WCAG 2.2 AA-toegankelijkheid, beveiligingshardening uit penetratietests en 5 kritieke Docker-fixes.

### Nieuwe functies {#new-features-1}

- **HTML to Image**: Maak schermafbeeldingen van URL's of ruwe HTML als PNG/JPEG/WebP. Opnames van de volledige pagina, aangepaste viewports, donkere modus.
- **Docker _FILE-secretconventie**: Mount gevoelige omgevingsvariabelen als bestanden in plaats van platte tekst. (#205)
- **Enterprise-licenties en S3-opslag**: Optionele commerciële licentiesleutel en S3-compatibele objectopslag.
- **Verbeteringen aan de vormeneditor**: Transparantie van vulling en lijn, RGBA-kleurkiezer, streeplijnstijlen.
- **Vooraf gebouwde releasearchieven**: Download tarballs van GitHub Releases voor installaties zonder Docker (Proxmox, bare metal, LXC). (#202)

### Verbeteringen {#improvements-1}

- **WCAG 2.2 AA-toegankelijkheid**: Navigatie overslaan, focus vasthouden, aria-live-regio's, ondersteuning voor beperkte beweging, correcte contrastverhoudingen. (#209)
- **Responsiviteit op mobiel**: Responsieve instellingen, automatisch opnieuw verbinden van SSE bij het wisselen van tabblad op mobiel. (#203, #204)
- **Kwaliteit van achtergrondverwijdering**: Randafvlakking, kleurdecontaminatie, keuze van uitvoerformaat.
- **Italiaanse vertaling**: ~145 nieuwe teksten van @albanobattistella. (#206)
- **API-documentatie per tool**: 53 documentatiepagina's met parameters, voorbeelden en antwoordformaten.
- **Downloads van AI-modellen**: Herhaallogica met exponentiële backoff voor HuggingFace. (#201)

### Bugfixes {#bug-fixes-1}

- Verse Docker-containers waren volledig onbruikbaar (rate limit blokkeerde alle verzoeken).
- AI-tools voor gezichtsdetectie (blur-faces, red-eye-removal, enhance-faces, passport-photo) mislukten op alle platforms.
- HEIC-bestanden werkten niet op ARM (libheif-symbolen kwamen niet overeen).
- De AI-bundels voor upscale en restore-photo konden niet worden geïnstalleerd op ARM.
- OCR gebruikte de verkeerde CUDA-versie in GPU-containers.
- SSRF-guard omzeild via hexadecimale IPv4-gemapte IPv6-adressen. (Dank aan: @tonghuaroot)
- HEIC-decodering van iPhones met hulpafbeeldingen. (#183, #199)
- Real-ESRGAN CUDA OOM op GPU's van 8 GB. (#200)
- 6 productiefouten in Sentry en 7 QA-bugs. (#208)

### Beveiliging {#security}

- 10 bevindingen uit penetratietests aangepakt (XFF-omzeiling, crashes door misvormde JSON, onbegrensde pipelines, XSS in het auditlog, TRACE-methode en meer). (#207)
- SSRF-omzeiling via hexadecimaal IPv6 geblokkeerd. (Dank aan: @tonghuaroot)
- Basis-images in het Dockerfile vastgezet op digest.

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

Live demo, landingspagina's per tool en een reeks verfijningen.

### Nieuwe functies {#new-features-2}

- **Live demo** - [demo.snapotter.com](https://demo.snapotter.com) laat mensen SnapOtter uitproberen zonder iets te installeren.
- **Toolsindexpagina** - Blader door alle 50+ tools op `/tools` met zoeken en categoriefilters.
- **50+ SEO-landingspagina's** - Elke tool heeft nu een eigen landingspagina met veelgestelde vragen, gebruiksscenario's en vergelijkingstabellen.
- **Achtergrondvoorbeeld** - De voor-en-na-schuifregelaar toont een geruite achtergrond achter transparante afbeeldingen.
- **Generator voor sterke wachtwoorden** - Knop met één klik in het formulier Leden toevoegen.

### Bugfixes {#bug-fixes-2}

- De info-tool voor HEIC/HEIF mislukt niet meer (pre-decode toegevoegd).
- Installatie van AI-modelbundels toont betere foutmeldingen en respecteert resourcelimieten.
- Miniaturen in de bibliotheek laden correct (auth-headers ontbraken).
- Dropdownmenu's worden niet meer afgekapt in de tabellen Personen en Teams in de instellingen.
- Het vergelijkingspercentage voor grootte is verborgen bij tools die niet comprimeren.
- Dubbele link naar het privacybeleid verwijderd.
- Italiaanse vertaling toegevoegd voor de AI-functie-instellingen.
- Hernoemde Lucide-iconen bijgewerkt (Wand2, Columns).

### Infrastructuur {#infrastructure}

- OpenSSF Scorecard gehard van 4,3 naar ~7,0.
- CI-tests geparallelliseerd in 4 shards met verkleinde fixtures.
- 41 afhankelijkheidsupdates.

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

Vijf nieuwe tools, een complete afbeeldingseditor, SSO-login, 20 talen. Dit had waarschijnlijk drie afzonderlijke releases moeten zijn, maar zo zijn we hier.

### Nieuwe functies {#new-features-3}

- **Afbeeldingseditor** - Lagen, penselen, vormen, aanpassingen, filters, curves, sneltoetsen. Draait in uw browser, verwerkt op uw hardware.
- **OIDC / SSO-authenticatie** - Log in met Google, GitHub, Okta of elke OpenID Connect-provider. Stel een paar omgevingsvariabelen in en uw team gebruikt zijn bestaande accounts.
- **Meme-generator** - 100 ingebouwde sjablonen met tekstweergave via opentype.js. Of upload uw eigen afbeelding.
- **Beautify** - Zet een schermafbeelding erin, krijg een gepolijste afbeelding eruit. Apparaatframes (macOS, Windows, browser), schaduwen, kleurverlopen, presets voor sociale media.
- **Simulatie van kleurenblindheid** - Bekijk hoe afbeeldingen eruitzien met protanopie, deuteranopie, tritanopie en andere kleurzichtstoornissen.
- **Hersteller van PNG-transparantie** - Detecteert nep-transparante PNG's en herstelt ze met BiRefNet HR-matting. Optionele verwijdering van watermerken via LaMa-inpainting.
- **AI-canvas uitbreiden** - Vergroot de randen van een afbeelding met AI-vulling. Drie kwaliteitsniveaus (snel, gebalanceerd, kwaliteit), afhankelijk van hoeveel GPU-tijd u wilt inruilen.
- **20 talen** - Arabisch, Chinees (vereenvoudigd/traditioneel), Tsjechisch, Nederlands, Frans, Duits, Hindi, Indonesisch, Italiaans, Japans, Koreaans, Pools, Portugees, Russisch, Spaans, Thai, Turks, Oekraïens, Vietnamees. RTL werkt voor Arabisch.
- **URL-import** - Plak URL's in de dropzone of importeer in bulk vanuit een lijst. Ophalen aan de serverzijde met SSRF-bescherming.
- **Wissen over meerdere bestanden** - Teken wismaskers over meerdere afbeeldingen en verwerk ze allemaal met één klik. Streken blijven per afbeelding behouden.
- **Pipeline importeren/exporteren** - Sla toolketens op als JSON en deel ze met anderen.
- **17 nieuwe RAW-formaten van camera's** via exiftool, plus invoer van QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ en APNG. Nieuwe uitvoercodecs voor BMP, ICO, JP2, QOI. Export naar AVIF, TIFF, GIF, JXL en PSD hersteld uit een eerder verloren branch.

### Verbeteringen {#improvements-2}

- **Beeldverbetering** - De oude pipeline vervangen door CLAHE + normaliseren + gamma. De nieuwe schakelaar Deep Enhance gebruikt het AI-model voor krachtiger resultaten.
- **Foto herstellen** - Krasdetectie herschreven met 8-hoeks Otsu-filtering. LaMa-inpainting draait nu op de oorspronkelijke resolutie.
- **Exotische formaten overal** - OCR, image-to-PDF, favicon-generator, compositie, stitch en vectorize decoderen nu allemaal HEIC, RAW en PSD.
- **Compress** - Tolerantie voor doelgrootte aangescherpt van 5% naar 1%. Doelgrootte is de standaardmodus. Stapknoppen en een KB/MB-eenheidskiezer toegevoegd.
- **Sentry opgeschoond** - 644 niet-uitvoerbare gebeurtenissen weggefilterd. Echte fouten worden nu goed afgehandeld.
- **GPU-detectie** - Betere diagnostiek voor containers waar CUDA aanwezig is maar nvidia-smi niet.
- **Modus zonder authenticatie** - Een anonieme gebruiker met de rol admin wordt in de database aangemaakt. API-sleutels, pipelines en gebruikersbestanden breken niet meer op FK-beperkingen.
- **2.705+ nieuwe tests** in unit-, integratie- en E2E-tests.

### Bugfixes {#bug-fixes-3}

- Upscale op CPU loopt niet meer vast op NAS-boxen en hardware met laag vermogen.
- Het QR-codelogo laat het voorbeeld niet meer permanent verdwijnen.
- Uitsnede-overloop opgelost voor hoge staande afbeeldingen.
- TIFF-bestanden met alfa forceren correct PNG-uitvoer in plaats van corruptie te veroorzaken.
- HDR/EXR-decodering converteert vóór CLAHE naar 8-bits, wat decodeerfouten oplost.
- Invoerbuffers voor gezichtsmarkeringen worden vóór de Python-sidecar naar PNG geconverteerd, wat crashes oplost.
- Find duplicates verwerkt batches met gemengde formaten en netwerkfouten.
- Het voorbeeld van Beautify wordt in realtime bijgewerkt.
- Voortgangsbalken voor stitch en vectorize.
- SVGZ wordt afgehandeld door SVG-naar-raster.
- Bestandsnamen met niet-ASCII-tekens opgelost via de percent-gecodeerde header X-File-Results.

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

Eén Docker-image met automatische GPU-detectie. Eén image verwerkt zowel CPU- als GPU-workloads. Compose vereenvoudigd tot één bestand met logrotatie. Het vooraf downloaden van modellen omvat nu verificatie en een smoke test.

---

## v1.13.0 {#v1-13-0}

Toegangsbeheer op basis van rollen (RBAC). 14 fijnmazige rechten, drie ingebouwde rollen (admin, editor, user), ondersteuning voor aangepaste rollen. Rechtencontroles op alle API-routes. Tabbladen in de frontend gefilterd op gebruikersrechten.

---

## v1.12.0 {#v1-12-0}

Tool PDF to Image. Converteer PDF-pagina's naar PNG, JPEG, WebP of TIFF met aangepaste DPI. Eén Docker-image met automatische GPU-detectie.

---

## v1.11.0 {#v1-11-0}

Automatisch gegenereerde llms.txt via vitepress-plugin-llms voor AI-vriendelijke documentatie.

---

## v1.10.0 {#v1-10-0}

Content-aware resize (seam carving) met gezichtsbescherming. Wijzig het formaat van afbeeldingen met behoud van belangrijke inhoud.

---

## v1.9.0 {#v1-9-0}

Tool Stitch / Combine. Voeg afbeeldingen naast elkaar, verticaal gestapeld of in een aangepast raster samen.

---

## v1.8.0 {#v1-8-0}

Tool Edit Metadata. Bekijk en bewerk EXIF-, IPTC- en XMP-metadata met een fijnmazige interface om te verwijderen of te behouden.

---

## Oudere releases {#older-releases}

Voor de volledige changelog op commitniveau, inclusief patchreleases, zie [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
