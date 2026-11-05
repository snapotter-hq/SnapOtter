---
title: "Felkoder"
description: "Felsvarets form, de stabila koderna och vad du ska göra åt var och en."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: a640051f16f0
i18n_hash_version: 2
---

# Felkoder {#error-codes}

Varje JSON-felsvar har samma form:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Fält | Alltid med | Betydelse |
|-------|----------------|---------|
| `error` | Ja | Ett läsbart meddelande. Säkert att visa för användare. Tolka det inte maskinellt. |
| `code` | Ja | En stabil, maskinläsbar kod. Grena på denna. |
| `requestId` | Ja | Serverns ID för denna begäran. Ange det när du rapporterar ett problem, eftersom det motsvarar serverloggen. |
| `details` | Ibland | Mer sammanhang för vissa 4xx-fel, till exempel valideringsmeddelandet. |

Meddelanden kan ändras mellan utgåvor. Koderna ändras inte, så skriv klientlogiken mot `code`.

## Koder från HTTP-statusen {#status-codes}

När en route inte anger någon egen kod härleder servern en från statusen:

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

Alla andra 4xx-fel faller tillbaka på `BAD_REQUEST`, och alla andra 5xx-fel på `INTERNAL_ERROR`.

En route kan ange en mer specifik kod, och då innehåller svaret den koden i stället. Till exempel returnerar ett verktyg som inte kan köras eftersom dess AI-paket saknas en funktionsspecifik kod. Dessa koder beskrivs tillsammans med den funktion som utlöser dem.

## Autentisering och åtkomst {#auth-codes}

| `code` | Status | Vad du ska göra |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Skicka `Authorization: Bearer <token>` med en sessionstoken eller en API-nyckel (`si_...`). |
| `FORBIDDEN` | 403 | Autentiseringsuppgiften är giltig men saknar behörigheten. Be en administratör om behörigheten. |
| `MUST_CHANGE_PASSWORD` | 403 | Kontot måste byta lösenord innan det kan anropa andra slutpunkter. Anropa `POST /api/auth/change-password` med sessionstoken och försök sedan igen. |
| `USER_DISABLED` | 403 | Kontot är inaktiverat. En administratör måste aktivera det igen. |
| `LOGIN_THROTTLED` | 429 | För många misslyckade inloggningsförsök. Vänta innan du försöker igen. |
| `VALIDATION_ERROR` | 400 | Begärans innehåll eller parametrar klarade inte valideringen. `details` anger problemet. |

Administratörskontot vid första körningen är `admin` med lösenordet `admin`, om inte `DEFAULT_USERNAME` eller `DEFAULT_PASSWORD` har ändrat det. Om `SKIP_MUST_CHANGE_PASSWORD` inte är satt får det kontot `MUST_CHANGE_PASSWORD` vid varje anrop tills lösenordet har bytts.

## Jobb {#job-codes}

