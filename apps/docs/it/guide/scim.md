---
description: "Configura il provisioning SCIM 2.0 per sincronizzare utenti e gruppi dal tuo provider di identità a SnapOtter. Copre Okta, Azure AD / Entra ID e integrazioni personalizzate."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 6322df68028d
---

# Provisioning SCIM {#scim-provisioning}

SnapOtter implementa SCIM 2.0 (System for Cross-domain Identity Management) per il provisioning automatizzato di utenti e gruppi. Il tuo provider di identità può creare, aggiornare, disattivare e riattivare gli account utente e sincronizzare automaticamente le appartenenze ai gruppi.

::: tip Funzionalità enterprise
Il provisioning SCIM richiede una licenza **enterprise** con la funzionalità `scim`. Non è disponibile nel piano team. Senza questa funzionalità, tutti gli endpoint SCIM (tranne discovery) restituiscono 403.
:::

## Prerequisiti {#prerequisites}

- Un'istanza SnapOtter in esecuzione raggiungibile a un URL pubblico
- Una chiave di licenza enterprise con la funzionalità `scim`
- Accesso admin a SnapOtter (è richiesto il permesso `users:manage` per generare o revocare un token SCIM)
- Accesso admin alle impostazioni di provisioning del tuo provider di identità

## Avvio rapido {#quick-start}

1. Genera un token bearer SCIM:

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

La risposta contiene il token. Salvalo subito; non può essere recuperato di nuovo.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. Nel tuo provider di identità, configura il provisioning SCIM con:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Autenticazione**: token bearer (incolla il token dal passaggio 1)

## Autenticazione {#authentication}

Gli endpoint SCIM usano un token bearer dedicato, separato dalle sessioni utente e dalle chiavi API.

### Generare un token {#generating-a-token}

`POST /api/v1/enterprise/scim/token` genera un nuovo token SCIM. Questo endpoint richiede una sessione valida con il permesso `users:manage`.

Il token viene restituito in chiaro esattamente una volta. SnapOtter memorizza solo un hash scrypt. Se perdi il token, revocalo e generane uno nuovo.

È attivo un solo token SCIM alla volta. La generazione di un nuovo token sostituisce quello precedente.

### Revocare un token {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` revoca il token SCIM corrente. Anche questo endpoint richiede `users:manage`.

### Limitazione della frequenza {#rate-limiting}

Gli endpoint SCIM hanno un limite di 1000 richieste al minuto per token. Il superamento di questo limite restituisce HTTP 429.

## Risorse supportate {#supported-resources}

| Risorsa SCIM | Concetto SnapOtter | Crea | Leggi | Aggiorna | Elimina |
|---|---|---|---|---|---|
| User | Account utente | Sì | Sì | Sì | Soft delete |
| Group | Team | Sì | Sì | Sì | Sì |

::: warning 
I gruppi SCIM corrispondono ai **team** di SnapOtter, non ai ruoli. SCIM non può impostare il ruolo di un utente. A tutti gli utenti creati tramite SCIM viene assegnato il ruolo `user`. Per cambiare il ruolo di un utente, usa la UI di amministrazione di SnapOtter.
:::

## Operazioni sugli utenti {#user-operations}

### Creare un utente {#create-user}

`POST /api/v1/scim/v2/Users`

Crea un nuovo account utente con `authProvider` impostato su `scim` e il ruolo `user`. L'utente viene assegnato al team Default. Se `active` è `false`, il ruolo viene invece impostato su `disabled`.

Attributi obbligatori: `userName`. Facoltativi: `externalId`, `emails`, `active` (predefinito `true`).

### Elencare e filtrare gli utenti {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Restituisce un elenco paginato di utenti. Supporta i parametri di query `startIndex` e `count` (massimo 200 risultati per pagina).

Il filtraggio supporta solo `eq` (uguale a), su questi attributi:

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Altri operatori di filtro e attributi restituiscono HTTP 400.

### Ottenere un utente {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Restituisce un singolo utente in base al suo ID utente SnapOtter.

### Sostituire un utente {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Sostituisce gli attributi dell'utente. Supporta `userName`, `externalId`, `emails` e `active`. Le modifiche allo username vengono controllate per conflitti (409 se il nuovo username è già usato da un altro utente).

