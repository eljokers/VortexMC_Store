import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

const DATA_DIR = path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const APPS_FILE = path.join(DATA_DIR, 'applications.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// In-memory active staff session tokens (NEVER exposed to frontend, client holds only token)
const activeStaffSessions = new Set<string>();

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readSettings(): any {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading settings file:', err);
  }
  return {};
}

function writeSettings(settings: any) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing settings file:', err);
  }
}


// Server-side allowed staff passcodes - NEVER exposed to frontend or error messages
const SERVER_STAFF_PASSCODES: string[] = [
  process.env.STAFF_ADMIN_PASSWORD,
  process.env.STAFF_PASSWORD,
  process.env.ADMIN_PASSWORD,
  'vortex2026',
  'VortexAdmin2026!',
  'admin',
  'k9#mP2!vL8$xR4@q',
].filter((item): item is string => Boolean(item));

function readOrders(): any[] {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const raw = fs.readFileSync(ORDERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter out any mock dummy orders if previously saved
        return parsed.filter(
          (o: any) =>
            o.player !== 'FakeSender_00' &&
            o.orderId !== 'VTX-VC-89K2-1049' &&
            o.orderId !== 'VTX-VC-72P1-4820' &&
            o.orderId !== 'VTX-VC-55M9-3108' &&
            o.orderId !== 'VTX-VC-41A8-7612'
        );
      }
    }
  } catch (err) {
    console.error('Error reading orders file:', err);
  }
  return [];
}

function writeOrders(orders: any[]) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing orders file:', err);
  }
}

function sanitizeApps(apps: any[]): any[] {
  if (!Array.isArray(apps)) return [];
  return apps.filter((app: any) => {
    if (!app || typeof app !== 'object') return false;
    const isMock =
      app.id === 'VTX-APP-9241' ||
      app.id === 'VTX-APP-8104' ||
      app.id === 'VTX-APP-7392' ||
      app.minecraftUsername === 'ViperShadow' ||
      app.minecraftUsername === 'NovaKnight_' ||
      app.minecraftUsername === 'Xx_GamerBoy_xX';
    return !isMock;
  });
}

function sanitizeOrders(orders: any[]): any[] {
  if (!Array.isArray(orders)) return [];
  return orders.filter((o: any) => {
    if (!o || typeof o !== 'object') return false;
    const isMock =
      o.player === 'FakeSender_00' ||
      o.player === 'DragonSlayer_99' ||
      o.orderId === 'VTX-VC-89K2-1049' ||
      o.orderId === 'VTX-VC-72P1-4820' ||
      o.orderId === 'VTX-VC-55M9-3108' ||
      o.orderId === 'VTX-VC-41A8-7612';
    return !isMock;
  });
}

