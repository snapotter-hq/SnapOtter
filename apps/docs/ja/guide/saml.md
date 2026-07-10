---
description: "SnapOtter 向けに SAML 2.0 シングルサインオンをセットアップします。Okta、Azure AD / Entra ID、Google Workspace、その他の SAML ID プロバイダー向けのステップバイステップガイド。"
i18n_source_hash: 33dfb8b02a22
i18n_provenance: human
i18n_output_hash: 039fb6c7ee38
---

# SAML SSO {#saml-sso}

SnapOtter はシングルサインオンのために SAML 2.0 をサポートしています。ユーザーは、ローカルのユーザー名/パスワード認証の代わりに、外部 ID プロバイダー（Okta、Azure AD / Entra ID、Google Workspace、または任意の標準 SAML 2.0 IdP）経由でログインできます。

::: tip エンタープライズ機能
SAML SSO には、`saml_sso` 機能を含む **team** または **enterprise** ライセンスが必要です。有効なライセンスなしに `SAML_ENABLED=true` が設定されている場合、SAML ルートは通知なくスキップされ、警告がログに記録されます。
:::

## 前提条件 {#prerequisites}

- 公開 URL で到達可能な、稼働中の SnapOtter インスタンス
- その公開 URL に設定された `EXTERNAL_URL`（例: `https://photos.example.com`）
- `saml_sso` 機能を含む team または enterprise のライセンスキー
- SAML ID プロバイダーへの管理者アクセス

## クイックスタート {#quick-start}

これらの環境変数を `docker-compose.yml` に追加します:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    environment:
      EXTERNAL_URL: "https://photos.example.com"
      SNAPOTTER_LICENSE_KEY: "your-license-key"
      SAML_ENABLED: "true"
      SAML_IDP_SSO_URL: "https://idp.example.com/sso/saml"
      SAML_IDP_CERTIFICATE: |
        MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw
        ...your IdP's signing certificate in PEM format...
        EAYHKoZIzj0CAQYFK4EEACIDYgAE
```

コンテナを再起動します。ログインページに「SAML でサインイン」ボタン（または `SAML_PROVIDER_NAME` で設定されたラベル）が表示されます。

## 設定リファレンス {#configuration-reference}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `SAML_ENABLED` | `false` | SAML ログインを有効にします。 |
| `SAML_IDP_SSO_URL` | | IdP の SSO エンドポイント URL。SAML が有効な場合は **必須**。 |
| `SAML_IDP_CERTIFICATE` | | PEM 形式の IdP の X.509 署名証明書（ファイルパスではなく証明書のテキストそのもの）。SAML が有効な場合は **必須**。 |
| `EXTERNAL_URL` | | SnapOtter に到達できる公開 URL。SAML が有効な場合は **必須**。 |
| `SAML_ENTITY_ID` | `${EXTERNAL_URL}/api/auth/saml/metadata` | IdP に送信される SP Entity ID / Audience URI。 |
| `SAML_CALLBACK_URL` | `${EXTERNAL_URL}/api/auth/saml/callback` | Assertion Consumer Service (ACS) URL。 |
| `SAML_AUTO_CREATE_USERS` | `true` | 初回 SAML ログイン時にローカルユーザーアカウントを自動作成します。 |
| `SAML_AUTO_LINK_USERS` | `false` | メールアドレスが一致する場合、SAML ID を既存のローカルユーザーにリンクします。 |
| `SAML_DEFAULT_ROLE` | `user` | 自動作成された SAML ユーザーに割り当てられるロール。`admin`、`editor`、`user` のいずれか。 |
| `SAML_PROVIDER_NAME` | | フロントエンドの SAML ログインボタンの表示ラベル（例:「Okta」、「Azure AD」）。空の場合、ボタンには「SAML」と表示されます。 |
| `SAML_USERNAME_ATTRIBUTE` | | ユーザー名として使用される SAML アサーション属性。空の場合、メールのローカル部分、次に NameID にフォールバックします。 |
| `SAML_EMAIL_ATTRIBUTE` | `email` | ユーザーのメールアドレスとして使用される SAML アサーション属性。 |

`SAML_ENABLED=true` で、3 つの必須変数（`SAML_IDP_SSO_URL`、`SAML_IDP_CERTIFICATE`、`EXTERNAL_URL`）のいずれかが欠けている場合、サーバーは起動を拒否します。

::: details セキュリティに関する注意
`wantAuthnResponseSigned` と `wantAssertionsSigned` はどちらも `true` にハードコードされています。SnapOtter は署名されていない、または不適切に署名された SAML レスポンスを拒否します。信頼された IdP からのアサーションは、メール検証済みとして扱われます。

SP 起点のログインのみがサポートされています。SnapOtter は IdP 起点（未承諾）のログインやシングルログアウト (SLO) をサポートしていません。SnapOtter からログアウトしても、ユーザーは IdP からログアウトされません。
:::

## SP メタデータと URL {#sp-metadata-and-urls}

IdP には SnapOtter から 3 つの値が必要です:

| フィールド | 値 |
|---|---|
| **ACS URL**（Assertion Consumer Service） | `${EXTERNAL_URL}/api/auth/saml/callback` |
| **Entity ID** / **Audience URI** | `${EXTERNAL_URL}/api/auth/saml/metadata` |
| **SP メタデータ**（XML） | `GET ${EXTERNAL_URL}/api/auth/saml/metadata` |

たとえば、`EXTERNAL_URL` が `https://photos.example.com` の場合:

- ACS URL: `https://photos.example.com/api/auth/saml/callback`
- Entity ID: `https://photos.example.com/api/auth/saml/metadata`
- メタデータエンドポイント: `https://photos.example.com/api/auth/saml/metadata`（XML を返します）

一部の IdP は SP メタデータ URL を直接インポートでき、これにより ACS URL と Entity ID が自動入力されます。

## プロバイダーのセットアップ {#provider-setup}

### Okta {#okta}

1. Okta 管理コンソールで、**Applications > Create App Integration** に移動します。
2. **SAML 2.0** を選択して **Next** をクリックします。
3. 名前（例:「SnapOtter」）を設定して **Next** をクリックします。
4. SAML 設定を構成します:
   - **Single sign-on URL**: あなたの ACS URL（例: `https://photos.example.com/api/auth/saml/callback`）
   - **Audience URI (SP Entity ID)**: あなたの Entity ID（例: `https://photos.example.com/api/auth/saml/metadata`）
   - **Name ID format**: EmailAddress
   - **Application username**: Email
5. **Attribute Statements** で、`user.email` にマッピングされた `email` を追加します。
6. **Next** をクリックし、次に **Finish** をクリックします。
7. **Sign On** タブに移動し、**View SAML setup instructions** をクリックして、以下をコピーします:
   - **Identity Provider Single Sign-On URL** を `SAML_IDP_SSO_URL` へ
   - **X.509 Certificate** を `SAML_IDP_CERTIFICATE` へ

### Azure AD / Entra ID {#azure-ad-entra-id}

1. Azure ポータルで、**Microsoft Entra ID > Enterprise applications > New application** に移動します。
2. **Create your own application** をクリックし、「SnapOtter」と名前を付け、**Integrate any other application you don't find in the gallery** を選択します。
3. **Single sign-on > SAML** に移動し、**Basic SAML Configuration** セクションで **Edit** をクリックします:
   - **Identifier (Entity ID)**: あなたの Entity ID（例: `https://photos.example.com/api/auth/saml/metadata`）
   - **Reply URL (ACS URL)**: あなたの ACS URL（例: `https://photos.example.com/api/auth/saml/callback`）
