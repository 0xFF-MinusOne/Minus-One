# Pentest Dashboard

MINUS ONE の製品の 1 つで、脆弱性を管理するツールです。少人数のチームで 1 つの作業場所を共有します。

**クラウドに置くのは、タイトル、深刻度、進み具合だけです。** 未報告の脆弱性の再現手順などは手元で管理し、検出事項には「手元メモの参照」（ファイル名や識別子）だけを記録します。

## 必要なもの

- Node.js 22 以上、npm
- Docker と Supabase CLI（ローカルの DB と認証に使います）
- `pg_dump` と `psql` 17 以上（バックアップと復元に使います。接続先の Postgres と同じか新しい版）

## ローカルでの起動方法

```sh
npm ci
supabase start          # 混んでいるマシンでは数分かかります
npm run setup:dev       # .env.local と開発用アカウントを作成
npm run dev             # http://127.0.0.1:8092
```

- `supabase start` でストレージのヘルスチェックが時間切れになる場合は、`supabase/config.toml` の `[storage]` を `enabled = false` にしてください。このアプリは使いません。
- ローカルの Supabase のポート: api 54621 / db 54622 / shadow 54620 / studio 54623 / inbucket 54624。

### 開発用アカウント

`admin@pentest-dashboard.test`（管理者）です。パスワードと 2 段階認証の秘密鍵は、`npm run setup:dev` が自動で登録して `.dev-login.local` に書きます（Git には入りません）。

ログインには確認コードが必要です。認証アプリに `totp_secret` の値を登録するか、次のコマンドで今のコードを表示してください。

```sh
npm run dev:totp
```

`npm run setup:dev` をもう一度実行すると、パスワードと秘密鍵を作り直します。

## テスト

```sh
npx tsc --noEmit          # 型チェック
npm run build             # 本番ビルド
npx vitest run            # 単体テスト（DB は不要）
npm run test:integration  # 統合確認（ローカルの Supabase が必要）
```

統合確認は一時ユーザーを作って API で権限を確かめ、作ったユーザーとデータを最後に消します。

## 権限のしくみ

| 操作 | 未ログイン | 非メンバー | メンバー（2 段階認証前） | member | admin |
| --- | --- | --- | --- | --- | --- |
| プロジェクト・検出事項の読み書き | 不可 | 不可 | 不可 | 可 | 可 |
| プロジェクト・検出事項の削除 | 不可 | 不可 | 不可 | 不可 | 可 |
| メンバーの閲覧 | 不可 | 不可 | 不可 | 可 | 可 |
| メンバーの変更 | 不可 | 不可 | 不可 | 不可 | 可 |

- 制限は画面だけでなく DB の RLS（行単位のアクセス制御）で行います。条件には `(auth.jwt() ->> 'aal') = 'aal2'` が入っているので、パスワードだけのセッションでは何も読めません。
- 有効な admin が 0 人になる変更は DB が拒否します。
- 作成者と更新者は DB が記録し、利用者は変更できません。
- 画面は 30 分操作がないと自動でログアウトします。
- パスワードはユーザーメニューから変更できます（12 文字以上、確認入力あり、2 段階認証の後のみ）。
- 招待された人の変更必須の印は `members.must_change_password` にあります。本人は書き換えられず、パスワードが実際に変わったときに DB のトリガーが解除します。この制御は画面で行うもので、データの保護は 2 段階認証とメンバー判定が担います。

## メンバーの管理

公開の新規登録はありません。メンバーの追加は管理者がスクリプトで行います。キーはコマンドの引数に書かず、履歴に残らないように入力してください。

```sh
export SUPABASE_URL="https://<プロジェクト ID>.supabase.co"
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY   # 貼り付けて Enter（画面に出ません）

npm run members -- invite someone@example.com --role member   # 追加（admin も指定可）
npm run members -- reset-mfa someone@example.com              # 認証アプリを失くしたとき
npm run members -- disable someone@example.com                # 無効化（ログインと読み書きを止める）
npm run members -- enable someone@example.com                 # 無効化の取り消し

unset SUPABASE_SERVICE_ROLE_KEY
```

- `invite` は初期パスワードを標準出力に**一度だけ**表示します。保存はしません。安全な方法で本人に渡してください。本人は初回ログインで 2 段階認証を登録し、続けてパスワードを変更します。変更が終わるまで、ほかの画面には進めません。
- `reset-mfa` の後も、発行済みのトークンは期限（既定で 1 時間）まで aal2 のままです。端末を失くした場合は `disable` も使ってください。`disable` はすぐ読めなくなります。
- 画面の「メンバー」でも、admin は権限の変更と無効化ができます。ただし画面の無効化はデータのアクセスだけを止めます。ログイン自体も止めるにはスクリプトを使ってください。