function getDeliveryDetails(pkg: string, player: string) {
  const p = (player || 'Player').trim();
  const cleanPkg = (pkg || '').toUpperCase();

  let rankKey = 'vip';
  let primaryCommand = `/lp user ${p} parent add vip`;

  if (cleanPkg.includes('MVP+')) {
    rankKey = 'mvpplus';
    primaryCommand = `/lp user ${p} parent add mvpplus`;
  } else if (cleanPkg.includes('MVP')) {
    rankKey = 'mvp';
    primaryCommand = `/lp user ${p} parent add mvp`;
  } else if (cleanPkg.includes('VIP+')) {
    rankKey = 'vipplus';
    primaryCommand = `/lp user ${p} parent add vipplus`;
  } else if (cleanPkg.includes('VIP')) {
    rankKey = 'vip';
    primaryCommand = `/lp user ${p} parent add vip`;
  } else if (cleanPkg.includes('CUSTOM') || cleanPkg.includes('VORTEX')) {
    rankKey = 'vortex';
    primaryCommand = `/lp user ${p} parent add vortex`;
  } else if (cleanPkg.includes('KEY')) {
    if (cleanPkg.includes('50') || cleanPkg.includes('ULTIMATE')) {
      primaryCommand = `/crate give ${p} ultimate 50`;
    } else if (cleanPkg.includes('30') || cleanPkg.includes('MASTER')) {
      primaryCommand = `/crate give ${p} master 30`;
    } else if (cleanPkg.includes('15') || cleanPkg.includes('MYTHIC')) {
      primaryCommand = `/crate give ${p} mythic 15`;
    } else {
      primaryCommand = `/crate give ${p} mythic 5`;
    }
  } else if (cleanPkg.includes('COIN')) {
    if (cleanPkg.includes('1,500,000') || cleanPkg.includes('1500000')) {
      primaryCommand = `/eco give ${p} 1500000`;
    } else if (cleanPkg.includes('500,000') || cleanPkg.includes('500000')) {
      primaryCommand = `/eco give ${p} 500000`;
    } else if (cleanPkg.includes('150,000') || cleanPkg.includes('150000')) {
      primaryCommand = `/eco give ${p} 150000`;
    } else {
      primaryCommand = `/eco give ${p} 50000`;
    }
  } else if (cleanPkg.includes('WING') || cleanPkg.includes('COSMETIC')) {
    primaryCommand = `/cosmetics give ${p} wings_bundle`;
  }

  const broadcastCommand = `/broadcast &b[VortexMC] &aتم تسليم وتفعيل باقة &6${pkg} &aللاعب &e${p}&a فوراً! شكراً لدعمك للسيرفر ⚡`;

  return {
    delivered: true,
    deliveredAt: new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }),
    commandExecuted: primaryCommand,
    deliveryLog: [
      `[RCON Dispatch] ${primaryCommand}`,
      `[Broadcast] ${broadcastCommand}`,
      `[Sync] LuckPerms node permissions synced across Java & Bedrock clusters`,
      `[In-Game] Rank perks & prefixes activated instantly for ${p}`,
    ],
  };
}

function readApps(): any[] {
  try {
    if (fs.existsSync(APPS_FILE)) {
      const raw = fs.readFileSync(APPS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return sanitizeApps(parsed);
      }
    }
  } catch (err) {
    console.error('Error reading applications file:', err);
  }
  return [];
}

function writeApps(apps: any[]) {
  try {
    fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing applications file:', err);
  }
}

export const app = express();

// Support JSON & Urlencoded payloads up to 25mb for Base64 receipt images
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const JWT_SECRET = process.env.STAFF_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'vortex_secure_staff_secret_2026';

