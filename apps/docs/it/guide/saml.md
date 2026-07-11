---
description: "Configura il Single Sign-On SAML 2.0 per SnapOtter. Guide passo passo per Okta, Azure AD / Entra ID, Google Workspace e altri provider di identità SAML."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 0f4f45cf66f7
---

# SAML SSO {#saml-sso}

SnapOtter supporta SAML 2.0 per il single sign-on. Gli utenti possono accedere tramite un provider di identità esterno (Okta, Azure AD / Entra ID, Google Workspace o qualsiasi IdP SAML 2.0 standard) invece dell'autenticazione locale con username/password.

::: tip Funzionalità enterprise
SAML SSO richiede una licenza **team** o **enterprise** con la funzionalità `saml_sso`. Se `SAML_ENABLED=true` è impostato senza una licenza valida, le route SAML vengono ignorate silenziosamente e viene registrato un avviso.
:::

## Prerequisiti {#prerequisites}

- Un'istanza di SnapOtter in esecuzione, raggiungibile a un URL pubblico
- `EXTERNAL_URL` impostato su quell'URL pubblico (es. `https://photos.example.com`)
- Una chiave di licenza team o enterprise con la funzionalità `saml_sso`
- Accesso amministrativo al tuo provider di identità SAML

## Avvio rapido {#quick-start}

Aggiungi queste variabili d'ambiente al tuo `docker-compose.yml`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

