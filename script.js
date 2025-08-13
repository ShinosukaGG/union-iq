/* ==========================
   CONFIG / BRAND / CONSTANTS
========================== */
const SUPABASE_APIKEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmxxYnR3cWV0bHRkY3Zpb2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMjM4MzMsImV4cCI6MjA2OTU5OTgzM30.d-leDFpzc6uxDvq47_FC0Fqh0ztaL11Oozm-z6T9N_M';
const SUPABASE_URL =
  'https://bvvlqbtwqetltdcvioie.supabase.co/rest/v1';

const TABLE_LEADERBOARD = 'leaderboard_full_0208';
const TABLE_S0 = 'yaps_season_zero';
const TABLE_S1 = 'yaps_season_one';

// Union brand
const BRAND = { cyan: '#A0ECFD', black: '#000000', text: '#E9EEF2' };

// IQ axis range (for the chart)
const IQ_MIN = 55;
const IQ_MAX = 145;

// Section badges (small image on chart)
const BADGES = [
  { min: 55,  max: 85,  src: 'retard1.png' },
  { min: 86,  max: 115, src: 'retard2.png' },
  { min: 116, max: 145, src: 'retard3.png' }
];

// Special exceptions → 999+ IQ + retard4.png
const GODS = new Set([
  '0xkaiserkarel',
  'corcoder',
  'e_beriker',
  'eastwood_nft',
  'shinosuka_eth',
  'luknyb'
]);

/* ==========================
   HELPERS
========================== */
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function showToast(msg){
  const el = $('#toast'); if(!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 1600);
}
function getQueryParam(name){
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}
function setQueryParam(name, value){
  const u = new URL(window.location.href);
  if(value==null || value==='') u.searchParams.delete(name);
  else u.searchParams.set(name, value);
  history.replaceState(null,'',u.toString());
}

/* ==========================
   SUPABASE FETCHERS
========================== */
async function fetchUserFromLeaderboard(username){
  const H = { 'apikey': SUPABASE_APIKEY, 'Authorization': `Bearer ${SUPABASE_APIKEY}` };
  const tbl = TABLE_LEADERBOARD;

  const tryFetch = async url => {
    const r = await fetch(url, { headers: H });
    if (!r.ok) {
      console.error('Leaderboard fetch failed', r.status, r.statusText, await r.text());
      return [];
    }
    return r.json();
  };

  const uenc = encodeURIComponent(username);
  let users = await tryFetch(`${SUPABASE_URL}/${tbl}?select=*&display_name=ilike.${uenc}`);
  let user  = users.find(u => (u.display_name||'').toLowerCase()===username.toLowerCase());

  if (!user) {
    users = await tryFetch(`${SUPABASE_URL}/${tbl}?select=*&username=ilike.${uenc}`);
    user  = users.find(u => (u.username||'').toLowerCase()===username.toLowerCase());
  }
  if (!user) {
    users = await tryFetch(`${SUPABASE_URL}/${tbl}?select=*&display_name=ilike.%25${uenc}%25`);
    user  = users[0];
  }
  if (!user) {
    users = await tryFetch(`${SUPABASE_URL}/${tbl}?select=*&username=ilike.%25${uenc}%25`);
    user  = users[0];
  }
  return user || null;
}

async function fetchMindshare(table, username){
  const H = { 'apikey': SUPABASE_APIKEY, 'Authorization': `Bearer ${SUPABASE_APIKEY}` };
  const eqUrl    = `${SUPABASE_URL}/${table}?select=*&username=eq.${encodeURIComponent(username)}`;
  const ilikeUrl = `${SUPABASE_URL}/${table}?select=*&username=ilike.%25${encodeURIComponent(username)}%25`;

  let r = await fetch(eqUrl,{headers:H});
  if(!r.ok){
    console.error(`${table} eq fetch failed`, r.status, r.statusText, await r.text());
  }
  let data = r.ok ? await r.json() : [];

  if(!data?.length){
    r = await fetch(ilikeUrl,{headers:H});
    if(!r.ok){
      console.error(`${table} ilike fetch failed`, r.status, r.statusText, await r.text());
    }
    data = r.ok ? await r.json() : [];
  }
  if(!data?.length) return 0;

  let found = data.find(d => (d.username||'').toLowerCase()===username.toLowerCase()) || data[0];
  let val = null;

  if(found?.jsonInput){
    try{
      const j = typeof found.jsonInput==='string' ? JSON.parse(found.jsonInput) : found.jsonInput;
      if(j?.mindshare != null) val = j.mindshare;
    }catch(e){ console.warn('jsonInput parse', e); }
  }
  if(val==null && found?.mindshare!=null) val = found.mindshare;

  if(val==null) return 0;
  if(typeof val==='string') val = val.replace('%','').trim();
  const num = Number(String(val).replace(',','.'));
  if(Number.isNaN(num)) return 0;

  // S1 table often stores a fraction; earlier we multiplied by 100 at fetch time.
  // We'll also guard in computeSum to autoscale fractions to % so no double-errors.
  return table===TABLE_S1 ? num*100 : num;
}

