---
description: "Configurez le provisionnement SCIM 2.0 pour synchroniser les utilisateurs et les groupes depuis votre fournisseur d'identité vers SnapOtter. Couvre Okta, Azure AD / Entra ID et les intégrations personnalisées."
i18n_source_hash: bbd50119ec12
i18n_provenance: human
i18n_output_hash: 7bd64dc5c777
---

# Provisionnement SCIM {#scim-provisioning}

SnapOtter implémente SCIM 2.0 (System for Cross-domain Identity Management) pour le provisionnement automatisé des utilisateurs et des groupes. Votre fournisseur d'identité peut créer, mettre à jour, désactiver et réactiver des comptes utilisateurs et synchroniser automatiquement les appartenances aux groupes.

::: tip Fonctionnalité entreprise
Le provisionnement SCIM nécessite une licence **entreprise** avec la fonctionnalité `scim`. Il n'est pas disponible sur le plan équipe. Sans cette fonctionnalité, tous les points de terminaison SCIM (à l'exception de la découverte) renvoient 403.
:::

## Prérequis {#prerequisites}

- Une instance SnapOtter en cours d'exécution accessible à une URL publique
- Une clé de licence entreprise avec la fonctionnalité `scim`
- Un accès administrateur à SnapOtter (la permission `users:manage` est requise pour générer ou révoquer un jeton SCIM)
- Un accès administrateur aux paramètres de provisionnement de votre fournisseur d'identité

## Démarrage rapide {#quick-start}

1. Générez un jeton bearer SCIM :

```bash
curl -X POST https://photos.example.com/api/v1/enterprise/scim/token \
  -H "Cookie: snapotter-session=YOUR_SESSION" \
  -H "Content-Type: application/json"
```

La réponse contient le jeton. Enregistrez-le immédiatement ; il ne pourra pas être récupéré à nouveau.

```json
{
  "token": "a1b2c3d4e5f6...",
  "message": "Save this token - it cannot be retrieved again"
}
```

