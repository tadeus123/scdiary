# Cause Effect Map

Interactive cause-and-effect graph at `/cause` on tademehl.com. Edit points and connections in the admin view; the map syncs to Supabase.

## Run (standalone)

```bash
cd cause
npm install
npm run dev
```

Open `http://localhost:5180/cause`.

## Run (with diary server)

From the repo root:

```bash
npm start
```

Open `http://localhost:3000/cause`.

## Routes

- `/cause` — read-only quest view
- `/cause/admin` — edit graph, positions, and connections

Graph data is stored in Supabase (`cause_graph` table) via `GET/PUT /api/cause/graph`.
