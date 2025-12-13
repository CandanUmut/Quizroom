import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================
// Supabase config & constants
// =============================================================
const SUPABASE_URL = "https://rnatxpcjqszgjlvznhwd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuYXR4cGNqcXN6Z2psdnpuaHdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMTA4OTEsImV4cCI6MjA4MDg4Njg5MX0.rwuFyq0XdXDG822d2lUqdxHvTq4OAIUtdXebh0aXCCc";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LS_CLIENT_ID = "quiz_client_id_v1";
const LS_LAST_ROOM = "quiz_last_room_slug";
const LS_LAST_NAME = "quiz_last_participant_name";
const LS_LANG = "quiz_lang";
const LS_THEME = "quiz_theme";
const LS_PROFILE = "quiz_profile";
const LS_STATS = "quiz_stats";
const LS_SOUND = "quiz_sound";

// =============================================================
// Global state & helpers
// =============================================================
let clientId = null;
let currentRoom = null;
let me = null; // quiz_participants row
let participants = [];
let questions = [];
let myQuestions = [];
let roomChannel = null;
let timerInterval = null;
let currentQuestion = null;
let questionEndTime = null;
let effectiveQuestionStartMs = null;
let hasAnsweredCurrent = false;
let confettiTimeout = null;
let confettiPlayed = false;
let revealMode = false;
let questionStartedAtMs = null;
let resultsRendered = false;
let activeQuestionId = null;
let currentLang = localStorage.getItem(LS_LANG) || "tr";
let currentTheme = localStorage.getItem(LS_THEME) || "dark";
let profileData = null;
let statsData = null;
let questionsFetchTimer = null;
let syncInterval = null;
let lastQuestionsCount = null;
let lastRoomHash = null;
let audioCtx = null;
let soundEnabled = localStorage.getItem(LS_SOUND) !== "off";
let myLastAnswerCorrect = null;
const answerStateByQuestionId = new Map();
const answeredMap = new Map();
const soundCooldowns = new Map();
const timerCueFlagsByQuestionId = new Map();
let overlayTimeout = null;
let overlayInterval = null;
let pendingQuestionRenderId = null;
let overlayEl = null;
let overlayMessageEl = null;
let readyShownForQuestionId = null;
const READY_BUFFER_MS = 2500;

const textMap = {
  tr: {
    title: "Ortak Quiz · Focus Arena",
    subtitle:
      "Oda aç, herkes soru eklesin, sonra aynı anda quiz oynayıp sıralamayı gör.",
    createTitle: "Yeni Oda Oluştur",
    joinTitle: "Koda Göre Katıl",
    labelName: "İsmin",
    labelTime: "Soru süresi (saniye)",
    labelCode: "Oda Kodu",
    btnCreate: "Oda Oluştur",
    btnJoin: "Odaya Katıl",
    joinHint: "Host sana oda kodunu veya linki paylaşabilir.",
    roomHeading: "Oda",
    code: "Kod:",
    host: "Host:",
    status: "Durum:",
    participants: "Katılımcı:",
    totalQuestions: "Toplam soru:",
    link: "Link:",
    participantsList: "Katılımcılar",
    backLobby: "Lobiye Dön",
    collectPhase: "Soru Toplama Fazı",
    collectHint:
      "Herkes kendi sorularını ekleyebilir. Host hazır olunca quiz'i başlatır.",
    addQuestion: "Soru Ekle",
    questionType: "Soru tipi",
    typeMcq: "Çoktan seçmeli",
    typeTf: "Doğru / Yanlış",
    questionText: "Soru metni",
    options: "Seçenekler",
    correctOption: "Doğru seçenek",
    tfHint: "Doğru / Yanlış soruları için seçenekler sabit: 'Doğru', 'Yanlış'.",
    correctAnswer: "Doğru cevap",
    questionTime: "Süre (saniye, boş bırak = oda varsayılan)",
    btnSaveQuestion: "Soruyu Ekle",
    btnNewQuestion: "+ Yeni",
    myQuestions: "Senin Soruların",
    myQuestionsHint: "Sadece başlayana kadar silebilirsin",
    roomQuestions: "Tüm Oda Soruları",
    roomQuestionsHint: "Host en az 1 soru sonrası başlatabilir",
    results: "Sonuçlar",
    resultsHint: "Doğru cevap sayısına göre sıralama.",
    statsTitle: "İstatistikler & Rozetler",
    statsHint: "Güncel oturumdan bağımsız olarak saklanır.",
    avatarTitle: "Avatar Seç",
    saveAvatar: "Kaydet",
    statusCollecting: "Soru toplanıyor",
    statusPlaying: "Quiz oynanıyor",
    statusFinished: "Tur tamamlandı",
    help: "Yardım",
    howToPlayTitle: "Nasıl oynanır?",
    howToPlaySteps: [
      "Oda oluştur ya da koda gir, ismini seç.",
      "Soru toplarken sorularını ekle; host başlattığında kilitlenir.",
      "Başlangıç geri sayımı (3-2-1) sonrası cevabını seç, gönderince kilitlenir.",
      "Puanlar hız + doğruluğa göre; sonuçta sıralama ve rozetler.",
      "Host Sonraki Soru/Bitir ile turu yönetir; oyuncular sadece cevaplar.",
    ],
    contextCollecting: "Sorularını ekle. Host hazır olunca başlatır.",
    contextPlaying: "Bir cevap seç, gönderdikten sonra değiştiremezsin.",
    contextFinished: "Tur bitti. Host yeni turu başlatabilir.",
    startingIn: "Başlıyor:",
    getReady: "Hazır ol!",
    getReadyShort: "Sıradaki soru geliyor...",
    tenSecondsLeft: "10 saniye kaldı!",
    fiveSecondsLeft: "5 saniye kaldı!",
  },
  en: {
    title: "Collaborative Quiz · Focus Arena",
    subtitle: "Open a room, let everyone add questions, then play together.",
    createTitle: "Create Room",
    joinTitle: "Join by Code",
    labelName: "Your name",
    labelTime: "Question timer (sec)",
    labelCode: "Room Code",
    btnCreate: "Create room",
    btnJoin: "Join room",
    joinHint: "Host can share the room code or link.",
    roomHeading: "Room",
    code: "Code:",
    host: "Host:",
    status: "Status:",
    participants: "Participants:",
    totalQuestions: "Total questions:",
    link: "Link:",
    participantsList: "Players",
    backLobby: "Back to lobby",
    collectPhase: "Question collection",
    collectHint: "Everyone adds their own questions. Host starts when ready.",
    addQuestion: "Add question",
    questionType: "Question type",
    typeMcq: "Multiple choice",
    typeTf: "True / False",
    questionText: "Question text",
    options: "Options",
    correctOption: "Correct option",
    tfHint: "Options are fixed for True/False questions.",
    correctAnswer: "Correct answer",
    questionTime: "Time (seconds, empty = room default)",
    btnSaveQuestion: "Save question",
    btnNewQuestion: "+ Add new",
    myQuestions: "Your questions",
    myQuestionsHint: "You can delete them until the quiz starts",
    roomQuestions: "Room questions",
    roomQuestionsHint: "Host can start after at least one question",
    results: "Results",
    resultsHint: "Ranking by number of correct answers.",
    statsTitle: "Stats & Badges",
    statsHint: "Stored beyond the current session.",
    avatarTitle: "Choose avatar",
    saveAvatar: "Save",
    statusCollecting: "Collecting questions",
    statusPlaying: "Quiz in progress",
    statusFinished: "Round finished",
    help: "Help",
    howToPlayTitle: "How to play",
    howToPlaySteps: [
      "Create a room or join with the code, pick a name.",
      "During collection add your questions; once the host starts they lock.",
      "After the 3-2-1 start, pick one option. Submissions can't be changed.",
      "Points reward speed + accuracy; scoreboard and badges show at the end.",
      "Host controls Next/Finish; players only submit answers.",
    ],
    contextCollecting: "Add your questions below. Host starts when ready.",
    contextPlaying: "Choose one answer. You can't change after submitting.",
    contextFinished: "Round ended. Host can start a new round.",
    startingIn: "Starting in:",
    getReady: "Get ready!",
    getReadyShort: "Next question loading...",
    tenSecondsLeft: "10 seconds left!",
    fiveSecondsLeft: "5 seconds left!",
  },
};

function t(key) {
  return textMap[currentLang]?.[key] || key;
}

function ensureClientId() {
  let id = localStorage.getItem(LS_CLIENT_ID);
  if (!id) {
    id = crypto?.randomUUID ? crypto.randomUUID() : `c_${Math.random()}`;
    localStorage.setItem(LS_CLIENT_ID, id);
  }
  clientId = id;
}

function randomSlug(len = 6) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

function updateUrlForRoom(slug) {
  if (!slug) return;
  const url = new URL(window.location.href);
  url.searchParams.set("room", slug);
  window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
}

function clearRoomFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  const query = url.searchParams.toString();
  const newUrl = query ? `${url.pathname}?${query}` : url.pathname;
  window.history.replaceState({}, "", newUrl);
}

function formatSeconds(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

async function ensureAudio() {
  if (!soundEnabled) return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch (err) {
      console.error("Audio resume failed", err);
    }
  }
  return audioCtx;
}

