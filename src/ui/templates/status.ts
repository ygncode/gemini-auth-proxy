import { getTokenState, type TokenState } from "../../auth/token";

function formatTimeRemaining(expiresAt: number | null): string {
  if (!expiresAt) return "--";

  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";

  const seconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function getStatusBadge(state: TokenState): string {
  if (!state.hasToken) {
    return '<span class="status-badge status-badge--disconnected">Not logged in</span>';
  }
  if (state.isExpired) {
    return '<span class="status-badge status-badge--expired">Token expired</span>';
  }
  return '<span class="status-badge status-badge--connected">Connected</span>';
}

export function statusSection(state?: TokenState): string {
  const tokenState = state ?? getTokenState();

  return `
    <div class="status-section" id="status-section" hx-get="/ui/status" hx-trigger="refresh" hx-swap="outerHTML">
      <div class="status-row">
        <span class="status-label">Status</span>
        <span class="status-value">${getStatusBadge(tokenState)}</span>
      </div>
      <div class="status-row">
        <span class="status-label">Email</span>
        <span class="status-value">${tokenState.email ?? "--"}</span>
      </div>
      <div class="status-row">
        <span class="status-label">Token expires in</span>
        <span class="status-value timer">${formatTimeRemaining(tokenState.expiresAt)}</span>
      </div>
    </div>
  `;
}

export function actionButtons(state?: TokenState): string {
  const tokenState = state ?? getTokenState();

  if (tokenState.hasToken) {
    return `
      <div class="actions">
        <button class="btn btn--danger" hx-post="/ui/logout" hx-swap="innerHTML" hx-target="main">
          <span class="btn-text">Logout</span>
          <span class="loading" style="display: none;"></span>
        </button>
      </div>
    `;
  }

  return `
    <div class="actions">
      <button class="btn btn--primary" hx-post="/ui/login" hx-swap="innerHTML" hx-target="main">
        <span class="btn-text">Login with Google</span>
        <span class="loading" style="display: none;"></span>
      </button>
    </div>
  `;
}

export function usageInfo(): string {
  return `
    <div class="info-section">
      <h2>Usage</h2>
      <pre><code>// Vercel AI SDK configuration
import { google } from '@ai-sdk/google';

// Code Assist API (with transformation)
const codeAssist = google('gemini-2.5-flash', {
  baseURL: 'http://localhost:8888/codeassist',
  apiKey: 'proxy',
});

// Standard Gemini API (no transformation)
const standard = google('gemini-2.5-flash', {
  baseURL: 'http://localhost:8888/gemini',
  apiKey: 'proxy',
});</code></pre>
    </div>
  `;
}
