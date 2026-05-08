// ---- STORAGE LAYER ----
const storage = {
  getUsers() { return JSON.parse(localStorage.getItem('tc_users') || '{}'); },
  saveUsers(users) { localStorage.setItem('tc_users', JSON.stringify(users)); },
  getSession() { return JSON.parse(localStorage.getItem('tc_session') || 'null'); },
  setSession(user) { localStorage.setItem('tc_session', JSON.stringify(user)); },
  clearSession() { localStorage.removeItem('tc_session'); },
  hash(pw) { let h=0; for(let i=0;i<pw.length;i++) h=(Math.imul(31,h)+pw.charCodeAt(i))|0; return h.toString(36); },
  register(username, email, pw) {
    const users = this.getUsers(), key = email.toLowerCase();
    if(users[key]) return { ok: false, field: 'email', msg: 'Email exists' };
    if(Object.values(users).some(u=>u.username.toLowerCase()===username.toLowerCase())) return { ok:false, field:'username', msg:'Username taken' };
    users[key] = { username, email:key, hash:this.hash(pw), joined:Date.now(), history:[], bestWpm:0 };
    this.saveUsers(users);
    return { ok:true, user:users[key] };
  },
  login(email, pw) {
    const users = this.getUsers(), key = email.toLowerCase(), u = users[key];
    if(!u) return { ok: false, field:'email', msg:'No account' };
    if(u.hash !== this.hash(pw)) return { ok:false, field:'pass', msg:'Wrong password' };
    return { ok:true, user:u };
  },
  addResult(email, result) {
    const users = this.getUsers(), key = email.toLowerCase();
    if(!users[key]) return null;
    users[key].history.unshift(result);
    if(users[key].history.length > 80) users[key].history.pop();
    if(result.wpm > (users[key].bestWpm||0)) users[key].bestWpm = result.wpm;
    this.saveUsers(users);
    this.setSession(users[key]);
    return users[key];
  }
};

// ---- GLOBAL STATE ----
let currentUser = storage.getSession();
let testState = { 
  active: false, finished: false, words: [], wordIdx:0, charIdx:0, typedMap: [], 
  startTime: null, correctChars:0, wrongChars:0, extraChars:0, wpmLog:[], 
  timerInterval:null, timeLeft:0, mode:'words', extraFlags:{ punct:false, numbers:false }, 
  amount:25, stopOnError:false, caret:'line', fontSize:26 
};

// ---- WORD LISTS ----
const commonWords = ["the","be","to","of","and","a","in","that","have","it","for","not","on","with","he","as","you","do","at","this","but","his","by","from","they","we","say","her","she","or","an","will","my","one","all","would","there","their","what","so","up","out","if","about","who","get","which","go","me","when","make","can","like","time","no","just","him","know","take","people","into","year","your","good","some","could","them","see","other","than","then","now","look","only","come","its","over","think","also","back","after","use","two","how","our","work","first","well","way","even","new","want","because","any","these","give","day","most","us","great","between","need","large","often","hand","high","place","hold","turn","without","follow","act","ask","men","change","went","light","kind","off","house","picture","try","again","animal","point","play","small","number","always","music","those","both","mark","book","letter","until","mile","river","car","feet","care","second","enough","plain","girl","usual","young","ready","above","ever","red","list","though","feel","talk","bird","soon","body","dog","family","direct","pose","leave","real","life","few","north","open","seem","together","next","white","children","begin","got","walk","paper","group","every","always","music","start","city","earth","eye","light","thought","head","under","story","saw","left","few","while","along","might","close","something","seem","next","hard","open","example","begin","life","always","those","both","paper","together","got","group","often","run","important","until","children","side","feet","car","mile","night","walk","white","sea","began","grow","took","river","four","carry","state","once","book","hear","stop","without","second","late","miss","idea","enough","eat","face","watch","far","Indian","real","almost","let","above","girl","sometimes","mountains","cut","young","talk","soon","list","song","being","leave","family","its"];
const punctChars = [".",",","!","?",";",":","—"];
const quotes = [
  "The only way to do great work is to love what you do.",
  "In the middle of every difficulty lies opportunity.",
  "It does not matter how slowly you go as long as you do not stop.",
  "Life is what happens when you are busy making other plans.",
  "The future belongs to those who believe in the beauty of their dreams.",
  "Success is not final failure is not fatal it is the courage to continue that counts."
];

