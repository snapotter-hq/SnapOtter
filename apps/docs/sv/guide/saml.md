---
description: "Konfigurera SAML 2.0 Single Sign-On för SnapOtter. Steg-för-steg-guider för Okta, Azure AD / Entra ID, Google Workspace och andra SAML-identitetsleverantörer."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 97815624f357
---

# SAML SSO {#saml-sso}

SnapOtter stöder SAML 2.0 för single sign-on. Användare kan logga in via en extern identitetsleverantör (Okta, Azure AD / Entra ID, Google Workspace eller vilken standard-SAML 2.0-IdP som helst) i stället för lokal autentisering med användarnamn/lösenord.

::: tip Enterprise-funktion
SAML SSO kräver en **team**- eller **enterprise**-licens med funktionen `saml_sso`. Om `SAML_ENABLED=true` är satt utan en giltig licens hoppas SAML-rutterna tyst över och en varning loggas.
:::

## Förutsättningar {#prerequisites}

- En körande SnapOtter-instans nåbar på en publik URL
- `EXTERNAL_URL` satt till den publika URL:n (t.ex. `https://photos.example.com`)
- En team- eller enterprise-licensnyckel med funktionen `saml_sso`
- Administratörsåtkomst till din SAML-identitetsleverantör

## Snabbstart {#quick-start}

Lägg till dessa miljövariabler i din `docker-compose.yml`:

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

Starta om containern. En "Logga in med SAML"-knapp (eller etiketten satt av `SAML_PROVIDER_NAME`) visas på inloggningssidan.

## Konfigurationsreferens {#configuration-reference}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `SAML_ENABLED` | `false` | Aktivera SAML-inloggning. |
| `SAML_IDP_SSO_URL` | | IdP:ns SSO-slutpunkts-URL. **Krävs** när SAML är aktiverat. |
| `SAML_IDP_CERTIFICATE` | | IdP:ns X.509-signeringscertifikat i PEM-format (själva certifikattexten, inte en filsökväg). **Krävs** när SAML är aktiverat. |
| `EXTERNAL_URL` | | Den publika URL där SnapOtter är nåbar. **Krävs** när SAML är aktiverat. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI som skickas till IdP:n. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion Consumer Service (ACS)-URL. |
| `SAML_AUTO_CREATE_USERS` | `true` | Skapa automatiskt ett lokalt användarkonto vid första SAML-inloggningen. |
| `SAML_AUTO_LINK_USERS` | `false` | Länka en SAML-identitet till en befintlig lokal användare om e-postadressen matchar. |
| `SAML_DEFAULT_ROLE` | `user` | Roll som tilldelas automatiskt skapade SAML-användare. En av `admin`, `editor` eller `user`. |
| `SAML_PROVIDER_NAME` | | Visningsetikett för SAML-inloggningsknappen i frontend (t.ex. "Okta", "Azure AD"). Om tomt står det "SAML" på knappen. |
| `SAML_USERNAME_ATTRIBUTE` | | SAML-assertion-attribut som används som användarnamn. Om tomt faller det tillbaka till e-postadressens lokala del, sedan NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | SAML-assertion-attribut som används som användarens e-postadress. |

Servern vägrar att starta om `SAML_ENABLED=true` och någon av de tre obligatoriska variablerna (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) saknas.

::: details Säkerhetsanteckningar
Både `wantAuthnResponseSigned` och `wantAssertionsSigned` är hårdkodade till `true`. SnapOtter avvisar osignerade eller felaktigt signerade SAML-svar. Assertions från en betrodd IdP behandlas som e-postverifierade.

Endast SP-initierad inloggning stöds. SnapOtter stöder inte IdP-initierad (oombedd) inloggning eller Single Logout (SLO). Att logga ut från SnapOtter loggar inte ut användaren från IdP:n.
:::

## SP-metadata och URL:er {#sp-metadata-and-urls}

Din IdP behöver tre värden från SnapOtter:

| Fält | Värde |
|---|---|
| **ACS-URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP Metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Om till exempel `EXTERNAL_URL` är `https://photos.example.com`:

- ACS-URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Metadata-slutpunkt: `https://photos.example.com/api/auth/saml/metadata` (returnerar XML)

Vissa IdP:er kan importera SP-metadata-URL:n direkt, vilket automatiskt fyller i ACS-URL:n och Entity ID.

## Leverantörskonfiguration {#provider-setup}

