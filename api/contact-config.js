export default function handler(_req, res) {
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    turnstileSiteKey
  });
}
