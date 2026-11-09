# spaces-tree

herdr-app の Mod。同梱 `spaces` の複製に、フォルダ見出しでのグループ化を足したもの。同じ親フォルダの space が2件以上あると、見出しの下にまとめて表示する（折りたたみ可、見出しに最も緊急な状態を表示）。worktree の入れ子は元のまま。

オーバーレイとして開いたとき(`mod.open`)は space.move をしない（プレビュー用）。

## 導入

    git clone <このリポジトリ> ~/Projects/herdr-mods/spaces-tree
    ln -s ~/Projects/herdr-mods/spaces-tree ~/.config/herdr-app/mods/spaces-tree

レイアウトの spaces ブロックの mod を `spaces-tree` にするか、`mod.open` で開く。

## 注意

フォルダ見出しの表示に合わせて、space の並びを `space.move` で自動的に並べ替える。

## Storybook

`storybook.json` と、`main.js` 内のモックで ModsStoryBook から表示を確認できる（Story が開いたプレビューだけがモックになる）。状態の構造を変えたら `storybook.json` とモックを同時に直す。