// ---- HELPER FUNCTIONS ----
function showToast(msg, type='') { 
  const t = document.getElementById('toastMsg'); 
  t.innerText = msg; 
  t.className = 'toast' + (type ? ' ' + type : ''); 
  t.classList.add('show'); 
  setTimeout(()=>t.classList.remove('show'), 2400); 
}

function updateNavUI() {
  const authDiv = document.getElementById('authButtons'), avatar = document.getElementById('avatarToggle'), profileNav = document.getElementById('navProfileBtn');
  if(currentUser) {
    authDiv.style.display = 'none'; avatar.style.display = 'flex'; avatar.textContent = currentUser.username[0].toUpperCase();
    document.getElementById('dropdownName').innerText = currentUser.username;
    document.getElementById('dropdownEmail').innerText = currentUser.email;
    profileNav.style.display = '';
  } else {
    authDiv.style.display = 'flex'; avatar.style.display = 'none'; profileNav.style.display = 'none';
  }
}

// ---- MODAL FUNCTIONS ----
function openModal(id) { document.getElementById(id+'Modal').classList.add('show'); }
function closeModal(id) { document.getElementById(id+'Modal').classList.remove('show'); }
function switchModal(closeId, openId) { closeModal(closeId); openModal(openId); }

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim(), pwd = document.getElementById('loginPassword').value;
  if(!email||!pwd) { showToast('Fill all fields','error-t'); return; }
  const res = storage.login(email, pwd);
  if(!res.ok) { showToast(res.msg,'error-t'); return; }
  currentUser = res.user; storage.setSession(currentUser); updateNavUI(); closeModal('login'); 
  showToast(`Welcome ${currentUser.username} ✨`, 'success'); navigateTo('test'); restartTest();
}
function doRegister() {
  const un = document.getElementById('regUsername').value.trim(), em = document.getElementById('regEmail').value.trim(), p1 = document.getElementById('regPassword').value, p2 = document.getElementById('regPassword2').value;
  if(un.length<2) { showToast('Username min 2','error-t'); return; } 
  if(!em.includes('@')) { showToast('Valid email','error-t'); return; } 
  if(p1.length<6) { showToast('Password >5 chars','error-t'); return; } 
  if(p1 !== p2) { showToast('Passwords mismatch','error-t'); return; }
  const reg = storage.register(un, em, p1);
  if(!reg.ok) { showToast(reg.msg,'error-t'); return; }
  currentUser = reg.user; storage.setSession(currentUser); updateNavUI(); closeModal('register'); 
  showToast('Account created!', 'success'); navigateTo('test'); restartTest();
}
function logout() { currentUser = null; storage.clearSession(); updateNavUI(); navigateTo('test'); showToast('Logged out'); restartTest(); }
function toggleDropdown() { document.getElementById('profileDropdown').classList.toggle('show'); }
function closeDropdown() { document.getElementById('profileDropdown').classList.remove('show'); }
document.addEventListener('click', e => { if(!e.target.closest('#avatarToggle') && !e.target.closest('#profileDropdown')) closeDropdown(); });

// ---- NAVIGATION ----
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  if(page==='test') { 
    document.getElementById('testPage').classList.add('active'); 
    document.getElementById('navTestBtn').classList.add('active');
    if(document.getElementById('resultsView').classList.contains('show')) restartTest();
  } else if(page==='profile') {
    if(!currentUser){ openModal('login'); return; }
    document.getElementById('profilePage').classList.add('active');
    document.getElementById('navProfileBtn').classList.add('active');
    renderProfile();
  }
}

