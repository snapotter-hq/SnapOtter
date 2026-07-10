---
description: "Configurez l'authentification unique SAML 2.0 pour SnapOtter. Guides étape par étape pour Okta, Azure AD / Entra ID, Google Workspace et d'autres fournisseurs d'identité SAML."
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: f6164bc8d2bb
---

# SAML SSO {#saml-sso}

SnapOtter prend en charge SAML 2.0 pour l'authentification unique. Les utilisateurs peuvent se connecter via un fournisseur d'identité externe (Okta, Azure AD / Entra ID, Google Workspace ou tout IdP SAML 2.0 standard) au lieu de l'authentification locale par nom d'utilisateur/mot de passe.

::: tip Fonctionnalité entreprise
SAML SSO nécessite une licence **team** ou **enterprise** avec la fonctionnalité `saml_sso`. Si `SAML_ENABLED=true` est défini sans licence valide, les routes SAML sont ignorées en silence et un avertissement est enregistré.
:::

## Prérequis {#prerequisites}

- Une instance SnapOtter en cours d'exécution accessible à une URL publique
- `EXTERNAL_URL` défini sur cette URL publique (par ex. `https://photos.example.com`)
- Une clé de licence team ou enterprise avec la fonctionnalité `saml_sso`
- Un accès administrateur à votre fournisseur d'identité SAML

## Démarrage rapide {#quick-start}

Ajoutez ces variables d'environnement à votre `docker-compose.yml` :

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

Redémarrez le conteneur. Un bouton « Se connecter avec SAML » (ou le libellé défini par `SAML_PROVIDER_NAME`) apparaît sur la page de connexion.

## Référence de configuration {#configuration-reference}

| Variable | Par défaut | Description |
|---|---|---|
| `SAML_ENABLED` | `false` | Active la connexion SAML. |
| `SAML_IDP_SSO_URL` | | URL du point de terminaison SSO de l'IdP. **Requise** lorsque SAML est activé. |
| `SAML_IDP_CERTIFICATE` | | Certificat de signature X.509 de l'IdP au format PEM (le texte du certificat lui-même, pas un chemin de fichier). **Requis** lorsque SAML est activé. |
| `EXTERNAL_URL` | | L'URL publique où SnapOtter est accessible. **Requise** lorsque SAML est activé. |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | SP Entity ID / Audience URI envoyé à l'IdP. |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | URL du service consommateur d'assertions (ACS). |
| `SAML_AUTO_CREATE_USERS` | `true` | Créer automatiquement un compte utilisateur local lors de la première connexion SAML. |
| `SAML_AUTO_LINK_USERS` | `false` | Lier une identité SAML à un utilisateur local existant si l'adresse e-mail correspond. |
| `SAML_DEFAULT_ROLE` | `user` | Rôle attribué aux utilisateurs SAML créés automatiquement. Parmi `admin`, `editor` ou `user`. |
| `SAML_PROVIDER_NAME` | | Libellé d'affichage du bouton de connexion SAML sur le frontend (par ex. « Okta », « Azure AD »). Si vide, le bouton indique « SAML ». |
| `SAML_USERNAME_ATTRIBUTE` | | Attribut de l'assertion SAML utilisé comme nom d'utilisateur. Si vide, retombe sur la partie locale de l'e-mail, puis sur le NameID. |
| `SAML_EMAIL_ATTRIBUTE` | `email` | Attribut de l'assertion SAML utilisé comme adresse e-mail de l'utilisateur. |

Le serveur refuse de démarrer si `SAML_ENABLED=true` et que l'une des trois variables requises (`SAML_IDP_SSO_URL`, `SAML_IDP_CERTIFICATE`, `EXTERNAL_URL`) est manquante.

::: details Notes de sécurité
`wantAuthnResponseSigned` et `wantAssertionsSigned` sont tous deux codés en dur à `true`. SnapOtter rejette les réponses SAML non signées ou signées de manière incorrecte. Les assertions provenant d'un IdP de confiance sont traitées comme ayant un e-mail vérifié.

Seule la connexion initiée par le SP est prise en charge. SnapOtter ne prend pas en charge la connexion initiée par l'IdP (non sollicitée) ni la déconnexion unique (SLO). Se déconnecter de SnapOtter ne déconnecte pas l'utilisateur de l'IdP.
:::

## Métadonnées et URL du SP {#sp-metadata-and-urls}

Votre IdP a besoin de trois valeurs de la part de SnapOtter :

| Champ | Valeur |
|---|---|
| **URL ACS** (Assertion Consumer Service) | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **Métadonnées du SP** (XML) | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

Par exemple, si `EXTERNAL_URL` est `https://photos.example.com` :

- URL ACS : `https://photos.example.com/api/auth/saml/callback`
- Entity ID : `https://photos.example.com/api/auth/saml/metadata`
- Point de terminaison des métadonnées : `https://photos.example.com/api/auth/saml/metadata` (renvoie du XML)

Certains IdP peuvent importer directement l'URL des métadonnées du SP, ce qui remplit automatiquement l'URL ACS et l'Entity ID.

## Configuration du fournisseur {#provider-setup}

