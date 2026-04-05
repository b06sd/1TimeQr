import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { tryAdmit, countAdmitted, listEntries } from "../models/fileStore";

// Presence of this file means the admin has run `npm run generate`
// and the system is officially open for scanning.
const QR_PATH = path.join(__dirname, "..", "generated", "wedding-qr.png");
function isSystemActive(): boolean {
  return fs.existsSync(QR_PATH);
}

const WEDDING_NAME = (process.env.WEDDING_NAME || "The Wedding").trim();
const WEDDING_DATE = (process.env.WEDDING_DATE || "").trim();
const CAPACITY = parseInt(process.env.CAPACITY || "300", 10);
// ISO date string e.g. "2026-04-20". Empty = no restriction.
const EVENT_DATE = (process.env.EVENT_DATE || "").trim();

/** Returns true if now >= EVENT_DATE (or no EVENT_DATE is set). */
function isEventDay(): boolean {
  if (!EVENT_DATE) return true;
  return Date.now() >= new Date(EVENT_DATE).getTime();
}

// ─────────────────────────────────────────────────────────────
// GET /scan
// Serves the guest-facing HTML page opened when they scan the QR.
// The page JS generates/retrieves a persistent deviceId from
// localStorage, then POSTs it to /api/scan/verify.
// ─────────────────────────────────────────────────────────────
export function getScanPage(_req: Request, res: Response): void {
  if (!isSystemActive()) {
    const footer =
      escHtml(WEDDING_NAME) +
      (WEDDING_DATE ? ` &middot; ${escHtml(WEDDING_DATE)}` : "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(503).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(WEDDING_NAME)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#fafafa;padding:1.5rem;}
    .card{background:#fff;border-radius:1.5rem;
          box-shadow:0 4px 32px rgba(0,0,0,.1);
          padding:2.5rem 2rem;max-width:380px;width:100%;text-align:center;}
    .icon{font-size:3.5rem;margin-bottom:1rem}
    .title{font-size:1.75rem;font-weight:700;margin-bottom:.5rem;color:#d97706}
    .msg{color:#4b5563;line-height:1.5}
    .footer{margin-top:2rem;font-size:.75rem;color:#9ca3af;
            border-top:1px solid #f3f4f6;padding-top:1rem}
  </style>
</head>
<body style="background:#fffbeb">
<div class="card">
  <div class="icon">&#x23F3;</div>
  <div class="title">Not Yet Active</div>
  <div class="msg">The entry system has not been activated yet. Please check back soon.</div>
  <div class="footer">${footer}</div>
</div>
</body>
</html>`);
    return;
  }

  const footer =
    escHtml(WEDDING_NAME) +
    (WEDDING_DATE ? ` &middot; ${escHtml(WEDDING_DATE)}` : "");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(WEDDING_NAME)} &mdash; Entry</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#f0f9ff;padding:1.5rem;transition:background .4s;
    }
    .card{
      background:#fff;border-radius:1.5rem;
      box-shadow:0 4px 32px rgba(0,0,0,.1);
      padding:2.5rem 2rem;max-width:400px;width:100%;text-align:center;
    }
    .icon{font-size:3.5rem;margin-bottom:1rem}
    .title{font-size:2rem;font-weight:800;margin-bottom:.5rem}
    .msg{color:#4b5563;line-height:1.5;font-size:1.05rem}
    .count-badge{font-size:4rem;font-weight:900;color:#0369a1;line-height:1}
    .count-badge .of{font-size:2rem;font-weight:600;color:#93c5fd}
    .count-label{color:#64748b;margin-bottom:1.5rem;font-size:.85rem;
                 text-transform:uppercase;letter-spacing:.08em}
    .admit-btn{
      display:block;width:100%;padding:1.25rem;
      background:#0369a1;color:#fff;border:none;border-radius:1rem;
      font-size:1.5rem;font-weight:800;cursor:pointer;
      letter-spacing:.04em;margin-bottom:.75rem;transition:background .2s;
    }
    .admit-btn:hover:not(:disabled){background:#0284c7}
    .admit-btn:disabled{background:#94a3b8;cursor:not-allowed}
    .remaining{color:#64748b;font-size:.85rem}
    /* ── Digital countdown ── */
    .countdown-wrap{margin:.5rem 0 1.25rem}
    .countdown-grid{display:flex;justify-content:center;gap:.5rem;margin-bottom:.4rem}
    .cd-cell{display:flex;flex-direction:column;align-items:center}
    .cd-digits{
      font-family:'Courier New',Courier,monospace;
      font-size:2.6rem;font-weight:900;line-height:1;
      background:#0f172a;color:#38bdf8;
      border-radius:.5rem;padding:.25rem .55rem;
      letter-spacing:.05em;
      box-shadow:inset 0 2px 6px rgba(0,0,0,.5),0 0 12px rgba(56,189,248,.3);
    }
    .cd-label{font-size:.6rem;text-transform:uppercase;letter-spacing:.1em;
              color:#94a3b8;margin-top:.3rem}
    .cd-sep{font-size:2.2rem;font-weight:900;color:#38bdf8;
            align-self:flex-start;margin-top:.15rem;line-height:1.2;
            text-shadow:0 0 8px rgba(56,189,248,.6)}
    .cd-until{font-size:.8rem;color:#64748b;margin-top:.25rem}
    .spinner{
      width:48px;height:48px;border:4px solid #e5e7eb;
      border-top-color:#6b7280;border-radius:50%;
      animation:spin .8s linear infinite;margin:0 auto 1.5rem;
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    .footer{margin-top:2rem;font-size:.75rem;color:#9ca3af;
            border-top:1px solid #f3f4f6;padding-top:1rem}
  </style>
</head>
<body>
<div class="card">
  <div id="content">
    <div class="spinner"></div>
    <div class="title" style="color:#6b7280">Loading&hellip;</div>
  </div>
  <div class="footer">${footer}</div>
</div>
<script>
(function () {
  var CAPACITY = ${CAPACITY};
  var EVENT_OPEN = ${isEventDay()};
  var EVENT_DATE_STR = '${escHtml(EVENT_DATE)}';

  // One-time nonce generated fresh each page load — NOT stored in localStorage.
  // Prevents double-admission if the security guard taps the button twice.
  var nonce = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

  function render(status, title, msg) {
    var palettes = {
      granted: { bg: '#f0fdf4', accent: '#16a34a', icon: '&#x2705;' },
      denied:  { bg: '#fef2f2', accent: '#dc2626', icon: '&#x274C;' },
      error:   { bg: '#fff7ed', accent: '#d97706', icon: '&#x26A0;&#xFE0F;' }
    };
    var p = palettes[status] || palettes.error;
    document.body.style.background = p.bg;
    document.getElementById('content').innerHTML =
      '<div class="icon">' + p.icon + '</div>' +
      '<div class="title" style="color:' + p.accent + '">' + title + '</div>' +
      '<div class="msg">' + (msg || '') + '</div>';
  }

  function renderReady(count) {
    var remaining = CAPACITY - count;
    document.body.style.background = '#f0f9ff';

    if (!EVENT_OPEN) {
      // Build the digital countdown display
      document.body.style.background = '#0f172a';
      document.querySelector('.card').style.background = '#1e293b';
      document.querySelector('.card').style.boxShadow = '0 4px 40px rgba(56,189,248,.15)';
      document.querySelector('.footer').style.color = '#475569';
      document.querySelector('.footer').style.borderTopColor = '#334155';

      var targetDate = EVENT_DATE_STR ? new Date(EVENT_DATE_STR) : null;

      function pad(n) { return String(n).padStart(2, '0'); }

      function buildGrid(d, h, m, s) {
        return '<div class="countdown-grid">' +
          '<div class="cd-cell"><div class="cd-digits">' + pad(d) + '</div><div class="cd-label">Days</div></div>' +
          '<div class="cd-sep">:</div>' +
          '<div class="cd-cell"><div class="cd-digits">' + pad(h) + '</div><div class="cd-label">Hrs</div></div>' +
          '<div class="cd-sep">:</div>' +
          '<div class="cd-cell"><div class="cd-digits">' + pad(m) + '</div><div class="cd-label">Min</div></div>' +
          '<div class="cd-sep">:</div>' +
          '<div class="cd-cell"><div class="cd-digits">' + pad(s) + '</div><div class="cd-label">Sec</div></div>' +
        '</div>';
      }

      function tick() {
        var now  = Date.now();
        var diff = targetDate ? Math.max(0, targetDate.getTime() - now) : 0;
        var td   = Math.floor(diff / 86400000);
        var th   = Math.floor((diff % 86400000) / 3600000);
        var tm   = Math.floor((diff % 3600000)  / 60000);
        var ts   = Math.floor((diff % 60000)    / 1000);
        document.getElementById('content').innerHTML =
          '<div style="color:#38bdf8;font-size:1rem;font-weight:700;letter-spacing:.08em;' +
               'text-transform:uppercase;margin-bottom:.9rem">' +
               '&#x1F48D; ' + (document.title.replace(' \u2014 Entry','')) + '</div>' +
          '<div class="countdown-wrap">' +
            buildGrid(td, th, tm, ts) +
            '<div class="cd-until">until the event</div>' +
          '</div>' +
          '<button class="admit-btn" disabled>NOT YET OPEN</button>';
      }

      tick();
      setInterval(tick, 1000);
      return;
    }

    var remaining = CAPACITY - count;
    document.body.style.background = '#f0f9ff';
    document.getElementById('content').innerHTML =
      '<div class="count-badge">' + count +
        '<span class="of"> / ' + CAPACITY + '</span></div>' +
      '<div class="count-label">admitted</div>' +
      '<button id="admit-btn" class="admit-btn">TAP TO ADMIT</button>' +
      '<div class="remaining">' + remaining + ' spot' + (remaining !== 1 ? 's' : '') + ' remaining</div>';

    document.getElementById('admit-btn').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Processing\u2026';

      fetch('/api/scan/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanNonce: nonce })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.granted) {
          render('granted', 'ADMITTED \u2705',
            data.count + ' / ' + CAPACITY + ' guests entered');
        } else if (data.reason === 'full') {
          render('denied', 'VENUE FULL',
            'All ' + CAPACITY + ' spots have been filled');
        } else {
          render('error', 'Error', data.error || 'Please try again');
          btn.disabled = false;
          btn.textContent = 'TAP TO ADMIT';
        }
      })
      .catch(function () {
        render('error', 'Connection Error', 'Please try again or see a staff member.');
        btn.disabled = false;
        btn.textContent = 'TAP TO ADMIT';
      });
    });
  }

  // Fetch current admission count then show the admit button
  fetch('/api/admin/stats')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var count = (data.data && typeof data.data.totalAdmitted === 'number')
        ? data.data.totalAdmitted : 0;
      if (count >= CAPACITY) {
        render('denied', 'VENUE FULL', 'All ' + CAPACITY + ' spots have been filled');
      } else {
        renderReady(count);
      }
    })
    .catch(function () {
      render('error', 'Could Not Load',
        'Unable to fetch entry status. Check connection and try again.');
    });
})();
</script>
</body>
</html>`);
}

// ─────────────────────────────────────────────────────────────
// POST /api/scan/verify
// Body: { deviceId: string }
// Called by the JS in the scan page.
// Uses the unique index on deviceId for atomic duplicate detection.
// ─────────────────────────────────────────────────────────────
export async function verifyScan(req: Request, res: Response): Promise<void> {
  const ip =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    "";
  const ua = req.headers["user-agent"] || "";
  const { scanNonce } = req.body;

  if (!isSystemActive()) {
    res.status(503).json({ granted: false, error: "System not active" });
    return;
  }

  if (!isEventDay()) {
    res.status(403).json({
      granted: false,
      error: "Entry not yet open",
      eventDate: EVENT_DATE,
    });
    return;
  }

  if (!scanNonce || typeof scanNonce !== "string" || scanNonce.trim() === "") {
    res.status(400).json({ granted: false, error: "Missing scanNonce" });
    return;
  }

  // Validate UUID format — rejects malformed / injected values
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(scanNonce.trim())) {
    res.status(400).json({ granted: false, error: "Invalid scanNonce" });
    return;
  }

  const cleanNonce = scanNonce.trim();

  try {
    const result = await tryAdmit(
      { scanNonce: cleanNonce, ipAddress: ip, userAgent: ua },
      CAPACITY,
    );

    if (result.admitted) {
      res.json({ granted: true, count: result.count, capacity: CAPACITY });
    } else if (result.reason === "full") {
      res.json({
        granted: false,
        reason: "full",
        count: CAPACITY,
        capacity: CAPACITY,
      });
    } else {
      // Duplicate nonce — button double-tapped; treat as success
      res.json({ granted: true, count: countAdmitted(), capacity: CAPACITY });
    }
  } catch (err: unknown) {
    console.error("verifyScan error:", err);
    res.status(500).json({ granted: false, error: "Server error" });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/stats
// ─────────────────────────────────────────────────────────────
export function getStats(_req: Request, res: Response): void {
  const total = countAdmitted();
  res.json({
    success: true,
    data: {
      totalAdmitted: total,
      capacity: CAPACITY,
      remaining: Math.max(0, CAPACITY - total),
    },
  });
}

// ─────────────────────────────────────────────────────────────
// GET /api/admin/scans — paginated list of all admitted devices
// ─────────────────────────────────────────────────────────────
export function listScans(req: Request, res: Response): void {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(req.query.limit as string) || 50),
  );
  const { records, total } = listEntries(page, limit);
  res.json({
    success: true,
    data: records,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
