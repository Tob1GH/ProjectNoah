// ---------- Login ----------

const AUTH = { user: "admin@library.com", pass: "ANG SARAP KO" };
const SESSION = "library_auth";
const isAuthed = () => { try { return sessionStorage.getItem(SESSION) === "1" } catch { return false } };
function showApp(on) {
  document.getElementById("login").classList.toggle("hidden", on);
  document.getElementById("appShell").classList.toggle("hidden", !on);
  if (on) window.scrollTo(0, 0); else document.getElementById("uPass").value = "";
}
document.getElementById("loginForm").onsubmit = e => {
  e.preventDefault();
  const u = document.getElementById("uEmail").value.trim(), p = document.getElementById("uPass").value;
  if (u.toLowerCase() === AUTH.user && p === AUTH.pass) {
    try { sessionStorage.setItem(SESSION, "1") } catch {}
    document.getElementById("loginErr").textContent = "";
    showApp(true);
  } else {
    document.getElementById("loginErr").textContent = "Incorrect username or password.";
    document.getElementById("uPass").select();
  }
};
document.getElementById("pwToggle").onclick = e => {
  const i = document.getElementById("uPass"), show = i.type === "password";
  i.type = show ? "text" : "password";
  e.target.textContent = show ? "Hide" : "Show"; e.target.setAttribute("aria-pressed", show);
};
document.getElementById("logout").onclick = () => { try { sessionStorage.removeItem(SESSION) } catch {} showApp(false); };
showApp(isAuthed());

// ---------- Storage ----------
const KEY = "library_v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } };
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const day = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