### Okta {#okta}

1. Dans la console d'administration Okta, allez dans **Applications > Create App Integration**.
2. Sélectionnez **SAML 2.0** et cliquez sur **Next**.
3. Définissez un nom (par ex. « SnapOtter ») et cliquez sur **Next**.
4. Configurez les paramètres SAML :
   - **Single sign-on URL** : Votre URL ACS (par ex. `https://photos.example.com/api/auth/saml/callback`)
   - **Audience URI (SP Entity ID)** : Votre Entity ID (par ex. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format** : EmailAddress
   - **Application username** : Email
5. Sous **Attribute Statements**, ajoutez `email` mappé sur `user.email`.
6. Cliquez sur **Next**, puis sur **Finish**.
7. Allez dans l'onglet **Sign On**, cliquez sur **View SAML setup instructions**, et copiez :
   - **Identity Provider Single Sign-On URL** dans `SAML_IDP_SSO_URL`
   - **X.509 Certificate** dans `SAML_IDP_CERTIFICATE`

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Dans le portail Azure, allez dans **Microsoft Entra ID > Enterprise applications > New application**.
2. Cliquez sur **Create your own application**, nommez-la « SnapOtter » et sélectionnez **Integrate any other application you don't find in the gallery**.
3. Allez dans **Single sign-on > SAML** et cliquez sur **Edit** dans la section **Basic SAML Configuration** :
   - **Identifier (Entity ID)** : Votre Entity ID (par ex. `https://photos.example.com/api/auth/saml/metadata`)
   - **Reply URL (ACS URL)** : Votre URL ACS (par ex. `https://photos.example.com/api/auth/saml/callback`)
4. Sous **SAML Certificates**, téléchargez le **Certificate (Base64)**.
5. Sous **Set up SnapOtter**, copiez le **Login URL**.
6. Définissez `SAML_IDP_SSO_URL` sur le Login URL et `SAML_IDP_CERTIFICATE` sur le contenu du certificat téléchargé.
7. Attribuez des utilisateurs ou des groupes à l'application sous **Users and groups**.

### Google Workspace {#google-workspace}

1. Dans la console d'administration Google, allez dans **Apps > Web and mobile apps > Add app > Add custom SAML app**.
2. Nommez l'application « SnapOtter » et cliquez sur **Continue**.
3. Sur la page **Google Identity Provider details**, copiez la **SSO URL** et téléchargez le **Certificate**. Cliquez sur **Continue**.
4. Configurez les détails du fournisseur de service :
   - **ACS URL** : Votre URL ACS (par ex. `https://photos.example.com/api/auth/saml/callback`)
   - **Entity ID** : Votre Entity ID (par ex. `https://photos.example.com/api/auth/saml/metadata`)
   - **Name ID format** : EMAIL
   - **Name ID** : Basic Information > Primary email
5. Cliquez sur **Continue**, puis sur **Finish**.
6. Activez l'application (**ON**) pour vos unités organisationnelles.
7. Définissez `SAML_IDP_SSO_URL` sur la SSO URL de l'étape 3 et `SAML_IDP_CERTIFICATE` sur le contenu du certificat téléchargé.

### IdP SAML 2.0 générique {#generic-saml-2-0-idp}

Pour tout fournisseur d'identité conforme à SAML 2.0 :

1. Créez une nouvelle application/un nouveau fournisseur de service SAML dans votre IdP.
2. Définissez l'**URL ACS** sur `${EXTERNAL_URL}/api/auth/saml/callback`.
3. Définissez l'**Entity ID** / l'**Audience** sur `${EXTERNAL_URL}/api/auth/saml/metadata`.
4. Configurez l'IdP pour envoyer l'e-mail de l'utilisateur dans un attribut nommé `email` (ou définissez `SAML_EMAIL_ATTRIBUTE` pour correspondre au nom d'attribut de votre IdP).
5. Copiez l'**URL SSO de l'IdP** et le **certificat de signature** dans `SAML_IDP_SSO_URL` et `SAML_IDP_CERTIFICATE`.

## Provisionnement des utilisateurs {#user-provisioning}

### Création automatique {#auto-create}

Lorsque `SAML_AUTO_CREATE_USERS` vaut `true` (par défaut), un compte utilisateur local est créé la première fois qu'une personne se connecte via SAML. Le rôle est défini sur `SAML_DEFAULT_ROLE`.

Le nom d'utilisateur est dérivé dans cet ordre :

1. La valeur de l'attribut d'assertion spécifié par `SAML_USERNAME_ATTRIBUTE` (si défini et présent)
2. La partie locale de l'adresse e-mail (tout ce qui précède `@`)
3. Le NameID SAML

En cas de collision de nom d'utilisateur, un suffixe numérique est ajouté (par ex. `jane` devient `jane_2`).

### Liaison automatique {#auto-link}

Lorsque `SAML_AUTO_LINK_USERS` vaut `true`, SnapOtter lie une identité SAML à un compte local existant si les adresses e-mail correspondent. C'est utile lorsque vous avez pré-créé des comptes utilisateurs et souhaitez qu'ils commencent à utiliser le SSO sans perdre leurs données.

