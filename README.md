# Regulatory Validation Tools

This project delivers ingredient and recipe validation workflows built with:

- React + TypeScript (Vite)
- Tailwind CSS and shadcn/ui components
- Netlify function proxy and background jobs for Decernis API access without timeouts

## Local Development

```bash
npm install
netlify dev
```

`netlify dev` runs Vite and the Netlify functions locally so the background job flow works end-to-end. The app is available on the port reported by Netlify (defaults to `http://localhost:8888`).

> Tip: running only `npm run dev` serves the UI but skips the Netlify functions, so validation requests will fail once they try to hit the background job API.

## Building & Deployment

```bash
npm run build
```

Static assets are emitted in `dist/`. The provided `netlify.toml` configures a production build and a serverless proxy for API calls.

## Environment Variables

Set `VITE_DECERNIS_API_BASE_URL` if you need a custom proxy endpoint; otherwise the app uses the Netlify function when deployed.

## Project Structure Highlights

- `src/pages/Index.tsx` – main validation flows and API orchestration
- `src/components/RecipeBuilder.tsx` – recipe input UI with percentage tracking
- `netlify/functions/decernis-proxy.ts` – quick proxy for small Decernis calls
- `netlify/functions/regcheck-start.ts` – enqueues background validation jobs
- `netlify/functions/regcheck-background.ts` – long-running Decernis request executor
- `netlify/functions/regcheck-status.ts` – polling endpoint that surfaces job status/results

Feel free to tailor this README to match your team’s workflow.
