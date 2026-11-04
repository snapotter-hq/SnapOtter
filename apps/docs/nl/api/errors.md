---
title: "Foutcodes"
description: "De structuur van de foutbody, de stabiele codes en wat u bij elke code kunt doen."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 49011c6c76b3
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

## Nog niet gecatalogiseerd {#not-yet-cataloged}

De codes die door afzonderlijke functies worden gegeven (bijvoorbeeld versleuteling, OIDC, SCIM en teams) worden op deze pagina nog niet beschreven. Elke code is stabiel; behandel een niet-vermelde code als ondoorzichtig en handel op basis van de status.