### Okta {#okta}

1. I Okta-administratörskonsolen, gå till **Applications > Create App Integration**.
2. Välj **SAML 2.0** och klicka på **Next**.
3. Ange ett namn (t.ex. "SnapOtter") och klicka på **Next**.
4. Konfigurera SAML-inställningarna:
   - **Single sign-on URL**: Din ACS-URL (t.ex. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Ditt Entity ID (t.ex. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. Under **Attribute Statements**, lägg till `email` mappat till `user.email`.
6. Klicka på **Next**, sedan **Finish**.
7. Gå till fliken **Sign On**, klicka på **View SAML setup instructions** och kopiera:
   - **Identity Provider Single Sign-On URL** till `SAML_IDP_SSO_URL`
   - **X.509 Certificate** till `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. I Azure-portalen, gå till **Microsoft Entra ID > Enterprise applications > New application**.
2. Klicka på **Create your own application**, döp den till "SnapOtter" och välj **Integrate any other application you don't find in the gallery**.
3. Gå till **Single sign-on > SAML** och klicka på **Edit** i avsnittet **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Ditt Entity ID (t.ex. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Din ACS-URL (t.ex. `https://photos.example.com/api/auth/saml/callback`)
4. Under **SAML Certificates**, ladda ner **Certificate (Base64)**.
5. Under **Set up SnapOtter**, kopiera **Login URL**.
6. Sätt `SAML_IDP_SSO_URL` till Login-URL:n och `SAML_IDP_CERTIFICATE` till innehållet i det nedladdade certifikatet.
7. Tilldela användare eller grupper till applikationen under **Users and groups**.

### Google Workspace {#google-workspace}

1. I Google Admin-konsolen, gå till **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Döp appen till "SnapOtter" och klicka på **Continue**.
3. På sidan **Google Identity Provider details**, kopiera **SSO URL** och ladda ner **Certificate**. Klicka på **Continue**.
4. Konfigurera Service Provider-detaljerna:
   - **ACS URL**: Din ACS-URL (t.ex. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Ditt Entity ID (t.ex. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Klicka på **Continue**, sedan **Finish**.
6. Slå **PÅ** appen för dina organisationsenheter.
7. Sätt `SAML_IDP_SSO_URL` till SSO-URL:n från steg 3 och `SAML_IDP_CERTIFICATE` till innehållet i det nedladdade certifikatet.

### Generisk SAML 2.0-IdP {#generic-saml-2-0-idp}

För vilken SAML 2.0-kompatibel identitetsleverantör som helst:

1. Skapa en ny SAML-applikation/tjänsteleverantör i din IdP.
2. Sätt **ACS-URL** till `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Sätt **Entity ID** / **Audience** till `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Konfigurera IdP:n att skicka användarens e-post i ett attribut med namnet `email` (eller sätt `SAML_EMAIL_ATTRIBUTE` för att matcha din IdP:s attributnamn).
5. Kopiera **IdP SSO URL** och **signeringscertifikat** till `SAML_IDP_SSO_URL` och `SAML_IDP_CERTIFICATE`.

## Användarprovisionering {#user-provisioning}

### Skapa automatiskt {#auto-create}

När `SAML_AUTO_CREATE_USERS` är `true` (standard) skapas ett lokalt användarkonto första gången någon loggar in via SAML. Rollen sätts till `SAML_DEFAULT_ROLE`.

Användarnamnet härleds i denna ordning:

1. Värdet av assertion-attributet som anges av `SAML_USERNAME_ATTRIBUTE` (om det är satt och finns)
2. Den lokala delen av e-postadressen (allt före `@`)
3. SAML NameID

Om en användarnamnskollision uppstår läggs ett numeriskt suffix till (t.ex. `jane` blir `jane_2`).

### Länka automatiskt {#auto-link}

När `SAML_AUTO_LINK_USERS` är `true` länkar SnapOtter en SAML-identitet till ett befintligt lokalt konto om e-postadresserna matchar. Detta är användbart när du har förskapade användarkonton och vill att de ska börja använda SSO utan att förlora sina data.

::: warning 
Aktivera endast automatisk länkning om du litar på att din SAML-IdP verifierar e-postadresser. En overifierad e-postadress från en felkonfigurerad IdP kan tillåta någon att ta över en annan användares konto.
:::

### Attributmappning {#attribute-mapping}

| SnapOtter-fält | Källa | Konfiguration |
|---|---|---|
| E-post | Assertion-attribut | `SAML_EMAIL_ATTRIBUTE` (standard: `email`) |
| Användarnamn | Assertion-attribut, e-post eller NameID | `SAML_USERNAME_ATTRIBUTE` (se härledningsordning ovan) |
| Externt ID | NameID | Alltid SAML NameID, inte konfigurerbart |

## Framtvingande av SSO {#sso-enforcement}

Om du vill kräva att alla användare loggar in via SAML (eller OIDC) och blockera lokal lösenordsinloggning, aktiverar du framtvingande av SSO:

1. Säkerställ att enterprise-funktionen `sso_enforcement` är licensierad (tillgänglig på team- och enterprise-planer).
2. I **Admin Settings > Security**, slå på **SSO Enforcement**.
3. Sätt ett **break-glass-användarnamn**: detta är det enda lokala konto som fortfarande kan logga in med ett lösenord, för nödåtkomst om IdP:n är onåbar.

När framtvingande av SSO är aktivt returnerar varje lokalt inloggningsförsök (utom för break-glass-användaren) ett 403-fel med meddelandet "Local password login is disabled. Please use SSO."

::: tip 
Konfigurera alltid ett break-glass-användarnamn innan du aktiverar framtvingande av SSO. Utan det kan du bli utelåst från SnapOtter om din IdP går ner.
:::

## Använda SAML tillsammans med OIDC {#using-saml-alongside-oidc}

SAML och OIDC kan aktiveras samtidigt. När båda är aktiva visar inloggningssidan separata knappar för varje leverantör (märkta med `SAML_PROVIDER_NAME` och `OIDC_PROVIDER_NAME`). Användare kan logga in med endera metoden.

Båda leverantörerna delar samma inställningar för automatiskt skapande, automatisk länkning och framtvingande av SSO oberoende av varandra: var och en har sina egna `*_AUTO_CREATE_USERS`-, `*_AUTO_LINK_USERS`- och `*_DEFAULT_ROLE`-variabler.

## Felsökning {#troubleshooting}

### Assertion-validering misslyckades {#assertion-validation-failed}

Signaturen på SAML-svaret eller assertion-signaturen kunde inte verifieras. Kontrollera:

- Certifikatet i `SAML_IDP_CERTIFICATE` matchar det aktuella signeringscertifikatet i din IdP (certifikat roteras, så kontrollera utgångsdatum)
- Certifikatet är i PEM-format (börjar med `-----BEGIN CERTIFICATE-----`)
- Certifikatet är den fullständiga texten, inte en filsökväg
- ACS-URL:n och Entity ID som konfigurerats i din IdP matchar SnapOtters värden exakt (schema, värd, port, sökväg)

### Saknade attribut {#missing-attributes}

Om användarnamn eller e-postadresser är tomma efter inloggning kanske din IdP inte skickar de förväntade attributen. Kontrollera:

- Din IdP är konfigurerad att släppa ett `email`-attribut (eller vad `SAML_EMAIL_ATTRIBUTE` är satt till)
- Om du använder `SAML_USERNAME_ATTRIBUTE`, verifiera att det attributet ingår i assertionen
- Vissa IdP:er kräver uttrycklig attributmappningskonfiguration innan de släpper claims

### Klockavvikelse {#clock-skew}

SAML-assertions inkluderar tidsstämpelvillkor (`NotBefore`, `NotOnOrAfter`). Om din serverklocka och IdP-klockan inte är synkroniserade misslyckas assertion-valideringen. Kör NTP på båda maskinerna för att hålla klockorna i linje.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Denna varning visas i serverloggarna när `SAML_ENABLED=true` men licensen inte inkluderar funktionen `saml_sso`. Verifiera din licensnyckel och plan. Funktionen `saml_sso` är tillgänglig på team- och enterprise-planer.

### Inloggning omdirigerar tillbaka med fel {#login-redirects-back-with-error}

Om ett klick på SAML-inloggningsknappen omdirigerar tillbaka till inloggningssidan med ett fel, kontrollera serverloggarna för detaljer. Vanliga orsaker:

- IdP:ns SSO-URL är onåbar från servern
- IdP:n avvisade autentiseringsbegäran (kontrollera IdP:ns granskningsloggar)
- IdP:n returnerade ett osignerat svar (SnapOtter kräver att både svaret och assertionen är signerade)