// ---- WORD GENERATION ----
function genWords(n) {
  const w = [];
  for(let i=0;i<n;i++) {
    let word = commonWords[Math.floor(Math.random()*commonWords.length)];
    if(testState.extraFlags.numbers && Math.random()<0.2) word = Math.floor(Math.random()*999).toString();
    if(testState.extraFlags.punct && Math.random()<0.15) word += punctChars[Math.floor(Math.random()*punctChars.length)];
    w.push(word);
  }
  return w;
}
function getWords() {
  if(testState.mode==='quote') return quotes[Math.floor(Math.random()*quotes.length)].split(' ');
  if(testState.mode==='zen') return genWords(300);
  return genWords(testState.amount);
}

// ---- RENDER TYPING INTERFACE ----
function renderWords() {
  const container = document.getElementById('wordsDisplay');
  container.innerHTML = '';
  testState.words.forEach((word, wi) => {
    const wordSpan = document.createElement('span');
    wordSpan.className = 'word'; wordSpan.id = `w${wi}`;
    word.split('').forEach((ch, ci) => {
      const charSpan = document.createElement('span');
      charSpan.className = 'char'; charSpan.id = `c${wi}-${ci}`;
      charSpan.textContent = ch;
      wordSpan.appendChild(charSpan);
    });
    container.appendChild(wordSpan);
  });
  const cursorSpan = document.createElement('span');
  cursorSpan.className = 'cursor-blink'; cursorSpan.id = 'caretEl';
  container.appendChild(cursorSpan);
  updateCaretPosition();
  applyCaretStyle();
  document.getElementById('wordsDisplay').style.fontSize = testState.fontSize + 'px';
}
function updateCaretPosition() {
  const cur = document.getElementById('caretEl');
  if(!cur || testState.caret==='off') { if(cur) cur.style.display='none'; return; }
  cur.style.display = '';
  const container = document.getElementById('wordsDisplay');
  const containerRect = container.getBoundingClientRect();
  const ref = document.getElementById(`c${testState.wordIdx}-${testState.charIdx}`);
  if(ref) {
    const r = ref.getBoundingClientRect();
    cur.style.left = (r.left - containerRect.left + container.scrollLeft) + 'px';
    cur.style.top = (r.top - containerRect.top) + 'px';
    cur.style.height = r.height + 'px';
  }
}
function applyCaretStyle() {
  const d = document.getElementById('wordsDisplay');
  d.classList.remove('caret-underline','caret-block');
  if(testState.caret==='underline') d.classList.add('caret-underline');
  if(testState.caret==='block') d.classList.add('caret-block');
}
function focusHiddenInput() { document.getElementById('hiddenTypeInput').focus(); }
function scrollToWord() {
  const el = document.getElementById(`w${testState.wordIdx}`);
  const container = document.getElementById('wordsDisplay');
  if(el && container && el.offsetTop > container.clientHeight/2) container.scrollTop = el.offsetTop - container.clientHeight/3;
}

