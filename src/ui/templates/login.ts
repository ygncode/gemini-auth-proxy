import { statusSection, actionButtons, usageInfo } from "./status";

export function homePage(): string {
  return `
    ${statusSection()}
    ${actionButtons()}
    ${usageInfo()}
  `;
}

export function loginInProgress(authUrl?: string): string {
  return `
    <div class="message message--success">
      ${authUrl
        ? `Click the link below to login with Google:<br><br><a href="${authUrl}" target="_blank" style="color: #8b5cf6; word-break: break-all;">${authUrl}</a>`
        : "Opening Google login in your browser... Complete the OAuth flow to continue."
      }
    </div>
    <div class="status-section">
      <div class="status-row">
        <span class="status-label">Status</span>
        <span class="status-value">
          <span class="status-badge status-badge--disconnected">
            <span class="loading"></span>
            Waiting for OAuth callback...
          </span>
        </span>
      </div>
    </div>
    <div id="login-result" hx-get="/ui/login/check" hx-trigger="every 2s" hx-swap="innerHTML" hx-target="main"></div>
  `;
}

export function loginSuccess(email?: string): string {
  return `
    <div class="message message--success">
      Successfully logged in${email ? ` as ${email}` : ""}!
    </div>
    ${statusSection()}
    ${actionButtons()}
    ${usageInfo()}
  `;
}

export function loginError(error: string): string {
  return `
    <div class="message message--error">
      Login failed: ${error}
    </div>
    ${statusSection()}
    ${actionButtons()}
    ${usageInfo()}
  `;
}

export function logoutSuccess(): string {
  return `
    <div class="message message--success">
      Successfully logged out.
    </div>
    ${statusSection()}
    ${actionButtons()}
    ${usageInfo()}
  `;
}
