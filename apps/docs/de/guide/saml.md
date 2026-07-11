---
description: "Richten Sie SAML-2.0-Single-Sign-On für SnapOtter ein. Schritt-für-Schritt-Anleitungen für Okta, Azure AD / Entra ID, Google Workspace und andere SAML-Identitätsanbieter."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 29cf0d9ed663
---

# SAML SSO {#saml-sso}

SnapOtter unterstützt SAML 2.0 für Single Sign-On. Benutzer können sich über einen externen Identitätsanbieter (Okta, Azure AD / Entra ID, Google Workspace oder einen beliebigen standardkonformen SAML-2.0-IdP) anmelden, anstatt sich lokal mit Benutzername/Passwort zu authentifizieren.

::: tip Enterprise-Funktion
SAML SSO erfordert eine **team**- oder **enterprise**-Lizenz mit der Funktion `saml_sso`. Wenn `SAML_ENABLED=true` ohne gültige Lizenz gesetzt ist, werden die SAML-Routen stillschweigend übersprungen und eine Warnung protokolliert.
:::

## Voraussetzungen {#prerequisites}

- Eine laufende SnapOtter-Instanz, die unter einer öffentlichen URL erreichbar ist
- `EXTERNAL_URL` auf diese öffentliche URL gesetzt (z. B. `https://photos.example.com`)
- Ein team- oder enterprise-Lizenzschlüssel mit der Funktion `saml_sso`
- Admin-Zugriff auf Ihren SAML-Identitätsanbieter

## Schnellstart {#quick-start}

Fügen Sie diese Umgebungsvariablen zu Ihrer `docker-compose.yml` hinzu:

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

Starten Sie den Container neu. Eine Schaltfläche "Mit SAML anmelden" (oder die durch `SAML_PROVIDER_NAME` gesetzte Bezeichnung) erscheint auf der Anmeldeseite.

## Konfigurationsreferenz {#configuration-reference}