### Applicare una patch a un utente {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Aggiornamento parziale con SCIM PatchOp. Operazioni supportate:

| Operazione | Percorsi |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Come `replace` |
| `remove` | `externalId`, `emails` |

I percorsi `name.formatted` e `displayName` sono accettati per compatibilità ma non hanno alcun effetto persistente (SnapOtter non memorizza un nome visualizzato separato).

Sono supportate anche le operazioni `replace` senza valore (dove il valore è un oggetto senza `path`), con le chiavi `userName`, `externalId`, `emails` e `active`.

### Disattivare un utente (soft delete) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter non elimina definitivamente gli utenti tramite SCIM. DELETE esegue invece una disattivazione soft:

1. Il ruolo dell'utente viene cambiato dal valore corrente (es. `editor`) a `disabled:editor`, preservando il ruolo originale.
2. La password dell'utente viene cancellata.
3. Tutte le sessioni attive vengono revocate.
4. Tutte le chiavi API vengono revocate.

L'utente non può più accedere né usare alcuna chiave API. I suoi dati (file, cronologia) vengono conservati.

### Riattivare un utente {#reactivate-user}

Per riattivare un utente precedentemente disattivato, invia una richiesta `PUT` o `PATCH` con `active: true`. SnapOtter ripristina il ruolo originale precedente alla disattivazione (es. `disabled:editor` torna a essere `editor`). Se non è possibile determinare il ruolo originale, viene usato come ripiego `user`.

::: details Esempio: disattivare e riattivare tramite PATCH
```json
// Deactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": false }
  ]
}

// Reactivate
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    { "op": "replace", "path": "active", "value": true }
  ]
}
```
:::

## Operazioni sui gruppi {#group-operations}

I gruppi SCIM corrispondono ai team di SnapOtter. La creazione di un gruppo crea un team. L'appartenenza al gruppo controlla a quale team appartiene un utente.

### Creare un gruppo {#create-group}

`POST /api/v1/scim/v2/Groups`

Obbligatorio: `displayName`. Facoltativo: `members` (array di `{ value: userId }`).

### Elencare e filtrare i gruppi {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Il filtraggio supporta solo `displayName eq "..."`. Paginato con `startIndex` e `count` (massimo 200 risultati per pagina).

### Ottenere un gruppo {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Sostituire un gruppo {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Sostituisce il nome del gruppo e l'intero elenco di appartenenze. I membri esistenti non presenti nel nuovo elenco vengono spostati nel team Default.

### Applicare una patch a un gruppo {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Supporta queste operazioni:

| Operazione | Percorso | Effetto |
|---|---|---|
| `add` | `members` | Aggiunge utenti al team |
| `remove` | `members[value eq "userId"]` | Sposta l'utente nel team Default |
| `replace` | `displayName` | Rinomina il team |
| `replace` | `members` | Sostituisce tutti i membri (i membri rimossi passano al team Default) |

### Eliminare un gruppo {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Elimina il team. Tutti i membri del team eliminato vengono spostati nel team Default. Gli utenti non vengono disattivati né eliminati.

## Configurazione dell'IdP {#idp-setup}

### Okta {#okta}

1. Nella console di amministrazione di Okta, apri la tua applicazione SnapOtter (o creane una).
2. Vai alla scheda **Provisioning** e fai clic su **Configure API Integration**.
3. Seleziona **Enable API Integration** e inserisci:
   - **Base URL**: `https://photos.example.com/api/v1/scim/v2`
   - **API Token**: il token bearer SCIM generato in precedenza
4. Fai clic su **Test API Credentials**, poi su **Save**.
5. In **Provisioning > To App**, abilita:
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. In **Push Groups**, configura quali gruppi Okta sincronizzare come team SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Nel portale Azure, vai alla tua applicazione enterprise SnapOtter.
2. Vai su **Provisioning** e imposta **Provisioning Mode** su **Automatic**.
3. In **Admin Credentials**, inserisci:
   - **Tenant URL**: `https://photos.example.com/api/v1/scim/v2`
   - **Secret Token**: il token bearer SCIM generato in precedenza