async function getUnionIQUserData(username){
  const u = await fetchUserFromLeaderboard(username);
  if(!u) return null;

  const uname = (u.username || u.display_name || username).trim();
  let pfp = u.pfp || 'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png';
  let xp  = Number(u.total_xp || 0);

  if(u?.jsonInput){
    try{
      const j = typeof u.jsonInput==='string' ? JSON.parse(u.jsonInput) : u.jsonInput;
      pfp = j.pfp || pfp;
      xp  = Number(j.total_xp || xp);
    }catch{}
  }

  const [s0, s1p] = await Promise.all([
    fetchMindshare(TABLE_S0, uname),
    fetchMindshare(TABLE_S1, uname)
  ]);

  return { username: uname, pfp, xp, s0: Number(s0)||0, s1: Number(s1p)||0 };
}

/* ==========================
   IQ MATH — SUM → NORM → BANDS → DISCRETE IQ
========================== */

// Sum with auto-scaling: if S0/S1 ≤ 1, treat as fractions → convert to %
function computeSum(xp, s0Raw, s1Raw){
  const xpn = Number(xp || 0) / 1000;                 // xp/1000
  const s0p = (s0Raw == null) ? 0 : (Number(s0Raw) <= 1 ? Number(s0Raw)*100 : Number(s0Raw));
  const s1p = (s1Raw == null) ? 0 : (Number(s1Raw) <= 1 ? Number(s1Raw)*100 : Number(s1Raw));
  return xpn + s0p + s1p;
}

// Normalize by a fixed cap so 0..cap → 0..1
const SUM_MIN = 0;
// Tune this to your data spread. 60 means sum=7.2 → norm=0.12 (low threshold).
const SUM_MAX = 60;

function normalizeSum(sum){
  return (clamp(sum, SUM_MIN, SUM_MAX) - SUM_MIN) / (SUM_MAX - SUM_MIN || 1);
}

// Bands on normalized value (exact thresholds you gave)
const TH_HI  = 0.045;   // below => High IQ
const TH_MID = 0.12;    // [0.045, 0.12) => Mid, 0.12+ => Low

function bandFromNorm(n){
  if(n < TH_HI) return 'high';
  if(n < TH_MID) return 'mid';
  return 'low';
}

function bandLabel(band){
  if(band === 'high') return 'High IQ';
  if(band === 'mid')  return 'Mid IQ';
  return 'Low IQ';
}

// Discrete IQ bins so each user gets a specific number per sub-range
const HIGH_BINS = [145, 142, 139, 136, 133, 130]; // within [0, 0.045)
const MID_BINS  = [129, 127, 125, 123, 121, 119, 117, 115, 113, 111, 109, 107, 105, 103, 101, 100]; // [0.045, 0.12)
const LOW_BINS  = [99, 97, 95, 93, 91, 89, 87, 85, 83, 81, 79, 77, 75, 73, 71, 69, 67, 65, 62, 60, 58, 55]; // [0.12, 1]

// Map n within [a,b) into a bin list deterministically
function pickBin(n, a, b, bins){
  if(b <= a) return bins[bins.length-1];
  const t = clamp((n - a) / (b - a), 0, 0.999999); // 0..just under 1
  const idx = Math.floor(t * bins.length);
  return bins[idx];
}

function discreteIQFromNorm(n){
  if(n < TH_HI){
    return pickBin(n, 0, TH_HI, HIGH_BINS);
  }else if(n < TH_MID){
    return pickBin(n, TH_HI, TH_MID, MID_BINS);
  }else{
    return pickBin(n, TH_MID, 1, LOW_BINS);
  }
}

function badgeForIQ(iq){
  if(iq === 999) return 'retard4.png';
  for(const b of BADGES){
    if(iq >= b.min && iq <= b.max) return b.src;
  }
  return BADGES[BADGES.length-1].src;
}

/* ==========================
   CHART.JS (curve + dotted line + avatar pin)
========================== */
let chart, avatarImg = null;

function normalPdf(x, mu=100, sigma=15){
  const a = 1/(sigma*Math.sqrt(2*Math.PI));
  const e = Math.exp(-0.5 * Math.pow((x-mu)/sigma,2));
  return a*e;
}
function buildCurvePoints(){
  const pts = [];
  for(let x=IQ_MIN; x<=IQ_MAX; x+=0.5){
    pts.push({ x, y: normalPdf(x) });
  }
  return pts;
}
function loadAvatar(src){
  return new Promise((resolve)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=> resolve(img);
    img.onerror = ()=> resolve(null);
    img.src = src;
  });
}