## バックアップと復元

**無料プランには自動バックアップがありません。定期的に手で取ってください。**

### バックアップ

`public` スキーマのデータを `pg_dump` で取り、暗号化して保存します。暗号は AES-256-GCM、鍵はパスフレーズから scrypt で作ります（Node の標準機能だけを使うので `gpg` は不要です）。平文はパイプの中を流れるだけで、ファイルに書きません。

```sh
read -rs SUPABASE_DB_URL && export SUPABASE_DB_URL       # postgresql://... を貼り付けて Enter
read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE   # 12 文字以上

npm run backup -- ~/Backups/pentest-dashboard            # 保存先はリポジトリの外

unset SUPABASE_DB_URL BACKUP_PASSPHRASE
```

- 接続先は Supabase の画面の「Connect」にある Session pooler の URL を使ってください（無料プランの直接接続は IPv6 のみの場合があります）。
- **パスフレーズを失くすと復元できません。** パスワード管理ツールなどに、バックアップとは別に保管してください。
- `auth` スキーマ（ログイン情報、2 段階認証）は**含まれません**。理由と扱いは次の節を見てください。

### 復元

マイグレーション適用済みで、**データが空の DB** に戻します。全体を 1 トランザクションで流すので、失敗すれば何も書き込まれません。パスフレーズの間違いやファイルの破損は、書き込む前に検出します。

```sh
read -rs RESTORE_DB_URL && export RESTORE_DB_URL
read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE

npm run restore -- ~/Backups/pentest-dashboard/pentest-dashboard-public-YYYYMMDD-HHMMSS.sql.enc

unset RESTORE_DB_URL BACKUP_PASSPHRASE
```

**同じプロジェクトに戻す場合**（ユーザーがそのまま残っている場合）: 先にデータを空にしてから復元します。今のデータは消えるので、先にバックアップを取ってください。

```sql
truncate public.findings, public.projects, public.members;
```

**新しいプロジェクトに戻す場合**（ユーザーがいない場合）: バックアップにログイン情報が含まれないので、ユーザーを作り直します。作成者・更新者の記録は失われます。

1. 新しいプロジェクトにマイグレーションを適用し、上の手順で復元します。
2. SQL エディターで、古いユーザーへの参照を消します。

   ```sql
   begin;
   set local session_replication_role = replica;
   update public.projects set created_by = null, updated_by = null;
   update public.findings set created_by = null, updated_by = null;
   delete from public.members;
   commit;
   ```

3. `npm run members -- invite` でメンバーを追加し直します。

## Claude Code から使う（MCP サーバー）

`mcp/` に、Claude Code から使う stdio の MCP サーバーがあります。この Mac の中でだけ動き、HTTP では待ち受けません。ボットは通常のメンバーとしてログインして 2 段階認証を通すので、RLS がそのまま効きます。

**使えるツール:** `list_projects`、`get_project`、`create_project`、`update_project`、`list_findings`、`get_finding`、`create_finding`、`update_finding`、`import_trivy_file`、`get_summary`。削除、メンバー管理、任意の SQL のツールはありません。

### ボットの作成

接続先ごとに 1 回だけ実行します。パスワードと TOTP の秘密鍵はキーチェーン（サービス名 `pentest-dashboard-mcp/<接続先のホスト>`、アカウント `bot`）に保存し、画面には出しません。既に存在する場合は何も変えずに中止します。

```sh
export SUPABASE_URL="https://<プロジェクト ID>.supabase.co"      # ローカルなら http://127.0.0.1:54621
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY   # 貼り付けて Enter（画面に出ません）
read -rs SUPABASE_PUBLIC_KEY && export SUPABASE_PUBLIC_KEY               # 公開キー（anon または sb_publishable_）

npm run mcp:bot -- example.com    # mcp-bot@example.com を role = member で作成

unset SUPABASE_SERVICE_ROLE_KEY SUPABASE_PUBLIC_KEY
```

### Claude Code への登録

先にサーバーをビルドします。`mcp/dist/` は Git に入らないので、取得し直した後やコードの更新後にも実行してください。

```sh
npm ci && npm run mcp:build
```

```sh
claude mcp add pentest-dashboard \
  -e PENTEST_MCP_SUPABASE_URL="https://<プロジェクト ID>.supabase.co" \
  -e PENTEST_MCP_SUPABASE_KEY="<公開キー>" \
  -e PENTEST_MCP_IMPORT_DIR="$HOME/pentest-imports" \
  -- node "$PWD/mcp/dist/server.mjs"
```

