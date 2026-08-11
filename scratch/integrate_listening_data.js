const fs = require('fs');
const path = require('path');

const mappingPath = path.join(__dirname, '../public/audio/n5/mapping_v2.json');
const quizDataPath = path.join(__dirname, '../public/quiz-data.js');

if (!fs.existsSync(mappingPath)) {
  console.error("mapping_v2.json does not exist. Please run scrape_listening_v2.js first.");
  process.exit(1);
}

const exercises = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
console.log(`Loaded ${exercises.length} scraped exercises.`);

const newQuestions = [];

for (const ex of exercises) {
  const numQuestions = ex.mp3s.length;
  for (let i = 0; i < numQuestions; i++) {
    const qNum = i + 1;
    const correctVal = ex.answers[qNum.toString()] || ex.answers[qNum];
    if (!correctVal) {
      console.warn(`Skipping Ex ${ex.exerciseNum} Q ${qNum}: No correct answer found in answers key.`);
      continue;
    }
    
    // The images list matches Q1, Q2, etc. in order
    const imageUrl = ex.images[i] || null;
    if (!imageUrl) {
      console.warn(`Ex ${ex.exerciseNum} Q ${qNum}: No image URL found.`);
    }

    const correctIndex = parseInt(correctVal, 10) - 1; // 0-based index
    const filename = `n5_ex${ex.exerciseNum}_q${qNum}.mp3`;

    newQuestions.push({
      situation: `Listening Exercise ${ex.exerciseNum}, Question ${qNum}. Listen to the audio prompt and choose the correct illustration matching the scenario.`,
      situation_ja: `聴解演習 ${ex.exerciseNum}、問題 ${qNum}。音声を聞いて、質問に合う正しい絵（1、2、3、または 4）を選んでください。`,
      question: "正しい絵はどれですか？",
      options: ["1", "2", "3", "4"],
      correct: correctIndex,
      audioFile: filename,
      image: imageUrl, // Holds the illustration image
      explanation: `Correct illustration choice is ${correctVal}. Listen to the audio cues to identify the corresponding details.`
    });
  }
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

const { execSync } = require('child_process');
console.log("Checking and downloading missing audio files...");
for (const ex of exercises) {
  const numQuestions = ex.mp3s.length;
  for (let i = 0; i < numQuestions; i++) {
    const qNum = i + 1;
    const mp3Url = ex.mp3s[i];
    const filename = `n5_ex${ex.exerciseNum}_q${qNum}.mp3`;
    const dest = path.join(__dirname, '../public/audio/n5', filename);

    if (!fs.existsSync(dest)) {
      console.log(`Downloading missing file: ${filename}`);
      const cmd = `curl -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -o "${dest}" "${mp3Url}"`;
      try {
        execSync(cmd);
        sleepSync(1000); // Throttled download
      } catch (err) {
        console.error(`Failed to download ${mp3Url}:`, err);
      }
    }
  }
}
console.log("All audio files verified and up to date!");

console.log(`Generated ${newQuestions.length} N5 listening questions.`);

// Now we need to modify public/quiz-data.js
let quizData = fs.readFileSync(quizDataPath, 'utf8');

// Find the N5 Listening array start and end
// We can locate: "Listening": [
const startKeyword = '"Listening": [';
const startIndex = quizData.indexOf(startKeyword);

if (startIndex === -1) {
  console.error("Could not find N5 Listening block in quiz-data.js!");
  process.exit(1);
}

// Let's find the closing square bracket of the Listening array
// Since the structure is:
//     "Listening": [
//       { ... },
//       { ... }
//     ]
//   },
//   "N4": {
// We can find the closing bracket right before "N4"
const targetNext = '"N4": {';
const nextIndex = quizData.indexOf(targetNext);
if (nextIndex === -1) {
  console.error("Could not find N4 start block in quiz-data.js!");
  process.exit(1);
}

// Find the last closing bracket of the N5 Listening array
const sliceStr = quizData.substring(startIndex, nextIndex);
const lastClosingBracketRelative = sliceStr.lastIndexOf(']');
if (lastClosingBracketRelative === -1) {
  console.error("Could not find closing bracket of Listening array!");
  process.exit(1);
}

const absoluteClosingBracketIndex = startIndex + lastClosingBracketRelative;

// Extract existing Listening questions
const existingPart = quizData.substring(startIndex + startKeyword.length, absoluteClosingBracketIndex);

// Parse the existing questions as JSON array by wrapping them
let existingQuestions = [];
try {
  existingQuestions = JSON.parse('[' + existingPart + ']');
} catch (e) {
  console.warn("Failed to parse existing questions dynamically. Appending directly via string manipulation.");
}

// Let's serialize the new questions to pretty JSON strings
const serializedNew = newQuestions.map(q => {
  return `      {\n` +
         `        "situation": ${JSON.stringify(q.situation)},\n` +
         `        "situation_ja": ${JSON.stringify(q.situation_ja)},\n` +
         `        "question": ${JSON.stringify(q.question)},\n` +
         `        "options": ${JSON.stringify(q.options)},\n` +
         `        "correct": ${q.correct},\n` +
         `        "audioFile": ${JSON.stringify(q.audioFile)},\n` +
         `        "image": ${JSON.stringify(q.image)},\n` +
         `        "explanation": ${JSON.stringify(q.explanation)}\n` +
         `      }`;
}).join(',\n');

// Replace the Listening block with existing + new questions
const updatedListeningBlock = startKeyword + existingPart + ',\n' + serializedNew + '\n    ]';

const newQuizData = quizData.substring(0, startIndex) + updatedListeningBlock + quizData.substring(absoluteClosingBracketIndex + 1);

fs.writeFileSync(quizDataPath, newQuizData, 'utf8');
console.log("Successfully updated quiz-data.js with new scraped listening questions!");
