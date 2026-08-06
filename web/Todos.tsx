import { useCallback, useEffect, useState } from "react";
import { api, type Todo } from "./api";

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setTodos(await api<Todo[]>("/api/todos"));
      setStatus("");
    } catch (err) {
      setStatus(`Errore nel caricamento: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (err) {
      setStatus(`Errore: ${(err as Error).message}`);
    }
  }

  return (
    <section className="card">
      <h2>Todo</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          void run(async () => {
            await api("/api/todos", { method: "POST", body: JSON.stringify({ title: trimmed }) });
            setTitle("");
          });
        }}
      >
        <input
          type="text"
          placeholder="Cosa devi fare?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <button type="submit">Aggiungi</button>
      </form>
      {status && <p className="status">{status}</p>}
      <ul className="todo-list">
        {todos.map((t) => (
          <li key={t.id} className={t.completed ? "completed" : ""}>
            <input
              type="checkbox"
              checked={t.completed}
              onChange={(e) =>
                void run(() =>
                  api(`/api/todos/${t.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ completed: e.target.checked }),
                  })
                )
              }
            />
            <span>{t.title}</span>
            <button type="button" onClick={() => void run(() => api(`/api/todos/${t.id}`, { method: "DELETE" }))}>
              Elimina
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
