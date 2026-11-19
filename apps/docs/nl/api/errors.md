---
title: "Foutcodes"
description: "De structuur van de foutbody, de stabiele codes en wat u bij elke code kunt doen."
i18n_source_hash: dd2420de1d32
i18n_provenance: machine
i18n_output_hash: 97122477d4ca
i18n_hash_version: 2
---

# Foutcodes {#error-codes}

Elk JSON-foutantwoord heeft dezelfde structuur:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Veld | Altijd aanwezig | Betekenis |
|-------|----------------|---------|
| `error` | Ja | Een leesbaar bericht. Veilig om aan gebruikers te tonen. Parseer het niet. |
| `code` | Ja | Een stabiele, machineleesbare code. Vertak hierop. |
| `requestId` | Ja | De ID van de server voor dit verzoek. Vermeld die wanneer u een probleem meldt; hij komt overeen met het serverlogboek. |
| `details` | Soms | Meer context bij sommige 4xx-fouten, zoals het validatiebericht. |

Berichten kunnen tussen releases veranderen. Codes niet, dus schrijf clientlogica op basis van `code`.

## Codes op basis van de HTTP-status {#status-codes}

Wanneer een route geen eigen code instelt, leidt de server er een af uit de status:

| HTTP-status | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Elke andere 4xx valt terug op `BAD_REQUEST` en elke andere 5xx op `INTERNAL_ERROR`.

Een route kan een specifiekere code instellen, en dan bevat het antwoord die code. Een tool die niet kan draaien omdat de AI-bundel ontbreekt, geeft bijvoorbeeld een functiespecifieke code terug. Die codes worden beschreven bij de functie die ze geeft.

## Authenticatie en toegang {#auth-codes}

| `code` | Status | Wat te doen |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Stuur `Authorization: Bearer <token>` mee met een sessietoken of een API-sleutel (`si_...`). |
| `FORBIDDEN` | 403 | De inloggegevens zijn geldig, maar de machtiging ontbreekt. Vraag een beheerder om de machtiging. |
| `MUST_CHANGE_PASSWORD` | 403 | Het account moet zijn wachtwoord wijzigen voordat het andere endpoints kan aanroepen. Roep `POST /api/auth/change-password` aan met het sessietoken en probeer het daarna opnieuw. |
| `USER_DISABLED` | 403 | Het account is uitgeschakeld. Een beheerder moet het opnieuw inschakelen. |
| `LOGIN_THROTTLED` | 429 | Te veel mislukte inlogpogingen. Wacht voordat u het opnieuw probeert. |
| `VALIDATION_ERROR` | 400 | De body of parameters van het verzoek hebben de validatie niet doorstaan. `details` benoemt het probleem. |

Het beheerdersaccount van de eerste start is `admin` met het wachtwoord `admin`, tenzij `DEFAULT_USERNAME` of `DEFAULT_PASSWORD` dit heeft gewijzigd. Tenzij `SKIP_MUST_CHANGE_PASSWORD` is ingesteld, krijgt dat account bij elke aanroep `MUST_CHANGE_PASSWORD` totdat het wachtwoord is gewijzigd.

## Taken {#job-codes}