Riavvia il container. Un pulsante "Accedi con SAML" (o l'etichetta impostata da `SAML_PROVIDER_NAME`) appare nella pagina di login.

## Riferimento della configurazione {#configuration-reference}

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `SAML_ENABLED` | `false` | Abilita il login SAML. |
| `SAML_IDP_SSO_URL` | | URL dell'endpoint SSO dell'IdP. **Obbligatorio** quando SAML è abilitato. |
| `SAML_IDP_CERTIFICATE` | | Certificato di firma X.509 dell'IdP in formato PEM (il testo del certificato stesso, non un percorso di file). **Obbligatorio** quando SAML è abilitato. |
| `EXTERNAL_URL` | | L'URL pubblico su cui SnapOtter è raggiungibile. **Obbligatorio** quando SAML è abilitato. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI inviato all'IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL dell'Assertion Consumer Service (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Crea automaticamente un account utente locale al primo login SAML. |
| `SAML_AUTO_LINK_USERS` | `false` | Collega un'identità SAML a un utente locale esistente se l'indirizzo email corrisponde. |
| `SAML_DEFAULT_ROLE` | `user` | Ruolo assegnato agli utenti SAML creati automaticamente. Uno tra `admin`, `editor` o `user`. |
| `SAML_PROVIDER_NAME` | | Etichetta visualizzata per il pulsante di login SAML sul frontend (es. "Okta", "Azure AD"). Se vuoto, il pulsante riporta "SAML". |
| `SAML_USERNAME_ATTRIBUTE` | | Attributo dell'asserzione SAML usato come username. Se vuoto, ricade sulla parte locale dell'email, poi sul NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Attributo dell'asserzione SAML usato come indirizzo email dell'utente. |

Il server rifiuta di avviarsi se `SAML_ENABLED=true` e una qualsiasi delle tre variabili obbligatorie (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) manca.

::: details Note sulla sicurezza
Sia `wantAuthnResponseSigned` che `wantAssertionsSigned` sono impostati in modo fisso su `true`. SnapOtter rifiuta le risposte SAML non firmate o firmate in modo improprio. Le asserzioni provenienti da un IdP attendibile sono trattate come email verificate.

È supportato solo il login avviato dall'SP. SnapOtter non supporta il login avviato dall'IdP (non sollecitato) né il Single Logout (SLO). La disconnessione da SnapOtter non disconnette l'utente dall'IdP.
:::

## Metadati e URL dell'SP {#sp-metadata-and-urls}

Il tuo IdP ha bisogno di tre valori da SnapOtter:

| Campo | Valore |
|---|---|
| **ACS URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Ad esempio, se `EXTERNAL_URL` è `https://photos.example.com`:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Endpoint dei metadati: `https://photos.example.com/api/auth/saml/metadata` (restituisce XML)

Alcuni IdP possono importare direttamente l'URL dei metadati dell'SP, che compila automaticamente l'ACS URL e l'Entity ID.

## Configurazione del provider {#provider-setup}

### Okta {#okta}

1. Nella console di amministrazione Okta, vai su **Applications > Create App Integration**.
2. Seleziona **SAML 2.0** e fai clic su **Next**.
3. Imposta un nome (es. "SnapOtter") e fai clic su **Next**.
4. Configura le impostazioni SAML:
   - **Single sign-on URL**: il tuo ACS URL (es. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: il tuo Entity ID (es. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. In **Attribute Statements**, aggiungi `email` mappato su `user.email`.
6. Fai clic su **Next**, poi su **Finish**.
7. Vai alla scheda **Sign On**, fai clic su **View SAML setup instructions** e copia:
   - **Identity Provider Single Sign-On URL** in `SAML_IDP_SSO_URL`
   - **X.509 Certificate** in `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Nel portale Azure, vai su **Microsoft Entra ID > Enterprise applications > New application**.
2. Fai clic su **Create your own application**, chiamala "SnapOtter" e seleziona **Integrate any other application you don't find in the gallery**.
3. Vai su **Single sign-on > SAML** e fai clic su **Edit** nella sezione **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: il tuo Entity ID (es. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: il tuo ACS URL (es. `https://photos.example.com/api/auth/saml/callback`)
4. In **SAML Certificates**, scarica il **Certificate (Base64)**.
5. In **Set up SnapOtter**, copia il **Login URL**.
6. Imposta `SAML_IDP_SSO_URL` sul Login URL e `SAML_IDP_CERTIFICATE` sul contenuto del certificato scaricato.
7. Assegna utenti o gruppi all'applicazione in **Users and groups**.

### Google Workspace {#google-workspace}

1. Nella console di amministrazione Google, vai su **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Chiama l'app "SnapOtter" e fai clic su **Continue**.
3. Nella pagina **Google Identity Provider details**, copia l'**SSO URL** e scarica il **Certificate**. Fai clic su **Continue**.
4. Configura i dettagli del Service Provider:
   - **ACS URL**: il tuo ACS URL (es. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: il tuo Entity ID (es. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Fai clic su **Continue**, poi su **Finish**.
6. Attiva l'app (**ON**) per le tue unità organizzative.
7. Imposta `SAML_IDP_SSO_URL` sull'SSO URL del passaggio 3 e `SAML_IDP_CERTIFICATE` sul contenuto del certificato scaricato.

### IdP SAML 2.0 generico {#generic-saml-2-0-idp}

Per qualsiasi provider di identità conforme a SAML 2.0:

1. Crea una nuova applicazione/service provider SAML nel tuo IdP.
2. Imposta l'**ACS URL** su `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Imposta l'**Entity ID** / **Audience** su `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Configura l'IdP per inviare l'email dell'utente in un attributo chiamato `email` (oppure imposta `SAML_EMAIL_ATTRIBUTE` per corrispondere al nome dell'attributo del tuo IdP).
5. Copia l'**IdP SSO URL** e il **certificato di firma** in `SAML_IDP_SSO_URL` e `SAML_IDP_CERTIFICATE`.

## Provisioning degli utenti {#user-provisioning}

### Creazione automatica {#auto-create}

Quando `SAML_AUTO_CREATE_USERS` è `true` (l'impostazione predefinita), un account utente locale viene creato la prima volta che qualcuno accede tramite SAML. Il ruolo è impostato su `SAML_DEFAULT_ROLE`.

Lo username è derivato in questo ordine:

1. Il valore dell'attributo dell'asserzione specificato da `SAML_USERNAME_ATTRIBUTE` (se impostato e presente)
2. La parte locale dell'indirizzo email (tutto ciò che precede `@`)
3. Il NameID SAML

Se si verifica una collisione di username, viene aggiunto un suffisso numerico (es. `jane` diventa `jane_2`).

### Collegamento automatico {#auto-link}

Quando `SAML_AUTO_LINK_USERS` è `true`, SnapOtter collega un'identità SAML a un account locale esistente se gli indirizzi email corrispondono. Questo è utile quando hai account utente pre-creati e vuoi che inizino a usare l'SSO senza perdere i loro dati.

::: warning 
Abilita il collegamento automatico solo se ti fidi del tuo IdP SAML per la verifica degli indirizzi email. Un'email non verificata da un IdP mal configurato potrebbe consentire a qualcuno di impossessarsi dell'account di un altro utente.
:::

### Mappatura degli attributi {#attribute-mapping}

| Campo SnapOtter | Origine | Configurazione |
|---|---|---|
| Email | Attributo dell'asserzione | `SAML_EMAIL_ATTRIBUTE` (predefinito: `email`) |
| Username | Attributo dell'asserzione, email o NameID | `SAML_USERNAME_ATTRIBUTE` (vedi l'ordine di derivazione sopra) |
| ID esterno | NameID | Sempre il NameID SAML, non configurabile |

## Applicazione dell'SSO {#sso-enforcement}

Se vuoi imporre a tutti gli utenti l'accesso tramite SAML (o OIDC) e bloccare il login locale con password, abilita l'applicazione dell'SSO:

1. Assicurati che la funzionalità enterprise `sso_enforcement` sia licenziata (disponibile nei piani team ed enterprise).
2. In **Admin Settings > Security**, attiva **SSO Enforcement**.
3. Imposta un **break-glass username**: questo è l'unico account locale che può ancora accedere con una password, per l'accesso di emergenza se l'IdP è irraggiungibile.

Quando l'applicazione dell'SSO è attiva, qualsiasi tentativo di login locale (tranne quello dell'utente break-glass) restituisce un errore 403 con il messaggio "Local password login is disabled. Please use SSO."

::: tip 
Configura sempre un break-glass username prima di abilitare l'applicazione dell'SSO. Senza di esso, potresti restare bloccato fuori da SnapOtter se il tuo IdP smette di funzionare.
:::

## Uso di SAML insieme a OIDC {#using-saml-alongside-oidc}

SAML e OIDC possono essere abilitati contemporaneamente. Quando entrambi sono attivi, la pagina di login mostra pulsanti separati per ciascun provider (etichettati da `SAML_PROVIDER_NAME` e `OIDC_PROVIDER_NAME`). Gli utenti possono accedere con l'uno o l'altro metodo.

Entrambi i provider condividono le stesse impostazioni di creazione automatica, collegamento automatico e applicazione dell'SSO in modo indipendente: ciascuno ha le proprie variabili `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` e `*_DEFAULT_ROLE`.

## Risoluzione dei problemi {#troubleshooting}

### Validazione dell'asserzione non riuscita {#assertion-validation-failed}

Non è stato possibile verificare la firma della risposta SAML o dell'asserzione. Controlla:

- Il certificato in `SAML_IDP_CERTIFICATE` corrisponde al certificato di firma corrente nel tuo IdP (i certificati vengono ruotati, quindi controlla la scadenza)
- Il certificato è in formato PEM (inizia con `-----BEGIN CERTIFICATE-----`)
- Il certificato è il testo completo, non un percorso di file
- L'ACS URL e l'Entity ID configurati nel tuo IdP corrispondono esattamente ai valori di SnapOtter (schema, host, porta, percorso)

### Attributi mancanti {#missing-attributes}

Se username o email sono vuoti dopo il login, il tuo IdP potrebbe non inviare gli attributi attesi. Controlla:

- Il tuo IdP è configurato per rilasciare un attributo `email` (o qualunque valore sia impostato `SAML_EMAIL_ATTRIBUTE`)
- Se usi `SAML_USERNAME_ATTRIBUTE`, verifica che quell'attributo sia incluso nell'asserzione
- Alcuni IdP richiedono una configurazione esplicita di mappatura degli attributi prima di rilasciare i claim

### Scarto dell'orologio {#clock-skew}

Le asserzioni SAML includono condizioni temporali (`NotBefore`, `NotOnOrAfter`). Se l'orologio del tuo server e quello dell'IdP non sono sincronizzati, la validazione dell'asserzione fallisce. Esegui NTP su entrambe le macchine per mantenere gli orologi allineati.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Questo avviso appare nei log del server quando `SAML_ENABLED=true` ma la licenza non include la funzionalità `saml_sso`. Verifica la tua chiave di licenza e il piano. La funzionalità `saml_sso` è disponibile nei piani team ed enterprise.

### Il login reindirizza indietro con un errore {#login-redirects-back-with-error}

Se facendo clic sul pulsante di login SAML vieni reindirizzato alla pagina di login con un errore, controlla i log del server per i dettagli. Cause comuni:

- L'SSO URL dell'IdP è irraggiungibile dal server
- L'IdP ha rifiutato la richiesta di autenticazione (controlla i log di audit dell'IdP)
- L'IdP ha restituito una risposta non firmata (SnapOtter richiede che sia la risposta che l'asserzione siano firmate)
