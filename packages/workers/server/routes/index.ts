import { eventHandler } from "h3";

export default eventHandler(() => {
  return `
    <meta charset="utf-8">
    <style>
      body { font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 640px; line-height: 1.5; }
      code { background: #f4f4f5; padding: 0.15rem 0.35rem; border-radius: 0.25rem; }
    </style>
    <h1>Workers Service</h1>
    <p>This Nitro app bootstraps BullMQ queues for the Pixelhop starter template.</p>
    <ul>
      <li><code>example-jobs</code> enqueues a demo payload every minute.</li>
      <li>Visit <code>/admin/queues</code> for the Bull Board UI (basic auth required).</li>
    </ul>
  `;
});
