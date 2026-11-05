---
description: "Notes de version et historique des versions de SnapOtter. Découvrez les nouveautés, les améliorations et les corrections de chaque version."
i18n_source_hash: 76c6d18aedb4
i18n_provenance: machine
i18n_output_hash: 9ea48dd702c9
i18n_hash_version: 2
---

# Journal des modifications {#changelog}

## Non publié {#unreleased}

### Obsolète {#unreleased-deprecated}

- **Les cinq opérations d'image de compression à une taille donnée sont obsolètes.** `/api/v1/tools/image/compress-image-to-20kb`, `-50kb`, `-100kb`, `-200kb` et `-500kb` sont marquées comme obsolètes dans la spécification OpenAPI et resteront au moins une version mineure. Envoyez `POST /api/v1/tools/image/compress` avec `settings` réglé sur `{"mode":"targetSize","targetSizeKb":20}` (ou 50, 100, 200, 500). Le résultat est identique. Les chemins des préréglages PDF ne changent pas.

## v2.3.0 {#v2-3-0}

SnapOtter vient de dépasser le million de téléchargements d'images sur Docker Hub et GHCR, et les 3 000 étoiles sur GitHub. Cela fait beaucoup de serveurs auto-hébergés : cette version est notre façon de remercier tous ceux qui les font tourner.

Mettez à jour rapidement. La version 2.3.0 corrige six avis de sécurité, dont un de gravité élevée. Les détails figurent dans la section Sécurité ci-dessous.

Au-delà des correctifs, il y a de nouveaux outils : un éditeur de pages PDF Multi-Tool, des préréglages de compression à une taille cible en un clic pour les images et les PDF, et l'ordonnancement des pages par glisser-déposer dans Organize PDF. L'OCR lit désormais l'arabe, et pdf-to-text propose l'OCR quand il rencontre un PDF numérisé. SnapOtter peut tourner sous un sous-chemin comme `/snapotter` derrière un proxy inverse. L'application n'a plus besoin d'un superutilisateur Postgres pour fonctionner. Les administrateurs verrouillés dehors peuvent récupérer l'accès en ligne de commande. Le reste, ce sont environ 1 400 corrections, dont la plupart concernent des problèmes que vous avez signalés.

> [!IMPORTANT]
> Les six avis ci-dessous touchent la 2.2.0, et certains remontent jusqu'à la 2.0.0. Si vous partagez une instance avec d'autres utilisateurs ou l'exposez au-delà de votre propre réseau, mettez à jour.

### Sécurité {#v2-3-0-security}