// ---- TYPING LOGIC ----
function startTest() {
  if(testState.active) return;
  testState.active = true;
  testState.startTime = Date.now();
  testState.wpmLog = [];
  document.getElementById('statWpm').classList.add('active');
  document.getElementById('statAcc').classList.add('active');
  document.getElementById('statTime').classList.add('active');
  if(testState.mode === 'time') {
    testState.timeLeft = testState.amount;
    testState.timerInterval = setInterval(() => {
      testState.timeLeft--;
      updateLiveStats();
      if(testState.timeLeft <= 0) { clearInterval(testState.timerInterval); finishTest(); }
    }, 1000);
  }
  setInterval(() => {
    if(testState.active && !testState.finished) updateLiveStats();
  }, 1000);
}
function updateLiveStats() {
  if(!testState.active || testState.finished) return;
  const elapsed = (Date.now() - testState.startTime) / 1000;
  const wpm = Math.round((testState.correctChars / 5) / (elapsed / 60));
  const acc = ((testState.correctChars + testState.wrongChars) === 0) ? 100 : Math.round((testState.correctChars / (testState.correctChars + testState.wrongChars)) * 100);
  document.getElementById('statWpm').querySelector('.stat-value').innerText = elapsed>1 ? wpm : '—';
  document.getElementById('statAcc').querySelector('.stat-value').innerText = acc;
  const timeDisplay = testState.mode==='time' ? testState.timeLeft+'s' : Math.round(elapsed)+'s';
  document.getElementById('statTime').querySelector('.stat-value').innerText = timeDisplay;
  testState.wpmLog.push(wpm);
}
function handleCharInput(ch) {
  if(testState.finished) return;
  if(!testState.active) startTest();
  const word = testState.words[testState.wordIdx];
  if(!word) return;
  if(testState.stopOnError && testState.charIdx < word.length && ch !== word[testState.charIdx]) {
    const errEl = document.getElementById(`c${testState.wordIdx}-${testState.charIdx}`);
    if(errEl) { errEl.classList.add('wrong'); setTimeout(()=>errEl.classList.remove('wrong'),200); }
    return;
  }
  if(testState.charIdx < word.length) {
    const charEl = document.getElementById(`c${testState.wordIdx}-${testState.charIdx}`);
    if(charEl) {
      if(ch === word[testState.charIdx]) { charEl.classList.add('correct'); testState.correctChars++; }
      else { charEl.classList.add('wrong'); testState.wrongChars++; }
    }
    testState.charIdx++;
  } else {
    const wordSpan = document.getElementById(`w${testState.wordIdx}`);
    const extraSpan = document.createElement('span');
    extraSpan.className = 'char extra wrong';
    extraSpan.textContent = ch;
    wordSpan.appendChild(extraSpan);
    testState.extraChars++;
  }
  if(!testState.typedMap[testState.wordIdx]) testState.typedMap[testState.wordIdx] = '';
  testState.typedMap[testState.wordIdx] += ch;
  updateCaretPosition();
  updateProgress();
}
function handleBackspace(ctrl) {
  if(!testState.active) return;
  if(ctrl) { while(testState.charIdx > 0) deleteChar(); return; }
  if(testState.charIdx > 0) deleteChar();
  else if(testState.wordIdx > 0) {
    testState.wordIdx--;
    testState.charIdx = (testState.typedMap[testState.wordIdx] || '').length;
    const prevWordSpan = document.getElementById(`w${testState.wordIdx}`);
    if(prevWordSpan) prevWordSpan.querySelectorAll('.extra').forEach(e=>e.remove());
    deleteChar();
    scrollToWord();
  }
  updateCaretPosition();
  updateProgress();
}
function deleteChar() {
  testState.charIdx--;
  const charEl = document.getElementById(`c${testState.wordIdx}-${testState.charIdx}`);
  if(charEl) {
    if(charEl.classList.contains('correct')) testState.correctChars--;
    if(charEl.classList.contains('wrong')) testState.wrongChars--;
    charEl.classList.remove('correct','wrong');
  }
  if(testState.typedMap[testState.wordIdx]) testState.typedMap[testState.wordIdx] = testState.typedMap[testState.wordIdx].slice(0,-1);
}
function handleSpace() {
  if(!testState.active) return;
  const word = testState.words[testState.wordIdx];
  if(!word || testState.charIdx===0) return;
  for(let i=testState.charIdx; i<word.length; i++) {
    const el = document.getElementById(`c${testState.wordIdx}-${i}`);
    if(el && !el.classList.contains('correct') && !el.classList.contains('wrong')) {
      el.classList.add('wrong'); testState.wrongChars++;
    }
  }
  testState.wordIdx++;
  testState.charIdx = 0;
  if(testState.wordIdx >= testState.words.length) {
    if(testState.mode === 'zen') { testState.words.push(...genWords(50)); renderWords(); }
    else { finishTest(); return; }
  }
  scrollToWord();
  updateCaretPosition();
  updateProgress();
}
function updateProgress() {
  const fill = document.getElementById('progressFill');
  fill.style.width = Math.min((testState.wordIdx / testState.words.length) * 100, 100) + '%';
}
function finishTest() {
  if(testState.finished) return;
  testState.finished = true;
  testState.active = false;
  if(testState.timerInterval) clearInterval(testState.timerInterval);
  const elapsed = Math.max((Date.now() - testState.startTime) / 1000, 1);
  const wpm = Math.round((testState.correctChars / 5) / (elapsed / 60));
  const acc = ((testState.correctChars + testState.wrongChars) === 0) ? 100 : Math.round((testState.correctChars / (testState.correctChars + testState.wrongChars)) * 100);
  document.getElementById('finalWpm').innerText = wpm;
  document.getElementById('finalAcc').innerText = acc + '%';
  document.getElementById('finalChars').innerText = `${testState.correctChars}/${testState.wrongChars}/${testState.extraChars}`;
  let isNewBest = false;
  if(currentUser && wpm>0) {
    const prevBest = currentUser.bestWpm || 0;
    const result = { wpm, acc, elapsed: Math.round(elapsed), correct: testState.correctChars, wrong: testState.wrongChars, extra: testState.extraChars, mode: testState.mode, amount: testState.amount, date: Date.now() };
    const updated = storage.addResult(currentUser.email, result);
    if(updated) { currentUser = updated; updateNavUI(); }
    if(wpm > prevBest && prevBest > 0) isNewBest = true;
  }
  document.getElementById('bestBanner').classList.toggle('show', isNewBest);
  document.getElementById('testView').style.display = 'none';
  document.getElementById('resultsView').classList.add('show');
}
function restartTest() {
  if(testState.timerInterval) clearInterval(testState.timerInterval);
  testState = {
    active: false, finished: false, words: getWords(), wordIdx:0, charIdx:0, typedMap: [],
    startTime: null, correctChars:0, wrongChars:0, extraChars:0, wpmLog:[],
    timerInterval:null, timeLeft:0, mode: testState.mode, extraFlags: testState.extraFlags,
    amount: testState.amount, stopOnError: testState.stopOnError, caret: testState.caret, fontSize: testState.fontSize
  };
  document.getElementById('statWpm').querySelector('.stat-value').innerText = '—';
  document.getElementById('statAcc').querySelector('.stat-value').innerText = '—';
  document.getElementById('statTime').querySelector('.stat-value').innerText = '—';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('testView').style.display = '';
  document.getElementById('resultsView').classList.remove('show');
  document.getElementById('bestBanner').classList.remove('show');
  document.querySelectorAll('.stat-item').forEach(s=>s.classList.remove('active'));
  renderWords();
  focusHiddenInput();
}

