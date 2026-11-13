---
title: "오류 코드"
description: "오류 본문의 형식, 안정적인 코드, 그리고 각 코드에 대한 대응 방법입니다."
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 8e7f55480c30
i18n_hash_version: 2
---

# 오류 코드 {#error-codes}

모든 JSON 오류 응답은 같은 형식을 가집니다.

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| 필드 | 항상 포함 | 의미 |
|-------|----------------|---------|
| `error` | 예 | 사람이 읽을 수 있는 메시지입니다. 사용자에게 그대로 보여 줘도 안전합니다. 파싱하지 마세요. |
| `code` | 예 | 안정적이고 기계가 읽을 수 있는 코드입니다. 이 값으로 분기하세요. |
| `requestId` | 예 | 이 요청에 대한 서버의 ID입니다. 문제를 보고할 때 함께 알려 주세요. 서버 로그와 일치합니다. |
| `details` | 경우에 따라 | 검증 메시지처럼 일부 4xx 오류에 대한 추가 정보입니다. |

메시지는 릴리스마다 바뀔 수 있습니다. 코드는 바뀌지 않으므로 클라이언트 로직은 `code` 기준으로 작성하세요.

## HTTP 상태에서 파생되는 코드 {#status-codes}

라우트가 자체 코드를 지정하지 않으면 서버는 상태에서 코드를 만들어 냅니다.

| HTTP 상태 | `code` |
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

그 외의 4xx는 `BAD_REQUEST`로, 그 외의 5xx는 `INTERNAL_ERROR`로 처리됩니다.

라우트가 더 구체적인 코드를 지정할 수 있으며, 이 경우 응답에는 해당 코드가 대신 포함됩니다. 예를 들어 AI 번들이 없어 실행할 수 없는 도구는 기능별 코드를 반환합니다. 이러한 코드는 해당 코드를 발생시키는 기능과 함께 설명합니다.

## 인증과 접근 {#auth-codes}

| `code` | 상태 | 대응 방법 |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | 세션 토큰 또는 API 키(`si_...`)와 함께 `Authorization: Bearer <token>`를 보내세요. |
| `FORBIDDEN` | 403 | 자격 증명은 유효하지만 권한이 없습니다. 관리자에게 권한을 요청하세요. |
| `MUST_CHANGE_PASSWORD` | 403 | 다른 엔드포인트를 호출하려면 먼저 계정의 비밀번호를 변경해야 합니다. 세션 토큰으로 `POST /api/auth/change-password`를 호출한 뒤 다시 시도하세요. |
| `USER_DISABLED` | 403 | 계정이 비활성화되어 있습니다. 관리자가 다시 활성화해야 합니다. |
| `LOGIN_THROTTLED` | 429 | 로그인 실패 횟수가 너무 많습니다. 잠시 기다린 후 다시 시도하세요. |
| `VALIDATION_ERROR` | 400 | 요청 본문 또는 매개변수가 검증에 실패했습니다. `details`에 문제가 표시됩니다. |

처음 실행할 때의 관리자 계정은 `admin`이고 비밀번호는 `admin`이며, `DEFAULT_USERNAME` 또는 `DEFAULT_PASSWORD`가 이를 변경한 경우는 예외입니다. `SKIP_MUST_CHANGE_PASSWORD`가 설정되어 있지 않으면, 비밀번호를 변경할 때까지 이 계정은 모든 호출에서 `MUST_CHANGE_PASSWORD`를 받습니다.

## 작업 {#job-codes}

실패한 작업은 HTTP 오류가 아니라 작업 자체에 실패 이유를 보고합니다. `GET /api/v1/jobs/{jobId}`에서 `error.code`와 `error.message`를 읽으세요. [진행 상황 추적](/ko/api/rest#progress-tracking)을 참고하세요.

## 아직 목록화되지 않은 코드 {#not-yet-cataloged}

개별 기능(예: 암호화, OIDC, SCIM, 팀)에서 발생하는 코드는 아직 이 페이지에 설명되어 있지 않습니다. 각 코드는 안정적인 코드입니다. 목록에 없는 코드는 내용을 알 수 없는 값으로 간주하고 상태에 따라 처리하세요.