async function playTone({ freq = 440, durationMs = 180, type = "sine", gain = 0.04, slideTo }) {
  if (!soundEnabled) return;
  const ctx = await ensureAudio();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = freq;
  gainNode.gain.value = gain;
  oscillator.connect(gainNode).connect(ctx.destination);

  const now = ctx.currentTime;
  if (slideTo) {
    oscillator.frequency.linearRampToValueAtTime(slideTo, now + durationMs / 1000);
  }
  oscillator.start(now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  oscillator.stop(now + durationMs / 1000 + 0.05);
}

function throttleSound(type, cooldownMs = 150) {
  const now = Date.now();
  const last = soundCooldowns.get(type) || 0;
  if (now - last < cooldownMs) return false;
  soundCooldowns.set(type, now);
  return true;
}

async function playSound(type) {
  if (!soundEnabled) return;
  if (!throttleSound(type, 180)) return;
  switch (type) {
    case "click":
      await playTone({ freq: 540, durationMs: 70, type: "square", gain: 0.035 });
      break;
    case "submit":
      await playTone({ freq: 720, durationMs: 160, type: "triangle", gain: 0.05 });
      break;
    case "start":
      await playTone({ freq: 520, slideTo: 880, durationMs: 320, type: "sawtooth", gain: 0.05 });
      break;
    case "correct":
      await playTone({ freq: 880, slideTo: 960, durationMs: 220, type: "triangle", gain: 0.05 });
      break;
    case "wrong":
      await playTone({ freq: 200, durationMs: 200, type: "sine", gain: 0.06 });
      break;
    case "finish":
      await playTone({ freq: 660, durationMs: 200, type: "triangle", gain: 0.05 });
      setTimeout(() => playTone({ freq: 880, durationMs: 200, type: "triangle", gain: 0.05 }), 160);
      break;
    case "countdown":
      await playTone({ freq: 480, durationMs: 90, type: "sine", gain: 0.04 });
      break;
    default:
      break;
  }
}

function ensureOverlayElement() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "ui-overlay";
  overlayEl.className = "ui-overlay hidden";
  const card = document.createElement("div");
  card.className = "overlay-card";
  overlayMessageEl = document.createElement("div");
  card.appendChild(overlayMessageEl);
  overlayEl.appendChild(card);
  document.body.appendChild(overlayEl);
}

function hideOverlay() {
  if (overlayTimeout) clearTimeout(overlayTimeout);
  if (overlayInterval) clearInterval(overlayInterval);
  overlayTimeout = null;
  overlayInterval = null;
  if (overlayEl) overlayEl.classList.add("hidden");
}

function showOverlay(message, durationMs = 1500) {
  ensureOverlayElement();
  hideOverlay();
  overlayMessageEl.textContent = message;
  overlayEl.classList.remove("hidden");
  overlayTimeout = setTimeout(hideOverlay, durationMs);
}

function showCountdownOverlay(callback) {
  ensureOverlayElement();
  hideOverlay();
  let count = 3;
  overlayEl.classList.remove("hidden");
  overlayMessageEl.textContent = `${t("startingIn")} ${count}...`;
  overlayInterval = setInterval(() => {
    count -= 1;
    if (count > 0) {
      overlayMessageEl.textContent = `${t("startingIn")} ${count}...`;
    } else {
      clearInterval(overlayInterval);
      overlayInterval = null;
      overlayMessageEl.textContent = t("getReady");
      overlayTimeout = setTimeout(() => {
        hideOverlay();
        callback?.();
      }, 600);
    }
  }, 700);
}

function updateSoundToggle() {
  if (!soundToggle) return;
  soundToggle.textContent = soundEnabled ? "🔊" : "🔇";
  soundToggle.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
}

function setTimerCue(message, strength = "soft") {
  if (!timerCueEl) return;
  timerCueEl.textContent = message;
  timerCueEl.classList.add("visible");
  timerBarFill.classList.remove("timer-pulse-soft", "timer-pulse-strong");
  if (strength === "hard") {
    timerBarFill.classList.add("timer-pulse-strong");
  } else {
    timerBarFill.classList.add("timer-pulse-soft");
  }
}

function clearTimerCue() {
  if (timerCueEl) timerCueEl.classList.remove("visible");
  timerBarFill.classList.remove("timer-pulse-soft", "timer-pulse-strong");
  timerDisplayEl.classList.remove("timer-shake");
}

function showBigCountdown(num) {
  if (!timerBigCountdownEl) return;
  timerBigCountdownEl.textContent = num;
  timerBigCountdownEl.classList.remove("countdown-pop");
  void timerBigCountdownEl.offsetWidth;
  timerBigCountdownEl.classList.add("countdown-pop");
}

async function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem(LS_SOUND, soundEnabled ? "on" : "off");
  updateSoundToggle();
  await ensureAudio();
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function humanizeStatus(status) {
  if (status === "collecting") return t("statusCollecting");
  if (status === "playing") return t("statusPlaying");
  if (status === "finished") return t("statusFinished");
  return status || "-";
}

function changeLanguage(lang) {
  currentLang = lang;
  localStorage.setItem(LS_LANG, lang);
  applyLanguage();
  renderRoom();
}

function applyLanguage() {
  document.documentElement.lang = currentLang;
  const elements = document.querySelectorAll("[data-i18n]");
  elements.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const text = t(key);
    if (text) el.textContent = text;
  });
  createNameInput.placeholder = currentLang === "tr" ? "Umut, Nova..." : "Jane, Nova...";
  joinNameInput.placeholder = currentLang === "tr" ? "İsmin" : "Your name";
  joinCodeInput.placeholder = currentLang === "tr" ? "Örn: ABC123" : "Ex: ABC123";

  langTrBtn.classList.toggle("active", currentLang === "tr");
  langEnBtn.classList.toggle("active", currentLang === "en");

  renderHelpSteps();
}

function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem(LS_THEME, currentTheme);
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", currentTheme);
  themeToggle.textContent = currentTheme === "dark" ? "🌙" : "☀️";
}

function ensureProfile() {
  const stored = localStorage.getItem(LS_PROFILE);
  if (stored) {
    profileData = JSON.parse(stored);
  }
  if (!profileData) {
    profileData = {
      display_name: localStorage.getItem(LS_LAST_NAME) || "Player",
      avatar_emoji: "🎯",
      avatar_color: "#38bdf8",
    };
    localStorage.setItem(LS_PROFILE, JSON.stringify(profileData));
  }
  renderProfileChip();
}

function updateContextHint() {
  if (!contextHintEl || !currentRoom) return;
  let text = "";
  if (currentRoom.status === "collecting") text = t("contextCollecting");
  else if (currentRoom.status === "playing") text = t("contextPlaying");
  else if (currentRoom.status === "finished") text = t("contextFinished");

  if (text) {
    contextHintEl.textContent = text;
    contextHintEl.classList.remove("hidden");
  } else {
    contextHintEl.classList.add("hidden");
  }
}

function renderHelpSteps() {
  if (!helpStepsEl) return;
  const steps = textMap[currentLang]?.howToPlaySteps || [];
  helpStepsEl.innerHTML = "";
  steps.forEach((step) => {
    const p = document.createElement("p");
    p.textContent = step;
    helpStepsEl.appendChild(p);
  });
}

function openHelpModal() {
  if (!helpModal) return;
  renderHelpSteps();
  helpModal.classList.remove("hidden");
}

function closeHelpModal() {
  if (helpModal) helpModal.classList.add("hidden");
}

function renderProfileChip() {
  if (!profileChip) return;
  profileChip.innerHTML = "";
  const circle = document.createElement("span");
  circle.className = "avatar-circle";
  circle.style.background = profileData?.avatar_color || "#38bdf8";
  circle.textContent = profileData?.avatar_emoji || "🙂";
  const labelBox = document.createElement("div");
  labelBox.style.display = "flex";
  labelBox.style.flexDirection = "column";
  labelBox.style.alignItems = "flex-start";
  const nameEl = document.createElement("strong");
  nameEl.textContent = profileData?.display_name || "Player";
  const hint = document.createElement("small");
  hint.textContent = currentLang === "tr" ? "Avatarı düzenle" : "Edit avatar";
  labelBox.appendChild(nameEl);
  labelBox.appendChild(hint);
  profileChip.appendChild(labelBox);
  profileChip.appendChild(circle);
}

function setupAvatarOptions() {
  const emojis = ["🎓", "🤓", "🚀", "🧠", "🔥", "🌟", "🎯", "🏆"];
  const colors = ["#38bdf8", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#f97316"];

  avatarOptionsEl.innerHTML = "";
  colorOptionsEl.innerHTML = "";
  emojis.forEach((em) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-option";
    btn.textContent = em;
    if (profileData?.avatar_emoji === em) btn.classList.add("selected");
    btn.onclick = () => {
      avatarOptionsEl.querySelectorAll(".avatar-option").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
      profileData.avatar_emoji = em;
    };
    avatarOptionsEl.appendChild(btn);
  });

  colors.forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-option";
    btn.style.background = color;
    if (profileData?.avatar_color === color) btn.classList.add("selected");
    btn.onclick = () => {
      colorOptionsEl.querySelectorAll(".color-option").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
      profileData.avatar_color = color;
    };
    colorOptionsEl.appendChild(btn);
  });
}

function saveAvatarSelection() {
  localStorage.setItem(LS_PROFILE, JSON.stringify(profileData));
  renderProfileChip();
  avatarModal.classList.add("hidden");
  // TODO: persist avatar to backend profile table if available.
}

function renderAvatarChip(playerRow) {
  if (!playerRow) return null;
  // TODO: load other players' avatars from backend once columns exist
  if (me && playerRow.id === me.id) {
    const span = document.createElement("span");
    span.className = "avatar-circle";
    span.style.background = profileData?.avatar_color || "#38bdf8";
    span.textContent = profileData?.avatar_emoji || "🙂";
    return span;
  }
  return null;
}

function ensureStats() {
  const stored = localStorage.getItem(LS_STATS);
  if (stored) {
    statsData = JSON.parse(stored);
  }
  if (!statsData) {
    statsData = {
      total_quizzes: 0,
      total_answered: 0,
      total_correct: 0,
      streak_days: 0,
      longest_streak: 0,
      last_play_date: null,
    };
  }
  localStorage.setItem(LS_STATS, JSON.stringify(statsData));
}

