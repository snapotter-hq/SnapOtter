---
description: "Notes de version et historique des versions de SnapOtter. Découvrez les nouveautés, les améliorations et les correctifs de chaque version."
i18n_source_hash: 8cacf16b4c4d
i18n_provenance: machine
i18n_output_hash: 126e7afa4b74
i18n_hash_version: 2
---

# Journal des modifications {#changelog}

## Non publié {#unreleased}

### Modifié {#unreleased-changed}

- **Le redimensionnement sensible au contenu s'exécute désormais comme une tâche en arrière-plan.** `POST /api/v1/tools/image/content-aware-resize` gardait la requête ouverte pendant toute la découpe des coutures et répondait `200` avec le résultat. Il répond maintenant `202 Accepted` avec un `jobId`, `statusUrl` et `progressUrl`, comme les autres outils de longue durée. Suivez `/api/v1/jobs/{jobId}/progress` via SSE : le `result` de la trame avec `phase: "complete"` contient les mêmes champs `downloadUrl`, `originalSize`, `processedSize`, `width` et `height` que l'ancien corps `200`, et un échec de traitement arrive sous forme de trame `phase: "failed"` au lieu d'un `422`. Le `httpStatus` de cette trame vaut `400` quand le problème venait de l'entrée (une image de plus de 25 MP, ou un agrandissement de plus de 2x), là où l'ancienne route répondait `422`. Vous pouvez désormais annuler une tâche en cours et fournir votre propre `clientJobId`. Une requête sans `width`, `height` ni `square` reçoit maintenant `400` `"Invalid settings"`, avec l'ancien message dans `details`. (#4338)
- **Image vers SVG (`vectorize`) s'exécute désormais comme une tâche en file d'attente.** `POST /api/v1/tools/image/vectorize` vectorisait pendant la requête et répondait toujours `200`. Il passe maintenant par la file de tâches comme les autres outils : une vectorisation qui se termine dans la fenêtre d'attente synchrone répond toujours `200` avec le même corps, et une plus longue répond `202` avec un identifiant de tâche, `statusUrl` et `progressUrl`. Les clients d'API qui ne gèrent que `200` doivent suivre la tâche quand ils reçoivent `202`. La tâche peut maintenant être annulée et signale sa progression, et les corps d'erreur utilisent les formes standard des outils (un fichier manquant indique `No file provided` ; une image non décodable est une `400`). La sortie SVG est inchangée. (#4337)
- **La génération de photo d'identité s'exécute désormais comme une tâche en file d'attente.** `POST /api/v1/tools/image/passport-photo/generate` recadrait pendant la requête et répondait toujours `200`. Un recadrage qui se termine dans la fenêtre d'attente synchrone répond toujours `200` avec le même corps (plus `originalSize` et `processedSize`), et un plus lent répond `202` avec un identifiant de tâche, `statusUrl` et `progressUrl` ; le `result` de la trame `phase: "complete"` contient `downloadUrl`, `dimensions`, `spec` et `printDownloadUrl`. Les clients d'API qui ne gèrent que `200` doivent suivre la tâche quand ils reçoivent `202`. Le corps accepte un `clientJobId` facultatif, et la tâche peut être annulée. Les statuts d'erreur avant le démarrage de la tâche sont inchangés (`400`, `404`, `410 ANALYSIS_EXPIRED`) ; un échec de traitement répond toujours `422` avec `details`, et inclut maintenant aussi un `code` quand il y en a un, comme `TARGET_SIZE_UNREACHABLE`. L'étape d'analyse est inchangée. (#4337)

### Obsolète {#unreleased-deprecated}

- **Les cinq opérations de compression d'images vers une taille cible sont obsolètes.** `/api/v1/tools/image/compress-image-to-20kb`, `-50kb`, `-100kb`, `-200kb` et `-500kb` sont marquées comme obsolètes dans la spécification OpenAPI et resteront au moins une version mineure. Envoyez `POST /api/v1/tools/image/compress` avec `settings` réglé sur `{"mode":"targetSize","targetSizeKb":20}` (ou 50, 100, 200, 500). La sortie est la même. Les chemins des préréglages PDF sont inchangés.

## v2.3.0 {#v2-3-0}

SnapOtter vient de dépasser le million de téléchargements d'images sur Docker Hub et GHCR, et les 3 000 étoiles sur GitHub. Cela fait beaucoup de serveurs auto-hébergés, alors cette version est notre façon de remercier tous ceux qui les font tourner.

Mettez à niveau rapidement. La 2.3.0 corrige six avis de sécurité, dont un de gravité élevée. Les détails se trouvent dans la section Sécurité ci-dessous.

Au-delà des correctifs, il y a de nouveaux outils : un éditeur de pages PDF Multi-Tool, des préréglages de compression à une taille cible en un clic pour les images et les PDF, et le tri des pages par glisser-déposer dans Organiser un PDF. L'OCR lit désormais l'arabe, et pdf-to-text propose l'OCR lorsqu'il tombe sur un PDF numérisé. SnapOtter peut fonctionner sous un sous-chemin comme `/snapotter` derrière un proxy inverse. L'application n'a plus besoin d'un superutilisateur Postgres pour fonctionner. Les administrateurs qui se retrouvent bloqués peuvent récupérer leur accès en ligne de commande. Le reste, ce sont environ 1 400 correctifs, la plupart pour des problèmes que vous avez signalés.

> [!IMPORTANT]
> Les six avis ci-dessous concernent la 2.2.0, et certains remontent jusqu'à la 2.0.0. Si vous partagez une instance avec d'autres utilisateurs ou si vous l'exposez au-delà de votre propre réseau, mettez à niveau.

### Sécurité {#v2-3-0-security}

- **Les SVG téléversés pouvaient échapper à l'assainissement (GHSA-9c7h-xjrp-8gh3, élevée).** Un SVG rejeté par le décodeur d'images était stocké et servi tel quel au lieu d'être assaini. Versions concernées : 2.2.0 et antérieures. Signalé par @xaferima. (#1211)
- **Le flux de progression des tâches ne vérifiait pas qui le demandait (GHSA-ff22-w6x2-fm98, moyenne).** Il exige désormais une connexion et la propriété de la tâche. Versions concernées : 2.0.0 à 2.2.0. (#1750)
- **Les liens de téléchargement des résultats servaient aussi le fichier d'origine (GHSA-jgv3-2jc6-f628, moyenne).** Versions concernées : 2.2.0 et antérieures. Signalé par @emirhancatkin. (#3623)
- **La photo d'identité et les effets d'arrière-plan faisaient confiance à un identifiant de tâche fourni par le client (GHSA-3c8g-8v4x-qq9j, moyenne).** Versions concernées : 2.2.0 et antérieures. Signalé par @shaoyuuuuu. (#3623)
- **L'import par URL, le téléversement et l'aperçu sautaient les vérifications de permissions des rôles et des clés d'API (GHSA-8xxr-g2w8-7f9r, moyenne).** Versions concernées : 2.2.0 et antérieures. Signalé par @nguyenvantiennani. (#3780, #707)
- **L'application de la SSO révélait le nom d'utilisateur de secours (GHSA-q6fg-vvw9-cr8r, faible).** Une connexion locale refusée reçoit désormais le même 401 que n'importe quel autre échec de connexion. Versions concernées : 2.0.0 à 2.2.0. (#2148)
- **Postgres ne tourne plus en superutilisateur.** L'application se connecte désormais avec un rôle qui peut seulement lire et écrire des données. Les migrations passent par une connexion distincte et facultative. Voir les notes de mise à niveau. (#918)
- **Dépendances corrigées** : les versions minimales imposées pour dompurify et handlebars passent aux versions corrigées. (#4247)

### Nouvelles fonctionnalités {#v2-3-0-new-features}

- **PDF Multi-Tool** : un éditeur de pages qui réordonne, duplique, fait pivoter et supprime des pages, et importe des pages d'autres PDF. Le serveur assemble le fichier final. (#1338)
- **Compresser à une taille cible en un clic** : cinq préréglages pour les images (20, 50, 100, 200, 500 Ko) et cinq pour les PDF (100, 200, 500 Ko, 1 Mo, 2 Mo). (#1250, #1377)
- **Faire tourner SnapOtter sous un sous-chemin** : définissez `BASE_PATH=/snapotter` et la même image sert l'application depuis cet emplacement. Les liens de résultats, les cookies, les redirections SSO et la documentation de l'API suivent tous. (#1252, #1324)
- **OCR en arabe** : choisissez l'arabe explicitement, ou laissez le mode automatique le détecter. Fonctionne pour l'OCR d'images et de PDF. (#4130, #4183)
- **pdf-to-text propose l'OCR** lorsqu'un PDF, ou tout un lot, n'a pas de couche texte, au lieu de renvoyer un fichier vide. (#4142, #4198)
- **Tri des pages par glisser-déposer dans Organiser un PDF**, à la souris et au toucher. (#1249, #2601)
- **Réordonner les fichiers avant un traitement multi-fichiers** : la fusion, l'assemblage, le collage et les autres outils multi-fichiers respectent l'ordre que vous avez défini. (#756, #757)
- **Annuler les lots et les pipelines**, et le travail s'arrête réellement sur le serveur. (#807)
- **Commandes de récupération `snapotter-admin`** : `reset-password`, `create-admin`, `unlock-user` et la réinitialisation de la MFA, pour les administrateurs bloqués hors de l'interface web. (#4016)
- **Inscription à la MFA à la connexion** : quand la MFA est obligatoire, les utilisateurs qui ne l'ont pas encore la configurent sur-le-champ au lieu d'être bloqués.
- **Capture par l'appareil photo et application installable** : prenez une photo directement dans un outil sur mobile, et installez SnapOtter comme PWA. (#773)
- **Marge transparente dans la boîte de dialogue Taille du canevas de l'éditeur.** (#4111)
- **Avis de mise à jour pour les administrateurs** : quand une nouvelle version de SnapOtter sort, les administrateurs voient un avis masquable avec un lien vers les notes de version. La vérification passe par la connexion d'analytics existante, elle est donc désactivée quand l'analytics l'est.

### Améliorations {#v2-3-0-improvements}

- **Le détourage est plus rapide sur les exécutions répétées** : le modèle reste chargé entre les requêtes au lieu d'être rechargé à chaque fois. (#4144)
- **Les téléversements par lots consomment beaucoup moins de mémoire** : chaque fichier va sur un disque temporaire et est traité un par un au lieu de rester en RAM. (#2687)
- **Les installations de bundles d'IA échouent proprement et reviennent en arrière** au lieu de laisser un venv à moitié installé. Les installations du détourage dans des LXC Proxmox fonctionnent à nouveau, et les hôtes à faible mémoire reçoivent des limites CPU raisonnables avant le démarrage d'une tâche. (#2628, #2597, #2526, #2546)
- **La détection des GPU est plus fiable** : CUDA est détecté via le pilote, les cartes RTX série 50 se rabattent sur le CPU au lieu d'échouer, et les encodeurs vidéo matériels sont testés avant usage. (#4225, #4075, #3980, #3983)
- **`MAX_WORKER_THREADS` fonctionne désormais**. La variable était lue mais jamais appliquée. (#3249)
- **Les outils longs obtiennent le délai long** : pdf-to-word, compress-pdf, convert-document et le redimensionnement intelligent n'expirent plus trop tôt sur les gros fichiers. (#3276)
- **Compresser un PDF garde les scans lisibles**, et le signale lorsqu'une taille cible ne peut pas être atteinte au lieu de produire un fichier illisible. (#4112)
- **Les échecs de connexion sont limités par nom d'utilisateur** : plus de dix en quinze minutes donnent un 429 avec `Retry-After`. (#827)
- **Les erreurs disent ce qui s'est mal passé** : binaires manquants, pannes de stockage, arrêts pour manque de mémoire et limites de téléversement reçoivent désormais des messages précis au lieu d'un simple 500 ou 422.
- **Le journal d'audit couvre les exécutions d'outils, de lots et de pipelines**, et les événements liés aux utilisateurs, aux rôles, aux équipes et au RGPD enregistrent qui a fait quoi à qui. (#3991, #3984)
- **Le conteneur tout-en-un s'arrête après un premier démarrage raté** au lieu de redémarrer indéfiniment, et le Postgres et le Redis embarqués ont des délais de démarrage. (#3008, #1130)
- **Les dates et les pluriels suivent votre langue**, et les dernières chaînes anglaises codées en dur sont traduites.
- **Finitions mobiles et dans l'éditeur** : mise en page des curseurs, de Signer un PDF et du recadrage sur téléphone, glisser au toucher, pinceaux de pixels plus rapides, et Niveaux et Courbes dans l'annulation et la sauvegarde automatique.

### Corrections de bugs {#v2-3-0-bug-fixes}

- **Ajuster les couleurs combinait mal les réglages** : température, saturation, teinte, contraste et sépia s'écrasaient au lieu de se cumuler. (#3153, #3120, #3469)
- **Pixeliser ne pixelisait pas**, et la sortie PNG était discrètement réduite à une palette dans plusieurs outils d'image. (#709, #716)
- **Les GIF et WebP animés perdaient des images** dans plusieurs outils, et les palettes et la transparence des GIF étaient incorrectes. (#1184, #1225, #3407, #2573)
- **Les téléversements pivotés perdaient en qualité** : l'orientation automatique abandonnait l'encodage sans perte, la transparence et la profondeur 16 bits. Les WebP animés pivotent désormais toutes leurs images. (#2384, #2529)
- **Les TIFF avec transparence, les fichiers HEIF en AV1 et plusieurs formats RAW** échouaient ou perdaient leur canal alpha. (#2609, #2572, #1120)
- **Redimensionner le canevas de l'éditeur mettait l'image à l'échelle** au lieu d'ajouter de l'espace autour. (#2081)
- **Les noms des fichiers de sortie étaient abîmés** : `.jpeg` et `.tif` devenaient autre chose, et les fichiers cachés ou les noms qui répètent leur extension cassaient. (#3495, #3382)
- **La sauvegarde automatique dans la bibliothèque ignorait le quota de stockage**, et les compteurs de stockage pouvaient devenir négatifs. (#2389, #2585)
- **Les tâches bloquées après un redémarrage** sont désormais réglées au démarrage au lieu d'afficher « en cours » indéfiniment. (#3219, #3193)
- **La connexion OIDC nommait chaque nouvel utilisateur « admin »**, et les connexions depuis Safari sur iOS finissaient sur une page d'erreur après avoir réussi. (#862, #4021)
- **Les règles de mot de passe désactivées étaient encore appliquées** lors de la création d'utilisateurs. (#1028)
- **Les PDF endommagés bloquaient pendant 30 secondes** avant d'échouer. (#920)
- **La vérification d'espace disque des bundles d'IA demandait environ 18 Go** pour installer un seul bundle. (#1248)
- **Compresser une vidéo échouait sur les enregistrements d'écran à fréquence d'images variable.** (#2427)
- **Le détourage par lots perdait des résultats terminés** quand le navigateur relançait la requête. (#2015)
- **Les champs numériques des paramètres ne pouvaient pas être vidés** pendant la saisie. (#1449)
- **Désactiver l'analytics laissait des événements en file d'attente partir** environ 30 secondes plus tard. Ils sont désormais abandonnés dès que vous vous désinscrivez. (#4270)

### Notes de mise à niveau {#v2-3-0-upgrade-notes}

Les migrations s'exécutent d'elles-mêmes au démarrage. Vous n'avez aucun SQL à lancer.

- **Rôles de base de données.** Le fichier Compose de référence donne désormais à l'application un rôle qui peut seulement lire et écrire des données (`DATABASE_URL`) et une connexion privilégiée distincte (`DATABASE_MIGRATION_URL`) utilisée uniquement au démarrage pour les migrations et les droits. Un fichier Compose existant continue de fonctionner comme avant : laissez `DATABASE_MIGRATION_URL` non défini et SnapOtter tourne avec un seul rôle. Pour un déploiement non local, définissez `POSTGRES_APP_PASSWORD` en plus de `POSTGRES_PASSWORD`.
- **Contrôles de démarrage plus stricts.** Ces erreurs survenaient plus tard, ou sans bruit. Elles arrêtent désormais le conteneur avec un message qui nomme la variable : une `DEFAULT_LOCALE` non prise en charge (utilisez un code pris en charge comme `de`, pas `de_DE`), une `SAML_IDP_SSO_URL`, une `SAML_CALLBACK_URL` ou une `OIDC_ISSUER_URL` mal formée quand la SSO est activée, une liste `TRUST_PROXY` invalide, un `BASE_PATH` incorrect et un `LOG_DIR` non accessible en écriture.
- **`TRUST_PROXY` n'accepte plus de nombre de sauts.** Une valeur numérique comme `TRUST_PROXY=2` arrête désormais le conteneur au démarrage au lieu de ne faire confiance silencieusement à aucun proxy. Indiquez les adresses des proxys ou des plages nommées (la valeur par défaut est `loopback,linklocal,uniquelocal`), `false` quand rien ne se place devant SnapOtter, ou `true` uniquement quand un proxy que vous contrôlez se trouve devant sur une adresse publique. (#998)
- **`MAX_WORKER_THREADS` prend désormais effet.** Si vous l'aviez défini sans voir de changement, vous le verrez maintenant.
- **Codes de statut de l'API.** Les pannes de moteur et de stockage renvoient 503 `ENGINE_UNAVAILABLE` (les points de terminaison de lots renvoyaient 422). Les téléversements au-delà de la limite renvoient 413 (au lieu de 400). Un `clientJobId` mal formé renvoie 400 et un identifiant réutilisé 409 (au lieu de 500). Rejouer votre propre lot de pipeline renvoie 202. `mode=targetSize` sans `targetSizeKb` renvoie 400. Une connexion locale refusée sous application de la SSO renvoie 401 au lieu de 403 `SSO_ENFORCED`. Les connexions limitées renvoient 429 `LOGIN_THROTTLED`. Le résultat du détourage n'inclut plus `originalUrl`.
- **Nouvelles variables facultatives** : `BASE_PATH`, `DATABASE_MIGRATION_URL`, `GDPR_EXPORT_TIMEOUT_MS` (15 minutes par défaut, `0` désactive), `EMBEDDED_REDIS_TIMEOUT_S` (180) et `EMBEDDED_POSTGRES_TIMEOUT_S` (600).
- **Les fichiers Compose sont livrés avec la version.** `docker-compose.yml` et `docker-compose-gpu.yml` sont joints à cette version, vous pouvez donc les télécharger directement depuis la page de la version.

### Remerciements {#v2-3-0-acknowledgements}

Un million de téléchargements, c'est beaucoup de personnes qui signalent des bugs, envoient des correctifs et nous disent ce qui manquait. Cette version est surtout leur œuvre.

Code et contributions :

- **@zakka258** ❤️ : a créé l'éditeur de pages PDF Multi-Tool et le déploiement sous un sous-chemin, deux des plus grandes fonctionnalités de cette version, y compris les tests d'authentification et de SSO sous un sous-chemin. (#1338, #1252, #1324, #1295)
- **@akshat-lakhera** ❤️ : a créé les préréglages d'images de compression à une taille cible en un clic, corrigé la concurrence et le nettoyage des aperçus, et empêché un stockage de navigateur bloqué de figer l'indicateur de connexion. (#1250, #1368, #2359)
- **@ChrisCreatesNet** ❤️ : a ajouté le réordonnancement des pages par glisser-déposer dans Organiser un PDF, qu'il avait d'abord demandé dans les Discussions. (#1249, #965)
- **@drakeo338** ❤️ : dix correctifs dans toute la pile, dont l'orientation automatique qui conserve le format et la qualité, les groupes SCIM créés en une seule transaction, les installations d'IA sous cgroup v2, et les erreurs 5xx qui ne sont plus masquées en 422. (#1229, #2014, #1638, #1667)
- **@SuranaSanyam** ❤️ : a ajouté la marge transparente du canevas dans l'éditeur, corrigé les verdicts de taille cible obsolètes de Compresser un PDF, et permis les mises à jour partielles des équipes. (#4111, #4112, #1906, #2366, #2367)
- **@thejdubb02** ❤️ : a empêché les instances auto-hébergées d'envoyer des données de cartes de chaleur, validé `TRUST_PROXY` au démarrage au lieu de planter, et corrigé la gestion des noms de groupes SCIM et des délais de qpdf. (#1051, #1052, #1053, #993, #994)
- **@88subarno88** ❤️ : a transformé plusieurs 500 en réponses 400 et 409 correctes pour les identifiants de tâche mal formés et les imports multipart, et corrigé le vidage des champs numériques dans les paramètres. (#1486, #1556, #1603, #1449)
- **@harshoutoftokens** ❤️ : a fait fonctionner la lecture des codes-barres hors ligne en embarquant son décodeur, corrigé les aperçus de médias qui montraient l'entrée, et amélioré la recherche de formats. (#1401, #1512, #1388)
- **@darklabs9** ❤️ : a signalé et corrigé l'échec de Compresser une vidéo sur les enregistrements d'écran à fréquence d'images variable. (#2426, #2427)
- **@dvd233** ❤️ : a exposé tous les formats RAW d'appareils photo pris en charge par le décodeur, et fait apparaître les outils de favicon dans les recherches ICO. (#1120, #1121)
- **@bercedev** ❤️ : a corrigé les noms de fichiers dont la racine répète l'extension, et fait en sorte que l'IA indique l'appareil sur lequel elle tourne réellement. (#3382, #3613)
- **@pamod-madubashana** ❤️ : a traduit le dernier titre MFA resté en anglais et branché des chaînes de progression inutilisées. (#1228, #1227)
- **@mvanhorn** ❤️ : a corrigé l'attribution de noms d'utilisateur en double lors de la connexion SAML. (#2640)
- **@peremunoz** ❤️ : a empêché la génération de codes-barres de masquer les pannes de stockage et de mémoire derrière « Invalid text ». (#4057)
- **@mayuriphad** ❤️ : a corrigé un plantage sur un en-tête d'authentification d'alerte stocké mal formé. (#3080)
- **@DevShoaib78** ❤️ : a corrigé la fermeture du lasso polygonal dans l'éditeur. (#1207)
- **@dltsum** ❤️ : a déplacé les affichages de progression vers le catalogue de messages partagé. (#1262)
- **@albanobattistella** ❤️ : corrections de traduction. (#1024)
- **@shoaibyazdani** ❤️ : a régénéré les références visuelles macOS. (#2475)

Divulgations de sécurité :

- **@xaferima** ❤️ : a découvert que les SVG rejetés par le décodeur échappaient à l'assainissement, et en a évalué l'impact avec nous. (GHSA-9c7h-xjrp-8gh3, #1211)
- **@emirhancatkin** ❤️ : a découvert que les liens de résultats servaient aussi le fichier d'origine. (GHSA-jgv3-2jc6-f628, #3623)
- **@shaoyuuuuu** ❤️ : a découvert que la photo d'identité et les effets d'arrière-plan faisaient confiance à un identifiant de tâche fourni par le client. (GHSA-3c8g-8v4x-qq9j, #3623)
- **@nguyenvantiennani** ❤️ : a découvert que l'import par URL sautait les vérifications de permissions. (GHSA-8xxr-g2w8-7f9r, #3780)
- **tonghuaroot** ❤️ : a signalé des contournements IPv6 des contrôles d'adresses SSRF, avec des preuves de concept fonctionnelles. Les correctifs sont sortis dans la 2.0.0, et ce remerciement n'a que trop tardé. (#287)

Signalements de bugs :

- **@kabo** ❤️ : le `docker-compose.yml` d'exemple ne fonctionnait pas. (#1027)
- **@xromen** ❤️ : les PDF endommagés bloquaient jusqu'à un délai qpdf de 30 secondes. (#920)
- **@snmabaur** ❤️ : la connexion OIDC renommait chaque profil en « admin ». (#862)
- **@CodecNomad** ❤️ : l'outil Flou dupliquait l'image. (#829)
- **@ohora0923** ❤️ et **@Alexis-VS-CSharp** ❤️ : Pixeliser ne fonctionnait pas. (#678, #775)
- **@mptpro** ❤️ : le téléchargement de l'IA de détourage échouait. (#714)
- **@dominic427** ❤️ : redimensionner le canevas de l'éditeur mettait l'image à l'échelle au lieu de l'agrandir. (#2016)
- **@CodeByToast** ❤️ : les champs numériques des paramètres ne pouvaient pas être vidés. (#1186)
- **@gioxx** ❤️ : la vérification d'espace disque des bundles d'IA exigeait environ 18 Go pour un seul bundle. (#1248)
- **@rekcodocker** ❤️ et **@madmike970** ❤️ : les installations de bundles d'IA échouaient dans des LXC Proxmox, avec les détails du conteneur qui ont aidé à cerner le problème. (#1030, #352)
- **@wxf26054** ❤️ : les règles de mot de passe désactivées étaient encore appliquées lors de la création d'utilisateurs. (#1028)
- **@ersil** ❤️ : Safari sur iOS demandait deux fois le callback OIDC et arrivait sur une page d'erreur après une connexion réussie. (#4021)
- **@casi-3** ❤️ : le détourage par lots perdait des résultats terminés quand le navigateur rejouait la requête, avec un diagnostic précis. (#2015)
- **@killervette42** ❤️ : la panne du GPU Blackwell sur unRaid, qui a nourri le repli sur CPU pour la série RTX 50. (#120, #4075)

Demandes de fonctionnalités et retours :

- **@photoevents** ❤️ : a mesuré que le détourage passait environ 11 secondes à charger le modèle et 1 seconde à l'inférence, a proposé de mettre les sessions en cache, et a partagé ce qu'il avait appris en faisant tourner son propre cache. C'est devenu le cache de sessions de cette version. (#768, #776, #4144)
- **@benbou8231** ❤️ : a relevé que les fichiers importés arrivaient dans l'ordre inverse dans les outils multi-fichiers, ce qui a conduit au réordonnancement avant un traitement. (#729, #756)
- **@cf3901646** ❤️ : a remonté une erreur de production bruyante jusqu'à la classe d'erreur Postgres 58 et proposé le correctif. Nous ne pouvions pas fusionner sa PR sans CLA signé, alors nous avons écrit le même correctif nous-mêmes. (#4210, #4253)
- **@chiliec** ❤️ : a remarqué qu'un échec de l'orientation automatique était avalé en silence et que la progression d'installation ignorait le catalogue de traductions. Les deux propositions sont arrivées par des PR de mainteneurs. (#1266, #1416, #1258, #1262)
- **@wahajahmed010** ❤️ : a proposé de mutualiser l'import du module enterprise en un seul import en cours, le correctif pour les requêtes SCIM concurrentes en désaccord sur la licence. (#1267, #1283)
- **@chenzeyan54-commits** ❤️ : a signalé que le guide de configuration ne mentionnait jamais les surcharges des binaires des moteurs ni `SNAPOTTER_HW_ACCEL`, désormais documentés. (#1312, #1696)
- **@aron-intframe** ❤️ : a reproduit une lacune dans la gestion des erreurs d'exiftool sur un clone neuf et découvert que la situation de concurrence sur le chemin temporaire était pire que ce que décrivait l'issue. (#3458)

Merci aussi aux membres de la communauté qui ont signalé ces problèmes sur Discord et par e-mail, et dont nous n'avons pas noté les noms.

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.2.0...v2.3.0)

---

## v2.2.0 {#v2-2-0}

L'essentiel de la 2.2 relève du durcissement. Un non-administrateur disposant d'un rôle `users:manage` délégué pouvait prendre le contrôle d'une instance, et tous les points de terminaison d'outils s'avéraient dépourvus de leur vérification de permission. Mettez à niveau si vous avez plus d'un utilisateur.

Le reste, c'est la longue traîne de l'auto-hébergement : des téléchargements qui démarraient et ne se terminaient jamais, des préréglages qui cassaient dès l'ajout d'un second fichier, des conteneurs qui bouclaient sur un plantage pendant que Postgres démarrait encore. Deux nouveaux outils ont aussi fait leur apparition. La documentation et le site web sont désormais traduits en 21 langues, et l'interface respecte enfin les contrastes WCAG AA.

> [!IMPORTANT]
> Si vous avez accordé `users:manage` à un non-administrateur via un rôle personnalisé, ce rôle pouvait prendre le contrôle de comptes administrateurs sur les versions 2.0.0 à 2.1.0. Détails dans la section Sécurité.

### Sécurité {#v2-2-0-security}

- **Élévation de privilèges via un rôle `users:manage` délégué (GHSA-9xgh-95qh-2x7h).** Un non-administrateur disposant de `users:manage` via un rôle personnalisé pouvait réinitialiser le mot de passe d'un compte plus privilégié, ou le supprimer, y compris un administrateur intégré, et prendre le contrôle de l'instance. La réinitialisation de mot de passe et la suppression de compte vérifient désormais l'autorité de l'appelant sur la cible, de sorte qu'un rôle délégué ne peut pas agir au-delà de son propre niveau. Concerné : 2.0.0 à 2.1.0. Signalé par 李春来 (Chunlai Li). (#616)
- **Chaque point de terminaison d'outil est désormais protégé.** L'accès aux outils était appliqué route par route, si bien que les 45 routes écrites à la main devaient toutes se souvenir du même appel, et aucune ne le faisait. Un rôle dépourvu de `tools:use` pouvait encore exécuter image-to-pdf, erase-object, upscale, sign-pdf et les autres. La vérification réside maintenant dans un unique preHandler indexé sur la route correspondante, ce qui couvre les sous-chemins et toute route ajoutée par la suite. (#646)
- **La limitation de débit était contournable sur les installations Docker.** L'image livrait `TRUST_PROXY=true`, l'IP cliente provenait donc d'un en-tête de requête et un `X-Forwarded-For` falsifié franchissait le limiteur de connexion. La valeur par défaut est désormais une liste de réseaux privés de confiance. (#649)
- **Les écritures de paramètres sont vérifiées paramètre par paramètre**, et non une fois à l'entrée, et l'importation de configuration est désormais transactionnelle afin qu'une clé rejetée ne laisse pas une configuration à moitié appliquée. (#618)
- **Les noms de fichiers de la bibliothèque ne peuvent pas sortir de leur racine de stockage.** Un nom stocké fabriqué, qu'un import SQLite 1.x malveillant recopie tel quel, pouvait lire ou supprimer des fichiers en dehors du répertoire des fichiers. Accessible uniquement après qu'un opérateur a importé une base SQLite 1.x fournie par un attaquant, seul chemin qui permet de choisir un nom stocké. Signalé par @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **L'annulation de tâche applique la propriété**, un utilisateur authentifié ne peut donc plus annuler la tâche d'un autre utilisateur par son identifiant. Signalé par @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Un nouvel audit de toute l'arborescence 2.0 a révélé ce qui restait ouvert** : une assertion SAML capturée pouvait être rejouée, un défi MFA survivait à n'importe quel nombre de codes erronés, la recherche de clé d'API à chaque requête était un balayage complet de table, `MAX_WORKSPACE_SIZE_GB` était une configuration morte, et l'assainisseur SVG laissait passer des href `javascript:` sans guillemets. (#620)
- **Neuf CVE divulguées corrigées** : fast-uri, svgo, sharp et tar de manière transitive (#619), plus Pillow 12.3.0 (#517). Le décodage RAW sur arm64 compile désormais LibRaw 0.22.2 depuis les sources au lieu de lier une copie système non corrigée. (#649)

### Nouvelles fonctionnalités {#v2-2-0-new-features}

- **Recadrage arrondi** : masques en carré arrondi et en squircle façon iOS, avec un réglage du rayon des coins. Pensé pour les favicons et les icônes d'application. (#602)
- **Supprimer l'arrière-plan d'un GIF** : retirez l'arrière-plan d'un GIF animé, d'un WebP ou d'un APNG image par image et récupérez une animation transparente. (#502)
- **Lasso et mode haute qualité pour l'effaceur d'objets** : tracez une boucle libre au lieu de peindre chaque pixel, et installez en option un bundle de remplissage par diffusion pour des remplissages plus propres sur de grandes zones. (#503, #566)
- **Enregistrer comme nouveau fichier, ou remplacer.** Modifier un fichier de la bibliothèque remplaçait auparavant silencieusement l'original. Vous choisissez désormais à chaque modification, et l'option par défaut conserve l'original. (#564, #577)
- **Préréglages de rapport d'aspect dans l'outil Redimensionner.** Choisissez 1:1, 4:3 ou 16:9 et les deux dimensions restent verrouillées, sans agrandissement. (#530)
- **OCR à deux niveaux** : un niveau rapide intégré à l'image qui fonctionne hors ligne sans téléchargement, et un moteur plus précis qui s'installe à la demande. (#519)
- **Tapez n'importe où pour rechercher.** Commencez à écrire sur le tableau de bord ou la page d'accueil et votre saisie apparaît dans le champ de recherche. (#644)
- **Documentation et site web en 21 langues** : le site de documentation, les pages d'accueil et la référence API sont désormais tous traduits, comme l'interface de l'application. Un nouveau guide de déploiement pour ressources limitées couvre Raspberry Pi et les machines à 2 Go. (#548)
- **Noms d'outils plus clairs** : 18 noms ambigus précisent désormais leur objet, si bien que « Compress » devient « Compress Image ». Les identifiants et les routes des outils sont inchangés, donc aucun favori ne casse. (#520)

### Améliorations {#v2-2-0-improvements}

- **Contrastes WCAG AA dans toute l'interface** : la palette a été réaccordée pour que l'orange vif reste sur les remplissages tandis que le texte et les libellés utilisent des jetons d'encre accessibles, et les 57 indicateurs de focus franchissent désormais le seuil de 3:1 pour les éléments non textuels. (#567, #574)
- **Agrandissement et suppression d'arrière-plan ne semblent plus figés** : la barre de progression avance pendant l'inférence au lieu de rester bloquée à 30 %, et les deux outils préviennent désormais qu'un hôte sans GPU est bien plus lent. (#605, #608)
- **Les messages d'expiration nomment la vraie cause** et tiennent compte des hôtes CPU uniquement au lieu de blâmer le téléversement. (#596)
- **SnapOtter attend Postgres et Redis au démarrage** au lieu de boucler sur un plantage, aussi bien dans Compose que dans l'image tout-en-un. Une installation Proxmox LXC redémarrait 76 fois avant cela. (#537, #595)
- **Les téléchargements survivent à un reverse proxy** : SnapOtter demande à nginx et aux proxys compatibles de ne pas mettre en mémoire tampon les réponses de fichiers, ce qui est la raison habituelle d'un téléchargement auto-hébergé qui démarre et ne se termine jamais. (#604, #607)
- **La compression de PDF s'approche de la taille cible**, et le dit honnêtement quand une cible est hors de portée. (#522)
- **Les commandes des outils restent accessibles sur mobile** maintenant que les enveloppes de l'application se dimensionnent selon la fenêtre d'affichage dynamique. (#559)
- **La conversion audio expose désormais un réglage de fréquence d'échantillonnage.** (#561)
- **Les administrateurs peuvent assouplir la longueur minimale du mot de passe**, jusqu'à 1 pour une instance sur réseau local de confiance. (#543)
- **La MFA est en libre-service**, le verrouillage de la politique est corrigé, et les connexions OIDC ou SAML obtiennent un vrai défi MFA au lieu d'un blocage net. (#531, #536)
- **Un simple `Error: Error` nomme désormais sa cause.** Les échecs d'encodage Sharp, les sorties du sidecar IA, la sortie non JSON du sidecar de documents et les échecs de suppression d'arrière-plan arrivaient tous avec la raison effacée. (#532, #534, #535, #538, #612)
- **La boîte de dialogue d'aide est traduite.** Ses libellés de raccourcis et son texte de prise en main étaient codés en dur en anglais alors que des traductions terminées dormaient inutilisées dans les 21 fichiers de langue. (#647)

### Corrections de bogues {#v2-2-0-bug-fixes}

- **Les fichiers HEIC d'iPhone étaient rejetés** comme illisibles avant d'atteindre le décodeur qui les gère. (#631)
- **Les préréglages de conversion échouaient sur un second fichier** : jpg-to-pdf et ses équivalents image-to-pdf, plus pdf-to-png, pdf-to-jpg et pdf-to-tiff, renvoyaient tous `Tool not found` dès que vous téléversiez deux fichiers. (#633, #643)
- **Les préréglages de conversion PDF perdaient leur bouton de téléchargement.** (#629)
- **Un délai de traitement illimité n'était pas respecté**, et les flux de progression bloqués se rétablissent désormais au lieu de laisser l'interface en attente. (#638)
- **Les téléchargements restaient suspendus au lieu d'échouer** quand un fichier stocké s'avérait plus court que sa longueur enregistrée. (#617)
- **Les outils de pages PDF échouaient sur les fichiers courts et chiffrés** : Supprimer des pages partait par défaut sur une plage qui n'existe dans aucun document de moins de six pages, et les PDF protégés par mot de passe échouaient avec un message obscur dans le worker. (#594)
- **PDF vers texte renvoyait silencieusement un fichier vide** pour les PDF numérisés. L'outil vous oriente désormais vers l'OCR et sert le texte en UTF-8. (#603)
- **PDF vers Word perdait les blocs de texte colorés** et les découpait sur la page. (#500)
- **L'effaceur d'objets laissait des rémanences fantômes** et floutait les petits objets dans les images haute résolution. (#501)
- **La stabilisation vidéo produisait une sortie illisible** sans faststart. (#593)
- **Réparations de l'éditeur d'images** : rotation, miroir, redimensionnement, niveaux, courbes, filtres et verrouillage des calques. (#597)
- **Signer un PDF affichait un canevas vide** au lieu d'indiquer pourquoi un PDF n'avait pas pu être chargé. (#545)
- **La bibliothèque de fichiers enregistrait des dimensions 0x0** et sautait les aperçus des téléversements HEIC, RAW et PSD. (#636, #637)
- **L'installation de plusieurs bundles d'IA** laissait le virtualenv partagé en versions multiples et cassait discrètement trois outils. (#649)
- **La conversion en JXL aux qualités 1 à 4 renvoyait une erreur 500**, et un ffmpeg manquant vous était signalé comme un téléversement corrompu. (#649)
- **Une panne Postgres passagère laissait les tâches terminées en suspens**, avec leur sortie sur le disque et aucune ligne pointant vers elle. Un réconciliateur reprend désormais ce travail au lieu de l'abandonner. (#649)
- **Un point de terminaison Redis qui changeait d'adresse bloquait tous les consommateurs** alors que les vérifications d'état répondaient toujours 200. (#649)
- **Correctifs du site web et de la documentation** : les liens localisés ne perdent plus les fragments `#` ni ne passent `zh-CN` en minuscules, la navigation de la documentation reste dans la fenêtre d'affichage sur tablette, et aucun des deux sites n'appelle plus l'API GitHub depuis votre navigateur. (#516, #562, #570, #560)

### Notes de mise à niveau {#v2-2-0-upgrade-notes}

Rien à migrer, mais deux valeurs par défaut livrées ont changé :

- **`TRUST_PROXY` vaut désormais `loopback,linklocal,uniquelocal`** au lieu de faire confiance à tous les pairs. Les réseaux Docker bridge et Compose se situent dans cette plage, la plupart des installations n'ont donc rien à changer. Si votre reverse proxy atteint SnapOtter depuis une adresse publique, définissez `TRUST_PROXY` explicitement, sinon la limitation de débit et les journaux d'audit attribueront chaque requête au proxy.
- **`MAX_AI_JOBS_PER_USER` est fixé à 5** tâches IA mono-fichier simultanées par utilisateur. Les exécutions IA par lots et par pipeline restent sans plafond.

Nouveaux réglages facultatifs : `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (désactivé par défaut) et `GIF_BG_MAX_FRAMES`.

### Remerciements {#v2-2-0-acknowledgements}

Une bonne partie de cette version a commencé comme le rapport de bogue de quelqu'un d'autre.

Code et contributions :

- **@mvanhorn** ❤️ : a réécrit l'échec d'expiration de la suppression d'arrière-plan en un message qui dit quoi faire, au lieu d'une simple expiration. (#518, #494)
- **@EuanTop** ❤️ : a restauré l'action de téléchargement sur les pages des préréglages de conversion PDF en faisant renvoyer le contrat de résultat d'outil standard à la route synchrone. (#629, #623)
- **@harshjainnn** ❤️ : a diagnostiqué le téléchargement qui démarre et ne se termine jamais, et proposé la piste de la réinitialisation de socket sur laquelle le correctif a été bâti. (#617, #590)

Divulgations de sécurité :

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)) : a divulgué en privé l'élévation de privilèges via un rôle `users:manage` délégué, avec une analyse complète de la source au puits et une chaîne d'exploitation fonctionnelle. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar) : a divulgué un IDOR authentifié sur l'annulation de tâche, et une traversée de répertoire dans les noms de fichiers stockés de la bibliothèque, atteignable après un import SQLite 1.x malveillant, avec une preuve de concept fonctionnelle pour chacun. (#599, #600)

Rapports de bogues :

- **@riz467** ❤️ : de vrais fichiers HEIC d'iPhone rejetés à la validation, avec la cause racine identifiée dans le rapport. (#622)
- **@coupej** ❤️ : des pages de préréglages PDF bloquées indéfiniment, et jpg-to-pdf qui échouait dès l'ajout d'un second fichier. Deux bogues distincts, correctement séparés. (#623, #627)
- **@linuxuser1** ❤️ : `PROCESSING_TIMEOUT_S=0` documenté comme illimité mais plafonné à cinq minutes. (#630)
- **@bezibaerchen** ❤️ : la conversion audio masquait le réglage de fréquence d'échantillonnage que sa propre description promettait. (#558)
- **@hell-toupee** ❤️ : le bundle OCR précis qui échouait à s'installer avec une erreur `libpaddle`. (#505)
- **@Michael1260** ❤️ et **@And-CSH** ❤️ : ont confirmé indépendamment l'échec d'installation de l'OCR et établi que l'extraction manuelle fonctionne alors que le programme d'installation intégré ne fonctionne pas, ce qui a circonscrit le bogue au programme d'installation. (#505)
- **@TomErnst1972** ❤️ : l'activation de la politique exigeant la MFA enfermait un administrateur hors de sa propre instance. (#515)
- **@thokich** ❤️ : l'effacement d'objets produisait des remplissages flous et inutilisables, ce qui a motivé à la fois la réécriture du remplissage HD et le bundle haute qualité facultatif. (#141)
- **@Hennie-git** ❤️ : une installation Proxmox LXC redémarrant 76 fois contre un Postgres qui n'acceptait pas encore les connexions. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts) : a qualifié ce rapport en temps réel et produit le diagnostic sur lequel le correctif de démarrage a été bâti. (#537)

Demandes de fonctionnalités et retours :

- **@LECOQQ** ❤️ : a demandé d'assouplir la complexité des mots de passe sur une installation de serveur domestique. (#136)
- **@killervette42** ❤️ : a demandé une application communautaire Unraid, désormais publiée sur le magasin Unraid CA. (#96)
- **@alienatedsec** ❤️ : a signalé que le correctif de retour au CPU en cas d'échec GPU était enfoui dans un ticket fermé et introuvable, ce qui explique qu'il figure désormais dans la documentation de déploiement. (#490, #587)
- **@neilp316** ❤️ : a confirmé l'échec GPU Blackwell sur une RTX 5060 et tracé un chemin de mise à niveau CUDA 12.8 fonctionnel. (#120)
- **@Roiki11** ❤️ : a plaidé pour un stockage partagé avec des références de chemins plutôt qu'un transfert de fichiers HTTP pour le calcul IA hors machine. (#189)

Merci également aux membres de la communauté qui ont signalé ces points sur Discord et par e-mail, et dont nous n'avons pas noté les noms : la demande de recadrage en squircle (#602), le téléchargement image-to-PDF qui démarrait et ne se terminait jamais (#604, #607), l'outil Supprimer des pages qui se bloquait (#594), le texte arabe absent de pdf-to-text (#603), et le diagnostic derrière le retour au CPU d'ONNX (#490).

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 transforme la boîte à outils d'images en une suite complète de manipulation de fichiers : plus de 200 outils répartis sur cinq modalités (Image, Vidéo, Audio, PDF et Fichiers), reconstruite sur Postgres 17 et une file d'attente de tâches basée sur Redis, avec un `docker run` en une seule commande. Il s'agit d'une version majeure ; lisez les Changements incompatibles avant de mettre à niveau depuis la version 1.x.

### Nouvelles fonctionnalités {#new-features}

- **Quatre nouvelles modalités d'outils** : Vidéo, Audio, PDF et Fichiers rejoignent Image, portant le catalogue à plus de 200 outils.
- **Tâches d'arrière-plan durables** : une file d'attente basée sur Redis (BullMQ) exécute chaque outil comme une tâche suivie avec une progression SSE en direct.
- **Mode conteneur unique tout-en-un** : une seule commande `docker run` démarre une instance complète avec Postgres et Redis intégrés.
- **Modules d'IA à la demande** : suppression d'arrière-plan, OCR, transcription, agrandissement, détection et amélioration des visages, gomme d'objets, colorisation et restauration de photos s'installent depuis l'interface. L'accélération GPU est détectée par framework.
- **Signer un PDF** : dessinez, saisissez ou téléversez une signature et placez-la sur un PDF dans le navigateur.
- **Automatiser** : un constructeur visuel de pipelines qui enchaîne les outils, avec neuf modèles préconçus.
- **83 préréglages de conversion en un clic** : convertisseurs dédiés JPG vers PNG, MP4 vers GIF et similaires avec recherche approximative.
- **Éditeur d'images par calques** : un éditeur propulsé par Konva à `/editor` avec pinceaux, formes, ajustements, filtres et courbes.
- **Bibliothèque de fichiers** : enregistrez n'importe quel résultat et réutilisez-le comme entrée d'un autre outil.
- Outils épinglés, zoom et déplacement dans le canevas, 21 langues et fonctionnalités d'entreprise (OIDC/SSO, SAML, SCIM, stockage S3, permissions par outil, export d'audit, traçage distribué).

### Améliorations {#improvements}

- Annulation d'un traitement en cours. (#137)
- Décodage RAW en pleine résolution via LibRaw, y compris DNG. (#289)
- Déploiements non-root et à UID étranger (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Détection précise des installations d'IA et flux d'installation renforcé. (#214, #352)
- Renforcement de la confidentialité : aucune sortie automatique vers des tiers, plus un mode strictement hors ligne facultatif.
- Bouton de retour toujours disponible, même lorsque l'analytique est désactivée.

### Corrections de bogues {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` désactive de nouveau la limitation de débit pour les routes d'outils. (#271)
- Correction des chemins de l'environnement virtuel d'IA dans l'image Docker. (#390)
- Compatibilité avec sharp 0.35.2+. (#362)
- Corrections de la mise en page de l'éditeur d'images : règles, comportement de remplissage, barre latérale et dimensionnement du canevas. (#258, #259)
- Traduction italienne terminée. (#231, #206, #425)
- La normalisation audio et loudnorm préservent la fréquence d'échantillonnage source.
- Renforcement contre le SSRF : correspondance CIDR IPv6 numérique et pré-analyse d'URL élargie. (#287)
- Les PDF générés portent SnapOtter comme Producer.
- mediapipe s'installe sur Python 3.13 et Debian 13.

### Changements incompatibles {#breaking-changes}

2.0 remplace la base de données SQLite intégrée par Postgres 17 et ajoute Redis 8 pour la file d'attente de tâches. Vos données 1.x sont migrées automatiquement au premier démarrage, mais la pile de conteneurs a changé, alors sauvegardez d'abord l'intégralité de votre volume `/data` (la version 1.x exécute SQLite en mode WAL, si bien que les données validées se trouvent généralement dans `snapotter.db-wal`). Choisissez ensuite l'image à conteneur unique (Postgres et Redis intégrés, root uniquement) ou la pile Compose (application plus Postgres 17 et Redis 8). Consultez le [guide de migration](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) et le [guide de mise à niveau](/fr/guide/upgrading).

### Mise à niveau {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nouvel outil HTML vers Image, accessibilité WCAG 2.2 AA, renforcement de la sécurité issu de tests d'intrusion, et 5 correctifs Docker critiques.

### Nouvelles fonctionnalités {#new-features-1}

- **HTML vers Image** : capturez des captures d'écran d'URL ou de HTML brut en PNG/JPEG/WebP. Captures de page entière, viewports personnalisés, mode sombre.
- **Convention de secret Docker _FILE** : montez les variables d'environnement sensibles sous forme de fichiers plutôt qu'en texte clair. (#205)
- **Licences d'entreprise et stockage S3** : clé de licence commerciale facultative et stockage d'objets compatible S3.
- **Améliorations de l'éditeur de formes** : transparence de remplissage/contour, sélecteur de couleur RGBA, styles de traits en pointillés.
- **Archives de version préconstruites** : téléchargez des tarballs depuis GitHub Releases pour les installations hors Docker (Proxmox, matériel dédié, LXC). (#202)

### Améliorations {#improvements-1}

- **Accessibilité WCAG 2.2 AA** : saut de navigation, piégeage du focus, régions aria-live, prise en charge du mouvement réduit, rapports de contraste corrects. (#209)
- **Réactivité mobile** : paramètres réactifs, reconnexion automatique SSE lors du changement d'onglet mobile. (#203, #204)
- **Qualité de la suppression d'arrière-plan** : lissage des contours, décontamination des couleurs, sélection du format de sortie.
- **Traduction italienne** : environ 145 nouvelles chaînes par @albanobattistella. (#206)
- **Documentation de l'API par outil** : 53 pages de documentation avec paramètres, exemples et formats de réponse.
- **Téléchargements de modèles d'IA** : logique de nouvelle tentative avec repli exponentiel pour HuggingFace. (#201)

### Corrections de bogues {#bug-fixes-1}

- Les conteneurs Docker frais étaient totalement inutilisables (la limitation de débit bloquait toutes les requêtes).
- Les outils d'IA de détection de visage (blur-faces, red-eye-removal, enhance-faces, passport-photo) échouaient sur toutes les plateformes.
- Fichiers HEIC cassés sur ARM (incompatibilité de symboles libheif).
- Les modules d'IA d'agrandissement et de restore-photo ne s'installaient pas sur ARM.
- L'OCR utilisait la mauvaise version de CUDA sur les conteneurs GPU.
- Contournement de la protection SSRF via des adresses IPv6 mappées en IPv4 hexadécimales. (Crédit : @tonghuaroot)
- Décodage HEIC de l'iPhone avec images auxiliaires. (#183, #199)
- OOM CUDA de Real-ESRGAN sur les GPU de 8 Go. (#200)
- 6 erreurs Sentry en production et 7 bogues d'AQ. (#208)

### Sécurité {#security}

- 10 constats de test d'intrusion corrigés (contournement XFF, plantages sur JSON malformé, pipelines non bornés, XSS du journal d'audit, méthode TRACE, et plus). (#207)
- Contournement SSRF via IPv6 hexadécimal bloqué. (Crédit : @tonghuaroot)
- Images de base du Dockerfile épinglées par empreinte.

### Mise à niveau {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Démo en direct, pages de destination par outil, et un lot de correctifs de finition.

### Nouvelles fonctionnalités {#new-features-2}

- **Démo en direct** - [demo.snapotter.com](https://demo.snapotter.com) permet d'essayer SnapOtter sans rien installer.
- **Page d'index des outils** - Parcourez les plus de 50 outils à `/tools` avec recherche et filtres par catégorie.
- **Plus de 50 pages de destination SEO** - Chaque outil dispose désormais d'une page de destination dédiée avec FAQ, cas d'usage et tableaux comparatifs.
- **Aperçu de l'arrière-plan** - Un curseur avant-après affiche un arrière-plan à damier derrière les images transparentes.
- **Générateur de mots de passe forts** - Bouton en un clic dans le formulaire d'ajout de membres.

### Corrections de bogues {#bug-fixes-2}

- L'outil d'infos HEIC/HEIF n'échoue plus (pré-décodage ajouté).
- L'installation des modules de modèles d'IA affiche de meilleurs messages d'erreur et respecte les limites de ressources.
- Les vignettes de la bibliothèque se chargent correctement (les en-têtes d'authentification manquaient).
- Les menus déroulants ne sont plus tronqués dans les tableaux des paramètres Personnes et Équipes.
- Pourcentage de comparaison de taille masqué sur les outils sans compression.
- Lien en double vers la politique de confidentialité supprimé.
- Traduction italienne ajoutée pour les paramètres des fonctionnalités d'IA.
- Icônes Lucide renommées mises à jour (Wand2, Columns).

### Infrastructure {#infrastructure}

- OpenSSF Scorecard renforcé de 4,3 à environ 7,0.
- Tests CI parallélisés en 4 fragments avec des fixtures réduites.
- 41 mises à jour de dépendances.

### Mise à niveau {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Cinq nouveaux outils, un éditeur d'images complet, connexion SSO, 20 langues. Cela aurait probablement dû faire l'objet de trois versions distinctes, mais voilà.

### Nouvelles fonctionnalités {#new-features-3}

- **Éditeur d'images** - Calques, pinceaux, formes, ajustements, filtres, courbes, raccourcis clavier. S'exécute dans votre navigateur, traite sur votre matériel.
- **Authentification OIDC / SSO** - Connexion avec Google, GitHub, Okta ou tout fournisseur OpenID Connect. Définissez quelques variables d'environnement et votre équipe utilise ses comptes existants.
- **Générateur de mèmes** - 100 modèles intégrés avec rendu de texte via opentype.js. Ou téléversez votre propre image.
- **Embellir** - Déposez une capture d'écran, obtenez une image soignée. Cadres d'appareils (macOS, Windows, navigateur), ombres, dégradés, préréglages pour les réseaux sociaux.
- **Simulation du daltonisme** - Prévisualisez le rendu des images avec la protanopie, la deutéranopie, la tritanopie et d'autres déficiences de la vision des couleurs.
- **Correcteur de transparence PNG** - Détecte les PNG à fausse transparence et les corrige avec le matting HR BiRefNet. Suppression de filigrane facultative via l'inpainting LaMa.
- **Extension de canevas par IA** - Étendez les limites de l'image avec un remplissage par IA. Trois niveaux de qualité (rapide, équilibré, qualité) selon le temps GPU que vous voulez y consacrer.
- **20 langues** - Arabe, chinois (simplifié/traditionnel), tchèque, néerlandais, français, allemand, hindi, indonésien, italien, japonais, coréen, polonais, portugais, russe, espagnol, thaï, turc, ukrainien, vietnamien. Le RTL fonctionne pour l'arabe.
- **Import d'URL** - Collez des URL dans la zone de dépôt ou importez-les en masse à partir d'une liste. Récupération côté serveur avec protection SSRF.
- **Gomme multi-fichiers** - Dessinez des masques d'effacement sur plusieurs images, traitez-les toutes en un clic. Les traits persistent par image.
- **Import/export de pipelines** - Enregistrez les chaînes d'outils au format JSON, partagez-les avec d'autres.
- **17 nouveaux formats RAW d'appareil photo** via exiftool, plus les entrées QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ et APNG. Nouveaux codecs de sortie pour BMP, ICO, JP2, QOI. Export AVIF, TIFF, GIF, JXL et PSD récupéré d'une branche précédemment perdue.

### Améliorations {#improvements-2}

- **Amélioration d'image** - Remplacement de l'ancien pipeline par CLAHE + normalise + gamma. La nouvelle bascule Deep Enhance utilise le modèle d'IA pour des résultats plus agressifs.
- **Restauration de photo** - Détection des rayures réécrite avec un filtrage Otsu à 8 angles. L'inpainting LaMa s'exécute désormais à la résolution native.
- **Formats exotiques partout** - OCR, image-vers-PDF, générateur de favicon, composition, assemblage et vectorisation décodent tous désormais HEIC, RAW et PSD.
- **Compresser** - Tolérance de taille cible resserrée de 5 % à 1 %. La taille cible est le mode par défaut. Ajout de boutons pas à pas et d'un sélecteur d'unité Ko/Mo.
- **Nettoyage de Sentry** - 644 événements non exploitables filtrés. Les vraies erreurs sont désormais correctement gérées.
- **Détection GPU** - Meilleurs diagnostics pour les conteneurs où CUDA est présent mais nvidia-smi absent.
- **Mode authentification désactivée** - Un utilisateur anonyme est initialisé dans la base de données avec le rôle admin. Les clés d'API, les pipelines et les fichiers utilisateur ne cassent plus sur les contraintes de clé étrangère.
- **Plus de 2 705 nouveaux tests** couvrant l'unitaire, l'intégration et l'E2E.

### Corrections de bogues {#bug-fixes-3}

- L'agrandissement sur CPU n'expire plus sur les NAS et le matériel de faible puissance.
- Le logo du code QR ne fait plus disparaître définitivement l'aperçu.
- Débordement de rognage corrigé pour les images portrait hautes.
- Les fichiers TIFF avec alpha forcent correctement la sortie PNG au lieu de produire une corruption.
- Le décodage HDR/EXR convertit en 8 bits avant CLAHE, corrigeant les échecs de décodage.
- Les tampons d'entrée des points de repère du visage sont convertis en PNG avant le sidecar Python, corrigeant les plantages.
- La recherche de doublons gère les lots à formats mixtes et les erreurs réseau.
- L'aperçu d'Embellir se met à jour en temps réel.
- Barres de progression pour l'assemblage et la vectorisation.
- SVGZ géré par SVG-vers-raster.
- Noms de fichiers non-ASCII corrigés via l'en-tête X-File-Results encodé en pourcentage.

### Mise à niveau {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Image Docker unifiée avec détection automatique du GPU. Une seule image gère les charges de travail CPU et GPU. Compose simplifié en un seul fichier avec rotation des journaux. Les pré-téléchargements de modèles incluent désormais une vérification et un test de fumée.

---

## v1.13.0 {#v1-13-0}

Contrôle d'accès basé sur les rôles (RBAC). 14 permissions granulaires, trois rôles intégrés (admin, editor, user), prise en charge des rôles personnalisés. Vérifications de permissions sur toutes les routes de l'API. Onglets du frontend filtrés selon les permissions de l'utilisateur.

---

## v1.12.0 {#v1-12-0}

Outil PDF vers Image. Convertissez les pages PDF en PNG, JPEG, WebP ou TIFF au DPI de votre choix. Image Docker unifiée avec détection automatique du GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt auto-généré via vitepress-plugin-llms pour une documentation adaptée à l'IA.

---

## v1.10.0 {#v1-10-0}

Redimensionnement adaptatif au contenu (seam carving) avec protection des visages. Redimensionnez les images tout en préservant le contenu important.

---

## v1.9.0 {#v1-9-0}

Outil Assembler / Combiner. Joignez des images côte à côte, empilées verticalement ou dans une grille personnalisée.

---

## v1.8.0 {#v1-8-0}

Outil de modification des métadonnées. Consultez et modifiez les métadonnées EXIF, IPTC et XMP avec une interface granulaire de suppression/conservation.

---

## Versions plus anciennes {#older-releases}

Pour le journal des modifications complet au niveau des commits, y compris les versions correctives, consultez [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
