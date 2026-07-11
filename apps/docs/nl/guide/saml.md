---
description: "Stel SAML 2.0 Single Sign-On in voor SnapOtter. Stapsgewijze handleidingen voor Okta, Azure AD / Entra ID, Google Workspace en andere SAML-identiteitsproviders."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 046e75acd88e
---

# SAML SSO {#saml-sso}

SnapOtter ondersteunt SAML 2.0 voor single sign-on. Gebruikers kunnen inloggen via een externe identiteitsprovider (Okta, Azure AD / Entra ID, Google Workspace of een standaard SAML 2.0-IdP) in plaats van lokale authenticatie met gebruikersnaam/wachtwoord.

::: tip Enterprise-functie
SAML SSO vereist een **team**- of **enterprise**-licentie met de `saml_sso`-functie. Als `SAML_ENABLED=true` is ingesteld zonder een geldige licentie, worden de SAML-routes stilzwijgend overgeslagen en wordt er een waarschuwing gelogd.
:::

## Vereisten {#prerequisites}

- Een draaiende SnapOtter-instantie bereikbaar op een publieke URL
- `EXTERNAL_URL` ingesteld op die publieke URL (bijv. `https://photos.example.com`)
- Een team- of enterprise-licentiesleutel met de `saml_sso`-functie
- Adminrechten voor je SAML-identiteitsprovider

## Snelstart {#quick-start}

Voeg deze omgevingsvariabelen toe aan je `docker-compose.yml`:

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

Herstart de container. Een knop "Aanmelden met SAML" (of het label ingesteld door `SAML_PROVIDER_NAME`) verschijnt op de aanmeldpagina.

## Configuratiereferentie {#configuration-reference}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `SAML_ENABLED` | `false` | SAML-login inschakelen. |
| `SAML_IDP_SSO_URL` | | SSO-eindpunt-URL van de IdP. **Vereist** wanneer SAML is ingeschakeld. |
| `SAML_IDP_CERTIFICATE` | | X.509-ondertekeningscertificaat van de IdP in PEM-formaat (de certificaattekst zelf, niet een bestandspad). **Vereist** wanneer SAML is ingeschakeld. |
| `EXTERNAL_URL` | | De publieke URL waarop SnapOtter bereikbaar is. **Vereist** wanneer SAML is ingeschakeld. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI verzonden naar de IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion Consumer Service (ACS)-URL. |
| `SAML_AUTO_CREATE_USERS` | `true` | Maak automatisch een lokaal gebruikersaccount aan bij de eerste SAML-login. |
| `SAML_AUTO_LINK_USERS` | `false` | Koppel een SAML-identiteit aan een bestaande lokale gebruiker als het e-mailadres overeenkomt. |
| `SAML_DEFAULT_ROLE` | `user` | Rol toegewezen aan automatisch aangemaakte SAML-gebruikers. Een van `admin`, `editor` of `user`. |
| `SAML_PROVIDER_NAME` | | Weergavelabel voor de SAML-aanmeldknop in de frontend (bijv. "Okta", "Azure AD"). Indien leeg, staat er "SAML" op de knop. |
| `SAML_USERNAME_ATTRIBUTE` | | SAML-assertie-attribuut dat als gebruikersnaam wordt gebruikt. Indien leeg, wordt teruggevallen op het lokale deel van de e-mail, daarna NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | SAML-assertie-attribuut dat als e-mailadres van de gebruiker wordt gebruikt. |

De server weigert te starten als `SAML_ENABLED=true` en een van de drie vereiste variabelen (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) ontbreekt.

::: details Beveiligingsnotities
Zowel `wantAuthnResponseSigned` als `wantAssertionsSigned` zijn hardgecodeerd op `true`. SnapOtter wijst niet-ondertekende of onjuist ondertekende SAML-responses af. Asserties van een vertrouwde IdP worden behandeld als e-mailgeverifieerd.

Alleen SP-geïnitieerde login wordt ondersteund. SnapOtter ondersteunt geen IdP-geïnitieerde (ongevraagde) login of Single Logout (SLO). Uitloggen bij SnapOtter logt de gebruiker niet uit bij de IdP.
:::

## SP-metadata en URL's {#sp-metadata-and-urls}

Je IdP heeft drie waarden van SnapOtter nodig:

| Veld | Waarde |
|---|---|
| **ACS-URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP-metadata** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Als `EXTERNAL_URL` bijvoorbeeld `https://photos.example.com` is:

- ACS-URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- Metadata-eindpunt: `https://photos.example.com/api/auth/saml/metadata` (retourneert XML)

Sommige IdP's kunnen de SP-metadata-URL rechtstreeks importeren, waardoor de ACS-URL en Entity ID automatisch worden ingevuld.

## Providerinstellingen {#provider-setup}

