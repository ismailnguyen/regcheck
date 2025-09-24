# Regulatory Validation Tools

This project delivers ingredient and recipe validation workflows built with:

- React + TypeScript (Vite)
- Tailwind CSS and shadcn/ui components
- Netlify function proxy for Decernis API access

## Local Development

```bash
npm install
npm run dev
```

The app starts on `http://localhost:8080`.

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
- `netlify/functions/decernis-proxy.ts` – serverless proxy for Decernis endpoints

Feel free to tailor this README to match your team’s workflow.