2. Dans votre fournisseur d'identité, configurez le provisionnement SCIM avec :
   - **URL de base** : `https://photos.example.com/api/v1/scim/v2`
   - **Authentification** : jeton bearer (collez le jeton de l'étape 1)

## Authentification {#authentication}

Les points de terminaison SCIM utilisent un jeton bearer dédié, distinct des sessions utilisateur et des clés API.

### Génération d'un jeton {#generating-a-token}

`POST /api/v1/enterprise/scim/token` génère un nouveau jeton SCIM. Ce point de terminaison nécessite une session valide avec la permission `users:manage`.

Le jeton est renvoyé en texte clair une seule fois. SnapOtter ne stocke qu'un hachage scrypt. Si vous perdez le jeton, révoquez-le et générez-en un nouveau.

Un seul jeton SCIM est actif à la fois. Générer un nouveau jeton remplace le précédent.

### Révocation d'un jeton {#revoking-a-token}

`DELETE /api/v1/enterprise/scim/token` révoque le jeton SCIM actuel. Ce point de terminaison nécessite également `users:manage`.

### Limitation de débit {#rate-limiting}

Les points de terminaison SCIM sont limités à 1000 requêtes par minute et par jeton. Dépasser cette limite renvoie HTTP 429.

## Ressources prises en charge {#supported-resources}

| Ressource SCIM | Concept SnapOtter | Créer | Lire | Mettre à jour | Supprimer |
|---|---|---|---|---|---|
| User | Compte utilisateur | Oui | Oui | Oui | Suppression logique |
| Group | Équipe | Oui | Oui | Oui | Oui |

::: warning 
Les groupes SCIM correspondent aux **équipes** SnapOtter, pas aux rôles. SCIM ne peut pas définir le rôle d'un utilisateur. Tous les utilisateurs créés via SCIM se voient attribuer le rôle `user`. Pour modifier le rôle d'un utilisateur, utilisez l'interface d'administration de SnapOtter.
:::

## Opérations sur les utilisateurs {#user-operations}

### Créer un utilisateur {#create-user}

`POST /api/v1/scim/v2/Users`

Crée un nouveau compte utilisateur avec `authProvider` défini sur `scim` et le rôle `user`. L'utilisateur est affecté à l'équipe Default. Si `active` vaut `false`, le rôle est défini sur `disabled` à la place.

Attributs requis : `userName`. Facultatifs : `externalId`, `emails`, `active` (par défaut `true`).

### Lister et filtrer les utilisateurs {#list-and-filter-users}

`GET /api/v1/scim/v2/Users`

Renvoie une liste paginée des utilisateurs. Prend en charge les paramètres de requête `startIndex` et `count` (maximum 200 résultats par page).

Le filtrage prend en charge uniquement `eq` (égal), sur ces attributs :

- `userName eq "jane"`
- `externalId eq "ext-12345"`

Les autres opérateurs et attributs de filtrage renvoient HTTP 400.

### Obtenir un utilisateur {#get-user}

`GET /api/v1/scim/v2/Users/:id`

Renvoie un seul utilisateur par son identifiant utilisateur SnapOtter.

### Remplacer un utilisateur {#replace-user}

`PUT /api/v1/scim/v2/Users/:id`

Remplace les attributs de l'utilisateur. Prend en charge `userName`, `externalId`, `emails` et `active`. Les changements de nom d'utilisateur sont vérifiés pour détecter les conflits (409 si le nouveau nom d'utilisateur est déjà pris par un autre utilisateur).

### Modifier partiellement un utilisateur {#patch-user}

`PATCH /api/v1/scim/v2/Users/:id`

Mise à jour partielle utilisant SCIM PatchOp. Opérations prises en charge :

| Opération | Chemins |
|---|---|
| `replace` | `active`, `userName`, `externalId`, `emails`, `emails[type eq "work"].value`, `name.formatted`, `displayName` |
| `add` | Identique à `replace` |
| `remove` | `externalId`, `emails` |

Les chemins `name.formatted` et `displayName` sont acceptés pour des raisons de compatibilité mais n'ont aucun effet persistant (SnapOtter ne stocke pas de nom d'affichage distinct).

Les opérations `replace` sans valeur (où la valeur est un objet sans `path`) sont également prises en charge, avec les clés `userName`, `externalId`, `emails` et `active`.

### Désactiver un utilisateur (suppression logique) {#deactivate-user-soft-delete}

`DELETE /api/v1/scim/v2/Users/:id`

SnapOtter ne supprime pas définitivement les utilisateurs via SCIM. Au lieu de cela, DELETE effectue une désactivation logique :

1. Le rôle de l'utilisateur passe de sa valeur actuelle (par exemple `editor`) à `disabled:editor`, en préservant le rôle d'origine.
2. Le mot de passe de l'utilisateur est effacé.
3. Toutes les sessions actives sont révoquées.
4. Toutes les clés API sont révoquées.

L'utilisateur ne peut plus se connecter ni utiliser aucune clé API. Ses données (fichiers, historique) sont conservées.

### Réactiver un utilisateur {#reactivate-user}

Pour réactiver un utilisateur précédemment désactivé, envoyez une requête `PUT` ou `PATCH` avec `active: true`. SnapOtter restaure le rôle d'origine d'avant la désactivation (par exemple `disabled:editor` redevient `editor`). Si le rôle d'origine ne peut pas être déterminé, il revient à `user`.

::: details Exemple : désactiver et réactiver via PATCH
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

## Opérations sur les groupes {#group-operations}

Les groupes SCIM correspondent aux équipes SnapOtter. Créer un groupe crée une équipe. L'appartenance à un groupe détermine à quelle équipe un utilisateur appartient.

### Créer un groupe {#create-group}

`POST /api/v1/scim/v2/Groups`

Requis : `displayName`. Facultatif : `members` (tableau de `{ value: userId }`).

### Lister et filtrer les groupes {#list-and-filter-groups}

`GET /api/v1/scim/v2/Groups`

Le filtrage prend en charge uniquement `displayName eq "..."`. Paginé avec `startIndex` et `count` (maximum 200 résultats par page).

### Obtenir un groupe {#get-group}

`GET /api/v1/scim/v2/Groups/:id`

### Remplacer un groupe {#replace-group}

`PUT /api/v1/scim/v2/Groups/:id`

Remplace le nom du groupe et la liste complète des membres. Les membres existants qui ne figurent pas dans la nouvelle liste sont déplacés vers l'équipe Default.

### Modifier partiellement un groupe {#patch-group}

`PATCH /api/v1/scim/v2/Groups/:id`

Prend en charge ces opérations :

| Opération | Chemin | Effet |
|---|---|---|
| `add` | `members` | Ajoute des utilisateurs à l'équipe |
| `remove` | `members[value eq "userId"]` | Déplace l'utilisateur vers l'équipe Default |
| `replace` | `displayName` | Renomme l'équipe |
| `replace` | `members` | Remplace tous les membres (les membres retirés sont déplacés vers l'équipe Default) |

### Supprimer un groupe {#delete-group}

`DELETE /api/v1/scim/v2/Groups/:id`

Supprime l'équipe. Tous les membres de l'équipe supprimée sont déplacés vers l'équipe Default. Les utilisateurs ne sont ni désactivés ni supprimés.

## Configuration du fournisseur d'identité {#idp-setup}

### Okta {#okta}

1. Dans la console d'administration Okta, ouvrez votre application SnapOtter (ou créez-en une).
2. Accédez à l'onglet **Provisioning** et cliquez sur **Configure API Integration**.
3. Cochez **Enable API Integration** et saisissez :
   - **URL de base** : `https://photos.example.com/api/v1/scim/v2`
   - **Jeton API** : le jeton bearer SCIM généré ci-dessus
4. Cliquez sur **Test API Credentials**, puis sur **Save**.
5. Sous **Provisioning > To App**, activez :
   - **Create Users**
   - **Update User Attributes**
   - **Deactivate Users**
6. Sous **Push Groups**, configurez les groupes Okta à synchroniser en tant qu'équipes SnapOtter.

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Dans le portail Azure, accédez à votre application entreprise SnapOtter.
2. Accédez à **Provisioning** et définissez **Provisioning Mode** sur **Automatic**.
3. Sous **Admin Credentials**, saisissez :
   - **URL du locataire** : `https://photos.example.com/api/v1/scim/v2`
   - **Jeton secret** : le jeton bearer SCIM généré ci-dessus
4. Cliquez sur **Test Connection**, puis sur **Save**.
5. Sous **Mappings**, configurez les mappages d'attributs des utilisateurs et des groupes. Les valeurs par défaut fonctionnent généralement, mais vérifiez que `userName` correspond à `userPrincipalName` ou `mail` selon vos souhaits.
6. Définissez **Provisioning Status** sur **On** et enregistrez.

Azure provisionne les utilisateurs et les groupes selon un cycle de synchronisation fixe (généralement toutes les 40 minutes).

## Points de terminaison de découverte {#discovery-endpoints}

Ces trois points de terminaison sont disponibles sans authentification et décrivent les capacités du serveur SCIM :

| Point de terminaison | Description |
|---|---|
| `GET /api/v1/scim/v2/ServiceProviderConfig` | Capacités du serveur et fonctionnalités prises en charge |
| `GET /api/v1/scim/v2/Schemas` | Définitions des schémas User et Group |
| `GET /api/v1/scim/v2/ResourceTypes` | Types de ressources disponibles (User, Group) |

Le `ServiceProviderConfig` annonce ces capacités :

| Fonctionnalité | Prise en charge |
|---|---|
| Patch | Oui |
| Bulk | Non |
| Filter | Oui (max 200 résultats, opérateur `eq` uniquement) |
| Change password | Non |
| Sort | Non |
| ETag | Non |

## Limitations {#limitations}

- **Filtrage** : seul l'opérateur `eq` est pris en charge. Les filtres complexes, les opérateurs `and`/`or`, `co` (contains) et `sw` (starts with) ne sont pas implémentés.
- **Opérations groupées** : non prises en charge.
- **Sort et ETag** : non pris en charge.
- **Rôles** : SCIM ne peut pas attribuer de rôles SnapOtter. Tous les utilisateurs provisionnés reçoivent le rôle `user`.
- **MAX_USERS** : la limite de la variable d'environnement `MAX_USERS` n'est pas appliquée à la création d'utilisateurs via SCIM. Si vous devez plafonner le nombre d'utilisateurs, gérez les affectations dans votre fournisseur d'identité.
- **Un seul jeton** : un seul jeton SCIM peut être actif à la fois. Si plusieurs fournisseurs d'identité ont besoin d'un accès SCIM, ils doivent partager le jeton.
- **Les groupes sont des équipes** : les groupes SCIM correspondent à des équipes, pas à des rôles ou à des groupes de permissions.

## Dépannage {#troubleshooting}

### 403 « SCIM provisioning requires an enterprise license with the scim feature » {#_403-scim-provisioning-requires-an-enterprise-license-with-the-scim-feature}

Votre licence n'inclut pas la fonctionnalité `scim`, ou aucune licence n'est configurée. SCIM nécessite une licence de plan entreprise. Vérifiez que `SNAPOTTER_LICENSE_KEY` est défini et que la licence inclut la fonctionnalité `scim`.

### 401 « Bearer token required » {#_401-bearer-token-required}

La requête SCIM n'incluait pas d'en-tête `Authorization: Bearer <token>`. Vérifiez la configuration de provisionnement de votre fournisseur d'identité.

### 401 « Invalid token » {#_401-invalid-token}

Le jeton ne correspond pas au hachage stocké. Cela se produit si le jeton a été révoqué et régénéré. Mettez à jour le jeton dans les paramètres de provisionnement de votre fournisseur d'identité.

### 401 « SCIM not configured » {#_401-scim-not-configured}

Aucun jeton SCIM n'a encore été généré. Utilisez le point de terminaison `POST /api/v1/enterprise/scim/token` pour en créer un.

### 409 « User already exists » / « userName already taken » {#_409-user-already-exists-username-already-taken}

Un utilisateur portant le même nom d'utilisateur existe déjà. Cela peut se produire lorsqu'un fournisseur d'identité réessaie une création ayant échoué. Recherchez les noms d'utilisateur en double dans le panneau d'administration de SnapOtter.

### 429 « SCIM rate limit exceeded » {#_429-scim-rate-limit-exceeded}

Le fournisseur d'identité envoie plus de 1000 requêtes par minute. Cela se produit généralement lors d'une importante synchronisation initiale. La plupart des fournisseurs d'identité réessaient automatiquement une fois la fenêtre de limitation de débit réinitialisée. Si le problème persiste, vérifiez l'intervalle de synchronisation du provisionnement de votre fournisseur d'identité.

### Utilisateurs déprovisionnés mais non retirés de l'interface {#users-deprovisioned-but-not-removed-from-the-ui}

Le DELETE SCIM est une désactivation logique. Les utilisateurs désactivés apparaissent toujours dans la liste des utilisateurs de l'administration avec un statut désactivé. C'est intentionnel afin que leurs données soient préservées. Leur rôle s'affiche comme `disabled:<original-role>`.
