---
title: "Codes d'erreur"
description: "La forme du corps d'erreur, les codes stables et la marche à suivre pour chacun."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: b3228dc8bd37
i18n_hash_version: 2
---

# Codes d'erreur {#error-codes}

Chaque réponse d'erreur JSON a la même forme :

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Champ | Toujours présent | Signification |
|-------|----------------|---------|
| `error` | Oui | Un message lisible par un humain. Peut être affiché aux utilisateurs. Ne l'analysez pas. |
| `code` | Oui | Un code stable, lisible par une machine. Branchez votre logique dessus. |
| `requestId` | Oui | L'identifiant de cette requête côté serveur. Citez-le quand vous signalez un problème ; il correspond au journal du serveur. |
| `details` | Parfois | Plus de contexte pour certaines erreurs 4xx, comme le message de validation. |

Les messages peuvent changer d'une version à l'autre. Les codes, non : écrivez donc la logique de votre client à partir de `code`.

## Codes issus du statut HTTP {#status-codes}

Quand une route ne définit pas son propre code, le serveur en déduit un à partir du statut :

| Statut HTTP | `code` |
|-------------|--------|
| 400 | `BAD_REQUEST` |
| 401 | `AUTH_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 503 | `SERVICE_UNAVAILABLE` |
| 507 | `INSUFFICIENT_STORAGE` |

Toute autre erreur 4xx retombe sur `BAD_REQUEST`, et toute autre erreur 5xx sur `INTERNAL_ERROR`.

Une route peut définir un code plus précis, et la réponse porte alors ce code à la place. Par exemple, un outil qui ne peut pas s'exécuter parce que son bundle d'IA est absent renvoie un code propre à la fonctionnalité. Ces codes sont décrits avec la fonctionnalité qui les déclenche.

## Authentification et accès {#auth-codes}

| `code` | Statut | Que faire |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Envoyez `Authorization: Bearer <token>` avec un jeton de session ou une clé d'API (`si_...`). |
| `FORBIDDEN` | 403 | L'identifiant est valide mais n'a pas la permission. Demandez la permission à un administrateur. |
| `MUST_CHANGE_PASSWORD` | 403 | Le compte doit changer son mot de passe avant de pouvoir appeler d'autres endpoints. Appelez `POST /api/auth/change-password` avec le jeton de session, puis réessayez. |
| `USER_DISABLED` | 403 | Le compte est désactivé. Un administrateur doit le réactiver. |
| `LOGIN_THROTTLED` | 429 | Trop de tentatives de connexion échouées. Patientez avant de réessayer. |
| `VALIDATION_ERROR` | 400 | Le corps ou les paramètres de la requête ont échoué à la validation. `details` indique le problème. |

Le compte administrateur du premier démarrage est `admin` avec le mot de passe `admin`, sauf si `DEFAULT_USERNAME` ou `DEFAULT_PASSWORD` l'a modifié. Sauf si `SKIP_MUST_CHANGE_PASSWORD` est défini, ce compte reçoit `MUST_CHANGE_PASSWORD` à chaque appel tant que le mot de passe n'a pas été changé.

## Tâches {#job-codes}

Une tâche qui échoue indique sa raison sur la tâche elle-même, pas dans l'erreur HTTP. Lisez `error.code` et `error.message` depuis `GET /api/v1/jobs/{jobId}`. Voir [Suivi de la progression](/fr/api/rest#progress-tracking).

## Pas encore catalogués {#not-yet-cataloged}

Les codes déclenchés par des fonctionnalités individuelles (par exemple le chiffrement, OIDC, SCIM et les équipes) ne sont pas encore décrits sur cette page. Chacun est un code stable ; traitez un code non listé comme opaque et gérez-le d'après son statut.