| 環境変数 | 内容 |
| --- | --- |
| `PENTEST_MCP_SUPABASE_URL` | 接続先の URL。http はローカルだけ許可します |
| `PENTEST_MCP_SUPABASE_KEY` | 公開キー。`service_role` や `sb_secret_` のキーでは起動しません |
| `PENTEST_MCP_IMPORT_DIR` | `import_trivy_file` が読めるフォルダ。未設定なら取り込みは無効です |

### 無効化とキーチェーンからの削除

```sh
# 無効化（ログインと読み書きを止める。環境変数は「メンバーの管理」と同じ）
npm run members -- disable mcp-bot@example.com

# キーチェーンから削除（接続先のホストはサービス名に合わせる）
security delete-generic-password -s "pentest-dashboard-mcp/<プロジェクト ID>.supabase.co" -a bot

# Claude Code の登録を解除
claude mcp remove pentest-dashboard
```

### 制限

- 報告状況が `not_reported`、`reported`、`accepted` の間は、`reproduction_steps` を保存できず、`description`、`impact`、`remediation` は 500 文字を超えるとエラーになります。報告状況を同時に変える更新は、変更後の状態で判定します。`fixed`、`disclosed`、`not_applicable` なら通常どおり入力できます。これは MCP 側の制御で、画面からの入力は従来どおりです。
- 既に画面から入っている再現手順は、関係のない更新（ステータスの変更など）を妨げません。再現手順が残ったまま `not_reported` などに戻す更新は拒否します。
- `import_trivy_file` は、シンボリックリンクを解決した後で `PENTEST_MCP_IMPORT_DIR` の配下にある `.json`（20MB 以下）だけを読みます。取り込みは未報告で入るので、説明と修正案は 500 文字で切ります。
- 応答はデータだけの JSON で、`untrusted_data: true` が付きます。DB や Trivy 由来の文字列は信頼できないデータです。1 つの文字列は 8000 文字（一覧は 500 文字）、応答全体は 256KB までです。
- 作成者と更新者はボットとして記録されます。

### キーチェーンの制約

- 書き込みは `security -i` に標準入力でコマンドを渡すので、秘密は `ps` に表示されません。
- 項目は `/usr/bin/security` を信頼する形で保存されます。そのため、**このユーザーとして動くプログラムは、確認なしにこの項目を読めます。** ボットを member にしているのは、漏れた場合の影響を抑えるためです。漏えいが疑われるときは、すぐに無効化してください。

## クラウド配置の手順

現時点では配置していません。配置するときの手順です。

### 1. Supabase プロジェクトの作成

1. Supabase で新しいプロジェクトを作ります。データベースのパスワードはパスワード管理ツールに保管します。
2. マイグレーションを適用します。

   ```sh
   supabase login
   supabase link --project-ref <プロジェクト ID>
   supabase db push
   ```

`supabase/config.toml` の認証の設定はクラウドには自動で反映されません。次の 2、3 を画面で設定してください。

### 2. 新規登録の無効化

Authentication の設定で **「Allow new users to sign up」をオフ**にします。

**Email プロバイダ自体はオンのままにしてください。** オフにするとメールとパスワードでのログインもできなくなります。

あわせて、Site URL を Vercel の URL に、パスワードの最小文字数を 12 以上にしてください。

### 3. 2 段階認証の設定

Authentication の Multi-Factor の設定で、**TOTP を有効**（登録と確認の両方）にします。

### 4. Vercel の設定

1. `vercel.json` の `YOUR-PROJECT-REF` を自分のプロジェクト ID に置き換えます。**置き換えないと、CSP に止められてログインできません。**
2. Vercel のプロジェクトの環境変数に次の 2 つだけを設定します。

   | 名前 | 値 |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<プロジェクト ID>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon キー（公開してよいキー） |

   **`VITE_` で始まる変数はブラウザに公開されます。** `service_role` キーやデータベースのパスワードは絶対に入れないでください。Vercel に入れる必要もありません。

3. 載せ方は次のどちらでも構いません。
   - **GitHub 連携:** リポジトリを Vercel に接続すると、push のたびに配置されます。
   - **`vercel deploy`:** 手元からコマンドで配置します（本番は `vercel deploy --prod`）。

`vercel.json` には CSP、`X-Frame-Options`、`Referrer-Policy`、`X-Content-Type-Options`、`Permissions-Policy`、`X-Robots-Tag: noindex`、SPA の rewrite が入っています。`public/robots.txt` も検索エンジンを拒否します。

### 5. 最初の admin の作り方