4. **SAML Certificates** で、**Certificate (Base64)** をダウンロードします。
5. **Set up SnapOtter** で、**Login URL** をコピーします。
6. `SAML_IDP_SSO_URL` を Login URL に、`SAML_IDP_CERTIFICATE` をダウンロードした証明書の内容に設定します。
7. **Users and groups** でアプリケーションにユーザーまたはグループを割り当てます。

### Google Workspace {#google-workspace}

1. Google 管理コンソールで、**Apps > Web and mobile apps > Add app > Add custom SAML app** に移動します。
2. アプリに「SnapOtter」と名前を付け、**Continue** をクリックします。
3. **Google Identity Provider details** ページで、**SSO URL** をコピーし、**Certificate** をダウンロードします。**Continue** をクリックします。
4. Service Provider の詳細を設定します:
   - **ACS URL**: あなたの ACS URL（例: `https://photos.example.com/api/auth/saml/callback`）
   - **Entity ID**: あなたの Entity ID（例: `https://photos.example.com/api/auth/saml/metadata`）
   - **Name ID format**: EMAIL
   - **Name ID**: Basic Information > Primary email
5. **Continue** をクリックし、次に **Finish** をクリックします。
6. 組織部門に対してアプリを **ON** にします。
7. `SAML_IDP_SSO_URL` をステップ 3 の SSO URL に、`SAML_IDP_CERTIFICATE` をダウンロードした証明書の内容に設定します。

### 汎用 SAML 2.0 IdP {#generic-saml-2-0-idp}

任意の SAML 2.0 準拠の ID プロバイダーの場合:

1. IdP に新しい SAML アプリケーション/サービスプロバイダーを作成します。
2. **ACS URL** を `${EXTERNAL_URL}/api/auth/saml/callback` に設定します。
3. **Entity ID** / **Audience** を `${EXTERNAL_URL}/api/auth/saml/metadata` に設定します。
4. `email` という名前の属性でユーザーのメールを送信するように IdP を設定します（または、IdP の属性名に合わせて `SAML_EMAIL_ATTRIBUTE` を設定します）。
5. **IdP SSO URL** と **署名証明書** を `SAML_IDP_SSO_URL` と `SAML_IDP_CERTIFICATE` にコピーします。

## ユーザープロビジョニング {#user-provisioning}

### 自動作成 {#auto-create}

`SAML_AUTO_CREATE_USERS` が `true`（デフォルト）の場合、誰かが初めて SAML 経由でログインしたときにローカルユーザーアカウントが作成されます。ロールは `SAML_DEFAULT_ROLE` に設定されます。

ユーザー名は次の順序で導出されます:

1. `SAML_USERNAME_ATTRIBUTE` で指定されたアサーション属性の値（設定されていて存在する場合）
2. メールアドレスのローカル部分（`@` より前のすべて）
3. SAML NameID

ユーザー名の衝突が発生した場合、数値のサフィックスが追加されます（例: `jane` は `jane_2` になります）。

### 自動リンク {#auto-link}

`SAML_AUTO_LINK_USERS` が `true` の場合、メールアドレスが一致すれば、SnapOtter は SAML ID を既存のローカルアカウントにリンクします。これは、事前に作成したユーザーアカウントがあり、データを失うことなく SSO の使用を開始させたい場合に便利です。

::: warning 
自動リンクは、SAML IdP がメールアドレスを検証することを信頼できる場合にのみ有効にしてください。設定が誤った IdP からの検証されていないメールにより、誰かが別のユーザーのアカウントを乗っ取れる可能性があります。
:::

### 属性マッピング {#attribute-mapping}

| SnapOtter フィールド | ソース | 設定 |
|---|---|---|
| メール | アサーション属性 | `SAML_EMAIL_ATTRIBUTE`（デフォルト: `email`） |
| ユーザー名 | アサーション属性、メール、または NameID | `SAML_USERNAME_ATTRIBUTE`（上記の導出順序を参照） |
| 外部 ID | NameID | 常に SAML NameID で、設定不可 |

## SSO の強制 {#sso-enforcement}

