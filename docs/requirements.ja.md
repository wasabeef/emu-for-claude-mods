# emu-for-claude-mods 要件定義・技術調査

Claude Code mods で iOS シミュレータ / Android エミュレータの起動・停止・ステータスを管理する mod の要件と調査結果。

- 作成日: 2026-10-14
- 対象: Claude Code v2.1.299(mods は v2.1.287 以降、Desktop アプリは v2.1.286 以降)
- 名称
  - リポジトリ: `emu-for-claude-mods`(マーケットプレイスとして、今後ほかの mod も同居できる)
  - プラグイン: `emu`。Claude に見えるツール名は `mcp__emu__<name>`、コマンドは `/emu`
  - [wasabeef/emu](https://github.com/wasabeef/emu) との関係を README に明記する (着想元)
  - プラグイン名を `claude-` で始めると `claude plugin validate` で弾かれる

---

## 1. 目的

[emu](https://github.com/wasabeef/emu) のような「シミュレータ / エミュレータの起動・停止・ステータス管理」を Claude Code の中で行えるようにする。

あくまでデバイスの管理が目的であり、デバイスの中身 (画面、アプリ) には触れない。

## 2. スコープと優先度

| 優先度 | 機能 | 概要 |
|---|---|---|
| **P0** | デバイス管理 | 一覧・起動・停止を、スラッシュコマンドと Claude 用ツールの両方から行う |
| **P1** | ステータス表示 | 起動中デバイスの要約をステータス行に、起動完了と停止をトーストで表示 |
| **P2** | 管理ペイン | デバイス一覧と、起動・停止ボタンを持つペイン (emu の TUI 相当) |

対象外:

- デバイスの中身の操作: スクリーンショット、画面プレビュー、tap、swipe、文字入力、キー操作、要素ツリー取得、アプリの起動・インストール、URL を開く
  - 必要な場合は XcodeBuildMCP などの既存ツールを併用する
- デバイスの作成・削除・wipe、Android の system image 管理 (emu にある機能。必要になれば後で追加)
- 実機の操作
- Linux / Windows 上の iOS(iOS シミュレータは macOS 専用)

## 3. 機能要件

### 3.1 P0: デバイス管理

| 操作 | iOS | Android |
|---|---|---|
| 一覧 | `xcrun simctl list devices available -j` | `emulator -list-avds` と `adb devices` を突き合わせる |
| 起動中の AVD 名を得る | JSON の `state` | `adb -s <serial> emu avd name` |
| 起動 | `xcrun simctl boot <udid>` と `open -a Simulator` | `emulator -avd <name>` を **nohup で切り離して**起動 |
| 停止 | `xcrun simctl shutdown <udid>` | `adb -s <serial> emu kill` |
| 起動完了の待機 | `xcrun simctl bootstatus <udid> -b` | `adb -s <serial> wait-for-device` と `getprop sys.boot_completed` |

- デバイスは名前の部分一致、UDID、AVD 名、adb serial のどれでも指定できるようにする
- 指定がなく起動中のデバイスが 1 台だけなら、それを対象にする
- Android SDK のパスは `ANDROID_HOME`、`ANDROID_SDK_ROOT`、`~/Library/Android/sdk` の順で解決する
- スラッシュコマンド: `/emu`(ペインを開く) 、`/emu list`(一覧) 、`/emu boot <name>`、`/emu stop <name>`、`/emu stop-all`、`/emu close`、`/emu help`

### 3.2 P0: Claude 用ツール

ツールは `mcp__emu__<name>` の名前で Claude に公開される。

| ツール | 内容 |
|---|---|
| `devices` | 一覧と状態 (3.1 の一覧) |
| `boot` | 起動し、起動完了まで待つ (3.1 の起動と待機) |
| `shutdown` | 停止する (3.1 の停止) |

### 3.3 P1: ステータス表示

- `$.ui.status()` で「2 running · iPhone 16 Pro, Pixel 8」のような要約を出す
- `$.ui.toast()` で起動完了と停止を通知する (ペインが開いている間は行とメッセージ欄が同じ内容を示すので出さない)
- 状態は `$.clock.every` によるポーリングで更新する

### 3.4 P2: 管理ペイン

- `$.ui.open({ id, title })` と `ui.render`(`component: 'Pane'`) で描画する
- iOS と Android をグループに分けて一覧を出す。各行は 1 つの Button で、押すと起動 / 停止する
- キーボードだけで完結させる。1 行 1 ボタンで、`tab` と `↑` / `↓`、`j` / `k` で行移動 (全件表示で行が本文領域を超えるとエンジンは矢印をスクロールに回すため、`ui.scroll` フックで矢印 1 行分だけ横取りしてフォーカス移動に変える。ホイール・ページキーは従来どおりスクロール) 、`h` / `l` で iOS / Android の一覧へジャンプ、`enter` で起動 / 停止 (選択状態は持たず、フォーカスがカーソル。フォーカス行は `ui.focus` で追跡して `▶` と色で明示し、開いた直後は先頭行にフォーカスする) 。`a` は全件表示の切り替え、`x` は全停止、`r` は更新、`c` / `esc` は閉じる。`/emu` (`/emu pane`) はフォーカス付きで開き、1 分間操作がなければ自動で閉じる
- 先頭に「N running · M devices」を出す。起動 / 停止中の行は二重操作しない。折りたたみ時は各プラットフォーム先頭 12 件と起動中を出す
- クリックはフルスクリーンレイアウト時のみ有効 (4.3 参照) 。通常レイアウトでは `e.viewport.isFullscreen` を見て案内を 1 行出す
- 状態は `$.clock.every` によるポーリング (ペインを開いている間は 5 秒、閉じている間は間引く) で更新する。値は `$.state` に置く
- 画面構成 (上から)
  - 1 行目: 「N running · M devices · tab / j k move · enter boot/stop · esc close」
  - プラットフォームごとのグループ見出し: 名前 (iOS は青、Android は緑) と「起動中/総数 running」
  - デバイス行: `▶`(フォーカス行のみ) · 通し番号 · 名前 · runtime (起動中の Android は adb serial も) · 状態チップ (`● running` 緑 / `○ stopped` 淡色 / `◐ Booting…` 黄) 。フォーカス行は太字・シアンで、右端に `⏎ Boot` / `⏎ Stop` を出す。名前と runtime は桁をそろえる
  - 起動できない AVD (`config.ini` の `image.sysdir.1` が SDK に無い / `abi.type` がホスト CPU と不一致) は一覧に残し、チップは `✕ no image` / `✕ no arch` (淡色) 。並びは各プラットフォームの末尾、折りたたみ時は件数を持たず「✕ N unavailable」 1 行にまとめる。Enter / `boot` は起動せず、理由と `sdkmanager` コマンドを 5 秒表示する。`/emu list` とツールは `unavailable: ...` を返す
  - フッター: `j: down` / `k: up` / `a: all (+N)` / `x: stop all (N)` (起動中がある時のみ) / `r: refresh` / `c: close`
- 画面イメージ (ダミー): https://claude.ai/artifact/WkpV2ooezt6mD6Y2J7xXoY
  - 流用するのは右ペインのデバイス一覧 (グループ見出し、通し番号、状態チップ、起動 / 停止、ステータス行) だけ。ミラー (スクリーンショット表示とクリックで tap) 、Screenshot / Home ボタン、トランスクリプトの tap・launch_app 等は対象外 (2 章)

## 4. 技術調査

### 4.1 mods の基本

- mod は hooks module(JS / TS) を持つプラグイン。`hooks/hooks.json` の `modules` がコードを指す
- 構成: `.claude-plugin/plugin.json`、`hooks/hooks.json`、`hooks/register.tsx`(`$.state` を使う場合は `types/index.d.ts` も)
- フック関数は `($, e, next)` の 3 引数。`next(e)` を呼ばずに返せば自分で応答し、`next({ ...e })` を呼べば書き換えになる
- 動く場所: CLI と Desktop アプリの Code タブ。サンドボックスはなく、ユーザー権限で動く
- 開発: `claude --plugin-dir <dir>` でホットリロード。`claude plugin validate <dir>` で静的検査、`claude plugin test <dir>` でテスト
- 型定義: 読み込み時に `.claude-plugin/types/` に書き出される。API は早期アクセス扱いでリリース間に変わりうる

### 4.2 今回使う API

| 用途 | API | 注意点 |
|---|---|---|
| コマンド実行 | `$.process.run(argv, { timeoutMs })` | シェルを経由しない。既定 30 秒、最大 10 分。出力は各 4 MiB まで |
| 常駐プロセス | `$.process.spawn` | ループを抜けるかリロードで子プロセスが kill される。**エミュレータ本体は `sh -c "nohup … &"` で切り離す** |
| 定期処理 | `$.clock.every(ms, fn)` | ターンを起こさない。hook 自体の 10 秒制限は hook 自身の実行時間のみを数え、`$` の呼び出し中は止まる |
| コマンド | `$.command.register` と `command.run` | `session.start` で登録する。組み込みコマンドと同名は不可 |
| Claude 用ツール | `$.tool.register` と `tool.call`(`{ tool: 'mcp__emu__x' }`) | `{ result }` を返す |
| 状態 | `$.state`(セッション内。リロード後も残る) 、`$.store`(セッションをまたぐ) | モジュール変数はリロードで消える |
| 表示 | `$.ui.status` / `toast` / `log`、`$.ui.open` と `ui.render` | |
| 環境変数 | `$.env.get('ANDROID_HOME')` | 名前は文字列リテラルで書く (静的検査のため) |

### 4.3 端末互換性 (クリック操作)

Claude Code v2.1.299 のバイナリから読んだ非公開の実装。変わる可能性がある。

- マウスのトラッキングは**フルスクリーンレイアウト (代替画面) のときだけ**有効になる。端末の許可リストはない
- フルスクリーンになるかどうかの判定:
  - スクリーンリーダーモードならオフ
  - `CLAUDE_CODE_NO_FLICKER=1` ならオン (強制)
  - クラッシュによる自動無効化、tmux のコントロールモード、Windows の SSH ならオフ
  - それ以外は settings の `tui`(`fullscreen` / `default`) 、未設定なら段階ロールアウトのフラグ次第
- `CLAUDE_CODE_DISABLE_MOUSE` で完全にオフ、`CLAUDE_CODE_DISABLE_MOUSE_CLICKS` でスクロールのみになる
- **WezTerm と cmux は、フルスクリーンレイアウトであればクリック可能**と見込める (SGR マウス報告に対応しているため)
- 結論: P2 のペインはキーボード操作を基本にし、クリックは補助とする

### 4.4 参考実装・既存ツール

- **[emu](https://github.com/wasabeef/emu)**: Android と iOS のデバイスを管理する TUI。simctl、avdmanager、emulator、adb を使う。機能範囲の参考
- **XcodeBuildMCP などの MCP サーバー**: デバイスの中身 (画面、アプリ) を Claude に操作させたい場合の既存の選択肢。この mod の価値は、Claude Code の中で起動・停止・ステータスを管理でき、ペインで常時状態を見られること

## 5. 非機能要件

- 対応 OS: macOS(iOS は必須で macOS。Android だけなら Linux も可能だが、当面は対象外)
- 依存: Xcode Command Line Tools、Android SDK(emulator、platform-tools)
- 失敗時はツール結果に原因と対処を返す (例: 「adb が見つかりません。ANDROID_HOME を設定してください」) 。hook は例外で落とさない
- ポーリングは軽量に保つ。ペインやステータス行が不要なときは間隔を伸ばす
- 権限: ツール呼び出しは Claude Code の権限ダイアログに従う。停止系 (shutdown、stop-all) は破壊的操作として扱う
- 開発時は `--plugin-dir` で動かす。配布はマーケットプレイス (`.claude-plugin/marketplace.json`) 経由

## 6. リスク

- mods API は早期アクセス版で、リリース間に変わりうる。README に動作確認したバージョンを明記する
- 4.3 の挙動は非公開の実装に依存している
- `$.process.run` のタイムアウト (最大 10 分) 。起動待ちが長い場合は分割して待つ

## 7. 未確認事項・次の検証

1. WezTerm と cmux で、フルスクリーンレイアウト時に Button のクリックが効くか
2. ペインの `s` 操作、ステータス行、トーストの表示 (ユーザー環境での目視確認)

## 参考

- [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview)
- [Create a mod](https://code.claude.com/docs/en/plugins/mods/create)
- [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api)
- [wasabeef/emu](https://github.com/wasabeef/emu)
- [cmux is built on Ghostty](https://cmux.com/built-on-ghostty)
- [XcodeBuildMCP](https://glama.ai/mcp/servers/getsentry/XcodeBuildMCP)
