---
description: "Configura il Single Sign-On con OpenID Connect. Guide passo passo per Keycloak, Authentik, Google e altri provider OIDC."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: 7784e9aeafd3
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter supporta OpenID Connect (OIDC) per il single sign-on. Gli utenti possono accedere con un provider di identità esterno come Keycloak, Authentik o Google invece dell'autenticazione locale con username/password (o in aggiunta a essa).

::: tip Vedi anche
[SAML SSO](/it/guide/saml) | [Provisioning SCIM](/it/guide/scim) | [Utenti, ruoli e permessi](/it/guide/users-roles)
:::

## Avvio rapido {#quick-start}

Aggiungi queste variabili d'ambiente al tuo `docker-compose.yml`:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

L'URI di reindirizzamento per il tuo provider è sempre:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Ad esempio, se `EXTERNAL_URL` è `https://photos.example.com`, configura l'URI di reindirizzamento del tuo provider come `https://photos.example.com/api/auth/oidc/callback`.

## Riferimento della configurazione {#configuration-reference}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `OIDC_ENABLED` | `false` | Abilita il login OIDC. Un pulsante "Accedi con SSO" appare nella pagina di login. |
| `OIDC_ISSUER_URL` | | URL dell'issuer del provider. Deve supportare OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | Client ID OAuth registrato presso il tuo provider. |
| `OIDC_CLIENT_SECRET` | | Client secret OAuth. |
| `OIDC_SCOPES` | `openid profile email` | Elenco di scope da richiedere, separati da spazi. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Crea automaticamente un account utente locale al primo login OIDC. |
| `OIDC_DEFAULT_ROLE` | `user` | Ruolo assegnato agli utenti OIDC creati automaticamente. Uno tra `admin`, `editor` o `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Collega un'identità OIDC a un utente locale esistente se l'indirizzo email corrisponde. |
| `OIDC_PROVIDER_NAME` | | Nome visualizzato mostrato sul pulsante di login (es. "Keycloak", "Google"). Se vuoto, il pulsante riporta "SSO". |
| `OIDC_CLOCK_TOLERANCE` | `30` | Tolleranza dello scarto dell'orologio in secondi per la validazione dei token. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | Claim del token ID usato come username per i nuovi account. |
| `EXTERNAL_URL` | | L'URL pubblico su cui SnapOtter è raggiungibile. Richiesto affinché OIDC costruisca l'URI di reindirizzamento corretto. |
| `COOKIE_SECRET` | generato automaticamente | Segreto per firmare i cookie di sessione. Impostalo esplicitamente quando esegui più repliche. |

## Guide dei provider {#provider-guides}

### Keycloak {#keycloak}

1. Crea un nuovo realm (o usane uno esistente).
2. Vai su **Clients** e crea un nuovo client:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. Nella scheda **Settings** del client, imposta **Valid redirect URIs** sul tuo URL di callback (es. `https://photos.example.com/api/auth/oidc/callback`).
4. Copia il **Client secret** dalla scheda **Credentials**.
5. Imposta `OIDC_ISSUER_URL` su `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. Nell'interfaccia di amministrazione, vai su **Applications > Providers** e crea un nuovo **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: il tuo URL di callback
   - **Signing key**: seleziona una chiave esistente o creane una
2. Crea un'**Application** e collegala al provider.
3. Copia il **Client ID** e il **Client Secret** dalle impostazioni del provider.
4. Imposta `OIDC_ISSUER_URL` su `https://authentik.example.com/application/o/snapotter/` (la barra finale è importante).

### Google {#google}