### Okta {#okta}

1. Ga in de Okta-adminconsole naar **Applications > Create App Integration**.
2. Selecteer **SAML 2.0** en klik op **Next**.
3. Stel een naam in (bijv. "SnapOtter") en klik op **Next**.
4. Configureer de SAML-instellingen:
   - **Single sign-on URL**: Je ACS-URL (bijv. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Je Entity ID (bijv. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. Voeg onder **Attribute Statements** `email` toe, toegewezen aan `user.email`.
6. Klik op **Next**, daarna op **Finish**.
7. Ga naar het tabblad **Sign On**, klik op **View SAML setup instructions** en kopieer:
   - **Identity Provider Single Sign-On URL** naar `SAML_IDP_SSO_URL`
   - **X.509 Certificate** naar `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Ga in de Azure-portal naar **Microsoft Entra ID > Enterprise applications > New application**.
2. Klik op **Create your own application**, noem het "SnapOtter" en selecteer **Integrate any other application you don't find in the gallery**.
3. Ga naar **Single sign-on > SAML** en klik op **Edit** in de sectie **Basic SAML Configuration**:
   - **Identifier (Entity ID)**: Je Entity ID (bijv. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Je ACS-URL (bijv. `https://photos.example.com/api/auth/saml/callback`)
4. Download onder **SAML Certificates** het **Certificate (Base64)**.
5. Kopieer onder **Set up SnapOtter** de **Login URL**.
6. Stel `SAML_IDP_SSO_URL` in op de Login URL en `SAML_IDP_CERTIFICATE` op de inhoud van het gedownloade certificaat.
7. Wijs gebruikers of groepen toe aan de applicatie onder **Users and groups**.

### Google Workspace {#google-workspace}

1. Ga in de Google-adminconsole naar **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Noem de app "SnapOtter" en klik op **Continue**.
3. Kopieer op de pagina **Google Identity Provider details** de **SSO URL** en download het **Certificate**. Klik op **Continue**.
4. Configureer de Service Provider-details:
   - **ACS URL**: Je ACS-URL (bijv. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Je Entity ID (bijv. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Klik op **Continue**, daarna op **Finish**.
6. Zet de app **ON** voor je organisatie-eenheden.
7. Stel `SAML_IDP_SSO_URL` in op de SSO URL uit stap 3 en `SAML_IDP_CERTIFICATE` op de inhoud van het gedownloade certificaat.

### Generieke SAML 2.0-IdP {#generic-saml-2-0-idp}

Voor elke SAML 2.0-compatibele identiteitsprovider:

1. Maak een nieuwe SAML-applicatie/serviceprovider aan in je IdP.
2. Stel de **ACS-URL** in op `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Stel de **Entity ID** / **Audience** in op `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Configureer de IdP om het e-mailadres van de gebruiker te verzenden in een attribuut genaamd `email` (of stel `SAML_EMAIL_ATTRIBUTE` in om overeen te komen met de attribuutnaam van je IdP).
5. Kopieer de **IdP SSO URL** en het **ondertekeningscertificaat** naar `SAML_IDP_SSO_URL` en `SAML_IDP_CERTIFICATE`.

## Gebruikersprovisioning {#user-provisioning}

### Automatisch aanmaken {#auto-create}

Wanneer `SAML_AUTO_CREATE_USERS` op `true` staat (de standaard), wordt er een lokaal gebruikersaccount aangemaakt wanneer iemand voor het eerst via SAML inlogt. De rol wordt ingesteld op `SAML_DEFAULT_ROLE`.

De gebruikersnaam wordt afgeleid in deze volgorde:

1. De waarde van het assertie-attribuut opgegeven door `SAML_USERNAME_ATTRIBUTE` (indien ingesteld en aanwezig)
2. Het lokale deel van het e-mailadres (alles vóór `@`)
3. De SAML NameID

Als er een botsing van gebruikersnamen optreedt, wordt er een numeriek achtervoegsel toegevoegd (bijv. `jane` wordt `jane_2`).

### Automatisch koppelen {#auto-link}

Wanneer `SAML_AUTO_LINK_USERS` op `true` staat, koppelt SnapOtter een SAML-identiteit aan een bestaand lokaal account als de e-mailadressen overeenkomen. Dit is handig wanneer je vooraf aangemaakte gebruikersaccounts hebt en wilt dat ze SSO gaan gebruiken zonder hun gegevens te verliezen.

::: warning 
Schakel automatisch koppelen alleen in als je je SAML-IdP vertrouwt om e-mailadressen te verifiëren. Een niet-geverifieerd e-mailadres van een verkeerd geconfigureerde IdP zou iemand in staat kunnen stellen het account van een andere gebruiker over te nemen.
:::

### Attribuuttoewijzing {#attribute-mapping}

| SnapOtter-veld | Bron | Configuratie |
|---|---|---|
| E-mail | Assertie-attribuut | `SAML_EMAIL_ATTRIBUTE` (standaard: `email`) |
| Gebruikersnaam | Assertie-attribuut, e-mail of NameID | `SAML_USERNAME_ATTRIBUTE` (zie afleidingsvolgorde hierboven) |
| Externe ID | NameID | Altijd de SAML NameID, niet configureerbaar |

## SSO-afdwinging {#sso-enforcement}

Als je wilt vereisen dat alle gebruikers via SAML (of OIDC) inloggen en lokale wachtwoordlogin wilt blokkeren, schakel dan SSO-afdwinging in:

1. Zorg dat de `sso_enforcement`-enterprisefunctie gelicentieerd is (beschikbaar op team- en enterprise-plannen).
2. Zet in **Admin Settings > Security** de schakelaar **SSO Enforcement** aan.
3. Stel een **break-glass-gebruikersnaam** in: dit is het ene lokale account dat nog steeds met een wachtwoord kan inloggen, voor noodtoegang als de IdP onbereikbaar is.

Wanneer SSO-afdwinging actief is, retourneert elke lokale inlogpoging (behalve voor de break-glass-gebruiker) een 403-fout met de melding "Local password login is disabled. Please use SSO."

::: tip 
Configureer altijd een break-glass-gebruikersnaam voordat je SSO-afdwinging inschakelt. Zonder deze kun je buitengesloten raken van SnapOtter als je IdP uitvalt.
:::

## SAML naast OIDC gebruiken {#using-saml-alongside-oidc}

SAML en OIDC kunnen tegelijkertijd worden ingeschakeld. Wanneer beide actief zijn, toont de aanmeldpagina aparte knoppen voor elke provider (gelabeld door `SAML_PROVIDER_NAME` en `OIDC_PROVIDER_NAME`). Gebruikers kunnen met beide methoden inloggen.

Beide providers delen dezelfde instellingen voor automatisch aanmaken, automatisch koppelen en SSO-afdwinging onafhankelijk van elkaar: elk heeft zijn eigen `*_AUTO_CREATE_USERS`-, `*_AUTO_LINK_USERS`- en `*_DEFAULT_ROLE`-variabelen.

## Problemen oplossen {#troubleshooting}

### Assertievalidatie mislukt {#assertion-validation-failed}

De handtekening van de SAML-response of de assertiehandtekening kon niet worden geverifieerd. Controleer:

- Het certificaat in `SAML_IDP_CERTIFICATE` komt overeen met het huidige ondertekeningscertificaat in je IdP (certificaten roteren, dus controleer op vervaldatum)
- Het certificaat is in PEM-formaat (begint met `-----BEGIN CERTIFICATE-----`)
- Het certificaat is de volledige tekst, niet een bestandspad
- De ACS-URL en Entity ID geconfigureerd in je IdP komen exact overeen met de waarden van SnapOtter (schema, host, poort, pad)

### Ontbrekende attributen {#missing-attributes}

Als gebruikersnamen of e-mailadressen leeg zijn na het inloggen, verzendt je IdP mogelijk niet de verwachte attributen. Controleer:

- Je IdP is geconfigureerd om een `email`-attribuut vrij te geven (of waar `SAML_EMAIL_ATTRIBUTE` ook op is ingesteld)
- Verifieer bij gebruik van `SAML_USERNAME_ATTRIBUTE` dat dat attribuut in de assertie is opgenomen
- Sommige IdP's vereisen expliciete configuratie van attribuuttoewijzing voordat ze claims vrijgeven

### Klokverschil {#clock-skew}

SAML-asserties bevatten tijdstempelvoorwaarden (`NotBefore`, `NotOnOrAfter`). Als je serverklok en de klok van de IdP niet gelijklopen, mislukt de assertievalidatie. Draai NTP op beide machines om de klokken uitgelijnd te houden.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Deze waarschuwing verschijnt in de serverlogs wanneer `SAML_ENABLED=true` maar de licentie de `saml_sso`-functie niet bevat. Verifieer je licentiesleutel en plan. De `saml_sso`-functie is beschikbaar op team- en enterprise-plannen.

### Login stuurt terug met fout {#login-redirects-back-with-error}

Als het klikken op de SAML-aanmeldknop je terugstuurt naar de aanmeldpagina met een fout, controleer dan de serverlogs voor details. Veelvoorkomende oorzaken:

- De IdP SSO URL is onbereikbaar vanaf de server
- De IdP heeft het authenticatieverzoek geweigerd (controleer de auditlogs van de IdP)
- De IdP retourneerde een niet-ondertekende response (SnapOtter vereist dat zowel de response als de assertie ondertekend zijn)
