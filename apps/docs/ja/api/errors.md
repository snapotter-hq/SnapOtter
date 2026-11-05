---
title: "エラーコード"
description: "エラーボディの形式、安定したコード、そして各コードへの対処方法です。"
i18n_source_hash: d4ea74165166
i18n_provenance: machine
i18n_output_hash: 3fbe8f034039
i18n_hash_version: 2
---

# エラーコード {#error-codes}

すべての JSON エラーレスポンスは同じ形式です。

```json
{
  "error": "Job not found",
  "code": "NOT_FOUND",
  "requestId": "req-42"
}
```

| フィールド | 常に存在 | 意味 |
|-------|----------------|---------|
| `error` | はい | 人が読めるメッセージです。ユーザーに表示しても問題ありません。パースしないでください。 |
| `code` | はい | 安定した機械可読なコードです。分岐にはこれを使います。 |
| `requestId` | はい | このリクエストに対するサーバー側の ID です。問題を報告するときに添えてください。サーバーログと一致します。 |
| `details` | 場合による | 一部の 4xx エラーに付く追加情報です。たとえばバリデーションメッセージです。 |

メッセージはリリースごとに変わることがあります。コードは変わらないため、クライアントのロジックは `code` に対して書いてください。

## HTTP ステータスから決まるコード {#status-codes}

ルートが独自のコードを設定していない場合、サーバーはステータスからコードを導きます。

| HTTP ステータス | `code` |
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

その他の 4xx は `BAD_REQUEST` に、その他の 5xx は `INTERNAL_ERROR` にフォールバックします。

ルートがより具体的なコードを設定する場合もあり、その場合はレスポンスにそのコードが入ります。たとえば、AI バンドルが見つからないためにツールを実行できないときは、機能固有のコードが返されます。そうしたコードは、それを発生させる機能の説明の中で解説されています。

## 認証とアクセス {#auth-codes}

| `code` | ステータス | 対処 |
|--------|--------|------------|
| `AUTH_REQUIRED` | 401 | セッショントークンまたは API キー (`si_...`) を付けて `Authorization: Bearer <token>` を送信してください。 |
| `FORBIDDEN` | 403 | 認証情報は有効ですが、権限がありません。管理者に権限を依頼してください。 |
| `MUST_CHANGE_PASSWORD` | 403 | 他のエンドポイントを呼び出す前に、アカウントのパスワードを変更する必要があります。セッショントークンを付けて `POST /api/auth/change-password` を呼び出し、その後で再試行してください。 |
| `USER_DISABLED` | 403 | アカウントが無効になっています。管理者が再度有効にする必要があります。 |
| `LOGIN_THROTTLED` | 429 | サインインの失敗が多すぎます。しばらく待ってから再試行してください。 |
| `VALIDATION_ERROR` | 400 | リクエストボディまたはパラメーターがバリデーションに失敗しました。`details` が問題点を示します。 |

初回起動時の管理者アカウントは `admin` で、パスワードは `admin` です。ただし `DEFAULT_USERNAME` または `DEFAULT_PASSWORD` で変更した場合は除きます。`SKIP_MUST_CHANGE_PASSWORD` が設定されていない限り、このアカウントはパスワードが変更されるまで、すべての呼び出しで `MUST_CHANGE_PASSWORD` を受け取ります。

## ジョブ {#job-codes}

失敗したジョブは、HTTP エラーではなくジョブ自体に理由を報告します。`GET /api/v1/jobs/{jobId}` から `error.code` と `error.message` を読み取ってください。[進捗の追跡](/ja/api/rest#progress-tracking)を参照してください。

## 未カタログ化 {#not-yet-cataloged}

個々の機能 (たとえば暗号化、OIDC、SCIM、チーム) が発生させるコードは、このページではまだ説明していません。それぞれ安定したコードです。記載のないコードは不透明なものとして扱い、ステータスに基づいて処理してください。