// ---- SETTINGS CONTROLS ----
function setTestMode(mode) {
  testState.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
  const amountSec = document.getElementById('amountSection');
  if(mode==='time') {
    amountSec.querySelectorAll('.mode-btn').forEach((b,i)=>b.innerText=['15s','30s','60s','120s'][i]);
    setAmountVal(30);
  } else if(mode==='words') {
    amountSec.querySelectorAll('.mode-btn').forEach((b,i)=>b.innerText=['10','25','50','100'][i]);
    setAmountVal(25);
  }
  amountSec.style.display = (mode==='quote'||mode==='zen') ? 'none' : '';
  restartTest();
}
function setAmountVal(amt) {
  testState.amount = amt;
  document.querySelectorAll('#amountSection .mode-btn').forEach(btn=>btn.classList.remove('active'));
  document.querySelector(`#amountSection .mode-btn[data-amt="${amt}"]`).classList.add('active');
  restartTest();
}
function setModeOpt(type) {
  if(type==='punct') testState.extraFlags.punct = !testState.extraFlags.punct;
  if(type==='numbers') testState.extraFlags.numbers = !testState.extraFlags.numbers;
  restartTest();
}
function toggleSettings() { document.getElementById('settingsPanel').classList.toggle('show'); }
function setCaretStyle(style) { testState.caret = style; applyCaretStyle(); const c = document.getElementById('caretEl'); if(c) c.style.display = style==='off'?'none':''; updateCaretPosition(); }
function setFontSizePref(sz) { testState.fontSize = sz; document.getElementById('wordsDisplay').style.fontSize = sz+'px'; setTimeout(updateCaretPosition,30); }
function setStopOnErr(val) { testState.stopOnError = val; }

