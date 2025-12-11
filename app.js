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

// =============================================================
// Global state & helpers
// =============================================================
let clientId = null;
let currentRoom = null;
let me = null; // quiz_participants row
let participants = [];
let questions = [];
let roomChannel = null;
let timerInterval = null;
let currentQuestion = null;
let questionEndTime = null;
let hasAnsweredCurrent = false;
let confettiTimeout = null;
let confettiPlayed = false;

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

function formatSeconds(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function humanizeStatus(status) {
  if (status === "collecting") return "Collecting questions";
  if (status === "playing") return "Quiz in progress";
  if (status === "finished") return "Round finished";
  return status || "-";
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
const questionErrorEl = document.getElementById("question-error");

const myQuestionsListEl = document.getElementById("my-questions-list");
const roomQuestionsListEl = document.getElementById("room-questions-list");

const playQuestionCounterEl = document.getElementById("play-question-counter");
const timerBarFill = document.getElementById("timer-bar-fill");
const timerDisplayEl = document.getElementById("timer-display");
const playQuestionTextEl = document.getElementById("play-question-text");
const playOptionsEl = document.getElementById("play-options");
const answerFeedbackEl = document.getElementById("answer-feedback");

const resultsSummaryEl = document.getElementById("results-summary");
const resultsListEl = document.getElementById("results-list");
const confettiContainer = document.getElementById("confetti-container");

// =============================================================
// Event listeners
// =============================================================
createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
backToLobbyBtn.addEventListener("click", backToLobby);
addQuestionBtn.addEventListener("click", addQuestion);

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
  renderQuestions();
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

// =============================================================
// Room enter/leave
// =============================================================
/**
 * Enter a room after creation/join.
 * - Saves last room/name to localStorage for auto-rejoin
 * - Binds realtime listeners and fetches initial data
 */
function enterRoom(room, participant) {
  currentRoom = room;
  me = participant;
  localStorage.setItem(LS_LAST_ROOM, room.slug);
  if (participant?.name) localStorage.setItem(LS_LAST_NAME, participant.name);

  lobbySection.classList.add("hidden");
  roomSection.classList.remove("hidden");
  rejoinNoticeEl.classList.add("hidden");

  attachRealtime(room.id);
  renderRoom();
  fetchParticipants(room.id);
  fetchQuestions(room.id);
}

/** Reset UI and state back to lobby. */
function backToLobby() {
  if (roomChannel) {
    supabase.removeChannel(roomChannel);
    roomChannel = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  currentRoom = null;
  me = null;
  participants = [];
  questions = [];
  currentQuestion = null;
  questionEndTime = null;
  hasAnsweredCurrent = false;
  confettiPlayed = false;

  lobbySection.classList.remove("hidden");
  roomSection.classList.add("hidden");

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

  enterRoom(room, participant);
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

  enterRoom(room, participant);
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

// =============================================================
// Realtime
// =============================================================
function attachRealtime(roomId) {
  if (roomChannel) {
    supabase.removeChannel(roomChannel);
  }

  roomChannel = supabase
    .channel("quiz-room-" + roomId)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "quiz_rooms", filter: `id=eq.${roomId}` },
      (payload) => {
        if (payload.new) {
          currentRoom = payload.new;
          renderRoom();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "quiz_participants", filter: `room_id=eq.${roomId}` },
      () => {
        fetchParticipants(roomId);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "quiz_questions", filter: `room_id=eq.${roomId}` },
      () => {
        fetchQuestions(roomId);
      }
    )
    .subscribe();
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
    li.textContent = `${p.name}${isHost ? " · Host" : ""}${me && p.id === me.id ? " · Sen" : ""}`;
    participantsListEl.appendChild(li);
  });
}

function renderQuestions() {
  roomQuestionCountEl.textContent = questions.length.toString();
  myQuestionsListEl.innerHTML = "";
  roomQuestionsListEl.innerHTML = "";

  const authorName = (id) => participants.find((p) => p.id === id)?.name || "?";

  questions.forEach((q, idx) => {
    const timeInfo = `${q.time_limit_sec || currentRoom?.default_time_limit_sec || 20} sn`;
    const metaText = `${q.question_type?.toUpperCase() || "?"} · ${timeInfo}`;

    const liRoom = document.createElement("li");
    const metaBlock = document.createElement("div");
    metaBlock.className = "question-meta-block";
    metaBlock.innerHTML = `<strong>${idx + 1}.</strong> ${q.text || "(boş soru)"}<span class="meta">${metaText} · ${authorName(q.author_participant_id)}</span>`;
    liRoom.appendChild(metaBlock);
    roomQuestionsListEl.appendChild(liRoom);

    if (me && q.author_participant_id === me.id) {
      const liMine = document.createElement("li");
      liMine.appendChild(metaBlock.cloneNode(true));
      if (currentRoom?.status === "collecting") {
        const btn = document.createElement("button");
        btn.className = "delete-btn small";
        btn.textContent = "Sil";
        btn.onclick = () => deleteQuestion(q.id);
        liMine.appendChild(btn);
      }
      myQuestionsListEl.appendChild(liMine);
    }
  });
}

function renderRoom() {
  if (!currentRoom) return;

  roomTitleEl.textContent = "Oda";
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
  }
}