すべてのユーザーに SAML（または OIDC）経由でのログインを要求し、ローカルパスワードログインをブロックしたい場合は、SSO の強制を有効にします:

1. `sso_enforcement` エンタープライズ機能がライセンスされていることを確認します（team および enterprise プランで利用可能）。
2. **Admin Settings > Security** で、**SSO Enforcement** をオンに切り替えます。
3. **break-glass ユーザー名** を設定します。これは、IdP に到達できない場合の緊急アクセス用に、引き続きパスワードでログインできる唯一のローカルアカウントです。

SSO の強制が有効な場合、（break-glass ユーザーを除く）ローカルログインの試行は「Local password login is disabled. Please use SSO.」というメッセージとともに 403 エラーを返します。

::: tip 
SSO の強制を有効にする前に、必ず break-glass ユーザー名を設定してください。それがないと、IdP がダウンした場合に SnapOtter からロックアウトされる可能性があります。
:::

## OIDC と併用した SAML の使用 {#using-saml-alongside-oidc}

SAML と OIDC は同時に有効にできます。両方が有効な場合、ログインページには各プロバイダー用の個別のボタン（`SAML_PROVIDER_NAME` と `OIDC_PROVIDER_NAME` でラベル付け）が表示されます。ユーザーはどちらの方法でもログインできます。

両方のプロバイダーは、自動作成、自動リンク、SSO 強制の設定を独立して共有します。それぞれが独自の `*_AUTO_CREATE_USERS`、`*_AUTO_LINK_USERS`、`*_DEFAULT_ROLE` 変数を持ちます。

## トラブルシューティング {#troubleshooting}

### アサーションの検証に失敗 {#assertion-validation-failed}

SAML レスポンスの署名またはアサーションの署名を検証できませんでした。次を確認してください:

- `SAML_IDP_CERTIFICATE` の証明書が IdP の現在の署名証明書と一致している（証明書はローテーションされるため、有効期限を確認してください）
- 証明書が PEM 形式である（`-----BEGIN CERTIFICATE-----` で始まる）
- 証明書がファイルパスではなく、全文である
- IdP に設定された ACS URL と Entity ID が SnapOtter の値と正確に一致している（スキーム、ホスト、ポート、パス）

### 属性の欠落 {#missing-attributes}

ログイン後にユーザー名やメールが空の場合、IdP が期待される属性を送信していない可能性があります。次を確認してください:

- IdP が `email` 属性（または `SAML_EMAIL_ATTRIBUTE` に設定されている値）を提供するように設定されている
- `SAML_USERNAME_ATTRIBUTE` を使用している場合、その属性がアサーションに含まれていることを確認してください
- 一部の IdP では、クレームを提供する前に明示的な属性マッピング設定が必要です

### クロックスキュー {#clock-skew}

SAML アサーションにはタイムスタンプ条件（`NotBefore`、`NotOnOrAfter`）が含まれます。サーバーの時刻と IdP の時刻が同期していない場合、アサーションの検証は失敗します。時刻を揃えておくために、両方のマシンで NTP を実行してください。

### 「SAML is enabled via env but saml_sso enterprise feature is not licensed」 {#saml-is-enabled-via-env-but-saml-sso-enterprise-feature-is-not-licensed}

この警告は、`SAML_ENABLED=true` であるがライセンスに `saml_sso` 機能が含まれていない場合にサーバーログに表示されます。ライセンスキーとプランを確認してください。`saml_sso` 機能は team および enterprise プランで利用可能です。

### ログインがエラーとともに戻される {#login-redirects-back-with-error}

SAML ログインボタンをクリックするとエラーとともにログインページに戻される場合は、詳細についてサーバーログを確認してください。一般的な原因:

- IdP SSO URL がサーバーから到達不能である
- IdP が認証リクエストを拒否した（IdP の監査ログを確認してください）
- IdP が署名されていないレスポンスを返した（SnapOtter はレスポンスとアサーションの両方が署名されていることを要求します）
