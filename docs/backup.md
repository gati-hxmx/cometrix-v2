# バックアップと戻し方

Postgres（`docker compose` の `db`）の中身を、ファイルに取って、そこから戻します。ダンプにはコメント本文が入っているので、外に公開しないでください（`backups/` は git に入りません）。

## 取る

```sh
scripts/db-backup            # backups/cometrix-<日時>.dump ができる
scripts/db-backup /mnt/disk  # 保存先を変える
```

`pg_dump` のカスタム形式です。失敗したときはファイルを残さず、0 以外で終わります。

### 定期実行の例（cron、毎日 3:30）

```cron
30 3 * * * cd /path/to/cometrix-v2 && scripts/db-backup /path/to/backups >> /var/log/cometrix-backup.log 2>&1
```

古いダンプの削除と、別の場所へのコピーは今は自動ではありません（[#50](https://github.com/gati-hxmx/cometrix-v2/issues/50) の範囲外）。

## 戻す

1. `docker compose stop web worker` で、書き込む側を止める。
2. `scripts/db-restore backups/cometrix-<日時>.dump` を実行し、聞かれたら `y`（確認を省くなら `--yes`）。今の表は消えて、ダンプの内容になる。途中で失敗したときは元のまま（単一トランザクション）。
3. `docker compose up -d web worker` で再開する。
4. 確かめる：`docker compose exec db psql -U cometrix -d cometrix -c "select count(*) from chat_messages"` がバックアップ時の件数と合う。

## 古い分析の掃除

ワーカーが1日1回、90日を超えて開かれていない分析のコメント本文（`chat_messages`）を消します。30秒ごとの集計（`chat_buckets`）とジョブは残り、グラフは見られます。

- 日数は環境変数 `PURGE_AFTER_DAYS`（1以上の整数）で変える。不正な値のときは掃除しません。
- 消したコメントは、バックアップから戻す以外では元に戻りません。掃除の前後でバックアップを取っておくと安全です。
