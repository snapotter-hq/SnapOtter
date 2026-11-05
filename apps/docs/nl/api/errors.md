---
title: "Foutcodes"
description: "De structuur van de foutbody, de stabiele codes en wat u bij elke code kunt doen."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: b51646eddcca
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

Een mislukte taak behoudt `error.code` alleen wanneer de fout een invoerfout of een serverfout is. Andere fouten bevatten alleen het bericht.

| `code` | Betekenis | Wat te doen |
|--------|---------|------------|
| `CANCELED` | De taak is door een gebruiker geannuleerd. Dit is geen HTTP-status. Voortgangsgebeurtenissen bevatten `phase: failed` met deze code. | Behandel het als een annulering door de gebruiker. Probeer het niet automatisch opnieuw. |
| `INPUT_MISSING` | De invoer is verwijderd voordat de taak werd uitgevoerd. | Upload het bestand opnieuw. |
| `ENGINE_UNAVAILABLE` | Een vereiste engine kon op de server niet starten. | Probeer het opnieuw nadat een beheerder de installatie heeft hersteld. |

## Authenticatie en MFA {#mfa-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | Het MFA-beleid vereist registratie, en deze instantie kan de gebruiker niet registreren (geen enterprise-licentie). Instanties met een licentie geven 200 terug met `requiresMfaEnrollment: true` en leiden de gebruiker in plaats daarvan door de registratie. | Probeer het niet opnieuw. Een beheerder moet het beleid wijzigen of de offline herstel-CLI gebruiken. |
| `MFA_POLICY_UNAVAILABLE` | 503 | De server kon het MFA-beleid tijdens het inloggen niet lezen. | Probeer het inloggen zo meteen opnieuw. |
| `INVALID_CODE` | 401 | De TOTP- of herstelcode is onjuist. | Vraag de gebruiker om een nieuwe code en probeer het opnieuw. Herhaalde mislukkingen eindigen in `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Te veel onjuiste codes. De uitdaging wordt verworpen. | Begin het inloggen opnieuw om een nieuwe uitdaging te krijgen. |
| `MFA_EXPIRED` | 401 | De MFA- of registratie-uitdaging is verlopen of komt niet overeen. | Begin het inloggen opnieuw. |
| `MFA_NOT_CONFIGURED` | 401 | Het account heeft geen TOTP-geheim, dus een code kan niet worden gecontroleerd. | Registreer MFA voordat u met een code inlogt. |
| `MFA_ALREADY_ENABLED` | 409 | MFA is al actief op het account. | Registreer niet opnieuw. |
| `NO_PENDING_ENROLLMENT` | 400 | Er kwam een registratiebevestiging binnen zonder openstaande registratie. | Roep eerst het registratie-endpoint aan. |
| `MFA_NOT_ENABLED` | 400 | De actie vereist dat MFA aanstaat, en voor deze gebruiker staat het uit. | Sla de actie over of schakel eerst MFA in. |
| `MFA_DECRYPTION_FAILED` | 500 | Het opgeslagen TOTP-geheim kan niet worden ontsleuteld. | Actie voor de beheerder. Dit betekent meestal dat de versleutelingssleutel is gewijzigd. Controleer `DATA_ENCRYPTION_KEY` en `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Een opgeslagen waarde (een instelling, een webhook-authenticatieheader of een TOTP-geheim) kan niet worden ontsleuteld. | Actie voor de beheerder, zoals hierboven. Probeer het niet opnieuw. |
| `IDLE_TIMEOUT` | 401 | De sessie is verlopen na een periode van inactiviteit. | Log opnieuw in. |
| `INVALID_PASSWORD` | 401 | Het huidige wachtwoord is onjuist bij een wachtwoordwijziging. | Vraag de gebruiker om het huidige wachtwoord. |
| `PASSWORD_CHANGED` | 409 | Het wachtwoord is in een andere sessie gewijzigd, of een beheerder heeft het gereset, terwijl dit verzoek liep. | Log opnieuw in. |
| `OIDC_NO_PASSWORD` | 400 | Er is een wachtwoordwijziging of reset aangevraagd voor een account dat via SSO is aangemaakt. | Verwijs de gebruiker naar de identiteitsprovider. |

## OIDC {#oidc-codes}

