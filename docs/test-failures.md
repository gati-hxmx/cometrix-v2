# 実動画テストの記録

実際の配信アーカイブで分析を試した結果の記録です。失敗のパターンと回避策を分析するために残します。

## 決まり

- テストはオーナーの Mac で行う（`docker compose up --build -d` → http://localhost:3000）。VPS やクラウドからは YouTube に止められやすい
- 動画は [@Kuzuha のライブアーカイブ](https://www.youtube.com/@Kuzuha/streams) から選ぶ。短い配信・6時間を超える配信・メンバー限定・チャットのリプレイがない配信など、種類を混ぜる
- 続けて取りすぎない。1件ずつ、前の分析が終わってから次を入れる
- 一度使った URL は「読み込み済み」になり、分析し直されない。別のアーカイブを使うか、リセットしてから分析し直す（リセットは `docker compose exec db psql -U cometrix -c "delete from jobs where video_id='<動画ID>'"`。画面のボタンは #99）
- 失敗は下の「失敗ケース」に1件ずつ書く。**同じ原因が2回出たら、修正の Issue にする**

## 使った URL

| 日時（JST） | URL | 種類 | 長さ | 結果 | かかった時間 | コメント数 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-23 02:21 | https://www.youtube.com/watch?v=bLYdRrspzN8 | 短い配信 | 0:10:35 | 成功 | 1分 | 3,554 |
| 2026-11-23 02:23 | https://www.youtube.com/watch?v=eNHFXY-iZYc | 短い配信 | 1:09:43 | 成功 | 2分 | 8,611 |
| 2026-11-23 02:26 | https://www.youtube.com/watch?v=QmLp-GbmNpU | 長さ不明（配信予定の枠） | — | 失敗 | 5秒 | — |
| 2026-11-23 02:27 | https://www.youtube.com/watch?v=s9ylg3gcONg | 中くらい | 2:07:47 | 成功 | 4分 | 19,846 |
| 2026-11-23 02:32 | https://www.youtube.com/watch?v=Vnxfx4Y366s | 6時間超 | 7:56:36 | 成功 | 3分28秒 | 18,341 |
| 2026-11-23 02:37 | https://www.youtube.com/watch?v=3lVVlh1ifcs | 6時間超（最長） | 11:54:59 | 成功 | 5分25秒 | 25,254 |
| 2026-11-23 02:43 | https://www.youtube.com/watch?v=1UpNiWMfFkE | メンバー限定 | 3:37:03 | 失敗（想定どおり） | 10秒 | — |

## 失敗ケース

| 日時（JST） | URL | エラー（画面の文言） | 原因 | 回避策・直し方 | Issue |
| --- | --- | --- | --- | --- | --- |
| 2026-11-23 02:26 | https://www.youtube.com/watch?v=QmLp-GbmNpU | 「チャットの取得に失敗しました。（ERROR: … This live event will begin in 309 days.）」 | まだ始まっていない配信の枠（フリーチャット枠など）。yt-dlp の「This live event will begin in …」が失敗の分類に当てはまらず、`fetch_failed`（原因不明）になる | 使う側：配信が終わってから分析する。直し方：`live event will begin`・`Premieres in` を「まだ配信されていません」という別の理由に分ける（`src/worker/errors.ts`） | 1回目（2回出たら起こす） |
| 2026-11-23 02:43 | https://www.youtube.com/watch?v=1UpNiWMfFkE | 「動画を取得できません（非公開・削除・メンバー限定・サブスクライバー限定の可能性があります）。」 | メンバー限定の配信。想定どおり `video_unavailable` に分類され、理由も画面に出る | 回避策なし（メンバーのログイン情報を使う取得はしない）。表示は正しい | 不要 |

## まだ試していない種類

- チャットのリプレイがない配信：@Kuzuha の配信一覧からは見つからなかった（`no_chat` の分類は保存済みのサンプルでテスト済み）
- Twitch の VOD（#20）
