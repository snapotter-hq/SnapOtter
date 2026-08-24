---
description: "Schéma de base de données PostgreSQL, tables, migrations et procédures de sauvegarde pour SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: c87a358aae99
i18n_hash_version: 2
---

# Base de données {#database}

SnapOtter utilise PostgreSQL 17 avec [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) pour la persistance des données. Le schéma est défini dans `apps/api/src/db/schema.ts`.

La connexion est configurée via la variable d'environnement `DATABASE_URL` (par défaut `postgres://snapotter:snapotter@postgres:5432/snapotter`). Dans Docker Compose, le conteneur Postgres stocke ses données dans le volume nommé `SnapOtter-pgdata`. Les requêtes sont servies par un rôle qui ne peut que lire et écrire des lignes, ce qui est détaillé ci-dessous dans [Rôles à moindre privilège](#least-privilege-roles).

## Tables {#tables}

### users {#users}

Stocke les comptes utilisateurs. Créé automatiquement au premier démarrage à partir de `DEFAULT_USERNAME` et `DEFAULT_PASSWORD`.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `username` | varchar | Unique, requis |
| `passwordHash` | varchar | Hachage scrypt |
| `role` | varchar | `admin`, `editor` ou `user` |
| `mustChangePassword` | boolean | Indicateur de réinitialisation forcée du mot de passe |
| `createdAt` | timestamp | Date de création |
| `updatedAt` | timestamp | Date de dernière mise à jour |

### sessions {#sessions}

Sessions de connexion actives. Chaque ligne associe un jeton de session à un utilisateur.

| Colonne | Type | Notes |
|---|---|---|
| `id` | varchar | Clé primaire (jeton de session) |
| `userId` | uuid | Clé étrangère vers `users.id` |
| `expiresAt` | timestamp | Date d'expiration |
| `createdAt` | timestamp | Date de création |

### teams {#teams}

Groupes pour organiser les utilisateurs. Les administrateurs peuvent affecter des utilisateurs à des équipes.

| Colonne | Type | Description |
|--------|------|-------------|
| `id` | uuid | Clé primaire |
| `name` | varchar (unique, 50 caractères max) | Nom de l'équipe |
| `createdAt` | timestamp | Date de création |

### api_keys {#api-keys}

Clés API pour l'accès programmatique. La clé brute n'est affichée qu'une seule fois lors de la création ; seul le hachage est stocké.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `userId` | uuid | Clé étrangère vers `users.id` |
| `keyHash` | varchar | Hachage scrypt de la clé |
| `name` | varchar | Libellé fourni par l'utilisateur |
| `createdAt` | timestamp | Date de création |
| `lastUsedAt` | timestamp | Mise à jour à chaque requête authentifiée |

Les clés sont préfixées par `si_` suivi de 96 caractères hexadécimaux (48 octets aléatoires).

### pipelines {#pipelines}

Chaînes d'outils enregistrées que les utilisateurs créent dans l'interface.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `name` | varchar | Nom du pipeline |
| `description` | varchar | Description facultative |
| `steps` | jsonb | Tableau d'objets `{ toolId, settings }` |
| `createdAt` | timestamp | Date de création |

### user_files {#user-files}

