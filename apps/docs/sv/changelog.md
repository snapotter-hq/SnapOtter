---
description: "Versionsinformation och versionshistorik för SnapOtter. Se vad som är nytt, förbättrat och åtgärdat i varje version."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: 8e63885ec6bc
---

# Ändringslogg {#changelog}

## v2.2.0 {#v2-2-0}

Det mesta i 2.2 handlar om härdning. En icke-administratör med en delegerad roll som hade `users:manage` kunde ta över en instans, och varje verktygsslutpunkt visade sig sakna sin behörighetskontroll. Uppgradera om du kör fler än en användare.

Resten är den långa svansen av självhosting: nedladdningar som startade och aldrig blev klara, förinställningar som gick sönder så fort du lade till en andra fil, containrar som kraschloopade medan Postgres fortfarande startade. Två nya verktyg landade också. Dokumentationen och webbplatsen är nu översatta till 21 språk, och gränssnittet klarar äntligen WCAG AA-kontrast.

> [!IMPORTANT]
> Om du gav `users:manage` till en icke-administratör via en anpassad roll kunde den rollen ta över administratörskonton på 2.0.0 till och med 2.1.0. Detaljer finns under Säkerhet.

### Säkerhet {#v2-2-0-security}

- **Privilegieeskalering via en delegerad roll med `users:manage` (GHSA-9xgh-95qh-2x7h).** En icke-administratör som hade `users:manage` via en anpassad roll kunde återställa lösenordet för, eller radera, ett konto med högre privilegier, inklusive en inbyggd administratör, och ta över instansen. Återställning av lösenord och radering av konton verifierar nu anroparens behörighet över målet, så en delegerad roll kan inte nå över sin egen nivå. Påverkade versioner: 2.0.0 till och med 2.1.0. Rapporterat av 李春来 (Chunlai Li). (#616)
- **Varje verktygsslutpunkt är nu skyddad.** Verktygsåtkomst framtvingades rutt för rutt, så alla 45 handskrivna rutter måste komma ihåg samma anrop och ingen av dem gjorde det. En roll utan `tools:use` kunde fortfarande köra image-to-pdf, erase-object, upscale, sign-pdf och resten. Kontrollen sitter nu i en enda preHandler som styrs av den matchade rutten, så den täcker undersökvägar och alla rutter som läggs till senare. (#646)
- **Hastighetsbegränsningen gick att kringgå på Docker-installationer.** Avbildningen levererades med `TRUST_PROXY=true`, så klientens IP kom från en förfrågningsheader och ett förfalskat `X-Forwarded-For` slank förbi inloggningsbegränsaren. Standardvärdet är nu en förtroendelista för privata nätverk. (#649)
- **Skrivningar till inställningar kontrolleras per inställning**, inte en gång vid ingången, och konfigurationsimport är nu transaktionell så att en avvisad nyckel inte kan lämna en halv konfiguration tillämpad. (#618)
- **Filnamn i biblioteket kan inte ta sig utanför sin lagringsrot.** Ett manipulerat lagrat namn, som en skadlig 1.x SQLite-import kopierar ordagrant, kunde läsa eller radera filer utanför filkatalogen. Endast nåbart efter att en operatör importerar en angriparlevererad 1.x SQLite-databas, vilket är den enda vägen som låter ett lagrat namn väljas. Rapporterat av @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Avbrytning av jobb kontrollerar ägarskap**, så en autentiserad användare kan inte längre avbryta en annan användares jobb via dess id. Rapporterat av @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **En ny granskning av hela 2.0-trädet fångade det som fortfarande var öppet**: en fångad SAML-assertion kunde spelas upp igen, en MFA-utmaning överlevde hur många felaktiga koder som helst, API-nyckeluppslaget per förfrågan var en full tabellsökning, `MAX_WORKSPACE_SIZE_GB` var död konfiguration och SVG-saneraren släppte igenom oquoterade `javascript:`-href. (#620)
- **Nio offentliggjorda CVE:er åtgärdade**: fast-uri, svgo, sharp och tar transitivt (#619), plus Pillow 12.3.0 (#517). RAW-avkodning på arm64 bygger nu LibRaw 0.22.2 från källkod i stället för att länka en ouppdaterad systemkopia. (#649)

### Nya funktioner {#v2-2-0-new-features}

- **Rundad beskärning**: rundade fyrkanter och iOS-liknande squircle-masker, med en kontroll för hörnradie. Byggd för favicons och appikoner. (#602)
- **Ta bort GIF-bakgrund**: ta bort bakgrunden från en animerad GIF, WebP eller APNG bildruta för bildruta och få en genomskinlig animering tillbaka. (#502)
- **Lasso och högkvalitetsläge i objektraderaren**: dra en frihandsloop i stället för att måla varje pixel, och installera valfritt ett diffusions-inpainting-paket för renare fyllningar av stora ytor. (#503, #566)
- **Spara som ny, eller skriv över.** Redigering av en biblioteksfil ersatte tidigare originalet tyst. Nu väljer du per redigering, och standardvalet behåller den. (#564, #577)
- **Förinställningar för bildförhållande i Ändra storlek.** Välj 1:1, 4:3 eller 16:9 och de två dimensionerna hålls låsta, utan uppskalning. (#530)
- **OCR i två nivåer**: en snabb nivå är inbyggd i avbildningen och körs offline utan nedladdning, och en mer exakt körtid installeras vid behov. (#519)
- **Skriv var som helst för att söka.** Börja skriva på instrumentpanelen eller startsidan och texten hamnar i sökrutan. (#644)
- **Dokumentation och webbplats på 21 språk**: dokumentsajten, landningssidorna och API-referensen är alla översatta nu, i sällskap med appgränssnittet. En ny guide för distribution med knappa resurser täcker Raspberry Pi och maskiner med 2 GB. (#548)
- **Tydligare verktygsnamn**: 18 tvetydiga namn kvalificerar sig nu själva, så "Compress" blev "Compress Image". Verktygs-id:n och rutter är oförändrade, så inget bokmärke går sönder. (#520)

### Förbättringar {#v2-2-0-improvements}

- **WCAG AA-kontrast i hela gränssnittet**: paletten ställdes om så att livlig orange stannar på fyllningar medan text och etiketter använder tillgängliga bläck-token, och alla 57 fokusindikatorer klarar nu 3:1-kravet för icke-text. (#567, #574)
- **Uppskalning och bakgrundsborttagning ser inte längre ut att ha frusit**: förloppsindikatorn rör sig under inferensen i stället för att stanna på 30 %, och båda verktygen varnar nu för att en värd med bara CPU är mycket långsammare. (#605, #608)
- **Tidsgränsmeddelanden namnger den verkliga orsaken** och tar hänsyn till värdar med bara CPU i stället för att skylla på uppladdningen. (#596)
- **SnapOtter väntar på Postgres och Redis vid start** i stället för att kraschloopa, både i Compose och i allt-i-ett-avbildningen. En Proxmox LXC-installation startade om 76 gånger före detta. (#537, #595)
- **Nedladdningar överlever en omvänd proxy**: SnapOtter ber nginx och kompatibla proxyservrar att inte buffra filsvaren, vilket är den vanliga orsaken till att en självhostad nedladdning startar och aldrig blir klar. (#604, #607)
- **Komprimera PDF hamnar nära målstorleken**, och säger det ärligt när ett mål är ouppnåeligt. (#522)
- **Mobila verktygskontroller förblir nåbara** nu när appskalen anpassar sig till den dynamiska visningsytan. (#559)
- **Konvertera ljud exponerar en inställning för samplingsfrekvens.** (#561)
- **Administratörer kan sänka minsta lösenordslängd**, ned till 1 för en betrodd LAN-instans. (#543)
- **MFA är självbetjäning**, utelåsningen i policyn är stängd, och OIDC- eller SAML-inloggningar får en riktig MFA-utmaning i stället för en hård blockering. (#531, #536)
- **Ett bart `Error: Error` namnger nu sin orsak.** Sharp-kodningsfel, avslutade AI-sidovagnar, icke-JSON-utdata från dokumentsidovagnar och fel i bakgrundsborttagningen kom alla tidigare fram med orsaken bortskrubbad. (#532, #534, #535, #538, #612)
- **Hjälpdialogen är översatt.** Dess genvägsetiketter och text för att komma igång var hårdkodade på engelska medan färdiga översättningar låg oanvända i alla 21 språkfiler. (#647)

### Felrättningar {#v2-2-0-bug-fixes}

- **HEIC-filer från iPhone avvisades** som oläsbara innan de nådde avkodaren som hanterar dem. (#631)
- **Konverteringsförinställningar misslyckades med en andra fil**: jpg-to-pdf och dess syskon för bild-till-pdf, plus pdf-to-png, pdf-to-jpg och pdf-to-tiff, returnerade alla `Tool not found` när du laddade upp två filer. (#633, #643)
- **PDF-konverteringsförinställningar tappade sin nedladdningsknapp.** (#629)
- **En obegränsad bearbetningstidsgräns respekterades inte**, och stoppade förloppsströmmar återhämtar sig nu i stället för att lämna gränssnittet väntande. (#638)
- **Nedladdningar hängde i stället för att misslyckas** när en lagrad fil visade sig vara kortare än sin registrerade längd. (#617)
- **PDF-sidverktyg misslyckades på korta och krypterade filer**: Remove Pages använde som standard ett sidintervall som inget dokument under sex sidor har, och lösenordsskyddade PDF:er misslyckades kryptiskt inne i workern. (#594)
- **PDF till text returnerade tyst en tom fil** för skannade PDF:er. Nu hänvisar det dig till OCR och levererar text som UTF-8. (#603)
- **PDF till Word tappade färgade textblock** och delade upp dem över sidan. (#500)
- **Objektraderaren lämnade spökrester** och gjorde små objekt suddiga i högupplösta bilder. (#501)
- **Stabilisera video skrev utdata som inte gick att spela upp** utan faststart. (#593)
- **Reparationer i bildredigeraren**: rotera, vänd, ändra storlek, nivåer, kurvor, filter och laglås. (#597)
- **Signera PDF visade en tom yta** i stället för att rapportera varför en PDF inte kunde läsas in. (#545)
- **Filbiblioteket registrerade dimensionerna 0x0** och hoppade över förhandsgranskningar för HEIC-, RAW- och PSD-uppladdningar. (#636, #637)
- **Att installera mer än ett AI-paket** lämnade den delade virtualenv-miljön med flera versioner och bröt tyst tre verktyg. (#649)
- **Konvertering till JXL med kvalitet 1 till 4 returnerade en 500:a**, och en saknad ffmpeg rapporterades som en skadad uppladdning. (#649)
- **Ett tillfälligt Postgres-avbrott lämnade färdiga jobb strandsatta**, med utdata på disk utan någon rad som pekade på den. En avstämmare tar nu över det arbetet i stället för att släppa det. (#649)
- **En Redis-slutpunkt som bytte adress kilade fast varje konsument** medan hälsokontrollerna fortfarande svarade 200. (#649)
- **Webb- och dokumentationsfixar**: lokaliserade länkar tappar inte längre `#`-fragment eller gör `zh-CN` till gemener, dokumentationsnavigationen håller sig inom visningsytan på surfplattor, och ingen av sajterna anropar längre GitHub-API:et från din webbläsare. (#516, #562, #570, #560)

### Uppgraderingsanteckningar {#v2-2-0-upgrade-notes}

Inget att migrera, men två medföljande standardvärden ändrades:

- **`TRUST_PROXY` har nu standardvärdet `loopback,linklocal,uniquelocal`** i stället för att lita på varje peer. Docker-bryggnät och Compose-nät ligger inom det intervallet, så de flesta installationer behöver ingen ändring. Om din omvända proxy når SnapOtter från en publik adress, ange `TRUST_PROXY` uttryckligen, annars kommer hastighetsbegränsning och granskningsloggar att tillskriva varje förfrågan proxyn.
- **`MAX_AI_JOBS_PER_USER` har standardvärdet 5** pågående AI-jobb med en fil per användare. Batch- och pipeline-körningar av AI är fortfarande obegränsade.

Nya valfria inställningar: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (avstängd som standard) och `GIF_BG_MAX_FRAMES`.

### Tack till {#v2-2-0-acknowledgements}

En stor del av den här utgåvan började som någon annans felrapport.

Kod och bidrag:

- **@mvanhorn** ❤️: Skrev om tidsgränsfelutskriften i remove-background till ett meddelande som säger vad man ska göra åt det, i stället för enbart en tidsgräns. (#518, #494)
- **@EuanTop** ❤️: Återställde nedladdningsåtgärden på förinställda PDF-konverteringssidor genom att låta den synkrona rutten returnera det vanliga verktygsresultatkontraktet. (#629, #623)
- **@harshjainnn** ❤️: Diagnostiserade nedladdningen som startar och aldrig blir klar, och föreslog den socket-återställningsriktning som åtgärden byggdes på. (#617, #590)

Säkerhetsrapporter:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Avslöjade privat privilegieeskaleringen via en delegerad roll med `users:manage`, med en fullständig källa-till-mål-analys och en fungerande exploitkedja. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Avslöjade en autentiserad IDOR vid avbrytning av jobb, och en path traversal i bibliotekets lagrade filnamn som var nåbar efter en skadlig 1.x SQLite-import, med en fungerande proof of concept för var och en. (#599, #600)

Felrapporter:

- **@riz467** ❤️: Riktiga HEIC-filer från iPhone avvisades vid validering, med rotorsaken utredd i rapporten. (#622)
- **@coupej** ❤️: Förinställda PDF-sidor som hängde för alltid, och jpg-to-pdf som misslyckades så fort en andra fil lades till. Två separata buggar, korrekt åtskilda. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` dokumenterades som obegränsat men begränsades till fem minuter. (#630)
- **@bezibaerchen** ❤️: Konvertera ljud dolde inställningen för samplingsfrekvens som dess egen beskrivning lovade. (#558)
- **@hell-toupee** ❤️: Det exakta OCR-paketet misslyckades med installationen med ett `libpaddle`-fel. (#505)
- **@Michael1260** ❤️ och **@And-CSH** ❤️: Bekräftade OCR-installationsfelet oberoende av varandra och fastställde att manuell extrahering fungerar medan installationsprogrammet i appen inte gör det, vilket ringade in buggen till installationsprogrammet. (#505)
- **@TomErnst1972** ❤️: Aktivering av policyn som kräver MFA låste ute en administratör från sin egen instans. (#515)
- **@thokich** ❤️: Objektradering gav suddiga, oanvändbara fyllningar, vilket drev både omskrivningen av HD-inpainting och det valfria högkvalitetspaketet. (#141)
- **@Hennie-git** ❤️: En Proxmox LXC-installation som startade om 76 gånger mot en Postgres som ännu inte tog emot anslutningar. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Triagerade den rapporten i realtid och tog fram diagnosen som startfixen byggdes på. (#537)

Funktionsförfrågningar och återkoppling:

- **@LECOQQ** ❤️: Bad om att sänka lösenordskomplexiteten på en hemmaserverinstallation. (#136)
- **@killervette42** ❤️: Bad om en Unraid Community App, nu publicerad i Unraid CA-butiken. (#96)
- **@alienatedsec** ❤️: Pekade ut att fixen för GPU som faller tillbaka på CPU låg begravd i ett stängt ärende och var omöjlig att hitta, vilket är anledningen till att den finns i distributionsdokumentationen nu. (#490, #587)
- **@neilp316** ❤️: Bekräftade felet med Blackwell-GPU på ett RTX 5060 och kartlade en fungerande uppgraderingsväg till CUDA 12.8. (#120)
- **@Roiki11** ❤️: Argumenterade för delad lagring med sökvägsreferenser i stället för HTTP-filöverföring för AI-beräkning utanför maskinen. (#189)

Tack också till de communitymedlemmar som rapporterade följande via Discord och e-post, vars namn vi inte antecknade: förfrågan om squircle-beskärning (#602), nedladdningen från bild-till-PDF som startade och aldrig blev klar (#604, #607), verktyget Delete Pages som fastnade (#594), arabisk text som saknades i pdf-to-text (#603) och diagnosen bakom ONNX GPU-fallback (#490).

[Fullständig diff på GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