4. Fai clic su **Test Connection**, poi su **Save**.
5. In **Mappings**, configura i mapping degli attributi di utenti e gruppi. I valori predefiniti di solito funzionano, ma verifica che `userName` mappi su `userPrincipalName` o `mail` come desiderato.
6. Imposta **Provisioning Status** su **On** e salva.

Azure esegue il provisioning di utenti e gruppi su un ciclo di sincronizzazione fisso (in genere ogni 40 minuti).

## Endpoint di discovery {#discovery-endpoints}

Questi tre endpoint sono disponibili senza autenticazione e descrivono le capacità del server SCIM:

| Endpoint | Descrizione |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Capacità del server e funzionalità supportate |
| `GET /api/v1/scim/v2/Schemas` | Definizioni degli schemi User e Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Tipi di risorse disponibili (User, Group) |

Il `ServiceProviderConfig` pubblicizza queste capacità:

| Funzionalità | Supportata |
|---|---|
| Patch | Sì |
| Bulk | No |
| Filter | Sì (max 200 risultati, solo operatore `eq`) |
| Change password | No |
| Sort | No |
| ETag | No |

## Limitazioni {#limitations}

- **Filtraggio**: è supportato solo l'operatore `eq`. Filtri complessi, operatori `and`/`or`, `co` (contains) e `sw` (starts with) non sono implementati.
- **Operazioni bulk**: non supportate.
- **Sort ed ETag**: non supportati.
- **Ruoli**: SCIM non può assegnare ruoli SnapOtter. A tutti gli utenti provisionati viene assegnato il ruolo `user`.
- **MAX_USERS**: il limite della variabile d'ambiente `MAX_USERS` non viene applicato alla creazione di utenti via SCIM. Se devi limitare il numero di utenti, gestisci le assegnazioni nel tuo IdP.
- **Un solo token**: può essere attivo un solo token SCIM alla volta. Se più IdP necessitano dell'accesso SCIM, devono condividere il token.
- **I gruppi sono team**: i gruppi SCIM corrispondono ai team, non a ruoli o gruppi di permessi.

## Risoluzione dei problemi {#troubleshooting}

### 403 "SCIM provisioning requires an enterprise license with the scim feature" {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

La tua licenza non include la funzionalità `scim`, oppure non è configurata alcuna licenza. SCIM richiede una licenza con piano enterprise. Verifica che `SNAPOTTER_LICENSE_KEY` sia impostato e che la licenza includa la funzionalità `scim`.

### 401 "Bearer token required" {#_401-bearer-token-required}

La richiesta SCIM non includeva un header `Authorization: Bearer <token>`. Controlla la configurazione di provisioning del tuo IdP.

### 401 "Invalid token" {#_401-invalid-token}

Il token non corrisponde all'hash memorizzato. Questo accade se il token è stato revocato e rigenerato. Aggiorna il token nelle impostazioni di provisioning del tuo IdP.

### 401 "SCIM not configured" {#_401-scim-not-configured}

Non è ancora stato generato alcun token SCIM. Usa l'endpoint `POST /api/v1/enterprise/scim/token` per crearne uno.

### 409 "User already exists" / "userName already taken" {#_409-user-already-exists-username-already-taken}

Esiste già un utente con lo stesso username. Questo può accadere quando un IdP ritenta una creazione fallita. Controlla la presenza di username duplicati nel pannello di amministrazione di SnapOtter.

### 429 "SCIM rate limit exceeded" {#_429-scim-rate-limit-exceeded}

L'IdP sta inviando più di 1000 richieste al minuto. Questo accade tipicamente durante una grande sincronizzazione iniziale. La maggior parte degli IdP ritenta automaticamente al ripristino della finestra di rate limit. Se il problema persiste, controlla l'intervallo di sincronizzazione del provisioning del tuo IdP.

### Utenti deprovisionati ma non rimossi dalla UI {#users-deprovisioned-but-not-removed-from-the-ui}

SCIM DELETE è una disattivazione soft. Gli utenti disattivati compaiono ancora nell'elenco utenti admin con uno stato disabilitato. Questo è intenzionale, in modo da preservare i loro dati. Il loro ruolo appare come `disabled:<original-role>`.