// ---- PROFILE RENDER ----
function renderProfile() {
  const user = storage.getUser ? storage.getUser(currentUser.email) : storage.getUsers()[currentUser.email];
  if(!user) return;
  const history = user.history || [];
  const bestWpm = user.bestWpm || 0;
  const avgWpm = history.length ? Math.round(history.slice(0,20).reduce((s,r)=>s+r.wpm,0)/Math.min(20,history.length)) : 0;
  const avgAcc = history.length ? Math.round(history.slice(0,20).reduce((s,r)=>s+r.acc,0)/Math.min(20,history.length)) : 0;
  const container = document.getElementById('profileContainer');
  container.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${user.username[0].toUpperCase()}</div>
      <div class="profile-info"><div class="profile-name">${escapeHtml(user.username)}</div><div class="profile-email">${escapeHtml(user.email)}</div></div>
      <div class="profile-rating"><div class="rating-label">ELO</div><div class="rating-value">${Math.floor(bestWpm * 1.5 + history.length)}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:28px">
      <div class="result-card"><div class="result-card-label">Best WPM</div><div class="result-card-value">${bestWpm}</div></div>
      <div class="result-card"><div class="result-card-label">Avg WPM</div><div class="result-card-value">${avgWpm}</div></div>
      <div class="result-card"><div class="result-card-label">Avg Acc</div><div class="result-card-value">${avgAcc}%</div></div>
      <div class="result-card"><div class="result-card-label">Tests</div><div class="result-card-value">${history.length}</div></div>
    </div>
    <div class="section-title">📜 Recent Tests</div>
    ${history.length===0 ? '<div class="empty-state">No tests yet. Start typing!</div>' : `
    <table class="history-table"><thead><tr><th>WPM</th><th>Acc</th><th>Mode</th><th>Date</th></tr></thead><tbody>
      ${history.slice(0,30).map(r=>`<tr><td><span class="wpm-pill">${r.wpm}</span></td><td><span class="acc-pill">${r.acc}%</span></td><td>${r.mode}</td><td style="color:var(--muted)">${new Date(r.date).toLocaleDateString()}</td></tr>`).join('')}
    </tbody></table>`}
  `;
}
function escapeHtml(str) { return str.replace(/[&<>]/g, function(m){if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m;}); }
storage.getUser = (email) => storage.getUsers()[email.toLowerCase()];

// ---- INPUT HANDLER ----
function setupInputHandler() {
  const inp = document.getElementById('hiddenTypeInput');
  inp.onkeydown = (e) => {
    if(e.key === 'Tab') { e.preventDefault(); restartTest(); return; }
    if(e.key === 'Backspace') { e.preventDefault(); handleBackspace(e.ctrlKey||e.metaKey); return; }
    if(e.key === ' ') { e.preventDefault(); handleSpace(); return; }
  };
  inp.oninput = (e) => {
    const v = e.target.value;
    if(v && v[v.length-1] !== ' ') { const ch = v[v.length-1]; handleCharInput(ch); }
    inp.value = '';
  };
}
function init() {
  updateNavUI();
  setupInputHandler();
  restartTest();
  window.addEventListener('resize', updateCaretPosition);
}
init();
