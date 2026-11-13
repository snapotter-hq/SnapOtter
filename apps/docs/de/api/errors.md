---
title: "Fehlercodes"
description: "Das Format des Fehlerkörpers, die stabilen Codes und was bei jedem Code zu tun ist."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 2d402bd529cb
i18n_hash_version: 2
---

# Fehlercodes {#error-codes}

Jede JSON-Fehlerantwort hat dasselbe Format:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Feld | Immer vorhanden | Bedeutung |
|-------|----------------|---------|
| `error` | Ja | Eine für Menschen lesbare Meldung. Kann Benutzern bedenkenlos angezeigt werden. Nicht auswerten. |
| `code` | Ja | Ein stabiler, maschinenlesbarer Code. Verzweigen Sie anhand dieses Werts. |
| `requestId` | Ja | Die ID dieser Anfrage auf dem Server. Geben Sie sie an, wenn Sie ein Problem melden; sie stimmt mit dem Serverlog überein. |
| `details` | Manchmal | Weiterer Kontext zu einigen 4xx-Fehlern, etwa die Validierungsmeldung. |

Meldungen können sich zwischen Releases ändern. Codes ändern sich nicht, daher sollten Sie die Client-Logik auf `code` stützen.

## Codes aus dem HTTP-Status {#status-codes}

Wenn eine Route keinen eigenen Code setzt, leitet der Server einen aus dem Status ab:

| HTTP-Status | `code` |
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

Jeder andere 4xx-Status fällt auf `BAD_REQUEST` zurück, jeder andere 5xx-Status auf `INTERNAL_ERROR`.

Eine Route kann einen spezifischeren Code setzen; dann enthält die Antwort stattdessen diesen Code. Ein Tool, das nicht laufen kann, weil sein KI-Bundle fehlt, liefert beispielsweise einen funktionsspezifischen Code. Diese Codes werden bei der Funktion beschrieben, die sie auslöst.

## Authentifizierung und Zugriff {#auth-codes}

| `code` | Status | Was zu tun ist |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Senden Sie `Authorization: Bearer <token>` mit einem Sitzungstoken oder einem API-Schlüssel (`si_...`). |
| `FORBIDDEN` | 403 | Die Zugangsdaten sind gültig, aber es fehlt die Berechtigung. Bitten Sie einen Administrator um die Berechtigung. |
| `MUST_CHANGE_PASSWORD` | 403 | Das Konto muss sein Passwort ändern, bevor es andere Endpunkte aufrufen kann. Rufen Sie `POST /api/auth/change-password` mit dem Sitzungstoken auf und versuchen Sie es dann erneut. |
| `USER_DISABLED` | 403 | Das Konto ist deaktiviert. Ein Administrator muss es wieder aktivieren. |
| `LOGIN_THROTTLED` | 429 | Zu viele fehlgeschlagene Anmeldeversuche. Warten Sie, bevor Sie es erneut versuchen. |
| `VALIDATION_ERROR` | 400 | Der Anfragekörper oder die Parameter haben die Validierung nicht bestanden. `details` benennt das Problem. |

Das Administratorkonto der Ersteinrichtung ist `admin` mit dem Passwort `admin`, sofern `DEFAULT_USERNAME` oder `DEFAULT_PASSWORD` es nicht geändert haben. Solange `SKIP_MUST_CHANGE_PASSWORD` nicht gesetzt ist, erhält dieses Konto bei jedem Aufruf `MUST_CHANGE_PASSWORD`, bis das Passwort geändert wird.

## Jobs {#job-codes}

Ein fehlgeschlagener Job meldet seinen Grund am Job selbst, nicht im HTTP-Fehler. Lesen Sie `error.code` und `error.message` aus `GET /api/v1/jobs/{jobId}`. Siehe [Fortschrittsverfolgung](/de/api/rest#progress-tracking).

## Noch nicht katalogisiert {#not-yet-cataloged}

Die Codes einzelner Funktionen (zum Beispiel Verschlüsselung, OIDC, SCIM und Teams) sind auf dieser Seite noch nicht beschrieben. Jeder davon ist ein stabiler Code; behandeln Sie einen nicht aufgeführten Code als undurchsichtig und verarbeiten Sie ihn anhand seines Status.