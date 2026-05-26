"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addChapter,
  createBook,
  createReadingLog,
  deleteBookChapters,
  deleteChapter,
  getBooks,
  getLibraryRecommendations,
  getLibrarySummary,
  getNextReadingBooks,
  regenerateChapters,
  updateBook,
  updateChapter,
  type Book,
  type BookInput,
  type BookStatus,
  type LibrarySummary,
  type OwnedBookRecommendation,
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
  category: "",
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
  "",
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
  const [nextReadingBooks, setNextReadingBooks] = useState<OwnedBookRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [draft, setDraft] = useState<BookDraft>(emptyDraft);
  const [pagesByBook, setPagesByBook] = useState<Record<string, string>>({});
  const [chapterByBook, setChapterByBook] = useState<Record<string, string>>({});
  const [queuedBookIds, setQueuedBookIds] = useState<Record<string, boolean>>({});
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadLibrary() {
    setError(null);
    const [nextBooks, nextSummary, nextSuggestions, nextOwnedReads] = await Promise.all([
      getBooks(),
      getLibrarySummary(),
      getLibraryRecommendations(),
      getNextReadingBooks(),
    ]);
    setBooks(nextBooks);
    setSummary(nextSummary);
    setSuggestions(nextSuggestions);
    setNextReadingBooks(nextOwnedReads);
  }

  useEffect(() => {
    loadLibrary()
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const readingBooks = useMemo(() => books.filter((book) => book.status === "reading"), [books]);
  const recentPurchases = useMemo(
    () =>
      [...books]
        .filter((book) => book.purchase_date)
        .sort((a, b) => new Date(b.purchase_date ?? "").getTime() - new Date(a.purchase_date ?? "").getTime())
        .slice(0, 4),
    [books],
  );
  const monthlyPages = summary?.monthly_pages ?? [];
  const maxMonthlyPages = Math.max(1, ...monthlyPages.map((month) => month.pages));
  const linePoints = monthlyPages
    .map((month, index) => {
      const x = monthlyPages.length <= 1 ? 0 : (index / (monthlyPages.length - 1)) * 100;
      const y = 100 - (month.pages / maxMonthlyPages) * 84 - 8;
      return `${x},${y}`;
    })
    .join(" ");

  async function handleCreateBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || isSaving) return;

    const payload: BookInput = {
      title: draft.title.trim(),
      author: draft.author.trim() || null,
      category: draft.category.trim(),
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
      setExpandedBookId(null);
      setQueuedBookIds((current) => ({ ...current, [created.id]: true }));
      window.setTimeout(() => {
        loadLibrary()
          .catch((err: Error) => setError(err.message))
          .finally(() => setQueuedBookIds((current) => ({ ...current, [created.id]: false })));
      }, 6000);
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

  async function handleAddChapter(book: Book) {
    const title = chapterByBook[book.id]?.trim();
    if (!title) return;

    try {
      await addChapter(book.id, title);
      setChapterByBook((current) => ({ ...current, [book.id]: "" }));
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add chapter");
    }
  }

  async function handleRegenerateChapters(book: Book) {
    try {
      setQueuedBookIds((current) => ({ ...current, [book.id]: true }));
      await regenerateChapters(book.id);
      window.setTimeout(() => {
        loadLibrary()
          .catch((err: Error) => setError(err.message))
          .finally(() => setQueuedBookIds((current) => ({ ...current, [book.id]: false })));
      }, 7000);
    } catch (err) {
      setQueuedBookIds((current) => ({ ...current, [book.id]: false }));
      setError(err instanceof Error ? err.message : "Could not regenerate chapters");
    }
  }

  async function handleDeleteChapter(chapterId: string) {
    try {
      await deleteChapter(chapterId);
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete chapter");
    }
  }

  async function handleDeleteAllChapters(book: Book) {
    try {
      await deleteBookChapters(book.id);
      await loadLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete chapters");
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
                href="/library/shelf"
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
              <h2 className="mt-2 text-3xl font-semibold text-stone-950">Monthly pages</h2>
            </div>
            <p className="text-sm text-stone-600">
              Current areas: {summary?.current_categories.length ? summary.current_categories.join(", ") : "No active category yet"}
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-stone-200 bg-white/80 p-5 shadow-sm">
            <div className="h-64">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Pages read by month">
                <polyline points="0,92 100,92" fill="none" stroke="#e7e5e4" strokeWidth="0.6" />
                <polyline points="0,50 100,50" fill="none" stroke="#e7e5e4" strokeWidth="0.4" />
                <polyline points={linePoints} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {monthlyPages.map((month, index) => {
                  const x = monthlyPages.length <= 1 ? 0 : (index / (monthlyPages.length - 1)) * 100;
                  const y = 100 - (month.pages / maxMonthlyPages) * 84 - 8;
                  return <circle key={month.month} cx={x} cy={y} r="1.7" fill="#f97316" vectorEffect="non-scaling-stroke" />;
                })}
              </svg>
              <div className="mt-3 grid grid-cols-6 gap-2 md:grid-cols-12">
                {monthlyPages.map((month) => (
                  <div key={month.month} className="text-center">
                    <p className="text-xs font-semibold text-stone-950">{month.pages}</p>
                    <p className="mt-1 text-[11px] text-stone-500">{formatMonth(month.month)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error ? <p className="mt-6 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{error}</p> : null}

          <div id="reading-list" className="mt-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Ongoing books</p>
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
                Add your first book. When OpenAI can identify it confidently, chapters will appear inside the row.
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

          <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white/85 shadow-sm">
            {!isLoading && readingBooks.length > 0 ? (
              <div className="hidden grid-cols-[1fr_180px_140px_130px] gap-4 border-b border-stone-100 bg-stone-50/80 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-stone-500 md:grid">
                <span>Book</span>
                <span>Author</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
            ) : null}
            {!isLoading && books.length > 0 && readingBooks.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-base font-semibold text-stone-950">No books currently in progress</p>
                <p className="mt-2 text-sm text-stone-500">Mark a book as Reading to show it here.</p>
              </div>
            ) : null}
            {readingBooks.map((book) => {
              const isExpanded = expandedBookId === book.id;
              const resonantCount = book.chapters.filter((chapter) => chapter.resonated).length;
              return (
                <article key={book.id} className="border-b border-stone-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpandedBookId(isExpanded ? null : book.id)}
                    className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-stone-50/80 md:grid-cols-[1fr_180px_140px_130px] md:items-center md:gap-4"
                  >
                    <div>
                      <h3 className="text-base font-semibold text-stone-950">{book.title}</h3>
                      <p className="mt-1 text-xs text-stone-500 md:hidden">
                        {[book.author || "Author unknown", statusLabels[book.status]].join(" · ")}
                      </p>
                    </div>
                    <p className="hidden text-sm text-stone-600 md:block">{book.author || "Author unknown"}</p>
                    <div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[book.status]}`}>
                        {statusLabels[book.status]}
                      </span>
                    </div>
                    <div className="flex items-center justify-start gap-2 md:justify-end">
                      {book.liked ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Liked</span> : null}
                      {queuedBookIds[book.id] ? <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">Updating</span> : null}
                      <span className="rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600">
                        {isExpanded ? "Close" : "Open"}
                      </span>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-stone-100 bg-white px-5 pb-5 pt-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm text-stone-600">
                            {[book.category || "Uncategorized", book.total_pages ? `${book.total_pages} pages` : null].filter(Boolean).join(" · ")}
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
                        <p className="text-sm font-semibold text-stone-600">
                          Chapters {resonantCount}/{book.chapters.length}
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3 rounded-md border border-stone-200 bg-stone-50/70 p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                        <input
                          value={chapterByBook[book.id] ?? ""}
                          onChange={(event) => setChapterByBook((current) => ({ ...current, [book.id]: event.target.value }))}
                          placeholder="Add chapter manually"
                          className="w-full rounded-md border border-stone-300 px-4 py-2.5 text-sm outline-none ring-teal-600/15 transition focus:border-teal-600 focus:ring-4"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddChapter(book)}
                          className="rounded-full bg-stone-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-stone-800"
                        >
                          Add Chapter
                        </button>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <button
                            type="button"
                            onClick={() => handleRegenerateChapters(book)}
                            className="rounded-full border border-stone-300 px-4 py-2.5 text-xs font-semibold text-stone-700 transition hover:bg-white"
                          >
                            {queuedBookIds[book.id] ? "Queued" : "Regenerate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAllChapters(book)}
                            className="rounded-full border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                          >
                            Delete Chapters
                          </button>
                        </div>
                      </div>

                      {book.chapters.length > 0 ? (
                        <div className="mt-5 grid gap-2 border-t border-stone-100 pt-5 md:grid-cols-2">
                          {book.chapters.map((chapter) => (
                            <div key={chapter.id} className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50/70 p-3">
                              <label className="flex flex-1 items-start gap-3">
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
                              <button
                                type="button"
                                onClick={() => handleDeleteChapter(chapter.id)}
                                className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-5 rounded-md bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                          No confident chapter list is stored for this book yet.
                        </p>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-stone-200 bg-white/80 p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">AI reading queue</p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-950">Next 3 owned books</h2>
            <div className="mt-4 space-y-3">
              {nextReadingBooks.map((book) => (
                <div key={book.book_id} className="rounded-md bg-stone-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">{book.title}</p>
                      <p className="mt-1 text-xs text-stone-500">{[book.author, book.category].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses[book.status]}`}>
                      {statusLabels[book.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-600">{book.reason}</p>
                </div>
              ))}
              {nextReadingBooks.length === 0 ? <p className="text-sm text-stone-500">No owned unread books to recommend right now.</p> : null}
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
                    <option key={category} value={category}>
                      {category || "Let OpenAI identify"}
                    </option>
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
              Saving asks OpenAI only for missing metadata and exact chapters. If confidence is low, the book is saved without invented details.
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
                {isSaving ? "Checking book..." : "Add Book"}
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

function formatMonth(value: string) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