OIDC-fouten tijdens het inloggen geven geen JSON-body terug. De inlogroute stuurt door naar de inlogpagina met een algemene reden, en het auditlogboek registreert de code. De uitlogroute beëindigt de lokale sessie nog steeds wanneer de identiteitsprovider niet bereikbaar is.

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Geen (doorverwijzing) | De issuer-URL is `http`, maar `EXTERNAL_URL` is `https`, dus de client weigert discovery. | Beheerder: bied de issuer aan via `https`, of draai de instantie via `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Geen (doorverwijzing) | De discovery van de issuer is verlopen. | Controleer of de server de issuer kan bereiken en probeer het opnieuw. |
| `OIDC_DISCOVERY_FAILED` | Geen (doorverwijzing) | De discovery is om een andere reden mislukt. | Controleer de issuer-URL en de uitgaande toegang van de server. |
| `OIDC_END_SESSION_INVALID` | Geen (uitloggen gaat door) | De `end_session_endpoint` van de identiteitsprovider is geen geldige URL. De lokale sessie wordt nog steeds gewist. | Beheerder: herstel de metadata van de provider. |
| `OIDC_END_SESSION_SCHEME` | Geen (uitloggen gaat door) | De `end_session_endpoint` gebruikt een schema dat de server niet toestaat. De lokale sessie wordt nog steeds gewist. | Beheerder: herstel de metadata van de provider. |

## SAML {#saml-codes}

SAML-fouten stellen geen `code` in. Een mislukte assertion stuurt door naar de inlogpagina met `saml_auth_failed`, en de auditgebeurtenis `SAML_LOGIN_FAILED` registreert de reden.

## SCIM {#scim-codes}

SCIM-routes antwoorden met de foutenvelop van RFC 7644 (`schemas`, `detail`, `status` en soms `scimType`). Ze stellen geen `code` in. Vertak op de HTTP-status.

## Teams, rollen en gebruikers {#team-role-codes}

Dubbele team- of rolnamen geven de algemene `CONFLICT` terug, en een ontbrekend team of een ontbrekende rol geeft `NOT_FOUND` terug.

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | De rol van de aanroeper staat de wijziging niet toe. Het doel staat boven de bevoegdheid van de aanroeper, de rol is ingebouwd, of het verzoek verleent machtigingen die de aanroeper niet heeft. | Probeer het niet opnieuw. Vraag een gebruiker met meer bevoegdheden. |
| `UNKNOWN_ROLE` | 400 | De rol-ID komt niet overeen met een bestaande rol. | Corrigeer de rol-ID. Laat de rollen weergeven om hem te vinden. |
| `UNKNOWN_TEAM` | 400 | De team-ID komt niet overeen met een bestaand team. | Corrigeer de team-ID. |
| `SELF_DEMOTE` | 400 | Een beheerder probeerde zijn eigen beheerdersrol te verwijderen. | Laat een andere beheerder de wijziging doorvoeren. |
| `SELF_DELETE` | 400 | Een beheerder probeerde zijn eigen account te verwijderen. | Laat een andere beheerder het verwijderen. |
| `LAST_ADMIN` | 400 bij gebruikersroutes, 409 bij AVG-wisroutes | De wijziging zou geen beheerder overlaten, of zou een team wissen dat alle beheerders bevat. | Maak eerst een andere gebruiker beheerder. |
| `USER_LIMIT_REACHED` | 403 | De instantie zit op zijn limiet van `MAX_USERS`. | Verwijder een gebruiker of verhoog `MAX_USERS`. |

## Functies en AI-bundels {#feature-codes}

Tools, batchruns en pipelines die een optionele AI-bundel nodig hebben, gebruiken deze codes.

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | De tool, of een stap van een pipeline of batch, heeft een bundel nodig die niet is geïnstalleerd. De body bevat `feature` (de bundel-ID) en `featureName`. | Installeer de bundel via Instellingen en probeer het opnieuw. |
| `FEATURE_INCOMPATIBLE` | 501 | De geïnstalleerde functie kan de gevraagde kwaliteit of taal niet aan. | Wijzig de instelling, of installeer een bundel die dit ondersteunt. |
| `ENGINE_UNAVAILABLE` | 503 | Een vereiste engine kon niet starten, of een OCR-runtime is verwijderd nadat het verzoek was gevalideerd. | Probeer het opnieuw nadat een beheerder de functie heeft hersteld of opnieuw geïnstalleerd. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium is niet geïnstalleerd, dus HTML naar afbeelding kan niet draaien. | Vraag een beheerder de browser te installeren. |
| `BROWSER_CRASHED` | 503 | De screenshotbrowser is tijdens het renderen gecrasht. | Probeer het verzoek opnieuw. |

## Tools {#tool-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | De geüploade invoer is verwijderd voordat de taak werd uitgevoerd. | Upload het bestand opnieuw en dien de taak in. |
| `ANALYSIS_EXPIRED` | 410 | De analyse van de pasfoto is verlopen vóór het genereren. | Analyseer de foto opnieuw en genereer daarna. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Het resultaat van de achtergrondverwijdering is verlopen vóór de vervolgstap. | Verwijder de achtergrond opnieuw. |
| `NOT_ANIMATED` | 400 | GIF-achtergrond verwijderen ontving een stilstaande afbeelding. | Gebruik Achtergrond verwijderen voor stilstaande afbeeldingen. |
| `TOO_MANY_FRAMES` | 400 | De animatie heeft meer frames dan de server toestaat (`GIF_BG_MAX_FRAMES`). | Stuur een kortere animatie, of vraag een beheerder de limiet te verhogen. |

## Bestanden {#file-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Opslaan in Bestanden zou het opslagquotum van de gebruiker overschrijden. | Verwijder bestanden, of vraag een beheerder om meer ruimte. |
| `INVALID_STORED_NAME` | 400 | De server heeft een opgeslagen bestandsnaam geweigerd. | Upload het bestand opnieuw. |

## Pipelines en batch {#pipeline-codes}

Pipeline- en batchverzoeken geven de functiecodes hierboven terug voor elke stap die een bundel nodig heeft. Een taak-ID die al in gebruik is, geeft `CONFLICT` terug met status 409. Stuur een nieuwe taak-ID.

## Instellingen {#settings-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | De sleutel is geen bekende instelling. | Controleer de sleutelnaam. |
| `READONLY_SETTING` | 400 | De instelling kan niet via de API worden gewijzigd. | Wijzig haar via de omgeving of de beheerinterface. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | De nieuwe waarde botst met andere instellingen. De body noemt de instelling in `setting` en somt de problemen op in `validationErrors`. | Corrigeer de genoemde instellingen en probeer het opnieuw. |
| `SETTING_DECRYPTION_FAILED` | 500 | Een opgeslagen instelling kan niet worden ontsleuteld. | Actie voor de beheerder, zoals bij `DECRYPTION_FAILED`. |

Bij `VALIDATION_ERROR` op een instelling bevat `details` de schemaproblemen.

## Enterprise {#enterprise-codes}

| `code` | Status | Betekenis | Wat te doen |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | De instelling of het beleid vereist een enterprise-licentie, zoals SSO-afdwinging of het MFA-beleid. | Gebruik een instantie met licentie, of laat de instelling uit. |
| `IP_NOT_ALLOWED` | 403 | Het IP-adres van het verzoek staat niet in de toelatingslijst. | Maak verbinding vanaf een toegestaan netwerk. |
| `INVALID_CIDR` | 400 | Een item in de toelatingslijst is geen geldige CIDR. Het bericht noemt de ongeldige items. | Corrigeer de items en sla opnieuw op. |
| `SELF_LOCKOUT` | 400 | Het opslaan van de toelatingslijst zou het huidige IP-adres van de aanroeper blokkeren. | Voeg eerst uw huidige IP-adres aan de lijst toe. |

AVG-wisroutes geven een gewone `CONFLICT` terug met status 409 wanneer een gebruiker of team onder juridische bewaring valt.

## Codes die clients niet ontvangen {#internal-codes}

Deze codes bestaan in de serverbroncode voor logboeken, telemetrie of de eigen fouten van Fastify. Een client krijgt ze niet in een responsebody of taakrij, dus schrijf er geen clientlogica op.

| `code` | Waar het naartoe gaat |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Door de alertevaluator gemeld aan foutopsporing. De authenticatieheader van een alert-webhook kan niet worden ontsleuteld. |
| `SIEM_DECRYPTION_FAILED` | Door SIEM-doorsturing gemeld aan foutopsporing. De authenticatieheader van de SIEM kan niet worden ontsleuteld. |
| `WEBHOOK_DECRYPTION_FAILED` | Gemeld aan foutopsporing. Het verzoek dat dezelfde fout tegenkwam, antwoordt met `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Gemeld aan foutopsporing wanneer een tijdelijk opgeslagen upload niet kan worden verwijderd. |
| `USERNAME_RACE_EXHAUSTED` | Optreedt wanneer SSO-automatisch-aanmaken bij elke nieuwe poging de race om de gebruikersnaam verliest. De inlogpagina toont in plaats daarvan een fout. |
| `ERR_OUT_OF_RANGE` | Gegenereerd door de lezer van de objectopslag bij een ongeldig bytebereik. |
| `ETIMEDOUT` | Ingesteld op de timeoutfout van een AVG-export. De export mislukt en kan opnieuw worden aangevraagd. |
| `FST_REQ_FILE_TOO_LARGE` | De code van Fastify voor een upload boven de limiet. Clients krijgen een 413 met `PAYLOAD_TOO_LARGE`, of het eigen 413-bericht van de route. |
| `TARGET_SIZE_EXCEEDED` | Gegenereerd wanneer een compressie op doelgrootte het doel mist. De fout heeft geen status of code, dus clients krijgen een algemene fout. |
