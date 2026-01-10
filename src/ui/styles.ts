export const CSS = `
:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --border-color: #30363d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  --accent-green: #3fb950;
  --accent-red: #f85149;
  --accent-yellow: #d29922;
  --accent-blue: #58a6ff;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-mono);
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  line-height: 1.5;
  font-size: 14px;
}

.container {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
}

header {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
  margin-bottom: 2rem;
}

h1 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

h1::before {
  content: ">";
  color: var(--accent-green);
}

.status-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}

.status-row:last-child {
  border-bottom: none;
}

.status-label {
  color: var(--text-secondary);
}

.status-value {
  font-weight: 500;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-badge--connected {
  background: rgba(63, 185, 80, 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(63, 185, 80, 0.4);
}

.status-badge--expired {
  background: rgba(248, 81, 73, 0.15);
  color: var(--accent-red);
  border: 1px solid rgba(248, 81, 73, 0.4);
}

.status-badge--disconnected {
  background: rgba(110, 118, 129, 0.15);
  color: var(--text-muted);
  border: 1px solid rgba(110, 118, 129, 0.4);
}

.timer {
  font-variant-numeric: tabular-nums;
  color: var(--accent-yellow);
}

.actions {
  display: flex;
  gap: 1rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  text-decoration: none;
}

.btn--primary {
  background: var(--accent-green);
  color: var(--bg-primary);
  border-color: var(--accent-green);
}

.btn--primary:hover {
  background: #46c75a;
  border-color: #46c75a;
}

.btn--danger {
  background: transparent;
  color: var(--accent-red);
  border-color: var(--accent-red);
}

.btn--danger:hover {
  background: rgba(248, 81, 73, 0.15);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.info-section {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 1rem;
  margin-top: 2rem;
}

.info-section h2 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-section pre {
  background: var(--bg-primary);
  padding: 0.75rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.info-section code {
  color: var(--accent-blue);
}

.message {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.message--success {
  background: rgba(63, 185, 80, 0.15);
  border: 1px solid rgba(63, 185, 80, 0.4);
  color: var(--accent-green);
}

.message--error {
  background: rgba(248, 81, 73, 0.15);
  border: 1px solid rgba(248, 81, 73, 0.4);
  color: var(--accent-red);
}

.loading {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  border-top-color: var(--accent-green);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.htmx-request .loading {
  display: inline-block;
}

.htmx-request .btn-text {
  display: none;
}

footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 0.75rem;
}
`;