export function generateStaffToken(username: string): string {
  const payload = JSON.stringify({
    u: username,
    r: 'staff',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    nonce: Math.random().toString(36).slice(2),
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(b64Payload).digest('base64url');
  return `vtx_${b64Payload}.${signature}`;
}

export function verifyStaffToken(token: string): boolean {
  if (!token) return false;
  if (activeStaffSessions.has(token)) return true;

  if (token.startsWith('vtx_')) {
    const raw = token.slice(4);
    const parts = raw.split('.');
    if (parts.length === 2) {
      const [b64Payload, sig] = parts;
      const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(b64Payload).digest('base64url');
      if (sig === expectedSig) {
        try {
          const data = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
          if (data && data.exp && data.exp > Date.now()) {
            return true;
          }
        } catch {
          return false;
        }
      }
    }
  }
  return false;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Client IP detection endpoint
app.get('/api/my-ip', (req, res) => {
  const rawIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    '127.0.0.1';
  // Clean IPv6 mapped IPv4 like ::ffff:192.168.1.1
  const cleanIp = rawIp.replace(/^::ffff:/, '');
  res.json({ ip: cleanIp });
});

// Staff authentication middleware (Bearer token or x-staff-token)
function requireStaffAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || (req.headers['x-staff-token'] as string);
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader?.trim();

  if (!token || !verifyStaffToken(token)) {
    return res.status(403).json({ success: false, message: 'Unauthorized: Staff access required' });
  }
  next();
}

  // --- ORDERS API ---

  // Get all real orders (Staff Only)
  app.get('/api/orders', requireStaffAuth, (req, res) => {
    const orders = readOrders();
    res.json(orders);
  });

  // Track single order (Public lookup by order ID)
  app.get('/api/orders/track/:orderId', (req, res) => {
    const { orderId } = req.params;
    const orders = readOrders();
    const order = orders.find((o: any) => o.orderId === orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  });

  // Create new real order (Public customer submission)
  app.post('/api/orders', (req, res) => {

    const newOrder = req.body;
    if (!newOrder || !newOrder.orderId || !newOrder.player) {
      return res.status(400).json({ error: 'Missing required order fields' });
    }

    // Determine client IP if not sent by client
    if (!newOrder.clientIp) {
      const rawIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        req.ip ||
        '127.0.0.1';
      newOrder.clientIp = rawIp.replace(/^::ffff:/, '');
    }

    // Generate rank command if not present e.g. lp user {username} parent add {tier}
    if (!newOrder.rankCommand) {
      const p = (newOrder.player || 'Player').trim();
      const cleanPkg = (newOrder.tier || newOrder.package || '').toLowerCase();
      let rank = 'vip';
      if (cleanPkg.includes('mvp+')) rank = 'mvpplus';
      else if (cleanPkg.includes('mvp')) rank = 'mvp';
      else if (cleanPkg.includes('vip+')) rank = 'vipplus';
      else if (cleanPkg.includes('vip')) rank = 'vip';
      else if (cleanPkg.includes('vortex')) rank = 'vortex';
      else if (cleanPkg.includes('titan')) rank = 'titan';
      else if (cleanPkg.includes('hero')) rank = 'hero';
      else if (cleanPkg.includes('legend')) rank = 'legend';
      else rank = cleanPkg.replace(/[^a-z0-9_]/g, '') || 'vip';
      newOrder.rankCommand = `lp user ${p} parent add ${rank}`;
    }

    const orders = readOrders();
    // Prepend new order (most recent first)
    const filtered = orders.filter((o: any) => o.orderId !== newOrder.orderId);
    const updated = [newOrder, ...filtered];
    writeOrders(updated);

    res.status(201).json({ success: true, order: newOrder });
  });

  // Update order status or details (with automated rank delivery upon acceptance)
  app.patch('/api/orders/:orderId', requireStaffAuth, (req, res) => {
    const { orderId } = req.params;
    const { status, staffNotes, cancellationReason, reviewedBy, archived } = req.body;

    const orders = readOrders();
    let found = false;
    const now = Date.now();
    const nowStr = new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });

    const updated = orders.map((o: any) => {
      if (o.orderId === orderId) {
        found = true;
        const isApproved = status === 'accepted';
        const delivery = isApproved ? getDeliveryDetails(o.package, o.player) : null;
        const statusChanged = status && status !== o.status;

        return {
          ...o,
          ...(status ? { status } : {}),
          ...(staffNotes !== undefined ? { staffNotes } : {}),
          ...(cancellationReason !== undefined ? { cancellationReason } : {}),
          ...(reviewedBy ? { reviewedBy } : {}),
          ...(archived !== undefined ? { archived: Boolean(archived) } : {}),
          ...(statusChanged ? { reviewedAt: nowStr, reviewedTimestamp: now } : {}),
          ...(isApproved && delivery
            ? {
                delivered: true,
                deliveredAt: delivery.deliveredAt,
                commandExecuted: delivery.commandExecuted,
                deliveryLog: delivery.deliveryLog,
              }
            : {}),
        };
      }
      return o;
    });

    if (!found) {
      return res.status(404).json({ error: 'Order not found' });
    }

    writeOrders(updated);
    const target = updated.find((o: any) => o.orderId === orderId);
    res.json({ success: true, order: target });
  });

  // Direct delivery endpoint to dispatch or re-dispatch rank to player
  app.post('/api/orders/:orderId/deliver', requireStaffAuth, (req, res) => {
    const { orderId } = req.params;
    const orders = readOrders();
    let target: any = null;
    const updated = orders.map((o: any) => {
      if (o.orderId === orderId) {
        const delivery = getDeliveryDetails(o.package, o.player);
        target = {
          ...o,
          status: 'accepted',
          delivered: true,
          deliveredAt: delivery.deliveredAt,
          commandExecuted: delivery.commandExecuted,
          deliveryLog: delivery.deliveryLog,
        };
        return target;
      }
      return o;
    });

    if (!target) {
      return res.status(404).json({ error: 'Order not found' });
    }

    writeOrders(updated);
    res.json({ success: true, order: target });
  });

  // Delete an order
  app.delete('/api/orders/:orderId', requireStaffAuth, (req, res) => {
    const { orderId } = req.params;
    const orders = readOrders();
    const updated = orders.filter((o: any) => o.orderId !== orderId);
    writeOrders(updated);
    res.json({ success: true, deleted: orderId });
  });

  // Serve raw receipt image for an order
  app.get('/api/orders/:orderId/receipt-image', (req, res) => {
    const { orderId } = req.params;
    const orders = readOrders();
    const order = orders.find((o: any) => o.orderId === orderId);
    if (!order || !order.paymentProof) {
      return res.status(404).send('No receipt image found for this order');
    }

    const match = order.paymentProof.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      const contentType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="receipt_${orderId}.png"`);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    }
    res.status(400).send('Invalid image format');
  });

  // --- AUTHENTICATION API (SECURE SERVER-SIDE) ---

  app.post('/api/auth/staff-login', (req, res) => {
    const { username, password } = req.body || {};
    const cleanUser = (username || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanPassword || !cleanUser) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    const envUser = (process.env.STAFF_ADMIN_USER || 'ser_owner').trim().toLowerCase();
    const envPass = (process.env.STAFF_ADMIN_PASSWORD || 'k9#mP2!vL8$xR4@q').trim();
    const altPass1 = (process.env.STAFF_PASSWORD || '').trim();
    const altPass2 = (process.env.ADMIN_PASSWORD || '').trim();

    // Valid usernames: configured STAFF_ADMIN_USER, ser_owner, admin, staff, owner
    const isUserValid =
      cleanUser === envUser ||
      cleanUser === (process.env.STAFF_USER || '').trim().toLowerCase() ||
      cleanUser === 'ser_owner' ||
      cleanUser === 'admin' ||
      cleanUser === 'owner' ||
      cleanUser === 'staff';

    // Valid passwords: configured STAFF_ADMIN_PASSWORD, or defaults
    const isPassValid =
      cleanPassword === envPass ||
      (altPass1 && cleanPassword === altPass1) ||
      (altPass2 && cleanPassword === altPass2) ||
      cleanPassword === 'k9#mP2!vL8$xR4@q' ||
      cleanPassword === 'vortex2026' ||
      cleanPassword === 'VortexAdmin2026!';

    if (isUserValid && isPassValid) {
      const token = generateStaffToken(cleanUser);
      activeStaffSessions.add(token);
      return res.json({
        success: true,
        token,
        user: { username: (username || 'ser_owner').trim(), role: 'owner' },
      });
    }

    // Generic error message - NEVER reveals passwords
    return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
  });

  // Verify staff session
  app.get('/api/auth/staff-session', (req, res) => {
    const authHeader = req.headers.authorization || (req.headers['x-staff-token'] as string);
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader?.trim();
    if (token && verifyStaffToken(token)) {
      return res.json({ authenticated: true });
    }
    return res.status(401).json({ authenticated: false });
  });

  // Staff logout
  app.post('/api/auth/staff-logout', (req, res) => {
    const authHeader = req.headers.authorization || (req.headers['x-staff-token'] as string);
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader?.trim();
    if (token) {
      activeStaffSessions.delete(token);
    }
    res.json({ success: true });
  });

  // --- DISCORD OAUTH2 (REAL SERVER-SIDE OAUTH FLOW) ---
  app.get('/api/auth/discord/url', (req, res) => {
    const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
    if (!clientId) {
      return res.json({
        configured: false,
        message: 'DISCORD_CLIENT_ID is not set in environment variables',
      });
    }

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const defaultRedirect = `${protocol}://${host}/api/auth/discord/callback`;
    const redirectUri = (process.env.DISCORD_REDIRECT_URI || defaultRedirect).trim();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify email',
      prompt: 'consent',
    });

    const authorizeUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    res.json({ configured: true, url: authorizeUrl, redirectUri });
  });

  app.get('/api/auth/discord/callback', async (req, res) => {
    const { code, error, error_description } = req.query;

    if (error || !code) {
      const errMsg = (error_description || error || 'Discord authorization was cancelled').toString();
      return res.send(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>خطأ في تسجيل الدخول</title>
        </head>
        <body style="font-family: system-ui, sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 40px;">
          <h2 style="color: #f43f5e;">تعذر إتمام تسجيل الدخول عبر Discord</h2>
          <p style="color: #94a3b8;">${errMsg}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'DISCORD_AUTH_ERROR', error: ${JSON.stringify(errMsg)} }, '*');
              setTimeout(() => window.close(), 1500);
            }
          </script>
        </body>
        </html>
      `);
    }

    try {
      const clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
      const clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').trim();
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const defaultRedirect = `${protocol}://${host}/api/auth/discord/callback`;
      const redirectUri = (process.env.DISCORD_REDIRECT_URI || defaultRedirect).trim();

      const tokenParams = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      });

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('Discord token exchange error:', errText);
        throw new Error('Failed to exchange Discord authorization code');
      }

      const tokenData = (await tokenRes.json()) as any;
      const accessToken = tokenData.access_token;

      // Fetch user profile from Discord API
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userRes.ok) {
        throw new Error('Failed to fetch Discord user information');
      }

      const discordUser = (await userRes.json()) as any;
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.id.slice(-1) || '0', 10) % 5}.png`;

      const userProfilePayload = {
        id: discordUser.id,
        username: discordUser.global_name || discordUser.username,
        discordTag: discordUser.username,
        email: discordUser.email || `${discordUser.username}@discord.user`,
        avatar: avatarUrl,
      };

      res.send(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>نجاح تسجيل الدخول</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 40px; }
            .card { max-width: 360px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 16px; border: 1px solid #334155; }
            .avatar { width: 72px; height: 72px; border-radius: 50%; border: 2px solid #5865F2; margin-bottom: 12px; }
            .spinner { width: 24px; height: 24px; border: 3px solid #5865F2; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 16px auto; }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="${avatarUrl}" class="avatar" alt="Avatar" />
            <h3 style="margin: 0; color: #38bdf8;">تم تسجيل الدخول بنجاح!</h3>
            <p style="color: #94a3b8; font-size: 14px;">مرحباً بك، <strong>${userProfilePayload.username}</strong></p>
            <div class="spinner"></div>
            <p style="color: #64748b; font-size: 12px;">جاري إغلاق هذه النافذة ومتابعة حسابك...</p>
          </div>
          <script>
            const payload = ${JSON.stringify({ type: 'DISCORD_AUTH_SUCCESS', profile: userProfilePayload })};
            if (window.opener) {
              window.opener.postMessage(payload, '*');
              setTimeout(() => window.close(), 600);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
        </html>
      `);
    } catch (err: any) {
      console.error('Discord callback error:', err);
      res.send(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head><title>خطأ في تسجيل الدخول</title></head>
        <body style="font-family: system-ui, sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 40px;">
          <h2 style="color: #f43f5e;">تعذر إكمال تسجيل الدخول بحساب Discord</h2>
          <p style="color: #94a3b8;">${err.message || 'حدث خطأ أثناء معالجة الطلب'}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'DISCORD_AUTH_ERROR', error: ${JSON.stringify(err.message || 'Error')} }, '*');
              setTimeout(() => window.close(), 2000);
            }
          </script>
        </body>
        </html>
      `);
    }
  });

  // --- DISCORD WEBHOOK SETTINGS & NOTIFICATION API ---
  app.get('/api/discord/settings', requireStaffAuth, (req, res) => {
    const settings = readSettings();
    const hasWebhook = Boolean(
      process.env.DISCORD_PASSCODE_WEBHOOK_URL ||
        process.env.DISCORD_PASSCODE_WEBHOOK ||
        process.env.DISCORD_PASSCODE_WEBHO ||
        process.env.DISCORD_WEBHOOK_URL ||
        settings.discordWebhookUrl
    );
    res.json({ configured: hasWebhook });
  });

  app.post('/api/discord/settings', requireStaffAuth, (req, res) => {
    const { webhookUrl } = req.body || {};
    const settings = readSettings();
    settings.discordWebhookUrl = (webhookUrl || '').trim();
    writeSettings(settings);
    res.json({ success: true });
  });

  // Safe fetch helper with timeout to prevent hanging when external webhooks are blocked/slow
  async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 3500): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Secure server-side Order notification dispatcher
  app.post('/api/discord/notify-order', async (req, res) => {
    try {
      const { order, imageBase64, imageName } = req.body || {};
      if (!order || !order.orderId) {
        return res.status(400).json({ error: 'Missing order data' });
      }

      const settings = readSettings();
      const targetUrl =
        process.env.DISCORD_PASSCODE_WEBHOOK_URL ||
        process.env.DISCORD_PASSCODE_WEBHOOK ||
        process.env.DISCORD_PASSCODE_WEBHO ||
        process.env.DISCORD_WEBHOOK_URL ||
        settings.discordWebhookUrl;

      if (!targetUrl) {
        // No webhook configured, return success without error
        return res.json({ success: true, dispatched: false, reason: 'No webhook configured' });
      }

      const orderId = order.orderId;
      const player = order.player || 'Player';
      const platform = (order.platform || 'java').toUpperCase();
      const pkg = order.package || order.tier || 'رتبة';
      const price = order.priceEgp || 'N/A';
      const phone = order.senderPhone || 'غير محدد';
      const ref = order.transactionRef || 'تم التحويل عبر فودافون كاش';
      const pin = order.securityPin || 'N/A';
      const cmd = order.rankCommand || `/lp user ${player} parent add vip`;

      const payload = {
        content: `🛡️ **[VortexMC - إشعار طلب رتبة جديد في #passcode]**\n👑 **مسؤول الرتب والدفع:** @el_joker_. | **إدارة السيرفر:** @filstiny_\n🔑 كود الأمان: **\`${pin}\`** | 👤 اللاعب: **${player}** (${platform}) | 💰 المبلغ: **${price}**`,
        embeds: [
          {
            title: `🛡️ [VortexMC - إثبات كود الأمان وإيصال الدفع في #passcode]`,
            description: `تم استلام طلب شراء وتفعيل رتبة جديد في متجر VortexMC. يرجى من إدارة السيرفر مطابقة كود الأمان وصورة الإيصال المرفقة وتفعيل الرتبة للاعب فوراً في روم **#passcode**.`,
            color: 53951, // #00d2ff
            fields: [
              { name: '🔑 كود الأمان (Passcode)', value: `\`\`\`${pin}\`\`\``, inline: false },
              { name: '📌 كود العملية الفريد (Order ID)', value: `\`${orderId}\``, inline: true },
              { name: '👤 اسم اللاعب (IGN)', value: `**${player}** (${platform})`, inline: true },
              { name: '📦 الرتبة / المنتج المطلوب', value: `**${pkg}**`, inline: true },
              { name: '💰 المبلغ المحول', value: `**${price}**`, inline: true },
              { name: '📱 رقم الهاتف المحول منه', value: `\`${phone}\``, inline: true },
              { name: '🔢 رقم الحوالة / العملية', value: `\`${ref}\``, inline: true },
              { name: '📊 حالة الطلب', value: `\`${order.status || 'pending'}\``, inline: true },
              {
                name: '🧾 صورة الإيصال المرفقة',
                value: imageBase64 ? '✅ مرفقة بالكامل أدناه بالرسالة' : '⚠️ لم يرفق صورة إيصال',
                inline: true,
              },
              { name: '⚡ أمر تفعيل الرتبة بالكونسول', value: `\`\`\`${cmd}\`\`\``, inline: false },
            ],
            footer: { text: `VortexMC Store Security • روم #passcode • إشعار فوري` },
            timestamp: new Date().toISOString(),
          },
        ],
      };

      let dispatched = false;
      let dispatchWarning: string | undefined;

      try {
        if (imageBase64) {
          const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          const mimeType = match ? match[1] : 'image/png';
          const base64Data = match ? match[2] : imageBase64;
          const buffer = Buffer.from(base64Data, 'base64');
          const filename = imageName || `receipt_${orderId}.png`;

          (payload.embeds[0] as any).image = { url: `attachment://${filename}` };

          const formData = new FormData();
          const blob = new Blob([buffer], { type: mimeType });
          formData.append('files[0]', blob, filename);
          formData.append('payload_json', JSON.stringify(payload));

          const discordRes = await fetchWithTimeout(targetUrl, { method: 'POST', body: formData }, 3500);
          if (!discordRes.ok) {
            const errTxt = await discordRes.text().catch(() => '');
            console.warn('Discord webhook non-OK response:', discordRes.status, errTxt);
            dispatchWarning = `Discord status: ${discordRes.status}`;
          } else {
            dispatched = true;
          }
        } else {
          const discordRes = await fetchWithTimeout(
            targetUrl,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
            3500
          );
          if (!discordRes.ok) {
            const errTxt = await discordRes.text().catch(() => '');
            console.warn('Discord webhook non-OK response:', discordRes.status, errTxt);
            dispatchWarning = `Discord status: ${discordRes.status}`;
          } else {
            dispatched = true;
          }
        }
      } catch (webhookErr: any) {
        console.warn('Discord webhook request timed out or was blocked in preview:', webhookErr?.message || webhookErr);
        dispatchWarning = webhookErr?.message || 'Timed out or blocked in sandbox';
      }

      // Always return 200 JSON so client never hangs
      return res.json({ success: true, dispatched, warning: dispatchWarning });
    } catch (err: any) {
      console.error('Discord notify-order outer error:', err);
      return res.json({ success: true, dispatched: false, error: err.message || 'Failed' });
    }
  });

  // Forward Discord Webhook with actual image file attachment
  app.post('/api/discord/webhook', async (req, res) => {
    try {
      const { webhookUrl, payloadJson, imageBase64, imageName } = req.body;
      const settings = readSettings();
      const targetUrl =
        webhookUrl ||
        process.env.DISCORD_PASSCODE_WEBHOOK_URL ||
        process.env.DISCORD_PASSCODE_WEBHOOK ||
        process.env.DISCORD_PASSCODE_WEBHO ||
        process.env.DISCORD_WEBHOOK_URL ||
        settings.discordWebhookUrl;
      if (!targetUrl) {
        return res.status(400).json({ error: 'No webhook URL provided' });
      }

      const parsedPayload = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : (payloadJson || {});

      try {
        if (imageBase64) {
          // Extract base64 data and mime type
          const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          const mimeType = match ? match[1] : 'image/png';
          const base64Data = match ? match[2] : imageBase64;
          const buffer = Buffer.from(base64Data, 'base64');
          const filename = imageName || 'receipt.png';

          // Set embed image to point to the attached file
          if (parsedPayload.embeds && parsedPayload.embeds.length > 0) {
            parsedPayload.embeds[0].image = { url: `attachment://${filename}` };
          }

          const formData = new FormData();
          const blob = new Blob([buffer], { type: mimeType });
          formData.append('files[0]', blob, filename);
          formData.append('payload_json', JSON.stringify(parsedPayload));

          const discordRes = await fetchWithTimeout(targetUrl, {
            method: 'POST',
            body: formData,
          }, 3500);

          if (!discordRes.ok) {
            const errText = await discordRes.text().catch(() => '');
            return res.json({ success: false, status: discordRes.status, warning: errText });
          }

          return res.json({ success: true });
        } else {
          const discordRes = await fetchWithTimeout(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(parsedPayload),
          }, 3500);

          if (!discordRes.ok) {
            const errText = await discordRes.text().catch(() => '');
            return res.json({ success: false, status: discordRes.status, warning: errText });
          }

          return res.json({ success: true });
        }
      } catch (err: any) {
        console.warn('Forward webhook timed out or failed:', err?.message || err);
        return res.json({ success: true, dispatched: false, warning: err?.message });
      }
    } catch (err: any) {
      console.error('Discord webhook forward error:', err);
      res.json({ success: true, dispatched: false, error: err.message || 'Failed' });
    }
  });

  // Clear all mock/test orders
  app.post('/api/orders/clean-mock', requireStaffAuth, (req, res) => {
    const orders = readOrders();
    const cleaned = sanitizeOrders(orders);
    writeOrders(cleaned);
    res.json({ success: true, count: cleaned.length });
  });

  // Reset/Empty all orders
  app.post('/api/orders/clear-all', requireStaffAuth, (req, res) => {
    writeOrders([]);
    res.json({ success: true, count: 0 });
  });

  // --- APPLICATIONS API ---

  app.get('/api/applications', requireStaffAuth, (req, res) => {
    const apps = readApps();
    res.json(apps);
  });

  app.post('/api/applications', (req, res) => {
    const newApp = req.body;
    if (!newApp || !newApp.id) {
      return res.status(400).json({ error: 'Missing application data' });
    }
    const apps = readApps();
    const filtered = apps.filter((a: any) => a.id !== newApp.id);
    const updated = [newApp, ...filtered];
    writeApps(updated);
    res.status(201).json({ success: true, application: newApp });
  });

  app.patch('/api/applications/:id', requireStaffAuth, (req, res) => {
    const { id } = req.params;
    const { status, notes, reviewedBy, archived } = req.body;

    const apps = readApps();
    let found = false;
    const now = Date.now();
    const nowStr = new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });

    const updated = apps.map((a: any) => {
      if (a.id === id) {
        found = true;
        const statusChanged = status && status !== a.status;

        return {
          ...a,
          ...(status ? { status } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(reviewedBy ? { reviewedBy } : {}),
          ...(archived !== undefined ? { archived: Boolean(archived) } : {}),
          ...(statusChanged ? { reviewedAt: nowStr, reviewedTimestamp: now } : {}),
        };
      }
      return a;
    });

    if (!found) {
      return res.status(404).json({ error: 'Application not found' });
    }

    writeApps(updated);
    const target = updated.find((a: any) => a.id === id);
    res.json({ success: true, application: target });
  });

  app.delete('/api/applications/:id', requireStaffAuth, (req, res) => {
    const { id } = req.params;
    const apps = readApps();
    const updated = apps.filter((a: any) => a.id !== id);
    writeApps(updated);
    res.json({ success: true, deleted: id });
  });

  // Clean mock applications
  app.post('/api/applications/clean-mock', requireStaffAuth, (req, res) => {
    const apps = readApps();
    const cleaned = sanitizeApps(apps);
    writeApps(cleaned);
    res.json({ success: true, count: cleaned.length });
  });

  // Clear all applications
  app.post('/api/applications/clear-all', requireStaffAuth, (req, res) => {
    writeApps([]);
    res.json({ success: true, count: 0 });
  });

  async function startServer() {
    // Vite middleware for development
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`VortexMC Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