function renderPhaseViews() {
  if (!currentRoom) return;

  if (currentRoom.status === "collecting") {
    collectView.classList.remove("hidden");
    playView.classList.add("hidden");
    resultsView.classList.add("hidden");
    stopTimer();
  } else if (currentRoom.status === "playing") {
    collectView.classList.add("hidden");
    playView.classList.remove("hidden");
    resultsView.classList.add("hidden");
    renderCurrentQuestion();
  } else if (currentRoom.status === "finished") {
    collectView.classList.add("hidden");
    playView.classList.add("hidden");
    resultsView.classList.remove("hidden");
    stopTimer();
    loadAndRenderResults();
    triggerConfetti();
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
  renderQuestions();

  questionTextInput.value = "";
  optionAInput.value = "";
  optionBInput.value = "";
  optionCInput.value = "";
  optionDInput.value = "";
  questionTimeLimitInput.value = "";
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
  }
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
  currentRoom = data;
  confettiPlayed = false;
  renderRoom();
}

// =============================================================
// Play view (participants)
// =============================================================
/** Render the currently active question in play mode. */
function renderCurrentQuestion() {
  if (!currentRoom || !currentRoom.question_order || currentRoom.question_order.length === 0) {
    playQuestionTextEl.textContent = "Sorular yükleniyor...";
    playOptionsEl.innerHTML = "";
    return;
  }

  const idx = currentRoom.current_question_index || 0;
  const questionId = currentRoom.question_order[idx];
  currentQuestion = questions.find((q) => q.id === questionId);

  if (!currentQuestion) {
    playQuestionTextEl.textContent = "Soru bulunamadı.";
    playOptionsEl.innerHTML = "";
    return;
  }

  hasAnsweredCurrent = false;
  answerFeedbackEl.textContent = "";

  playQuestionCounterEl.textContent = `Soru ${idx + 1}/${currentRoom.question_order.length}`;
  playQuestionTextEl.textContent = currentQuestion.text || "";

  playOptionsEl.innerHTML = "";
  (currentQuestion.options || []).forEach((optText, i) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    const letter = String.fromCharCode("A".charCodeAt(0) + i);
    btn.innerHTML = `<span class="option-letter">${letter}</span><span>${optText}</span>`;
    btn.onclick = () => handleAnswerClick(i, btn);
    playOptionsEl.appendChild(btn);
  });

  const limit = currentQuestion.time_limit_sec || currentRoom.default_time_limit_sec || 20;
  const startedAt = currentRoom.current_question_started_at
    ? new Date(currentRoom.current_question_started_at).getTime()
    : Date.now();
  questionEndTime = startedAt + limit * 1000;

  startTimer(limit);
}

