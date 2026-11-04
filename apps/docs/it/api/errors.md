---
title: "Codici di errore"
description: "La struttura del corpo dell'errore, i codici stabili e cosa fare per ciascuno."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 56ec542dc5fe
i18n_hash_version: 2
---

# Codici di errore {#error-codes}

Ogni risposta di errore JSON ha la stessa struttura:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Campo | Sempre presente | Significato |
|-------|-----------------|-------------|
| `error` | Sì | Un messaggio leggibile. Può essere mostrato agli utenti. Non lo analizzi (parsing). |
| `code` | Sì | Un codice stabile, leggibile da una macchina. Basi la logica di diramazione su questo. |
| `requestId` | Sì | L'ID che il server assegna a questa richiesta. Lo citi quando segnala un problema: corrisponde al log del server. |
| `details` | A volte | Ulteriore contesto per alcuni errori 4xx, ad esempio il messaggio di validazione. |

I messaggi possono cambiare da una versione all'altra. I codici no, quindi scriva la logica del client sulla base di `code`.

## Codici derivati dallo stato HTTP {#status-codes}

Quando una route non imposta un proprio codice, il server ne ricava uno dallo stato:

| Stato HTTP | `code` |
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

Qualsiasi altro 4xx ricade su `BAD_REQUEST` e qualsiasi altro 5xx su `INTERNAL_ERROR`.

Una route può impostare un codice più specifico, e in tal caso la risposta riporta quel codice. Ad esempio, uno strumento che non può essere eseguito perché manca il suo bundle AI restituisce un codice specifico della funzionalità. Questi codici sono descritti insieme alla funzionalità che li genera.

## Autenticazione e accesso {#auth-codes}

| `code` | Stato | Cosa fare |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Invii `Authorization: Bearer <token>` con un token di sessione o una chiave API (`si_...`). |
| `FORBIDDEN` | 403 | Le credenziali sono valide ma mancano del permesso richiesto. Chieda il permesso a un amministratore. |
| `MUST_CHANGE_PASSWORD` | 403 | L'account deve cambiare la password prima di poter chiamare altri endpoint. Chiami `POST /api/auth/change-password` con il token di sessione, quindi riprovi. |
| `USER_DISABLED` | 403 | L'account è disabilitato. Un amministratore deve riabilitarlo. |
| `LOGIN_THROTTLED` | 429 | Troppi tentativi di accesso falliti. Attenda prima di riprovare. |
| `VALIDATION_ERROR` | 400 | Il corpo o i parametri della richiesta non hanno superato la validazione. `details` indica il problema. |

L'account amministratore del primo avvio è `admin` con la password `admin`, a meno che `DEFAULT_USERNAME` o `DEFAULT_PASSWORD` non l'abbiano modificata. Se `SKIP_MUST_CHANGE_PASSWORD` non è impostato, questo account riceve `MUST_CHANGE_PASSWORD` a ogni chiamata finché la password non viene cambiata.

## Job {#job-codes}

Un job che fallisce riporta il motivo nel job stesso, non nell'errore HTTP. Legga `error.code` e `error.message` da `GET /api/v1/jobs/{jobId}`. Vedere [Monitoraggio dell'avanzamento](/it/api/rest#progress-tracking).

## Non ancora catalogati {#not-yet-cataloged}

I codici generati dalle singole funzionalità (ad esempio crittografia, OIDC, SCIM e team) non sono ancora descritti in questa pagina. Ciascuno è un codice stabile; tratti un codice non elencato come opaco e lo gestisca in base al suo stato.
