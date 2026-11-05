---
description: "Versionsanteckningar och versionshistorik för SnapOtter. Se vad som är nytt, förbättrat och åtgärdat i varje version."
i18n_source_hash: 76c6d18aedb4
i18n_provenance: machine
i18n_output_hash: f5cb66c3dff0
i18n_hash_version: 2
---

# Ändringslogg {#changelog}

## Ej släppt {#unreleased}

### Föråldrat {#unreleased-deprecated}

- **De fem operationerna för att komprimera bilder till en viss storlek är föråldrade.** `/api/v1/tools/image/compress-image-to-20kb`, `-50kb`, `-100kb`, `-200kb` och `-500kb` är markerade som föråldrade i OpenAPI-specifikationen och finns kvar i minst en minorversion. Skicka `POST /api/v1/tools/image/compress` med `settings` satt till `{"mode":"targetSize","targetSizeKb":20}` (eller 50, 100, 200, 500). Resultatet blir detsamma. Sökvägarna för PDF-förinställningar är oförändrade.

## v2.3.0 {#v2-3-0}

SnapOtter har just passerat en miljon avbildshämtningar över Docker Hub och GHCR, och 3 000 stjärnor på GitHub. Det är många egenhostade servrar, så den här versionen är vårt tack till alla som kör dem.

Uppgradera snart. 2.3.0 stänger sex säkerhetsrådgivningar, varav en med hög allvarlighetsgrad. Detaljer finns i avsnittet Säkerhet nedan.

Utöver rättningarna finns nya verktyg: en sidredigerare i PDF Multi-Tool, förinställningar för komprimering till en viss storlek med ett klick för bilder och PDF-filer, samt dra-och-släpp-ordning av sidor i Organisera PDF. OCR läser nu arabiska, och pdf-to-text erbjuder OCR när den stöter på en skannad PDF. SnapOtter kan köras under en undersökväg som `/snapotter` bakom en omvänd proxy. Appen behöver inte längre en Postgres-superuser för att köra. Administratörer som blir utelåsta kan återhämta sig från kommandoraden. Resten är ungefär 1 400 rättningar, de flesta för problem som ni rapporterat.

> [!IMPORTANT]
> Alla sex rådgivningar nedan påverkar 2.2.0, och vissa når tillbaka till 2.0.0. Om du delar en instans med andra användare eller exponerar den utanför ditt eget nätverk, uppgradera.

### Säkerhet {#v2-3-0-security}

