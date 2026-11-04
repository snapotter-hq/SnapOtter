---
title: "Felkoder"
description: "Felsvarets form, de stabila koderna och vad du ska göra åt var och en."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 2607abe42460
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

## Ännu inte katalogiserat {#not-yet-cataloged}

Koderna som utlöses av enskilda funktioner (till exempel kryptering, OIDC, SCIM och team) beskrivs inte på den här sidan ännu. Varje kod är stabil. Behandla en ej listad kod som ogenomskinlig och hantera den utifrån dess status.