let db = load() || {
  books: [
    { id: 1, title: "Noli Me Tangere", author: "Jose Rizal", isbn: "9780143039693", category: "Fiction", copies: 3 },
    { id: 2, title: "Clean Code", author: "Robert C. Martin", isbn: "9780132350884", category: "Technology", copies: 2 },
    { id: 3, title: "Sapiens", author: "Yuval Noah Harari", isbn: "9780062316110", category: "History", copies: 1 }
  ],
  members: [{ id: 1, name: "Maria Santos", email: "maria@example.com" }],
  loans: []
};

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nextId = list => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
const today = () => day(0);
const isOverdue = l => !l.returned && l.due < today();
const onLoan = bookId => db.loans.filter(l => l.bookId === bookId && !l.returned).length;
const available = b => b.copies - onLoan(b.id);
const colorFor = cat => { let h = 0; for (const ch of (cat || "x")) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 45% 42%)`; };
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), 2200);
}

// ---------- Render ----------
function renderStats() {
  const active = db.loans.filter(l => !l.returned);
  const overdue = active.filter(isOverdue).length;
  const copies = db.books.reduce((a, b) => a + b.copies, 0);
  $("stats").innerHTML = [
    [db.books.length, "Titles"], [copies, "Total copies"], [db.members.length, "Members"],
    [active.length, "On loan"], [overdue, "Overdue", overdue ? "bad" : ""]
  ].map(([n, label, cls]) => `<div class="stat ${cls || ""}"><b>${n}</b><span>${label}</span></div>`).join("");
}

function renderBooks() {
  const q = $("bookSearch").value.trim().toLowerCase();
  const list = db.books.filter(b => [b.title, b.author, b.isbn].join(" ").toLowerCase().includes(q));
  $("bookRows").innerHTML = list.map(b => {
    const a = available(b);
    return `<tr>
      <td class="title" style="--c:${colorFor(b.category)}">${esc(b.title)}</td>
      <td>${esc(b.author)}</td><td>${esc(b.isbn || "-")}</td><td>${esc(b.category || "-")}</td>
      <td><span class="pill ${a > 0 ? "ok" : "out"}">${a} of ${b.copies}</span></td>
      <td class="act"><button class="link del" data-del-book="${b.id}">Delete</button></td></tr>`;
  }).join("");
  $("bookEmpty").classList.toggle("hidden", list.length > 0);
  $("bookEmpty").textContent = db.books.length ? "No books match your search." : "No books yet. Add your first book above.";
}

function renderMembers() {
  $("memberRows").innerHTML = db.members.map(m => {
    const n = db.loans.filter(l => l.memberId === m.id && !l.returned).length;
    return `<tr><td class="title">${esc(m.name)}</td><td>${esc(m.email)}</td><td>${n}</td>
      <td class="act"><button class="link del" data-del-member="${m.id}">Remove</button></td></tr>`;
  }).join("");
  $("memberEmpty").classList.toggle("hidden", db.members.length > 0);
}

function renderLoanForm() {
  const avail = db.books.filter(b => available(b) > 0);
  $("lBook").innerHTML = `<option value="">Select a book</option>` + avail.map(b => `<option value="${b.id}">${esc(b.title)} (${available(b)} left)</option>`).join("");
  $("lMember").innerHTML = `<option value="">Select a member</option>` + db.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  if (!$("lDue").value) $("lDue").value = day(14);
}

function renderLoans() {
  const f = $("loanFilter").value;
  const list = [...db.loans].reverse().filter(l => f === "all" || (f === "active" ? !l.returned : l.returned));
  $("loanRows").innerHTML = list.map(l => {
    const b = db.books.find(x => x.id === l.bookId), m = db.members.find(x => x.id === l.memberId);
    const status = l.returned ? `<span class="pill done">Returned ${esc(l.returned)}</span>`
      : isOverdue(l) ? `<span class="pill late">Overdue</span>` : `<span class="pill ok">On loan</span>`;
    return `<tr><td class="title" style="--c:${colorFor(b?.category)}">${esc(b?.title || "Deleted book")}</td>
      <td>${esc(m?.name || "Removed member")}</td><td>${l.issued}</td><td>${l.due}</td><td>${status}</td>
      <td class="act">${l.returned ? "" : `<button class="link" data-return="${l.id}">Return</button>`}</td></tr>`;
  }).join("");
  $("loanEmpty").classList.toggle("hidden", list.length > 0);
}

function renderAll() { renderStats(); renderBooks(); renderMembers(); renderLoanForm(); renderLoans(); }

// ---------- Events ----------
$("tabs").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("hidden", t.id !== "tab-" + b.dataset.tab));
};

$("bookForm").onsubmit = e => {
  e.preventDefault();
  db.books.push({ id: nextId(db.books), title: $("bTitle").value.trim(), author: $("bAuthor").value.trim(),
    isbn: $("bIsbn").value.trim(), category: $("bCat").value.trim(), copies: Math.max(1, +$("bCopies").value || 1) });
  save(); e.target.reset(); $("bCopies").value = 1; renderAll(); toast("Book added");
};

$("memberForm").onsubmit = e => {
  e.preventDefault();
  db.members.push({ id: nextId(db.members), name: $("mName").value.trim(), email: $("mEmail").value.trim() });
  save(); e.target.reset(); renderAll(); toast("Member added");
};

$("loanForm").onsubmit = e => {
  e.preventDefault();
  const bookId = +$("lBook").value, memberId = +$("lMember").value;
  if (!bookId || !memberId) return toast("Select a book and a member");
  if ($("lDue").value < today()) return toast("Due date must be today or later");
  db.loans.push({ id: nextId(db.loans), bookId, memberId, issued: today(), due: $("lDue").value, returned: null });
  save(); $("lDue").value = day(14); renderAll(); toast("Book issued");
};

document.body.addEventListener("click", e => {
  const t = e.target;
  if (t.dataset.return) {
    db.loans.find(l => l.id === +t.dataset.return).returned = today();
    save(); renderAll(); toast("Book returned");
  } else if (t.dataset.delBook) {
    const id = +t.dataset.delBook;
    if (onLoan(id)) return toast("Return all copies before deleting this book");
    if (confirm("Delete this book?")) { db.books = db.books.filter(b => b.id !== id); save(); renderAll(); }
  } else if (t.dataset.delMember) {
    const id = +t.dataset.delMember;
    if (db.loans.some(l => l.memberId === id && !l.returned)) return toast("This member still has books on loan");
    if (confirm("Remove this member?")) { db.members = db.members.filter(m => m.id !== id); save(); renderAll(); }
  }
});

$("bookSearch").oninput = renderBooks;
$("loanFilter").onchange = renderLoans;
renderAll();