- **Des téléversements SVG pouvaient échapper à la sanitisation (GHSA-9c7h-xjrp-8gh3, élevée).** Un SVG rejeté par le décodeur d'images était stocké et servi tel quel au lieu d'être sanitisé. Concerné : 2.2.0 et antérieures. Signalé par @xaferima. (#1211)
- **Le flux de progression des tâches ne vérifiait pas qui le demandait (GHSA-ff22-w6x2-fm98, moyenne).** Il exige désormais une connexion et la propriété de la tâche. Concerné : de 2.0.0 à 2.2.0. (#1750)
- **Les liens de téléchargement des résultats servaient aussi le téléversement d'origine (GHSA-jgv3-2jc6-f628, moyenne).** Concerné : 2.2.0 et antérieures. Signalé par @emirhancatkin. (#3623)
- **La photo d'identité et les effets d'arrière-plan faisaient confiance à un identifiant de tâche fourni par le client (GHSA-3c8g-8v4x-qq9j, moyenne).** Concerné : 2.2.0 et antérieures. Signalé par @shaoyuuuuu. (#3623)
- **L'import par URL, le téléversement et l'aperçu ignoraient les contrôles de permissions du rôle et de la clé d'API (GHSA-8xxr-g2w8-7f9r, moyenne).** Concerné : 2.2.0 et antérieures. Signalé par @nguyenvantiennani. (#3780, #707)
- **L'application du SSO révélait le nom d'utilisateur de secours (GHSA-q6fg-vvw9-cr8r, faible).** Une connexion locale refusée reçoit maintenant le même 401 que n'importe quelle autre connexion échouée. Concerné : de 2.0.0 à 2.2.0. (#2148)
- **Postgres ne s'exécute plus en superutilisateur.** L'application se connecte désormais avec un rôle qui ne peut que lire et écrire des données. Les migrations utilisent une connexion distincte, facultative. Voir les notes de mise à jour. (#918)
- **Dépendances corrigées** : les seuils minimaux des overrides de dompurify et handlebars sont relevés vers les versions corrigées. (#4247)

### Nouvelles fonctionnalités {#v2-3-0-new-features}

- **PDF Multi-Tool** : un éditeur de pages qui réorganise, duplique, pivote et supprime des pages, et en importe depuis d'autres PDF. Le serveur assemble le fichier final. (#1338)
- **Compression à une taille cible en un clic** : cinq préréglages d'image (20, 50, 100, 200, 500 Ko) et cinq préréglages PDF (100, 200, 500 Ko, 1 Mo, 2 Mo). (#1250, #1377)
- **Exécuter SnapOtter sous un sous-chemin** : définissez `BASE_PATH=/snapotter` et la même image sert depuis ce chemin. Les liens de résultats, les cookies, les redirections SSO et la documentation de l'API le suivent. (#1252, #1324)
- **OCR arabe** : choisissez explicitement l'arabe, ou laissez le mode automatique le détecter. Fonctionne pour l'OCR d'images et de PDF. (#4130, #4183)
- **pdf-to-text propose l'OCR** quand un PDF, ou tout un lot, n'a pas de couche de texte, au lieu de renvoyer un fichier vide. (#4142, #4198)
- **Ordonnancement des pages par glisser-déposer dans Organize PDF**, à la souris et au toucher. (#1249, #2601)
- **Réordonner les fichiers avant une exécution multi-fichiers** : fusion, assemblage, collage et les autres outils multi-fichiers respectent l'ordre que vous avez défini. (#756, #757)
- **Annuler les exécutions par lot et de pipeline**, et le travail s'arrête réellement sur le serveur. (#807)
- **Commandes de récupération `snapotter-admin`** : `reset-password`, `create-admin`, `unlock-user` et la réinitialisation de la MFA, pour les administrateurs verrouillés hors de l'interface web. (#4016)
- **Inscription à la MFA à la connexion** : quand la MFA est obligatoire, les utilisateurs qui ne l'ont pas la configurent sur-le-champ au lieu d'être bloqués.
- **Capture par l'appareil photo et application installable** : prenez une photo directement dans un outil sur mobile, et installez SnapOtter comme PWA. (#773)
- **Marge transparente dans la boîte de dialogue Taille du canevas de l'éditeur.** (#4111)
- **Avis de mise à jour pour les administrateurs** : quand une version plus récente de SnapOtter est disponible, les administrateurs voient un avis qu'ils peuvent fermer, avec un lien vers les notes de version. La vérification passe par la connexion d'analytique existante, donc elle est désactivée quand l'analytique l'est.

### Améliorations {#v2-3-0-improvements}

- **La suppression d'arrière-plan est plus rapide sur les exécutions répétées** : le modèle reste chargé entre les requêtes au lieu d'être rechargé à chaque fois. (#4144)
- **Les téléversements par lot utilisent beaucoup moins de mémoire** : chaque fichier va sur le disque temporaire et est traité un par un, au lieu de rester en RAM. (#2687)
- **Les installations de bundles d'IA échouent proprement et reviennent en arrière** au lieu de laisser un venv à moitié installé. Les installations de suppression d'arrière-plan sur Proxmox LXC fonctionnent de nouveau, et les hôtes à faible mémoire reçoivent des limites de CPU raisonnables avant le début d'une tâche. (#2628, #2597, #2526, #2546)
- **La détection du GPU est plus fiable** : CUDA est détecté via le pilote, les cartes de la série RTX 50 basculent sur le CPU au lieu d'échouer, et les encodeurs vidéo matériels sont testés avant utilisation. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` fonctionne maintenant.** Il était analysé mais jamais appliqué. (#3249)
- **Les outils longs obtiennent le délai d'attente long** : pdf-to-word, compress-pdf, convert-document et le redimensionnement sensible au contenu n'expirent plus trop tôt sur les gros fichiers. (#3276)
- **Compress PDF garde les numérisations lisibles**, et le signale quand une taille cible est inatteignable, au lieu de produire un fichier illisible. (#4112)
- **Les connexions échouées sont limitées par nom d'utilisateur** : plus de dix en quinze minutes donnent un 429 avec `Retry-After`. (#827)
- **Les erreurs disent ce qui s'est passé** : binaires manquants, défaillances de stockage, arrêts par manque de mémoire et limites de téléversement reçoivent maintenant des messages précis au lieu d'un simple 500 ou 422.
- **Le journal d'audit couvre les exécutions d'outils, de lots et de pipelines**, et les événements d'utilisateur, de rôle, d'équipe et de RGPD enregistrent qui a fait quoi à qui. (#3991, #3984)
- **Le conteneur tout-en-un s'arrête après un premier démarrage raté** au lieu de redémarrer indéfiniment, et les Postgres et Redis embarqués ont des délais limites de démarrage. (#3008, #1130)
- **Les dates et les pluriels suivent votre langue**, et les dernières chaînes anglaises codées en dur sont traduites.
- **Finitions mobile et éditeur** : curseur, Sign PDF et mises en page de recadrage sur téléphone, glissement tactile, pinceaux de pixels plus rapides, et Niveaux et Courbes dans l'annulation et l'enregistrement automatique.

### Corrections de bogues {#v2-3-0-bug-fixes}

- **Adjust Colors combinait mal les réglages** : température, saturation, teinte, contraste et sépia se remplaçaient au lieu de s'additionner. (#3153, #3120, #3469)
- **Pixelate ne pixélisait pas**, et la sortie PNG était discrètement réduite en palette dans les outils d'image. (#709, #716)
- **Les GIF et WebP animés perdaient des images** dans plusieurs outils, et les palettes et la transparence des GIF étaient fausses. (#1184, #1225, #3407, #2573)
- **Les téléversements pivotés perdaient en qualité** : l'orientation automatique abandonnait l'encodage sans perte, la transparence et la profondeur de 16 bits. Le WebP animé pivote maintenant chaque image. (#2384, #2529)
- **Les TIFF avec transparence, les fichiers HEIF AV1 et plusieurs formats RAW** échouaient ou perdaient l'alpha. (#2609, #2572, #1120)
- **Redimensionner le canevas de l'éditeur mettait l'image à l'échelle** au lieu d'ajouter de l'espace autour. (#2081)
- **Les noms de fichiers de sortie étaient mal formés** : `.jpeg` et `.tif` devenaient autre chose, et les fichiers cachés ou les noms qui répètent leur extension posaient problème. (#3495, #3382)
- **L'enregistrement automatique de la bibliothèque ignorait le quota de stockage**, et les compteurs de stockage pouvaient devenir négatifs. (#2389, #2585)
- **Les tâches bloquées après un redémarrage** sont maintenant réglées au démarrage au lieu d'afficher « en cours » pour toujours. (#3219, #3193)
- **La connexion OIDC nommait chaque nouvel utilisateur « admin »**, et les connexions sur Safari iOS se terminaient sur une page d'erreur après avoir réussi. (#862, #4021)
- **Les règles de mot de passe désactivées étaient quand même appliquées** à la création d'utilisateurs. (#1028)
- **Les PDF endommagés bloquaient 30 secondes** avant d'échouer. (#920)
- **La vérification d'espace disque des bundles d'IA demandait environ 18 Go** pour installer un seul bundle. (#1248)
- **Compress Video échouait sur les enregistrements d'écran à fréquence d'images variable.** (#2427)
- **La suppression d'arrière-plan par lot perdait les résultats terminés** quand le navigateur relançait la requête. (#2015)
- **Les champs numériques des paramètres ne pouvaient pas être vidés** pendant la saisie. (#1449)
- **Désactiver l'analytique laissait des événements en file d'attente à envoyer** environ 30 secondes plus tard. Ils sont maintenant abandonnés quand vous vous désinscrivez. (#4270)

### Notes de mise à jour {#v2-3-0-upgrade-notes}

Les migrations s'exécutent seules au démarrage. Vous n'avez pas besoin d'exécuter de SQL.

- **Rôles de base de données.** Le fichier Compose canonique donne maintenant à l'application un rôle qui ne peut que lire et écrire des données (`DATABASE_URL`) et une connexion privilégiée distincte (`DATABASE_MIGRATION_URL`) utilisée uniquement au démarrage pour les migrations et les droits. Un fichier Compose existant continue de fonctionner comme avant : laissez `DATABASE_MIGRATION_URL` non défini et SnapOtter s'exécute avec un seul rôle. Pour un déploiement non local, définissez `POSTGRES_APP_PASSWORD` en plus de `POSTGRES_PASSWORD`.
- **Contrôles de démarrage plus stricts.** Ces cas échouaient plus tard, ou en silence. Ils arrêtent maintenant le conteneur avec un message qui nomme la variable : un `DEFAULT_LOCALE` non pris en charge (utilisez un code pris en charge comme `de`, pas `de_DE`), un `SAML_IDP_SSO_URL`, `SAML_CALLBACK_URL` ou `OIDC_ISSUER_URL` mal formé quand le SSO est activé, une liste `TRUST_PROXY` invalide, un `BASE_PATH` incorrect et un `LOG_DIR` non accessible en écriture.
- **`TRUST_PROXY` n'accepte plus un nombre de sauts.** Une valeur comme `TRUST_PROXY=2` arrête maintenant le conteneur au démarrage au lieu de ne faire confiance à aucun proxy en silence. Définissez-la sur les adresses du proxy ou des plages nommées (la valeur par défaut est `loopback,linklocal,uniquelocal`), `false` quand rien ne fait proxy devant SnapOtter, ou `true` uniquement quand un proxy que vous contrôlez se trouve devant sur une adresse publique. (#998)
- **`MAX_WORKER_THREADS` prend maintenant effet.** Si vous l'aviez définie sans voir de changement, vous le verrez maintenant.
- **Codes de statut de l'API.** Les défaillances de moteur et de stockage renvoient 503 `ENGINE_UNAVAILABLE` (les endpoints de lot renvoyaient 422). Les téléversements trop volumineux renvoient 413 (400 auparavant). Un `clientJobId` mal formé renvoie 400 et un identifiant réutilisé 409 (500 auparavant). Rejouer son propre lot de pipeline renvoie 202. `mode=targetSize` sans `targetSizeKb` renvoie 400. Une connexion locale refusée sous application du SSO renvoie 401 au lieu de 403 `SSO_ENFORCED`. Les connexions limitées renvoient 429 `LOGIN_THROTTLED`. Le résultat de remove-background n'inclut plus `originalUrl`.
- **Nouvelles variables facultatives** : `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (15 minutes par défaut, `0` la désactive), `EMBEDDED_REDIS_TIMEOUT_S` (180) et `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Les fichiers Compose sont livrés avec la version.** `docker-compose.yml` et `docker-compose-gpu.yml` sont joints à cette version, vous pouvez donc les télécharger directement depuis la page de la version.

### Remerciements {#v2-3-0-acknowledgements}

Un million de téléchargements, c'est beaucoup de personnes qui signalent des bogues, envoient des correctifs et nous disent ce qui manquait. Cette version est surtout leur travail.

Code et contributions :

- **@zakka258** ❤️ : a construit l'éditeur de pages PDF Multi-Tool et le déploiement sous sous-chemin, deux des plus grosses fonctionnalités de cette version, y compris les tests d'authentification et de SSO sous un sous-chemin. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️ : a construit les préréglages d'image de compression à une taille cible en un clic, corrigé la concurrence et le nettoyage des aperçus, et empêché le stockage du navigateur bloqué de figer le spinner de connexion. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️ : a ajouté le réordonnancement des pages par glisser-déposer à Organize PDF, qu'il avait d'abord demandé dans les Discussions. (#1249, #965)
- **@drakeo338** ❤️ : dix corrections sur toute la pile, dont l'orientation automatique qui conserve le format et la qualité, les groupes SCIM créés en une seule transaction, les installations d'IA sous cgroup v2, et les erreurs 5xx qui ne sont plus masquées en 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️ : a ajouté la marge de canevas transparente à l'éditeur, corrigé les verdicts périmés de taille cible de Compress PDF, et autorisé les mises à jour partielles d'équipe. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️ : a empêché les instances auto-hébergées d'envoyer des données de heatmap, validé `TRUST_PROXY` au démarrage au lieu de planter, et corrigé la gestion des noms de groupe SCIM et des délais d'attente de qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️ : a transformé plusieurs 500 en vraies réponses 400 et 409 pour les identifiants de tâche mal formés et les imports multipart, et corrigé la suppression du contenu des champs numériques dans les Paramètres. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️ : a fait fonctionner la lecture de codes-barres hors ligne en intégrant son décodeur, corrigé les aperçus média qui affichaient l'entrée, et amélioré la recherche de formats. (#1401, #1512, #1388)
- **@darklabs9** ❤️ : a signalé et corrigé l'échec de Compress Video sur les enregistrements d'écran à fréquence d'images variable. (#2426, #2427)
- **@dvd233** ❤️ : a exposé tous les formats RAW d'appareils photo pris en charge par le décodeur, et fait apparaître les outils de favicon pour les recherches ICO. (#1120, #1121)
- **@bercedev** ❤️ : a corrigé les noms de fichiers dont le radical répète l'extension, et fait en sorte que l'IA indique l'appareil sur lequel elle s'exécute réellement. (#3382, #3613)
- **@pamod-madubashana** ❤️ : a traduit le dernier titre MFA resté en anglais et branché des chaînes de progression inutilisées. (#1228, #1227)
- **@mvanhorn** ❤️ : a corrigé l'attribution en double de noms d'utilisateur lors de la connexion SAML. (#2640)
- **@peremunoz** ❤️ : a empêché la génération de codes-barres de masquer les défaillances de stockage et de mémoire sous « Texte invalide ». (#4057)
- **@mayuriphad** ❤️ : a corrigé un plantage sur un en-tête d'authentification d'alerte stocké mal formé. (#3080)
- **@DevShoaib78** ❤️ : a corrigé la fermeture du lasso polygonal dans l'éditeur. (#1207)
- **@dltsum** ❤️ : a déplacé les affichages de progression vers le catalogue de messages partagé. (#1262)
- **@albanobattistella** ❤️ : corrections de traduction. (#1024)
- **@shoaibyazdani** ❤️ : a régénéré les références visuelles macOS. (#2475)

Divulgations de sécurité :

- **@xaferima** ❤️ : a découvert que les SVG rejetés par le décodeur échappaient à la sanitisation, et a étudié l'impact avec nous. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️ : a découvert que les liens de résultats servaient aussi le téléversement d'origine. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️ : a découvert que la photo d'identité et les effets d'arrière-plan faisaient confiance à un identifiant de tâche fourni par le client. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️ : a découvert que l'import par URL ignorait les contrôles de permissions. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️ : a signalé des contournements IPv6 des contrôles d'adresse SSRF, avec des preuves de concept fonctionnelles. Les correctifs sont sortis dans la 2.0.0, et ce remerciement est en retard. (#287)

Rapports de bogues :

- **@kabo** ❤️ : l'exemple `docker-compose.yml` ne fonctionnait pas. (#1027)
- **@xromen** ❤️ : les PDF endommagés qui bloquaient jusqu'à un délai d'attente de qpdf de 30 secondes. (#920)
- **@snmabaur** ❤️ : la connexion OIDC qui définissait le nom de chaque profil sur « admin ». (#862)
- **@CodecNomad** ❤️ : l'outil Blur qui dupliquait l'image. (#829)
- **@ohora0923** ❤️ et **@Alexis-VS-CSharp** ❤️ : Pixelate qui ne fonctionnait pas. (#678, #775)
- **@mptpro** ❤️ : le téléchargement d'IA de suppression d'arrière-plan qui échouait. (#714)
- **@dominic427** ❤️ : le redimensionnement du canevas de l'éditeur qui mettait l'image à l'échelle au lieu de l'étendre. (#2016)
- **@CodeByToast** ❤️ : les champs numériques des Paramètres qui ne pouvaient pas être vidés. (#1186)
- **@gioxx** ❤️ : la vérification d'espace disque des bundles d'IA qui exigeait environ 18 Go pour un seul bundle. (#1248)
- **@rekcodocker** ❤️ et **@madmike970** ❤️ : les installations de bundles d'IA qui échouaient sur Proxmox LXC, avec les détails du conteneur qui ont aidé à cerner le problème. (#1030, #352)
- **@wxf26054** ❤️ : les règles de mot de passe désactivées toujours appliquées à la création d'utilisateurs. (#1028)
- **@ersil** ❤️ : Safari iOS qui demandait deux fois le rappel OIDC et atterrissait sur une page d'erreur après une connexion réussie. (#4021)
- **@casi-3** ❤️ : la suppression d'arrière-plan par lot qui perdait les résultats terminés quand le navigateur rejouait la requête, avec un diagnostic précis. (#2015)
- **@killervette42** ❤️ : l'échec du GPU Blackwell sur unRaid, qui a conduit au repli sur le CPU pour la série RTX 50. (#120, #4075)

Demandes de fonctionnalités et retours :

- **@photoevents** ❤️ : a mesuré que la suppression d'arrière-plan passait environ 11 secondes à charger le modèle et 1 seconde à l'inférence, a proposé de mettre les sessions en cache, et a partagé ce qu'il avait appris en exploitant son propre cache. C'est devenu le cache de sessions de cette version. (#768, #776, #4144)
- **@benbou8231** ❤️ : a fait remarquer que les fichiers importés arrivent dans l'ordre inverse dans les outils multi-fichiers, ce qui a mené au réordonnancement avant une exécution. (#729, #756)
- **@cf3901646** ❤️ : a retracé une erreur de production bruyante jusqu'à la classe d'erreur Postgres 58 et proposé le correctif. Nous n'avons pas pu fusionner sa PR sans CLA signé, donc nous avons écrit nous-mêmes le même correctif. (#4210, #4253)
- **@chiliec** ❤️ : a repéré qu'une orientation automatique échouée était avalée en silence et que la progression d'installation ignorait le catalogue de traduction. Les deux propositions sont arrivées via des PR de mainteneurs. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️ : a proposé de ne lancer qu'un seul import du module entreprise à la fois, le correctif pour les requêtes SCIM concurrentes en désaccord sur la licence. (#1267, #1283)
- **@chenzeyan54-commits** ❤️ : a fait remarquer que le guide de configuration ne mentionnait jamais les remplacements des binaires de moteur ni `SNAPOTTER_HW_ACCEL`, qui sont maintenant documentés. (#1312, #1696)
- **@aron-intframe** ❤️ : a reproduit une lacune de gestion d'erreurs d'exiftool sur un clone neuf et découvert que la course sur le chemin temporaire était pire que ce que décrivait le ticket. (#3458)

Merci également aux membres de la communauté qui ont signalé ces problèmes par Discord et par e-mail, et dont nous n'avons pas noté les noms.

[Différences complètes sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

L'essentiel de la 2.2 est du durcissement. Un non-administrateur disposant d'un rôle `users:manage` délégué pouvait prendre le contrôle d'une instance, et chaque endpoint d'outil s'est révélé dépourvu de son contrôle de permission. Mettez à jour si vous avez plus d'un utilisateur.

Le reste est la longue traîne de l'auto-hébergement : des téléchargements qui démarraient sans jamais se terminer, des préréglages qui cassaient dès l'ajout d'un second fichier, des conteneurs qui redémarraient en boucle pendant que Postgres démarrait encore. Deux nouveaux outils sont aussi arrivés. La documentation et le site web sont désormais traduits en 21 langues, et l'interface passe enfin le contraste WCAG AA.

> [!IMPORTANT]
> Si vous avez accordé `users:manage` à un non-administrateur via un rôle personnalisé, ce rôle pouvait prendre le contrôle de comptes administrateurs sur les versions 2.0.0 à 2.1.0. Détails dans Sécurité.

### Sécurité {#v2-2-0-security}

- **Élévation de privilèges via un rôle `users:manage` délégué (GHSA-9xgh-95qh-2x7h).** Un non-administrateur disposant de `users:manage` via un rôle personnalisé pouvait réinitialiser le mot de passe d'un compte de privilèges supérieurs, ou le supprimer, y compris un administrateur intégré, et prendre le contrôle de l'instance. La réinitialisation de mot de passe et la suppression de compte vérifient maintenant l'autorité de l'appelant sur la cible, donc un rôle délégué ne peut pas dépasser son propre niveau. Concerné : de 2.0.0 à 2.1.0. Signalé par 李春来 (Chunlai Li). (#616)
- **Chaque endpoint d'outil est maintenant protégé.** L'accès aux outils était vérifié route par route, donc les 45 routes écrites à la main devaient toutes penser au même appel, et aucune ne l'a fait. Un rôle sans `tools:use` pouvait quand même exécuter image-to-pdf, erase-object, upscale, sign-pdf et le reste. Le contrôle vit maintenant dans un seul preHandler basé sur la route correspondante, donc il couvre les sous-chemins et toute route ajoutée plus tard. (#646)
- **La limitation de débit pouvait être contournée sur les installations Docker.** L'image livrait `TRUST_PROXY=true`, donc l'IP du client venait d'un en-tête de requête et un `X-Forwarded-For` falsifié passait le limiteur de connexion. La valeur par défaut est maintenant une liste de confiance de réseaux privés. (#649)
- **Les écritures de paramètres sont vérifiées paramètre par paramètre**, et non une seule fois à l'entrée, et l'import de configuration est maintenant transactionnel pour qu'une clé rejetée ne laisse pas une configuration à moitié appliquée. (#618)
- **Les noms de fichiers de la bibliothèque ne peuvent pas sortir de leur racine de stockage.** Un nom stocké forgé, qu'un import SQLite 1.x malveillant copie tel quel, pouvait lire ou supprimer des fichiers hors du répertoire des fichiers. Atteignable seulement après qu'un opérateur importe une base SQLite 1.x fournie par un attaquant, ce qui est le seul chemin permettant de choisir un nom stocké. Signalé par @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **L'annulation de tâche vérifie la propriété**, donc un utilisateur authentifié ne peut plus annuler la tâche d'un autre utilisateur à partir de son identifiant. Signalé par @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Un nouvel audit de toute l'arborescence 2.0 a repéré ce qui restait ouvert** : une assertion SAML capturée pouvait être rejouée, un défi MFA survivait à un nombre illimité de codes erronés, la recherche de clé d'API à chaque requête était un balayage complet de table, `MAX_WORKSPACE_SIZE_GB` était une configuration morte, et le sanitiseur SVG laissait passer des href `javascript:` sans guillemets. (#620)
- **Neuf CVE divulguées corrigées** : fast-uri, svgo, sharp et tar en transitif (#619), ainsi que Pillow 12.3.0 (#517). Le décodage RAW sur arm64 compile maintenant LibRaw 0.22.2 depuis les sources au lieu de lier une copie système non corrigée. (#649)

### Nouvelles fonctionnalités {#v2-2-0-new-features}

- **Rounded Crop** : masques en carré arrondi et en squircle de style iOS, avec un contrôle du rayon des coins. Conçu pour les favicons et les icônes d'application. (#602)
- **Remove GIF Background** : retirez l'arrière-plan d'un GIF, WebP ou APNG animé image par image et récupérez une animation transparente. (#502)
- **Lasso et mode Haute qualité de l'effaceur d'objets** : tracez une boucle libre au lieu de peindre chaque pixel, et installez en option un bundle d'inpainting par diffusion pour des remplissages plus propres sur de grandes zones. (#503, #566)
- **Enregistrer comme nouveau, ou écraser.** Modifier un fichier de la bibliothèque remplaçait discrètement l'original. Vous choisissez maintenant à chaque modification, et par défaut l'original est conservé. (#564, #577)
- **Préréglages de proportions dans Resize.** Choisissez 1:1, 4:3 ou 16:9 et les deux dimensions restent verrouillées, sans agrandissement. (#530)
- **OCR à deux niveaux** : un niveau rapide est intégré à l'image et fonctionne hors ligne sans téléchargement, et un runtime plus précis s'installe à la demande. (#519)
- **Tapez n'importe où pour rechercher.** Commencez à taper sur le tableau de bord ou la page d'accueil et le texte arrive dans la zone de recherche. (#644)
- **Documentation et site web en 21 langues** : le site de documentation, les pages d'accueil et la référence de l'API sont maintenant tous traduits, rejoignant l'interface de l'application. Un nouveau guide de déploiement à faibles ressources couvre le Raspberry Pi et les machines de 2 Go. (#548)
- **Noms d'outils plus clairs** : 18 noms ambigus se qualifient maintenant eux-mêmes, donc « Compress » est devenu « Compress Image ». Les identifiants et routes des outils sont inchangés, donc aucun favori ne casse. (#520)

### Améliorations {#v2-2-0-improvements}

- **Contraste WCAG AA dans toute l'interface** : la palette a été réglée pour que l'orange vif reste sur les aplats tandis que le texte et les libellés utilisent des jetons d'encre accessibles, et les 57 indicateurs de focus passent maintenant le seuil de 3:1 pour les éléments non textuels. (#567, #574)
- **L'agrandissement et la suppression d'arrière-plan ne semblent plus figés** : la barre de progression avance pendant l'inférence au lieu de rester à 30 %, et les deux outils avertissent maintenant qu'un hôte CPU seul est beaucoup plus lent. (#605, #608)
- **Les messages de délai d'attente nomment la vraie cause** et tiennent compte des hôtes CPU seul au lieu d'accuser le téléversement. (#596)
- **SnapOtter attend Postgres et Redis au démarrage** au lieu de redémarrer en boucle, dans Compose comme dans l'image tout-en-un. Une installation Proxmox LXC redémarrait 76 fois avant cela. (#537, #595)
- **Les téléchargements survivent à un proxy inverse** : SnapOtter demande à nginx et aux proxys compatibles de ne pas mettre en mémoire tampon les réponses de fichiers, ce qui est la cause habituelle d'un téléchargement auto-hébergé qui démarre sans jamais finir. (#604, #607)
- **Compress PDF atterrit près de la taille cible**, et le dit honnêtement quand une cible est hors d'atteinte. (#522)
- **Les commandes d'outils sur mobile restent accessibles** maintenant que les coques de l'application s'adaptent à la fenêtre d'affichage dynamique. (#559)
- **Convert Audio expose un paramètre de fréquence d'échantillonnage.** (#561)
- **Les administrateurs peuvent assouplir la longueur minimale du mot de passe**, jusqu'à 1 pour une instance de réseau local de confiance. (#543)
- **La MFA est en libre-service**, le verrouillage par la politique est corrigé, et les connexions OIDC ou SAML reçoivent un vrai défi MFA au lieu d'un blocage pur et simple. (#531, #536)
- **Un simple `Error: Error` nomme maintenant sa cause.** Les échecs d'encodage de sharp, les sorties du sidecar d'IA, les sorties non JSON du sidecar de documents et les échecs de suppression d'arrière-plan arrivaient tous avec la raison effacée. (#532, #534, #535, #538, #612)
- **La boîte de dialogue d'aide est traduite.** Ses libellés de raccourcis et son texte de prise en main étaient codés en anglais alors que des traductions terminées restaient inutilisées dans les 21 fichiers de langues. (#647)

### Corrections de bogues {#v2-2-0-bug-fixes}

- **Les fichiers HEIC d'iPhone étaient rejetés** comme illisibles avant d'atteindre le décodeur qui les gère. (#631)
- **Les préréglages de conversion échouaient sur un second fichier** : jpg-to-pdf et ses frères image-to-pdf, ainsi que pdf-to-png, pdf-to-jpg et pdf-to-tiff, renvoyaient tous `Tool not found` dès que vous téléversiez deux fichiers. (#633, #643)
- **Les préréglages de conversion PDF perdaient leur bouton de téléchargement.** (#629)
- **Un délai de traitement illimité n'était pas respecté**, et les flux de progression bloqués se rétablissent maintenant au lieu de laisser l'interface en attente. (#638)
- **Les téléchargements se bloquaient au lieu d'échouer** quand un fichier stocké s'avérait plus court que sa longueur enregistrée. (#617)
- **Les outils de pages PDF échouaient sur les fichiers courts et chiffrés** : Remove Pages utilisait par défaut une plage de pages qu'aucun document de moins de six pages n'a, et les PDF protégés par mot de passe échouaient de façon cryptique dans le worker. (#594)
- **PDF to Text renvoyait silencieusement un fichier vide** pour les PDF numérisés. Il vous oriente maintenant vers l'OCR et sert le texte en UTF-8. (#603)
- **PDF to Word perdait les blocs de texte colorés** et les répartissait sur la page. (#500)
- **L'effaceur d'objets laissait des restes fantômes** et floutait les petits objets dans les images en haute résolution. (#501)
- **Stabilize Video écrivait une sortie illisible** sans faststart. (#593)
- **Réparations de l'éditeur d'images** : rotation, retournement, redimensionnement, niveaux, courbes, filtres et verrouillage de calque. (#597)
- **Sign PDF affichait un canevas vide** au lieu d'indiquer pourquoi un PDF n'avait pas pu se charger. (#545)
- **La bibliothèque de fichiers enregistrait des dimensions de 0x0** et sautait les aperçus pour les téléversements HEIC, RAW et PSD. (#636, #637)
- **L'installation de plus d'un bundle d'IA** laissait le virtualenv partagé avec plusieurs versions et cassait discrètement trois outils. (#649)
- **La conversion en JXL à une qualité de 1 à 4 renvoyait un 500**, et un ffmpeg manquant vous était signalé comme un téléversement corrompu. (#649)
- **Une panne passagère de Postgres laissait des tâches terminées en suspens**, avec une sortie sur disque sans ligne pour y pointer. Un réconciliateur adopte maintenant ce travail au lieu de l'abandonner. (#649)
- **Un endpoint Redis qui changeait d'adresse bloquait tous les consommateurs** alors que les contrôles de santé répondaient toujours 200. (#649)
- **Corrections du site web et de la documentation** : les liens localisés ne perdent plus les fragments `#` ni ne passent `zh-CN` en minuscules, la navigation de la documentation reste dans la fenêtre sur tablette, et aucun des deux sites n'appelle plus l'API GitHub depuis votre navigateur. (#516, #562, #570, #560)

### Notes de mise à jour {#v2-2-0-upgrade-notes}

Rien à migrer, mais deux valeurs par défaut livrées ont changé :

- **`TRUST_PROXY` vaut maintenant par défaut `loopback,linklocal,uniquelocal`** au lieu de faire confiance à tous les pairs. Les réseaux Docker bridge et Compose se situent dans cette plage, donc la plupart des configurations n'ont rien à changer. Si votre proxy inverse atteint SnapOtter depuis une adresse publique, définissez `TRUST_PROXY` explicitement, sinon la limitation de débit et les journaux d'audit attribueront chaque requête au proxy.
- **`MAX_AI_JOBS_PER_USER` vaut 5 par défaut** tâches d'IA à fichier unique en cours par utilisateur. Les exécutions d'IA par lot et de pipeline restent sans plafond.

Nouveaux réglages facultatifs : `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (désactivé par défaut) et `GIF_BG_MAX_FRAMES`.

### Remerciements {#v2-2-0-acknowledgements}

Une bonne partie de cette version est partie du rapport de bogue de quelqu'un d'autre.

Code et contributions :

- **@mvanhorn** ❤️ : a réécrit l'échec de délai d'attente de remove-background en un message qui dit quoi faire, au lieu d'un simple délai dépassé. (#518, #494)
- **@EuanTop** ❤️ : a rétabli l'action de téléchargement sur les pages de préréglages de conversion PDF en faisant renvoyer par la route synchrone le contrat de résultat d'outil standard. (#629, #623)
- **@harshjainnn** ❤️ : a diagnostiqué le téléchargement qui démarre sans jamais finir et proposé la piste de réinitialisation du socket sur laquelle le correctif a été construit. (#617, #590)

Divulgations de sécurité :

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)) : a divulgué en privé l'élévation de privilèges via un rôle `users:manage` délégué, avec une analyse complète de la source au point d'impact et une chaîne d'exploitation fonctionnelle. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar) : a divulgué une IDOR authentifiée sur l'annulation de tâche, et une traversée de chemin dans les noms de fichiers stockés de la bibliothèque, atteignable après un import SQLite 1.x malveillant, avec une preuve de concept fonctionnelle pour chacune. (#599, #600)

Rapports de bogues :

- **@riz467** ❤️ : de vrais fichiers HEIC d'iPhone rejetés à la validation, avec la cause racine établie dans le rapport. (#622)
- **@coupej** ❤️ : les pages de préréglages PDF qui se bloquaient pour toujours, et jpg-to-pdf qui échouait dès l'ajout d'un second fichier. Deux bogues distincts, correctement séparés. (#623, #627)
- **@linuxuser1** ❤️ : `PROCESSING_TIMEOUT_S=0` documenté comme illimité mais plafonné à cinq minutes. (#630)
- **@bezibaerchen** ❤️ : Convert Audio cachait le paramètre de fréquence d'échantillonnage que sa propre description promettait. (#558)
- **@hell-toupee** ❤️ : le bundle d'OCR précis qui échouait à s'installer avec une erreur `libpaddle`. (#505)
- **@Michael1260** ❤️ et **@And-CSH** ❤️ : ont confirmé indépendamment cet échec d'installation de l'OCR et établi que l'extraction manuelle fonctionne alors que l'installeur intégré à l'application non, ce qui a situé le bogue dans l'installeur. (#505)
- **@TomErnst1972** ❤️ : l'activation de la politique MFA obligatoire qui verrouillait un administrateur hors de sa propre instance. (#515)
- **@thokich** ❤️ : l'effacement d'objets qui produisait des remplissages flous et inutilisables, ce qui a motivé à la fois la réécriture de l'inpainting HD et le bundle facultatif haute qualité. (#141)
- **@Hennie-git** ❤️ : une installation Proxmox LXC qui redémarrait 76 fois face à un Postgres qui n'acceptait pas encore de connexions. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts) : a trié ce rapport en temps réel et produit le diagnostic sur lequel le correctif de démarrage a été construit. (#537)

Demandes de fonctionnalités et retours :

- **@LECOQQ** ❤️ : a demandé d'assouplir la complexité des mots de passe sur une installation de serveur domestique. (#136)
- **@killervette42** ❤️ : a demandé une Community App Unraid, maintenant publiée dans le store Unraid CA. (#96)
- **@alienatedsec** ❤️ : a fait remarquer que le correctif du repli GPU vers CPU était enterré dans un ticket fermé et introuvable, ce qui explique sa place dans la documentation de déploiement. (#490, #587)
- **@neilp316** ❤️ : a confirmé l'échec du GPU Blackwell sur une RTX 5060 et tracé un chemin de mise à niveau fonctionnel vers CUDA 12.8. (#120)
- **@Roiki11** ❤️ : a plaidé pour un stockage partagé avec des références de chemin plutôt qu'un transfert de fichiers par HTTP pour le calcul d'IA hors machine. (#189)

Merci également aux membres de la communauté qui ont signalé ces problèmes par Discord et par e-mail, et dont nous n'avons pas noté les noms : la demande de recadrage en squircle (#602), le téléchargement image-to-PDF qui démarrait sans jamais finir (#604, #607), l'outil Delete Pages qui se bloquait (#594), le texte arabe manquant dans pdf-to-text (#603), et le diagnostic derrière le repli GPU d'ONNX (#490).

[Différences complètes sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 transforme la boîte à outils d'images en une suite complète de manipulation de fichiers : plus de 200 outils répartis sur cinq modalités (Image, Vidéo, Audio, PDF et Fichiers), reconstruite sur Postgres 17 et une file de tâches adossée à Redis, avec un `docker run` en une commande. C'est une version majeure ; lisez Changements incompatibles avant de migrer depuis la 1.x.

### Nouvelles fonctionnalités {#new-features}

- **Quatre nouvelles modalités d'outils** : Vidéo, Audio, PDF et Fichiers rejoignent Image, portant le catalogue à plus de 200 outils.
- **Tâches d'arrière-plan durables** : une file adossée à Redis (BullMQ) exécute chaque outil comme une tâche suivie, avec une progression SSE en direct.
- **Mode tout-en-un à conteneur unique** : un seul `docker run` démarre une instance complète avec Postgres et Redis embarqués.
- **Bundles d'IA à la demande** : suppression d'arrière-plan, OCR, transcription, agrandissement, détection et amélioration des visages, effaceur d'objets, colorisation et restauration de photos s'installent depuis l'interface. L'accélération GPU est détectée par framework.
- **Sign PDF** : dessinez, tapez ou téléversez une signature et placez-la sur un PDF dans le navigateur.
- **Automate** : un constructeur visuel de pipelines qui enchaîne les outils, avec neuf modèles prédéfinis.
- **83 préréglages de conversion en un clic** : des convertisseurs dédiés JPG vers PNG, MP4 vers GIF et similaires, avec recherche approximative.
- **Éditeur d'images par calques** : un éditeur propulsé par Konva sur `/editor` avec pinceaux, formes, ajustements, filtres et courbes.
- **Bibliothèque de fichiers** : enregistrez n'importe quel résultat et réutilisez-le comme entrée d'un autre outil.
- Outils épinglés, zoom et déplacement dans le canevas, 21 langues, et fonctionnalités entreprise (OIDC/SSO, SAML, SCIM, stockage S3, permissions par outil, export d'audit, traçage distribué).

### Améliorations {#improvements}

- Annulation d'un processus en cours. (#137)
- Décodage RAW pleine résolution via LibRaw, y compris DNG. (#289)
- Déploiements non root et à UID étranger (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Détection précise de l'installation de l'IA et flux d'installation durci. (#214, #352)
- Durcissement de la confidentialité : aucune sortie automatique vers des tiers, plus un mode strict hors ligne facultatif.
- Bouton de retour d'expérience toujours actif, même quand l'analytique est désactivée.

### Corrections de bogues {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` désactive de nouveau la limitation de débit pour les routes d'outils. (#271)
- Chemins du virtualenv d'IA réparés dans l'image Docker. (#390)
- Compatibilité avec sharp 0.35.2+. (#362)
- Corrections de mise en page de l'éditeur d'images : règles, comportement du remplissage, barre latérale et dimensionnement du canevas. (#258, #259)
- Traduction italienne complétée. (#231, #206, #425)
- Les normalisations audio normalize et loudnorm conservent la fréquence d'échantillonnage source.
- Durcissement SSRF : correspondance CIDR IPv6 numérique et pré-analyse d'URL élargie. (#287)
- Les PDF générés portent SnapOtter comme Producer.
- mediapipe s'installe sur Python 3.13 et Debian 13.

### Changements incompatibles {#breaking-changes}

La 2.0 remplace la base SQLite embarquée par Postgres 17 et ajoute Redis 8 pour la file de tâches. Vos données 1.x migrent automatiquement au premier démarrage, mais la pile de conteneurs a changé : sauvegardez donc d'abord l'intégralité de votre volume `/data` (la 1.x exécute SQLite en mode WAL, donc les données validées se trouvent généralement dans `snapotter.db-wal`). Choisissez ensuite l'image à conteneur unique (Postgres et Redis embarqués, root uniquement) ou la pile Compose (application plus Postgres 17 et Redis 8). Voir le [guide de migration](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) et le [guide de mise à niveau](/fr/guide/upgrading).

### Mise à niveau {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Différences complètes sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nouvel outil HTML to Image, accessibilité WCAG 2.2 AA, durcissement de la sécurité issu de tests d'intrusion, et 5 correctifs Docker critiques.

### Nouvelles fonctionnalités {#new-features-1}

- **HTML to Image** : capturez des écrans d'URL ou de HTML brut en PNG/JPEG/WebP. Captures pleine page, fenêtres d'affichage personnalisées, mode sombre.
- **Convention Docker _FILE pour les secrets** : montez les variables d'environnement sensibles comme fichiers plutôt qu'en clair. (#205)
- **Licence entreprise et stockage S3** : clé de licence commerciale facultative et stockage d'objets compatible S3.
- **Améliorations de l'éditeur de formes** : transparence du remplissage et du contour, sélecteur de couleur RGBA, styles de lignes pointillées.
- **Archives de version précompilées** : téléchargez des tarballs depuis GitHub Releases pour les installations hors Docker (Proxmox, bare metal, LXC). (#202)

### Améliorations {#improvements-1}

- **Accessibilité WCAG 2.2 AA** : lien d'évitement, piège du focus, régions aria-live, prise en charge de la réduction des animations, rapports de contraste corrects. (#209)
- **Adaptation mobile** : paramètres adaptatifs, reconnexion SSE automatique au changement d'onglet sur mobile. (#203, #204)
- **Qualité de la suppression d'arrière-plan** : lissage des bords, décontamination des couleurs, choix du format de sortie.
- **Traduction italienne** : environ 145 nouvelles chaînes par @albanobattistella. (#206)
- **Documentation d'API par outil** : 53 pages de documentation avec paramètres, exemples et formats de réponse.
- **Téléchargements de modèles d'IA** : logique de nouvelle tentative avec attente exponentielle pour HuggingFace. (#201)

### Corrections de bogues {#bug-fixes-1}

- Les conteneurs Docker neufs étaient totalement inutilisables (la limitation de débit bloquait toutes les requêtes).
- Les outils d'IA de détection de visages (blur-faces, red-eye-removal, enhance-faces, passport-photo) échouaient sur toutes les plateformes.
- Fichiers HEIC cassés sur ARM (symboles libheif incompatibles).
- Les bundles d'IA upscale et restore-photo échouaient à s'installer sur ARM.
- L'OCR utilisait la mauvaise version de CUDA sur les conteneurs GPU.
- Contournement de la protection SSRF via des adresses IPv6 mappées IPv4 en hexadécimal. (Crédit : @tonghuaroot)
- Décodage HEIC d'iPhone avec images auxiliaires. (#183, #199)
- Mémoire CUDA insuffisante de Real-ESRGAN sur des GPU de 8 Go. (#200)
- 6 erreurs Sentry de production et 7 bogues de QA. (#208)

### Sécurité {#security}

- 10 constats de tests d'intrusion traités (contournement XFF, plantages sur JSON mal formé, pipelines non bornés, XSS dans le journal d'audit, méthode TRACE, et plus). (#207)
- Contournement SSRF par IPv6 hexadécimal bloqué. (Crédit : @tonghuaroot)
- Images de base du Dockerfile épinglées par empreinte.

### Mise à niveau {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Différences complètes sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Démo en ligne, pages d'accueil par outil, et un lot de corrections de finition.

### Nouvelles fonctionnalités {#new-features-2}

- **Démo en ligne** : [demo.snapotter.com](https://demo.snapotter.com) permet d'essayer SnapOtter sans rien installer.
- **Page d'index des outils** : parcourez plus de 50 outils sur `/tools` avec recherche et filtres par catégorie.
- **Plus de 50 pages d'accueil SEO** : chaque outil a désormais une page dédiée avec FAQ, cas d'usage et tableaux comparatifs.
- **Aperçu de l'arrière-plan** : le curseur avant/après affiche un damier derrière les images transparentes.
- **Générateur de mots de passe forts** : un bouton en un clic dans le formulaire Ajouter des membres.

### Corrections de bogues {#bug-fixes-2}

- L'outil d'informations HEIC/HEIF n'échoue plus (pré-décodage ajouté).
- L'installation des bundles de modèles d'IA affiche de meilleurs messages d'erreur et respecte les limites de ressources.
- Les miniatures de la bibliothèque se chargent correctement (les en-têtes d'authentification manquaient).
- Les menus déroulants ne sont plus coupés dans les tableaux de paramètres Personnes et Équipes.
- Le pourcentage de comparaison de taille est masqué sur les outils qui ne compressent pas.
- Lien en double vers la politique de confidentialité supprimé.
- Traduction italienne ajoutée pour les paramètres des fonctionnalités d'IA.
- Icônes Lucide renommées mises à jour (Wand2, Columns).

### Infrastructure {#infrastructure}

- OpenSSF Scorecard durci, de 4,3 à environ 7,0.
- Tests CI parallélisés en 4 fragments avec des jeux de données réduits.
- 41 mises à jour de dépendances.

### Mise à niveau {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Différences complètes sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Cinq nouveaux outils, un éditeur d'images complet, la connexion SSO, 20 langues. Cela aurait sans doute dû faire trois versions distinctes, mais nous voilà.

### Nouvelles fonctionnalités {#new-features-3}

- **Éditeur d'images** : calques, pinceaux, formes, ajustements, filtres, courbes, raccourcis clavier. Il s'exécute dans votre navigateur et traite sur votre matériel.
- **Authentification OIDC / SSO** : connectez-vous avec Google, GitHub, Okta ou n'importe quel fournisseur OpenID Connect. Définissez quelques variables d'environnement et votre équipe utilise ses comptes existants.
- **Générateur de mèmes** : 100 modèles intégrés avec rendu du texte via opentype.js. Ou téléversez votre propre image.
- **Beautify** : déposez une capture d'écran, obtenez une image soignée. Cadres d'appareils (macOS, Windows, navigateur), ombres, dégradés, préréglages pour les réseaux sociaux.
- **Simulation du daltonisme** : prévisualisez l'apparence des images avec la protanopie, la deutéranopie, la tritanopie et d'autres déficiences de la vision des couleurs.
- **Correcteur de transparence PNG** : détecte les PNG faussement transparents et les corrige avec le matting haute résolution BiRefNet. Suppression facultative des filigranes via l'inpainting LaMa.
- **Extension de canevas par IA** : étendez les limites de l'image avec un remplissage par IA. Trois niveaux de qualité (rapide, équilibré, qualité) selon le temps GPU que vous voulez y consacrer.
- **20 langues** : arabe, chinois (simplifié/traditionnel), tchèque, néerlandais, français, allemand, hindi, indonésien, italien, japonais, coréen, polonais, portugais, russe, espagnol, thaï, turc, ukrainien, vietnamien. Le RTL fonctionne pour l'arabe.
- **Import par URL** : collez des URL dans la zone de dépôt ou importez-les en masse depuis une liste. Récupération côté serveur avec protection SSRF.
- **Effaceur multi-fichiers** : dessinez des masques d'effacement sur plusieurs images et traitez-les toutes en un clic. Les traits persistent par image.
- **Import/export de pipelines** : enregistrez des chaînes d'outils en JSON et partagez-les avec d'autres.
- **17 nouveaux formats RAW d'appareils photo** via exiftool, plus QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ et APNG en entrée. Nouveaux codecs de sortie pour BMP, ICO, JP2, QOI. Export AVIF, TIFF, GIF, JXL et PSD récupéré d'une branche auparavant perdue.

### Améliorations {#improvements-2}

- **Amélioration d'image** : l'ancien pipeline est remplacé par CLAHE + normalisation + gamma. Le nouveau bouton Deep Enhance utilise le modèle d'IA pour des résultats plus marqués.
- **Restauration de photos** : la détection des rayures est réécrite avec un filtrage Otsu à 8 angles. L'inpainting LaMa s'exécute maintenant à la résolution native.
- **Formats exotiques partout** : OCR, image-to-PDF, générateur de favicon, composition, assemblage et vectorisation décodent désormais HEIC, RAW et PSD.
- **Compress** : la tolérance de la taille cible passe de 5 % à 1 %. La taille cible est le mode par défaut. Ajout de boutons de pas et d'un sélecteur d'unité Ko/Mo.
- **Nettoyage Sentry** : 644 événements inexploitables filtrés. Les vraies erreurs sont maintenant traitées correctement.
- **Détection du GPU** : meilleurs diagnostics pour les conteneurs où CUDA est présent mais pas nvidia-smi.
- **Mode sans authentification** : l'utilisateur anonyme est créé dans la base avec le rôle admin. Les clés d'API, les pipelines et les fichiers d'utilisateur ne cassent plus sur les contraintes de clé étrangère.
- **Plus de 2 705 nouveaux tests** unitaires, d'intégration et E2E.

### Corrections de bogues {#bug-fixes-3}

- L'agrandissement sur CPU n'expire plus sur les NAS et le matériel basse consommation.
- Le logo du code QR ne fait plus disparaître l'aperçu définitivement.
- Débordement du recadrage corrigé pour les images portrait hautes.
- Les fichiers TIFF avec alpha forcent correctement une sortie PNG au lieu de produire une corruption.
- Le décodage HDR/EXR convertit en 8 bits avant CLAHE, ce qui corrige les échecs de décodage.
- Les tampons d'entrée des repères faciaux sont convertis en PNG avant le sidecar Python, ce qui corrige des plantages.
- Find duplicates gère les lots de formats mixtes et les erreurs réseau.
- L'aperçu de Beautify se met à jour en temps réel.
- Barres de progression pour l'assemblage et la vectorisation.
- SVGZ pris en charge par SVG-to-raster.
- Noms de fichiers non ASCII corrigés via l'en-tête X-File-Results encodé en pourcentage.

### Mise à niveau {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Différences complètes sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Image Docker unifiée avec détection automatique du GPU. Une seule image gère les charges CPU et GPU. Compose simplifié en un seul fichier avec rotation des journaux. Les pré-téléchargements de modèles incluent maintenant une vérification et un test de fumée.

---

## v1.13.0 {#v1-13-0}

Contrôle d'accès basé sur les rôles (RBAC). 14 permissions granulaires, trois rôles intégrés (admin, editor, user), prise en charge de rôles personnalisés. Contrôles de permissions sur toutes les routes de l'API. Onglets du frontend filtrés selon les permissions de l'utilisateur.

---

## v1.12.0 {#v1-12-0}

Outil PDF to Image. Convertissez des pages PDF en PNG, JPEG, WebP ou TIFF avec un DPI personnalisé. Image Docker unifiée avec détection automatique du GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt généré automatiquement via vitepress-plugin-llms pour une documentation adaptée à l'IA.

---

## v1.10.0 {#v1-10-0}

Redimensionnement sensible au contenu (seam carving) avec protection des visages. Redimensionnez des images tout en préservant le contenu important.

---

## v1.9.0 {#v1-9-0}

Outil Stitch / Combine. Assemblez des images côte à côte, empilées verticalement ou dans une grille personnalisée.

---

## v1.8.0 {#v1-8-0}

Outil Edit Metadata. Affichez et modifiez les métadonnées EXIF, IPTC et XMP avec une interface granulaire de suppression/conservation.

---

## Anciennes versions {#older-releases}

Pour le journal complet au niveau des commits, y compris les versions de correctifs, voir [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).