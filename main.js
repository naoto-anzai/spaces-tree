// Spaces as a folder tree (one space per folder, many sessions per folder), grouped by
// machine when more than one is known. Look follows the files mod. A folder with
// subfolders and a space of its own opens the space from its row and folds from the chevron on the left.
// Order is decided here (alphabetical): spaces are never moved.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, home, spaces, machines, panes, run, openOverlay, exec, hc, theme, shared, watchFolder, window, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
// First tab first: the first pane there with a live folder, else where it was made.
function place(s, ps) {
  for (const c of s.tabs ?? []) {
    const p = ps.find((x) => x.tab === c.id && x.cwd);
    if (p) return p.cwd;
  }
  return s.folder;
}
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
// Indent per folder level (the files mod uses 18).
const STEP = 8;
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// A space speaks up only when something in it needs you.
// モック中(Story が開いたプレビュー)は選択値、本番なら null
export function storybook(mod) {
  const id = props()?.storybook;
  return id ? (shared(`storybook:${mod}:${id}`)?.values ?? {}) : null;
}

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// ---- Storybook のモック(storybook.json と一対一。構造を変えたら両方直す) ----
// 本番データ関数(spaces など)は使わない。mock.js に分けない(CLAUDE.md 参照)。
const DEFAULTS = { folders: "few", sessions: "some", mismatch: false, case: false, worktrees: true, parent: false, dup: false, closed: false, hover: false, remote: false, narrow: false };

const MOCK = {
  home: "/mock/home",
  folders: {
    empty: [],
    one: ["Projects/herdr"],
    few: ["Work/app", "Work/api", "notes"],
    many: ["Projects/herdr-mods/spaces-tree", "Projects/herdr-mods/launcher", "Projects/herdr-mods/github", "research/survey", "research/crest", "work/app", "work/api", "work/docs", "tmp/scratch", "dotfiles"],
    long: ["a-very-long-parent-folder-name/a-really-long-folder-name-that-overflows-the-row", "日本語のとても長い親フォルダ名/テスト用のフォルダ", "x"],
  },
  remote: ["/srv/build/app", "/srv/build/gpu"],
  titles: ["refactor tree", "fix flaky tests", "write docs", "review PR"],
  states: ["working", "blocked", "done", "idle"],
  // folders: {sp, ps, git} を本番と同じ形で返す
  data(sb) {
    const base = this.folders[sb.folders] ?? this.folders.few;
    const dirs = {};
    for (const f of base) { const d = f.split("/").slice(0, -1).join("/"); if (d) dirs[d] = (dirs[d] ?? 0) + 1; }
    const paths = [...base, ...(sb.parent ? Object.keys(dirs).filter((d) => dirs[d] >= 2) : [])];
    const list = [...paths.map((f) => ({ f: `${this.home}/${f}`, m: null })), ...(sb.remote ? this.remote.map((f) => ({ f, m: "build-server" })) : [])];
    if (sb.dup && list.length) list.push({ ...list[0], dup: true });
    if (sb.case && list.length) list.push({ ...list[0], lower: true }); // 大文字小文字だけ違う同じフォルダ
    // worktree: 本体(i % 3 === 0 の git ありフォルダ)に紐づく worktree の space
    if (sb.worktrees) list.slice().forEach((e, i) => { if (!e.m && !e.dup && !e.lower && i % 3 === 0) list.push({ f: `/mock/wt/${i}-a`, m: null, wtOf: i, branch: "feature/login" }); });
    const sp = [], ps = [], git = {}, wts = {};
    list.forEach((e, i) => {
      const id = `mock-${i}`;
      const cwd = e.lower ? e.f.toLowerCase() : e.f;
      // space.folder は作った場所。mismatch では実際のフォルダの1つ上(セッションは cd で別の場所へ)
      const made = sb.mismatch && !e.m && i < 2 ? e.f.split("/").slice(0, -1).join("/") : cwd;
      const n = sb.sessions === "none" ? 0 : sb.sessions === "some" ? (i % 2 === 0 ? 1 : 0) : (i % 3) + 1;
      const states = Array.from({ length: n }, (_, k) => this.states[sb.sessions === "some" ? (i % 4 === 0 ? 0 : 3) : (i + k) % 4]);
      const top = ["blocked", "done", "working", "idle"].find((s) => states.includes(s)) ?? null;
      sp.push({ id, name: e.f.split("/").pop(), named: false, folder: made, machine: e.m, branch: null, active: false, status: top, tabs: [{ id: `t-${id}` }] });
      ps.push({ pane: `${id}-sh`, terminal: `${id}-sx`, tab: `t-${id}`, title: "zsh", cwd, status: null, program: { agent: false, shell: true, name: "zsh" } });
      states.forEach((st, k) => ps.push({ pane: `${id}-p${k}`, terminal: `${id}-x${k}`, tab: `t-${id}`, title: this.titles[(i + k) % 4], cwd: sb.mismatch && i === 0 ? `${this.home}/elsewhere` : cwd, status: st, program: { agent: true, shell: false, name: "Claude Code" } }));
      if (sb.worktrees && i % 3 === 0 && e.wtOf === undefined) wts[id] = [{ branch: "fix/typo", path: `/mock/wt/${i}-b` }];
      if (e.wtOf !== undefined) git[id] = { name: list[e.wtOf].f.split("/").pop(), branch: e.branch, ahead: 1, behind: 0, repo: `repo-${e.wtOf}`, linked: true };
      else if (i % 3 !== 2) git[id] = { name: e.f.split("/").pop(), branch: ["main", "dev", "feature/tree"][i % 3], ahead: i % 3, behind: i % 2, repo: `repo-${i}`, linked: false };
    });
    return { sp, ps, git, wts, home: this.home };
  },
};


