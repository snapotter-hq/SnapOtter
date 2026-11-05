---
title: "Codici di errore"
description: "La struttura del corpo dell'errore, i codici stabili e cosa fare per ciascuno."
i18n_source_hash: ed6e0590a6fd
i18n_provenance: machine
i18n_output_hash: 504ada76834b
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
| `MUST_CHANGE_PASSWORD` | 403 | L'account deve cambiare la password prima di poter chiamare altri endpoint. Chiami `POST /api/auth/change-password` con il token di sessione, poi riprovi. |
| `USER_DISABLED` | 403 | L'account è disabilitato. Un amministratore deve riabilitarlo. |
| `LOGIN_THROTTLED` | 429 | Troppi tentativi di accesso falliti. Attenda prima di riprovare. |
| `VALIDATION_ERROR` | 400 | Il corpo o i parametri della richiesta non hanno superato la validazione. `details` indica il problema. |

L'account amministratore del primo avvio è `admin` con la password `admin`, a meno che `DEFAULT_USERNAME` o `DEFAULT_PASSWORD` non l'abbiano modificata. A meno che `SKIP_MUST_CHANGE_PASSWORD` non sia impostato, quell'account riceve `MUST_CHANGE_PASSWORD` a ogni chiamata finché la password non viene cambiata.

## Job {#job-codes}