function renderStats() {
  if (!statsGridEl) return;
  statsGridEl.innerHTML = "";
  const items = [
    { label: currentLang === "tr" ? "Toplam Quiz" : "Total quizzes", value: statsData?.total_quizzes || 0 },
    { label: currentLang === "tr" ? "Cevaplanan" : "Answered", value: statsData?.total_answered || 0 },
    { label: currentLang === "tr" ? "Doğru" : "Correct", value: statsData?.total_correct || 0 },
    {
      label: currentLang === "tr" ? "Seri" : "Streak",
      value: `${statsData?.streak_days || 0} / ${statsData?.longest_streak || 0}`,
    },
  ];
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="label">${item.label}</div><div style="font-size:1.4rem;font-weight:700;">${item.value}</div>`;
    statsGridEl.appendChild(card);
  });

  renderBadges();

  if (playerStatsChip) {
    playerStatsChip.textContent = `${t("participantsList")}: ${participants.length} · ${currentLang === "tr" ? "Seri" : "Streak"} ${statsData?.streak_days || 0}`;
  }
}

function renderBadges() {
  badgeListEl.innerHTML = "";
  const badges = [];
  if ((statsData?.total_quizzes || 0) > 0) badges.push({ emoji: "🥇", label: currentLang === "tr" ? "İlk quiz" : "First quiz" });
  if ((statsData?.total_answered || 0) >= 1) badges.push({ emoji: "🥈", label: currentLang === "tr" ? "İlk soru" : "First question" });
  if ((statsData?.total_correct || 0) >= 2) badges.push({ emoji: "🎯", label: currentLang === "tr" ? "2+ doğru" : "2+ correct" });
  if ((statsData?.streak_days || 0) >= 3) badges.push({ emoji: "🔥", label: currentLang === "tr" ? "3 gün serisi" : "3-day streak" });
  if ((statsData?.streak_days || 0) >= 7) badges.push({ emoji: "🌟", label: currentLang === "tr" ? "7 gün serisi" : "7-day streak" });

  badges.forEach((b) => {
    const chip = document.createElement("div");
    chip.className = "badge-chip";
    chip.textContent = `${b.emoji} ${b.label}`;
    badgeListEl.appendChild(chip);
  });
}

function updateStatsAfterQuiz(correctCount, totalQuestions) {
  ensureStats();
  statsData.total_quizzes += 1;
  statsData.total_answered += totalQuestions;
  statsData.total_correct += correctCount;
  const today = new Date().toISOString().slice(0, 10);
  if (statsData.last_play_date) {
    const diff =
      (new Date(today).getTime() - new Date(statsData.last_play_date).getTime()) /
      (1000 * 60 * 60 * 24);
    if (diff === 1) {
      statsData.streak_days += 1;
    } else if (diff === 0) {
      // keep streak
    } else {
      statsData.streak_days = 1;
    }
  } else {
    statsData.streak_days = 1;
  }
  statsData.longest_streak = Math.max(statsData.longest_streak || 0, statsData.streak_days);
  statsData.last_play_date = today;
  localStorage.setItem(LS_STATS, JSON.stringify(statsData));
  renderStats();
}

function logError(context, error) {
  if (error) {
    console.error(`[${context}]`, error.message || error);
  }
}

// =============================================================
// DOM references
// =============================================================
const lobbySection = document.getElementById("lobby-section");
const roomSection = document.getElementById("room-section");
const rejoinNoticeEl = document.getElementById("rejoin-notice");

const createNameInput = document.getElementById("create-name");
const createTimeLimitInput = document.getElementById("create-time-limit");
const createRoomBtn = document.getElementById("create-room-btn");
const createErrorEl = document.getElementById("create-error");

const joinNameInput = document.getElementById("join-name");
const joinCodeInput = document.getElementById("join-code");
const joinRoomBtn = document.getElementById("join-room-btn");
const joinErrorEl = document.getElementById("join-error");

const roomTitleEl = document.getElementById("room-title");
const roomCodeEl = document.getElementById("room-code");
const roomHostEl = document.getElementById("room-host");
const roomStatusEl = document.getElementById("room-status");
const participantCountEl = document.getElementById("participant-count");
const roomQuestionCountEl = document.getElementById("room-question-count");
const roomLinkEl = document.getElementById("room-link");
const participantsListEl = document.getElementById("participants-list");
const hostControlsEl = document.getElementById("host-controls");
const backToLobbyBtn = document.getElementById("back-to-lobby-btn");
const profileChip = document.getElementById("profile-chip");
const helpBtn = document.getElementById("help-btn");
const themeToggle = document.getElementById("theme-toggle");
const soundToggle = document.getElementById("sound-toggle");
const langTrBtn = document.getElementById("lang-tr");
const langEnBtn = document.getElementById("lang-en");
const playerStatsChip = document.getElementById("player-stats-chip");
const contextHintEl = document.getElementById("context-hint");

const collectView = document.getElementById("collect-view");
const playView = document.getElementById("play-view");
const resultsView = document.getElementById("results-view");
const collectStatusPill = document.getElementById("collect-status-pill");
const playStatusPill = document.getElementById("play-status-pill");
const resultsStatusPill = document.getElementById("results-status-pill");

const questionTypeSelect = document.getElementById("question-type");
const questionTextInput = document.getElementById("question-text");
const mcqOptionsBox = document.getElementById("mcq-options");
const tfOptionsBox = document.getElementById("tf-options");

const optionAInput = document.getElementById("option-a");
const optionBInput = document.getElementById("option-b");
const optionCInput = document.getElementById("option-c");
const optionDInput = document.getElementById("option-d");
const correctIndexSelect = document.getElementById("correct-index");
const tfCorrectSelect = document.getElementById("tf-correct");
const questionTimeLimitInput = document.getElementById("question-time-limit");
const addQuestionBtn = document.getElementById("add-question-btn");
const bulkInputEl = document.getElementById("bulk-input");
const bulkImportBtn = document.getElementById("bulk-import-btn");
const questionErrorEl = document.getElementById("question-error");

const myQuestionsListEl = document.getElementById("my-questions-list");
const roomQuestionsListEl = document.getElementById("room-questions-list");

const playQuestionCounterEl = document.getElementById("play-question-counter");
const timerWrapper = document.getElementById("timer-wrapper");
const timerBarFill = document.getElementById("timer-bar-fill");
const timerDisplayEl = document.getElementById("timer-display");
const timerCircle = document.getElementById("timer-circle");
const playQuestionTextEl = document.getElementById("play-question-text");
const playOptionsEl = document.getElementById("play-options");
const answerFeedbackEl = document.getElementById("answer-feedback");
const playScoreboardEl = document.getElementById("play-scoreboard");
const timerCueEl = document.createElement("div");
timerCueEl.id = "timer-cue";
const timerBigCountdownEl = document.createElement("div");
timerBigCountdownEl.id = "timer-big-countdown";
if (timerWrapper) {
  timerWrapper.appendChild(timerCueEl);
  timerWrapper.appendChild(timerBigCountdownEl);
}

const resultsSummaryEl = document.getElementById("results-summary");
const resultsListEl = document.getElementById("results-list");
const confettiContainer = document.getElementById("confetti-container");
const statsGridEl = document.getElementById("stats-grid");
const badgeListEl = document.getElementById("badge-list");
const avatarModal = document.getElementById("avatar-modal");
const avatarOptionsEl = document.getElementById("avatar-options");
const colorOptionsEl = document.getElementById("color-options");
const closeAvatarBtn = document.getElementById("close-avatar");
const saveAvatarBtn = document.getElementById("save-avatar");
const helpModal = document.getElementById("help-modal");
const helpStepsEl = document.getElementById("help-steps");
const closeHelpBtn = document.getElementById("close-help");

// =============================================================
// Event listeners
// =============================================================
createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
backToLobbyBtn.addEventListener("click", backToLobby);
addQuestionBtn.addEventListener("click", addQuestion);
bulkImportBtn.addEventListener("click", bulkImportQuestions);
helpBtn?.addEventListener("click", openHelpModal);
closeHelpBtn?.addEventListener("click", closeHelpModal);
helpModal?.addEventListener("click", (e) => {
  if (e.target === helpModal) closeHelpModal();
});
document.getElementById("new-question-btn").addEventListener("click", () => {
  questionTextInput.value = "";
  optionAInput.value = "";
  optionBInput.value = "";
  optionCInput.value = "";
  optionDInput.value = "";
  questionTimeLimitInput.value = "";
});

questionTypeSelect.addEventListener("change", () => {
  const type = questionTypeSelect.value;
  if (type === "mcq") {
    mcqOptionsBox.classList.remove("hidden");
    tfOptionsBox.classList.add("hidden");
  } else {
    mcqOptionsBox.classList.add("hidden");
    tfOptionsBox.classList.remove("hidden");
  }
});

profileChip.addEventListener("click", () => {
  avatarModal.classList.remove("hidden");
});
closeAvatarBtn.addEventListener("click", () => {
  avatarModal.classList.add("hidden");
});
saveAvatarBtn.addEventListener("click", saveAvatarSelection);
themeToggle.addEventListener("click", toggleTheme);
if (soundToggle) soundToggle.addEventListener("click", toggleSound);
langTrBtn.addEventListener("click", () => changeLanguage("tr"));
langEnBtn.addEventListener("click", () => changeLanguage("en"));
document.addEventListener(
  "click",
  () => {
    ensureAudio();
  },
  { once: true }
);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && currentRoom) {
    resyncRoomState(currentRoom.id, { forceQuestionRender: true });
  }
});
window.addEventListener("online", () => {
  if (currentRoom) {
    resyncRoomState(currentRoom.id, { forceQuestionRender: true });
  }
});

// =============================================================
// Supabase helpers
// =============================================================
async function fetchRoomBySlug(slug) {
  const { data, error } = await supabase
    .from("quiz_rooms")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  logError("fetchRoomBySlug", error);
  return data || null;
}

async function fetchRoomById(roomId) {
  const { data, error } = await supabase
    .from("quiz_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  logError("fetchRoomById", error);
  return data || null;
}

async function fetchParticipants(roomId) {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchParticipants error", error.message);
    return;
  }
  participants = data || [];
  if (me) {
    const mine = participants.find((p) => p.id === me.id);
    if (mine) me = mine;
  }
  renderParticipants();
}

async function resyncRoomState(roomId, opts = {}) {
  if (!roomId) return;
  const fresh = await fetchRoomById(roomId);
  if (fresh) {
    await applyRoomState(fresh, { forceQuestionRender: opts.forceQuestionRender });
  }
  await fetchParticipants(roomId);
  scheduleFetchQuestions(roomId);
}

/** Fetch questions for the room and render. */
async function fetchQuestions(roomId) {
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchQuestions error", error.message);
    questionErrorEl.textContent = "Sorular alınamadı: " + error.message;
    return;
  }
  questions = data || [];
  syncMyQuestions();
  renderQuestions();
  if (
    currentRoom &&
    currentRoom.status === "playing" &&
    Array.isArray(currentRoom.question_order) &&
    currentRoom.question_order.length
  ) {
    renderCurrentQuestion();
  }
}

function scheduleFetchQuestions(roomId) {
  if (questionsFetchTimer) clearTimeout(questionsFetchTimer);
  questionsFetchTimer = setTimeout(() => fetchQuestions(roomId), 150);
}

function syncMyQuestions() {
  if (!me) {
    myQuestions = [];
    return;
  }
  myQuestions = (questions || []).filter(
    (q) => q.author_participant_id === me.id
  );
}

async function findExistingParticipant(roomId) {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("*")
    .eq("room_id", roomId)
    .eq("client_id", clientId)
    .maybeSingle();
  logError("findExistingParticipant", error);
  return data || null;
}

async function applyRoomState(roomRow, { forceQuestionRender = false } = {}) {
  if (!roomRow) return;
  const prevStatus = currentRoom?.status;
  const prevIndex = currentRoom?.current_question_index;
  const prevStartedAt = currentRoom?.current_question_started_at;
  const enteringPlaying = prevStatus === "collecting" && roomRow.status === "playing";

  currentRoom = roomRow;
  renderRoom();
  renderPhaseViews();

  if (currentRoom.status === "playing") {
    await fetchQuestions(currentRoom.id);
    const shouldForce =
      forceQuestionRender ||
      prevIndex !== currentRoom.current_question_index ||
      prevStartedAt !== currentRoom.current_question_started_at;
    if (enteringPlaying) {
      showCountdownOverlay(() => renderCurrentQuestion({ force: true, skipOverlay: true }));
    } else {
      renderCurrentQuestion({ force: shouldForce });
    }
  } else {
    resetLocalPlayState();
  }

  lastRoomHash = computeRoomHash(currentRoom);
}

// =============================================================
// Room enter/leave
// =============================================================
/**
 * Enter a room after creation/join.
 * - Saves last room/name to localStorage for auto-rejoin
 * - Binds realtime listeners and fetches initial data
 */
async function enterRoom(room, participant) {
  currentRoom = room;
  me = participant;
  localStorage.setItem(LS_LAST_ROOM, room.slug);
  if (participant?.name) localStorage.setItem(LS_LAST_NAME, participant.name);
  if (profileData) {
    profileData.display_name = participant?.name || profileData.display_name;
    localStorage.setItem(LS_PROFILE, JSON.stringify(profileData));
    renderProfileChip();
  }

  lobbySection.classList.add("hidden");
  roomSection.classList.remove("hidden");
  rejoinNoticeEl.classList.add("hidden");

  updateUrlForRoom(room.slug);

  attachRealtime(room.id);
  startSyncLoop(room.id);

  const freshRoom = await fetchRoomById(room.id);
  if (freshRoom) {
    await applyRoomState(freshRoom, { forceQuestionRender: true });
  } else {
    renderRoom();
    renderPhaseViews();
  }
  fetchParticipants(room.id);
  fetchQuestions(room.id);
}

/** Reset UI and state back to lobby. */
function backToLobby() {
  if (roomChannel) {
    supabase.removeChannel(roomChannel);
    roomChannel = null;
  }
  stopSyncLoop();
  stopTimer();
  resetLocalPlayState();
  currentRoom = null;
  me = null;
  participants = [];
  questions = [];
  confettiPlayed = false;

  lobbySection.classList.remove("hidden");
  roomSection.classList.add("hidden");
  clearRoomFromUrl();

  hostControlsEl.innerHTML = "";
  participantsListEl.innerHTML = "";
  resultsListEl.innerHTML = "";
  resultsSummaryEl.innerHTML = "";
  roomQuestionsListEl.innerHTML = "";
  myQuestionsListEl.innerHTML = "";
  playOptionsEl.innerHTML = "";
  answerFeedbackEl.textContent = "";
}

// =============================================================
// Create / Join room
// =============================================================
/** Create a new room as host and join it. */
async function createRoom() {
  createErrorEl.textContent = "";
  const name = createNameInput.value.trim();
  let timeLimit = parseInt(createTimeLimitInput.value, 10);
  if (!timeLimit || timeLimit < 5) timeLimit = 20;

  if (!name) {
    createErrorEl.textContent = "Lütfen ismini yaz.";
    return;
  }

  ensureClientId();

  const slug = randomSlug();
  const { data: room, error: roomErr } = await supabase
    .from("quiz_rooms")
    .insert({
      slug,
      host_name: name,
      default_time_limit_sec: timeLimit,
    })
    .select()
    .single();

  if (roomErr) {
    createErrorEl.textContent = roomErr.message;
    logError("createRoom", roomErr);
    return;
  }

  const participant =
    (await findExistingParticipant(room.id)) ||
    (await insertParticipant(room.id, name, createErrorEl));
  if (!participant) return;

  await enterRoom(room, participant);
}

/** Join an existing room by slug. */
async function joinRoom() {
  joinErrorEl.textContent = "";
  const name = joinNameInput.value.trim();
  const code = joinCodeInput.value.trim().toUpperCase();

  if (!name) {
    joinErrorEl.textContent = "Lütfen ismini yaz.";
    return;
  }
  if (!code) {
    joinErrorEl.textContent = "Lütfen oda kodunu yaz.";
    return;
  }

  ensureClientId();
  const room = await fetchRoomBySlug(code);
  if (!room) {
    joinErrorEl.textContent = "Böyle bir oda bulunamadı.";
    return;
  }

  const existing = await findExistingParticipant(room.id);
  const participant = existing || (await insertParticipant(room.id, name, joinErrorEl));
  if (!participant) return;

  await enterRoom(room, participant);
}

async function insertParticipant(roomId, name, errorEl) {
  const { data, error } = await supabase
    .from("quiz_participants")
    .insert({ room_id: roomId, client_id: clientId, name })
    .select()
    .single();
  if (error) {
    logError("insertParticipant", error);
    if (errorEl) errorEl.textContent = error.message;
    return null;
  }
  return data;
}

function computeRoomHash(r) {
  if (!r) return "";
  return [
    r.status || "",
    r.current_question_index ?? "",
    r.current_question_started_at || "",
    Array.isArray(r.question_order) ? r.question_order.length : 0,
  ].join("|");
}

async function fetchQuestionsCount(roomId) {
  const { count, error } = await supabase
    .from("quiz_questions")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId);
  if (error) return null;
  return count ?? null;
}

function stopSyncLoop() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

function startSyncLoop(roomId) {
  stopSyncLoop();
  lastQuestionsCount = null;
  lastRoomHash = computeRoomHash(currentRoom);
  let lastCollectCheck = 0;
  let lastPlayCheck = 0;

  syncInterval = setInterval(async () => {
    if (!currentRoom || currentRoom.id !== roomId) return;
    const now = Date.now();

    try {
      if (currentRoom.status === "collecting") {
        if (now - lastCollectCheck < 2000) return;
        lastCollectCheck = now;

        const fresh = await fetchRoomById(roomId);
        if (fresh) {
          const h = computeRoomHash(fresh);
          if (h !== lastRoomHash) {
            lastRoomHash = h;
            await applyRoomState(fresh, { forceQuestionRender: true });
          }
          lastRoomHash = h;
        }

        const c = await fetchQuestionsCount(roomId);
        if (c !== null && c !== lastQuestionsCount) {
          lastQuestionsCount = c;
          await fetchQuestions(roomId);
        }
      } else if (currentRoom.status === "playing") {
        if (now - lastPlayCheck < 1000) return;
        lastPlayCheck = now;
        const fresh = await fetchRoomById(roomId);
        if (!fresh) return;
        const h = computeRoomHash(fresh);
        if (h !== lastRoomHash) {
          lastRoomHash = h;
          await applyRoomState(fresh, { forceQuestionRender: true });
        }
        lastRoomHash = h;
      }
    } catch (err) {
      console.error("syncLoop error", err);
    }
  }, 500);
}

// =============================================================
// Realtime
// =============================================================
function attachRealtime(roomId) {
  if (roomChannel) {
    supabase.removeChannel(roomChannel);
    stopSyncLoop();
  }

  roomChannel = supabase
    .channel("quiz-room-" + roomId)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "quiz_rooms", filter: `id=eq.${roomId}` },
      async (payload) => {
        console.log("[RT rooms]", payload);
        const fresh = await fetchRoomById(roomId);
        if (!fresh) return;
        await applyRoomState(fresh);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "quiz_participants", filter: `room_id=eq.${roomId}` },
      (payload) => {
        console.log("[RT participants]", payload);
        fetchParticipants(roomId);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "quiz_questions", filter: `room_id=eq.${roomId}` },
      (payload) => {
        console.log("[RT questions]", payload);
        scheduleFetchQuestions(roomId);
      }
    )
    .subscribe(async (status) => {
      console.log("[RT status]", status);
      if (status === "SUBSCRIBED") {
        await resyncRoomState(roomId, { forceQuestionRender: true });
      }
    });
}

// =============================================================
// Render helpers
// =============================================================
function renderParticipants() {
  participantsListEl.innerHTML = "";
  participantCountEl.textContent = participants.length.toString();

  participants.forEach((p) => {
    const li = document.createElement("li");
    const isHost = currentRoom && currentRoom.host_name === p.name;
    if (me && p.id === me.id) li.classList.add("participant-me");
    if (isHost) li.classList.add("participant-host");
    const avatar = renderAvatarChip(p);
    if (avatar) li.appendChild(avatar);
    const label = document.createElement("span");
    label.textContent = `${p.name}${isHost ? " · Host" : ""}${me && p.id === me.id ? " · Sen" : ""}`;
    li.appendChild(label);
    participantsListEl.appendChild(li);
  });
}

function renderQuestions() {
  roomQuestionCountEl.textContent = questions.length.toString();
  myQuestionsListEl.innerHTML = "";
  roomQuestionsListEl.innerHTML = "";

  const authorName = (id) => participants.find((p) => p.id === id)?.name || "?";

  const isHost = currentRoom?.host_name === me?.name;
  const status = currentRoom?.status;
  const showAllRoomQuestions = status !== "collecting" || isHost;
  const visibleRoomQuestions = showAllRoomQuestions ? questions : myQuestions;

  visibleRoomQuestions.forEach((q, idx) => {
    const timeInfo = `${q.time_limit_sec || currentRoom?.default_time_limit_sec || 20} sn`;
    const metaText = `${q.question_type?.toUpperCase() || "?"} · ${timeInfo}`;

    const liRoom = document.createElement("li");
    const metaBlock = document.createElement("div");
    metaBlock.className = "question-meta-block";
    metaBlock.innerHTML = `<strong>${idx + 1}.</strong> ${q.text || "(boş soru)"}<span class="meta">${metaText} · ${authorName(q.author_participant_id)}</span>`;
    liRoom.appendChild(metaBlock);
    roomQuestionsListEl.appendChild(liRoom);
  });

  myQuestions.forEach((q, idx) => {
    const timeInfo = `${q.time_limit_sec || currentRoom?.default_time_limit_sec || 20} sn`;
    const metaText = `${q.question_type?.toUpperCase() || "?"} · ${timeInfo}`;
    const liMine = document.createElement("li");
    const metaBlock = document.createElement("div");
    metaBlock.className = "question-meta-block";
    metaBlock.innerHTML = `<strong>${idx + 1}.</strong> ${q.text || "(boş soru)"}<span class="meta">${metaText}</span>`;
    liMine.appendChild(metaBlock);
    if (currentRoom?.status === "collecting") {
      const btn = document.createElement("button");
      btn.className = "delete-btn small";
      btn.textContent = "Sil";
      btn.onclick = () => deleteQuestion(q.id);
      liMine.appendChild(btn);
    }
    myQuestionsListEl.appendChild(liMine);
  });

  renderHostControls();
}

function renderRoom() {
  if (!currentRoom) return;

  roomTitleEl.textContent = t("roomHeading");
  roomCodeEl.textContent = currentRoom.slug;
  roomHostEl.textContent = currentRoom.host_name || "-";
  roomStatusEl.textContent = humanizeStatus(currentRoom.status);
  collectStatusPill.textContent = humanizeStatus(currentRoom.status);
  playStatusPill.textContent = humanizeStatus(currentRoom.status);
  resultsStatusPill.textContent = humanizeStatus(currentRoom.status);
  roomQuestionCountEl.textContent = questions.length.toString();

  const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom.slug}`;
  roomLinkEl.href = link;
  roomLinkEl.textContent = link;

  renderHostControls();
  renderPhaseViews();
  updateContextHint();
}

