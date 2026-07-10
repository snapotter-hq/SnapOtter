---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: aa867eb2fafb
---
# Mise à niveau de la 1.x vers la 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x stockait tout dans un unique fichier SQLite et s'exécutait comme un seul conteneur. SnapOtter 2.0 utilise PostgreSQL et Redis. Ce guide décrit le passage d'une installation 1.x à la 2.0 sans perte de données.

En résumé : réutilisez votre volume `/data` existant, et la 2.0 importe automatiquement votre base de données 1.x au premier démarrage. Vos utilisateurs, fichiers enregistrés, paramètres, clés API et pipelines sont conservés. L'ancienne base de données n'est jamais modifiée, vous pouvez donc toujours revenir en arrière.

::: tip Une note pour nos utilisateurs de la 1.x
Beaucoup d'entre vous font confiance à SnapOtter depuis le premier jour, et vos retours ont façonné cette version. La 2.0 change beaucoup de choses en profondeur, et ce guide existe pour que la migration ne vous coûte rien de ce qui compte pour vous. Vos comptes, fichiers, paramètres, clés API et pipelines sont conservés, et votre ancienne base de données n'est jamais touchée. Merci de faire la mise à niveau avec nous.
:::

## Avant de commencer : sauvegardez l'intégralité du volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Faites-le en premier, à chaque fois. Sauvegardez l'**intégralité** du volume `/data`, pas seulement le fichier `snapotter.db`.

Voici pourquoi c'est important. La 1.x exécute SQLite en mode WAL, si bien qu'un conteneur 1.x arrêté laisse régulièrement la majeure partie de ses données validées dans `snapotter.db-wal`, à côté d'un `snapotter.db` presque vide. Copier uniquement `snapotter.db` capture une base de données vide et perd tout en silence. Le volume transporte `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` et votre répertoire `files/` ensemble, et ils doivent voyager comme un tout.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Passez d'abord à la 1.17.2 {#upgrade-to-1-17-2-first}

Mettez à niveau votre installation 1.x vers la dernière version 1.x (1.17.2) avant de passer à la 2.0. Cela permet à la 1.x d'exécuter ses propres migrations de schéma finales, afin que la 2.0 importe depuis un schéma connu et complet. La mise à niveau directe d'une 1.x plus ancienne vers la 2.0 n'est pas prise en charge.

## Vérifiez le nom de votre volume {#check-your-volume-name}

L'importateur ne voit vos données que si la pile 2.0 monte le même volume que celui utilisé par votre installation 1.x. Les noms de volume Docker sont sensibles à la casse, et d'anciens extraits du README utilisaient un `snapotter-data` en minuscules alors que les fichiers Compose utilisent `SnapOtter-data`. Confirmez lequel vous avez :

```bash
docker volume ls | grep -i snapotter
```

Utilisez exactement ce nom dans votre configuration 2.0.

## Voie A : conteneur unique (le plus rapide) {#path-a-single-container-quickest}

Si vous exécutez SnapOtter avec un unique `docker run`, continuez ainsi. La 2.0 démarre un PostgreSQL et un Redis embarqués dans le conteneur lorsque vous ne définissez pas `DATABASE_URL` ni `REDIS_URL`, et elle détecte et importe automatiquement `/data/snapotter.db` au premier démarrage.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Surveillez dans les logs une ligne du type :

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

C'est tout. Connectez-vous avec vos identifiants existants.

## Voie B : Compose (recommandée en production) {#path-b-compose-recommended-for-production}

La pile Compose 2.0 exécute trois services (app, Postgres, Redis). Réutilisez votre volume `/data` 1.x pour le service app. L'application détecte automatiquement `/data/snapotter.db` et l'importe dans Postgres au premier démarrage.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Si vous préférez pointer explicitement vers l'ancienne base de données, définissez `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Un chemin explicite l'emporte toujours sur la détection automatique.

## Prévisualiser l'import au préalable (facultatif) {#preview-the-import-first-optional}

Pour voir exactement ce qui serait importé sans rien écrire, lancez une exécution à blanc sur votre fichier de base de données :

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Elle affiche le nombre de lignes par table, le nombre de fichiers de la bibliothèque enregistrée trouvés sur le disque, et tous les statuts de tâche qu'elle normalisera. Elle n'a besoin d'aucun Postgres en cours d'exécution.

## Ce qui est conservé, et ce qui ne l'est pas {#what-carries-over-and-what-does-not}

Conservé :

- Les utilisateurs, et la possibilité de se connecter. Les hachages de mots de passe sont inchangés, donc les mêmes nom d'utilisateur et mot de passe fonctionnent.
- Les équipes, les paramètres (y compris l'identité de votre instance), les rôles, les clés API (elles continuent de fonctionner) et les pipelines enregistrés.
- Les enregistrements de l'historique des tâches.
- Votre bibliothèque de fichiers enregistrés, à la fois les enregistrements et les fichiers réels, car `/data/files` est préservé sur le volume.

Non conservé :

- Les sessions de connexion. Chacun se reconnecte une fois après la mise à niveau. Les identifiants sont inchangés, il s'agit donc d'une simple reconnexion, rien de plus.
- Les fichiers d'entrée et de sortie des anciennes tâches de traitement. Ceux-ci se trouvaient dans un espace de travail temporaire et ont disparu, comme prévu. Les enregistrements de l'historique des tâches sont conservés.
- Les indicateurs de consentement aux analyses par utilisateur de la 1.x, qui n'ont aucun équivalent en 2.0 (les analyses de la 2.0 sont un paramètre au niveau de l'instance).

## Désactiver l'import {#turning-the-import-off}

Si vous voulez délibérément une base de données vierge alors qu'un `snapotter.db` est présent sur le volume, définissez `SQLITE_MIGRATE_PATH=off`.

## Si vous avez déjà des données dans l'instance 2.0 {#if-you-already-have-data-in-the-2-0-instance}

L'importateur ne s'exécute que sur une base de données vide. Si vous avez démarré la 2.0 à neuf (en créant des données), puis monté ensuite un ancien `snapotter.db`, la 2.0 le détectera mais n'importera pas, car fusionner deux jeux de données peut provoquer des collisions d'ID. Vous verrez un avertissement dans les logs. Pour importer les données 1.x, il vous faut une instance vide :

- Si l'instance 2.0 ne contient que l'administrateur par défaut (vous ne l'avez pas vraiment utilisée), arrêtez la pile, supprimez le volume Postgres (`SnapOtter-pgdata`) et redémarrez avec l'ancien `/data` présent. L'import se fera proprement. Cela n'efface que les données Postgres jetables, pas votre base de données 1.x.
- Si l'instance 2.0 contient de vraies données que vous voulez conserver, les deux jeux de données ne peuvent pas être fusionnés automatiquement. Exportez ce dont vous avez besoin et importez les données 1.x dans un déploiement distinct et vierge.

## Revenir en arrière {#rolling-back}

La mise à niveau ne modifie ni ne supprime jamais votre `snapotter.db` 1.x. Si vous devez revenir à la 1.x, redéployez l'image 1.x sur le même volume. Tout ce que vous avez créé en 2.0 après la mise à niveau se trouve dans Postgres et ne serait pas dans la base de données 1.x, donc revenez en arrière rapidement si vous comptez le faire.