Ett jobb som misslyckas rapporterar orsaken på själva jobbet, inte i HTTP-felet. Läs `error.code` och `error.message` från `GET /api/v1/jobs/{jobId}`. Se [Förloppsspårning](/sv/api/rest#progress-tracking).

Ett misslyckat jobb behåller `error.code` bara när felet är ett indatafel eller ett serverfel. Andra fel har endast meddelandet.

| `code` | Betydelse | Vad du ska göra |
|--------|---------|------------|
| `CANCELED` | Jobbet avbröts av en användare. Det är ingen HTTP-status. Förloppshändelser innehåller `phase: failed` med den här koden. | Behandla det som ett avbrott från användaren. Försök inte automatiskt igen. |
| `INPUT_MISSING` | Indata togs bort innan jobbet kördes. | Ladda upp filen igen. |
| `ENGINE_UNAVAILABLE` | En nödvändig motor kunde inte starta på servern. | Försök igen efter att en administratör har reparerat installationen. |

## Autentisering och MFA {#mfa-codes}

| `code` | Status | Betydelse | Vad du ska göra |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | MFA-policyn kräver registrering, och den här instansen kan inte registrera användaren (ingen företagslicens). Licensierade instanser returnerar 200 med `requiresMfaEnrollment: true` och guidar användaren genom registreringen i stället. | Försök inte igen. En administratör måste ändra policyn eller använda återställningsverktyget på kommandoraden offline. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Servern kunde inte läsa MFA-policyn under inloggningen. | Försök logga in igen om en stund. |
| `INVALID_CODE` | 401 | TOTP-koden eller återställningskoden är fel. | Be användaren om en ny kod och försök igen. Upprepade fel leder till `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | För många felaktiga koder. Utmaningen förkastas. | Starta inloggningen igen för att få en ny utmaning. |
| `MFA_EXPIRED` | 401 | MFA-utmaningen eller registreringsutmaningen har gått ut eller stämmer inte. | Starta inloggningen igen. |
| `MFA_NOT_CONFIGURED` | 401 | Kontot har ingen TOTP-hemlighet, så en kod kan inte kontrolleras. | Registrera MFA innan du loggar in med en kod. |
| `MFA_ALREADY_ENABLED` | 409 | MFA är redan aktivt på kontot. | Registrera inte igen. |
| `NO_PENDING_ENROLLMENT` | 400 | En bekräftelse av registrering kom utan någon pågående registrering. | Anropa registreringsslutpunkten först. |
| `MFA_NOT_ENABLED` | 400 | Åtgärden kräver att MFA är på, och det är av för den här användaren. | Hoppa över åtgärden, eller aktivera MFA först. |
| `MFA_DECRYPTION_FAILED` | 500 | Den lagrade TOTP-hemligheten kan inte dekrypteras. | Åtgärd av driftansvarig. Det betyder oftast att krypteringsnyckeln har ändrats. Kontrollera `DATA_ENCRYPTION_KEY` och `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Ett lagrat värde (en inställning, en autentiseringsrubrik för webhook eller en TOTP-hemlighet) kan inte dekrypteras. | Åtgärd av driftansvarig, som ovan. Försök inte igen. |
| `IDLE_TIMEOUT` | 401 | Sessionen gick ut efter en period av inaktivitet. | Logga in igen. |
| `INVALID_PASSWORD` | 401 | Det nuvarande lösenordet är fel vid ett lösenordsbyte. | Be användaren om det nuvarande lösenordet. |
| `PASSWORD_CHANGED` | 409 | Lösenordet byttes i en annan session, eller återställdes av en administratör, medan den här begäran pågick. | Logga in igen. |
| `OIDC_NO_PASSWORD` | 400 | Ett lösenordsbyte eller en återställning begärdes för ett konto som skapats via SSO. | Hänvisa användaren till identitetsleverantören. |

## OIDC {#oidc-codes}

OIDC-fel under inloggning returnerar inte någon JSON-kropp. Inloggningsrouten omdirigerar till inloggningssidan med en allmän orsak, och granskningsloggen registrerar koden. Utloggningsrouten avslutar fortfarande den lokala sessionen när identitetsleverantören inte kan nås.

| `code` | Status | Betydelse | Vad du ska göra |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Ingen (omdirigering) | Utfärdarens URL är `http`, men `EXTERNAL_URL` är `https`, så klienten vägrar upptäckt. | Administratör: servera utfärdaren över `https`, eller kör instansen över `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Ingen (omdirigering) | Upptäckten av utfärdaren fick timeout. | Kontrollera att servern kan nå utfärdaren och försök sedan igen. |
| `OIDC_DISCOVERY_FAILED` | Ingen (omdirigering) | Upptäckten misslyckades av ett annat skäl. | Kontrollera utfärdarens URL och serverns utgående åtkomst. |
| `OIDC_END_SESSION_INVALID` | Ingen (utloggningen fortsätter) | Identitetsleverantörens `end_session_endpoint` är inte en giltig URL. Den lokala sessionen rensas ändå. | Administratör: rätta leverantörens metadata. |
| `OIDC_END_SESSION_SCHEME` | Ingen (utloggningen fortsätter) | `end_session_endpoint` använder ett schema som servern inte tillåter. Den lokala sessionen rensas ändå. | Administratör: rätta leverantörens metadata. |

## SAML {#saml-codes}

SAML-fel sätter ingen `code`. En misslyckad assertion omdirigerar till inloggningssidan med `saml_auth_failed`, och granskningshändelsen `SAML_LOGIN_FAILED` registrerar orsaken.

## SCIM {#scim-codes}

SCIM-routes svarar med felkuvertet enligt RFC 7644 (`schemas`, `detail`, `status` och ibland `scimType`). De sätter inte `code`. Grena på HTTP-statusen.

## Team, roller och användare {#team-role-codes}

Dubbla team- eller rollnamn returnerar den allmänna `CONFLICT`, och ett team eller en roll som saknas returnerar `NOT_FOUND`.

| `code` | Status | Betydelse | Vad du ska göra |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Anroparens roll tillåter inte ändringen. Målet står över anroparens behörighet, rollen är inbyggd, eller begäran ger behörigheter som anroparen inte har. | Försök inte igen. Be en användare med högre behörighet. |
| `UNKNOWN_ROLE` | 400 | Roll-ID:t motsvarar ingen befintlig roll. | Rätta roll-ID:t. Lista rollerna för att hitta det. |
| `UNKNOWN_TEAM` | 400 | Team-ID:t motsvarar inget befintligt team. | Rätta team-ID:t. |
| `SELF_DEMOTE` | 400 | En administratör försökte ta bort sin egen administratörsroll. | Låt en annan administratör göra ändringen. |
| `SELF_DELETE` | 400 | En administratör försökte radera sitt eget konto. | Låt en annan administratör radera det. |
| `LAST_ADMIN` | 400 på användarrouter, 409 på GDPR-rensningsrouter | Ändringen skulle lämna ingen administratör kvar, eller rensa ett team som innehåller alla administratörer. | Gör först en annan användare till administratör. |
| `USER_LIMIT_REACHED` | 403 | Instansen har nått gränsen `MAX_USERS`. | Ta bort en användare, eller höj `MAX_USERS`. |

## Funktioner och AI-paket {#feature-codes}

Verktyg, batchkörningar och pipelines som behöver ett valfritt AI-paket använder de här koderna.

| `code` | Status | Betydelse | Vad du ska göra |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | Verktyget, eller ett steg i en pipeline eller batch, behöver ett paket som inte är installerat. Svaret innehåller `feature` (paketets ID) och `featureName`. | Installera paketet i Inställningar och försök sedan igen. |
| `FEATURE_INCOMPATIBLE` | 501 | Den installerade funktionen kan inte hantera den begärda kvaliteten eller det begärda språket. | Ändra inställningen, eller installera ett paket som stöder det. |
| `ENGINE_UNAVAILABLE` | 503 | En nödvändig motor kunde inte starta, eller en OCR-körmiljö togs bort efter att begäran validerats. | Försök igen efter att en administratör har reparerat eller installerat om funktionen. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium är inte installerat, så HTML till bild kan inte köras. | Be en administratör installera webbläsaren. |
| `BROWSER_CRASHED` | 503 | Webbläsaren för skärmbilder kraschade under renderingen. | Försök begäran igen. |

## Verktyg {#tool-codes}

| `code` | Status | Betydelse | Vad du ska göra |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | Den uppladdade indatan togs bort innan jobbet kördes. | Ladda upp filen igen och skicka jobbet. |
| `ANALYSIS_EXPIRED` | 410 | Analysen av passfotot gick ut innan genereringen. | Analysera fotot igen och generera sedan. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Resultatet av bakgrundsborttagningen gick ut innan uppföljningssteget. | Ta bort bakgrunden igen. |
| `NOT_ANIMATED` | 400 | Ta bort GIF-bakgrund fick en stillbild. | Använd Ta bort bakgrund för stillbilder. |
| `TOO_MANY_FRAMES` | 400 | Animationen har fler bildrutor än servern tillåter (`GIF_BG_MAX_FRAMES`). | Skicka en kortare animation, eller be en administratör höja gränsen. |

## Filer {#file-codes}

| `code` | Status | Betydelse | Vad du ska göra |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Att spara i Filer skulle överskrida användarens lagringskvot. | Radera filer, eller be en administratör om mer utrymme. |
| `INVALID_STORED_NAME` | 400 | Servern avvisade ett lagrat filnamn. | Ladda upp filen igen. |

## Pipelines och batch {#pipeline-codes}

Pipeline- och batchbegäranden returnerar funktionskoderna ovan för varje steg som behöver ett paket. Ett jobb-ID som redan används returnerar `CONFLICT` med status 409. Skicka ett nytt jobb-ID.

## Inställningar {#settings-codes}

| `code` | Status | Betydelse | Vad du ska göra |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | Nyckeln är ingen känd inställning. | Kontrollera nyckelns namn. |
| `READONLY_SETTING` | 400 | Inställningen kan inte ändras via API:et. | Ändra den via miljön eller administratörsgränssnittet. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Det nya värdet krockar med andra inställningar. Svaret anger inställningen i `setting` och listar problemen i `validationErrors`. | Rätta de listade inställningarna och försök sedan igen. |
| `SETTING_DECRYPTION_FAILED` | 500 | En lagrad inställning kan inte dekrypteras. | Åtgärd av driftansvarig, som för `DECRYPTION_FAILED`. |

För `VALIDATION_ERROR` på en inställning innehåller `details` schemaproblemen.

## Enterprise {#enterprise-codes}

| `code` | Status | Betydelse | Vad du ska göra |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | Inställningen eller policyn kräver en enterprise-licens, till exempel SSO-tvång eller MFA-policyn. | Använd en licensierad instans, eller låt inställningen vara av. |
| `IP_NOT_ALLOWED` | 403 | Begärans IP-adress finns inte i tillåtelselistan. | Anslut från ett tillåtet nätverk. |
| `INVALID_CIDR` | 400 | En post i tillåtelselistan är inte en giltig CIDR. Meddelandet listar de felaktiga posterna. | Rätta posterna och spara igen. |
| `SELF_LOCKOUT` | 400 | Att spara tillåtelselistan skulle blockera anroparens nuvarande IP. | Lägg först till din nuvarande IP i listan. |

GDPR-rensningsrouter returnerar ett vanligt `CONFLICT` med status 409 när en användare eller ett team står under legal hold.

## Koder som klienter inte får {#internal-codes}

De här koderna finns i serverns källkod för loggar, telemetri eller Fastifys egna fel. En klient får dem inte i ett svarsinnehåll eller en jobbrad, så skriv ingen klientlogik mot dem.

| `code` | Vart den går |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Rapporteras till felspårning av larmutvärderaren. Autentiseringsrubriken för en larm-webhook kan inte dekrypteras. |
| `SIEM_DECRYPTION_FAILED` | Rapporteras till felspårning av SIEM-vidarebefordran. Autentiseringsrubriken för SIEM kan inte dekrypteras. |
| `WEBHOOK_DECRYPTION_FAILED` | Rapporteras till felspårning. Begäran som drabbades av samma fel svarar med `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Rapporteras till felspårning när en mellanlagrad uppladdning inte kan tas bort. |
| `USERNAME_RACE_EXHAUSTED` | Utlöses när SSO-autoskapande förlorar kapplöpningen om användarnamnet vid varje nytt försök. Inloggningssidan visar ett fel i stället. |
| `ERR_OUT_OF_RANGE` | Kastas av läsaren för objektlagring vid ett ogiltigt byteintervall. |
| `ETIMEDOUT` | Sätts på timeoutfelet för en GDPR-export. Exporten misslyckas och kan begäras igen. |
| `FST_REQ_FILE_TOO_LARGE` | Fastifys kod för en uppladdning över gränsen. Klienter får en 413 med `PAYLOAD_TOO_LARGE`, eller routens egna 413-meddelande. |
| `TARGET_SIZE_EXCEEDED` | Kastas när en komprimering till målstorlek missar sitt mål. Felet har ingen status eller kod, så klienter får ett allmänt fel. |