function renderHostControls() {
  hostControlsEl.innerHTML = "";
  if (!me || !currentRoom) return;
  const isHost = currentRoom.host_name === me.name;
  if (!isHost) return;

  if (currentRoom.status === "collecting") {
    const btnStart = document.createElement("button");
    btnStart.textContent = "Quiz'i Başlat";
    btnStart.onclick = startQuiz;
    if (!questions.length) btnStart.disabled = true;
    hostControlsEl.appendChild(btnStart);
  } else if (currentRoom.status === "playing") {
    const btnNext = document.createElement("button");
    btnNext.textContent = "Sonraki Soru";
    btnNext.onclick = nextQuestion;
    hostControlsEl.appendChild(btnNext);

    const btnFinish = document.createElement("button");
    btnFinish.className = "secondary";
    btnFinish.textContent = "Bitir";
    btnFinish.onclick = finishQuiz;
    hostControlsEl.appendChild(btnFinish);
  } else if (currentRoom.status === "finished") {
    const btnRestart = document.createElement("button");
    btnRestart.textContent = "Yeni Tur (aynı oda)";
    btnRestart.onclick = resetToCollecting;
    hostControlsEl.appendChild(btnRestart);

    const btnNewSession = document.createElement("button");
    btnNewSession.className = "secondary";
    btnNewSession.textContent = "Yeni Oturum (soruları temizle)";
    btnNewSession.onclick = clearSessionAndQuestions;
    hostControlsEl.appendChild(btnNewSession);
  }
}

