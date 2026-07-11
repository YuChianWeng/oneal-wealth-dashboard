# Cloudflare Access Handoff

> **This document describes manual steps you (Oneal) must perform in the
> Cloudflare dashboard.  No automation script will touch your Cloudflare
> account — tunnel tokens are never stored in this repository.**

## 1. Choose a public subdomain

Pick a subdomain of a domain you manage in Cloudflare, for example:

```
wealth.onealweng.com
```

## 2. Create a Cloudflare Tunnel

If you do not already run `cloudflared` on the Docker host:

```bash
# Install cloudflared (Linux — see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Authenticate
cloudflared tunnel login
```

Then create and route a tunnel:

```bash
cloudflared tunnel create wealth-dashboard
# Save the tunnel UUID and credentials file it prints.

# Route traffic to the local container
cloudflared tunnel route dns wealth-dashboard wealth.onealweng.com

# Run the tunnel (pointing at the container's 127.0.0.1:3000)
cloudflared tunnel run --url http://127.0.0.1:3000 wealth-dashboard
```

Alternatively, in the Cloudflare Zero Trust dashboard:

1. Go to **Networks → Tunnels**
2. Click **Add a tunnel**, select **Cloudflared**, name it `wealth-dashboard`
3. Follow the on‑screen instructions to install and run the connector
4. Under **Public Hostnames**, add:
   - **Subdomain**: `wealth`
   - **Domain**: `onealweng.com`
   - **Service**: `http://127.0.0.1:3000`
5. Save the tunnel

## 3. Add Cloudflare Access (the only auth gate)

> The dashboard application itself has **no built‑in login**.  Cloudflare
> Access is the sole authentication boundary — nobody reaches the app
> without passing through Access.

In the Cloudflare Zero Trust dashboard:

1. Go to **Access → Applications**
2. Click **Add an application**, choose **Self‑hosted**
3. Configure the application:
   - **Application name**: `Wealth Dashboard`
   - **Session duration**: `24 hours` (or your preference)
   - **Application domain**: `wealth.onealweng.com`
   - **Identity providers**: select the provider(s) that can authenticate you
     (e.g. GitHub, Google, or the Cloudflare one‑time PIN emailed to you)
4. Click **Next**
5. Add a policy:
   - **Policy name**: `Allow Oneal`
   - **Action**: `Allow`
   - **Include** → **Emails**: add your email address(es)
6. Click **Next**, review, then **Add application**

## 4. Verification

After all steps are complete:

```bash
# From the Docker host — should succeed (localhost bypasses the tunnel)
curl -fsS http://127.0.0.1:3000/api/health

# From the public internet — should redirect to the Cloudflare Access login page
curl -I https://wealth.onealweng.com/
# → HTTP/2 302 … location: https://<team>.cloudflareaccess.com/…
```

Once you authenticate through the Cloudflare Access login page, you will
reach the dashboard.

## Reminders

- **Never** commit `cloudflared` credentials, tunnel tokens, or
  `cert.pem` files to this repository.
- The `.dockerignore` already excludes `.env*`, but double‑check that
  no tunnel secrets leak through other channels.
- If the dashboard becomes unreachable, first verify the container is
  healthy (`docker compose logs`) and that `cloudflared` is running
  (`systemctl status cloudflared` or `ps aux | grep cloudflared`).