Een taak die mislukt, meldt de reden op de taak zelf, niet in de HTTP-fout. Lees `error.code` en `error.message` uit `GET /api/v1/jobs/{jobId}`. Zie [Voortgang volgen](/nl/api/rest#progress-tracking).

Een mislukte taak bewaart `error.code` alleen wanneer de fout een invoerfout of een serverfout is. Andere fouten bevatten alleen het bericht.

| `code` | Betekenis | Wat te doen |
|--------|--------|------------|
| `CANCELED` | De taak is door een gebruiker geannuleerd. Dit is geen HTTP-status. Voortgangsgebeurtenissen bevatten `phase: failed` met deze code. | Behandel het als een annulering door de gebruiker. Probeer het niet automatisch opnieuw. |
| `INPUT_MISSING` | De invoer is verwijderd voordat de taak werd uitgevoerd. | Upload het bestand opnieuw. |
| `ENGINE_UNAVAILABLE` | Een vereiste engine kon op de server niet starten. | Probeer het opnieuw nadat een beheerder de installatie heeft hersteld. |
| `JOB_STALLED` | Wordt niet aan clients teruggegeven; het labelt de foutmelding van de server. De worker verloor de vergrendeling van de taak vaker dan de wachtrij toestaat, meestal doordat de server opnieuw is gestart of zonder geheugen of CPU kwam te zitten. De taak mislukt met een bericht dat hij is onderbroken. | Probeer het opnieuw. Als het blijft gebeuren, geef de server dan meer geheugen of verlaag `CONCURRENT_JOBS`. |

## Authenticatie en MFA {#mfa-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Het MFA-beleid vereist inschrijving en deze instantie kan de gebruiker niet inschrijven (geen enterprise-licentie). Instanties met een licentie geven 200 terug met `requiresMfaEnrollment: true` en leiden de gebruiker in plaats daarvan door de inschrijving. | Probeer het niet opnieuw. Een beheerder moet het beleid wijzigen of de offline herstel-CLI gebruiken. |
| `MFA_POLICY_UNAVAILABLE` | 503 | De server kon het MFA-beleid tijdens het inloggen niet lezen. | Probeer het inloggen zo meteen opnieuw. |
| `INVALID_CODE` | 401 | De TOTP- of herstelcode is onjuist. | Vraag de gebruiker om een nieuwe code en probeer het opnieuw. Herhaalde mislukkingen eindigen in `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Te veel onjuiste codes. De uitdaging wordt verworpen. | Begin het inloggen opnieuw om een nieuwe uitdaging te krijgen. |
| `MFA_EXPIRED` | 401 | De MFA- of inschrijvingsuitdaging is verlopen of komt niet overeen. | Begin het inloggen opnieuw. |
| `MFA_NOT_CONFIGURED` | 401 | Het account heeft geen TOTP-geheim, dus een code kan niet worden gecontroleerd. | Schrijf MFA in voordat u met een code inlogt. |
| `MFA_ALREADY_ENABLED` | 409 | MFA is al actief op het account. | Schrijf niet opnieuw in. |
| `NO_PENDING_ENROLLMENT` | 400 | Er kwam een inschrijvingsbevestiging binnen zonder lopende inschrijving. | Roep eerst het inschrijvings-endpoint aan. |
| `MFA_NOT_ENABLED` | 400 | De actie vereist dat MFA aan staat, en voor deze gebruiker staat het uit. | Sla de actie over, of schakel eerst MFA in. |
| `MFA_DECRYPTION_FAILED` | 500 | Het opgeslagen TOTP-geheim kan niet worden ontsleuteld. | Actie voor de beheerder. Meestal betekent dit dat de versleutelingssleutel is gewijzigd. Controleer `DATA_ENCRYPTION_KEY` en `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Een opgeslagen waarde (een instelling, een auth-header van een webhook of een TOTP-geheim) kan niet worden ontsleuteld. | Actie voor de beheerder, zoals hierboven. Probeer het niet opnieuw. |
| `IDLE_TIMEOUT` | 401 | De sessie is verlopen na een periode van inactiviteit. | Log opnieuw in. |
| `INVALID_PASSWORD` | 401 | Het huidige wachtwoord is onjuist bij een wachtwoordwijziging. | Vraag de gebruiker om het huidige wachtwoord. |
| `PASSWORD_CHANGED` | 409 | Het wachtwoord is in een andere sessie gewijzigd, of een beheerder heeft het opnieuw ingesteld, terwijl dit verzoek liep. | Log opnieuw in. |
| `OIDC_NO_PASSWORD` | 400 | Er is een wachtwoordwijziging of reset aangevraagd voor een account dat via SSO is aangemaakt. | Verwijs de gebruiker naar de identiteitsprovider. |

## OIDC {#oidc-codes}

OIDC-fouten tijdens het inloggen geven geen JSON-body terug. De inlogroute stuurt door naar de inlogpagina met een algemene reden, en het auditlogboek legt de code vast. De uitlogroute beëindigt de lokale sessie nog steeds wanneer de identiteitsprovider niet bereikbaar is.

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Geen (doorverwijzing) | De issuer-URL is `http`, maar `EXTERNAL_URL` is `https`, dus de client weigert discovery. | Beheerder: bied de issuer aan via `https`, of draai de instantie via `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Geen (doorverwijzing) | Discovery van de issuer liep op een time-out. | Controleer of de server de issuer kan bereiken en probeer het opnieuw. |
| `OIDC_DISCOVERY_FAILED` | Geen (doorverwijzing) | Discovery is om een andere reden mislukt. | Controleer de issuer-URL en de uitgaande toegang van de server. |
| `OIDC_END_SESSION_INVALID` | Geen (uitloggen gaat door) | De `end_session_endpoint` van de identiteitsprovider is geen geldige URL. De lokale sessie wordt toch gewist. | Beheerder: corrigeer de metadata van de provider. |
| `OIDC_END_SESSION_SCHEME` | Geen (uitloggen gaat door) | De `end_session_endpoint` gebruikt een schema dat de server niet toestaat. De lokale sessie wordt toch gewist. | Beheerder: corrigeer de metadata van de provider. |

## SAML {#saml-codes}

SAML-fouten stellen geen `code` in. Een mislukte assertion stuurt door naar de inlogpagina met `saml_auth_failed`, en de auditgebeurtenis `SAML_LOGIN_FAILED` legt de reden vast.

## SCIM {#scim-codes}

SCIM-routes antwoorden met de foutenvelop van RFC 7644 (`schemas`, `detail`, `status` en soms `scimType`). Ze stellen geen `code` in. Vertak op de HTTP-status.

## Teams, rollen en gebruikers {#team-role-codes}

Dubbele team- of rolnamen geven de algemene `CONFLICT` terug, en een ontbrekend team of een ontbrekende rol geeft `NOT_FOUND` terug.

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | De rol van de aanroeper staat de wijziging niet toe. Het doel staat boven de bevoegdheid van de aanroeper, de rol is ingebouwd, of het verzoek verleent machtigingen die de aanroeper niet heeft. | Probeer het niet opnieuw. Vraag een gebruiker met meer bevoegdheden. |
| `UNKNOWN_ROLE` | 400 | De rol-ID komt niet overeen met een bestaande rol. | Corrigeer de rol-ID. Toon de rollen om hem te vinden. |
| `UNKNOWN_TEAM` | 400 | De team-ID komt niet overeen met een bestaand team. | Corrigeer de team-ID. |
| `SELF_DEMOTE` | 400 | Een beheerder probeerde zijn eigen beheerdersrol te verwijderen. | Laat een andere beheerder de wijziging doorvoeren. |
| `SELF_DELETE` | 400 | Een beheerder probeerde zijn eigen account te verwijderen. | Laat een andere beheerder het verwijderen. |
| `LAST_ADMIN` | 400 op gebruikersroutes, 409 op GDPR-wisroutes | De wijziging zou geen beheerder overlaten, of een team wissen dat alle beheerders bevat. | Maak eerst een andere gebruiker beheerder. |
| `USER_LIMIT_REACHED` | 403 | De instantie zit op de limiet van `MAX_USERS`. | Verwijder een gebruiker, of verhoog `MAX_USERS`. |

## Functies en AI-bundels {#feature-codes}

Tools, batchruns en pipelines die een optionele AI-bundel nodig hebben, gebruiken deze codes.

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501, of 400 vanuit de gezichtsmodus van Smart Crop | De tool, of een stap van een pipeline of batch, heeft een bundel nodig die niet is geïnstalleerd. De body bevat `feature` (de bundel-ID) en `featureName`. | Installeer de bundel in Instellingen en probeer het opnieuw. |
| `FEATURE_CPU_UNSUPPORTED` | 409 | Een installatie of offline import is geweigerd omdat de x86-64-bibliotheken van de bundel AVX nodig hebben en de CPU van deze server dat niet heeft. Er is niets gedownload of geïnstalleerd. De body bevat `feature` (de bundel-ID) en `reason` (`cpu-no-avx`). `GET /api/v1/features` meldt dezelfde bundel met `compatibility: "incompatible"` en `compatibilityReason: "cpu-no-avx"`. | Draai SnapOtter op een CPU met AVX, of op arm64. Andere bundels worden nog steeds geïnstalleerd. |
| `FEATURE_INCOMPATIBLE` | 501, of 400 wanneer Fast OCR een taal krijgt die hij niet kan lezen | De geïnstalleerde functie kan de gevraagde kwaliteit of taal niet aan. | Wijzig de instelling, of installeer een bundel die dit ondersteunt. |
| `ENGINE_UNAVAILABLE` | 503 | Een vereiste engine kon niet starten, of een OCR-runtime is verwijderd nadat het verzoek was gevalideerd. | Probeer het opnieuw nadat een beheerder de functie heeft hersteld of opnieuw geïnstalleerd. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium is niet geïnstalleerd, dus HTML naar afbeelding kan niet draaien. | Vraag een beheerder de browser te installeren. |
| `BROWSER_CRASHED` | 503 | De screenshotbrowser is tijdens het renderen gecrasht. | Probeer het verzoek opnieuw. |

## Tools {#tool-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | De geüploade invoer is verwijderd voordat de taak werd uitgevoerd. | Upload het bestand opnieuw en dien de taak in. |
| `ANALYSIS_EXPIRED` | 410 | De analyse van de pasfoto is verlopen vóór het genereren. | Analyseer de foto opnieuw en genereer daarna. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Het resultaat van de achtergrondverwijdering is verlopen vóór de vervolgstap. | Verwijder de achtergrond opnieuw. |
| `NOT_ANIMATED` | 400 | Remove GIF Background kreeg een stilstaande afbeelding. | Gebruik Remove Background voor stilstaande afbeeldingen. |
| `TOO_MANY_FRAMES` | 400 | De animatie heeft meer frames dan de server toestaat (`GIF_BG_MAX_FRAMES`). | Stuur een kortere animatie, of vraag een beheerder de limiet te verhogen. |
| `TOO_MANY_PIXELS` | 400 | Het canvas van de animatie maal het aantal frames overschrijdt de limiet van de server: 268.402.689 pixels (16383 x 16383) voor Remove GIF Background, of de GIF-werklastlimiet voor andere geanimeerde tools. | Stuur minder frames of een kleinere animatie. |
| `IMAGE_TOO_LARGE` | 400 | De afbeelding heeft meer pixels dan de decoder accepteert. | Stuur een kleinere afbeelding. |
| `RESULT_TOO_LARGE` | 400 | De instellingen zouden een afbeelding opleveren die groter is dan de encoder- of pixellimiet toestaat. | Gebruik een kleinere afbeelding of instellingen die een kleiner resultaat geven. |
| `DOCUMENT_UNREADABLE` | 400 | LibreOffice of pandoc kon het document niet openen. Het kan beschadigd zijn, met een wachtwoord beveiligd zijn, of niet het formaat hebben dat de extensie aangeeft. | Controleer of het bestand in een office-app opent en stuur het daarna opnieuw. |
| `PDF_DAMAGED` | 400 | De pdf-engine vond een kapotte documentstructuur. | Haal het bestand door Repair PDF en probeer het opnieuw. |
| `PDF_PASSWORD_PROTECTED` | 400 | De pdf is versleuteld en deze tool kan hem niet openen. | Ontgrendel hem eerst met Unlock PDF. |
| `NO_AUDIO_TRACK` | 400 | Het bestand heeft geen audiostream die een audiotool kan gebruiken. | Stuur een bestand met audio. |
| `MEDIA_UNDECODABLE` | 400 | ffmpeg kon de audio of video niet lezen: er zijn geen pakketten, geen codecparameters, geen `moov`-atom of gegevens die het niet kan parseren. | Controleer of het bestand in een mediaspeler afspeelt, of exporteer het opnieuw, en probeer het daarna opnieuw. |
| `PAGE_OUT_OF_RANGE` | 400 | Het paginabereik noemt een pagina die de pdf niet heeft. | Controleer het aantal pagina's en stuur een bereik binnen dat aantal. |
| `INVALID_PAGE_RANGE` | 400 | Het paginabereik heeft geen geldige syntaxis. | Gebruik paginanummers zoals `1-3,5`. |
| `CANNOT_REMOVE_ALL_PAGES` | 400 | Remove Pages kreeg het verzoek om alle pagina's te verwijderen. | Houd minstens één pagina over. |
| `NESTING_TOO_DEEP` | 400 | De JSON of XML is meer dan 100 niveaus diep genest. | Maak het document vlak en converteer het daarna. |
| `IMAGE_UNDECODABLE` | 400 | De afbeelding kan niet worden gedecodeerd, of de afmetingen kunnen niet worden gelezen. Het bestand kan beschadigd zijn of een codering gebruiken die de decoder niet ondersteunt. | Exporteer de afbeelding opnieuw vanuit een andere app, of converteer hem eerst naar PNG of JPEG. |
| `INVALID_SETTINGS` | 400 | Een instelling valt buiten het bereik of past niet bij dit bestand: een uitsnede buiten de afbeelding, een formaatwijziging naar nul, een GIF-frame dat de animatie niet heeft, een pasfotospecificatie die niet bestaat. De tekst van `error` benoemt de instelling. | Corrigeer de instelling die in `error` wordt genoemd en probeer het opnieuw. |
| `CHART_DATA_INVALID` | 400 | Chart Maker kon geen grafiekgegevens uit het bestand lezen: de CSV of JSON kan niet worden geparsed, heeft geen numerieke kolom, heeft meer dan 100 rijen, of heeft een negatieve waarde. De tekst van `error` zegt welke. | Stuur CSV of JSON met maximaal 100 rijen, elk met een label en een getal van nul of hoger. |
| `NO_FACE_DETECTED` | 400 | Passport Photo vond geen gezicht in de afbeelding. | Stuur een duidelijke, frontale foto met goede belichting. |
| `TARGET_SIZE_UNREACHABLE` | 400 | Compressie, of de groottelimiet van een pasfoto, kan het bestand niet onder de gevraagde grootte krijgen, zelfs niet na verkleining. | Vraag een grotere doelgrootte, of snijd de afbeelding eerst bij. |
| `TOO_MANY_PAGES` | 400 | OCR kreeg het verzoek om meer pagina's te verwerken dan in één taak mogelijk is. | Selecteer minder pagina's met het paginabereik. |
| `METADATA_DAMAGED` | 400 | Edit Metadata vond de bestaande EXIF-gegevens van de afbeelding beschadigd, dus ze kunnen niet veilig worden herschreven. | Verwijder de metadata eerst met Remove Image Metadata en bewerk daarna. |
| `REMOTE_RESOURCES_DISABLED` | 400 | HTML of Markdown naar pdf vond een verwijzing naar een afbeelding, stylesheet of lettertype op het netwerk, die de server niet ophaalt. | Sluit de bron in het bestand in (bijvoorbeeld als `data:`-URI) en probeer het opnieuw. |

## Bestanden {#file-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Opslaan in Bestanden zou het opslagquotum van de gebruiker overschrijden. | Verwijder bestanden, of vraag een beheerder om meer ruimte. |
| `INVALID_STORED_NAME` | 400 | De server heeft een opgeslagen bestandsnaam afgewezen. | Upload het bestand opnieuw. |

## Pipelines en batch {#pipeline-codes}

Pipeline- en batchverzoeken geven de bovenstaande functiecodes terug voor elke stap die een bundel nodig heeft. Een taak-ID die al in gebruik is, geeft `CONFLICT` terug met status 409. Stuur een nieuwe taak-ID.

## Instellingen {#settings-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | De sleutel is geen bekende instelling. | Controleer de sleutelnaam. |
| `READONLY_SETTING` | 400 | De instelling kan niet via de API worden gewijzigd. | Wijzig haar via de omgeving of de beheer-UI. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | De nieuwe waarde is in strijd met andere instellingen. De body noemt de instelling in `setting` en toont de problemen in `validationErrors`. | Corrigeer de genoemde instellingen en probeer het opnieuw. |
| `SETTING_DECRYPTION_FAILED` | 500 | Een opgeslagen instelling kan niet worden ontsleuteld. | Actie voor de beheerder, zoals bij `DECRYPTION_FAILED`. |

Bij `VALIDATION_ERROR` op een instelling bevat `details` de schemaproblemen.

## Enterprise {#enterprise-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | De instelling of het beleid vereist een enterprise-licentie, zoals SSO-afdwinging of het MFA-beleid. | Gebruik een instantie met licentie, of laat de instelling uit. |
| `IP_NOT_ALLOWED` | 403 | Het IP-adres van het verzoek staat niet in de toegestane lijst. | Maak verbinding vanuit een toegestaan netwerk. |
| `INVALID_CIDR` | 400 | Een item in de toegestane lijst is geen geldige CIDR. Het bericht toont de ongeldige items. | Corrigeer de items en sla opnieuw op. |
| `SELF_LOCKOUT` | 400 | Het opslaan van de toegestane lijst zou het huidige IP-adres van de aanroeper blokkeren. | Voeg eerst uw huidige IP-adres aan de lijst toe. |

GDPR-wisroutes geven een gewone `CONFLICT` terug met status 409 wanneer een gebruiker of team onder juridische bewaring valt.

## Codes die clients niet ontvangen {#internal-codes}

Deze codes bestaan in de serverbron voor logs, telemetrie of de eigen fouten van Fastify. Een client krijgt ze niet in een responsebody of taakrij, dus schrijf er geen clientlogica op.

| `code` | Waar het naartoe gaat |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Gemeld aan foutopsporing door de alertevaluator. De auth-header van een alertwebhook kan niet worden ontsleuteld. |
| `SIEM_DECRYPTION_FAILED` | Gemeld aan foutopsporing door SIEM-doorsturing. De auth-header van de SIEM kan niet worden ontsleuteld. |
| `WEBHOOK_DECRYPTION_FAILED` | Gemeld aan foutopsporing. Het verzoek dat dezelfde fout tegenkwam, antwoordt met `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Gemeld aan foutopsporing wanneer een gestagede upload niet kan worden verwijderd. |
| `USERNAME_RACE_EXHAUSTED` | Opgeworpen wanneer SSO-automatisch-aanmaken bij elke nieuwe poging de race om de gebruikersnaam verliest. De inlogpagina toont in plaats daarvan een fout. |
| `ERR_OUT_OF_RANGE` | Opgeworpen door de lezer van objectopslag voor een ongeldig bytebereik. |
| `ETIMEDOUT` | Gezet op de time-outfout van een GDPR-export. De export mislukt en kan opnieuw worden aangevraagd. |
| `FST_REQ_FILE_TOO_LARGE` | De code van Fastify voor een upload boven de limiet. Clients krijgen een 413 met `PAYLOAD_TOO_LARGE`, of het eigen 413-bericht van de route. |
| `TARGET_SIZE_EXCEEDED` | Opgeworpen wanneer compressie op doelgrootte het doel mist. De fout heeft geen status of code, dus clients krijgen een algemene mislukking. |
| `OCR_CACHE_PERMISSIONS` | Gemeld aan foutopsporing als operationele fout wanneer het AI-gegevensvolume de OCR-runtimecache door iedereen beschrijfbaar achterlaat. De installatietaak mislukt met een bericht dat het opslagprobleem benoemt. |
| `OCR_RUNTIME_UNREACHABLE` | Gemeld aan foutopsporing als operationele fout wanneer de server huggingface.co nooit bereikte om de OCR-runtime te downloaden. De installatietaak mislukt met een bericht over netwerktoegang, `HTTPS_PROXY` en offline import. |