| Variable | Standard | Beschreibung |
|---|---|---|
| `SAML_ENABLED` | `false` | SAML-Anmeldung aktivieren. |
| `SAML_IDP_SSO_URL` | | SSO-Endpunkt-URL des IdP. **Erforderlich**, wenn SAML aktiviert ist. |
| `SAML_IDP_CERTIFICATE` | | X.509-Signaturzertifikat des IdP im PEM-Format (der Zertifikatstext selbst, nicht ein Dateipfad). **Erforderlich**, wenn SAML aktiviert ist. |
| `EXTERNAL_URL` | | Die öffentliche URL, unter der SnapOtter erreichbar ist. **Erforderlich**, wenn SAML aktiviert ist. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | An den IdP gesendete SP-Entity-ID / Audience-URI. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion-Consumer-Service-URL (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Bei der ersten SAML-Anmeldung automatisch ein lokales Benutzerkonto erstellen. |
| `SAML_AUTO_LINK_USERS` | `false` | Eine SAML-Identität mit einem bestehenden lokalen Benutzer verknüpfen, wenn die E-Mail-Adresse übereinstimmt. |
| `SAML_DEFAULT_ROLE` | `user` | Rolle, die automatisch erstellten SAML-Benutzern zugewiesen wird. Eine von `admin`, `editor` oder `user`. |
| `SAML_PROVIDER_NAME` | | Anzeigebezeichnung für die SAML-Anmeldeschaltfläche im Frontend (z. B. "Okta", "Azure AD"). Wenn leer, zeigt die Schaltfläche "SAML" an. |
| `SAML_USERNAME_ATTRIBUTE` | | SAML-Assertion-Attribut, das als Benutzername verwendet wird. Wenn leer, wird auf den lokalen Teil der E-Mail und dann auf die NameID zurückgegriffen. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | SAML-Assertion-Attribut, das als E-Mail-Adresse des Benutzers verwendet wird. |

Der Server startet nicht, wenn `SAML_ENABLED=true` und eine der drei erforderlichen Variablen (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) fehlt.

::: details Sicherheitshinweise
Sowohl `wantAuthnResponseSigned` als auch `wantAssertionsSigned` sind fest auf `true` codiert. SnapOtter lehnt unsignierte oder unsachgemäß signierte SAML-Antworten ab. Assertions von einem vertrauenswürdigen IdP werden als E-Mail-verifiziert behandelt.

Es wird nur SP-initiierte Anmeldung unterstützt. SnapOtter unterstützt keine IdP-initiierte (unaufgeforderte) Anmeldung und kein Single Logout (SLO). Das Abmelden von SnapOtter meldet den Benutzer nicht vom IdP ab.
:::

## SP-Metadaten und URLs {#sp-metadata-and-urls}

Ihr IdP benötigt drei Werte von SnapOtter:

| Feld | Wert |
|---|---|
| **ACS-URL** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity-ID** / **Audience-URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP-Metadaten** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Wenn `EXTERNAL_URL` beispielsweise `https://photos.example.com` ist:

- ACS-URL: `https://photos.example.com/api/auth/saml/callback`
- Entity-ID: `https://photos.example.com/api/auth/saml/metadata`
- Metadaten-Endpunkt: `https://photos.example.com/api/auth/saml/metadata` (gibt XML zurück)

Manche IdPs können die SP-Metadaten-URL direkt importieren, wodurch die ACS-URL und die Entity-ID automatisch ausgefüllt werden.

## Anbietereinrichtung {#provider-setup}

### Okta {#okta}

1. Gehen Sie in der Okta-Admin-Konsole zu **Applications > Create App Integration**.
2. Wählen Sie **SAML 2.0** und klicken Sie auf **Next**.
3. Legen Sie einen Namen fest (z. B. "SnapOtter") und klicken Sie auf **Next**.
4. Konfigurieren Sie die SAML-Einstellungen:
   - **Single sign-on URL**: Ihre ACS-URL (z. B. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)**: Ihre Entity-ID (z. B. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. Fügen Sie unter **Attribute Statements** `email` hinzu, zugeordnet zu `user.email`.
6. Klicken Sie auf **Next**, dann auf **Finish**.
7. Gehen Sie zur Registerkarte **Sign On**, klicken Sie auf **View SAML setup instructions** und kopieren Sie:
   - **Identity Provider Single Sign-On URL** in `SAML_IDP_SSO_URL`
   - **X.509 Certificate** in `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Gehen Sie im Azure-Portal zu **Microsoft Entra ID > Enterprise applications > New application**.
2. Klicken Sie auf **Create your own application**, benennen Sie sie "SnapOtter" und wählen Sie **Integrate any other application you don't find in the gallery**.
3. Gehen Sie zu **Single sign-on > SAML** und klicken Sie im Abschnitt **Basic SAML Configuration** auf **Edit**:
   - **Identifier (Entity ID)**: Ihre Entity-ID (z. B. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)**: Ihre ACS-URL (z. B. `https://photos.example.com/api/auth/saml/callback`)
4. Laden Sie unter **SAML Certificates** das **Certificate (Base64)** herunter.
5. Kopieren Sie unter **Set up SnapOtter** die **Login URL**.
6. Setzen Sie `SAML_IDP_SSO_URL` auf die Login-URL und `SAML_IDP_CERTIFICATE` auf den Inhalt des heruntergeladenen Zertifikats.
7. Weisen Sie der Anwendung unter **Users and groups** Benutzer oder Gruppen zu.

### Google Workspace {#google-workspace}

1. Gehen Sie in der Google-Admin-Konsole zu **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Benennen Sie die App "SnapOtter" und klicken Sie auf **Continue**.
3. Kopieren Sie auf der Seite **Google Identity Provider details** die **SSO URL** und laden Sie das **Certificate** herunter. Klicken Sie auf **Continue**.
4. Konfigurieren Sie die Service-Provider-Details:
   - **ACS URL**: Ihre ACS-URL (z. B. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID**: Ihre Entity-ID (z. B. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. Klicken Sie auf **Continue**, dann auf **Finish**.
6. Schalten Sie die App für Ihre Organisationseinheiten **ON**.
7. Setzen Sie `SAML_IDP_SSO_URL` auf die SSO-URL aus Schritt 3 und `SAML_IDP_CERTIFICATE` auf den Inhalt des heruntergeladenen Zertifikats.

### Generischer SAML-2.0-IdP {#generic-saml-2-0-idp}

Für jeden SAML-2.0-konformen Identitätsanbieter:

1. Erstellen Sie eine neue SAML-Anwendung/einen neuen Service Provider in Ihrem IdP.
2. Setzen Sie die **ACS-URL** auf `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Setzen Sie die **Entity-ID** / **Audience** auf `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Konfigurieren Sie den IdP so, dass er die E-Mail des Benutzers in einem Attribut namens `email` sendet (oder setzen Sie `SAML_EMAIL_ATTRIBUTE`, damit es dem Attributnamen Ihres IdP entspricht).
5. Kopieren Sie die **IdP-SSO-URL** und das **Signaturzertifikat** in `SAML_IDP_SSO_URL` und `SAML_IDP_CERTIFICATE`.

## Benutzerbereitstellung {#user-provisioning}

### Automatisches Erstellen {#auto-create}

Wenn `SAML_AUTO_CREATE_USERS` auf `true` (die Voreinstellung) steht, wird beim ersten Anmelden per SAML ein lokales Benutzerkonto erstellt. Die Rolle wird auf `SAML_DEFAULT_ROLE` gesetzt.

Der Benutzername wird in dieser Reihenfolge abgeleitet:

1. Der Wert des durch `SAML_USERNAME_ATTRIBUTE` angegebenen Assertion-Attributs (falls gesetzt und vorhanden)
2. Der lokale Teil der E-Mail-Adresse (alles vor `@`)
3. Die SAML-NameID

Bei einer Kollision des Benutzernamens wird ein numerisches Suffix angehängt (z. B. `jane` wird zu `jane_2`).

### Automatisches Verknüpfen {#auto-link}

Wenn `SAML_AUTO_LINK_USERS` auf `true` steht, verknüpft SnapOtter eine SAML-Identität mit einem bestehenden lokalen Konto, wenn die E-Mail-Adressen übereinstimmen. Das ist nützlich, wenn Sie Benutzerkonten vorab erstellt haben und möchten, dass diese SSO nutzen, ohne ihre Daten zu verlieren.

::: warning 
Aktivieren Sie das automatische Verknüpfen nur, wenn Sie Ihrem SAML-IdP zutrauen, E-Mail-Adressen zu verifizieren. Eine nicht verifizierte E-Mail von einem fehlkonfigurierten IdP könnte es jemandem ermöglichen, das Konto eines anderen Benutzers zu übernehmen.
:::

### Attributzuordnung {#attribute-mapping}

| SnapOtter-Feld | Quelle | Konfiguration |
|---|---|---|
| E-Mail | Assertion-Attribut | `SAML_EMAIL_ATTRIBUTE` (Standard: `email`) |
| Benutzername | Assertion-Attribut, E-Mail oder NameID | `SAML_USERNAME_ATTRIBUTE` (siehe Ableitungsreihenfolge oben) |
| Externe ID | NameID | Immer die SAML-NameID, nicht konfigurierbar |

## SSO-Erzwingung {#sso-enforcement}

Wenn Sie verlangen möchten, dass sich alle Benutzer per SAML (oder OIDC) anmelden, und die lokale Passwortanmeldung blockieren möchten, aktivieren Sie die SSO-Erzwingung:

1. Stellen Sie sicher, dass die Enterprise-Funktion `sso_enforcement` lizenziert ist (verfügbar in den team- und enterprise-Plänen).
2. Schalten Sie unter **Admin-Einstellungen > Sicherheit** die **SSO-Erzwingung** ein.
3. Legen Sie einen **Break-Glass-Benutzernamen** fest: Dies ist das eine lokale Konto, das sich bei Notfallzugriff weiterhin mit einem Passwort anmelden kann, falls der IdP nicht erreichbar ist.

Wenn die SSO-Erzwingung aktiv ist, gibt jeder lokale Anmeldeversuch (außer für den Break-Glass-Benutzer) einen 403-Fehler mit der Meldung "Local password login is disabled. Please use SSO." zurück.

::: tip 
Konfigurieren Sie immer einen Break-Glass-Benutzernamen, bevor Sie die SSO-Erzwingung aktivieren. Andernfalls könnten Sie aus SnapOtter ausgesperrt werden, falls Ihr IdP ausfällt.
:::

## SAML zusammen mit OIDC verwenden {#using-saml-alongside-oidc}

SAML und OIDC können gleichzeitig aktiviert werden. Wenn beide aktiv sind, zeigt die Anmeldeseite separate Schaltflächen für jeden Anbieter an (beschriftet durch `SAML_PROVIDER_NAME` und `OIDC_PROVIDER_NAME`). Benutzer können sich mit beiden Methoden anmelden.

Beide Anbieter teilen sich die Einstellungen für automatisches Erstellen, automatisches Verknüpfen und SSO-Erzwingung unabhängig voneinander: Jeder hat seine eigenen Variablen `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` und `*_DEFAULT_ROLE`.

## Fehlerbehebung {#troubleshooting}

### Assertion-Validierung fehlgeschlagen {#assertion-validation-failed}

Die Signatur der SAML-Antwort oder der Assertion konnte nicht verifiziert werden. Prüfen Sie:

- Das Zertifikat in `SAML_IDP_CERTIFICATE` stimmt mit dem aktuellen Signaturzertifikat in Ihrem IdP überein (Zertifikate rotieren, prüfen Sie also auf Ablauf)
- Das Zertifikat ist im PEM-Format (beginnt mit `-----BEGIN CERTIFICATE-----`)
- Das Zertifikat ist der vollständige Text, kein Dateipfad
- Die in Ihrem IdP konfigurierte ACS-URL und Entity-ID stimmen exakt mit den Werten von SnapOtter überein (Schema, Host, Port, Pfad)

### Fehlende Attribute {#missing-attributes}

Wenn Benutzernamen oder E-Mails nach der Anmeldung leer sind, sendet Ihr IdP möglicherweise nicht die erwarteten Attribute. Prüfen Sie:

- Ihr IdP ist so konfiguriert, dass er ein Attribut `email` freigibt (oder das, worauf `SAML_EMAIL_ATTRIBUTE` gesetzt ist)
- Wenn Sie `SAML_USERNAME_ATTRIBUTE` verwenden, prüfen Sie, ob dieses Attribut in der Assertion enthalten ist
- Manche IdPs erfordern eine explizite Attributzuordnungskonfiguration, bevor sie Claims freigeben

### Uhrenabweichung {#clock-skew}

SAML-Assertions enthalten Zeitstempelbedingungen (`NotBefore`, `NotOnOrAfter`). Wenn die Uhr Ihres Servers und die Uhr des IdP nicht synchron sind, schlägt die Assertion-Validierung fehl. Führen Sie NTP auf beiden Maschinen aus, um die Uhren aufeinander abzustimmen.

### "SAML is enabled via env but saml_sso enterprise feature is not licensed" {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Diese Warnung erscheint in den Serverprotokollen, wenn `SAML_ENABLED=true`, die Lizenz aber die Funktion `saml_sso` nicht enthält. Überprüfen Sie Ihren Lizenzschlüssel und Plan. Die Funktion `saml_sso` ist in den team- und enterprise-Plänen verfügbar.

### Anmeldung leitet mit Fehler zurück {#login-redirects-back-with-error}

Wenn das Klicken auf die SAML-Anmeldeschaltfläche mit einem Fehler zurück auf die Anmeldeseite leitet, prüfen Sie die Serverprotokolle auf Details. Häufige Ursachen:

- Die IdP-SSO-URL ist vom Server aus nicht erreichbar
- Der IdP hat die Authentifizierungsanfrage abgelehnt (prüfen Sie die Audit-Protokolle des IdP)
- Der IdP hat eine unsignierte Antwort zurückgegeben (SnapOtter verlangt, dass sowohl die Antwort als auch die Assertion signiert sind)