function renderPhaseViews() {
  if (!currentRoom) return;

  if (currentRoom.status === "collecting") {
    collectView.classList.remove("hidden");
    playView.classList.add("hidden");
    resultsView.classList.add("hidden");
    resetLocalPlayState();
    confettiPlayed = false;
  } else if (currentRoom.status === "playing") {
    collectView.classList.add("hidden");
    playView.classList.remove("hidden");
    resultsView.classList.add("hidden");
    resultsRendered = false;
    if (activeQuestionId) {
      renderCurrentQuestion({ force: true });
    }
  } else if (currentRoom.status === "finished") {
    collectView.classList.add("hidden");
    playView.classList.add("hidden");
    resultsView.classList.remove("hidden");
    resetLocalPlayState();
    stopTimer();
    if (!resultsRendered) {
      loadAndRenderResults();
      triggerConfetti();
      resultsRendered = true;
    }
  }
}

// =============================================================
// Question management
// =============================================================
/** Insert a question for the current player. */
async function addQuestion() {
  questionErrorEl.textContent = "";
  if (!currentRoom || !me) {
    questionErrorEl.textContent = "Oda bulunamadı.";
    return;
  }

  const type = questionTypeSelect.value;
  const text = questionTextInput.value.trim();
  if (!text) {
    questionErrorEl.textContent = "Lütfen soru metni yaz.";
    return;
  }

  let options = null;
  let correctIndex = null;

  if (type === "mcq") {
    const opts = [
      optionAInput.value.trim(),
      optionBInput.value.trim(),
      optionCInput.value.trim(),
      optionDInput.value.trim(),
    ].filter((v) => v);
    if (opts.length < 2) {
      questionErrorEl.textContent = "En az iki seçenek (A ve B) doldurmalısın.";
      return;
    }
    options = opts;
    correctIndex = parseInt(correctIndexSelect.value, 10) || 0;
    if (correctIndex >= options.length) correctIndex = 0;
  } else {
    options = ["Doğru", "Yanlış"];
    correctIndex = parseInt(tfCorrectSelect.value, 10) || 0;
  }

  let timeLimit = null;
  const rawLimit = parseInt(questionTimeLimitInput.value, 10);
  if (rawLimit && rawLimit >= 5) {
    timeLimit = rawLimit;
  }

  const { data, error } = await supabase
    .from("quiz_questions")
    .insert({
      room_id: currentRoom.id,
      author_participant_id: me.id,
      question_type: type,
      text,
      options,
      correct_index: correctIndex,
      time_limit_sec: timeLimit,
    })
    .select()
    .single();

  if (error) {
    logError("addQuestion", error);
    questionErrorEl.textContent = error.message;
    return;
  }

  // Optimistic update
  questions.push(data);
  syncMyQuestions();
  renderQuestions();

  questionTextInput.value = "";
  optionAInput.value = "";
  optionBInput.value = "";
  optionCInput.value = "";
  optionDInput.value = "";
  questionTimeLimitInput.value = "";
}

function parseBulkQuestions(rawText) {
  if (!rawText) return [];
  const blocks = rawText
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const results = [];
  blocks.forEach((block) => {
    const qMatch = block.match(/Q:\s*(.+)/i);
    if (!qMatch) return;
    const text = qMatch[1].trim();

    const optionMatches = [...block.matchAll(/^[A-D]\)\s*(.+)$/gim)];
    const correctMatch = block.match(/Correct:\s*([A-D]|True|False|Doğru|Yanlış)/i);
    const timeMatch = block.match(/Time:\s*(\d+)/i);
    const tfLine = block.match(/TF:\s*(True|False)/i);
    const question = {
      text,
      question_type: "mcq",
      options: [],
      correct_index: 0,
      time_limit_sec: timeMatch ? parseInt(timeMatch[1], 10) || null : null,
    };

    if (optionMatches.length >= 2) {
      question.options = optionMatches.map((m) => m[1].trim());
      question.question_type = "mcq";
      if (correctMatch) {
        const letter = correctMatch[1].trim().toUpperCase();
        const idx = letter.charCodeAt(0) - "A".charCodeAt(0);
        question.correct_index = idx >= 0 && idx < question.options.length ? idx : 0;
      }
    } else {
      question.question_type = "tf";
      question.options = ["True", "False"];
      const optionsLine = block.match(/Options:\s*True\s*\|\s*False/i);
      if (optionsLine) {
        question.options = ["True", "False"];
      }
      const correctVal = (correctMatch?.[1] || tfLine?.[1] || "True").toLowerCase();
      question.correct_index = /false|yanl/i.test(correctVal) ? 1 : 0;
    }

    if (question.time_limit_sec && question.time_limit_sec < 5) {
      question.time_limit_sec = null;
    }

    results.push(question);
  });

  return results;
}

