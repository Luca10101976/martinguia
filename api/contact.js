function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 80;
const MAX_EMAIL_LEN = 254;
const MAX_MESSAGE_LEN = 3000;
const MAX_SOURCE_LEN = 120;
const MAX_HONEYPOT_LEN = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MIN_FORM_FILL_MS = 1500;
const MAX_FORM_AGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://www.martinguia.cz",
  "https://martinguia.cz"
]);

function toTrimmedString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getClientIp(req) {
  const forwarded = toTrimmedString(req.headers["x-forwarded-for"]);
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = toTrimmedString(req.headers["x-real-ip"]);
  if (realIp) return realIp;
  return toTrimmedString(req.socket && req.socket.remoteAddress) || "unknown";
}

function parseUrlOrigin(value) {
  const raw = toTrimmedString(value);
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch (_) {
    return "";
  }
}

function parseAllowedOrigins() {
  const fromEnv = toTrimmedString(process.env.CONTACT_ALLOWED_ORIGINS);
  if (!fromEnv) return DEFAULT_ALLOWED_ORIGINS;
  const items = fromEnv
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set(items);
}

function isAllowedOrigin(req, allowedOrigins) {
  const requestOrigin = parseUrlOrigin(req.headers.origin);
  if (requestOrigin) return allowedOrigins.has(requestOrigin);
  const refererOrigin = parseUrlOrigin(req.headers.referer);
  if (refererOrigin) return allowedOrigins.has(refererOrigin);
  return true;
}

function isRateLimited(ip) {
  const now = Date.now();
  const store = (globalThis.__mgContactRateLimit = globalThis.__mgContactRateLimit || new Map());
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count += 1;
  return false;
}

async function verifyTurnstileToken({ token, secret, ip }) {
  const payload = new URLSearchParams();
  payload.set("secret", secret);
  payload.set("response", token);
  if (ip) payload.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload
  });

  if (!response.ok) return false;
  const result = await response.json();
  return Boolean(result && result.success === true);
}

async function sendViaResend({ from, to, subject, html, replyTo }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      reply_to: replyTo
    })
  });

  if (!response.ok) {
    throw new Error(`Resend API error ${response.status}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const { RESEND_API_KEY } = process.env;
  const turnstileSecret = toTrimmedString(process.env.TURNSTILE_SECRET_KEY);
  const turnstileSiteKey = toTrimmedString(process.env.TURNSTILE_SITE_KEY);
  const toEmail = process.env.CONTACT_TO_EMAIL || "info@martinguia.cz";
  const fromEmail = toTrimmedString(process.env.CONTACT_FROM_EMAIL);
  const clientIp = getClientIp(req);
  const allowedOrigins = parseAllowedOrigins();

  let body = req.body || {};
  if (typeof body === "string") {
    body = Object.fromEntries(new URLSearchParams(body));
  }

  const jmeno = toTrimmedString(body.jmeno);
  const email = toTrimmedString(body.email).toLowerCase();
  const zprava = toTrimmedString(body.zprava);
  const source = toTrimmedString(body.source || "Neznámá stránka");
  const website = toTrimmedString(body.website);
  const sentAtRaw = toTrimmedString(body.sent_at);
  const turnstileToken = toTrimmedString(body["cf-turnstile-response"]);
  const isEs = source.includes("-es.html") || String(req.headers.referer || "").includes("-es.html");
  const successRedirect = isEs ? "/kontakt-es.html?odeslano=1" : "/kontakt.html?odeslano=1";
  const errorRedirect = isEs ? "/kontakt-es.html?chyba=odeslani" : "/kontakt.html?chyba=odeslani";
  const limitRedirect = isEs ? "/kontakt-es.html?chyba=limit" : "/kontakt.html?chyba=limit";
  const captchaRedirect = isEs ? "/kontakt-es.html?chyba=captcha" : "/kontakt.html?chyba=captcha";
  const configRedirect = isEs ? "/kontakt-es.html?chyba=konfigurace" : "/kontakt.html?chyba=konfigurace";

  if (!isAllowedOrigin(req, allowedOrigins)) {
    return res.redirect(302, errorRedirect);
  }

  if (isRateLimited(clientIp)) {
    res.setHeader("Retry-After", String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return res.redirect(302, limitRedirect);
  }

  if (!RESEND_API_KEY || !fromEmail || !turnstileSecret || !turnstileSiteKey) {
    return res.redirect(302, configRedirect);
  }

  if (
    !jmeno ||
    !email ||
    !zprava ||
    jmeno.length > MAX_NAME_LEN ||
    email.length > MAX_EMAIL_LEN ||
    zprava.length > MAX_MESSAGE_LEN ||
    source.length > MAX_SOURCE_LEN ||
    website.length > MAX_HONEYPOT_LEN ||
    website !== "" ||
    !EMAIL_REGEX.test(email)
  ) {
    return res.redirect(302, errorRedirect);
  }

  const sentAt = Number(sentAtRaw);
  const age = Date.now() - sentAt;
  if (!sentAtRaw || !Number.isFinite(sentAt) || age < MIN_FORM_FILL_MS || age > MAX_FORM_AGE_MS) {
    return res.redirect(302, errorRedirect);
  }

  if (!turnstileToken || turnstileToken.length > 2048) {
    return res.redirect(302, captchaRedirect);
  }
  try {
    const ok = await verifyTurnstileToken({
      token: turnstileToken,
      secret: turnstileSecret,
      ip: clientIp
    });
    if (!ok) return res.redirect(302, captchaRedirect);
  } catch (_) {
    return res.redirect(302, captchaRedirect);
  }

  const safeName = escapeHtml(jmeno);
  const safeEmail = escapeHtml(email);
  const safeMessage = escapeHtml(zprava).replace(/\n/g, "<br />");
  const safeSource = escapeHtml(source);
  const safeSubjectName = jmeno.replace(/[\r\n]+/g, " ").slice(0, MAX_NAME_LEN);

  const subject = `Martin Guía | Nový dotaz: ${safeSubjectName}`;
  const html = `
    <div style="background:#f3faf5;padding:24px 12px;font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d1fae5;border-radius:14px;overflow:hidden">
        <div style="background:#166534;padding:18px 22px">
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700">Nový dotaz z webu Martin Guía</h1>
        </div>
        <div style="padding:20px 22px">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.03em">Jméno</td>
              <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:16px">${safeName}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.03em">E-mail</td>
              <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:16px"><a href="mailto:${safeEmail}" style="color:#166534;text-decoration:none">${safeEmail}</a></td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.03em">Stránka</td>
              <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:16px">${safeSource}</td>
            </tr>
          </table>
          <p style="margin:18px 0 8px;color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.03em">Zpráva</p>
          <div style="padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;font-size:16px">${safeMessage}</div>
        </div>
      </div>
      <p style="max-width:680px;margin:12px auto 0;color:#6b7280;font-size:12px;text-align:center">Odesláno z <a href="https://www.martinguia.cz" style="color:#166534;text-decoration:none">www.martinguia.cz</a></p>
    </div>
  `;

  try {
    await sendViaResend({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
      replyTo: email
    });
    return res.redirect(302, successRedirect);
  } catch (error) {
    console.error("Contact form send failed", {
      ip: clientIp,
      message: String(error && error.message ? error.message : "unknown error")
    });
    return res.redirect(302, errorRedirect);
  }
}
