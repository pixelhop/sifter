import { eventHandler } from "h3";

export default eventHandler(() => {
  return `
    <meta charset="utf-8">
    <style>
      body { font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 640px; line-height: 1.4; }
      code { background: #f4f4f5; padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
      h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
      ul { margin-left: 1rem; }
    </style>
    <h1>Pixelhop Starter API</h1>
    <p>This Nitro server ships with two example routes so you can verify the stack quickly:</p>
    <ul>
      <li><code>GET /api/health</code> returns a simple status payload.</li>
      <li><code>GET/POST /api/users</code> demonstrates CRUD operations backed by Prisma.</li>
    </ul>
    <p>Replace these routes with your project-specific logic and keep the structure (api, app, db, workers) as the foundation.</p>
  `;
});
