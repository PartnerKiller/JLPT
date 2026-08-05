// public/app.js
// Main client application logic for Nazuna JLPT practice hub

class JLPTApp {
  constructor() {
    this.level = null;
    this.sessionMode = 'practice'; // 'practice' or 'exam'
    this.focusSection = 'All'; // 'All' (Full Mock), 'Vocabulary', 'Grammar', 'Reading', 'Listening'
    this.sessionQuestions = [];
    this.currentIndex = 0;
    this.score = 0;
    this.selectedOption = null;
    this.answers = []; // Records user responses
    this.isFullMockExam = false;
    
    // Timer state
    this.timerInterval = null;
    this.timeElapsed = 0;
    
    // UI Panels
    this.panelDashboard = document.getElementById('panel-dashboard');
    this.panelQuiz = document.getElementById('panel-quiz');
    this.panelResults = document.getElementById('panel-results');
    
    // Audio elements
    this.audioCorrect = document.getElementById('audio-correct');
    this.audioWrong = document.getElementById('audio-wrong');
    this.audioClick = document.getElementById('audio-click');

    // Romaji State & DOM elements
    this.romajiEnabled = false;
    this.romajiCheckbox = document.getElementById('romaji-checkbox');
    this.romajiToggleContainer = document.getElementById('romaji-toggle-container');
    this.romajiTextEl = document.getElementById('romaji-text');

    // Listening Audio State
    this.speechUtterance = null;
    this.fallbackAudio = null;
    this.isSpeaking = false;
    this.btnPlayListening = document.getElementById('btn-play-listening');
    this.listeningStatusText = document.getElementById('listening-status-text');

    this.hasSubmittedActive = false;
    
    this.init();
  }

