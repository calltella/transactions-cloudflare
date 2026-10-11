# transactions-cloudflare

vinext / Cloudflare Workers / Supabase のアプリです。

## 開発と検証

- `npm run dev`: 開発サーバー
- `npm run build`: 本番ビルド
- `npm run start`: ビルドした Worker をローカル起動
- `npm test`: 認証・開発者権限・DB診断の自動テスト（Node.js 22.13以降）
- `npx tsc --noEmit --incremental false`: 型チェック
- `npm run deploy`: Cloudflare へデプロイ

`.env.example` を参考に、公開可能な Supabase URL と publishable key を
`.env.development.local` / `.env.production.local` に設定してください。
DBの認証情報は `.env.local` の
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` に設定します。
Vite 起動時にこの変数を読み込み、ローカルの Hyperdrive 接続に使用します。
Wrangler を直接起動する場合は同じ変数をプロセス環境変数に設定してください。
本番DB接続は Cloudflare 側の Hyperdrive 設定を使用します。
秘密情報を `wrangler.jsonc` に直接書かないでください。

## 開発画面

ログイン後、許可された開発者だけホームに「開発画面」リンクが表示されます。
`/developer` から `/developer/db-test` を開けます。
DB診断APIは `/api/developer/db-test` です。
旧 `/db-test` と `/api/db-test` は廃止しました。

許可する Supabase ユーザーUUIDを `wrangler.jsonc` の
`vars.DEVELOPER_USER_IDS` にカンマ区切りで指定します。
初期値は指定された開発者1名です。空の場合は全員拒否します。
リモートCloudflare Workerは `c34a94a8-fcb8-4ca8-a1ab-6f097059effd` を許可します。
Docker開発環境は `.dev.vars` の `DEVELOPER_USER_IDS` を
`d629d117-2f96-481b-9980-329fbf581f68` に設定します（設定済み）。
ローカルWorkerでは `.dev.vars` がWranglerのvarsを上書きします。
`.dev.vars` はGit管理対象外で、リモートWorkerへのデプロイには使われません。
初期設定の例は `.dev.vars.example` にあります。
メールアドレスやユーザーが編集できるプロフィール情報では権限を判定しません。
画面とAPIそれぞれで、Supabaseに検証されたユーザーのUUIDを確認します。
Cloudflare側で同じ変数を別途管理している場合も、値を一致させてください。

## 新規登録の停止

アプリの新規登録ボタンを削除し、サーバーアクションも登録を行わないようにしています。
Supabase Auth APIへの直接登録も止めるには、Supabase側の設定が必要です。
Hosted Supabaseでは Auth の「Allow new users to sign up」をOFFにしてください。
Self-hosted Supabaseでは Auth サービスの `GOTRUE_DISABLE_SIGNUP=true` を設定してください。
既存ユーザーのログインは引き続き利用できます。

公式資料:
- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/guides/self-hosting/auth/config

## 接続情報の変更

以前 Git管理されていたローカルDB接続情報は `.env.local` に移しました。
過去のコミットや既存ログから値が消えるわけではありません。
以前のパスワードが現在も有効な場合はDB側で変更し、`.env.local` を更新してください。
本番と同じ認証情報を使っていた場合は Hyperdrive 側の設定も更新してください。

## ユーザー単位のDBアクセス

通常の検索・表示・更新・削除は `app/src/lib/db/transactions.ts` の
`listTransactions` / `getTransaction` / `updateTransaction` / `deleteTransaction` を使います。
Cookieのユーザーセッションを使う Supabase JS SDK 経由の操作です。
認証は取得したJWTに対する `getClaims(token)` と `getUser(token)` で検証します。
サービスロールキーを使いません。ブラウザーでも型付きの
`app/utils/supabase/client.ts` のクライアントで操作できます。

最初に、既存の `public.transactions_work` に
`supabase/migrations/202610110001_transactions_work_rls.sql` を適用してください。
このSQLはテーブルを作成せず、RLS・所有者ポリシー・権限・索引を設定します。
既存の許可ポリシーがある場合にも所有者以外のアクセスを制限する
restrictiveポリシーを含みます。INSERT/UPDATEも `WITH CHECK` で所有者を確認します。
現時点ではSQLの実DBへの適用は行っていません。

## CSV取込

ログイン後、ホームの「CSVから取引を取り込む」から `/transactions/import` を開きます。
テンプレートのダウンロード、ファイルの検証、先頭5件のプレビュー、取込結果の確認ができます。

`POST /api/transactions/import` に同一オリジンから `FormData` の `file` として
UTF-8・カンマ区切りCSVを送信します。ログインが必要です。
最大1 MiB・5000件、250件ずつ同じDrizzleトランザクションにINSERTします。
引用符、引用符内の改行、UTF-8 BOM、CRLFを扱えます。
ヘッダーはDBの列名または `record.csv` の日本語列名に対応しています。
`date`（日付）と `type`（収入/支出）は必須で、それ以外は省略できます。
日本語列名は、日付・収入/支出・入金/支払方法・親カテゴリ・子カテゴリ・金額・場所・メモ・備考・タグです。
日付は `YYYY-MM-DD` / `YYYY/MM/DD`、任意で末尾の ` HH:mm` を受け付けます。
時刻を省略して元の日付を保存し、タイムゾーン変換は行いません。
収入/支出の「収入」「支出」はそのまま保存します。
`id` / `user_id` / `created_at` は指定できません。

```csv
date,type,payment_method,parent_category,child_category,amount,location,memo,note,tag
2026-10-11,expense,credit,food,lunch,1200,Tokyo,lunch,,work
```

```ts
const form = new FormData();
form.set("file", file);
const response = await fetch("/api/transactions/import", { method: "POST", body: form });
const result = await response.json(); // 成功時: { importedCount: 件数 }
```

CSVの所有者は検証済みJWTのユーザーに固定します。
トランザクション内で `SET LOCAL ROLE authenticated` と
`set_config('request.jwt.claims', 検証済みクレームJSON, true)` を実行します。
クレームはSQLパラメーターとして渡し、文字列連結はしません。
RLS無効やRLSを迂回できる実行ロールでは取込を拒否します。
設定はトランザクション終了時に失効し、エラー時は全件ロールバックします。
同じCSVを再度取り込む場合も、自分のtransactions_workを置き換えるため重複追加はしません。
DB接続ユーザーには `SET ROLE authenticated` の権限が必要です。

設計の参考:
- https://orm.drizzle.team/docs/rls
- https://supabase.com/docs/guides/database/postgres/row-level-security

## type正規化の管理者設定

開発画面の「typeを正規化」はユーザーJWT付きのSupabase SDK RPCで実行します。
リモートSupabaseには `supabase/migrations/202610110002_normalize_transaction_types.sql`、
DockerのSupabaseには `supabase/local/normalize_transaction_types.sql` を実行してください。
それぞれのSQLは上記環境の管理者UUIDだけを許可します。
Docker用SQLはリモートへ適用しないでください。

正規化ボタンは、全ユーザーの `transactions` を全件削除し、
続いて `transaction_types` を全件削除して、実行ユーザーの
`transactions_work.type` を重複なしで登録します。`transactions_work` は保持します。
管理者UUIDをDB関数内でも検証し、全ユーザーの削除に必要な権限を
この処理に限定するため `SECURITY DEFINER` を使用します。
削除・登録は同じトランザクションで実行します。
Dockerには更新済み関数を適用しましたが、実データの正規化は実行していません。
リモートで旧関数を適用済みの場合は
`supabase/migrations/202610110004_normalize_transaction_types_safeupdate.sql`
を適用してください。
PostgRESTで有効な `safeupdate` が条件なしのDELETEを拒否するため、
削除文には `WHERE id IS NOT NULL` を指定しています。
主キーはNULLにならないので、全件削除という動作は変わりません。

開発画面の「payment_methodを正規化」も、全ユーザーの `transactions` を削除し、
`payment_methods` を実行ユーザーの `transactions_work.payment_method` から再登録します。
NULL・空欄は除外し、名称に「銀行」を含むものは `bank_account`、
「カード」を含むものは `credit_card`、その他は `other` に分類します。
銀行の判定を優先し、元の名称は保持します。
Docker用は `supabase/local/normalize_payment_methods.sql`、リモート用は
`supabase/migrations/202610110005_normalize_payment_methods.sql` です。

「カテゴリを正規化」は、全ユーザーの `transactions`、`child_categories`、
`parent_categories` を順に全件削除し、実行ユーザーの
`transactions_work.parent_category` と `child_category` から親子関係を保って再登録します。
親が空欄の行は除外し、子が空欄でも親は登録します。名称は保持し、
子カテゴリは親IDと名称の組み合わせで重複を除きます。元の作業データは保持します。
Docker用は `supabase/local/normalize_categories.sql`、リモート用は
`supabase/migrations/202610110006_normalize_categories.sql` です。

「transactionsへ登録」はユーザーJWT付きSDKから
`insert_normalized_transactions` RPCを呼び出します。
`supabase/migrations/202610110007_insert_normalized_transactions.sql` は両環境共通です。
関数は `SECURITY INVOKER` と所有者RLSで実行し、自分の作業データだけを登録します。
名称を各マスターのIDに対応させ、子カテゴリは親IDと名称で照合します。
任意の空欄はNULL、その他の値と元のcreated_atは保持します。
対応するマスターがない場合は全件中止します。
既に自分のtransactionsが存在する場合も二重登録防止のため中止します。
既存データの削除は行わず、transactions_workも保持します。

## 本番Supabaseへの初回適用

Cloudflare WorkerのデプロイではSupabaseのSQLは適用されません。
本番プロジェクトのSQL Editorで `supabase/production/setup.sql` を実行してください。
作業テーブルと取引のRLS、共有マスターの読み取り権限、正規化3関数、
取引登録関数を一括設定し、PostgRESTのスキーマキャッシュも再読み込みします。
本番管理者UUIDを使用するため、Dockerへ適用しないでください。
このSQLは関数を登録するだけで、正規化・取引登録は実行しません。

## 銀行口座設定

`supabase/migrations/202610110008_bank_accounts.sql` をSupabase SQL Editorで適用し、
ホームの「銀行口座設定」から `/bank-accounts` を開いてください。
SQLは新規作成と旧構成への項目追加に対応し、既存レコードを保持します。
旧account_nameは任意に変更し、表示名にはpayment_methods.nameを使用します。
銀行名・支店名・名義・開始残高と基準日・利用状態・メモを編集できます。
開始残高は円単位の整数で、基準日とセットで指定します。
ユーザーJWT付きSDKと所有者RLSで自分の設定だけを読み書きします。

## ダッシュボードと月の集計期間

CSV取込は自分の `transactions_work` を全件削除して新しいCSVの内容へ置き換えます。
CSV全体を検証した後、ユーザーごとに同時取込を直列化し、削除・登録を同じ
JWT/RLS適用済みトランザクションで実行します。失敗した場合は元のデータに戻ります。
正規化後の `transactions` と他ユーザーの作業データはこの処理では削除しません。

ホームに利用中の銀行口座の記録上の現在残高と、カードの次回支払予定額を表示します。
`supabase/migrations/202610110009_dashboard_settings.sql` を適用すると、
ユーザーメニューの「設定」で毎月の開始日・終了日を保存できます。初期値は1日〜月末です。
終了日が開始日より前なら翌月にまたがり、存在しない日付は月末に合わせます。
日本時間の本日を基準に、直近の開始日からの期間を表示します。
銀行は基準日の取引前の開始残高に、本日までの収入を加算し支出を減算します。
カードは締め日・引き落とし日・支払月から次回分の対象期間を計算し、
本日までの支出を合計します。返金は差し引き、支払予定額の下限は0円です。
支払日当日は次回分として表示し、締め日前なら暫定額と明示します。
各カードの次回支払予定額を合計し、支払日と対象期間も表示します。
締め日または支払日が未設定、あるいは支払日が締め日より前になる設定は合計から除外します。
カード請求額の計算や口座への自動引落反映は行わず、登録済みtransactionsを集計します。
データはユーザーJWT付きSDKで取得し、ページ分割で全対象取引を読み込みます。

月の開始日の休日調整には `supabase/migrations/202610110010_dashboard_start_holiday.sql`
を適用してください。「設定」で調整なし・前の平日・次の平日を選択できます。
休日調整を選んだ場合、終了日は翌月の調整済み開始日の前日として自動計算し、
月ごとの期間が重複せず連続するようにします。終了日の選択は無効になりますが、
調整なしへ戻す場合の設定値は保持します。カード支払日はこの設定で調整しません。
土日と内閣府の祝日CSVに掲載された休日（振替休日などを含む）を対象にします。
祝日データは `app/src/lib/db/japan-holidays.ts` に日付を抽出して収録しています。
出典：https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv （2026-10-11取得、1955〜2027年）。
翌年以降のデータが公開されたら更新してください。対象年外では休日調整の集計を停止し、
データ更新または調整なしへの変更を案内します。

ダッシュボードの銀行口座から `/bank-accounts/[id]` の対象月履歴を開けます。
自分の口座だけを取得し、日付昇順、同日では取引ID順で表示します。
月初残高からの累計残高を右端に表示し、紐付くカードの引き落とし予定も反映します。
カードの利用明細は口座履歴に表示しません。予定を含む累計は予測値です。
実際の銀行引き落とし取引との自動照合は行っていないため、両方存在すると両方を反映します。

口座履歴には取引の追加・詳細・編集・削除を用意しています。
日付には曜日を表示し、前月・翌月・年月指定で期間を切り替えられます。
取引の変更はユーザーJWT付きSDKで行い、所有者と口座の条件を必ず指定します。
カード引き落とし予定は計算上の行のため、カード設定から管理します。