/** Start timer bar & countdown for a question. */
function startTimer(limitSeconds) {
  stopTimer();

  function tick() {
    if (!questionEndTime) return;
    const now = Date.now();
    const total = limitSeconds;
    const remainingMs = Math.max(0, questionEndTime - now);
    const remainingSec = remainingMs / 1000;
    timerDisplayEl.textContent = formatSeconds(remainingSec);

    const ratio = Math.max(0, Math.min(1, remainingSec / total));
    timerBarFill.style.width = `${ratio * 100}%`;

    if (remainingSec <= 0) {
      timerDisplayEl.textContent = "00:00";
      timerBarFill.style.width = "0%";
      clearInterval(timerInterval);
      timerInterval = null;
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
}

/** Persist an answer for the current player and show quick feedback. */
async function handleAnswerClick(answerIndex, btnEl) {
  if (!currentQuestion || !me || hasAnsweredCurrent) return;

  hasAnsweredCurrent = true;

  const buttons = playOptionsEl.querySelectorAll("button");
  buttons.forEach((b) => {
    b.disabled = true;
    b.classList.remove("selected");
  });
  btnEl.classList.add("selected");

  const isCorrect = answerIndex === currentQuestion.correct_index;

  const { error } = await supabase.from("quiz_answers").insert({
    question_id: currentQuestion.id,
    participant_id: me.id,
    answer_index: answerIndex,
    is_correct: isCorrect,
  });

  if (error) {
    answerFeedbackEl.textContent = "Cevap kaydedilemedi: " + error.message;
    logError("handleAnswerClick", error);
    return;
  }

  answerFeedbackEl.textContent = isCorrect
    ? "Doğru! 🎉"
    : "Yanlış, olsun sıradaki soruya bakalım.";
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
    .select("participant_id,is_correct,question_id")
    .in("question_id", questionIds);
  if (aErr) {
    resultsListEl.textContent = "Cevaplar alınamadı: " + aErr.message;
    return;
  }

  const scoreMap = new Map();
  parts.forEach((p) => scoreMap.set(p.id, 0));
  ans.forEach((a) => {
    if (a.is_correct) {
      const prev = scoreMap.get(a.participant_id) || 0;
      scoreMap.set(a.participant_id, prev + 1);
    }
  });

  const rows = parts
    .map((p) => ({
      id: p.id,
      name: p.name,
      correct: scoreMap.get(p.id) || 0,
    }))
    .sort((a, b) => b.correct - a.correct);

  const totalQuestions = questionIds.length;

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Sıra</th><th>İsim</th><th>Doğru</th><th>Toplam soru</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.classList.add(`rank-${idx + 1}`);
    tr.innerHTML = `<td>${idx + 1}</td><td>${row.name}</td><td>${row.correct}</td><td>${totalQuestions}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  resultsListEl.innerHTML = "";
  resultsListEl.appendChild(table);

  if (me) {
    const mine = rows.find((r) => r.id === me.id);
    if (mine) {
      resultsSummaryEl.textContent = `Sen: ${mine.correct}/${totalQuestions} doğru`;
    }
  }
}

// =============================================================
// Auto-rejoin / initialization
// =============================================================
/** Try to auto rejoin using ?room= or the last saved room slug. */
async function autoJoinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const roomSlug = params.get("room") || localStorage.getItem(LS_LAST_ROOM);
  const lastName = localStorage.getItem(LS_LAST_NAME) || "";
  if (!roomSlug) return;

  ensureClientId();
  joinCodeInput.value = roomSlug.toUpperCase();
  if (lastName) joinNameInput.value = lastName;

  const room = await fetchRoomBySlug(roomSlug.toUpperCase());
  if (!room) return;

  const participant = await findExistingParticipant(room.id);
  if (participant) {
    rejoinNoticeEl.textContent = `${participant.name} olarak odaya tekrar bağlanılıyor...`;
    rejoinNoticeEl.classList.remove("hidden");
    enterRoom(room, participant);
    return;
  }

  rejoinNoticeEl.textContent = `${lastName || ""} olarak yeniden katılmak için form hazır.`;
  rejoinNoticeEl.classList.remove("hidden");
}

function init() {
  ensureClientId();
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
