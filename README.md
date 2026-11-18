# vocational-dev
New moodlesafe HTML repository

## Private Snippet Library on Cloudflare Workers

The Worker checks credentials before serving any route, including `snippets.json`.
The browser sign-in uses the username `library`.

1. Deploy from the `main` branch connected to the `elearning` Worker. The
   production deploy command should be `npx wrangler deploy` so Wrangler uses
   `wrangler.toml` for both the Worker code and its static assets.
2. In **Workers & Pages → your Worker → Settings → Variables and Secrets**, add
   a **Secret** named `LIBRARY_PASSWORD` and set it to a strong password you choose.
   Select **Deploy**. Until the secret exists, the new Worker returns HTTP 503.
3. In a private browser window, confirm the site and a direct request to
   `/snippets.json` both prompt for credentials. Then sign in with your password.
4. Make the GitHub repository private if the committed snippets are private.
   Check any old deployments and mirrors for publicly accessible copies.
