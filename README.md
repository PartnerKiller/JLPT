# Premium JLPT Practice Hub

An interactive, responsive, and realistic web application designed for practicing the Japanese Language Proficiency Test (JLPT) from N5 to N1 levels. The application is designed with a premium dark-themed glassmorphism interface and supports multiple learning modes, client-side Text-to-Speech listening prompts, split-screen reading views, and official grading criteria.

## ✨ Features

- **Consolidated Dashboard**: Simple, unified hub to select your level (N5 to N1) and instantly configure your focus area.
- **Three Core Session Modes**:
  - 📖 **Practice Mode**: Untimed session with instant correct/incorrect feedback, color highlights, and detailed answer explanations.
  - ⏱️ **Exam Mode**: A timed mock test that hides answers and explanations until the entire session is submitted.
  - 🎓 **Official Test Mode**: A strict exam simulation with official JLPT time limits, active countdowns, a flashing visual alert when time drops below 2 minutes, and automatic submission on timeout.
- **Four Focus Areas**: Focus on individual categories (**Vocabulary**, **Grammar**, **Reading**, or **Listening**) or take a **Full Mock Test**.
- **User Authentication System**:
  - Secure **Login** and **Registration** system saving user accounts directly to a local JSON database.
  - Separate user roles: **Admin** (`sakura`/`sakura`) and **Learner** (new accounts).
  - Profile settings modal allowing users to securely update their username and password credentials.
  - Streak tracking and high score syncing directly with the backend.
- **Admin Dashboard Controls**:
  - Interactive table showing all registered users' credentials.
  - Role management (identifying Admins vs Learners).
  - Direct username and password modification capabilities for all users.
- **Interactive Listening System**: Fully client-side Audio Prompt dictation engine. Spoken texts (context, dialogues, and questions) are read entirely in native-speaker Japanese at level-appropriate speech speeds (slow for N5/N4, normal for N3, native speed for N2/N1).
- **Split Reading View**: Responsive split-pane layout with a glassmorphic scrollable text reader on the left and reading comprehension questions on the right.
- **Star (`★`) Rearrangement Questions**: Realistic sentence composition questions matching actual JLPT grammar section layouts.
- **Furigana & Romaji Toggles**: Support for showing/hiding furigana (N5-N1) and romaji translations (N5-N4) below Japanese text. Furigana toggling applies globally to options, questions, reading passages, and reviews.
- **Global Mock Randomization**: Question configurations are fully shuffled across all sections (Vocabulary, Grammar, Reading, and Listening) by default in all mock exam/test modes.
- **Progress Tracking & Analytics**: Level progress scores are saved in the user database. Detailed charts show sectional performance breakdown (Vocabulary, Grammar, Reading, Listening) with pass/fail grading at the end of official tests.

## 🛠️ Technical Stack

- **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3 with glassmorphic styles and animations.
- **Icons & Fonts**: Google Fonts (Outfit, Noto Sans JP) & FontAwesome Icons.
- **Audio Engine**: Web Speech Synthesis API (`window.speechSynthesis`) with optimized asynchronous voice loading, Chrome queue cancellation workaround, Translate TTS fallback options, and regex-based HTML `<ruby>` / `<rt>` audio speech sanitization.
- **Backend**: Node.js static file server (`server.js`) configured with query-string splitting (allowing double-layer cache-busting), JSON database controllers, and API authorization header checks.

## 🚀 How to Run

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Steps
1. Clone this repository:
   ```bash
   git clone https://github.com/PartnerKiller/JLPT.git
   cd JLPT
   ```

2. Start the local server:
   ```bash
   node server.js
   ```

3. Open your browser and navigate to:
   ```http
   http://localhost:8085
   ```

## 📄 File Structure
```text
JLPT/
├── public/
│   ├── index.html        # Main dashboard, auth overlays, and quiz markup
│   ├── style.css         # Styling system (glassmorphism layouts & toggle alignments)
│   ├── app.js            # Frontend core application logic & state runners
│   └── quiz-data.js      # Structured question database (N5 to N1)
├── server.js             # Static node web server with JSON DB APIs
├── database.json         # Local persistent user database store
└── README.md             # Project documentation
```