import { CSS } from "../styles";

export function layout(content: string, title = "Gemini Auth Proxy"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1>gemini-auth-proxy</h1>
    </header>
    <main>
      ${content}
    </main>
    <footer>
      Proxy running on localhost:8888 | Code Assist: /codeassist/* | Standard: /gemini/*
    </footer>
  </div>
  <script>
    // Auto-refresh status every 30 seconds
    setInterval(() => {
      htmx.trigger('#status-section', 'refresh');
    }, 30000);
  </script>
</body>
</html>`;
}
