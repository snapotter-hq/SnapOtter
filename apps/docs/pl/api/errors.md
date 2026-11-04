---
title: "Kody błędów"
description: "Kształt treści błędu, stabilne kody i co zrobić w przypadku każdego z nich."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 346f73d899a1
i18n_hash_version: 2
---

# Kody błędów {#error-codes}

Każda odpowiedź JSON z błędem ma ten sam kształt:

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| Pole | Zawsze obecne | Znaczenie |
|-------|----------------|---------|
| `error` | Tak | Komunikat czytelny dla człowieka. Można go bezpiecznie pokazywać użytkownikom. Nie należy go parsować. |
| `code` | Tak | Stabilny kod czytelny dla maszyn. To po nim należy rozgałęziać logikę. |
| `requestId` | Tak | Identyfikator tego żądania nadany przez serwer. Należy go podać przy zgłaszaniu problemu; odpowiada wpisowi w logu serwera. |
| `details` | Czasami | Dodatkowy kontekst dla niektórych błędów 4xx, na przykład komunikat walidacji. |

Komunikaty mogą się zmieniać między wydaniami. Kody nie, dlatego logikę klienta należy opierać na `code`.

## Kody wynikające ze statusu HTTP {#status-codes}

Gdy trasa nie ustawia własnego kodu, serwer wyprowadza go ze statusu:

| Status HTTP | `code` |
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

Każdy inny status 4xx przechodzi na `BAD_REQUEST`, a każdy inny status 5xx na `INTERNAL_ERROR`.

Trasa może ustawić bardziej szczegółowy kod i wtedy odpowiedź zawiera właśnie ten kod. Na przykład narzędzie, którego nie można uruchomić z powodu braku pakietu AI, zwraca kod specyficzny dla funkcji. Te kody opisano przy funkcji, która je zgłasza.

## Uwierzytelnianie i dostęp {#auth-codes}

| `code` | Status | Co zrobić |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | Wysłać `Authorization: Bearer <token>` z tokenem sesji lub kluczem API (`si_...`). |
| `FORBIDDEN` | 403 | Poświadczenie jest prawidłowe, ale brakuje mu uprawnienia. Należy poprosić administratora o to uprawnienie. |
| `MUST_CHANGE_PASSWORD` | 403 | Konto musi zmienić hasło, zanim będzie mogło wywoływać inne endpointy. Należy wywołać `POST /api/auth/change-password` z tokenem sesji, a następnie spróbować ponownie. |
| `USER_DISABLED` | 403 | Konto jest wyłączone. Administrator musi je ponownie włączyć. |
| `LOGIN_THROTTLED` | 429 | Zbyt wiele nieudanych prób logowania. Przed kolejną próbą należy poczekać. |
| `VALIDATION_ERROR` | 400 | Treść lub parametry żądania nie przeszły walidacji. `details` wskazuje problem. |

Konto administratora tworzone przy pierwszym uruchomieniu to `admin` z hasłem `admin`, chyba że zmieniono je przez `DEFAULT_USERNAME` lub `DEFAULT_PASSWORD`. Jeśli nie ustawiono `SKIP_MUST_CHANGE_PASSWORD`, to konto otrzymuje `MUST_CHANGE_PASSWORD` przy każdym wywołaniu, dopóki hasło nie zostanie zmienione.

## Zadania {#job-codes}

Zadanie, które się nie powiodło, zgłasza przyczynę w samym zadaniu, a nie w błędzie HTTP. Należy odczytać `error.code` i `error.message` z `GET /api/v1/jobs/{jobId}`. Zobacz [Śledzenie postępu](/pl/api/rest#progress-tracking).

## Jeszcze nieskatalogowane {#not-yet-cataloged}

Kody zgłaszane przez poszczególne funkcje (na przykład szyfrowanie, OIDC, SCIM i zespoły) nie są jeszcze opisane na tej stronie. Każdy z nich jest stabilnym kodem; nieujęty na liście kod należy traktować jako nieprzejrzysty i obsługiwać według jego statusu.