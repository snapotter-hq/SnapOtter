---
description: "Konfigurera Single Sign-On med OpenID Connect. Steg-för-steg-guider för Keycloak, Authentik, Google och andra OIDC-leverantörer."
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: b3ed5df413a2
---

# OIDC / Single Sign-On {#oidc-single-sign-on}

SnapOtter stöder OpenID Connect (OIDC) för single sign-on. Användare kan logga in med en extern identitetsleverantör som Keycloak, Authentik eller Google i stället för (eller vid sidan av) lokal autentisering med användarnamn/lösenord.

::: tip Se även
[SAML SSO](/sv/guide/saml) | [SCIM-provisionering](/sv/guide/scim) | [Användare, roller och behörigheter](/sv/guide/users-roles)
:::

## Snabbstart {#quick-start}

Lägg till dessa miljövariabler i din `docker-compose.yml`:

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

Omdirigerings-URI:n för din leverantör är alltid:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

Om till exempel `EXTERNAL_URL` är `https://photos.example.com`, konfigurerar du din leverantörs omdirigerings-URI som `https://photos.example.com/api/auth/oidc/callback`.

## Konfigurationsreferens {#configuration-reference}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `OIDC_ENABLED` | `false` | Aktivera OIDC-inloggning. En "Logga in med SSO"-knapp visas på inloggningssidan. |
| `OIDC_ISSUER_URL` | | Leverantörens issuer-URL. Måste stödja OIDC Discovery (`/.well-known/openid-configuration`). |
| `OIDC_CLIENT_ID` | | OAuth-klient-ID registrerat hos din leverantör. |
| `OIDC_CLIENT_SECRET` | | OAuth-klienthemlighet. |
| `OIDC_SCOPES` | `openid profile email` | Blankstegsseparerad lista över scopes att begära. |
| `OIDC_AUTO_CREATE_USERS` | `true` | Skapa automatiskt ett lokalt användarkonto vid första OIDC-inloggningen. |
| `OIDC_DEFAULT_ROLE` | `user` | Roll som tilldelas automatiskt skapade OIDC-användare. En av `admin`, `editor` eller `user`. |
| `OIDC_AUTO_LINK_USERS` | `false` | Länka en OIDC-identitet till en befintlig lokal användare om e-postadressen matchar. |
| `OIDC_PROVIDER_NAME` | | Visningsnamn som visas på inloggningsknappen (t.ex. "Keycloak", "Google"). Om tomt står det "SSO" på knappen. |
| `OIDC_CLOCK_TOLERANCE` | `30` | Tolerans för klockavvikelse i sekunder vid tokenvalidering. |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | ID-token-claim som används som användarnamn för nya konton. |
| `EXTERNAL_URL` | | Den publika URL där SnapOtter är nåbar. Krävs för att OIDC ska kunna bygga den korrekta omdirigerings-URI:n. |
| `COOKIE_SECRET` | autogenererad | Hemlighet för att signera sessionscookies. Sätt denna uttryckligen när du kör flera repliker. |

## Leverantörsguider {#provider-guides}

### Keycloak {#keycloak}

1. Skapa en ny realm (eller använd en befintlig).
2. Gå till **Clients** och skapa en ny klient:
   - **Client ID**: `snapotter`
   - **Client authentication**: On (confidential)
   - **Authentication flow**: Standard flow (Authorization Code)
3. Under klientens **Settings**-flik, sätt **Valid redirect URIs** till din callback-URL (t.ex. `https://photos.example.com/api/auth/oidc/callback`).
4. Kopiera **Client secret** från **Credentials**-fliken.
5. Sätt `OIDC_ISSUER_URL` till `https://keycloak.example.com/realms/your-realm`.

### Authentik {#authentik}

1. I administratörsgränssnittet, gå till **Applications > Providers** och skapa en ny **OAuth2/OpenID Provider**.
   - **Client type**: Confidential
   - **Redirect URIs**: Din callback-URL
   - **Signing key**: Välj en befintlig nyckel eller skapa en
2. Skapa en **Application** och länka den till leverantören.
3. Kopiera **Client ID** och **Client Secret** från leverantörsinställningarna.
4. Sätt `OIDC_ISSUER_URL` till `https://authentik.example.com/application/o/snapotter/` (det avslutande snedstrecket spelar roll).

### Google {#google}

