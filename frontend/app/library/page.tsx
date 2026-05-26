"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createBook,
  createReadingLog,
  getBooks,
  getLibraryRecommendations,
  getLibrarySummary,
  updateBook,
  updateChapter,
  type Book,
  type BookInput,
  type BookStatus,
  type LibrarySummary,
  type SuggestedBook,
} from "@/lib/api";

type BookDraft = {
  title: string;
  author: string;
  category: string;
  totalPages: string;
  status: BookStatus;
  liked: boolean;
  purchaseDate: string;
  purchasePrice: string;
};

const emptyDraft: BookDraft = {
  title: "",
  author: "",
  category: "Software Development",
  totalPages: "",
  status: "yet_to_start",
  liked: false,
  purchaseDate: "",
  purchasePrice: "",
};

const statusLabels: Record<BookStatus, string> = {
  yet_to_start: "Yet to start",
  reading: "Reading",
  read: "Read",
};

const statusClasses: Record<BookStatus, string> = {
  yet_to_start: "bg-amber-100 text-amber-800",
  reading: "bg-teal-100 text-teal-800",
  read: "bg-emerald-100 text-emerald-800",
};

const categoryOptions = [
  "Software Development",
  "Technical",
  "Philosophy",
  "Psychology",
  "Productivity",
  "Biography",
  "Fiction",
  "General",
];

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [summary, setSummary] = useState<LibrarySummary | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [draft, setDraft] = useState<BookDraft>(emptyDraft);
  const [pagesByBook, setPagesByBook] = useState<Record<string, string>>({});
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadLibrary() {
    setError(null);
    const [nextBooks, nextSummary, nextSuggestions] = await Promise.all([
      getBooks(),
      getLibrarySummary(),
      getLibraryRecommendations(),
    ]);
    setBooks(nextBooks);
    setSummary(nextSummary);
    setSuggestions(nextSuggestions);
  }

  useEffect(() => {
    loadLibrary()
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const unreadBooks = useMemo(() => books.filter((book) => book.status !== "read"), [books]);
  const recentPurchases = useMemo(
    () =>
      [...books]
        .filter((book) => book.purchase_date)
        .sort((a, b) => new Date(b.purchase_date ?? "").getTime() - new Date(a.purchase_date ?? "").getTime())
        .slice(0, 4),
    [books],
  );
  const maxDailyPages = Math.max(1, ...(summary?.daywise_pages.map((day) => day.pages) ?? [1]));

  async function handleCreateBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || isSaving) return;

    const payload: BookInput = {
      title: draft.title.trim(),
      author: draft.author.trim() || null,
      category: draft.category.trim() || "General",
      total_pages: Number(draft.totalPages) || 0,
      status: draft.status,
      liked: draft.liked,
      purchase_date: draft.purchaseDate ? new Date(`${draft.purchaseDate}T00:00:00`).toISOString() : null,
      purchase_price: draft.purchasePrice ? Number(draft.purchasePrice) : null,
    };

    try {
      setIsSaving(true);
      setError(null);
      const created = await createBook(payload);
      await loadLibrary();
      setExpandedBookId(created.id);
      setDraft(emptyDraft);
      setIsAddOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add book");
    } finally {
      setIsSaving(false);
    }
  }

  async function patchBook(book: Book, changes: Partial<BookInput>) {
    const previous = books;
    setBooks((current) => current.map((item) => (item.id === book.id ? { ...item, ...changes } : item)));
    try {
      await updateBook(book.id, changes);
      const nextSummary = await getLibrarySummary();
      setSummary(nextSummary);
    } catch (err) {
      setBooks(previous);
      setError(err instanceof Error ? err.message : "Could not update book");
    }
  }

  async function toggleChapter(bookId: string, chapterId: string, resonated: boolean) {
    const previous = books;
    setBooks((current) =>
      current.map((book) =>
        book.id === bookId
          ? {
              ...book,
              chapters: book.chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, resonated } : chapter)),
            }
          : book,
      ),
    );

    try {
      await updateChapter(chapterId, resonated);
    } catch (err) {
      setBooks(previous);
      setError(err instanceof Error ? err.message : "Could not update chapter");
    }
  }

  async function logPages(book: Book) {
    const pages = Number(pagesByBook[book.id]);
    if (!pages || pages < 1) return;

    try {
      await createReadingLog({ book_id: book.id, pages_read: pages });
      setPagesByBook((current) => ({ ...current, [book.id]: "" }));
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log reading");
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f6f3] text-stone-950">
      <section className="relative overflow-hidden border-b border-stone-200">
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_18%_18%,rgba(20,184,166,0.24),transparent_30%),radial-gradient(circle_at_78%_12%,rgba(251,146,60,0.24),transparent_28%),linear-gradient(135deg,#fff8ed_0%,#effbf7_58%,#f7edf6_100%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-5 pb-8 pt-8 md:grid-cols-[1.05fr_0.95fr] md:px-8 md:pb-12 md:pt-12">
          <div className="flex min-h-[360px] flex-col justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-stone-200 bg-white/70 px-4 py-2 text-sm font-medium text-stone-700 shadow-sm backdrop-blur">
                Personal Library
              </div>
              <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-tight text-stone-950 md:text-7xl">
                Track the shelf you are becoming.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
                Log purchases, reading momentum, resonant chapters, and the books waiting their turn.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-stone-900/20 transition hover:-translate-y-0.5 hover:bg-stone-800"
              >
                Add Book
              </button>
              <a
                href="#reading-list"
                className="rounded-full border border-stone-300 bg-white/70 px-6 py-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-white"
              >
                View Shelf
              </a>
            </div>
          </div>

          <div className="grid content-end gap-4">
            <div className="rounded-lg border border-white/70 bg-white/75 p-5 shadow-xl shadow-stone-900/10 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-stone-500">Library health</p>
                  <p className="mt-2 text-5xl font-semibold text-stone-950">{summary?.total_books ?? 0}</p>
                </div>
                <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-800">
                  {summary?.reading_books ?? 0} reading
                </span>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <HeroMetric label="Read" value={summary?.read_books ?? 0} />
                <HeroMetric label="Liked" value={summary?.liked_books ?? 0} />
                <HeroMetric label="Queued" value={summary?.yet_to_start_books ?? 0} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-stone-950 p-5 text-white shadow-xl shadow-stone-900/15">
                <p className="text-sm text-stone-300">Pages Today</p>
                <p className="mt-2 text-3xl font-semibold">{summary?.pages_today ?? 0}</p>
              </div>
              <div className="rounded-lg bg-teal-600 p-5 text-white shadow-xl shadow-teal-900/15">
                <p className="text-sm text-teal-50">This Week</p>
                <p className="mt-2 text-3xl font-semibold">{summary?.pages_this_week ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Reading rhythm</p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-950">Daily pages</h2>
            </div>
            <p className="text-sm text-stone-600">
              Current areas: {summary?.current_categories.length ? summary.current_categories.join(", ") : "No active category yet"}
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-stone-200 bg-white/80 p-5 shadow-sm">
            <div className="flex h-56 items-end gap-3">
              {(summary?.daywise_pages ?? []).map((day) => (
                <div key={day.date} className="flex h-full flex-1 flex-col justify-end gap-2">
                  <div className="flex flex-1 items-end rounded-md bg-stone-100">
                    <div
                      className="w-full rounded-md bg-gradient-to-t from-teal-600 to-orange-300"
                      style={{ height: `${Math.max(7, (day.pages / maxDailyPages) * 100)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-stone-950">{day.pages}</p>
                    <p className="mt-1 text-[11px] text-stone-500">{formatShortDay(day.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error ? <p className="mt-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p> : null}

          <div id="reading-list" className="mt-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Owned books</p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-950">Reading list</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsAddOpen(true)}
              className="w-fit rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
            >
              Add Book
            </button>
          </div>

          {isLoading ? <p className="mt-8 rounded-lg bg-white/80 p-6 text-sm text-stone-500">Loading library...</p> : null}

          {!isLoading && books.length === 0 ? (
            <div className="mt-8 rounded-lg border border-dashed border-stone-300 bg-white/70 p-10 text-center">
              <h3 className="text-xl font-semibold text-stone-950">Your shelf is ready</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">
                Add your first book. The API will generate chapters so you can mark the ideas that stay with you.
              </p>
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                className="mt-6 rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Add Book
              </button>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            {books.map((book) => {
              const isExpanded = expandedBookId === book.id;
              const resonantCount = book.chapters.filter((chapter) => chapter.resonated).length;
              return (
                <article key={book.id} className="rounded-lg border border-stone-200 bg-white/85 p-5 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[book.status]}`}>
                          {statusLabels[book.status]}
                        </span>
                        {book.liked ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Liked</span> : null}
                      </div>
                      <h3 className="mt-3 text-2xl font-semibold text-stone-950">{book.title}</h3>
                      <p className="mt-1 text-sm text-stone-600">
                        {[book.author, book.category, book.total_pages ? `${book.total_pages} pages` : null].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-2 text-sm text-stone-500">
                        Bought {book.purchase_date ? formatDate(book.purchase_date) : "date not logged"}
                        {typeof book.purchase_price === "number" ? ` for ${formatCurrency(book.purchase_price)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(statusLabels) as BookStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => patchBook(book, { status })}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                            book.status === status ? "bg-stone-950 text-white" : "border border-stone-200 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          {statusLabels[status]}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => patchBook(book, { liked: !book.liked })}
                        className="rounded-full border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 transition hover:bg-stone-50"
                      >
                        {book.liked ? "Unlike" : "Like"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="numeric"
                        value={pagesByBook[book.id] ?? ""}
                        onChange={(event) => setPagesByBook((current) => ({ ...current, [book.id]: event.target.value }))}
                        placeholder="Pages read today"
                        className="w-full rounded-md border border-stone-300 px-4 py-3 text-sm outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4 md:max-w-xs"
                      />
                      <button
                        type="button"
                        onClick={() => logPages(book)}
                        className="rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700"
                      >
                        Log
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedBookId(isExpanded ? null : book.id)}
                      className="rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                    >
                      {isExpanded ? "Hide chapters" : `Chapters (${resonantCount}/${book.chapters.length})`}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="mt-5 grid gap-2 border-t border-stone-100 pt-5 md:grid-cols-2">
                      {book.chapters.map((chapter) => (
                        <label key={chapter.id} className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50/70 p-3">
                          <input
                            type="checkbox"
                            checked={chapter.resonated}
                            onChange={(event) => toggleChapter(book.id, chapter.id, event.target.checked)}
                            className="mt-1 h-4 w-4 accent-teal-600"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-stone-950">
                              {chapter.position}. {chapter.title}
                            </span>
                            <span className="mt-1 block text-xs text-stone-500">Mark this if the chapter resonated.</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-stone-200 bg-white/80 p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Remaining</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">{unreadBooks.length} books waiting</h2>
            <div className="mt-4 space-y-3">
              {unreadBooks.slice(0, 5).map((book) => (
                <div key={book.id} className="border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-semibold text-stone-950">{book.title}</p>
                  <p className="mt-1 text-xs text-stone-500">{book.category}</p>
                </div>
              ))}
              {unreadBooks.length === 0 ? <p className="text-sm text-stone-500">No unread books right now.</p> : null}
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white/80 p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">AI next buys</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">Suggested books</h2>
            <div className="mt-4 space-y-4">
              {suggestions.map((book) => (
                <div key={`${book.title}-${book.author}`} className="rounded-md bg-stone-50 p-4">
                  <p className="text-sm font-semibold text-stone-950">{book.title}</p>
                  <p className="mt-1 text-xs text-stone-500">{[book.author, book.category].filter(Boolean).join(" · ")}</p>
                  <p className="mt-3 text-sm leading-6 text-stone-600">{book.reason}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-stone-200 bg-white/80 p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Recent purchases</p>
            <div className="mt-4 space-y-3">
              {recentPurchases.map((book) => (
                <div key={book.id} className="flex items-center justify-between gap-4 border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-stone-950">{book.title}</p>
                    <p className="mt-1 text-xs text-stone-500">{formatDate(book.purchase_date ?? "")}</p>
                  </div>
                  <p className="text-sm font-semibold text-stone-700">
                    {typeof book.purchase_price === "number" ? formatCurrency(book.purchase_price) : "-"}
                  </p>
                </div>
              ))}
              {recentPurchases.length === 0 ? <p className="text-sm text-stone-500">Purchase history will appear here.</p> : null}
            </div>
          </section>
        </aside>
      </section>

      {isAddOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-950/45 px-5 py-8 backdrop-blur-sm">
          <form onSubmit={handleCreateBook} className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-2xl shadow-stone-950/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">New book</p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-950">Add Book</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-stone-200 text-xl leading-none text-stone-500 transition hover:bg-stone-50 hover:text-stone-950"
                aria-label="Close"
              >
                x
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Title">
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  autoFocus
                  className="field-input"
                  required
                />
              </Field>
              <Field label="Author">
                <input
                  value={draft.author}
                  onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                  className="field-input"
                >
                  {categoryOptions.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </Field>
              <Field label="Total pages">
                <input
                  inputMode="numeric"
                  value={draft.totalPages}
                  onChange={(event) => setDraft((current) => ({ ...current, totalPages: event.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Bought on">
                <input
                  type="date"
                  value={draft.purchaseDate}
                  onChange={(event) => setDraft((current) => ({ ...current, purchaseDate: event.target.value }))}
                  className="field-input"
                />
              </Field>
              <Field label="Purchase price">
                <input
                  inputMode="decimal"
                  value={draft.purchasePrice}
                  onChange={(event) => setDraft((current) => ({ ...current, purchasePrice: event.target.value }))}
                  className="field-input"
                  placeholder="0.00"
                />
              </Field>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {(Object.keys(statusLabels) as BookStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, status }))}
                  className={`rounded-md border p-4 text-left transition ${
                    draft.status === status ? "border-teal-600 bg-teal-50" : "border-stone-200 bg-white hover:bg-stone-50"
                  }`}
                >
                  <span className="font-semibold text-stone-950">{statusLabels[status]}</span>
                </button>
              ))}
            </div>

            <label className="mt-5 flex items-center gap-3 text-sm font-semibold text-stone-700">
              <input
                type="checkbox"
                checked={draft.liked}
                onChange={(event) => setDraft((current) => ({ ...current, liked: event.target.checked }))}
                className="h-4 w-4 accent-teal-600"
              />
              I already know I like this book
            </label>

            <div className="mt-6 rounded-md bg-teal-50 p-4 text-sm leading-6 text-teal-900">
              Saving calls the backend, which asks OpenAI for chapter titles and stores them with the book.
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                disabled={isSaving || !draft.title.trim()}
                className="rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {isSaving ? "Generating chapters..." : "Add Book"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function HeroMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white p-3">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function formatShortDay(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
