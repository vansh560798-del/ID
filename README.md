# St. Arnold's ID Portal — Supabase edition

A static PWA for school announcements and study material. Supabase is the primary database and staff authentication provider. PDF upload code and offline support are retained.

## Setup

1. Create a project at https://supabase.com/.
2. Open **SQL Editor** and run `supabase-schema.sql`.
3. In **Project Settings → API**, copy the Project URL and publishable/anon key.
4. The portal is now preconfigured with the ID project URL and its publishable key in `index.html`. Publishable keys are intended for browser use when RLS is enabled. Never put a `service_role` / secret key in browser code or GitHub.
5. In **Authentication → Users**, create staff accounts and assign trusted `app_metadata.role` values: `admin` or `teacher`. Public sign-ups should be disabled. RLS policies check this trusted metadata.

If app metadata cannot be edited in the dashboard, set it with a trusted server/admin script. Never expose the service-role key in frontend code.

## Run locally

```bash
python3 -m http.server 8080
```

Open http://localhost:8080.

## Deploy

Enable GitHub Pages from the `main` branch root. Add the deployed URL to Supabase Auth's Site URL / allowed redirect URLs.

## Important

- Public visitors can read announcements. Only authenticated accounts with trusted `app_metadata.role` equal to `admin` or `teacher` can write, update, or delete.
- PDF uploads are not migrated to Supabase Storage. To enable them, deploy `worker.js` as your own Cloudflare Worker, configure `GITHUB_TOKEN`, `REPO_OWNER`, `REPO_NAME` (and optionally `REPO_BRANCH`), then replace `YOUR_CLOUDFLARE_WORKER_URL` in `index.html`. The old third-party Worker URL was removed to prevent school PDFs being sent to another person's GitHub repository.
- Offline IndexedDB and legacy fallback code remain for compatibility. Staff login is disabled until Supabase is configured.