1. Gå till [Google Cloud Console](https://console.cloud.google.com/).
2. Skapa ett projekt (eller välj ett befintligt).
3. Navigera till **APIs & Services > OAuth consent screen** och konfigurera den.
4. Gå till **APIs & Services > Credentials** och skapa ett **OAuth 2.0 Client ID**:
   - **Application type**: Web application
   - **Authorized redirect URIs**: Din callback-URL
5. Kopiera **Client ID** och **Client secret**.
6. Sätt `OIDC_ISSUER_URL` till `https://accounts.google.com`.
7. Sätt `OIDC_USERNAME_CLAIM` till `email` (Google tillhandahåller inte `preferred_username`).

## Användarprovisionering {#user-provisioning}

### Skapa automatiskt {#auto-create}

När `OIDC_AUTO_CREATE_USERS` är `true` (standard) skapas ett lokalt användarkonto första gången någon loggar in via OIDC. Användarnamnet hämtas från den claim som anges av `OIDC_USERNAME_CLAIM`, och rollen sätts till `OIDC_DEFAULT_ROLE`.

Om en användarnamnskollision uppstår läggs ett numeriskt suffix till (t.ex. `jane` blir `jane_2`).

### Länka automatiskt {#auto-link}

När `OIDC_AUTO_LINK_USERS` är `true` länkar SnapOtter en OIDC-identitet till ett befintligt lokalt konto om e-postadresserna matchar. Detta är användbart när du har förskapade användarkonton och vill att de ska börja använda SSO utan att förlora sina data.

::: warning 
Aktivera endast automatisk länkning om du litar på att din OIDC-leverantör verifierar e-postadresser. En overifierad e-postadress kan tillåta någon att ta över en annan användares konto.
:::

### Inaktivera lokal inloggning {#disabling-local-login}

OIDC inaktiverar inte lokal inloggning med användarnamn/lösenord. Båda metoderna förblir tillgängliga. Administratörer kan fortfarande logga in med lokala uppgifter om OIDC-leverantören är onåbar.

## Självsignerade certifikat {#self-signed-certificates}

Om din OIDC-leverantör använder ett självsignerat eller privat CA-certifikat monterar du CA-bundlen in i containern och pekar `NODE_EXTRA_CA_CERTS` mot den:

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
Sätt inte `NODE_TLS_REJECT_UNAUTHORIZED=0`. Detta inaktiverar all TLS-verifiering och är en säkerhetsrisk.
:::

## Felsökning {#troubleshooting}

### Omdirigerings-URI matchar inte {#redirect-uri-mismatch}

Det vanligaste felet. Kontrollera dessa skillnader mellan vad din leverantör förväntar sig och vad SnapOtter skickar:

- `http` mot `https` - schemat måste matcha exakt
- Avslutande snedstreck - vissa leverantörer är strikta med detta
- Portnummer - inkludera porten om den är icke-standard
- Sökväg - måste vara `/api/auth/oidc/callback`

Dubbelkolla `EXTERNAL_URL`. Den måste matcha den URL användare skriver in i sin webbläsare.

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

OIDC-leverantören använder ett certifikat som Node.js inte litar på. Se [Självsignerade certifikat](#self-signed-certificates) ovan.

### Fel med klockavvikelse {#clock-skew-errors}

Om din serverklocka och OIDC-leverantörens klocka inte är synkroniserade kan tokenvalidering misslyckas. Öka `OIDC_CLOCK_TOLERANCE` (standard är 30 sekunder). En bättre lösning är att köra NTP på båda maskinerna.

### "OIDC provider unreachable" {#oidc-provider-unreachable}

SnapOtter hämtar leverantörens discovery-dokument vid start och under inloggning. Kontrollera:

- DNS-uppslag inifrån Docker-containern (`docker exec snapotter nslookup auth.example.com`)
- Brandväggsregler mellan containern och leverantören
- Värdet `OIDC_ISSUER_URL` - det måste vara nåbart från servern, inte bara från din webbläsare

### Saknade claims {#missing-claims}

Om användarnamn eller e-postadresser är tomma efter inloggning kanske din leverantör inte returnerar de förväntade claims. Verifiera:

- Scopes som konfigurerats i `OIDC_SCOPES` inkluderar `profile` och `email`
- Leverantören är konfigurerad att inkludera den claim som anges i `OIDC_USERNAME_CLAIM` i ID-token
- Vissa leverantörer kräver uttrycklig mapper-/scope-konfiguration för att släppa claims