::: warning 
N'activez la liaison automatique que si vous faites confiance à votre IdP SAML pour vérifier les adresses e-mail. Un e-mail non vérifié provenant d'un IdP mal configuré pourrait permettre à quelqu'un de prendre le contrôle du compte d'un autre utilisateur.
:::

### Mappage des attributs {#attribute-mapping}

| Champ SnapOtter | Source | Configuration |
|---|---|---|
| E-mail | Attribut d'assertion | `SAML_EMAIL_ATTRIBUTE` (par défaut : `email`) |
| Nom d'utilisateur | Attribut d'assertion, e-mail ou NameID | `SAML_USERNAME_ATTRIBUTE` (voir l'ordre de dérivation ci-dessus) |
| ID externe | NameID | Toujours le NameID SAML, non configurable |

## Application du SSO {#sso-enforcement}

Si vous voulez exiger que tous les utilisateurs se connectent via SAML (ou OIDC) et bloquer la connexion locale par mot de passe, activez l'application du SSO :

1. Assurez-vous que la fonctionnalité entreprise `sso_enforcement` est sous licence (disponible sur les plans team et enterprise).
2. Dans **Admin Settings > Security**, activez **SSO Enforcement**.
3. Définissez un **nom d'utilisateur de secours (break-glass)** : c'est le seul compte local qui peut encore se connecter avec un mot de passe, pour un accès d'urgence si l'IdP est injoignable.

Lorsque l'application du SSO est active, toute tentative de connexion locale (à l'exception de l'utilisateur de secours) renvoie une erreur 403 avec le message « Local password login is disabled. Please use SSO. »

::: tip 
Configurez toujours un nom d'utilisateur de secours avant d'activer l'application du SSO. Sans lui, vous pourriez être verrouillé hors de SnapOtter si votre IdP tombe en panne.
:::

## Utiliser SAML avec OIDC {#using-saml-alongside-oidc}

SAML et OIDC peuvent être activés simultanément. Lorsque les deux sont actifs, la page de connexion affiche des boutons distincts pour chaque fournisseur (libellés par `SAML_PROVIDER_NAME` et `OIDC_PROVIDER_NAME`). Les utilisateurs peuvent se connecter avec l'une ou l'autre méthode.

Les deux fournisseurs partagent indépendamment les mêmes paramètres de création automatique, de liaison automatique et d'application du SSO : chacun a ses propres variables `*_AUTO_CREATE_USERS`, `*_AUTO_LINK_USERS` et `*_DEFAULT_ROLE`.

## Dépannage {#troubleshooting}

### Échec de la validation de l'assertion {#assertion-validation-failed}

La signature de la réponse SAML ou la signature de l'assertion n'a pas pu être vérifiée. Vérifiez :

- Le certificat dans `SAML_IDP_CERTIFICATE` correspond au certificat de signature actuel de votre IdP (les certificats sont renouvelés, vérifiez donc l'expiration)
- Le certificat est au format PEM (commence par `-----BEGIN CERTIFICATE-----`)
- Le certificat est le texte complet, pas un chemin de fichier
- L'URL ACS et l'Entity ID configurés dans votre IdP correspondent exactement aux valeurs de SnapOtter (schéma, hôte, port, chemin)

### Attributs manquants {#missing-attributes}

Si les noms d'utilisateur ou les e-mails sont vides après la connexion, votre IdP n'envoie peut-être pas les attributs attendus. Vérifiez :

- Votre IdP est configuré pour libérer un attribut `email` (ou la valeur définie pour `SAML_EMAIL_ATTRIBUTE`)
- Si vous utilisez `SAML_USERNAME_ATTRIBUTE`, vérifiez que cet attribut est inclus dans l'assertion
- Certains IdP exigent une configuration explicite de mappage d'attributs avant de libérer les revendications

### Décalage d'horloge {#clock-skew}

Les assertions SAML incluent des conditions d'horodatage (`NotBefore`, `NotOnOrAfter`). Si l'horloge de votre serveur et celle de l'IdP sont désynchronisées, la validation de l'assertion échoue. Exécutez NTP sur les deux machines pour maintenir les horloges alignées.

### « SAML is enabled via env but saml_sso enterprise feature is not licensed » {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

Cet avertissement apparaît dans les journaux du serveur lorsque `SAML_ENABLED=true` mais que la licence n'inclut pas la fonctionnalité `saml_sso`. Vérifiez votre clé de licence et votre plan. La fonctionnalité `saml_sso` est disponible sur les plans team et enterprise.

### La connexion redirige en arrière avec une erreur {#login-redirects-back-with-error}

Si cliquer sur le bouton de connexion SAML redirige vers la page de connexion avec une erreur, consultez les journaux du serveur pour plus de détails. Causes courantes :

- L'URL SSO de l'IdP est injoignable depuis le serveur
- L'IdP a rejeté la requête d'authentification (consultez les journaux d'audit de l'IdP)
- L'IdP a renvoyé une réponse non signée (SnapOtter exige que la réponse et l'assertion soient toutes deux signées)
