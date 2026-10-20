- `Private` の変数（`m` で始める）は、クラスの中だけで使える
- 結果を返す入口は `Function` にする（`Property Let` は返せない）
- 初期値は `Class_Initialize` で設定する

::: くわしく

- **公開と非公開**: クラスモジュールの `Public` 変数は、外から自由に読み書きできるプロパティになります。
- **Property Get と Property Let**: 外から見ると、`Property Let` は `Public` 変数と同じ書き方（`gearbox.Position = "R"`）で値を設定できます。過剰適用のように確かめない `Property Let` を付けると、未適用と区別がつかなくなります。
- **初期値**: 変数の宣言で初期値を書けないため、`Class_Initialize` の中で設定します。

:::
