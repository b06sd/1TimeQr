import { Request, Response } from "express";
import { tryAdmit, countAdmitted, listEntries } from "../models/fileStore";

// Strip surrounding quotes Railway sometimes adds, then trim whitespace.
function cleanEnv(val: string | undefined, fallback = ""): string {
  return (val || fallback)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

const WEDDING_NAME = cleanEnv(
  process.env.WEDDING_NAME,
  "Aisha & Francis Wedding",
);
const WEDDING_DATE = cleanEnv(process.env.WEDDING_DATE);
const CAPACITY = parseInt(
  cleanEnv(process.env.CAPACITY, "300").replace(/[^0-9]/g, "") || "300",
  10,
);

// ISO date string e.g. "2026-04-25T12:00:00Z". Empty = locked (fail closed).
const EVENT_DATE = cleanEnv(process.env.EVENT_DATE);
// PIN the security guard must enter before the admit button is shown.
const GUARD_PIN = cleanEnv(process.env.GUARD_PIN);
const BASE_URL = cleanEnv(process.env.BASE_URL);
// Secret token embedded in the QR code URL — validates the QR is the real one.
const WEDDING_TOKEN = cleanEnv(process.env.WEDDING_TOKEN);

// Startup diagnostic — visible in Railway logs.
console.log(
  "[config] CAPACITY=%d EVENT_DATE=%s isEventDay=%s",
  CAPACITY,
  EVENT_DATE || "(unset)",
  isEventDay(),
);

/** Returns true only when EVENT_DATE is set, valid, and now >= that date. */
function isEventDay(): boolean {
  if (!EVENT_DATE) return false;
  const t = new Date(EVENT_DATE).getTime();
  if (isNaN(t)) {
    console.error("[config] EVENT_DATE is invalid:", EVENT_DATE);
    return false;
  }
  return Date.now() >= t;
}

// ─────────────────────────────────────────────────────────────
// GET /scan
// Serves the guest-facing HTML page opened when they scan the QR.
// The page JS generates/retrieves a persistent deviceId from
// localStorage, then POSTs it to /api/scan/verify.
// ─────────────────────────────────────────────────────────────
export function getScanPage(req: Request, res: Response): void {
  // Validate the token embedded in the QR code URL.
  // If missing or wrong, this is not a genuine QR scan — reject it.
  const token = ((req.query.token as string) || "").trim();
  if (WEDDING_TOKEN && token !== WEDDING_TOKEN) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invalid QR</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
         background:url('/img_bg_aisha_francis.png') center/cover no-repeat fixed;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:1.5rem;}
    body::before{content:'';position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:0}
    .card{position:relative;z-index:1;background:rgba(255,255,255,.12);
          backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.2);
          border-radius:1.5rem;padding:2.5rem 2rem;max-width:360px;
          width:100%;text-align:center;color:#fff;}
    .icon{font-size:3rem;margin-bottom:.75rem}
    .title{font-size:1.6rem;font-weight:800;color:#f87171;margin-bottom:.5rem}
    .msg{color:rgba(255,255,255,.8);line-height:1.5}
  </style>
</head>
<body>
<div class="card">
  <div class="icon">&#x274C;</div>
  <div class="title">Invalid QR Code</div>
  <div class="msg">Please scan the official wedding QR code to enter.</div>
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
      background:url('/img_bg_aisha_francis.png') center center/cover no-repeat fixed;
      padding:1.5rem;transition:background .4s;
    }
    body::before{
      content:'';position:fixed;inset:0;
      background:rgba(0,0,0,0.45);
      z-index:0;
    }
    .card{
      position:relative;z-index:1;
      background:rgba(255,255,255,0.12);
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      border:1px solid rgba(255,255,255,0.25);
      border-radius:1.5rem;
      box-shadow:0 8px 40px rgba(0,0,0,.4);
      padding:2.5rem 2rem;max-width:400px;width:100%;text-align:center;
      color:#fff;
    }
    .icon{font-size:3.5rem;margin-bottom:1rem}
    .title{font-size:2rem;font-weight:800;margin-bottom:.5rem;color:#fff}
    .msg{color:rgba(255,255,255,.85);line-height:1.5;font-size:1.05rem}
    .count-badge{font-size:4rem;font-weight:900;color:#fff;line-height:1}
    .count-badge .of{font-size:2rem;font-weight:600;color:rgba(255,255,255,.6)}
    .count-label{color:rgba(255,255,255,.7);margin-bottom:1.5rem;font-size:.85rem;
                 text-transform:uppercase;letter-spacing:.08em}
    .admit-btn{
      display:block;width:100%;padding:1.25rem;
      background:#0369a1;color:#fff;border:none;border-radius:1rem;
      font-size:1.5rem;font-weight:800;cursor:pointer;
      letter-spacing:.04em;margin-bottom:.75rem;transition:background .2s;
    }
    .admit-btn:hover:not(:disabled){background:#0284c7}
    .admit-btn:disabled{background:#94a3b8;cursor:not-allowed}
    .remaining{color:rgba(255,255,255,.7);font-size:.85rem}
    /* ── PIN gate ── */
    .pin-wrap{margin-bottom:1.25rem}
    .pin-input{
      width:100%;padding:.75rem 1rem;font-size:1.5rem;letter-spacing:.3em;
      text-align:center;border-radius:.75rem;
      border:2px solid rgba(255,255,255,.3);
      background:rgba(255,255,255,.15);color:#fff;
      outline:none;margin-bottom:.6rem;
    }
    .pin-input::placeholder{letter-spacing:.05em;color:rgba(255,255,255,.4)}
    .pin-input:focus{border-color:rgba(255,255,255,.7)}
    .pin-error{color:#fca5a5;font-size:.85rem;min-height:1.1em}
    /* ── QR Scanner ── */
    .scanner-wrap{position:relative;border-radius:1rem;overflow:hidden;background:#000;margin-bottom:.75rem}
    .scanner-video{width:100%;display:block;max-height:260px;object-fit:cover}
    .scanner-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
    .scanner-frame{
      width:55%;aspect-ratio:1;border-radius:.75rem;
      border:3px solid rgba(56,189,248,.9);
      box-shadow:0 0 0 9999px rgba(0,0,0,.35);
      transition:border-color .3s;
    }
    .scanner-hint{color:rgba(255,255,255,.7);font-size:.82rem;margin-bottom:.6rem}
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
    .cd-until{font-size:.8rem;color:rgba(255,255,255,.6);margin-top:.25rem}
    .spinner{
      width:48px;height:48px;border:4px solid rgba(255,255,255,.2);
      border-top-color:rgba(255,255,255,.8);border-radius:50%;
      animation:spin .8s linear infinite;margin:0 auto 1.5rem;
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    .footer{margin-top:2rem;font-size:.75rem;color:rgba(255,255,255,.5);
            border-top:1px solid rgba(255,255,255,.15);padding-top:1rem}
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
  var CAPACITY       = ${CAPACITY};
  var EVENT_OPEN     = ${isEventDay()};
  var EVENT_DATE_STR = '${escHtml(EVENT_DATE)}';
  var GUARD_PIN      = '${escHtml(GUARD_PIN)}';
  var SESSION_KEY    = '1tqr_guard_auth';
  var _admitGen      = 0; // increments on each renderAdmit call to cancel stale fetches

  function genNonce() {
    return (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
          var r=(Math.random()*16)|0;
          return(c==='x'?r:(r&0x3)|0x8).toString(16);
        });
  }

  function showResult(status, title, msg, autoReset) {
    var icons  = {granted:'&#x2705;', denied:'&#x274C;', error:'&#x26A0;&#xFE0F;'};
    var colors = {granted:'#4ade80',  denied:'#f87171',  error:'#fbbf24'};
    document.getElementById('content').innerHTML =
      '<div class="icon">'+(icons[status]||'&#x26A0;&#xFE0F;')+'</div>'+
      '<div class="title" style="color:'+(colors[status]||'#fbbf24')+'">'+title+'</div>'+
      '<div class="msg">'+(msg||'')+'</div>';
    if (autoReset) setTimeout(function(){ renderAdmit(0); }, 2500);
  }

  function renderAdmit(knownCount) {
    var count = (typeof knownCount === 'number') ? knownCount : 0;
    var nonce = genNonce();
    var remaining = CAPACITY - count;
    var myGen = ++_admitGen; // snapshot — stale fetch callbacks will see myGen !== _admitGen
    document.getElementById('content').innerHTML =
      '<div class="count-badge">'+count+
        '<span class="of"> / '+CAPACITY+'</span></div>'+
      '<div class="count-label">admitted</div>'+
      '<button id="admit-btn" class="admit-btn">TAP TO ADMIT</button>'+
      '<div class="remaining">'+remaining+' spot'+(remaining!==1?'s':'')+' remaining</div>';
    document.getElementById('admit-btn').addEventListener('click', function(){
      var btn=this; btn.disabled=true; btn.textContent='Processing\u2026';
      fetch('/api/scan/verify',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({scanNonce:nonce})
      })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.granted){
          showResult('granted','ADMITTED \u2705', d.count+' / '+CAPACITY+' guests entered', true);
        } else if (d.reason==='full'){
          showResult('denied','VENUE FULL','All '+CAPACITY+' spots have been filled', false);
        } else {
          showResult('error','Error', d.error||'Please try again', false);
          setTimeout(function(){ renderAdmit(count); }, 2000);
        }
      })
      .catch(function(){
        showResult('error','Connection Error','Please try again or see a staff member.', false);
        setTimeout(function(){ renderAdmit(count); }, 2000);
      });
    });
    // One-shot background count sync — dropped if a newer render has already run
    fetch('/api/admin/stats')
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (myGen !== _admitGen) return; // stale — a newer renderAdmit already took over
        var c=(data.data&&typeof data.data.totalAdmitted==='number')?data.data.totalAdmitted:count;
        if (c !== count) renderAdmit(c);
      })
      .catch(function(){});
  }

  // ── PIN gate + admit — called both on initial open and when countdown ends ──
  function startAdmitUI() {
    if (GUARD_PIN && sessionStorage.getItem(SESSION_KEY)!=='1') {
      document.getElementById('content').innerHTML=
        '<div class="title" style="color:#fff;margin-bottom:.75rem">&#x1F512; Guard Access</div>'+
        '<div class="msg" style="margin-bottom:1rem">Enter your PIN to continue</div>'+
        '<div class="pin-wrap">'+
          '<input id="pin-input" class="pin-input" type="password" inputmode="numeric" maxlength="10" placeholder="PIN" autocomplete="off" />'+
          '<div id="pin-error" class="pin-error"></div>'+
        '</div>'+
        '<button id="pin-btn" class="admit-btn">UNLOCK</button>';
      function attemptPin(){
        var entered=document.getElementById('pin-input').value;
        if (entered===GUARD_PIN){
          sessionStorage.setItem(SESSION_KEY,'1');
          renderAdmit(0);
        } else {
          document.getElementById('pin-error').textContent='Incorrect PIN. Try again.';
          document.getElementById('pin-input').value='';
          document.getElementById('pin-input').focus();
        }
      }
      document.getElementById('pin-btn').addEventListener('click',attemptPin);
      document.getElementById('pin-input').addEventListener('keydown',function(e){
        if(e.key==='Enter')attemptPin();
      });
      document.getElementById('pin-input').focus();
    } else {
      renderAdmit(0);
    }
  }

  // ── Countdown (before event date) ──────────────────────────
  if (!EVENT_OPEN) {
    var targetDate = EVENT_DATE_STR ? new Date(EVENT_DATE_STR) : null;
    var targetMs   = targetDate ? targetDate.getTime() : NaN;
    // If no valid date is configured, show a static locked message — never reload
    if (!targetDate || isNaN(targetMs)) {
      document.getElementById('content').innerHTML=
        '<div class="icon">&#x1F512;</div>'+
        '<div class="title" style="color:#94a3b8">Not Yet Open</div>'+
        '<div class="msg">Check back on the day of the event.</div>';
      return;
    }
    var countdownTimer;
    function pad(n){ return String(n).padStart(2,'0'); }
    function buildGrid(d,h,m,s){
      return '<div class="countdown-grid">'+
        '<div class="cd-cell"><div class="cd-digits">'+pad(d)+'</div><div class="cd-label">Days</div></div>'+
        '<div class="cd-sep">:</div>'+
        '<div class="cd-cell"><div class="cd-digits">'+pad(h)+'</div><div class="cd-label">Hrs</div></div>'+
        '<div class="cd-sep">:</div>'+
        '<div class="cd-cell"><div class="cd-digits">'+pad(m)+'</div><div class="cd-label">Min</div></div>'+
        '<div class="cd-sep">:</div>'+
        '<div class="cd-cell"><div class="cd-digits">'+pad(s)+'</div><div class="cd-label">Sec</div></div>'+
      '</div>';
    }
    function tick(){
      var now  = Date.now();
      var diff = Math.max(0, targetMs - now);
      if (diff <= 0) {
        clearInterval(countdownTimer); // stop the ticker
        startAdmitUI();                // transition directly — no page reload
        return;
      }
      var td=Math.floor(diff/86400000);
      var th=Math.floor((diff%86400000)/3600000);
      var tm=Math.floor((diff%3600000)/60000);
      var ts=Math.floor((diff%60000)/1000);
      document.getElementById('content').innerHTML=
        '<div style="color:#38bdf8;font-size:1rem;font-weight:700;letter-spacing:.08em;'+
             'text-transform:uppercase;margin-bottom:.9rem">'+
             '&#x1F48D; '+(document.title.replace(' \u2014 Entry',''))+'</div>'+
        '<div class="countdown-wrap">'+
          buildGrid(td,th,tm,ts)+
          '<div class="cd-until">until the event</div>'+
        '</div>'+
        '<button class="admit-btn" disabled>NOT YET OPEN</button>';
    }
    tick(); countdownTimer = setInterval(tick, 1000);
    return;
  }

  // ── Event is open — straight to PIN / admit ─────────────────
  startAdmitUI();
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