Bibliothèque de fichiers persistante. Une modification enregistrée est insérée par défaut comme une ligne racine indépendante ("enregistrer comme nouveau" : `version` à 1, `parentId` à null, de sorte que l'original reste répertorié), ou comme une version liée à son parent lorsque vous écrasez l'original (`parentId` défini, `version` incrémenté, remplaçant l'original). La colonne `toolChain` enregistre les outils appliqués.

| Colonne | Type | Description |
|--------|------|-------------|
| `id` | uuid | Clé primaire |
| `userId` | uuid | FK vers users (CASCADE DELETE) |
| `originalName` | varchar | Nom de fichier d'envoi d'origine |
| `storedName` | varchar | Nom de fichier sur le disque |
| `mimeType` | varchar | Type MIME |
| `size` | integer | Taille du fichier en octets |
| `width` | integer | Largeur de l'image en px |
| `height` | integer | Hauteur de l'image en px |
| `version` | integer | Numéro de version (1 = original) |
| `parentId` | uuid ou null | FK vers user_files (version parente) |
| `toolChain` | jsonb | ID d'outils appliqués dans l'ordre pour produire cette version |
| `createdAt` | timestamp | Date de création |

### jobs {#jobs}

Suit les tâches de traitement pour le rapport de progression et le nettoyage.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `type` | varchar | Identifiant d'outil ou de pipeline |
| `status` | varchar | `queued`, `processing`, `completed` ou `failed` |
| `progress` | real | Fraction 0.0-1.0 |
| `inputFiles` | jsonb | Tableau de chemins de fichiers d'entrée |
| `outputPath` | varchar | Chemin vers le fichier de résultat |
| `settings` | jsonb | Paramètres d'outil utilisés |
| `error` | varchar | Message d'erreur en cas d'échec |
| `createdAt` | timestamp | Date de création |
| `completedAt` | timestamp | Date d'achèvement |

### settings {#settings}

Magasin clé-valeur pour les paramètres à l'échelle du serveur que les administrateurs peuvent modifier depuis l'interface.

| Colonne | Type | Notes |
|---|---|---|
| `key` | varchar | Clé primaire |
| `value` | varchar | Valeur du paramètre |
| `updatedAt` | timestamp | Date de dernière mise à jour |

### roles {#roles}

Rôles personnalisés avec des permissions granulaires.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `name` | varchar | Nom de rôle unique |
| `description` | varchar | Description facultative |
| `permissions` | jsonb | Tableau de chaînes de permission |
| `createdAt` | timestamp | Date de création |

### audit_log {#audit-log}

Journal des actions pertinentes pour la sécurité.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid | Clé primaire |
| `userId` | uuid | FK vers users |
| `action` | varchar | Type d'action |
| `details` | jsonb | Données spécifiques à l'action |
| `createdAt` | timestamp | Date de l'action |

### user_preferences {#user-preferences}

État de l'interface propre à chaque utilisateur, indexé par nom de préférence. Alimente les outils épinglés de la page d'accueil via `PUT /api/v1/preferences`.

| Colonne | Type | Notes |
|---|---|---|
| `userId` | text | FK vers users, suppression en cascade. Clé primaire avec `key` |
| `key` | text | Nom de la préférence. Clé primaire avec `userId` |
| `value` | jsonb | Contenu de la préférence |
| `updatedAt` | timestamp | Dernière écriture |

## Migrations {#migrations}

Drizzle gère les migrations de schéma. Les fichiers de migration se trouvent dans `apps/api/drizzle/`. Pendant le développement :

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

En production, les migrations en attente sont appliquées automatiquement au démarrage.

## Rôles à moindre privilège {#least-privilege-roles}

Deux rôles, deux fonctions. `DATABASE_URL` sert les requêtes et détient `SELECT`, `INSERT`, `UPDATE`, `DELETE` sur les tables de l'application, ainsi que `USAGE` et `SELECT` sur leurs séquences. C'est toute la liste. Il ne peut pas créer ni supprimer une table, installer une extension, faire un `TRUNCATE`, lire `pg_authid`, créer une base de données, modifier un rôle, ni toucher au schéma `drizzle` où réside l'historique des migrations.

`DATABASE_MIGRATION_URL` est le rôle privilégié. Il exécute les migrations et accorde ses droits au rôle d'exécution pendant le démarrage, puis se ferme avant qu'une seule requête ne soit servie.

Compose et l'image tout-en-un sont déjà câblés ainsi, installations existantes comprises. Au démarrage, SnapOtter crée le rôle d'exécution s'il est absent, lui accorde ses droits, applique les migrations, puis étend ces droits aux tables qui étaient déjà là. La mise à niveau ne demande aucun SQL manuel.

Laisser `DATABASE_MIGRATION_URL` vide fait fonctionner l'application en rôle unique, `DATABASE_URL` assurant les deux fonctions exactement comme avant la séparation. C'est une configuration prise en charge, pas une configuration obsolète. C'est la bonne réponse sur un Postgres managé, où la création de rôles ne vous revient souvent pas.

### Postgres externe et managé {#external-and-managed-postgres}

Sur RDS, Supabase, Cloud SQL ou tout cluster que vous exploitez vous-même, la séparation est facultative. Créez le rôle d'exécution une seule fois :

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Fournissez ensuite les deux chaînes de connexion à SnapOtter, pointant vers le même hôte, le même port et la même base de données :

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Arrêtez-vous là. SnapOtter applique lui-même les droits et les réapplique après chaque migration : une table ajoutée par une version future est donc couverte sans que personne ait à exécuter de SQL pour elle.

Le rôle indiqué dans `DATABASE_MIGRATION_URL` doit être propriétaire des tables SnapOtter, car seul le propriétaire d'une table peut y accorder des droits. Sur une installation existante, il s'agit du rôle sous lequel vous exécutez SnapOtter depuis le début, pas d'un rôle créé pour l'occasion. Pointez-le vers un nouveau rôle qui ne possède rien et le démarrage échoue avec une erreur qui le dit précisément. Il lui faut aussi `CREATEROLE` pour créer et maintenir le rôle d'exécution, ainsi que le droit de créer le schéma `drizzle`.

Indiquez le même rôle dans les deux URL et la séparation est désactivée, et SnapOtter le signale dans le journal plutôt que de prétendre le contraire. Si votre fournisseur ne vous donne aucun rôle capable à la fois de posséder les tables et de détenir `CREATEROLE`, restez en rôle unique.

### Pourquoi le bit superutilisateur n'est pas touché {#why-the-superuser-bit-is-left-alone}

SnapOtter ne retire jamais `SUPERUSER` d'un rôle de lui-même. Sur une installation créée avant la séparation, `snapotter` est le seul superutilisateur du cluster, et le rétrograder n'en laisserait aucun, une situation récupérable uniquement par le mode mono-utilisateur, serveur arrêté. C'est le déplacement de la connexion de longue durée vers le rôle restreint qui apporte la protection à la place. Le superutilisateur circule sur le réseau pendant les quelques secondes du démarrage, puis disparaît.

Les nouvelles installations tout-en-un n'ont jamais ce problème. Elles disposent de trois rôles : `postgres` (superutilisateur d'amorçage, absent de toutes les chaînes de connexion utilisées par SnapOtter), `snapotter` (`NOSUPERUSER`, propriétaire des données, connecté uniquement au démarrage) et `snapotter_app` (lignes uniquement, sert les requêtes).

Pour rétrograder malgré tout un ancien `snapotter`, créez d'abord un second superutilisateur et connectez-vous avec lui pour vérifier qu'il fonctionne. Exécutez ensuite `ALTER ROLE snapotter NOSUPERUSER`.

## Sauvegarde et restauration {#backup-and-restore}

La base de données relationnelle réside dans le volume `SnapOtter-pgdata` du conteneur Postgres, et non dans le volume `/data` de l'application.

**Sauvegarde logique avec validation (recommandé)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Les deux commandes se connectent en tant que `snapotter`, le propriétaire, et doivent continuer à le faire. Le rôle d'exécution ne voit pas le schéma `drizzle` : un vidage réalisé avec ce rôle ressortirait donc incomplet. `--no-owner` laisse les objets restaurés à celui qui exécute la restauration ; l'exécuter en tant que propriétaire place la propriété là où les droits l'attendent. Un piège sur un cluster neuf : `pg_dump` transporte les droits mais pas les rôles qu'ils nomment, créez donc `snapotter_app` avant de restaurer, sinon `--exit-on-error` s'arrête au premier `GRANT`. SnapOtter réapplique de toute façon les droits à son prochain démarrage.

Ce vidage de base de données ne contient pas d'objets de bibliothèque enregistrés dans `/data/files` ni d'état BullMQ durable dans Redis. Sauvegardez et restaurez ceux-ci avec la procédure coordonnée dans [Sécurité et renforcement](/fr/guide/security#backup-and-recovery).

**Instantané de volume froid**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Ne copiez pas un répertoire de données PostgreSQL actif avec `tar`. Composez les noms de volumes de préfixes par projet, résolvez donc les ID de volume montés à partir de `docker inspect` ou de votre plate-forme de stockage plutôt que d'assumer l'étiquette littérale `SnapOtter-pgdata`.

### Migration depuis la 1.x (SQLite) {#migrating-from-1-x-sqlite}

La mise à niveau depuis SnapOtter 1.x a son propre guide : voir [Mise à niveau de la 1.x vers la 2.0](./upgrading). En bref, réutilisez votre volume `/data` existant et la 2.0 détecte automatiquement et importe `/data/snapotter.db` au premier démarrage (ou définissez `SQLITE_MIGRATE_PATH` pour le pointer explicitement). Sauvegardez d'abord l'intégralité du volume `/data`, pas seulement `snapotter.db` : la 1.x utilise le mode WAL de SQLite, donc un conteneur arrêté laisse souvent la plupart de ses données dans `snapotter.db-wal` à côté d'un `snapotter.db` presque vide.