async function bulkImportQuestions() {
  questionErrorEl.textContent = "";
  if (!currentRoom || !me) {
    questionErrorEl.textContent = "Oda bulunamadı.";
    return;
  }
  if (currentRoom.status !== "collecting") {
    questionErrorEl.textContent = "Sadece toplama aşamasında ekleyebilirsin.";
    return;
  }
  const raw = bulkInputEl?.value?.trim();
  if (!raw) {
    questionErrorEl.textContent = "Önce metin yapıştır.";
    return;
  }
  const parsed = parseBulkQuestions(raw);
  if (!parsed.length) {
    questionErrorEl.textContent = "Format çözümlenemedi.";
    return;
  }

  const payload = parsed.map((q) => ({
    room_id: currentRoom.id,
    author_participant_id: me.id,
    question_type: q.question_type,
    text: q.text,
    options: q.options,
    correct_index: q.correct_index,
    time_limit_sec: q.time_limit_sec || null,
  }));

  const { data, error } = await supabase
    .from("quiz_questions")
    .insert(payload)
    .select();
  if (error) {
    questionErrorEl.textContent = "Eklenemedi: " + error.message;
    return;
  }

  questions = questions.concat(data || []);
  syncMyQuestions();
  renderQuestions();
  if (bulkInputEl) bulkInputEl.value = "";
}

async function deleteQuestion(questionId) {
  if (!currentRoom || !me) return;
  const { error } = await supabase
    .from("quiz_questions")
    .delete()
    .eq("id", questionId)
    .eq("author_participant_id", me.id);
  if (error) {
    alert("Silinemedi: " + error.message);
    return;
  }
  questions = questions.filter((q) => q.id !== questionId);
  syncMyQuestions();
  renderQuestions();
}

// =============================================================
// Quiz start / navigation (HOST)
// =============================================================
/** Host starts quiz: randomizes order and kicks off first question. */
async function startQuiz() {
  if (!currentRoom) return;
  if (!me || currentRoom.host_name !== me.name) return;
  if (!questions.length) {
    alert("Önce en az bir soru eklenmeli.");
    return;
  }

  const ids = questions.map((q) => q.id);
  const order = shuffle(ids);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("quiz_rooms")
    .update({
      status: "playing",
      question_order: order,
      current_question_index: 0,
      current_question_started_at: now,
      started_at: now,
    })
    .eq("id", currentRoom.id)
    .select()
    .single();

  if (error) {
    alert("Quiz başlatılamadı: " + error.message);
    return;
  }
  currentRoom = data;
  hasAnsweredCurrent = false;
  renderRoom();
  playSound("start");
}

/** Host moves to the next question or finishes when out of questions. */
async function nextQuestion() {
  if (!currentRoom) return;
  if (!me || currentRoom.host_name !== me.name) return;
  if (!currentRoom.question_order || !currentRoom.question_order.length) return;

  const currentIndex = currentRoom.current_question_index || 0;
  const nextIndex = currentIndex + 1;

  if (nextIndex >= currentRoom.question_order.length) {
    await finishQuiz();
    return;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("quiz_rooms")
    .update({
      current_question_index: nextIndex,
      current_question_started_at: now,
    })
    .eq("id", currentRoom.id)
    .select()
    .single();

  if (error) {
    alert("Sonraki soruya geçilemedi: " + error.message);
    return;
  }
  currentRoom = data;
  hasAnsweredCurrent = false;
  renderRoom();
}

/** Host marks quiz finished so results can be shown. */
async function finishQuiz() {
  if (!currentRoom) return;
  if (!me || currentRoom.host_name !== me.name) return;

  const { data, error } = await supabase
    .from("quiz_rooms")
    .update({ status: "finished" })
    .eq("id", currentRoom.id)
    .select()
    .single();

  if (error) {
    alert("Quiz bitirilemedi: " + error.message);
    return;
  }
  currentRoom = data;
  renderRoom();
  playSound("finish");
}

/** Host resets room to collecting state but keeps questions. */
async function resetToCollecting() {
  if (!currentRoom) return;
  if (!me || currentRoom.host_name !== me.name) return;

  const { data, error } = await supabase
    .from("quiz_rooms")
    .update({
      status: "collecting",
      question_order: null,
      current_question_index: null,
      current_question_started_at: null,
    })
    .eq("id", currentRoom.id)
    .select()
    .single();

  if (error) {
    alert("Sıfırlanamadı: " + error.message);
    return;
  }

  const { data: qs, error: qErr } = await supabase
    .from("quiz_questions")
    .select("id")
    .eq("room_id", currentRoom.id);

  if (!qErr) {
    const ids = (qs || []).map((q) => q.id);
    if (ids.length) {
      const { error: delErr } = await supabase
        .from("quiz_answers")
        .delete()
        .in("question_id", ids);
      if (delErr) {
        console.error("[resetToCollecting] answers not cleared", delErr.message || delErr);
      }
    }
  }

  currentRoom = data;
  confettiPlayed = false;
  answerStateByQuestionId.clear();
  renderRoom();
}

async function clearSessionAndQuestions() {
  if (!currentRoom) return;
  if (!me || currentRoom.host_name !== me.name) return;
  const confirmed = window.confirm(
    currentLang === "tr"
      ? "Tüm sorular ve cevaplar silinsin mi?"
      : "Clear all questions and answers for a fresh session?"
  );
  if (!confirmed) return;

  const { data: qs, error: qErr } = await supabase
    .from("quiz_questions")
    .select("id")
    .eq("room_id", currentRoom.id);
  if (qErr) {
    alert("Sorular alınamadı: " + qErr.message);
    return;
  }

  const questionIds = (qs || []).map((q) => q.id);
  if (questionIds.length) {
    const { error: delAnsErr } = await supabase
      .from("quiz_answers")
      .delete()
      .in("question_id", questionIds);
    if (delAnsErr) {
      logError("clearSessionAndQuestions", delAnsErr);
    }
  }

  if (questionIds.length) {
    const { error: delQsErr } = await supabase
      .from("quiz_questions")
      .delete()
      .in("id", questionIds);
    if (delQsErr) {
      alert("Sorular silinemedi: " + delQsErr.message);
      return;
    }
  }

  const { data, error } = await supabase
    .from("quiz_rooms")
    .update({
      status: "collecting",
      question_order: null,
      current_question_index: null,
      current_question_started_at: null,
    })
    .eq("id", currentRoom.id)
    .select()
    .single();

  if (error) {
    alert("Sıfırlanamadı: " + error.message);
    return;
  }

  currentRoom = data;
  questions = [];
  myQuestions = [];
  answerStateByQuestionId.clear();
  renderQuestions();
  confettiPlayed = false;
  renderRoom();
}

// =============================================================
// Play view (participants)
// =============================================================
/** Render the currently active question in play mode. */
function renderCurrentQuestion(opts = {}) {
  if (playScoreboardEl) {
    playScoreboardEl.classList.add("hidden");
    playScoreboardEl.innerHTML = "";
  }
  const force = !!opts.force;
  if (!currentRoom || !currentRoom.question_order || currentRoom.question_order.length === 0) {
    playQuestionTextEl.textContent = currentLang === "tr" ? "Sorular yükleniyor..." : "Loading questions...";
    playOptionsEl.innerHTML = "";
    return;
  }

  const idx = currentRoom.current_question_index || 0;
  const questionId = currentRoom.question_order[idx];

  if (!questions || !questions.length) {
    playQuestionTextEl.textContent = currentLang === "tr" ? "Sorular getiriliyor..." : "Fetching questions...";
    playOptionsEl.innerHTML = "";
    fetchQuestions(currentRoom.id);
    return;
  }

  currentQuestion = questions.find((q) => q.id === questionId);

  if (!currentQuestion) {
    playQuestionTextEl.textContent = currentLang === "tr" ? "Soru bulunamadı." : "Question not found.";
    playOptionsEl.innerHTML = "";
    fetchQuestions(currentRoom.id);
    return;
  }

  if (activeQuestionId === questionId && !force) {
    applyAnswerStateToUI(questionId);
    return;
  }

  const isNewQuestion = activeQuestionId !== questionId;

  if (isNewQuestion && !opts.skipOverlay) {
    if (pendingQuestionRenderId === questionId) return;
    pendingQuestionRenderId = questionId;
    readyShownForQuestionId = questionId;
    showOverlay(t("getReady"), READY_BUFFER_MS);
    setTimeout(() => {
      pendingQuestionRenderId = null;
      renderCurrentQuestion({ ...opts, skipOverlay: true, force: true });
    }, READY_BUFFER_MS);
    return;
  }
  pendingQuestionRenderId = null;
  activeQuestionId = questionId;
  revealMode = false;
  myLastAnswerCorrect = null;
  timerCueFlagsByQuestionId.set(questionId, {
    ten: false,
    five: false,
    finals: new Set(),
  });
  clearTimerCue();
  if (isNewQuestion) {
    hasAnsweredCurrent = answerStateByQuestionId.has(questionId);
    if (!hasAnsweredCurrent) {
      answerFeedbackEl.textContent = "";
    }
  }
  if (playScoreboardEl) {
    playScoreboardEl.classList.add("hidden");
    playScoreboardEl.innerHTML = "";
  }

  const counterLabel = currentLang === "tr" ? "Soru" : "Question";
  playQuestionCounterEl.textContent = `${counterLabel} ${idx + 1}/${currentRoom.question_order.length}`;
  playQuestionTextEl.textContent = currentQuestion.text || "";

  playOptionsEl.innerHTML = "";
  (currentQuestion.options || []).forEach((optText, i) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.dataset.variant = String(i % 4);
    const letter = String.fromCharCode("A".charCodeAt(0) + i);
    btn.classList.add(`option-${letter.toLowerCase()}`);
    btn.innerHTML = `<span class="option-letter">${letter}</span><span>${optText}</span>`;
    btn.onclick = () => handleAnswerClick(i, btn);
    playOptionsEl.appendChild(btn);
  });

  const limit = currentQuestion.time_limit_sec || currentRoom.default_time_limit_sec || 20;
  questionStartedAtMs = currentRoom.current_question_started_at
    ? new Date(currentRoom.current_question_started_at).getTime()
    : Date.now();
  effectiveQuestionStartMs = questionStartedAtMs + READY_BUFFER_MS;
  questionEndTime = effectiveQuestionStartMs + limit * 1000;

  startTimer(limit, effectiveQuestionStartMs);
  await hydrateExistingAnswer(questionId);
  applyAnsweredUI(questionId);
}

