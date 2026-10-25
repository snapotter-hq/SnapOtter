---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: 3ed930e3b2e9
i18n_hash_version: 2
---
# Ripristino dell'account {#account-recovery}

Se rimani bloccato fuori da SnapOtter (nella maggior parte dei casi a causa di
un criterio MFA che non riesci più a soddisfare), puoi effettuare il ripristino
dall'interno del container senza un client di database. I comandi di ripristino
sono offline e richiedono l'accesso alla shell del container, il che implica
già il controllo completo dell'istanza.

## Contro quale muro sto sbattendo? {#which-wall-am-i-hitting}

Il login di SnapOtter applica due gate MFA indipendenti. Diagnostica prima:

```bash
docker exec -it snapotter snapotter-admin status
```

Questo stampa il criterio MFA corrente e quali utenti hanno registrato TOTP.

- **"MFA enrollment is required before login" (e non hai mai configurato un'app):**
  il criterio richiede l'MFA ma non hai alcuna registrazione. Allenta il criterio.
- **Ti viene richiesto un codice che non puoi produrre** (hai perso il telefono e i
  tuoi codici di ripristino): il tuo account è registrato. Cancella tale registrazione.

## Allentare il criterio MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

Questo riporta il criterio a `optional`. Si applica al login successivo senza
riavvio. Imposta sempre e solo `optional`, quindi non può riattivare l'imposizione.

## Cancellare la registrazione TOTP di un utente {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

Se il criterio richiede ancora l'MFA per quell'utente, incontrerà poi il muro
della registrazione, quindi esegui anche `reset-mfa-policy`, accedi e registrati di nuovo dalle Impostazioni.

## Reimpostare una password dimenticata {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

Se ometti `[password]`, la CLI stampa una password temporanea generata. In entrambi i casi, le sessioni attive, le chiavi API e la finestra di limitazione dei tentativi di accesso falliti dell'utente vengono cancellate, e SnapOtter richiede il cambio della password al login successivo.

## Creare un account amministratore di emergenza {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

Usa questo comando quando nessun account amministratore esistente riesce ad accedere. `[username]` usa come valore predefinito `DEFAULT_USERNAME` (`admin`), e omettere `[password]` stampa una password temporanea che deve essere cambiata al primo accesso.

## Sbloccare un utente limitato o disabilitato {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

Questo cancella la finestra `LOGIN_THROTTLED` in Redis e ripristina il ruolo dell'account se l'utente era disabilitato.

## Immagini più vecchie e fallback {#older-images-and-fallbacks}

Su un'immagine creata prima che esistesse il wrapper `snapotter-admin`, richiama lo script
direttamente:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

Come ultima risorsa su qualsiasi versione, imposta il criterio nel database. Sull'immagine
all-in-one Postgres viene eseguito all'interno del container:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

Nella configurazione multi-container, punta `psql` al tuo `DATABASE_URL`.

## Bloccato fuori dall'SSO, non dall'MFA? {#locked-out-of-sso-not-mfa}

Se un login SSO imposto non riesce, usa invece l'account locale di emergenza:
imposta `ssoBreakGlassUsername` su un amministratore locale in Impostazioni > Sicurezza prima di
imporre l'SSO, e accedi con la password di quell'account.