Un job che fallisce riporta il motivo sul job stesso, non nell'errore HTTP. Legga `error.code` e `error.message` da `GET /api/v1/jobs/{jobId}`. Vedere [Monitoraggio dell'avanzamento](/it/api/rest#progress-tracking).

Un job fallito mantiene `error.code` solo quando il fallimento è un errore di input o un guasto del server. Gli altri fallimenti riportano solo il messaggio.

| `code` | Significato | Cosa fare |
|--------|---------|------------|
| `CANCELED` | Il job è stato annullato da un utente. Non è uno stato HTTP. Gli eventi di avanzamento riportano `phase: failed` con questo codice. | Lo tratti come un annullamento dell'utente. Non lo riprovi automaticamente. |
| `INPUT_MISSING` | L'input è stato rimosso prima dell'esecuzione del job. | Carichi di nuovo il file. |
| `ENGINE_UNAVAILABLE` | Un motore necessario non ha potuto avviarsi sul server. | Riprovi dopo che un amministratore ha riparato l'installazione. |

## Autenticazione e MFA {#mfa-codes}

| `code` | Stato | Significato | Cosa fare |
|--------|--------|---------|------------|
| `MFA_ENROLLMENT_REQUIRED` | 403 | La policy MFA richiede la registrazione, e questa istanza non può registrare l'utente (nessuna licenza enterprise). Le istanze con licenza restituiscono 200 con `requiresMfaEnrollment: true` e guidano invece l'utente nella registrazione. | Non riprovi. Un amministratore deve cambiare la policy o usare la CLI di ripristino offline. |
| `MFA_POLICY_UNAVAILABLE` | 503 | Il server non ha potuto leggere la policy MFA durante l'accesso. | Riprovi l'accesso a breve. |
| `INVALID_CODE` | 401 | Il codice TOTP o di ripristino è errato. | Chieda all'utente un nuovo codice e riprovi. I fallimenti ripetuti terminano con `MFA_ATTEMPTS_EXHAUSTED`. |
| `MFA_ATTEMPTS_EXHAUSTED` | 401 | Troppi codici errati. La sfida viene scartata. | Avvii di nuovo l'accesso per ottenere una nuova sfida. |
| `MFA_EXPIRED` | 401 | La sfida MFA o di registrazione è scaduta o non corrisponde. | Avvii di nuovo l'accesso. |
| `MFA_NOT_CONFIGURED` | 401 | L'account non ha un segreto TOTP, quindi non è possibile verificare un codice. | Registri l'MFA prima di accedere con un codice. |
| `MFA_ALREADY_ENABLED` | 409 | L'MFA è già attiva sull'account. | Non effettui di nuovo la registrazione. |
| `NO_PENDING_ENROLLMENT` | 400 | È arrivata una conferma di registrazione senza alcuna registrazione in sospeso. | Chiami prima l'endpoint di registrazione. |
| `MFA_NOT_ENABLED` | 400 | L'azione richiede che l'MFA sia attiva, ma per questo utente è disattivata. | Salti l'azione oppure attivi prima l'MFA. |
| `MFA_DECRYPTION_FAILED` | 500 | Il segreto TOTP memorizzato non può essere decifrato. | Azione dell'operatore. Di solito significa che la chiave di cifratura è cambiata. Verifichi `DATA_ENCRYPTION_KEY` e `DATA_ENCRYPTION_KEY_PREVIOUS`. |
| `DECRYPTION_FAILED` | 500 | Un valore memorizzato (un'impostazione, un'intestazione di autenticazione di un webhook o un segreto TOTP) non può essere decifrato. | Azione dell'operatore, come sopra. Non riprovi. |
| `IDLE_TIMEOUT` | 401 | La sessione è scaduta dopo un periodo di inattività. | Acceda di nuovo. |
| `INVALID_PASSWORD` | 401 | La password attuale è errata durante un cambio di password. | Chieda all'utente la password attuale. |
| `PASSWORD_CHANGED` | 409 | La password è stata cambiata in un'altra sessione, oppure un amministratore l'ha reimpostata, mentre questa richiesta era in corso. | Acceda di nuovo. |
| `OIDC_NO_PASSWORD` | 400 | È stato richiesto un cambio o una reimpostazione della password per un account creato tramite SSO. | Indirizzi l'utente al provider di identità. |

## OIDC {#oidc-codes}

I fallimenti OIDC durante l'accesso non restituiscono un corpo JSON. La route di login reindirizza alla pagina di accesso con un motivo generico, e il log di audit registra il codice. La route di logout termina comunque la sessione locale quando il provider di identità non è raggiungibile.

| `code` | Stato | Significato | Cosa fare |
|--------|--------|---------|------------|
| `OIDC_ISSUER_SCHEME_MISMATCH` | Nessuno (reindirizzamento) | L'URL dell'issuer è `http`, ma `EXTERNAL_URL` è `https`, quindi il client rifiuta il discovery. | Amministratore: esponga l'issuer tramite `https`, oppure esegua l'istanza tramite `http`. |
| `OIDC_DISCOVERY_TIMEOUT` | Nessuno (reindirizzamento) | Il discovery dell'issuer è andato in timeout. | Verifichi che il server possa raggiungere l'issuer, poi riprovi. |
| `OIDC_DISCOVERY_FAILED` | Nessuno (reindirizzamento) | Il discovery è fallito per un altro motivo. | Verifichi l'URL dell'issuer e l'accesso in uscita del server. |
| `OIDC_END_SESSION_INVALID` | Nessuno (il logout prosegue) | Il valore `end_session_endpoint` del provider di identità non è un URL valido. La sessione locale viene comunque cancellata. | Amministratore: corregga i metadati del provider. |
| `OIDC_END_SESSION_SCHEME` | Nessuno (il logout prosegue) | Il valore `end_session_endpoint` usa uno schema che il server non consente. La sessione locale viene comunque cancellata. | Amministratore: corregga i metadati del provider. |

## SAML {#saml-codes}

I fallimenti SAML non impostano un `code`. Un'asserzione fallita reindirizza alla pagina di accesso con `saml_auth_failed`, e l'evento di audit `SAML_LOGIN_FAILED` registra il motivo.

## SCIM {#scim-codes}

Le route SCIM rispondono con l'envelope di errore RFC 7644 (`schemas`, `detail`, `status` e talvolta `scimType`). Non impostano `code`. Basi la logica sullo stato HTTP.

## Team, ruoli e utenti {#team-role-codes}

I nomi duplicati di team o ruoli restituiscono il generico `CONFLICT`, e un team o un ruolo mancante restituisce `NOT_FOUND`.

| `code` | Stato | Significato | Cosa fare |
|--------|--------|---------|------------|
| `ESCALATION_DENIED` | 403 | Il ruolo del chiamante non consente la modifica. Il bersaglio ha un'autorità superiore a quella del chiamante, il ruolo è integrato, oppure la richiesta concede permessi che il chiamante non possiede. | Non riprovi. Chieda a un utente con maggiore autorità. |
| `UNKNOWN_ROLE` | 400 | L'ID del ruolo non corrisponde a nessun ruolo esistente. | Corregga l'ID del ruolo. Elenchi i ruoli per trovarlo. |
| `UNKNOWN_TEAM` | 400 | L'ID del team non corrisponde a nessun team esistente. | Corregga l'ID del team. |
| `SELF_DEMOTE` | 400 | Un amministratore ha provato a rimuovere il proprio ruolo di amministratore. | Faccia eseguire la modifica a un altro amministratore. |
| `SELF_DELETE` | 400 | Un amministratore ha provato a eliminare il proprio account. | Lo faccia eliminare a un altro amministratore. |
| `LAST_ADMIN` | 400 sulle route utente, 409 sulle route di eliminazione GDPR | La modifica non lascerebbe alcun amministratore, oppure eliminerebbe un team che include tutti gli amministratori. | Renda prima amministratore un altro utente. |
| `USER_LIMIT_REACHED` | 403 | L'istanza ha raggiunto il limite `MAX_USERS`. | Rimuova un utente oppure aumenti `MAX_USERS`. |

## Funzionalità e bundle AI {#feature-codes}

Gli strumenti, le esecuzioni batch e le pipeline che richiedono un bundle AI opzionale usano questi codici.

| `code` | Stato | Significato | Cosa fare |
|--------|--------|---------|------------|
| `FEATURE_NOT_INSTALLED` | 501 | Lo strumento, o un passaggio di una pipeline o di un batch, richiede un bundle che non è installato. Il corpo include `feature` (l'ID del bundle) e `featureName`. | Installi il bundle nelle Impostazioni, poi riprovi. |
| `FEATURE_INCOMPATIBLE` | 501 | La funzionalità installata non può gestire la qualità o la lingua richiesta. | Cambi l'impostazione oppure installi un bundle che la supporti. |
| `ENGINE_UNAVAILABLE` | 503 | Un motore necessario non ha potuto avviarsi, oppure un runtime OCR è stato rimosso dopo la validazione della richiesta. | Riprovi dopo che un amministratore ha riparato o reinstallato la funzionalità. |
| `BROWSER_NOT_AVAILABLE` | 503 | Chromium non è installato, quindi HTML in immagine non può essere eseguito. | Chieda a un amministratore di installare il browser. |
| `BROWSER_CRASHED` | 503 | Il browser degli screenshot è andato in crash durante il rendering. | Riprovi la richiesta. |

## Strumenti {#tool-codes}

| `code` | Stato | Significato | Cosa fare |
|--------|--------|---------|------------|
| `INPUT_MISSING` | 410 | L'input caricato è stato rimosso prima dell'esecuzione del job. | Carichi di nuovo il file e invii il job. |
| `ANALYSIS_EXPIRED` | 410 | L'analisi della foto per documenti è scaduta prima della generazione. | Analizzi di nuovo la foto, poi generi. |
| `BACKGROUND_REMOVAL_EXPIRED` | 410 | Il risultato della rimozione dello sfondo è scaduto prima del passaggio successivo. | Rimuova di nuovo lo sfondo. |
| `NOT_ANIMATED` | 400 | Rimuovi sfondo GIF ha ricevuto un'immagine statica. | Usi Rimuovi sfondo per le immagini statiche. |
| `TOO_MANY_FRAMES` | 400 | L'animazione ha più fotogrammi di quanti il server ne consenta (`GIF_BG_MAX_FRAMES`). | Invii un'animazione più breve, oppure chieda a un amministratore di aumentare il limite. |

## File {#file-codes}

| `code` | Stato | Significato | Cosa fare |
|--------|--------|---------|------------|
| `STORAGE_QUOTA_EXCEEDED` | 413 | Il salvataggio in File supererebbe la quota di spazio dell'utente. | Elimini dei file oppure chieda più spazio a un amministratore. |
| `INVALID_STORED_NAME` | 400 | Il server ha rifiutato il nome di un file memorizzato. | Carichi di nuovo il file. |

## Pipeline e batch {#pipeline-codes}

Le richieste di pipeline e batch restituiscono i codici di funzionalità indicati sopra per ogni passaggio che richiede un bundle. Un ID di job già in uso restituisce `CONFLICT` con stato 409. Invii un nuovo ID di job.

## Impostazioni {#settings-codes}

| `code` | Stato | Significato | Cosa fare |
|--------|--------|---------|------------|
| `UNKNOWN_SETTING` | 400 | La chiave non corrisponde a nessuna impostazione nota. | Verifichi il nome della chiave. |
| `READONLY_SETTING` | 400 | L'impostazione non può essere modificata tramite l'API. | La modifichi tramite l'ambiente o l'interfaccia di amministrazione. |
| `DEPENDENCY_VALIDATION_FAILED` | 400 | Il nuovo valore è in conflitto con altre impostazioni. Il corpo indica l'impostazione in `setting` ed elenca i problemi in `validationErrors`. | Corregga le impostazioni elencate, poi riprovi. |
| `SETTING_DECRYPTION_FAILED` | 500 | Un'impostazione memorizzata non può essere decifrata. | Azione dell'operatore, come per `DECRYPTION_FAILED`. |

Per `VALIDATION_ERROR` su un'impostazione, `details` contiene i problemi dello schema.

## Enterprise {#enterprise-codes}

| `code` | Stato | Significato | Cosa fare |
|--------|--------|---------|------------|
| `FEATURE_NOT_LICENSED` | 403 | L'impostazione o la policy richiede una licenza enterprise, ad esempio l'applicazione obbligatoria dell'SSO o la policy MFA. | Usi un'istanza con licenza oppure lasci l'impostazione disattivata. |
| `IP_NOT_ALLOWED` | 403 | L'indirizzo IP della richiesta non è nella allowlist. | Si connetta da una rete consentita. |
| `INVALID_CIDR` | 400 | Una voce della allowlist non è un CIDR valido. Il messaggio elenca le voci errate. | Corregga le voci e salvi di nuovo. |
| `SELF_LOCKOUT` | 400 | Il salvataggio della allowlist bloccherebbe l'IP attuale del chiamante. | Aggiunga prima il proprio IP attuale all'elenco. |

Le route di eliminazione GDPR restituiscono un semplice `CONFLICT` con stato 409 quando un utente o un team è sotto blocco legale.

## Codici che i client non ricevono {#internal-codes}

Questi codici esistono nel sorgente del server per i log, la telemetria o gli errori propri di Fastify. Un client non li riceve nel corpo di una risposta né nella riga di un job, quindi non scriva logica del client basata su di essi.

| `code` | Dove finisce |
|--------|---------------|
| `ALERT_DECRYPTION_FAILED` | Segnalato al tracciamento degli errori dal valutatore degli avvisi. L'intestazione di autenticazione di un webhook di avviso non può essere decifrata. |
| `SIEM_DECRYPTION_FAILED` | Segnalato al tracciamento degli errori dall'inoltro SIEM. L'intestazione di autenticazione del SIEM non può essere decifrata. |
| `WEBHOOK_DECRYPTION_FAILED` | Segnalato al tracciamento degli errori. La richiesta che ha incontrato lo stesso fallimento risponde con `DECRYPTION_FAILED`. |
| `STAGED_DISCARD_FAILED` | Segnalato al tracciamento degli errori quando un upload in staging non può essere rimosso. |
| `USERNAME_RACE_EXHAUSTED` | Generato quando la creazione automatica SSO perde la corsa per il nome utente a ogni tentativo. La pagina di accesso mostra invece un errore. |
| `ERR_OUT_OF_RANGE` | Generato dal lettore dell'object storage per un intervallo di byte non valido. |
| `ETIMEDOUT` | Impostato sull'errore di timeout di un'esportazione GDPR. L'esportazione fallisce e può essere richiesta di nuovo. |
| `FST_REQ_FILE_TOO_LARGE` | Il codice di Fastify per un upload oltre il limite. I client ricevono un 413 con `PAYLOAD_TOO_LARGE`, oppure il messaggio 413 proprio della route. |
| `TARGET_SIZE_EXCEEDED` | Generato quando una compressione con dimensione obiettivo non raggiunge il proprio obiettivo. L'errore non ha stato né codice, quindi i client ricevono un fallimento generico. |