1. Vai alla [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un progetto (o selezionane uno esistente).
3. Vai su **APIs & Services > OAuth consent screen** e configuralo.
4. Vai su **APIs & Services > Credentials** e crea un **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: il tuo URL di callback
5. Copia il **Client ID** e il **Client secret**.
6. Imposta `OIDC_ISSUER_URL` su `https://accounts.google.com`.
7. Imposta `OIDC_USERNAME_CLAIM` su `email` (Google non fornisce `preferred_username`).

## Provisioning degli utenti {#user-provisioning}

### Creazione automatica {#auto-create}

Quando `OIDC_AUTO_CREATE_USERS` è `true` (l'impostazione predefinita), un account utente locale viene creato la prima volta che qualcuno accede tramite OIDC. Lo username è tratto dal claim specificato da `OIDC_USERNAME_CLAIM`, e il ruolo è impostato su `OIDC_DEFAULT_ROLE`.

Se si verifica una collisione di username, viene aggiunto un suffisso numerico (es. `jane` diventa `jane_2`).

### Collegamento automatico {#auto-link}

Quando `OIDC_AUTO_LINK_USERS` è `true`, SnapOtter collega un'identità OIDC a un account locale esistente se gli indirizzi email corrispondono. Questo è utile quando hai account utente pre-creati e vuoi che inizino a usare l'SSO senza perdere i loro dati.

::: warning 
Abilita il collegamento automatico solo se ti fidi del tuo provider OIDC per la verifica degli indirizzi email. Un'email non verificata potrebbe consentire a qualcuno di impossessarsi dell'account di un altro utente.
:::

### Disattivazione del login locale {#disabling-local-login}

OIDC non disattiva il login locale con username/password. Entrambi i metodi restano disponibili. Gli amministratori possono comunque accedere con credenziali locali se il provider OIDC è irraggiungibile.

## Certificati autofirmati {#self-signed-certificates}

Se il tuo provider OIDC utilizza un certificato autofirmato o di una CA privata, monta il bundle della CA nel container e fai puntare `NODE_EXTRA_CA_CERTS` a esso:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
Non impostare `NODE_TLS_REJECT_UNAUTHORIZED=0`. Ciò disabilita tutta la verifica TLS ed è un rischio per la sicurezza.
:::

## Risoluzione dei problemi {#troubleshooting}

### Mancata corrispondenza dell'URI di reindirizzamento {#redirect-uri-mismatch}

L'errore più comune. Controlla queste differenze tra ciò che il tuo provider si aspetta e ciò che SnapOtter invia:

- `http` contro `https` - lo schema deve corrispondere esattamente
- Barra finale - alcuni provider sono rigorosi su questo
- Numero di porta - includi la porta se non è standard
- Percorso - deve essere `/api/auth/oidc/callback`

Ricontrolla `EXTERNAL_URL`. Deve corrispondere all'URL che gli utenti digitano nel browser.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

Il provider OIDC utilizza un certificato di cui Node.js non si fida. Vedi [Certificati autofirmati](#self-signed-certificates) qui sopra.

### Errori di scarto dell'orologio {#clock-skew-errors}

Se l'orologio del tuo server e quello del provider OIDC non sono sincronizzati, la validazione del token potrebbe fallire. Aumenta `OIDC_CLOCK_TOLERANCE` (il valore predefinito è 30 secondi). Una soluzione migliore è eseguire NTP su entrambe le macchine.

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter recupera il documento di discovery del provider all'avvio e durante il login. Controlla:

- La risoluzione DNS dall'interno del container Docker (`docker exec snapotter nslookup auth.example.com`)
- Le regole del firewall tra il container e il provider
- Il valore `OIDC_ISSUER_URL` - deve essere raggiungibile dal server, non solo dal tuo browser

### Claim mancanti {#missing-claims}

Se username o email sono vuoti dopo il login, il tuo provider potrebbe non restituire i claim attesi. Verifica:

- Gli scope configurati in `OIDC_SCOPES` includono `profile` e `email`
- Il provider è configurato per includere nel token ID il claim specificato in `OIDC_USERNAME_CLAIM`
- Alcuni provider richiedono una configurazione esplicita di mapper/scope per rilasciare i claim
