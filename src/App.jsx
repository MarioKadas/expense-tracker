import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "expense-tracker:v1";
const CATEGORIES = ["Food", "Transport", "Housing", "Utilities", "Health", "Entertainment", "Shopping", "Other"];
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });
const today = () => new Date().toISOString().slice(0, 10);
const newId = () => crypto.randomUUID();

function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Returns a cleaned expense, or null if the row is invalid.
function sanitize(row) {
  const amount = Number(row?.amount);
  const date = String(row?.date ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return null;
  return {
    id: typeof row.id === "string" && row.id ? row.id : newId(),
    amount: Math.round(amount * 100) / 100,
    category: CATEGORIES.includes(row.category) ? row.category : "Other",
    date,
  };
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [expenses, setExpenses] = useState(loadExpenses);
  const [form, setForm] = useState({ amount: "", category: CATEGORIES[0], date: today() });
  const [filter, setFilter] = useState("All");
  const [message, setMessage] = useState(null); // { type: "ok" | "error", text }
  const fileInput = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    } catch {
      /* storage full or unavailable: the app still works in memory */
    }
  }, [expenses]);

  const visible = useMemo(
    () =>
      expenses
        .filter((e) => filter === "All" || e.category === filter)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, filter]
  );

  const total = visible.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = useMemo(() => {
    const totals = {};
    for (const e of expenses) totals[e.category] = (totals[e.category] || 0) + e.amount;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const grandTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  function addExpense(e) {
    e.preventDefault();
    const expense = sanitize({ ...form, id: newId() });
    if (!expense) {
      setMessage({ type: "error", text: "Enter an amount above 0 and a valid date." });
      return;
    }
    setExpenses((prev) => [expense, ...prev]);
    setForm((f) => ({ ...f, amount: "" }));
    setMessage(null);
  }

  function removeExpense(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  function exportJson() {
    download(`expenses-${today()}.json`, JSON.stringify(expenses, null, 2), "application/json");
  }

  function exportCsv() {
    const rows = ["date,category,amount", ...expenses.map((e) => `${e.date},${e.category},${e.amount.toFixed(2)}`)];
    download(`expenses-${today()}.csv`, rows.join("\n"), "text/csv");
  }

  async function importJson(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error("not an array");
      const valid = data.map(sanitize).filter(Boolean);
      const existing = new Set(expenses.map((x) => x.id));
      const fresh = valid.filter((x) => !existing.has(x.id));
      setExpenses((prev) => [...fresh, ...prev]);
      const skipped = data.length - fresh.length;
      setMessage({
        type: "ok",
        text: `Imported ${fresh.length} expense${fresh.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} invalid or duplicate` : ""}.`,
      });
    } catch {
      setMessage({ type: "error", text: "Couldn’t import that file. Choose a JSON file exported from this app." });
    }
  }

  return (
    <main className="page">
      <header className="total">
        <p className="total-label">{filter === "All" ? "Total spent" : `Total spent on ${filter}`}</p>
        <p className="total-amount">{money.format(total)}</p>
        <p className="total-meta">
          {visible.length} expense{visible.length === 1 ? "" : "s"}
        </p>
      </header>

      <form className="add" onSubmit={addExpense}>
        <label>
          Amount
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </label>
        <button type="submit" className="primary">Add expense</button>
      </form>

      {message && (
        <p className={`notice ${message.type}`} role="status">
          {message.text}
        </p>
      )}

      {byCategory.length > 0 && (
        <section className="breakdown" aria-label="Spending by category">
          {byCategory.map(([cat, amt]) => (
            <div key={cat} className="bar-row">
              <span>{cat}</span>
              <div className="bar" aria-hidden="true">
                <div style={{ width: `${(amt / grandTotal) * 100}%` }} />
              </div>
              <span className="num">{money.format(amt)}</span>
            </div>
          ))}
        </section>
      )}

      <section className="list-section">
        <div className="list-head">
          <h2>Expenses</h2>
          <select aria-label="Filter by category" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="empty">
            {expenses.length === 0
              ? "No expenses yet. Add your first one above, or import a file below."
              : `No expenses in ${filter}.`}
          </p>
        ) : (
          <ul className="list">
            {visible.map((e) => (
              <li key={e.id}>
                <span className="date">{e.date}</span>
                <span className="cat">{e.category}</span>
                <span className="num">{money.format(e.amount)}</span>
                <button className="ghost" onClick={() => removeExpense(e.id)} aria-label={`Delete ${e.category} expense from ${e.date}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="data">
        <h2>My data</h2>
        <p>Expenses are saved in this browser's local storage. Export a copy to back up or move to another device.</p>
        <div className="data-actions">
          <button onClick={exportJson} disabled={!expenses.length}>Export JSON</button>
          <button onClick={exportCsv} disabled={!expenses.length}>Export CSV</button>
          <button onClick={() => fileInput.current.click()}>Import JSON</button>
          <input ref={fileInput} type="file" accept="application/json,.json" onChange={importJson} hidden />
        </div>
      </footer>
    </main>
  );
}
