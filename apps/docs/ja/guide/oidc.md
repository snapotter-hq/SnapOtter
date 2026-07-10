---
description: "OpenID Connect でシングルサインオンをセットアップします。Keycloak、Authentik、Google、その他の OIDC プロバイダー向けのステップバイステップガイド。"
i18n_source_hash: 4296343b3cc5
i18n_provenance: human
i18n_output_hash: dc7b9859ab34
---

# OIDC / シングルサインオン {#oidc-single-sign-on}

SnapOtter はシングルサインオンのために OpenID Connect (OIDC) をサポートしています。ユーザーは、ローカルのユーザー名/パスワード認証の代わりに（または併用して）、Keycloak、Authentik、Google などの外部 ID プロバイダーでログインできます。

::: tip 関連項目
[SAML SSO](/ja/guide/saml) | [SCIM プロビジョニング](/ja/guide/scim) | [ユーザー、ロール、権限](/ja/guide/users-roles)
:::

## クイックスタート {#quick-start}

これらの環境変数を `docker-compose.yml` に追加します:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

プロバイダーのリダイレクト URI は常に次のとおりです:

```
${EXTERNAL_URL}/api/auth/oidc/callback
```

たとえば、`EXTERNAL_URL` が `https://photos.example.com` の場合、プロバイダーのリダイレクト URI を `https://photos.example.com/api/auth/oidc/callback` として設定します。

## 設定リファレンス {#configuration-reference}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `OIDC_ENABLED` | `false` | OIDC ログインを有効にします。ログインページに「SSO でサインイン」ボタンが表示されます。 |
| `OIDC_ISSUER_URL` | | プロバイダーの発行者 URL。OIDC ディスカバリー（`/.well-known/openid-configuration`）をサポートしている必要があります。 |
| `OIDC_CLIENT_ID` | | プロバイダーに登録された OAuth クライアント ID。 |
| `OIDC_CLIENT_SECRET` | | OAuth クライアントシークレット。 |
| `OIDC_SCOPES` | `openid profile email` | 要求するスコープのスペース区切りリスト。 |
| `OIDC_AUTO_CREATE_USERS` | `true` | 初回 OIDC ログイン時にローカルユーザーアカウントを自動作成します。 |
| `OIDC_DEFAULT_ROLE` | `user` | 自動作成された OIDC ユーザーに割り当てられるロール。`admin`、`editor`、`user` のいずれか。 |
| `OIDC_AUTO_LINK_USERS` | `false` | メールアドレスが一致する場合、OIDC ID を既存のローカルユーザーにリンクします。 |
| `OIDC_PROVIDER_NAME` | | ログインボタンに表示される表示名（例:「Keycloak」、「Google」）。空の場合、ボタンには「SSO」と表示されます。 |
| `OIDC_CLOCK_TOLERANCE` | `30` | トークン検証時のクロックスキュー許容範囲（秒）。 |
| `OIDC_USERNAME_CLAIM` | `preferred_username` | 新規アカウントのユーザー名として使用される ID トークンクレーム。 |
| `EXTERNAL_URL` | | SnapOtter に到達できる公開 URL。OIDC が正しいリダイレクト URI を構築するために必須です。 |
| `COOKIE_SECRET` | 自動生成 | セッションクッキーに署名するためのシークレット。複数のレプリカを実行する場合は明示的に設定してください。 |

## プロバイダーガイド {#provider-guides}

### Keycloak {#keycloak}

1. 新しいレルムを作成します（または既存のものを使用します）。
2. **Clients** に移動し、新しいクライアントを作成します:
   - **Client ID**: `snapotter`
   - **Client authentication**: On（機密）
   - **Authentication flow**: 標準フロー（認可コード）
3. クライアントの **Settings** タブで、**Valid redirect URIs** をコールバック URL（例: `https://photos.example.com/api/auth/oidc/callback`）に設定します。
4. **Credentials** タブから **Client secret** をコピーします。
5. `OIDC_ISSUER_URL` を `https://keycloak.example.com/realms/your-realm` に設定します。

### Authentik {#authentik}

1. 管理インターフェイスで **Applications > Providers** に移動し、新しい **OAuth2/OpenID Provider** を作成します。
   - **Client type**: Confidential
   - **Redirect URIs**: コールバック URL
   - **Signing key**: 既存のキーを選択するか、作成します
2. **Application** を作成し、それをプロバイダーにリンクします。
3. プロバイダー設定から **Client ID** と **Client Secret** をコピーします。
4. `OIDC_ISSUER_URL` を `https://authentik.example.com/application/o/snapotter/` に設定します（末尾のスラッシュが重要です）。

### Google {#google}

