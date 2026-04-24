# SmartOpenPath Roadmap Generator

A Node.js and PostgreSQL web app for generating structured learning roadmaps, tracking progress, and opening resource content inside the site.

## What it does

- Generates learning roadmaps from a target concept and study constraints.
- Suggests prerequisites for beginner users before building the final roadmap.
- Stores multiple named roadmaps per user instead of replacing the previous one.
- Lets users open any saved roadmap from a personal roadmap library.
- Tracks concept completion with per-roadmap progress persistence.
- Calculates completion percentages only from concepts/weeks that actually have assigned study content and time.
- Renders YouTube resources in an in-app modal.
- Provides a graph view of roadmap concept dependencies with Cytoscape.js.

## Tech Stack

- Backend: Node.js, Express
- Database: PostgreSQL with `pg`
- Auth: JWT, bcryptjs
- Frontend: Static HTML, vanilla JavaScript, Tailwind CDN, Cytoscape.js
- AI / NLP support: `@google/generative-ai`, `openai`, `@xenova/transformers`

## Project Structure

- `server.js` - app bootstrap and route mounting
- `db/db.js` - PostgreSQL pool and schema initialization
- `routes/auth.routes.js` - register, login, session restore
- `routes/roadmap.routes.js` - roadmap generation, list, detail, and progress APIs
- `services/roadmapGenerator.js` - roadmap generation and persistence logic
- `public/index.html` - frontend layout
- `public/app.js` - frontend behavior, rendering, progress tracking, YouTube modal
- `public/styles.css` - custom styling
- `utils/` - helper logic for embeddings, text refinement, and time planning
- `scripts/` - offline content refinement and glossary update scripts

## Requirements

- Node.js 18+ recommended
- PostgreSQL database
- Environment variables configured before starting the app

## Environment Variables

Create a `.env` file in the project root with at least:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
PORT=5000
```

Optional variables may be needed by the refinement or AI scripts depending on how you run them.

## Setup

1. Install dependencies.

```bash
npm install
```

2. Configure your `.env` file.

3. Start the app.

```bash
npm start
```

4. Open the app in your browser.

## How the app works

### Authentication

Users create an account or log in with email and password. The backend issues a JWT token, and the frontend stores it locally to restore the session.

### Roadmap generation

When a user submits the roadmap form, the backend:

1. Suggests prerequisites if the user is a beginner and has not accepted prerequisites yet.
2. Builds the final concept set.
3. Loads concept metadata, resources, and quiz data.
4. Scores and allocates time to concepts.
5. Splits the roadmap into weekly study blocks.
6. Saves the roadmap in PostgreSQL.

### Multiple roadmaps per user

Each generated roadmap is saved as a separate record with its own custom name. The frontend shows a roadmap library so the user can open any saved roadmap later.

### Progress tracking

Each roadmap stores completed concept ids in `progress_payload`. The UI lets the user tick concepts while studying. The app then persists progress and recalculates the completion percentage.

The percentage logic excludes weeks or concepts that have no actual assigned study time, so empty weeks do not distort progress.

### Resource viewing

If a resource URL is a YouTube link, the app opens it inside a modal using an embedded player instead of sending the user away from the site.

## API Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Roadmaps

- `POST /api/generate-roadmap`
- `GET /api/roadmap/latest`
- `GET /api/roadmaps`
- `GET /api/roadmaps/:id`
- `PATCH /api/roadmaps/:id/progress`

## Database Notes

The app creates the main tables on startup through `ensureSchema()`.

Current roadmap storage includes:

- `roadmap_name`
- `input_payload`
- `result_payload`
- `progress_payload`
- `created_at`

## Scripts

- `npm start` - start the server
- `npm test` - placeholder script at the moment

## Notes

- Static assets are served from the `public/` folder.
- Roadmap generation depends on the database content in `concepts`, `resources`, and related tables.
- If embeddings or refinement scripts are used, make sure their required model/API dependencies are available in your environment.

## License

ISC
