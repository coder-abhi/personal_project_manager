# Personal Execution Tracker

A clean MVP for tracking projects, tasks, planned time, actual time, and execution status.

## Stack

- Frontend: Next.js App Router, TypeScript, TailwindCSS
- Backend: FastAPI, SQLAlchemy ORM, Pydantic, SQLite
- Database config: one `DATABASE_URL` string in the backend environment

## Run Backend

```bash
cd backend
cp .env.example .env
../.venv/bin/pip install -r requirements.txt
../.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The default database is `sqlite:///./app.db`. To switch later to Postgres or Supabase, change only `DATABASE_URL`.

## Run Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## API

- `GET /projects`
- `POST /projects`
- `GET /projects/{id}/tasks`
- `POST /tasks`
- `PUT /tasks/{id}`