1. [Google Cloud Console](https://console.cloud.google.com/) に移動します。
2. プロジェクトを作成します（または既存のものを選択します）。
3. **APIs & Services > OAuth consent screen** に移動して設定します。
4. **APIs & Services > Credentials** に移動し、**OAuth 2.0 Client ID** を作成します:
   - **Application type**: Web application
   - **Authorized redirect URIs**: コールバック URL
5. **Client ID** と **Client secret** をコピーします。
6. `OIDC_ISSUER_URL` を `https://accounts.google.com` に設定します。
7. `OIDC_USERNAME_CLAIM` を `email` に設定します（Google は `preferred_username` を提供しません）。

## ユーザープロビジョニング {#user-provisioning}

### 自動作成 {#auto-create}

`OIDC_AUTO_CREATE_USERS` が `true`（デフォルト）の場合、誰かが初めて OIDC 経由でログインしたときにローカルユーザーアカウントが作成されます。ユーザー名は `OIDC_USERNAME_CLAIM` で指定されたクレームから取得され、ロールは `OIDC_DEFAULT_ROLE` に設定されます。

ユーザー名の衝突が発生した場合、数値のサフィックスが追加されます（例: `jane` は `jane_2` になります）。

### 自動リンク {#auto-link}

`OIDC_AUTO_LINK_USERS` が `true` の場合、メールアドレスが一致すれば、SnapOtter は OIDC ID を既存のローカルアカウントにリンクします。これは、事前に作成したユーザーアカウントがあり、データを失うことなく SSO の使用を開始させたい場合に便利です。

::: warning 
自動リンクは、OIDC プロバイダーがメールアドレスを検証することを信頼できる場合にのみ有効にしてください。検証されていないメールにより、誰かが別のユーザーのアカウントを乗っ取れる可能性があります。
:::

### ローカルログインの無効化 {#disabling-local-login}

OIDC はローカルのユーザー名/パスワードログインを無効にしません。両方の方法が引き続き利用可能です。OIDC プロバイダーに到達できない場合でも、管理者はローカル認証情報でログインできます。

## 自己署名証明書 {#self-signed-certificates}

OIDC プロバイダーが自己署名またはプライベート CA 証明書を使用している場合は、CA バンドルをコンテナにマウントし、`NODE_EXTRA_CA_CERTS` をそれに向けます:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - ./my-ca.pem:/etc/ssl/certs/custom-ca.pem:ro
    environment:
      NODE_EXTRA_CA_CERTS: /etc/ssl/certs/custom-ca.pem
      OIDC_ENABLED: "true"
      OIDC_ISSUER_URL: "https://auth.internal.example.com/realms/myrealm"
      OIDC_CLIENT_ID: "snapotter"
      OIDC_CLIENT_SECRET: "your-secret-here"
```

::: danger 
`NODE_TLS_REJECT_UNAUTHORIZED=0` を設定しないでください。これはすべての TLS 検証を無効にし、セキュリティリスクとなります。
:::

## トラブルシューティング {#troubleshooting}

### リダイレクト URI の不一致 {#redirect-uri-mismatch}

最も一般的なエラーです。プロバイダーが期待するものと SnapOtter が送信するものの間で、次の違いを確認してください:

- `http` と `https` の違い。スキームは正確に一致する必要があります
- 末尾のスラッシュ。一部のプロバイダーはこれに厳格です
- ポート番号。非標準の場合はポートを含めてください
- パス。`/api/auth/oidc/callback` である必要があります

`EXTERNAL_URL` を再確認してください。ユーザーがブラウザーに入力する URL と一致する必要があります。

### UNABLE_TO_VERIFY_LEAF_SIGNATURE {#unable-to-verify-leaf-signature}

OIDC プロバイダーが、Node.js が信頼していない証明書を使用しています。上記の [自己署名証明書](#self-signed-certificates) を参照してください。

### クロックスキューエラー {#clock-skew-errors}

サーバーの時刻と OIDC プロバイダーの時刻が同期していない場合、トークンの検証が失敗することがあります。`OIDC_CLOCK_TOLERANCE` を増やしてください（デフォルトは 30 秒）。より良い修正は、両方のマシンで NTP を実行することです。

### 「OIDC provider unreachable」 {#oidc-provider-unreachable}

SnapOtter は起動時とログイン時にプロバイダーのディスカバリードキュメントを取得します。次を確認してください:

- Docker コンテナ内部からの DNS 解決（`docker exec snapotter nslookup auth.example.com`）
- コンテナとプロバイダー間のファイアウォールルール
- `OIDC_ISSUER_URL` の値。ブラウザーからだけでなく、サーバーから到達可能である必要があります

### クレームの欠落 {#missing-claims}

ログイン後にユーザー名やメールが空の場合、プロバイダーが期待されるクレームを返していない可能性があります。次を確認してください:

- `OIDC_SCOPES` で設定されたスコープに `profile` と `email` が含まれている
- プロバイダーが、`OIDC_USERNAME_CLAIM` で指定されたクレームを ID トークンに含めるように設定されている
- 一部のプロバイダーでは、クレームを提供するために明示的なマッパー/スコープ設定が必要です
