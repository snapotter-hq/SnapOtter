---
description: "Stel Single Sign-On in met OpenID Connect. Stapsgewijze handleidingen voor Keycloak, Authentik, Google, Microsoft Entra ID (Azure AD), Okta en andere OIDC-providers."
i18n_source_hash: 438fff2ba4c6
i18n_provenance: human
i18n_output_hash: 82d34f4b3c9e
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter ondersteunt OpenID Connect (OIDC) voor single sign-on. Gebruikers kunnen inloggen met een externe identiteitsprovider zoals Keycloak, Authentik, Google of Microsoft Entra ID in plaats van (of naast) lokale authenticatie met gebruikersnaam/wachtwoord.

::: tip Zie ook
[SAML SSO](/nl/guide/saml) | [SCIM-provisioning](/nl/guide/scim) | [Gebruikers, rollen & rechten](/nl/guide/users-roles)
:::

## Snelstart {#quick-start}

Voeg deze omgevingsvariabelen toe aan je `docker-compose.yml`:

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

De redirect-URI voor je provider is altijd:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Als `EXTERNAL_URL` bijvoorbeeld `https://photos.example.com` is, configureer dan de redirect-URI van je provider als `https://photos.example.com/api/auth/oidc/callback`.

## Configuratiereferentie {#configuration-reference}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `OIDC_ENABLED` | `false` | OIDC-login inschakelen. Een knop "Aanmelden met SSO" verschijnt op de aanmeldpagina. |
| `OIDC_ISSUER_URL` | | Issuer-URL van de provider. Moet OIDC Discovery ondersteunen (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | OAuth-client-ID geregistreerd bij je provider. |
| `OIDC_CLIENT_SECRET` | | OAuth-clientgeheim. |
| `OIDC_SCOPES` | `openid profile email` | Door spaties gescheiden lijst van aan te vragen scopes. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Maak automatisch een lokaal gebruikersaccount aan bij de eerste OIDC-login. |
| `OIDC_DEFAULT_ROLE` | `user` | Rol toegewezen aan automatisch aangemaakte OIDC-gebruikers. Een van `admin`, `editor` of `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Koppel een OIDC-identiteit aan een bestaande lokale gebruiker als het e-mailadres overeenkomt. |
| `OIDC_PROVIDER_NAME` | | Weergavenaam getoond op de aanmeldknop (bijv. "Keycloak", "Google"). Indien leeg, staat er "SSO" op de knop. |
| `OIDC_CLOCK_TOLERANCE` | `30` | Tolerantie voor klokverschil in seconden voor tokenvalidatie. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | ID-token-claim die als gebruikersnaam wordt gebruikt voor nieuwe accounts. |
| `EXTERNAL_URL` | | De publieke URL waarop SnapOtter bereikbaar is. Vereist voor OIDC om de juiste redirect-URI op te bouwen. |
| `COOKIE_SECRET` | automatisch gegenereerd | Geheim voor het ondertekenen van sessiecookies. Stel dit expliciet in bij het draaien van meerdere replica's. |

## Providerhandleidingen {#provider-guides}

### Keycloak {#keycloak}

1. Maak een nieuw realm aan (of gebruik een bestaand realm).
2. Ga naar **Clients** en maak een nieuwe client aan:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (vertrouwelijk)
   - **Authentication flow**: Standard flow (Authorization Code)
3. Stel onder het tabblad **Settings** van de client **Valid redirect URIs** in op je callback-URL (bijv. `https://photos.example.com/api/auth/oidc/callback`).
4. Kopieer het **Client secret** van het tabblad **Credentials**.
5. Stel `OIDC_ISSUER_URL` in op `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. Ga in de beheerinterface naar **Applications > Providers** en maak een nieuwe **OAuth2/OpenID Provider** aan.
   - **Client type**: Confidential
   - **Redirect URIs**: Je callback-URL
   - **Signing key**: Selecteer een bestaande sleutel of maak er een aan
2. Maak een **Application** aan en koppel deze aan de provider.
3. Kopieer de **Client ID** en het **Client Secret** uit de providerinstellingen.
4. Stel `OIDC_ISSUER_URL` in op `https://authentik.example.com/application/o/snapotter/` (de afsluitende schuine streep is belangrijk).

### Google {#google}

1. Ga naar de [Google Cloud Console](https://console.cloud.google.com/).
2. Maak een project aan (of selecteer een bestaand project).
3. Ga naar **APIs & Services > OAuth consent screen** en configureer dit.
4. Ga naar **APIs & Services > Credentials** en maak een **OAuth 2.0 Client ID** aan:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Je callback-URL
5. Kopieer de **Client ID** en het **Client secret**.
6. Stel `OIDC_ISSUER_URL` in op `https://accounts.google.com`.
7. Stel `OIDC_USERNAME_CLAIM` in op `email` (Google levert geen `preferred_username`).

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Ga in de Azure-portal naar **Microsoft Entra ID > App registrations > New registration**.
2. Geef de app de naam "SnapOtter". Selecteer onder **Redirect URI** het platform **Web** en voer je callback-URL in (bijv. `https://photos.example.com/api/auth/oidc/callback`). Kies niet voor **Single-page application**: SnapOtter authenticeert met een clientgeheim, en dat accepteert Entra ID niet bij SPA-registraties.
3. Kopieer de **Application (client) ID** en de **Directory (tenant) ID** van de pagina **Overview**.
4. Ga naar **Certificates & secrets > New client secret** en kopieer meteen de **Value** van het geheim. Deze wordt maar één keer getoond, en de Secret ID ernaast is niet het geheim.
5. Stel `OIDC_ISSUER_URL` in op `https://login.microsoftonline.com/<tenant-id>/v2.0`, met de Directory (tenant) ID uit stap 3.
6. Laat `OIDC_USERNAME_CLAIM` op de standaardwaarde staan. Entra ID levert `preferred_username`, dus de `email`-override uit de Google-handleiding is hier niet nodig.

Gebruik in de issuer-URL altijd je tenant-ID, niet `common` of `organizations`. Die multi-tenant-endpoints geven de letterlijke template `{tenantid}` op als issuer, waardoor de OIDC-discovery-validatie mislukt.

::: warning
De `preferred_username` van Entra ID volgt de user principal name, die verandert wanneer een gebruiker wordt hernoemd of naar een andere tenant wordt verplaatst. SnapOtter leest de claim één keer uit, bij de eerste login, dus daarna behoudt het account zijn oorspronkelijke gebruikersnaam. Inloggen blijft hoe dan ook werken: terugkerende gebruikers worden gematcht op het stabiele subject van het token, niet op de gebruikersnaam.
:::

Overstappen op Entra ID schakelt wachtwoordlogin niet uit. Zie [Lokale login uitschakelen](#disabling-local-login).

### Okta en andere providers {#okta-and-other-providers}

Elke provider die OIDC Discovery ondersteunt werkt op dezelfde manier: maak een vertrouwelijke webclient aan met je callback-URL en verwijs `OIDC_ISSUER_URL` naar de issuer. Maak voor Okta een app aan met de aanmeldmethode **OIDC - OpenID Connect** en het type **Web Application**, en gebruik daarna je Okta-domein als issuer (bijv. `https://your-company.okta.com`).

SnapOtter koppelt groepen van de identiteitsprovider niet aan rollen. Nieuwe SSO-gebruikers krijgen `OIDC_DEFAULT_ROLE`, beheerders wijzigen rollen onder **Settings > Users**, en het aanvragen van groepsclaims via `OIDC_SCOPES` heeft geen effect.

## Gebruikersprovisioning {#user-provisioning}

### Automatisch aanmaken {#auto-create}

Wanneer `OIDC_AUTO_CREATE_USERS` op `true` staat (de standaard), wordt er een lokaal gebruikersaccount aangemaakt wanneer iemand voor het eerst via OIDC inlogt. De gebruikersnaam wordt overgenomen uit de claim opgegeven door `OIDC_USERNAME_CLAIM`, en de rol wordt ingesteld op `OIDC_DEFAULT_ROLE`.

Als er een botsing van gebruikersnamen optreedt, wordt er een numeriek achtervoegsel toegevoegd (bijv. `jane` wordt `jane_2`).

### Automatisch koppelen {#auto-link}

Wanneer `OIDC_AUTO_LINK_USERS` op `true` staat, koppelt SnapOtter een OIDC-identiteit aan een bestaand lokaal account als de e-mailadressen overeenkomen. Dit is handig wanneer je vooraf aangemaakte gebruikersaccounts hebt en wilt dat ze SSO gaan gebruiken zonder hun gegevens te verliezen.

::: warning 
Schakel automatisch koppelen alleen in als je je OIDC-provider vertrouwt om e-mailadressen te verifiëren. Een niet-geverifieerd e-mailadres zou iemand in staat kunnen stellen het account van een andere gebruiker over te nemen.
:::

### Lokale login uitschakelen {#disabling-local-login}

OIDC schakelt lokale login met gebruikersnaam/wachtwoord niet uit. Beide methoden blijven beschikbaar. Beheerders kunnen nog steeds inloggen met lokale inloggegevens als de OIDC-provider onbereikbaar is.

## Zelfondertekende certificaten {#self-signed-certificates}

Als je OIDC-provider een zelfondertekend of privé CA-certificaat gebruikt, koppel dan de CA-bundel in de container en verwijs `NODE_EXTRA_CA_CERTS` ernaar:

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
Stel `NODE_TLS_REJECT_UNAUTHORIZED=0` niet in. Dit schakelt alle TLS-verificatie uit en vormt een beveiligingsrisico.
:::

## Problemen oplossen {#troubleshooting}

### Redirect-URI komt niet overeen {#redirect-uri-mismatch}

De meest voorkomende fout. Controleer op deze verschillen tussen wat je provider verwacht en wat SnapOtter verzendt:

- `http` versus `https` - het schema moet exact overeenkomen
- Afsluitende schuine streep - sommige providers zijn hier strikt in
- Poortnummer - neem de poort op als deze niet-standaard is
- Pad - moet `/api/auth/oidc/callback` zijn

Controleer `EXTERNAL_URL` nogmaals. Het moet overeenkomen met de URL die gebruikers in hun browser typen.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

De OIDC-provider gebruikt een certificaat dat Node.js niet vertrouwt. Zie [Zelfondertekende certificaten](#self-signed-certificates) hierboven.

### Fouten door klokverschil {#clock-skew-errors}

Als je serverklok en de klok van de OIDC-provider niet gelijklopen, kan de tokenvalidatie mislukken. Verhoog `OIDC_CLOCK_TOLERANCE` (standaard is 30 seconden). Een betere oplossing is om NTP op beide machines te draaien.

### "OIDC-provider onbereikbaar" {#oidc-provider-unreachable}

SnapOtter haalt het discovery-document van de provider op bij het opstarten en tijdens het inloggen. Controleer:

- DNS-resolutie vanuit de Docker-container (`docker exec snapotter nslookup auth.example.com`)
- Firewallregels tussen de container en de provider
- De `OIDC_ISSUER_URL`-waarde - deze moet bereikbaar zijn vanaf de server, niet alleen vanuit je browser

### Ontbrekende claims {#missing-claims}

Als gebruikersnamen of e-mailadressen leeg zijn na het inloggen, retourneert je provider mogelijk niet de verwachte claims. Verifieer:

- De scopes geconfigureerd in `OIDC_SCOPES` bevatten `profile` en `email`
- De provider is geconfigureerd om de claim opgegeven in `OIDC_USERNAME_CLAIM` in het ID-token op te nemen
- Sommige providers vereisen expliciete mapper-/scope-configuratie om claims vrij te geven