- **SVG-uppladdningar kunde hoppa över sanering (GHSA-9c7h-xjrp-8gh3, hög).** En SVG som bildavkodaren avvisade lagrades och serverades som den var i stället för att saneras. Påverkade: 2.2.0 och tidigare. Rapporterad av @xaferima. (#1211)
- **Förloppsströmmen för jobb kontrollerade inte vem som frågade (GHSA-ff22-w6x2-fm98, medel).** Den kräver nu inloggning och jobbägarskap. Påverkade: 2.0.0 till och med 2.2.0. (#1750)
- **Nedladdningslänkar för resultat serverade även den ursprungliga uppladdningen (GHSA-jgv3-2jc6-f628, medel).** Påverkade: 2.2.0 och tidigare. Rapporterad av @emirhancatkin. (#3623)
- **Passfoto och bakgrundseffekter litade på ett jobb-ID från klienten (GHSA-3c8g-8v4x-qq9j, medel).** Påverkade: 2.2.0 och tidigare. Rapporterad av @shaoyuuuuu. (#3623)
- **URL-import, uppladdning och förhandsvisning hoppade över kontroller av roll- och API-nyckelbehörighet (GHSA-8xxr-g2w8-7f9r, medel).** Påverkade: 2.2.0 och tidigare. Rapporterad av @nguyenvantiennani. (#3780, #707)
- **SSO-tvång avslöjade användarnamnet för nödinloggning (GHSA-q6fg-vvw9-cr8r, låg).** En nekad lokal inloggning får nu samma 401 som alla andra misslyckade inloggningar. Påverkade: 2.0.0 till och med 2.2.0. (#2148)
- **Postgres körs inte längre som superuser.** Appen ansluter nu med en roll som bara kan läsa och skriva data. Migreringar använder en separat, valfri anslutning. Se Uppgraderingsanteckningar. (#918)
- **Åtgärdade beroenden**: golvversionerna för överskrivning av dompurify och handlebars höjdes till de rättade versionerna. (#4247)

### Nya funktioner {#v2-3-0-new-features}

- **PDF Multi-Tool**: en sidredigerare som ordnar om, duplicerar, roterar och raderar sidor, och hämtar in sidor från andra PDF-filer. Servern sätter ihop den färdiga filen. (#1338)
- **Komprimera till målstorlek med ett klick**: fem förinställningar för bilder (20, 50, 100, 200, 500 KB) och fem för PDF (100, 200, 500 KB, 1 MB, 2 MB). (#1250, #1377)
- **Kör SnapOtter under en undersökväg**: ange `BASE_PATH=/snapotter` så serverar samma avbild därifrån. Resultatlänkar, cookies, SSO-omdirigeringar och API-dokumentationen följer med. (#1252, #1324)
- **Arabisk OCR**: välj arabiska uttryckligen, eller låt autoläget detektera det. Fungerar för OCR av bilder och PDF. (#4130, #4183)
- **pdf-to-text erbjuder OCR** när en PDF, eller en hel batch, saknar textlager, i stället för att returnera en tom fil. (#4142, #4198)
- **Dra-och-släpp-ordning av sidor i Organisera PDF**, med mus och touch. (#1249, #2601)
- **Ordna om filer före en körning med flera filer**: sammanfoga, stitch, collage och de andra verktygen med flera filer behåller den ordning du angett. (#756, #757)
- **Avbryt batch- och pipelinekörningar**, och arbetet stoppas faktiskt på servern. (#807)
- **Återställningskommandon för `snapotter-admin`**: `reset-password`, `create-admin`, `unlock-user` och MFA-återställning, för administratörer som är utelåsta från webbgränssnittet. (#4016)
- **MFA-registrering vid inloggning**: när MFA krävs ställer användare som saknar det in det på stället i stället för att blockeras.
- **Kamerainfångning och en installerbar app**: ta ett foto direkt in i ett verktyg på mobil, och installera SnapOtter som en PWA. (#773)
- **Transparent utfyllnad i redigerarens dialogruta Dukstorlek.** (#4111)
- **Uppdateringsnotiser för administratörer**: när en nyare SnapOtter finns ser administratörer en notis som kan stängas, med en länk till versionsanteckningarna. Kontrollen går via den befintliga analysanslutningen, så den är av när analys är av.

### Förbättringar {#v2-3-0-improvements}

- **Bakgrundsborttagning är snabbare vid upprepade körningar**: modellen förblir laddad mellan förfrågningar i stället för att laddas om varje gång. (#4144)
- **Batchuppladdningar använder mycket mindre minne**: varje fil går till scratch-disk och bearbetas en i taget i stället för att ligga i RAM. (#2687)
- **Installation av AI-paket misslyckas rent och rullas tillbaka** i stället för att lämna en halvinstallerad venv. Installationer av bakgrundsborttagning på Proxmox LXC fungerar igen, och värdar med lite minne får rimliga CPU-gränser innan ett jobb startar. (#2628, #2597, #2526, #2546)
- **GPU-detektering är mer tillförlitlig**: CUDA detekteras via drivrutinen, kort i RTX 50-serien faller tillbaka på CPU i stället för att misslyckas, och hårdvarukodare för video testkörs före användning. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` fungerar nu**. Den tolkades men tillämpades aldrig. (#3249)
- **Långa verktyg får den långa tidsgränsen**: pdf-to-word, compress-pdf, convert-document och innehållsmedveten storleksändring får inte längre för tidig tidsgräns på stora filer. (#3276)
- **Komprimera PDF behåller skanningar läsbara**, och säger till när en målstorlek inte kan nås i stället för att skapa en oläslig fil. (#4112)
- **Misslyckade inloggningar begränsas per användarnamn**: fler än tio på femton minuter ger en 429 med `Retry-After`. (#827)
- **Fel säger vad som gick fel**: saknade binärer, lagringsfel, avslut på grund av minnesbrist och uppladdningsgränser får nu specifika meddelanden i stället för ett nakent 500 eller 422.
- **Granskningsloggen täcker körningar av verktyg, batch och pipeline**, och händelser för användare, roller, team och GDPR registrerar vem som gjorde vad mot vem. (#3991, #3984)
- **All-in-one-containern stannar vid en dålig första uppstart** i stället för att starta om för evigt, och den inbäddade Postgres och Redis har tidsgränser för start. (#3008, #1130)
- **Datum och pluralformer följer ditt språk**, och de sista hårdkodade engelska strängarna är översatta.
- **Finslipning av mobil och redigerare**: reglage, Signera PDF och beskärningslayouter på telefoner, touch-dragning, snabbare pixelpenslar samt Nivåer och Kurvor i ångra och autosparning.

### Buggrättningar {#v2-3-0-bug-fixes}

- **Justera färger kombinerade inställningar fel**: temperatur, mättnad, nyans, kontrast och sepia åsidosatte varandra i stället för att läggas ihop. (#3153, #3120, #3469)
- **Pixelera pixelerade inte**, och PNG-utdata fick tyst sin palett reducerad i bildverktygen. (#709, #716)
- **Animerade GIF och WebP förlorade bildrutor** i flera verktyg, och GIF-paletter och transparens blev fel. (#1184, #1225, #3407, #2573)
- **Roterade uppladdningar förlorade kvalitet**: autoorientering tappade förlustfri kodning, transparens och 16-bitars djup. Animerad WebP roterar nu varje bildruta. (#2384, #2529)
- **TIFF med transparens, AV1 HEIF-filer och flera RAW-format** misslyckades eller tappade alfa. (#2609, #2572, #1120)
- **Storleksändring av redigerarens duk skalade bilden** i stället för att lägga till utrymme runt den. (#2081)
- **Utdatafilnamn blev förvanskade**: `.jpeg` och `.tif` blev något annat, och punktfiler eller namn som upprepar sin filändelse gick sönder. (#3495, #3382)
- **Automatisk sparning i biblioteket ignorerade lagringskvoten**, och lagringsräknare kunde bli negativa. (#2389, #2585)
- **Jobb som fastnade efter en omstart** avgörs nu vid start i stället för att visa "bearbetar" för evigt. (#3219, #3193)
- **OIDC-inloggning gav varje ny användare namnet "admin"**, och inloggningar i iOS Safari slutade på en felsida efter att ha lyckats. (#862, #4021)
- **Inaktiverade lösenordsregler tillämpades ändå** när användare skapades. (#1028)
- **Skadade PDF-filer hängde i 30 sekunder** innan de misslyckades. (#920)
- **Diskkontrollen för AI-paket bad om cirka 18 GB** för att installera ett enda paket. (#1248)
- **Komprimera video misslyckades på skärminspelningar med variabel bildfrekvens.** (#2427)
- **Batchborttagning av bakgrund förlorade färdiga resultat** när webbläsaren försökte om förfrågan. (#2015)
- **Nummerfält i inställningar kunde inte tömmas** under skrivning. (#1449)
- **Att stänga av analys lämnade köade händelser att skickas** ungefär 30 sekunder senare. De släpps nu när du väljer bort. (#4270)

### Uppgraderingsanteckningar {#v2-3-0-upgrade-notes}

Migreringar körs av sig själva vid start. Du behöver inte köra någon SQL.

- **Databasroller.** Den kanoniska Compose-filen ger nu appen en roll som bara kan läsa och skriva data (`DATABASE_URL`) och en separat privilegierad anslutning (`DATABASE_MIGRATION_URL`) som bara används vid uppstart för migreringar och behörigheter. En befintlig Compose-fil fortsätter fungera som förut: lämna `DATABASE_MIGRATION_URL` osatt så kör SnapOtter med en roll. För en distribution som inte är lokal, ange `POSTGRES_APP_PASSWORD` tillsammans med `POSTGRES_PASSWORD`.
- **Strängare startkontroller.** Dessa misslyckades tidigare senare, eller tyst. Nu stoppar de containern med ett meddelande som namnger variabeln: en ogiltig `DEFAULT_LOCALE` (använd en kod som stöds, som `de`, inte `de_DE`), felformaterad `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` eller `OIDC_ISSUER_URL` när SSO är på, en ogiltig lista i `TRUST_PROXY`, en felaktig `BASE_PATH` och en `LOG_DIR` som inte går att skriva till.
- **`TRUST_PROXY` tar inte längre ett antal hopp.** Ett tal som `TRUST_PROXY=2` stoppar nu containern vid start i stället för att tyst inte lita på någon proxy. Ange proxyadresserna eller namngivna intervall (standard är `loopback,linklocal,uniquelocal`), `false` när ingen proxy står framför SnapOtter, eller `true` endast när en proxy som du kontrollerar står framför på en publik adress. (#998)
- **`MAX_WORKER_THREADS` får nu effekt.** Om du satte den och inte såg någon förändring förut ser du den nu.
- **Statuskoder i API:et.** Fel i motor och lagring returnerar 503 `ENGINE_UNAVAILABLE` (batchslutpunkter returnerade förut 422). Uppladdningar över gränsen returnerar 413 (var 400). Felformaterad `clientJobId` returnerar 400 och en återanvänd 409 (var 500). Att spela upp din egen pipelinebatch igen returnerar 202. `mode=targetSize` utan `targetSizeKb` returnerar 400. En nekad lokal inloggning under SSO-tvång returnerar 401 i stället för 403 `SSO_ENFORCED`. Begränsade inloggningar returnerar 429 `LOGIN_THROTTLED`. Resultatet från remove-background innehåller inte längre `originalUrl`.
- **Nya valfria variabler**: `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (15 minuter som standard, `0` inaktiverar), `EMBEDDED_REDIS_TIMEOUT_S` (180) och `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Compose-filer levereras med versionen.** `docker-compose.yml` och `docker-compose-gpu.yml` är bifogade till den här versionen, så du kan ladda ner dem direkt från versionssidan.

### Tack {#v2-3-0-acknowledgements}

En miljon hämtningar betyder många människor som rapporterar buggar, skickar rättningar och berättar vad som saknades. Den här versionen är mestadels deras arbete.

Kod och bidrag:

- **@zakka258** ❤️: Byggde sidredigeraren i PDF Multi-Tool och distribution under undersökväg, två av de största funktionerna i den här versionen, inklusive testerna för autentisering och SSO under en undersökväg. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️: Byggde förinställningarna för komprimering av bilder till målstorlek med ett klick, rättade samtidighet och rensning för förhandsvisningar, och hindrade blockerad webbläsarlagring från att få inloggningssnurran att hänga. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️: Lade till ordning av sidor med dra och släpp i Organisera PDF, vilket de först hade bett om i Discussions. (#1249, #965)
- **@drakeo338** ❤️: Tio rättningar genom hela stacken, bland annat att autoorientering behåller format och kvalitet, att SCIM-grupper skapas i en transaktion, AI-installationer under cgroup v2 och att 5xx-fel inte längre maskeras som 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️: Lade till transparent dukutfyllnad i redigeraren, rättade föråldrade utlåtanden om målstorlek i Komprimera PDF och tillät partiella teamuppdateringar. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️: Stoppade egenhostade instanser från att skicka värmekartedata, validerade `TRUST_PROXY` vid start i stället för att krascha, och rättade hanteringen av SCIM-gruppnamn och tidsgräns för qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️: Gjorde flera 500-fel till riktiga 400- och 409-svar för felformaterade jobb-ID:n och multipart-importer, och rättade tömning av nummerfält i Inställningar. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️: Fick streckkodsläsning att fungera offline genom att bunta dess avkodare, rättade att mediaförhandsvisningar visade indata och förbättrade formatsökningen. (#1401, #1512, #1388)
- **@darklabs9** ❤️: Rapporterade och rättade att Komprimera video misslyckades på skärminspelningar med variabel bildfrekvens. (#2426, #2427)
- **@dvd233** ❤️: Exponerade alla RAW-format för kameror som avkodaren stöder, och fick favikonverktyg att dyka upp vid sökning efter ICO. (#1120, #1121)
- **@bercedev** ❤️: Rättade filnamn vars stam upprepar filändelsen, och fick AI att rapportera enheten den faktiskt körs på. (#3382, #3613)
- **@pamod-madubashana** ❤️: Översatte den sista rubriken för MFA som bara fanns på engelska och kopplade in oanvända förloppssträngar. (#1228, #1227)
- **@mvanhorn** ❤️: Rättade dubbel tilldelning av användarnamn vid SAML-inloggning. (#2640)
- **@peremunoz** ❤️: Hindrade streckkodsgenerering från att dölja lagrings- och minnesfel som "Invalid text". (#4057)
- **@mayuriphad** ❤️: Rättade en krasch vid en felformaterad lagrad autentiseringsrubrik för larm. (#3080)
- **@DevShoaib78** ❤️: Rättade stängningen av det polygonala lassot i redigeraren. (#1207)
- **@dltsum** ❤️: Flyttade förloppsvisningar till den delade meddelandekatalogen. (#1262)
- **@albanobattistella** ❤️: Översättningsrättningar. (#1024)
- **@shoaibyazdani** ❤️: Återskapade de visuella baslinjerna för macOS. (#2475)

Säkerhetsrapporter:

- **@xaferima** ❤️: Hittade att SVG-filer som avkodaren avvisade hoppade över sanering, och gick igenom konsekvenserna tillsammans med oss. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️: Hittade att resultatlänkar även serverade den ursprungliga uppladdningen. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️: Hittade att passfoto och bakgrundseffekter litade på ett jobb-ID från klienten. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️: Hittade att URL-import hoppade över behörighetskontroller. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️: Rapporterade IPv6-förbigångar av SSRF-adresskontrollerna, med fungerande proof of concept. Rättningarna levererades i 2.0.0, och det här tacket är försenat. (#287)

Buggrapporter:

- **@kabo** ❤️: Exemplet `docker-compose.yml` fungerade inte. (#1027)
- **@xromen** ❤️: Skadade PDF-filer som hängde tills qpdf nådde sin tidsgräns på 30 sekunder. (#920)
- **@snmabaur** ❤️: OIDC-inloggning som satte varje profilnamn till "admin". (#862)
- **@CodecNomad** ❤️: Verktyget Oskärpa som duplicerade bilden. (#829)
- **@ohora0923** ❤️ och **@Alexis-VS-CSharp** ❤️: Pixelera fungerade inte. (#678, #775)
- **@mptpro** ❤️: AI-nedladdningen för bakgrundsborttagning som misslyckades. (#714)
- **@dominic427** ❤️: Storleksändring av redigerarens duk skalade bilden i stället för att utöka den. (#2016)
- **@CodeByToast** ❤️: Nummerfält i Inställningar som inte gick att tömma. (#1186)
- **@gioxx** ❤️: Diskkontrollen för AI-paket som krävde cirka 18 GB för ett paket. (#1248)
- **@rekcodocker** ❤️ och **@madmike970** ❤️: Installationer av AI-paket som misslyckades på Proxmox LXC, med containerdetaljerna som hjälpte till att fastställa orsaken. (#1030, #352)
- **@wxf26054** ❤️: Inaktiverade lösenordsregler som ändå tillämpades när användare skapades. (#1028)
- **@ersil** ❤️: iOS Safari som anropade OIDC-återanropet två gånger och hamnade på en felsida efter en lyckad inloggning. (#4021)
- **@casi-3** ❤️: Batchborttagning av bakgrund som förlorade färdiga resultat när webbläsaren spelade upp förfrågan igen, med en exakt diagnos. (#2015)
- **@killervette42** ❤️: GPU-felet för Blackwell på unRaid, vilket ledde till reservläget på CPU för RTX 50-serien. (#120, #4075)

Funktionsönskemål och återkoppling:

- **@photoevents** ❤️: Mätte att bakgrundsborttagning ägnade cirka 11 sekunder åt att ladda modellen och 1 sekund åt inferens, föreslog cachning av sessioner och delade vad de lärt sig av att köra sin egen cache. Det blev sessionscachen i den här versionen. (#768, #776, #4144)
- **@benbou8231** ❤️: Påpekade att importerade filer hamnar i omvänd ordning i verktyg med flera filer, vilket ledde till ändrad ordning före en körning. (#729, #756)
- **@cf3901646** ❤️: Spårade ett brusigt produktionsfel till Postgres felklass 58 och föreslog rättningen. Vi kunde inte slå ihop deras PR utan ett signerat CLA, så vi skrev samma rättning själva. (#4210, #4253)
- **@chiliec** ❤️: Upptäckte att en misslyckad autoorientering sväljdes tyst och att installationsförloppet ignorerade översättningskatalogen. Båda förslagen levererades via PR:er från underhållarna. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️: Föreslog single-flight för import av enterprise-modulen, rättningen för att samtidiga SCIM-förfrågningar var oeniga om licensen. (#1267, #1283)
- **@chenzeyan54-commits** ❤️: Påpekade att konfigurationsguiden aldrig nämnde överskrivningarna av motorbinärer eller `SNAPOTTER_HW_ACCEL`, som nu är dokumenterade. (#1312, #1696)
- **@aron-intframe** ❤️: Reproducerade en lucka i felhanteringen av exiftool på en ny klon och fann att kapplöpningen om temporär sökväg var värre än ärendet beskrev. (#3458)

Tack också till de i communityn som rapporterade dessa via Discord och e-post och vars namn vi inte antecknade.

[Fullständig diff på GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

Det mesta i 2.2 är härdning. En icke-administratör med en delegerad roll `users:manage` kunde ta över en instans, och varje verktygsslutpunkt visade sig sakna sin behörighetskontroll. Uppgradera om du kör fler än en användare.

Resten är den långa svansen av egenhosting: nedladdningar som startade och aldrig blev klara, förinställningar som gick sönder när du lade till en andra fil, containrar som kraschloopade medan Postgres fortfarande startade. Två nya verktyg tillkom också. Dokumentationen och webbplatsen är nu översatta till 21 språk, och gränssnittet klarar äntligen WCAG AA-kontrast.

> [!IMPORTANT]
> Om du gav `users:manage` till en icke-administratör via en anpassad roll kunde den rollen ta över administratörskonton i 2.0.0 till och med 2.1.0. Detaljer under Säkerhet.

### Säkerhet {#v2-2-0-security}

- **Behörighetseskalering via en delegerad roll `users:manage` (GHSA-9xgh-95qh-2x7h).** En icke-administratör som hade `users:manage` via en anpassad roll kunde återställa lösenordet för, eller radera, ett konto med högre behörighet, inklusive en inbyggd administratör, och ta över instansen. Lösenordsåterställning och radering av konton verifierar nu anroparens befogenhet över målet, så en delegerad roll kan inte nå över sin egen nivå. Påverkade: 2.0.0 till och med 2.1.0. Rapporterad av 李春来 (Chunlai Li). (#616)
- **Varje verktygsslutpunkt är nu spärrad.** Verktygsåtkomst upprätthölls route för route, så alla 45 handskrivna routes måste komma ihåg samma anrop och ingen av dem gjorde det. En roll utan `tools:use` kunde fortfarande köra image-to-pdf, erase-object, upscale, sign-pdf och resten. Kontrollen finns nu i en enda preHandler som utgår från den matchade routen, så den täcker underlänkar och alla routes som läggs till senare. (#646)
- **Hastighetsbegränsningen kunde kringgås på Docker-installationer.** Avbilden levererades med `TRUST_PROXY=true`, så klientens IP kom från en förfrågningsrubrik och en förfalskad `X-Forwarded-For` gick förbi inloggningsbegränsaren. Standardvärdet är nu en förtroendelista för privata nätverk. (#649)
- **Skrivningar av inställningar kontrolleras per inställning**, inte en gång vid dörren, och konfigurationsimport är nu transaktionell så att en nekad nyckel inte kan lämna en halv konfiguration tillämpad. (#618)
- **Filnamn i biblioteket kan inte lämna sin lagringsrot.** Ett konstruerat lagrat namn, som en skadlig 1.x SQLite-import kopierar ordagrant, kunde läsa eller radera filer utanför filkatalogen. Nåbart först efter att en operatör importerar en SQLite-databas från 1.x som angripare tillhandahållit, vilket är den enda vägen som låter ett lagrat namn väljas. Rapporterad av @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **Avbrytande av jobb kontrollerar ägarskap**, så en autentiserad användare inte längre kan avbryta en annan användares jobb med dess ID. Rapporterad av @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **En ny granskning av hela 2.0-trädet fångade det som ännu var öppet**: en fångad SAML-assertion kunde spelas upp igen, en MFA-utmaning överlevde hur många felaktiga koder som helst, API-nyckelsökningen per förfrågan var en fullständig tabellskanning, `MAX_WORKSPACE_SIZE_GB` var död konfiguration, och SVG-saneraren släppte igenom href:ar med `javascript:` utan citattecken. (#620)
- **Nio publicerade CVE:er rättade**: fast-uri, svgo, sharp och tar transitivt (#619), samt Pillow 12.3.0 (#517). RAW-avkodning på arm64 bygger nu LibRaw 0.22.2 från källkod i stället för att länka en orättad systemkopia. (#649)

### Nya funktioner {#v2-2-0-new-features}

- **Rundad beskärning**: masker med rundade kvadrater och squircle i iOS-stil, med en kontroll för hörnradie. Byggd för favicons och appikoner. (#602)
- **Ta bort GIF-bakgrund**: ta bort bakgrunden från en animerad GIF, WebP eller APNG bildruta för bildruta och få tillbaka en transparent animation. (#502)
- **Lasso och högkvalitetsläge i Objektradering**: dra en frihandsögla i stället för att måla varje pixel, och installera valfritt ett paket för diffusionsinpainting för renare fyllning av stora ytor. (#503, #566)
- **Spara som ny, eller skriv över.** Att redigera en biblioteksfil ersatte förut tyst originalet. Nu väljer du per redigering, och standard behåller det. (#564, #577)
- **Förinställningar för bildförhållande i Ändra storlek.** Välj 1:1, 4:3 eller 16:9 så förblir de två måtten låsta, utan uppskalning. (#530)
- **OCR i två nivåer**: en snabb nivå är inbyggd i avbilden och körs offline utan nedladdning, och en mer exakt körmiljö installeras vid behov. (#519)
- **Skriv var som helst för att söka.** Börja skriva på översikten eller startsidan så hamnar det i sökrutan. (#644)
- **Dokumentation och webbplats på 21 språk**: dokumentationssajten, målsidorna och API-referensen är nu översatta, och ansluter till appens gränssnitt. En ny guide för distribution med låga resurser täcker Raspberry Pi och maskiner med 2 GB. (#548)
- **Tydligare verktygsnamn**: 18 tvetydiga namn kvalificerar sig nu själva, så "Komprimera" blev "Komprimera bild". Verktygs-ID:n och routes är oförändrade, så inget bokmärkt går sönder. (#520)

### Förbättringar {#v2-2-0-improvements}

- **WCAG AA-kontrast i hela gränssnittet**: paletten justerades så att livfull orange stannar på fyllningar medan text och etiketter använder tillgängliga färgtoken, och alla 57 fokusindikatorer klarar nu kravet 3:1 för icke-text. (#567, #574)
- **Uppskalning och bakgrundsborttagning ser inte längre frusna ut**: förloppsindikatorn rör sig under inferens i stället för att parkera på 30 %, och båda verktygen varnar nu för att en värd med enbart CPU är mycket långsammare. (#605, #608)
- **Meddelanden om tidsgräns namnger den verkliga orsaken** och tar hänsyn till värdar med enbart CPU i stället för att skylla på uppladdningen. (#596)
- **SnapOtter väntar på Postgres och Redis vid start** i stället för att kraschloopa, i både Compose och all-in-one-avbilden. En installation på Proxmox LXC startade om 76 gånger innan detta. (#537, #595)
- **Nedladdningar överlever en omvänd proxy**: SnapOtter ber nginx och kompatibla proxyer att inte buffra filsvar, vilket är den vanliga orsaken till att en egenhostad nedladdning startar och aldrig blir klar. (#604, #607)
- **Komprimera PDF landar nära målstorleken**, och säger ärligt till när ett mål är utom räckhåll. (#522)
- **Verktygskontroller på mobil förblir nåbara** nu när appens skal anpassas till den dynamiska visningsytan. (#559)
- **Konvertera ljud har en inställning för samplingsfrekvens.** (#561)
- **Administratörer kan lätta på den minsta lösenordslängden**, ner till 1 för en betrodd LAN-instans. (#543)
- **MFA är självbetjäning**, policyutelåsningen är stängd, och inloggningar via OIDC eller SAML får en riktig MFA-utmaning i stället för en hård blockering. (#531, #536)
- **Ett nakent `Error: Error` namnger nu sin orsak.** Kodningsfel i Sharp, avslut i AI-sidovagnen, utdata från dokumentsidovagnen som inte är JSON och fel vid bakgrundsborttagning kom förut alla med orsaken bortskrubbad. (#532, #534, #535, #538, #612)
- **Hjälpdialogen är översatt.** Dess genvägsetiketter och kom-igång-text var hårdkodad engelska medan färdiga översättningar låg oanvända i alla 21 språkfiler. (#647)

### Buggrättningar {#v2-2-0-bug-fixes}

- **HEIC-filer från iPhone avvisades** som oläsbara innan de nådde avkodaren som hanterar dem. (#631)
- **Konverteringsförinställningar misslyckades på en andra fil**: jpg-to-pdf och dess syskon image-to-pdf, samt pdf-to-png, pdf-to-jpg och pdf-to-tiff, returnerade alla `Tool not found` när du laddade upp två filer. (#633, #643)
- **PDF-konverteringsförinställningar förlorade sin nedladdningsknapp.** (#629)
- **En obegränsad bearbetningstidsgräns respekterades inte**, och avstannade förloppsströmmar återhämtar sig nu i stället för att lämna gränssnittet väntande. (#638)
- **Nedladdningar hängde sig i stället för att misslyckas** när en lagrad fil visade sig vara kortare än sin registrerade längd. (#617)
- **PDF-sidverktyg misslyckades på korta och krypterade filer**: Ta bort sidor hade som standard ett sidintervall som inget dokument under sex sidor har, och lösenordsskyddade PDF-filer misslyckade kryptiskt inuti arbetaren. (#594)
- **PDF till text returnerade tyst en tom fil** för skannade PDF-filer. Den pekar dig nu mot OCR och serverar text som UTF-8. (#603)
- **PDF till Word tappade färgade textblock** och delade upp dem över sidan. (#500)
- **Objektradering lämnade spökrester** och suddade små objekt i bilder med hög upplösning. (#501)
- **Stabilisera video skrev ospelbar utdata** utan faststart. (#593)
- **Reparationer i bildredigeraren**: rotera, vänd, ändra storlek, nivåer, kurvor, filter och låsning av lager. (#597)
- **Signera PDF visade en tom duk** i stället för att rapportera varför en PDF inte kunde laddas. (#545)
- **Filbiblioteket registrerade dimensionerna 0x0** och hoppade över förhandsvisningar för uppladdningar av HEIC, RAW och PSD. (#636, #637)
- **Att installera mer än ett AI-paket** lämnade den delade virtualenv med flera versioner och förstörde tyst tre verktyg. (#649)
- **Konvertering till JXL med kvalitet 1 till 4 gav ett 500**, och en saknad ffmpeg rapporterades till dig som en skadad uppladdning. (#649)
- **Ett tillfälligt Postgres-avbrott strandsatte färdiga jobb**, så att utdata låg kvar på disk utan någon rad som pekade på den. En avstämmare tar nu över det arbetet i stället för att släppa det. (#649)
- **En Redis-slutpunkt som bytte adress låste varje konsument** medan hälsokontroller fortfarande svarade 200. (#649)
- **Rättningar för webbplats och dokumentation**: lokaliserade länkar tappar inte längre fragment av typen `#` eller gemenar `zh-CN`, dokumentationens navigering håller sig inom visningsytan på surfplattor, och ingen av sajterna anropar GitHub API från din webbläsare längre. (#516, #562, #570, #560)

### Uppgraderingsanteckningar {#v2-2-0-upgrade-notes}

Inget att migrera, men två levererade standardvärden ändrades:

- **`TRUST_PROXY` har nu som standard `loopback,linklocal,uniquelocal`** i stället för att lita på varje peer. Docker bridge- och Compose-nätverk ligger inom det intervallet, så de flesta konfigurationer behöver ingen ändring. Om din omvända proxy når SnapOtter från en publik adress, ange `TRUST_PROXY` uttryckligen, annars tillskriver hastighetsbegränsning och granskningsloggar varje förfrågan till proxyn.
- **`MAX_AI_JOBS_PER_USER` har som standard 5** pågående AI-jobb för en fil per användare. AI-körningar av batch och pipeline förblir obegränsade.

Nya valfria inställningar: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (av som standard) och `GIF_BG_MAX_FRAMES`.

### Tack {#v2-2-0-acknowledgements}

En god del av den här versionen började som någon annans buggrapport.

Kod och bidrag:

- **@mvanhorn** ❤️: Skrev om tidsgränsfelet för remove-background till ett meddelande som säger vad man ska göra åt det, i stället för en naken tidsgräns. (#518, #494)
- **@EuanTop** ❤️: Återställde nedladdningsåtgärden på sidor för PDF-konverteringsförinställningar genom att låta den synkrona routen returnera standardkontraktet för verktygsresultat. (#629, #623)
- **@harshjainnn** ❤️: Diagnostiserade nedladdningen som startar och aldrig blir klar, och föreslog riktningen med socketåterställning som rättningen byggdes på. (#617, #590)

Säkerhetsrapporter:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Rapporterade privat behörighetseskaleringen via en delegerad roll `users:manage`, med en fullständig analys från källa till sänka och en fungerande exploateringskedja. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): Rapporterade en autentiserad IDOR vid avbrytande av jobb, och en sökvägsgenomgång i lagrade filnamn i biblioteket som nås efter en skadlig SQLite-import från 1.x, med ett fungerande proof of concept för varje. (#599, #600)

Buggrapporter:

- **@riz467** ❤️: Riktiga HEIC-filer från iPhone som avvisades vid validering, med grundorsaken utredd i rapporten. (#622)
- **@coupej** ❤️: PDF-förinställningssidor som hängde för evigt, och jpg-to-pdf som misslyckades så snart en andra fil lades till. Två skilda buggar, korrekt åtskilda. (#623, #627)
- **@linuxuser1** ❤️: `PROCESSING_TIMEOUT_S=0` dokumenterad som obegränsad men begränsad till fem minuter. (#630)
- **@bezibaerchen** ❤️: Konvertera ljud dolde inställningen för samplingsfrekvens som dess egen beskrivning utlovade. (#558)
- **@hell-toupee** ❤️: Paketet för exakt OCR som misslyckades att installeras med ett `libpaddle`-fel. (#505)
- **@Michael1260** ❤️ och **@And-CSH** ❤️: Bekräftade det OCR-installationsfelet oberoende av varandra och fastslog att manuell uppackning fungerar medan installationsprogrammet i appen inte gör det, vilket pekade ut buggen i installationsprogrammet. (#505)
- **@TomErnst1972** ❤️: Att aktivera policyn som kräver MFA låste ute en administratör från sin egen instans. (#515)
- **@thokich** ❤️: Objektradering som gav suddiga, oanvändbara fyllningar, vilket drev både omskrivningen av HD-inpainting och det valfria högkvalitetspaketet. (#141)
- **@Hennie-git** ❤️: En installation på Proxmox LXC som startade om 76 gånger mot en Postgres som ännu inte tog emot anslutningar. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): Gjorde triage av den rapporten i realtid och tog fram diagnosen som starträttningen byggdes på. (#537)

Funktionsönskemål och återkoppling:

- **@LECOQQ** ❤️: Bad om lättare lösenordskomplexitet på en installation för hemmaserver. (#136)
- **@killervette42** ❤️: Bad om en Unraid Community App, nu publicerad i Unraid CA-butiken. (#96)
- **@alienatedsec** ❤️: Påpekade att rättningen där GPU faller tillbaka på CPU var begravd i ett stängt ärende och omöjlig att hitta, vilket är anledningen till att den nu finns i distributionsdokumentationen. (#490, #587)
- **@neilp316** ❤️: Bekräftade GPU-felet för Blackwell på ett RTX 5060 och kartlade en fungerande uppgraderingsväg till CUDA 12.8. (#120)
- **@Roiki11** ❤️: Argumenterade för delad lagring med sökvägsreferenser framför filöverföring över HTTP för AI-beräkning utanför maskinen. (#189)

Tack också till de i communityn som rapporterade dessa via Discord och e-post och vars namn vi inte antecknade: önskemålet om squircle-beskärning (#602), nedladdningen av image-to-PDF som startade och aldrig blev klar (#604, #607), verktyget Radera sidor som fastnade (#594), arabisk text som saknades i pdf-to-text (#603) och diagnosen bakom ONNX GPU-reservläget (#490).

[Fullständig diff på GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 gör bildverktygslådan till en komplett svit för filhantering: över 200 verktyg i fem modaliteter (Bild, Video, Ljud, PDF och Filer), ombyggd på Postgres 17 och en Redis-baserad jobbkö, med ett kommando, `docker run`. Detta är en större version; läs Brytande ändringar före uppgradering från 1.x.

### Nya funktioner {#new-features}

- **Fyra nya verktygsmodaliteter**: Video, Ljud, PDF och Filer ansluter till Bild, vilket tar katalogen till över 200 verktyg.
- **Hållbara bakgrundsjobb**: En Redis-baserad kö (BullMQ) kör varje verktyg som ett spårat jobb med förlopp i realtid via SSE.
- **All-in-one-läge med en container**: Ett `docker run` startar en komplett instans med inbäddad Postgres och Redis.
- **AI-paket vid behov**: Bakgrundsborttagning, OCR, transkribering, uppskalning, ansiktsdetektering och förbättring, objektradering, färgläggning och fotorestaurering installeras från gränssnittet. GPU-acceleration detekteras per ramverk.
- **Signera PDF**: Rita, skriv eller ladda upp en signatur och placera den på en PDF i webbläsaren.
- **Automate**: En visuell pipelinebyggare som kedjar verktyg, med nio färdiga mallar.
- **83 konverteringsförinställningar med ett klick**: Dedikerade konverterare som JPG-till-PNG och MP4-till-GIF med suddig sökning.
- **Lagerbaserad bildredigerare**: En redigerare med Konva på `/editor` med penslar, former, justeringar, filter och kurvor.
- **Filbibliotek**: Spara vilket resultat som helst och återanvänd det som indata till ett annat verktyg.
- Fästa verktyg, zoom och panorering i duken, 21 språk och enterprise-funktioner (OIDC/SSO, SAML, SCIM, S3-lagring, behörigheter per verktyg, granskningsexport, distribuerad spårning).

### Förbättringar {#improvements}

- Avbryt en pågående process. (#137)
- RAW-avkodning i full upplösning via LibRaw, inklusive DNG. (#289)
- Distributioner utan root och med främmande UID (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Exakt detektering av AI-installation och ett härdat installationsflöde. (#214, #352)
- Härdning av integritet: ingen automatisk utgående trafik till tredje part, plus ett valfritt strikt offline-läge.
- Alltid tillgänglig återkopplingsknapp, även med analys av.

### Buggrättningar {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` inaktiverar hastighetsbegränsning för verktygsroutes igen. (#271)
- Reparerade sökvägar till AI-virtualenv i Docker-avbilden. (#390)
- Kompatibilitet med sharp 0.35.2+. (#362)
- Rättningar av layout i bildredigeraren: linjaler, fyllningsbeteende, sidopanel och dukstorlek. (#258, #259)
- Slutförde den italienska översättningen. (#231, #206, #425)
- Normalisering av ljud och loudnorm bevarar källans samplingsfrekvens.
- Härdning mot SSRF: numerisk IPv6 CIDR-matchning och en utökad förskanning av URL. (#287)
- Genererade PDF-filer stämplas med SnapOtter som Producer.
- mediapipe installeras på Python 3.13 och Debian 13.

### Brytande ändringar {#breaking-changes}

2.0 ersätter den inbäddade SQLite-databasen med Postgres 17 och lägger till Redis 8 för jobbkön. Dina 1.x-data migreras automatiskt vid första uppstarten, men containerstacken ändrades, så säkerhetskopiera först hela din volym `/data` (1.x kör SQLite i WAL-läge, så den committade datan finns oftast i `snapotter.db-wal`). Välj sedan avbilden med en container (inbäddad Postgres och Redis, endast root) eller Compose-stacken (appen plus Postgres 17 och Redis 8). Se [migreringsguiden](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) och [uppgraderingsguiden](/sv/guide/upgrading).

### Uppgradera {#upgrade}

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

Nytt verktyg HTML till bild, tillgänglighet enligt WCAG 2.2 AA, säkerhetshärdning från penetrationstester och 5 kritiska Docker-rättningar.

### Nya funktioner {#new-features-1}

- **HTML till bild**: Ta skärmbilder av URL:er eller rå HTML som PNG/JPEG/WebP. Helsidesbilder, anpassade visningsytor, mörkt läge.
- **Docker-konventionen _FILE för hemligheter**: Montera känsliga miljövariabler som filer i stället för klartext. (#205)
- **Enterprise-licensiering och S3-lagring**: Valfri kommersiell licensnyckel och S3-kompatibel objektlagring.
- **Förbättringar i formredigeraren**: Transparens för fyllning/linje, RGBA-färgväljare, streckade linjestilar.
- **Färdigbyggda versionsarkiv**: Ladda ner tarballs från GitHub Releases för installationer utan Docker (Proxmox, bare metal, LXC). (#202)

### Förbättringar {#improvements-1}

- **Tillgänglighet enligt WCAG 2.2 AA**: Hoppa över navigering, fokusfångst, aria-live-regioner, stöd för reducerad rörelse, korrekta kontrastförhållanden. (#209)
- **Anpassning för mobil**: Responsiva inställningar, automatisk återanslutning av SSE vid byte av flik på mobil. (#203, #204)
- **Kvalitet vid bakgrundsborttagning**: Kantutjämning, färgrening, val av utdataformat.
- **Italiensk översättning**: ~145 nya strängar av @albanobattistella. (#206)
- **API-dokumentation per verktyg**: 53 dokumentationssidor med parametrar, exempel och svarsformat.
- **Nedladdning av AI-modeller**: Logik för nya försök med exponentiell backoff för HuggingFace. (#201)

### Buggrättningar {#bug-fixes-1}

- Nya Docker-containrar var helt oanvändbara (hastighetsbegränsningen blockerade alla förfrågningar).
- AI-verktyg för ansiktsdetektering (blur-faces, red-eye-removal, enhance-faces, passport-photo) misslyckades på alla plattformar.
- HEIC-filer var trasiga på ARM (libheif-symbolen stämde inte).
- AI-paketen upscale och restore-photo misslyckades att installeras på ARM.
- OCR använde fel CUDA-version i GPU-containrar.
- Förbigång av SSRF-skyddet via hexadecimala IPv4-mappade IPv6-adresser. (Tack till: @tonghuaroot)
- Avkodning av HEIC från iPhone med extra bilder. (#183, #199)
- Real-ESRGAN CUDA OOM på GPU:er med 8 GB. (#200)
- 6 Sentry-fel i produktion och 7 QA-buggar. (#208)

### Säkerhet {#security}

- 10 fynd från penetrationstest åtgärdade (XFF-förbigång, krascher vid felformaterad JSON, obegränsade pipelines, XSS i granskningsloggen, TRACE-metoden med mera). (#207)
- SSRF-förbigång via hexadecimal IPv6 blockerad. (Tack till: @tonghuaroot)
- Basavbilder i Dockerfile fastlåsta med digest.

### Uppgradera {#upgrade-1}

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

Livedemo, målsidor per verktyg och en rad finslipningar.

### Nya funktioner {#new-features-2}

- **Livedemo** - [demo.snapotter.com](https://demo.snapotter.com) låter folk prova SnapOtter utan att installera något.
- **Verktygsindex** - Bläddra bland alla över 50 verktyg på `/tools` med sökning och kategorifilter.
- **Över 50 SEO-målsidor** - Varje verktyg har nu en egen målsida med vanliga frågor, användningsfall och jämförelsetabeller.
- **Förhandsvisning av bakgrund** - Reglaget före och efter visar en rutig bakgrund bakom transparenta bilder.
- **Generator för starka lösenord** - Knapp med ett klick i formuläret Lägg till medlemmar.

### Buggrättningar {#bug-fixes-2}

- Infoverktyget för HEIC/HEIF misslyckas inte längre (avkodning i förväg tillagd).
- Installation av AI-modellpaket visar bättre felmeddelanden och respekterar resursgränser.
- Miniatyrer i biblioteket laddas korrekt (autentiseringsrubriker saknades).
- Rullgardinsmenyer klipps inte längre i tabellerna Personer och Team i inställningarna.
- Procentsatsen för storleksjämförelse är dold i verktyg som inte komprimerar.
- Dubbel länk till integritetspolicyn borttagen.
- Italiensk översättning tillagd för inställningarna för AI-funktioner.
- Omdöpta Lucide-ikoner uppdaterade (Wand2, Columns).

### Infrastruktur {#infrastructure}

- OpenSSF Scorecard härdad från 4,3 till ~7,0.
- CI-tester parallelliserade i 4 shards med nedskalade testunderlag.
- 41 beroendeuppdateringar.

### Uppgradera {#upgrade-2}

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

Fem nya verktyg, en komplett bildredigerare, SSO-inloggning, 20 språk. Borde förmodligen ha varit tre separata versioner, men här är vi.

### Nya funktioner {#new-features-3}

- **Bildredigerare** - Lager, penslar, former, justeringar, filter, kurvor, kortkommandon. Körs i din webbläsare, bearbetar på din hårdvara.
- **OIDC / SSO-autentisering** - Logga in med Google, GitHub, Okta eller valfri OpenID Connect-leverantör. Ange några miljövariabler så använder ditt team sina befintliga konton.
- **Memegenerator** - 100 inbyggda mallar med textrendering via opentype.js. Eller ladda upp din egen bild.
- **Beautify** - Släpp in en skärmbild, få ut en polerad bild. Enhetsramar (macOS, Windows, webbläsare), skuggor, gradienter, förinställningar för sociala medier.
- **Simulering av färgblindhet** - Förhandsgranska hur bilder ser ut med protanopi, deuteranopi, tritanopi och andra färgseendeavvikelser.
- **Rättning av PNG-transparens** - Detekterar falskt transparenta PNG-filer och rättar dem med BiRefNet HR-matting. Valfri borttagning av vattenstämpel via LaMa-inpainting.
- **AI-utvidgning av duk** - Utöka bildens gränser med AI-fyllning. Tre kvalitetsnivåer (snabb, balanserad, kvalitet) beroende på hur mycket GPU-tid du vill byta mot.
- **20 språk** - Arabiska, kinesiska (förenklad/traditionell), tjeckiska, nederländska, franska, tyska, hindi, indonesiska, italienska, japanska, koreanska, polska, portugisiska, ryska, spanska, thai, turkiska, ukrainska, vietnamesiska. RTL fungerar för arabiska.
- **URL-import** - Klistra in URL:er i släppzonen eller massimportera från en lista. Hämtning på serversidan med SSRF-skydd.
- **Radering över flera filer** - Rita raderingsmasker över flera bilder och bearbeta alla med ett klick. Penseldrag finns kvar per bild.
- **Import/export av pipelines** - Spara verktygskedjor som JSON och dela dem med andra.
- **17 nya RAW-format för kameror** via exiftool, plus indata för QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ och APNG. Nya utdatakodekar för BMP, ICO, JP2, QOI. Export till AVIF, TIFF, GIF, JXL och PSD återvunnen från en förlorad gren.

### Förbättringar {#improvements-2}

- **Bildförbättring** - Ersatte den gamla pipelinen med CLAHE + normalisering + gamma. Ny omkopplare Deep Enhance använder AI-modellen för mer aggressiva resultat.
- **Återställ foto** - Detektering av repor omskriven med 8-vinkels Otsu-filtrering. LaMa-inpainting körs nu i originalupplösning.
- **Exotiska format överallt** - OCR, image-to-PDF, favicongenerator, komposition, stitch och vektorisering avkodar nu alla HEIC, RAW och PSD.
- **Komprimera** - Toleransen för målstorlek skärptes från 5 % till 1 %. Målstorlek är standardläget. Lade till stegknappar och väljare för enheten KB/MB.
- **Sentry-uppstädning** - 644 händelser som inte gick att åtgärda filtrerades bort. Riktiga fel hanteras nu korrekt.
- **GPU-detektering** - Bättre diagnostik för containrar där CUDA finns men nvidia-smi saknas.
- **Läge utan autentisering** - Anonym användare läggs in i databasen med administratörsroll. API-nycklar, pipelines och användarfiler går inte längre sönder på FK-begränsningar.
- **Över 2 705 nya tester** över enhets-, integrations- och E2E-tester.

### Buggrättningar {#bug-fixes-3}

- Uppskalning på CPU får inte längre tidsgräns på NAS-lådor och lågeffekthårdvara.
- Logotyp i QR-kod får inte längre förhandsvisningen att försvinna permanent.
- Överflöd vid beskärning rättat för höga porträttbilder.
- TIFF-filer med alfa tvingar nu korrekt PNG-utdata i stället för att ge korruption.
- Avkodning av HDR/EXR konverterar till 8 bitar före CLAHE, vilket rättar avkodningsfel.
- Indatabuffertar för ansiktslandmärken konverteras till PNG före Python-sidovagnen, vilket rättar krascher.
- Hitta dubbletter hanterar batchar med blandade format och nätverksfel.
- Förhandsvisningen i Beautify uppdateras i realtid.
- Förloppsindikatorer för stitch och vektorisering.
- SVGZ hanteras av SVG-till-raster.
- Filnamn med icke-ASCII-tecken rättade via procentkodad rubrik X-File-Results.

### Uppgradera {#upgrade-3}

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

Enhetlig Docker-avbild med automatisk GPU-detektering. En avbild hanterar både CPU- och GPU-arbetslaster. Förenklade compose till en enda fil med loggrotation. Förhandsnedladdning av modeller omfattar nu verifiering och ett rökprov.

---

## v1.13.0 {#v1-13-0}

Rollbaserad åtkomstkontroll (RBAC). 14 detaljerade behörigheter, tre inbyggda roller (admin, editor, user), stöd för anpassade roller. Behörighetskontroller på alla API-routes. Flikar i gränssnittet filtreras efter användarens behörigheter.

---

## v1.12.0 {#v1-12-0}

Verktyget PDF till bild. Konvertera PDF-sidor till PNG, JPEG, WebP eller TIFF med anpassad DPI. Enhetlig Docker-avbild med automatisk GPU-detektering.

---

## v1.11.0 {#v1-11-0}

Automatiskt genererad llms.txt via vitepress-plugin-llms för AI-vänlig dokumentation.

---

## v1.10.0 {#v1-10-0}

Innehållsmedveten storleksändring (seam carving) med ansiktsskydd. Ändra storlek på bilder samtidigt som viktigt innehåll bevaras.

---

## v1.9.0 {#v1-9-0}

Verktyget Stitch / Kombinera. Foga samman bilder sida vid sida, staplade lodrätt eller i ett anpassat rutnät.

---

## v1.8.0 {#v1-8-0}

Verktyget Redigera metadata. Visa och redigera EXIF-, IPTC- och XMP-metadata med ett detaljerat gränssnitt för att ta bort eller behålla.

---

## Äldre versioner {#older-releases}

För den fullständiga ändringsloggen på commit-nivå, inklusive patchversioner, se [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
