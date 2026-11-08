# spaces-tree

同梱 `spaces` の複製。同じ親フォルダの space が2件以上あると、見出しの下にまとめて表示する（折りたたみ可、見出しに最も緊急な状態を表示）。worktree の入れ子は元のまま。

オーバーレイとして開いたとき(`mod.open`)は space.move をしない（プレビュー用）。

    ln -s ~/Projects/herdr-mods/spaces-tree ~/.config/herdr-app/mods/spaces-tree
