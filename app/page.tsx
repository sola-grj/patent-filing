import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

type Todo = {
  id: number;
  name: string;
  description: string | null;
  is_complete: boolean;
  created_at: string;
};

async function TodoList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("todos")
    .select("id, name, description, is_complete, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return <p className="text-sm text-red-600">{error.message}</p>;
  }

  const todos = (data ?? []) as Todo[];

  if (!todos.length) {
    return <p className="text-sm text-muted-foreground">No todos found.</p>;
  }

  return (
    <ul className="space-y-4">
      {todos.map((todo) => (
        <li key={todo.id} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold text-lg">{todo.name}</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                todo.is_complete
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {todo.is_complete ? "Done" : "Pending"}
            </span>
          </div>
          {todo.description ? (
            <p className="mt-2 text-sm text-muted-foreground">{todo.description}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">
          Remote Supabase Demo
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Patent Filing Todos
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This page reads test rows directly from your hosted Supabase project.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading todos...</p>}>
        <TodoList />
      </Suspense>
    </main>
  );
}