const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const top = (list) => list.filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0] ?? null;

// Folder tree from spaces: { sp, ps, git(space) -> info, home, closed:Set }. Rows are the
// nodes (and their sessions) in display order; a folder without a space of its own and
// with one child merges into it ("a/b").
function treeRows({ sp, ps, home: homeDir, closed, gitOf }) {
  const userHome = (homeDir ?? "").replace(/\/+$/, "");
  const tries = new Map(); // machine|kind -> root
  // Folders compare without a trailing "/", and on this computer without case (macOS);
  // the path shown keeps its first spelling. `id` is the comparable form.
  const low = (m, x) => (m === null ? x.toLowerCase() : x);
  const root = (m, kind, path) => {
    const k = `${m ?? ""}|${kind}`;
    if (!tries.has(k)) tries.set(k, { label: kind === "home" ? "~" : "/", path, id: low(m, path), machine: m, spaces: [], kids: new Map(), root: true });
    return tries.get(k);
  };
  const insert = (s) => {
    const m = s.machine ?? null;
    const folder = (place(s, ps) || s.folder || "").replace(/\/+$/, "");
    const inHome = !folder || (m === null && userHome && (low(m, folder) === low(m, userHome) || low(m, folder).startsWith(`${low(m, userHome)}/`)));
    const baseDir = inHome ? (folder ? userHome : "") : "";
    const parts = (inHome ? folder.slice(userHome.length) : folder).split("/").filter(Boolean);
    let node = root(m, inHome ? "home" : "abs", baseDir);
    parts.forEach((part, i) => {
      const k = low(m, part);
      if (!node.kids.has(k)) {
        const path = `${baseDir}/${parts.slice(0, i + 1).join("/")}`;
        node.kids.set(k, { label: part, path, id: low(m, path), machine: m, spaces: [], kids: new Map() });
      }
      node = node.kids.get(k);
    });
    node.spaces.push(s);
    return node;
  };
  // A worktree space hangs on the space of its repo's own checkout (shown with it), not in
  // the tree; with no such space it stays a folder of its own.
  const repoOf = (s) => (gitOf ? gitOf(s) : null);
  const mains = new Map(); // machine|repo -> the node of its own checkout
  const keyOf = (s) => `${s.machine ?? ""}|${repoOf(s)?.repo}`;
  for (const s of sp) {
    if (repoOf(s)?.linked) continue;
    const n = insert(s);
    if (repoOf(s) && !mains.has(keyOf(s))) { n.wsp ??= []; mains.set(keyOf(s), n); }
  }
  for (const s of sp) {
    if (!repoOf(s)?.linked) continue;
    if (mains.has(keyOf(s))) mains.get(keyOf(s)).wsp.push(s);
    else insert(s);
  }
  const squash = (n) => {
    for (const [k, c] of n.kids) n.kids.set(k, squash(c));
    while (!n.spaces.length && n.kids.size === 1 && !n.root) {
      const [c] = n.kids.values();
      n = { ...c, label: `${n.label}/${c.label}` };
    }
    return n;
  };
  const sessions = (n) => {
    const out = [];
    for (const s of n.spaces) for (const t of s.tabs ?? []) for (const p of ps) if (p.tab === t.id && p.terminal && (p.program?.agent || p.status)) out.push({ pane: p.pane, terminal: p.terminal, space: s.id, title: p.title || p.program?.name || "agent", status: p.status ?? "idle" });
    return out;
  };
  const rows = [];
  const emit = (n, depth) => {
    const kids = [...n.kids.values()].map(squash).sort((a, b) => a.label.localeCompare(b.label));
    const key = `${n.machine ?? ""}|${n.id}`;
    const own = sessions(n);
    const open = !closed.has(key);
    const row = { kind: "node", node: n, key, depth, hasKids: kids.length > 0, open, sessions: own, wsp: n.wsp ?? [], w: { machine: n.machine, id: key } };
    rows.push(row);
    if (open) kids.forEach((k) => emit(k, depth + 1));
    // The most urgent state in the folder, hidden subfolders included.
    const below = [];
    const gather = (c) => { below.push(...c.spaces.map((s) => s.status), ...(c.wsp ?? []).map((s) => s.status), ...sessions(c).map((x) => x.status)); c.kids.forEach((g) => gather(g)); };
    gather({ ...n, kids: new Map(kids.map((k) => [k.label, k])) });
    row.top = top(below);
  };
  for (const r of tries.values()) {
    const kids = [...r.kids.values()].map(squash).sort((a, b) => a.label.localeCompare(b.label));
    if (r.spaces.length) emit({ ...r, kids: new Map(kids.map((k) => [k.label, k])) }, 0);
    else kids.forEach((k) => emit(k, 0));
  }
  return rows;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    this.mock = false;
    this.hoverKey = null; // the folder under the pointer (its sessions, worktrees and + show)
    this.wts = {}; // repo -> { at, list: [{ path, branch }] } from git worktree list
    this.wtBusy = new Set();
    this.openIds = new Set(); // node keys that have a space (their worktrees are rows already)
    this.mockWts = {};
    this.mockActive = null;
    this.mockClosed = new Set();
    this.machines = [];
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.closed = new Set(JSON.parse(localStorage.getItem("tree.closed") ?? "[]"));
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    if (storybook("spaces-tree")) return;
    const due = this.due(Date.now(), spaces(), panes());
    if (due.size) this.refreshGit(due, cx);
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    if (storybook("spaces-tree")) return;
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }


  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  // Open a folder's space (the shown one when several), or make one there.
  open(node) {
    if (this.mock) { this.mockActive = (node.spaces.find((s) => s.active) ?? node.spaces[0])?.id ?? this.mockActive; return; }
    const s = node.spaces.find((x) => x.active) ?? node.spaces[0];
    if (s) run("space.select", { id: s.id });
    else run("space.new", { folder: node.path, machine: node.machine ?? "" });
  }

  // Checkouts of the folder's repo (git worktree list), asked when the pointer comes: at most
  // once per 30 s per repo.
  loadWts(node, g, cx) {
    const k = g.repo;
    const c = this.wts[k];
    if ((c && Date.now() - c.at < 30000) || this.wtBusy.has(k)) return;
    const first = node.spaces[0];
    if (!first) return;
    this.wtBusy.add(k);
    const cwd = place(first, panes());
    cx.spawn(async (cx) => {
      let list = c?.list ?? [];
      try {
        const r = await exec("git", ["--no-optional-locks", "worktree", "list", "--porcelain"], { cwd, on: node.machine });
        if (r.code === 0) {
          list = r.stdout.split("\n\n").map((blk) => {
            const lines = blk.split("\n");
            const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
            const ref = lines.find((l) => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "");
            return path && !lines.includes("bare") ? { path, branch: ref ?? "(detached)" } : null;
          }).filter(Boolean);
        }
      } catch {}
      this.wts[k] = { at: Date.now(), list };
      this.wtBusy.delete(k);
      cx.notify();
    });
  }

  // Checkouts that are neither this folder nor already a space of their own.
  worktrees(node, g, first, wsp = []) {
    if (this.mock) return this.mockWts[first.id] ?? [];
    const m = node.machine ?? null;
    const norm = (p) => (m === null ? p.toLowerCase() : p).replace(/\/+$/, "");
    const used = new Set([place(first, panes()), ...wsp.map((w) => place(w, panes()))].filter(Boolean).map(norm));
    return (this.wts[g.repo]?.list ?? []).filter((w) => !used.has(norm(w.path)) && !this.openIds.has(`${m ?? ""}|${norm(w.path)}`));
  }

  // This computer: the launcher (a space starts from a folder, not an empty shell).
  // Another machine: the launcher is local only, so it is still space.new there.
  newSpace(machine) {
    if (this.mock) return;
    if (machine) run("space.new", { machine });
    else run("mod.open", { name: "launcher" });
  }

  toggle(key, cx) {
    const set = this.mock ? this.mockClosed : this.closed;
    set.has(key) ? set.delete(key) : set.add(key);
    if (!this.mock) localStorage.setItem("tree.closed", JSON.stringify([...this.closed]));
    cx.notify();
  }

  // The tree's rows for what is on screen now (real spaces, or the story's).
  rows(view) {
    return treeRows({ ...view, closed: this.mock ? this.mockClosed : this.closed });
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const ps = panes();
    const sp = spaces();
    const git = (s) => this.git[where(s, ps)] ?? null;
    const rows = this.rows({ sp, ps, home: home(), gitOf: git });
    this.openIds = new Set(rows.filter((r) => r.kind === "node" && r.node.spaces.length).map((r) => r.key));
    const draw = (r) => this.draw(r, t, collapsed, git);
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : this.flat(rows, collapsed, draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); this.newSpace(m); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => this.newSpace(m))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      if (!collapsed && rebuilt) return [head];
      return [head, ...(folded ? [] : mine.length ? this.flat(mine, collapsed, draw) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // On the rail: one numbered entry per folder that has a space.
  flat(rows, collapsed, draw) {
    if (!collapsed) return rows.map(draw);
    return rows.filter((r) => r.kind === "node" && r.node.spaces.length).map(draw);
  }

  draw(r, t, collapsed, git) {
    if (collapsed) return this.compact(r, t);
    return this.node(r, t, git);
  }

  // Only what's unusual, after the name: "herdr · spike ↑2 ↓1". The repo or
  // branch goes when the name already says it, and master/main go: nearly every folder is on one.
  gitTail(g, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" · ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(5)
      .justify_end()
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${g.behind}`)));
  }

  // A folder, drawn like the files mod's rows. The chevron (left only) folds; the rest of
  // the row opens the folder's space, or folds when it has none.
  node(r, t, git) {
    const { node, depth, hasKids, open, key } = r;
    const hasSpace = node.spaces.length > 0;
    const on = node.spaces.some((s) => s.active);
    const first = node.spaces.find((s) => s.active) ?? node.spaces[0];
    const g = first ? git(first) : null;
    const chevron = (n) => svg(`mods/files/chevron-${open ? "down" : "right"}.svg`).size(n).flex_none().text_color(t.dim);
    const main = h_flex().id(`node-${key}`).h(28).flex_none().pl(8 + depth * STEP).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => (hasSpace ? this.open(node) : this.toggle(key, cx)))
      .on_mouse_down("right", () => { if (!this.mock && first) this.menu(first); })
      .child(hasKids
        ? div().id(`toggle-${key}`).w(16).h(22).flex_none().flex().items_center().justify_center().rounded(4)
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { cx.stop_propagation(); this.toggle(key, cx); })
          .child(chevron(12))
        : div().w(16).flex_none())
      .child(svg("mods/files/folder.svg").size(14).flex_none().text_color(hasSpace ? t.foreground : t.muted))
      .child(div().flex_shrink(0).max_w(150).truncate().text_color(hasSpace ? t.foreground : t.muted).child(node.label))
      .when(node.spaces.length > 1, (el) => el.child(div().flex_none().px(5).rounded(8).bg(t.raised).text_size(10.5).text_color(t.dim).child(String(node.spaces.length))))
      .child(g ? this.gitTail(g, node.label, t) : div().flex_1())
      .when(!open && hasKids && (r.top === "blocked" || r.top === "done"), (el) => el.child(div().flex_none().text_color(tone(t, r.top)).child(glyph(r.top))))
      // Sessions are listed only for the folder under the pointer or the shown one; the rest keep a count.
      .when(r.sessions.length > 0 && !(this.hoverKey === key || on), (el) => el.child(h_flex().flex_none().gap(4).items_center().text_size(11).text_color(t.dim)
        .child(div().size(6).rounded(3).bg(tone(t, top(r.sessions.map((x) => x.status)))))
        .child(String(r.sessions.length))))
      .when(this.hoverKey === key && Boolean(first), (el) => el.child(div().id(`add-${key}`).size(20).flex_none().flex().items_center().justify_center().rounded(5)
        .text_color(t.dim).hover((s) => s.bg(t.raised).text_color(t.foreground))
        .tooltip("New Claude session here")
        .on_click((_e, cx) => { cx.stop_propagation(); if (!this.mock) run("tab.new", { space: first.id, folder: node.path, argv: ["claude"] }); })
        .child(svg("mods/workspace-chrome/plus.svg").size(12))));
    const sessions = r.sessions;
    const hot = this.hoverKey === key;
    const wsp = r.wsp ?? [];
    const listed = hot || on;
    const wtOn = wsp.some((x) => x.active);
    const wts = hot && g && first ? this.worktrees(node, g, first, wsp) : [];
    return v_flex().id(`block-${key}`).flex_none()
      .on_hover((hovered, cx) => {
        if (hovered) {
          this.hoverKey = key;
          if (g && !this.mock) this.loadWts(node, g, cx);
        } else if (this.hoverKey === key) this.hoverKey = null;
        cx.notify();
      })
      .child(main)
      .when(listed && sessions.length > 0, (el) => el.children(sessions.map((x) => this.session(x, depth + 1, t))))
      // Worktrees of this repo, under its own checkout: the ones that are spaces (always while
      // one is shown, else on hover), then checkouts with no space yet, then "New worktree".
      .when((hot || wtOn) && wsp.length > 0, (el) => el.children(wsp.map((w) => this.worktreeSpace(w, git(w), depth + 1, t))))
      .when(hot && Boolean(g && first), (el) => el.children([
        ...wts.map((w) => this.worktree(w, node, depth + 1, t)),
        this.worktreeNew(node, first, depth + 1, t),
      ]));
  }

  // A worktree that is a space: branch icon, its branch, a state dot (sessions have only a dot).
  worktreeSpace(w, g, depth, t) {
    const status = w.status;
    return h_flex().id(`wtsp-${w.id}`).h(24).flex_none().pl(8 + depth * STEP + 20).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .text_size(12).text_color(t.foreground)
      .on_click(() => { if (this.mock) this.mockActive = w.id; else run("space.select", { id: w.id }); })
      .on_mouse_down("right", () => { if (!this.mock) this.menu(w); })
      .child(svg("mods/workspace-chrome/branch.svg").size(12).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().child(g?.branch ?? w.name))
      .when(Boolean(status) && status !== "idle", (el) => el.child(div().size(6).rounded(3).flex_none().bg(tone(t, status))));
  }

  // A checkout of the repo with no space yet: branch icon (sessions have a dot).
  worktree(w, node, depth, t) {
    return h_flex().id(`wt-${node.id}-${w.path}`).h(24).flex_none().pl(8 + depth * STEP + 20).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover)).text_size(12).text_color(t.dim)
      .tooltip(w.path)
      .on_click(() => { if (!this.mock) run("space.new", { folder: w.path, machine: node.machine ?? "" }); })
      .child(svg("mods/workspace-chrome/branch.svg").size(12).flex_none())
      .child(div().flex_1().min_w(0).truncate().child(w.branch));
  }

  worktreeNew(node, first, depth, t) {
    return h_flex().id(`wt-new-${node.id}`).h(24).flex_none().pl(8 + depth * STEP + 20).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).text_size(12).text_color(t.dim)
      .on_click(() => { if (!this.mock) openOverlay({ mod: "worktree", kind: "dialog", width: 440, height: 260, props: { space: first.id, action: "new" } }); })
      .child(svg("mods/workspace-chrome/plus.svg").size(12).flex_none())
      .child(div().flex_1().min_w(0).truncate().child("New worktree"));
  }

  // An agent session in the folder above it.
  session(r, depth, t) {
    return h_flex().id(`session-${r.pane}`).h(24).flex_none().pl(8 + depth * STEP + 23).pr(8).gap(7).items_center().rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .text_size(12).text_color(t.muted)
      .on_click(() => {
        if (this.mock) return;
        run("space.select", { id: r.space });
        run("pane.focus", { terminal: r.terminal });
      })
      .child(div().w(6).h(6).rounded(3).flex_none().bg(tone(t, r.status)))
      .child(div().flex_1().min_w(0).truncate().child(r.title));
  }

  compact(r, t) {
    const sps = r.node.spaces;
    const w = sps.find((s) => s.active) ?? sps[0];
    const index = (this.mock ? [] : spaces()).findIndex((s) => s.id === w.id);
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .flex_none()
      .justify_center()
      .gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.open(r.node))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(index >= 0 ? index + 1 : "·")))
      .child(div().text_color(tone(t, r.top ?? w.status)).child(glyph(r.top ?? w.status)));
  }

  frame(t, collapsed, children) {
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!collapsed, el => el.child("Spaces"))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => { if (!this.mock) run("mod.open", { name: "launcher" }); }).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().id("spaces-tree-list").flex_1().min_h(0).px(8).pb(14).overflow_y_scrollbar().mode("always").children(children));
  }

  // モック描画: 本番データ・コマンド・共有状態に触れない。
  renderMock(values) {
    const sb = { ...DEFAULTS, ...values };
    const t = theme();
    this.mock = true;
    const collapsed = !!sb.narrow;
    const view = MOCK.data(sb);
    this.mockWts = view.wts;
    view.gitOf = (s) => view.git[s.id] ?? null;
    this.mockActive ??= view.sp.find((s) => !s.machine)?.id ?? null;
    view.sp.forEach((s) => { s.active = s.id === this.mockActive; });
    // 折りたたみ: 展開状態の行から、サブフォルダを持つ行をすべて閉じて作り直す
    let rows = treeRows({ ...view, closed: this.mockClosed });
    if (sb.closed) rows = treeRows({ ...view, closed: new Set(rows.filter((r) => r.kind === "node" && r.hasKids).map((r) => r.key)) });
    // ホバー表示の確認用: 先頭のセッションありフォルダをポインタ下にあるものとして扱う
    if (sb.hover && !this.hoverKey) this.hoverKey = rows.find((r) => r.kind === "node" && r.sessions.length)?.key ?? null;
    const draw = (r) => this.draw(r, t, collapsed, (s) => view.git[s.id] ?? null);
    const section = (m, label, mine) => [
      h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(label)))
        .child(div().size(6).rounded(3).flex_none().bg(t.ansi2)),
      ...(mine.length ? this.flat(mine, collapsed, draw) : [h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).items_center().rounded(7).text_size(12).text_color(t.dim).child(collapsed ? "+" : "New space there")]),
    ];
    const local = rows.filter((r) => !r.w.machine);
    const children = sb.remote
      ? [...section(null, "This computer", local), ...section("build-server", "build-server", rows.filter((r) => r.w.machine))]
      : local.length ? this.flat(local, collapsed, draw) : [h_flex().id("machine-new-local").h(28).flex_none().px(8).items_center().rounded(7).text_size(12).text_color(t.dim).child(collapsed ? "+" : "New space there")];
    return this.frame(t, collapsed, children);
  }

  render() {
    if (storybook("spaces-tree")) return this.renderMock(storybook("spaces-tree"));
    this.mock = false;
    const t = theme();
    const collapsed = narrow();
    return this.frame(t, collapsed, this.grouped(t, collapsed));
  }
}