スクリプトを手元で実行します（[メンバーの管理](#メンバーの管理) の環境変数を設定してから）。

```sh
npm run members -- invite you@example.com --role admin
```

表示された初期パスワードでログインし、2 段階認証を登録して、パスワードを変更します。

### 6. 配置後の確認

- 未ログインで開くとログイン画面になること。
- パスワードの後、2 段階認証を終えるまでほかの画面に入れないこと。
- ブラウザの開発者ツールに CSP の違反が出ていないこと。
- ビルド結果に `service_role` キーが含まれていないこと。

### バックアップの注意

- 無料プランには自動バックアップがありません。[バックアップと復元](#バックアップと復元) の手順で、定期的に手元に取ってください。
- 配置した直後と、大きな取り込みの前後に取ることをおすすめします。
- 保存先はリポジトリの外にし、パスフレーズはバックアップとは別に保管してください。
- 取ったバックアップから実際に戻せるかを、ときどき確かめてください。

## 無料プランの注意

Supabase と Vercel の無料プランでの運用を想定しています。

- **Supabase に自動バックアップはありません。** データを失っても、自分で取ったバックアップからしか戻せません。
- **Supabase のプロジェクトは、しばらく使わないと停止する場合があります。** 停止すると、画面から再開するまで使えません。長く使わない期間の前には、バックアップを取っておいてください。
- **Vercel の無料プランは、利用目的に条件がある場合があります**（商用利用など）。顧客案件に使う場合は、規約を確認してください。
- **制限や条件は変わります。** 容量、停止までの期間、利用条件は、Supabase と Vercel の公式の最新情報で確認してください。

## 未報告の情報の扱い

- 説明、再現手順、影響、修正案の入力欄の近くには、「未報告の脆弱性の詳細は入力せず、手元で管理してください」という注意を常に表示します。
- 報告状況が「未報告」「報告済み」「受理」のときに再現手順を入れて保存すると、確認のダイアログを出します（禁止はしません）。
- 「手元メモの参照」にはファイル名や識別子を記録します。リンクにはなりません。
- 報告書では、再現手順が空なら「手元メモ参照」と参照先を表示します。
- Trivy の取り込みでは、設定不備の `CauseMetadata.Code`（手元のコード本文）を保存しません。位置はファイル名と行番号で残します。シークレットの検出も取り込みません。

## フォルダの構成

```
src/
  api/          Supabase の読み書き
  auth/         ログイン、2 段階認証、メンバー判定、無操作ログアウト
  components/   画面の部品
  lib/          Trivy の解析、集計、報告書、URL の検証などの純粋な処理
  pages/        画面
  test/         テスト用のデータと架空の Trivy JSON
mcp/            Claude Code から使う MCP サーバー（フロントのビルドには入らない）
scripts/        メンバー管理、MCP のボット作成、バックアップ、復元、開発用の準備
supabase/       設定とマイグレーション
tests/          統合確認（ローカルの Supabase が必要）
vercel.json     公開時のヘッダーと rewrite
```

## 統合版（ホーム・Ghostwriter・Pentest）

ホームを `/`、既存Pentestを `/pentest` に置いています。新しい案件・報告書の入口は Ghostwriter（`/redteam`）です。
Ghostwriter は別の Docker の環境（`minus-one-ghostwriter`）で動き、ログインも別です。開発時は `bun run dev` か `bun run dev:all` で起動した Vite が `/redteam` を `127.0.0.1:8093` へ転送します。`.env.local` には `VITE_GHOSTWRITER_URL=/redteam` を書きます。
本番の公開方式は未定で、Vercel には `/redteam` の転送がありません。

`VITE_GHOSTWRITER_SSO=true` にすると、入口が `/open/redteam` に変わり、Hub のログインと MFA を済ませた人は Ghostwriter のログイン画面を通らずに開けます。既定は無効です。トークンは URL に載せず、フォーム POST で送ります。確認には `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` も `.env.local` に要ります（今の `.env.local` にはなく、既定の接続先 `http://127.0.0.1:54621` に anon キーなしで繋ごうとするのでログインできません）。Ghostwriter 側の設定、確認手順、制限は `minus-one-ghostwriter/integration/README.ja.md` の「Hub のログインで開く」にあります。公開時の CSP の変更は同じフォルダの `PRODUCTION.ja.md` の 5.2 節にあります。

Pentest のログイン・MFA・メンバーと案件は既存Supabaseを共通利用します。
Recon のコードは残しています（`/recon`、`src/recon/`）。ホームのアプリ一覧には出しません。

[統合・デプロイ手順](docs/UNIFIED-DEPLOYMENT.md) / [Recon MVP設計](docs/RECON-MVP.md)
