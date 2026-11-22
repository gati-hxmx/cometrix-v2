# 共通部品

画面で使う部品はここに置き、画面ごとに似た部品を作らない（[部品 5](../../docs/design/components.md#5-共通部品を使い回す)）。
見本帳は #2 で最初の見た目を決めたあとに `/styleguide` として作る。

- `Segmented`：表示の切り替え（つながった札「A｜B」、[基本 4](../../docs/design/layout.md#4-切り替えボタンの位置)）。枠の右端に置く。
- `Icon`：線のアイコン（[アイコン](../../docs/design/icons.md)）。絵は Lucide の形。使える名前は icons.md の一覧にあるものだけ。
- `ExportMenu`：書き出しの ⋮ メニュー（[部品 5-9](../../docs/design/components.md#5-9-小さなメニュー)）。重ねて出す見た目は globals.css の `.menu-host`・`.menu-pop`。ほかの ⋮ もこの形で作る。