  init() {
    this.loadStreak();
    this.loadLevelStats();
    this.applySavedTheme();
    
    // Bind focus section tabs from index.html
    this.sectionTabs = {
      All: document.getElementById('section-all'),
      Vocabulary: document.getElementById('section-vocab'),
      Grammar: document.getElementById('section-grammar'),
      Reading: document.getElementById('section-reading'),
      Listening: document.getElementById('section-listening')
    };

    // Warm up speech synthesis voices
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      }
    }
  }

  // --- STREAK & LOCALSTORAGE STUFF ---
  loadStreak() {
    const lastActiveDate = localStorage.getItem('jlpt_last_active');
    let streakCount = parseInt(localStorage.getItem('jlpt_streak') || '0', 10);
    const today = new Date().toDateString();
    
    if (lastActiveDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastActiveDate === today) {
        // Streak maintained
      } else if (lastActiveDate === yesterday.toDateString()) {
        // Maintained
      } else {
        streakCount = 0;
        localStorage.setItem('jlpt_streak', '0');
      }
    }
    document.getElementById('streak-count').textContent = streakCount;
  }

  updateStreak() {
    const lastActiveDate = localStorage.getItem('jlpt_last_active');
    let streakCount = parseInt(localStorage.getItem('jlpt_streak') || '0', 10);
    const today = new Date().toDateString();

    if (lastActiveDate !== today) {
      streakCount += 1;
      localStorage.setItem('jlpt_streak', streakCount.toString());
      localStorage.setItem('jlpt_last_active', today);
      document.getElementById('streak-count').textContent = streakCount;
    }
  }

  loadLevelStats() {
    const levels = ['N5', 'N4', 'N3', 'N2', 'N1'];
    levels.forEach(lvl => {
      const score = localStorage.getItem(`jlpt_high_score_${lvl}`);
      // Try to find either legacy score badge or newer score badge element
      const element = document.getElementById(`stats-${lvl.toLowerCase()}-score`) || document.getElementById(`stats-${lvl.toLowerCase()}-badge`);
      if (score && element) {
        element.innerHTML = `<i class="fa-solid fa-trophy text-orange"></i> ${score}%`;
      }
    });
  }

  saveHighScore(lvl, scorePercent) {
    const currentHigh = parseInt(localStorage.getItem(`jlpt_high_score_${lvl}`) || '0', 10);
    if (scorePercent > currentHigh) {
      localStorage.setItem(`jlpt_high_score_${lvl}`, scorePercent.toString());
      this.loadLevelStats();
    }
  }

  // --- THEME ---
  applySavedTheme() {
    const isLight = localStorage.getItem('jlpt_theme') === 'light';
    if (isLight) {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      document.querySelector('#theme-toggle i').className = 'fa-solid fa-moon';
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
      document.querySelector('#theme-toggle i').className = 'fa-solid fa-sun';
    }
  }

  toggleTheme() {
    this.playAudio('click');
    const isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      localStorage.setItem('jlpt_theme', 'light');
      document.querySelector('#theme-toggle i').className = 'fa-solid fa-moon';
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
      localStorage.setItem('jlpt_theme', 'dark');
      document.querySelector('#theme-toggle i').className = 'fa-solid fa-sun';
    }
  }

  // --- SELECTORS ---
  setSessionMode(mode) {
    this.playAudio('click');
    this.sessionMode = mode;
    
    // Toggle active state in UI
    const pmBtn = document.getElementById('mode-practice');
    const emBtn = document.getElementById('mode-exam');
    const tmBtn = document.getElementById('mode-test');
    if (pmBtn && emBtn) {
      pmBtn.classList.toggle('active', mode === 'practice');
      emBtn.classList.toggle('active', mode === 'exam');
      if (tmBtn) tmBtn.classList.toggle('active', mode === 'test');
    }
  }

  setFocusSection(section) {
    this.playAudio('click');
    this.focusSection = section;

    // Toggle active states on tabs
    for (const key in this.sectionTabs) {
      const tab = this.sectionTabs[key];
      if (tab) {
        tab.classList.toggle('active', key === section);
      }
    }
  }

  showDashboard() {
    this.playAudio('click');
    this.stopListeningAudio();
    clearInterval(this.timerInterval);
    this.panelQuiz.classList.remove('active');
    this.panelResults.classList.remove('active');
    this.panelDashboard.classList.add('active');
    this.loadLevelStats();
  }

  // --- SESSION RUNNERS ---
  selectLevel(level) {
    this.playAudio('click');
    this.level = level;

    // Force Full Test for "Take Test" mode
    if (this.sessionMode === 'test') {
      this.focusSection = 'All';
      this.setFocusSection('All');
    }

    const db = window.quizQuestions[level];
    if (!db) {
      alert("No questions found for this level!");
      return;
    }

    // A. FULL MOCK TEST (All sections combined)
    if (this.focusSection === 'All') {
      const vocabQs = this.shuffleArray([...(db.Vocabulary || [])]).slice(0, 8);
      const grammarQs = this.shuffleArray([...(db.Grammar || [])]).slice(0, 8);
      const readingQs = this.shuffleArray([...(db.Reading || [])]).slice(0, 2);
      const listeningQs = this.shuffleArray([...(db.Listening || [])]).slice(0, 4);

      // Tag sections
      vocabQs.forEach(q => q.section = 'Vocabulary');
      grammarQs.forEach(q => q.section = 'Grammar');
      readingQs.forEach(q => q.section = 'Reading');
      listeningQs.forEach(q => q.section = 'Listening');

      if (this.sessionMode === 'exam' || this.sessionMode === 'test') {
        // Combined sequential mock structure
        this.sessionQuestions = [...vocabQs, ...grammarQs, ...readingQs, ...listeningQs];
        this.isFullMockExam = true;
      } else {
        // Practice mixed mode: select 10 random mixed questions
        const mixed = [...vocabQs, ...grammarQs, ...readingQs, ...listeningQs];
        this.sessionQuestions = this.shuffleArray(mixed).slice(0, 10);
        this.isFullMockExam = false;
      }
    } 
    // B. SECTIONAL PRACTICE (Vocabulary, Grammar, Reading, or Listening only)
    else {
      const allQs = db[this.focusSection];
      if (!allQs || allQs.length === 0) {
        alert(`No questions found for ${level} ${this.focusSection}!`);
        return;
      }

      // Limit based on types
      let limit = 8;
      if (this.focusSection === 'Reading') limit = 2;
      if (this.focusSection === 'Listening') limit = 4;

      this.sessionQuestions = this.shuffleArray([...allQs]).slice(0, limit);
      this.sessionQuestions.forEach(q => q.section = this.focusSection);
      this.isFullMockExam = false;
    }

    if (this.sessionQuestions.length === 0) {
      alert("No questions could be loaded for this session!");
      return;
    }

    this.startSession();
  }

  enterLevelHub(level) {
    // Backward compatibility alias
    this.selectLevel(level);
  }

  startSession() {
    this.currentIndex = 0;
    this.score = 0;
    this.selectedOption = null;
    this.answers = [];
    this.hasSubmittedActive = false;
    this.timeElapsed = 0;

    // Reset layout
    this.panelDashboard.classList.remove('active');
    this.panelResults.classList.remove('active');
    this.panelQuiz.classList.add('active');

    // Remove old timer warnings
    const timerEl = document.getElementById('time-elapsed');
    timerEl.classList.remove('timer-warning');

    // Set badges
    const titleBadge = document.getElementById('quiz-title-badge');
    titleBadge.textContent = `JLPT ${this.level}`;
    titleBadge.className = `level-badge-small ${this.level}-theme-bg`;

    const modeBadge = document.getElementById('session-mode-badge');
    if (this.sessionMode === 'practice') {
      modeBadge.textContent = 'Practice Mode';
      this.isCountdown = false;
    } else if (this.sessionMode === 'exam') {
      modeBadge.textContent = 'Exam Mode';
      this.isCountdown = false;
    } else if (this.sessionMode === 'test') {
      modeBadge.textContent = 'Official Test Mode';
      this.isCountdown = true;
      // Official JLPT durations: N5 (105m), N4 (125m), N3 (140m), N2 (155m), N1 (170m)
      const testLimits = { N5: 6300, N4: 7500, N3: 8400, N2: 9300, N1: 10200 };
      this.timeRemaining = testLimits[this.level] || 6300;
    }

    // Start Timer
    timerEl.textContent = this.isCountdown 
      ? `${Math.floor(this.timeRemaining / 60).toString().padStart(2, '0')}:${(this.timeRemaining % 60).toString().padStart(2, '0')}`
      : '00:00';
      
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.tickTimer(), 1000);

    // Hide feedback card
    document.getElementById('feedback-container').classList.add('hidden');

    this.renderQuestion();
  }

  tickTimer() {
    const timerEl = document.getElementById('time-elapsed');
    if (this.isCountdown) {
      this.timeRemaining--;
      
      if (this.timeRemaining <= 120) {
        timerEl.classList.add('timer-warning');
      } else {
        timerEl.classList.remove('timer-warning');
      }

      if (this.timeRemaining <= 0) {
        timerEl.textContent = '00:00';
        clearInterval(this.timerInterval);
        this.autoSubmitTest();
        return;
      }

      const minutes = Math.floor(this.timeRemaining / 60).toString().padStart(2, '0');
      const seconds = (this.timeRemaining % 60).toString().padStart(2, '0');
      timerEl.textContent = `${minutes}:${seconds}`;
    } else {
      this.timeElapsed++;
      const minutes = Math.floor(this.timeElapsed / 60).toString().padStart(2, '0');
      const seconds = (this.timeElapsed % 60).toString().padStart(2, '0');
      timerEl.textContent = `${minutes}:${seconds}`;
    }
  }

  autoSubmitTest() {
    this.stopListeningAudio();
    clearInterval(this.timerInterval);
    alert("Time limit reached! Your exam is being automatically submitted.");
    
    // Auto-fill remaining unanswered questions
    for (let i = this.currentIndex; i < this.sessionQuestions.length; i++) {
      const q = this.sessionQuestions[i];
      this.answers.push({
        question: q,
        selected: null,
        isCorrect: false
      });
    }
    
    this.finishSession();
  }

  renderQuestion() {
    this.selectedOption = null;
    this.hasSubmittedActive = false;
    this.stopListeningAudio();

    // Enable/disable submit button
    const submitBtn = document.getElementById('btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = this.sessionMode === 'practice' ? 'Submit Answer' : 'Next Question';

    const q = this.sessionQuestions[this.currentIndex];

    // Update section badge color
    const sectBadge = document.getElementById('active-section-badge');
    sectBadge.textContent = q.section;
    sectBadge.className = 'section-badge';
    if (q.section === 'Vocabulary') sectBadge.classList.add('bg-green');
    if (q.section === 'Grammar') sectBadge.classList.add('bg-blue');
    if (q.section === 'Reading') sectBadge.classList.add('bg-yellow');
    if (q.section === 'Listening') sectBadge.classList.add('bg-purple');

    // Update progress numbers
    document.getElementById('current-q-index').textContent = (this.currentIndex + 1).toString();
    document.getElementById('total-q-count').textContent = this.sessionQuestions.length.toString();
    const percent = Math.round(((this.currentIndex) / this.sessionQuestions.length) * 100);
    document.getElementById('progress-percentage').textContent = `${percent}%`;
    document.getElementById('progress-fill').style.width = `${percent}%`;

    // Category heading
    document.getElementById('question-category').textContent = q.section;

    // --- QUESTION SPECIFIC VIEWS ---
    const layoutWrapper = document.getElementById('quiz-layout-wrapper');
    const passageContainer = document.getElementById('reading-passage-container');
    const listeningContainer = document.getElementById('listening-player-container');

    // 1. Reading split pane
    if (q.section === 'Reading') {
      layoutWrapper.classList.add('split-reading');
      passageContainer.innerHTML = q.passage;
      passageContainer.classList.remove('hidden');
    } else {
      layoutWrapper.classList.remove('split-reading');
      passageContainer.classList.add('hidden');
    }

    // 2. Listening audio deck
    if (q.section === 'Listening') {
      document.getElementById('listening-situation').textContent = q.situation;
      listeningContainer.classList.remove('hidden');
      this.resetListeningControls();
    } else {
      listeningContainer.classList.add('hidden');
    }

    // 3. Romaji Toggle box (N5 and N4)
    if (this.level === 'N5' || this.level === 'N4') {
      this.romajiToggleContainer.classList.remove('hidden');
      this.romajiEnabled = this.romajiCheckbox.checked;
    } else {
      this.romajiToggleContainer.classList.add('hidden');
      this.romajiEnabled = false;
    }

    // Inject Text
    document.getElementById('question-text').innerHTML = q.question;

    // Romaji text visibility
    if (this.romajiEnabled && q.romaji) {
      this.romajiTextEl.textContent = q.romaji;
      this.romajiTextEl.classList.remove('hidden');
    } else {
      this.romajiTextEl.classList.add('hidden');
    }

    // Render option list
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';

    q.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `
        <span class="option-index">${String.fromCharCode(65 + idx)}</span>
        <span class="option-text">${opt}</span>
      `;
      btn.onclick = () => this.selectOption(idx);
      optionsContainer.appendChild(btn);
    });

    // Hide feedback card
    document.getElementById('feedback-container').classList.add('hidden');
  }

  selectOption(idx) {
    if (this.hasSubmittedActive && this.sessionMode === 'practice') return; // Locked in practice mode
    
    this.playAudio('click');
    this.selectedOption = idx;

    const btns = document.querySelectorAll('#options-container .option-btn');
    btns.forEach((btn, index) => {
      btn.classList.toggle('selected', index === idx);
    });

    document.getElementById('btn-submit').disabled = false;
  }

  handleNextSubmit() {
    if (this.selectedOption === null) return;

    const q = this.sessionQuestions[this.currentIndex];

    // Mode: PRACTICE MODE
    if (this.sessionMode === 'practice') {
      if (!this.hasSubmittedActive) {
        this.hasSubmittedActive = true;
        const isCorrect = this.selectedOption === q.correct;
        
        if (isCorrect) {
          this.score++;
          this.playAudio('correct');
        } else {
          this.playAudio('wrong');
        }

        // Show options states
        const btns = document.querySelectorAll('#options-container .option-btn');
        btns.forEach((btn, index) => {
          btn.classList.remove('selected');
          if (index === q.correct) {
            btn.classList.add('correct');
          } else if (index === this.selectedOption) {
            btn.classList.add('wrong');
          }
        });

        // Record Answer
        this.answers.push({
          question: q,
          selected: this.selectedOption,
          isCorrect: isCorrect
        });

        // Setup feedback explanations
        const feedbackContainer = document.getElementById('feedback-container');
        const feedbackIconLabel = document.getElementById('feedback-icon-label');
        const feedbackExplanation = document.getElementById('feedback-explanation');

        feedbackContainer.classList.remove('hidden');
        if (isCorrect) {
          feedbackIconLabel.innerHTML = '<i class="fa-solid fa-circle-check text-green"></i> Correct!';
          feedbackIconLabel.className = 'feedback-status text-green';
        } else {
          feedbackIconLabel.innerHTML = '<i class="fa-solid fa-circle-xmark text-red"></i> Incorrect';
          feedbackIconLabel.className = 'feedback-status text-red';
        }
        feedbackExplanation.innerHTML = q.explanation;

        // Update submit button text
        const isLast = this.currentIndex === this.sessionQuestions.length - 1;
        document.getElementById('btn-submit').textContent = isLast ? 'View Results' : 'Next Question';
      } else {
        this.goToNext();
      }
    } 
    // Mode: EXAM MODE
    else {
      // Record answer immediately and transition
      const isCorrect = this.selectedOption === q.correct;
      if (isCorrect) {
        this.score++;
      }
      this.answers.push({
        question: q,
        selected: this.selectedOption,
        isCorrect: isCorrect
      });

      this.goToNext();
    }
  }

  goToNext() {
    this.currentIndex++;
    if (this.currentIndex < this.sessionQuestions.length) {
      this.renderQuestion();
    } else {
      this.finishSession();
    }
  }

  // --- LISTENING TEXT TO SPEECH (TTS) SYSTEM ---
  toggleListeningTTS() {
    if (this.isSpeaking) {
      this.stopListeningAudio();
    } else {
      this.startListeningAudio();
    }
  }

  startListeningAudio() {
    this.playAudio('click');
    
    // Stop any existing audio
    this.stopListeningAudio();

    const q = this.sessionQuestions[this.currentIndex];
    if (!q || !q.dialogue) return;

    this.isSpeaking = true;
    this.btnPlayListening.innerHTML = '<i class="fa-solid fa-square-stop"></i> Stop Audio';
    this.btnPlayListening.classList.add('playing');
    this.listeningStatusText.textContent = 'Speaking...';

    // Construct Japanese-only speech text (excluding English context description)
    const cleanDialogue = q.dialogue.replace(/<br>/g, '。').replace(/<\/?[^>]+(>|$)/g, "");
    const cleanQuestion = q.question.replace(/<\/?[^>]+(>|$)/g, "");

    // Structure prompt readouts: Context -> Dialogue -> Question
    const promptText = `問題。 ${q.situation_ja || ''}。 会話。 ${cleanDialogue}。 もう一度質問します。 ${cleanQuestion}`;

    // Speed rates based on levels
    let rate = 1.0;
    if (this.level === 'N5') rate = 0.75;
    else if (this.level === 'N4') rate = 0.8;
    else if (this.level === 'N3') rate = 0.88;
    else if (this.level === 'N2') rate = 1.0;
    else if (this.level === 'N1') rate = 1.08;

    // Split text into chunks to respect Google Translate API character limits (usually 200 chars)
    // We split by standard Japanese punctuation: 。 、 ？ ！
    const rawChunks = promptText.split(/[。？！]/);
    const chunks = rawChunks.map(c => c.trim()).filter(c => c.length > 0);
    
    console.log("Playing listening audio in chunks:", chunks);

    let chunkIdx = 0;
    this.fallbackAudio = null;

    const playNextChunk = () => {
      if (!this.isSpeaking || chunkIdx >= chunks.length) {
        this.resetListeningControls();
        return;
      }

      const text = chunks[chunkIdx++];
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&q=${encodeURIComponent(text)}`;
      
      this.fallbackAudio = new Audio();
      this.fallbackAudio.referrerPolicy = "no-referrer"; // Strip referrer header
      this.fallbackAudio.src = url;
      this.fallbackAudio.playbackRate = rate;
      
      this.fallbackAudio.onended = () => {
        playNextChunk();
      };
      
      this.fallbackAudio.onerror = (err) => {
        console.error("Translate TTS playback failed for chunk:", text, err);
        // Skip this chunk and try the next
        playNextChunk();
      };

      this.fallbackAudio.play().catch(e => {
        console.error("Audio play invocation failed:", e);
        this.resetListeningControls();
      });
    };

    playNextChunk();
  }

  stopListeningAudio() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.fallbackAudio) {
      try {
        this.fallbackAudio.pause();
      } catch (e) {}
      this.fallbackAudio = null;
    }
    this.resetListeningControls();
  }

  resetListeningControls() {
    this.isSpeaking = false;
    if (this.btnPlayListening && this.listeningStatusText) {
      this.btnPlayListening.innerHTML = '<i class="fa-solid fa-play"></i> Play Audio Prompt';
      this.btnPlayListening.classList.remove('playing');
      
      let speedText = 'Normal Speed';
      if (this.level === 'N5' || this.level === 'N4') speedText = 'Slow Speed';
      else if (this.level === 'N3') speedText = 'Moderate Speed';
      
      this.listeningStatusText.textContent = `Audio Ready. ${speedText}.`;
    }
  }

  // --- RESULTS AND SECTION COMPILATIONS ---
  finishSession() {
    clearInterval(this.timerInterval);
    this.stopListeningAudio();
    this.playAudio('click');
    this.updateStreak();

    // Switch views
    this.panelQuiz.classList.remove('active');
    this.panelResults.classList.add('active');

    // Score calculations
    const total = this.sessionQuestions.length;
    const pct = Math.round((this.score / total) * 100);

    // Save highscores (only for full exams or multi-section practice)
    if (this.isFullMockExam) {
      this.saveHighScore(this.level, pct);
    }

    document.getElementById('results-score-text').textContent = `${this.score}/${total}`;
    
    let modeText = this.sessionMode === 'practice' ? 'Practice' : 'Exam';
    if (this.isFullMockExam) modeText = 'Full Mock Exam';
    if (this.sessionMode === 'test') modeText = 'Official Mock Test';

    let outcomeHTML = '';
    if (this.sessionMode === 'test') {
      const passThresholds = { N5: 45, N4: 50, N3: 53, N2: 50, N1: 56 };
      const isPassed = pct >= (passThresholds[this.level] || 50);
      outcomeHTML = isPassed
        ? `<br><div class="test-outcome-badge pass"><i class="fa-solid fa-circle-check"></i> Passed (Mock Exam)</div>`
        : `<br><div class="test-outcome-badge fail"><i class="fa-solid fa-circle-xmark"></i> Failed (Mock Exam)</div>`;
    }

    document.getElementById('results-meta-desc').innerHTML = `You completed the JLPT ${this.level} session in ${modeText} Mode.${outcomeHTML}`;
    
    document.getElementById('stat-accuracy').textContent = `${pct}%`;

    // Speed calculation
    const minutes = Math.floor(this.timeElapsed / 60).toString().padStart(2, '0');
    const seconds = (this.timeElapsed % 60).toString().padStart(2, '0');
    document.getElementById('stat-total-time').textContent = `${minutes}:${seconds}`;

    const avgSpeed = Math.round(this.timeElapsed / total);
    document.getElementById('stat-avg-speed').textContent = `${avgSpeed}s`;

    // Radial ring dash offset
    const circle = document.querySelector('.circle-fill');
    const strokeOffset = 314 - (314 * pct) / 100;
    circle.style.strokeDashoffset = strokeOffset;

    // Section Breakdown metrics
    const categories = {
      Vocabulary: { correct: 0, total: 0 },
      Grammar: { correct: 0, total: 0 },
      Reading: { correct: 0, total: 0 },
      Listening: { correct: 0, total: 0 }
    };

    this.answers.forEach(ans => {
      const sect = ans.question.section;
      if (categories[sect]) {
        categories[sect].total++;
        if (ans.isCorrect) {
          categories[sect].correct++;
        }
      }
    });

    const updateBar = (sectName, barPctId, barFillId) => {
      const entry = categories[sectName];
      const categoryPct = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0;
      document.getElementById(barPctId).textContent = entry.total > 0 ? `${categoryPct}% (${entry.correct}/${entry.total})` : '--';
      document.getElementById(barFillId).style.width = `${categoryPct}%`;
    };

    updateBar('Vocabulary', 'bar-vocab-pct', 'bar-vocab-fill');
    updateBar('Grammar', 'bar-grammar-pct', 'bar-grammar-fill');
    updateBar('Reading', 'bar-reading-pct', 'bar-reading-fill');
    updateBar('Listening', 'bar-listening-pct', 'bar-listening-fill');

    // Certificate visibility
    document.getElementById('cert-level').textContent = this.level;
    document.getElementById('cert-accuracy').textContent = `${pct}%`;
    document.getElementById('cert-date').textContent = new Date().toISOString().split('T')[0];

    const certCard = document.getElementById('certificate-card');
    if (pct >= 70) {
      certCard.classList.remove('hidden');
    } else {
      certCard.classList.add('hidden');
    }

    // Build review list cards
    const reviewList = document.getElementById('review-list');
    reviewList.innerHTML = '';

    this.answers.forEach((ans, idx) => {
      const item = document.createElement('div');
      item.className = `review-item ${ans.isCorrect ? 'is-correct' : 'is-wrong'}`;

      const selectedTxt = ans.question.options[ans.selected];
      const correctTxt = ans.question.options[ans.question.correct];

      // Add Reading passages or Listening transcripts to the card
      let sectionDetailsHTML = '';
      if (ans.question.section === 'Reading' && ans.question.passage) {
        sectionDetailsHTML = `
          <div class="review-dialogue-block">
            <h5>Reading Passage:</h5>
            <div class="reading-passage-card" style="max-height: 200px; padding: 15px; margin-top: 5px; font-size: 13px;">
              ${ans.question.passage}
            </div>
          </div>
        `;
      } else if (ans.question.section === 'Listening' && ans.question.dialogue) {
        sectionDetailsHTML = `
          <div class="review-dialogue-block">
            <h5>Audio Script (Dialogue):</h5>
            <p class="review-dialogue-text">${ans.question.dialogue}</p>
          </div>
        `;
      }

      item.innerHTML = `
        <div class="review-header">
          <span class="question-category">${ans.question.section}</span>
          <span class="review-badge-status ${ans.isCorrect ? 'bg-green' : 'bg-red'}">
            ${ans.isCorrect ? 'Correct' : 'Incorrect'}
          </span>
        </div>
        
        ${ans.question.section === 'Listening' ? `
          <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 5px;">
            <strong>Situation:</strong> ${ans.question.situation}
          </div>
        ` : ''}
        
        <div class="review-question furigana-enabled">
          Q${idx + 1}: ${ans.question.question}
        </div>
        
        ${sectionDetailsHTML}

        <div class="review-answers-compare" style="margin-top: 12px;">
          <div class="review-ans-row">
            <span class="review-ans-label">Your Choice:</span>
            <span class="${ans.isCorrect ? 'text-green' : 'text-red'}">${selectedTxt}</span>
          </div>
          ${!ans.isCorrect ? `
            <div class="review-ans-row">
              <span class="review-ans-label">Correct Answer:</span>
              <span class="text-green">${correctTxt}</span>
            </div>
          ` : ''}
        </div>
        <div class="review-explanation">
          <h5>Explanation:</h5>
          <p>${ans.question.explanation}</p>
        </div>
      `;
      reviewList.appendChild(item);
    });
  }

  restartSession() {
    this.playAudio('click');
    this.selectLevel(this.level);
  }

  confirmQuit() {
    this.playAudio('click');
    const msg = this.sessionMode === 'test'
      ? "You are currently taking a realistic timed test. Quitting now will score your test as a FAIL. Are you sure you want to abandon the test?"
      : "Are you sure you want to quit this practice session? Your progress will be lost.";
    const quit = confirm(msg);
    if (quit) {
      this.showDashboard();
    }
  }

  // --- TOGGLES ---
  toggleFurigana() {
    const checkbox = document.getElementById('furigana-checkbox');
    const qText = document.getElementById('question-text');
    
    if (checkbox.checked) {
      qText.classList.add('furigana-enabled');
      qText.classList.remove('furigana-disabled');
    } else {
      qText.classList.add('furigana-disabled');
      qText.classList.remove('furigana-enabled');
    }
  }

  toggleRomaji() {
    this.playAudio('click');
    this.romajiEnabled = this.romajiCheckbox.checked;
    localStorage.setItem('jlpt_romaji_enabled', this.romajiEnabled.toString());
    
    const q = this.sessionQuestions[this.currentIndex];
    if (this.romajiEnabled && q && q.romaji) {
      this.romajiTextEl.textContent = q.romaji;
      this.romajiTextEl.classList.remove('hidden');
    } else {
      this.romajiTextEl.classList.add('hidden');
    }
  }

  // --- AUDIO FEEDBACK EFFECTS ---
  playAudio(type) {
    try {
      if (type === 'correct' && this.audioCorrect) {
        this.audioCorrect.currentTime = 0;
        this.audioCorrect.play().catch(e => {});
      } else if (type === 'wrong' && this.audioWrong) {
        this.audioWrong.currentTime = 0;
        this.audioWrong.play().catch(e => {});
      } else if (type === 'click' && this.audioClick) {
        this.audioClick.currentTime = 0;
        this.audioClick.play().catch(e => {});
      }
    } catch (e) {
      console.warn("Audio playback failed", e);
    }
  }

  // --- SHUFFLE ARRAY ---
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Instantiate App
let app;
window.addEventListener('DOMContentLoaded', () => {
  app = new JLPTApp();
});