/** Start timer bar & countdown for a question. */
function startTimer(limitSeconds, startAtMs) {
  stopTimer();
  let lastBeep = null;
  clearTimerCue();
  if (timerBigCountdownEl) timerBigCountdownEl.textContent = "";

  function tick() {
    if (!startAtMs) return;
    const total = limitSeconds;
    const elapsed = (Date.now() - startAtMs) / 1000;
    const remainingSec = Math.max(0, total - elapsed);
    timerDisplayEl.textContent = formatSeconds(remainingSec);

    const ratio = Math.max(0, Math.min(1, remainingSec / total));
    timerBarFill.style.width = `${ratio * 100}%`;

    const cueFlags =
      timerCueFlagsByQuestionId.get(activeQuestionId) || {
        ten: false,
        five: false,
        finals: new Set(),
      };

    if (remainingSec <= 10 && !cueFlags.ten) {
      cueFlags.ten = true;
      setTimerCue(t("tenSecondsLeft"), "soft");
    }

    const rounded = Math.ceil(remainingSec);
    if (rounded <= 5 && !cueFlags.five) {
      cueFlags.five = true;
      setTimerCue(t("fiveSecondsLeft"), "hard");
      timerDisplayEl.classList.add("timer-shake");
      setTimeout(() => timerDisplayEl.classList.remove("timer-shake"), 700);
    }

    if (rounded <= 3) {
      cueFlags.finals = cueFlags.finals || new Set();
      if (!cueFlags.finals.has(rounded)) {
        cueFlags.finals.add(rounded);
        showBigCountdown(rounded);
      }
    }
    timerCueFlagsByQuestionId.set(activeQuestionId, cueFlags);

    if (rounded <= 5 && rounded !== lastBeep) {
      lastBeep = rounded;
      playSound("countdown");
    }

    if (remainingSec <= 0) {
      timerDisplayEl.textContent = "00:00";
      timerBarFill.style.width = "0%";
      clearInterval(timerInterval);
      timerInterval = null;
      clearTimerCue();
      if (timerBigCountdownEl) timerBigCountdownEl.textContent = "";
      if (!revealMode) {
        revealMode = true;
        revealCorrectAnswerForEveryone();
      }
    }
  }

  tick();
  timerInterval = setInterval(tick, 250);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerBarFill.style.width = "0%";
  timerDisplayEl.textContent = "--";
  clearTimerCue();
  if (timerBigCountdownEl) timerBigCountdownEl.textContent = "";
}

function resetLocalPlayState() {
  currentQuestion = null;
  questionStartedAtMs = null;
  effectiveQuestionStartMs = null;
  questionEndTime = null;
  hasAnsweredCurrent = false;
  revealMode = false;
  activeQuestionId = null;
  pendingQuestionRenderId = null;
  resultsRendered = false;
  answerStateByQuestionId.clear();
  answeredMap.clear();
  timerCueFlagsByQuestionId.clear();
  stopTimer();
  answerFeedbackEl.textContent = "";
  playQuestionTextEl.textContent = "";
  playOptionsEl.innerHTML = "";
  playQuestionCounterEl.textContent = "";
  timerBarFill.style.width = "0%";
  timerDisplayEl.textContent = "--";
}

// Apply saved/pending answer UI for a question
function applyAnsweredUI(questionId) {
  if (!questionId) return;
  const existing = answeredMap.get(questionId) || answerStateByQuestionId.get(questionId);
  const buttons = playOptionsEl.querySelectorAll("button");
  if (!existing) {
    buttons.forEach((b) => {
      b.classList.remove("selected");
      b.disabled = false;
    });
    answerFeedbackEl.textContent = "";
    return;
  }

  buttons.forEach((b, idx) => {
    b.disabled = true;
    b.classList.toggle("selected", idx === existing.answerIndex || idx === existing.selectedIndex);
  });

  if (existing.status === "pending") {
    answerFeedbackEl.textContent = currentLang === "tr" ? "Kaydediliyor..." : "Saving...";
  } else {
    answerFeedbackEl.textContent =
      currentLang === "tr" ? "✅ Cevabın kaydedildi" : "✅ Answer submitted";
  }
}

function applyAnswerStateToUI(questionId) {
  applyAnsweredUI(questionId);
}

// Fetch player's answer for a question to restore state on refresh
async function hydrateExistingAnswer(questionId) {
  if (!me || !questionId || answeredMap.has(questionId)) return;
  const { data, error } = await supabase
    .from("quiz_answers")
    .select("answer_index")
    .eq("question_id", questionId)
    .eq("participant_id", me.id)
    .maybeSingle();
  if (error || !data) return;
  answeredMap.set(questionId, {
    answerIndex: data.answer_index,
    status: "saved",
  });
}

/** Persist an answer for the current player and show quick feedback. */
async function handleAnswerClick(answerIndex, btnEl) {
  if (!currentQuestion || !me) return;
  const qid = currentQuestion.id;
  if (answeredMap.has(qid)) {
    applyAnsweredUI(qid);
    return;
  }

  hasAnsweredCurrent = true;
  playSound("click");

  const buttons = playOptionsEl.querySelectorAll("button");
  buttons.forEach((b) => {
    b.disabled = true;
    b.classList.remove("selected");
  });
  btnEl.classList.add("selected");

  const limit = currentQuestion.time_limit_sec || currentRoom.default_time_limit_sec || 20;
  const startBase = effectiveQuestionStartMs || questionStartedAtMs || Date.now();
  const answerMs = Math.max(0, Date.now() - startBase);
  const ratio = clamp(1 - answerMs / (limit * 1000), 0, 1);
  const isCorrect = answerIndex === currentQuestion.correct_index;
  const points = isCorrect ? 1000 + Math.floor(1000 * ratio) : 0;

  answeredMap.set(qid, {
    answerIndex,
    status: "pending",
    answeredAt: Date.now(),
  });
  applyAnsweredUI(qid);

  const { error } = await supabase.from("quiz_answers").insert({
    question_id: qid,
    participant_id: me.id,
    answer_index: answerIndex,
    is_correct: isCorrect,
    answer_ms: answerMs,
    points,
  });

  myLastAnswerCorrect = isCorrect;

  if (error) {
    logError("handleAnswerClick", error);
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("quiz_answers")
        .select("answer_index,answer_ms,points")
        .eq("question_id", qid)
        .eq("participant_id", me.id)
        .maybeSingle();
      const recoveredIndex = existing?.answer_index ?? answerIndex;
      answeredMap.set(qid, {
        answerIndex: recoveredIndex,
        status: "already",
        answeredAt: Date.now(),
      });
      applyAnsweredUI(qid);
      answerFeedbackEl.textContent = currentLang === "tr" ? "✅ Zaten gönderdin" : "✅ Already submitted";
      return;
    }
    answeredMap.delete(qid);
    buttons.forEach((b) => (b.disabled = false));
    answerFeedbackEl.textContent =
      currentLang === "tr"
        ? "Cevap kaydedilemedi, tekrar dene."
        : "Could not save, please retry.";
    return;
  }

  answeredMap.set(qid, {
    answerIndex,
    status: "saved",
    answeredAt: Date.now(),
  });
  applyAnsweredUI(qid);
  answerFeedbackEl.textContent =
    currentLang === "tr"
      ? "Cevabın kaydedildi, doğru cevap açıklanıncaya kadar bekle."
      : "Answer saved, wait for the reveal.";
  playSound("submit");
}

async function revealCorrectAnswerForEveryone() {
  if (!currentQuestion) return;
  const buttons = playOptionsEl.querySelectorAll(".option-btn");
  buttons.forEach((btn, idx) => {
    btn.classList.remove("selected");
    btn.classList.toggle("correct", idx === currentQuestion.correct_index);
    btn.classList.toggle("incorrect", idx !== currentQuestion.correct_index);
    btn.disabled = true;
  });
  const letter = String.fromCharCode("A".charCodeAt(0) + (currentQuestion.correct_index || 0));
  answerFeedbackEl.textContent =
    currentLang === "tr"
      ? `Doğru cevap: ${letter}`
      : `Correct answer: ${letter}`;

  await showPostQuestionScoreboard();

  if (myLastAnswerCorrect === true) {
    playSound("correct");
  } else if (myLastAnswerCorrect === false) {
    playSound("wrong");
  }
}

async function fetchAnswersForQuestions(questionIds) {
  if (!questionIds || !questionIds.length) return [];
  const { data, error } = await supabase
    .from("quiz_answers")
    .select("participant_id,is_correct,question_id")
    .in("question_id", questionIds);
  if (error) {
    console.error("fetchAnswersForQuestions", error.message);
    return [];
  }
  return data || [];
}

