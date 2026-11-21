# Inhabit

Voice-controlled 3D interior design application monorepo.

## Structure

- `apps/web`: React frontend with Vite & Tailwind CSS
- `apps/api`: Express backend API with Anthropic SDK for voice command interpretation
- `packages/contracts`: Shared TypeScript types and Zod schemas

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

3. Run web app:
   ```bash
   npm run dev --workspace=apps/web
   ```

4. Run API server:
   ```bash
   npm run dev --workspace=apps/api
   ```