function renderChart(iq){
  const ctx = $('#iqChart').getContext('2d');
  if(chart){ chart.destroy(); chart = null; }

  const points = buildCurvePoints();
  const markerPlugin = {
    id: 'iqMarker',
    afterDatasetsDraw(c,args,opts){
      const {ctx, chartArea, scales} = c;
      const x = scales.x.getPixelForValue(opts.iqLine);

      // dotted vertical line
      ctx.save();
      ctx.setLineDash([6,4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(160,236,253,.9)';
      ctx.beginPath();
      ctx.moveTo(x, chartArea.bottom);
      ctx.lineTo(x, chartArea.top);
      ctx.stroke();
      ctx.restore();

      // avatar pin
      if(avatarImg){
        const r = 16;
        const y = chartArea.top + 18;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.clip();
        ctx.drawImage(avatarImg, x-r, y-r, r*2, r*2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, r+1, 0, Math.PI*2);
        ctx.strokeStyle = '#A0ECFD';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  };

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        data: points,            // {x,y}
        parsing: true,
        fill: true,
        borderColor: BRAND.cyan,
        backgroundColor: 'rgba(160,236,253,.22)',
        pointRadius: 0,
        tension: 0.25,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          min: IQ_MIN,
          max: IQ_MAX,
          ticks: {
            callback: v => [55,70,85,100,115,130,145].includes(v) ? v : '',
            autoSkip: false,
            maxRotation: 0,
            color: BRAND.text,
            font: { size: 11, family: 'JetBrains Mono' }
          },
          grid: { display: false }
        },
        y: { display: false }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        iqMarker: { iqLine: iq }
      },
      animation: { duration: 320 }
    },
    plugins: [markerPlugin]
  });
}

/* ==========================
   MAIN LOOKUP
========================== */
async function runLookup(handleRaw){
  const input = handleRaw.replace(/^@/,'').trim();
  if(!input){ showToast('Enter an X username'); return; }
  setQueryParam('username', input);

  const data = await getUnionIQUserData(input).catch(()=>null);
  if(!data){ showToast('User not found'); return; }

  avatarImg = await loadAvatar(data.pfp);

  const isGod = GODS.has(data.username.toLowerCase());
  let iqDisplay, iqForChart, bandTxt;

  if(isGod){
    iqDisplay = '999+';
    iqForChart = IQ_MAX;
    bandTxt = 'High IQ';
  }else{
    const sum  = computeSum(data.xp, data.s0, data.s1);
    const norm = normalizeSum(sum);             // 0..1
    const band = bandFromNorm(norm);            // 'high' | 'mid' | 'low'
    const iq   = discreteIQFromNorm(norm);      // discrete IQ number

    iqDisplay  = String(iq);
    iqForChart = iq;
    bandTxt    = bandLabel(band);
  }

  // Populate UI
  $('#result').style.display = '';
  $('#handle').textContent = '@'+data.username;
  $('#iqValue').textContent = iqDisplay;
  $('#iqLabel').textContent = bandTxt;

  // Chart + badge
  renderChart(iqForChart);
  const badgeEl = $('#sectionBadge');
  badgeEl.src = (iqDisplay === '999+') ? 'retard4.png' : badgeForIQ(Number(iqDisplay));
  badgeEl.style.display = 'block';
}

/* ==========================
   EVENTS / INIT
========================== */
function wireEvents(){
  const input = $('#usernameInput');
  const btn   = $('#checkBtn');
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ runLookup(input.value); }});
  btn.addEventListener('click', ()=> runLookup(input.value));

  $('#copyBtn').addEventListener('click', ()=>{
    const u = new URL(window.location.href);
    navigator.clipboard.writeText(u.toString()).then(()=>showToast('Link copied'));
  });

  $('#downloadBtn').addEventListener('click', async ()=>{
    const node = $('#card');
    const canvas = await html2canvas(node, { backgroundColor: null, scale: 2, useCORS: true });
    const link = document.createElement('a');
    link.download = 'union-iq.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  $('#shareBtn').addEventListener('click', ()=>{
    const handle = $('#handle').textContent || '';
    const iq = $('#iqValue').textContent || '';
    const u = new URL(window.location.href);
    const text = `I scored ${iq} on the Union IQ Checker 🧠\n\nAm i Not Smart? 🤓\nCheck Your IQ: union-iq.vercel.app\n\nYou dont have to be smart to preach @union_build\n\nhttps://x.com/Shinosuka_eth/status/1955529120122802279?t=xU5s59m41M8M8kYt3nwEQQ&s=19`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  wireEvents();
  const q = getQueryParam('username');
  if(q){
    $('#usernameInput').value = q;
    runLookup(q);
  }
});