function buildScoreRows(questionIds, answers) {
  const total = questionIds.length || 1;
  const idsSet = new Set(questionIds || []);
  const rows = (participants || []).map((p) => ({
    participant: p,
    correct: 0,
    wrong: 0,
    unanswered: total,
  }));
  const map = new Map(rows.map((r) => [r.participant.id, r]));
  (answers || []).forEach((a) => {
    if (!idsSet.has(a.question_id)) return;
    const row = map.get(a.participant_id);
    if (!row) return;
    if (a.is_correct) row.correct += 1;
    else row.wrong += 1;
    row.unanswered = Math.max(0, total - (row.correct + row.wrong));
  });
  return rows.sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    return a.wrong - b.wrong;
  });
}

function renderScoreboardSection(title, questionIds, answers) {
  const section = document.createElement("div");
  section.className = "scoreboard-section";
  const heading = document.createElement("h4");
  heading.textContent = title;
  section.appendChild(heading);

  const rows = buildScoreRows(questionIds, answers);
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = currentLang === "tr" ? "Oyuncu yok." : "No players yet.";
    section.appendChild(empty);
    return section;
  }

  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "score-row";
    const name = document.createElement("div");
    name.className = "score-name";
    name.textContent = row.participant.name;
    const stats = document.createElement("div");
    stats.className = "score-stats";

    if (questionIds.length === 1) {
      let badge = "—";
      if (row.correct > 0) badge = "✅";
      else if (row.wrong > 0) badge = "❌";
      stats.textContent = badge;
    } else {
      const corrLabel = currentLang === "tr" ? "Doğru" : "Correct";
      const wrongLabel = currentLang === "tr" ? "Yanlış" : "Wrong";
      const unLabel = currentLang === "tr" ? "Cevapsız" : "Unanswered";
      stats.textContent = `${corrLabel}: ${row.correct} · ${wrongLabel}: ${row.wrong} · ${unLabel}: ${row.unanswered}`;
    }

    rowEl.appendChild(name);
    rowEl.appendChild(stats);
    section.appendChild(rowEl);
  });

  return section;
}

async function showPostQuestionScoreboard() {
  if (!currentRoom || !currentRoom.question_order || !playScoreboardEl) return;
  const idx = currentRoom.current_question_index || 0;
  const currentQuestionId = currentRoom.question_order[idx];
  if (!currentQuestionId) return;

  if (!participants.length) {
    await fetchParticipants(currentRoom.id);
  }
  const questionIdsSoFar = currentRoom.question_order.slice(0, idx + 1);

  const [currentAnswers, overallAnswers] = await Promise.all([
    fetchAnswersForQuestions([currentQuestionId]),
    fetchAnswersForQuestions(questionIdsSoFar),
  ]);

  playScoreboardEl.innerHTML = "";
  const questionTitle = currentLang === "tr" ? "Bu soru" : "This question";
  const overallTitle = currentLang === "tr" ? "Genel durum" : "Overall so far";
  playScoreboardEl.appendChild(
    renderScoreboardSection(questionTitle, [currentQuestionId], currentAnswers)
  );
  playScoreboardEl.appendChild(
    renderScoreboardSection(overallTitle, questionIdsSoFar, overallAnswers)
  );
  playScoreboardEl.classList.remove("hidden");
}

// =============================================================
// Results
// =============================================================
/** Load participants/answers and render the scoreboard. */
async function loadAndRenderResults() {
  resultsListEl.innerHTML = "Yükleniyor...";
  resultsSummaryEl.innerHTML = "";

  if (!currentRoom) return;

  const { data: parts, error: pErr } = await supabase
    .from("quiz_participants")
    .select("*")
    .eq("room_id", currentRoom.id);
  if (pErr) {
    resultsListEl.textContent = "Katılımcılar alınamadı: " + pErr.message;
    return;
  }

  const { data: qs, error: qErr } = await supabase
    .from("quiz_questions")
    .select("id")
    .eq("room_id", currentRoom.id);
  if (qErr) {
    resultsListEl.textContent = "Sorular alınamadı: " + qErr.message;
    return;
  }
  if (!qs || !qs.length) {
    resultsListEl.textContent = "Bu odada soru yok.";
    return;
  }
  const questionIds = qs.map((q) => q.id);

  const { data: ans, error: aErr } = await supabase
    .from("quiz_answers")
    .select("participant_id,is_correct,question_id,points")
    .in("question_id", questionIds);
  if (aErr) {
    resultsListEl.textContent = "Cevaplar alınamadı: " + aErr.message;
    return;
  }

  const scoreMap = new Map();
  parts.forEach((p) => scoreMap.set(p.id, { points: 0, correct: 0 }));
  ans.forEach((a) => {
    const row = scoreMap.get(a.participant_id) || { points: 0, correct: 0 };
    row.points += a.points || 0;
    if (a.is_correct) row.correct += 1;
    scoreMap.set(a.participant_id, row);
  });

  const rows = parts
    .map((p) => ({
      id: p.id,
      name: p.name,
      correct: scoreMap.get(p.id)?.correct || 0,
      points: scoreMap.get(p.id)?.points || 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.correct - a.correct;
    });

  const totalQuestions = questionIds.length;

  const podiumContainer = document.createElement("div");
  podiumContainer.className = "podium";
  const topThree = rows.slice(0, 3);
  const places = [2, 0, 1];
  places.forEach((placeIdx, visualIdx) => {
    const entry = topThree[placeIdx];
    if (!entry) return;
    const card = document.createElement("div");
    card.className = `podium-spot place-${visualIdx + 1}`;
    const name = document.createElement("div");
    name.className = "podium-name";
    name.textContent = entry.name;
    const score = document.createElement("div");
    score.className = "podium-score";
    score.dataset.target = entry.points;
    score.textContent = "0";
    const badge = document.createElement("div");
    badge.className = "podium-rank";
    badge.textContent = `${placeIdx + 1}`;
    card.appendChild(badge);
    card.appendChild(name);
    card.appendChild(score);
    podiumContainer.appendChild(card);
  });

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Sıra</th><th>İsim</th><th>Doğru</th><th>Puan</th><th>Toplam soru</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.classList.add(`rank-${idx + 1}`);
    tr.innerHTML = `<td>${idx + 1}</td><td>${row.name}</td><td>${row.correct}</td><td>${row.points}</td><td>${totalQuestions}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  resultsListEl.innerHTML = "";
  if (topThree.length) resultsListEl.appendChild(podiumContainer);
  resultsListEl.appendChild(table);

  if (me) {
    const mine = rows.find((r) => r.id === me.id);
    if (mine) {
      resultsSummaryEl.textContent = `Sen: ${mine.correct}/${totalQuestions} doğru`;
      updateStatsAfterQuiz(mine.correct, totalQuestions);
    }
  }

  animatePodiumScores();
  if (topThree.length) triggerConfetti();
}

function animatePodiumScores() {
  const scores = resultsListEl.querySelectorAll(".podium-score");
  const duration = 1200;
  scores.forEach((el) => {
    const target = Number(el.dataset.target || 0);
    const start = performance.now();
    function step(now) {
      const progress = clamp((now - start) / duration, 0, 1);
      el.textContent = Math.floor(target * progress).toString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

// =============================================================
// Auto-rejoin / initialization
// =============================================================
/** Try to auto rejoin using ?room= or the last saved room slug. */
async function autoJoinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const roomSlug = params.get("room");
  const lastSlug = localStorage.getItem(LS_LAST_ROOM);
  const lastName = localStorage.getItem(LS_LAST_NAME) || "";

  if (roomSlug) {
    ensureClientId();
    joinCodeInput.value = roomSlug.toUpperCase();
    if (lastName) joinNameInput.value = lastName;

    const room = await fetchRoomBySlug(roomSlug.toUpperCase());
    if (!room) return;

    const participant = await findExistingParticipant(room.id);
    if (participant) {
      rejoinNoticeEl.textContent = `${participant.name} olarak odaya tekrar bağlanılıyor...`;
      rejoinNoticeEl.classList.remove("hidden");
      await enterRoom(room, participant);
      return;
    }

    rejoinNoticeEl.textContent = `${lastName || ""} olarak yeniden katılmak için form hazır.`;
    rejoinNoticeEl.classList.remove("hidden");
    if (lastName) {
      joinRoom();
    }
    return;
  }

  if (lastSlug) {
    rejoinNoticeEl.innerHTML = "";
    const text = document.createElement("span");
    text.textContent =
      currentLang === "tr"
        ? `${lastSlug} kodlu son odana tekrar katılmak ister misin?`
        : `Rejoin your last room ${lastSlug}?`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "small";
    btn.textContent = currentLang === "tr" ? "Katıl" : "Rejoin";
    btn.onclick = () => {
      joinCodeInput.value = lastSlug.toUpperCase();
      if (lastName) joinNameInput.value = lastName;
      joinRoom();
    };
    rejoinNoticeEl.appendChild(text);
    rejoinNoticeEl.appendChild(btn);
    rejoinNoticeEl.classList.remove("hidden");
  }
}

function init() {
  ensureClientId();
  applyTheme();
  applyLanguage();
  ensureProfile();
  ensureStats();
  setupAvatarOptions();
  updateSoundToggle();
  document.addEventListener(
    "click",
    () => {
      ensureAudio();
    },
    { once: true }
  );
  autoJoinFromUrl();
}

document.addEventListener("DOMContentLoaded", init);

// =============================================================
// Confetti (lightweight)
// =============================================================
function triggerConfetti() {
  if (confettiPlayed) return;
  confettiPlayed = true;
  const colors = ["#38bdf8", "#a855f7", "#f59e0b", "#22c55e", "#ef4444"];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 0.6 + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    confettiContainer.appendChild(piece);
  }

  confettiTimeout = setTimeout(() => {
    confettiContainer.innerHTML = "";
  }, 3500);
}
