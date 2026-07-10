---
description: "SnapOtterが収集する匿名の使用データ、それが送信されるタイミング、インスタンス全体の製品アナリティクスをオフにする方法。"
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 98607316afbb
---

# SnapOtterが収集するもの {#what-snapotter-collects}

匿名の製品アナリティクスはデフォルトで有効になっており、管理者がインスタンス全体に対して設定します。Settings > System > Privacyでオフにできます。

## 送信するイベント(有効時) {#events-we-send-when-enabled}

- tool_used: ツールID、ステータス、所要時間、カテゴリ、AIツールかどうか、失敗時のエラーコード。
- pipeline_executed: ステップ数、ツールID、バッチフラグ、ファイル数、所要時間、ステータス。
- ai_bundle_action: バンドルID、アクション、所要時間。
- フロントエンドの使用状況: どのツールページを開いたか、追加されたファイル(数のみ)、ツールの開始、ダウンロード、保存、検索(結果数のみ)、バッチ処理。
- クラッシュレポート: エラータイプと、ファイルのベース名のみを含むソーススタック。

## 決して収集しないもの {#what-we-never-collect}

- ファイル名やパス
- ファイル内容
- OCRの出力テキスト
- 画像メタデータ(EXIF)
- 抽出されたドキュメントテキスト
- IPアドレスやアカウントの識別情報

## オフにする方法 {#turning-it-off}

管理者: Settings > System > Privacyで「Anonymous Product Analytics」をオフに切り替えます。即座に、インスタンス全体で停止します。決してデータを送信できないイメージをビルドするには、`SNAPOTTER_ANALYTICS=off`ビルド引数を設定します。
