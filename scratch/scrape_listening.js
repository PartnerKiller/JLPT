const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function curlFetch(url) {
  const cmd = `curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`;
  try {
    return execSync(cmd, { maxBuffer: 10 * 1024 * 1024 }).toString();
  } catch (err) {
    console.error(`Curl failed for URL: ${url}`, err);
    return "";
  }
}

function curlDownload(url, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const cmd = `curl -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -o "${destPath}" "${url}"`;
  try {
    execSync(cmd);
    return true;
  } catch (err) {
    console.error(`Curl download failed for URL: ${url}`, err);
    return false;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function scrapeIndexPage(pageNum) {
  const url = pageNum === 1 
    ? 'https://japanesetest4you.com/category/jlpt-n5/jlpt-n5-listening-test/'
    : `https://japanesetest4you.com/category/jlpt-n5/jlpt-n5-listening-test/page/${pageNum}/`;
  
  console.log(`Fetching index page: ${url}`);
  const html = curlFetch(url);
  if (!html) {
    console.error(`Failed to fetch index page ${pageNum}`);
    return [];
  }
  
  // Find all post links matching the listening test structure
  // E.g. href="https://japanesetest4you.com/japanese-language-proficiency-test-jlpt-n5-listening-exercise-1/"
  const regex = /href="(https:\/\/japanesetest4you.com\/[a-zA-Z0-9-]*listening-exercise-[0-9]+\/)"/g;
  const links = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.add(match[1]);
  }
  return Array.from(links);
}

function scrapeExercisePage(url) {
  console.log(`Fetching exercise page: ${url}`);
  const html = curlFetch(url);
  if (!html) {
    console.error(`Failed to fetch ${url}`);
    return null;
  }
  
  // Find all mp3 urls
  const mp3Regex = /src="(https:\/\/japanesetest4you.com\/choukai\/[^\s]*?\.mp3)"/gi;
  const mp3s = [];
  let match;
  while ((match = mp3Regex.exec(html)) !== null) {
    mp3s.push(match[1]);
  }
  
  // Parse exercise number from url
  const numMatch = url.match(/listening-exercise-([0-9]+)/);
  const exerciseNum = numMatch ? parseInt(numMatch[1], 10) : null;

  // Try to parse the answers
  // Question 1: 2<br>Question 2: 1...
  const answerRegex = /Question\s*([0-9]+)\s*:\s*([1-4])/gi;
  const answers = {};
  while ((match = answerRegex.exec(html)) !== null) {
    answers[match[1]] = parseInt(match[2], 10);
  }
  
  return {
    url,
    exerciseNum,
    mp3s,
    answers
  };
}

async function main() {
  console.log("=== Nihongo Pro Audio Scraper (Curl Bypass Mode) ===");
  
  // 1. Gather all exercise links across pages 1 to 3
  const exerciseUrls = [];
  for (let page = 1; page <= 3; page++) {
    const urls = scrapeIndexPage(page);
    exerciseUrls.push(...urls);
    await sleep(1500); // Respectful delay
  }
  
  const uniqueUrls = Array.from(new Set(exerciseUrls));
  console.log(`Found ${uniqueUrls.length} unique exercise pages.`);
  
  // 2. Scrape each exercise page
  const scrapedExercises = [];
  for (const url of uniqueUrls) {
    const data = scrapeExercisePage(url);
    if (data && data.mp3s.length > 0) {
      scrapedExercises.push(data);
    }
    await sleep(1500); // Respectful delay
  }
  
  console.log(`Successfully scraped ${scrapedExercises.length} exercise pages containing audio.`);
  
  // Write index mapping file
  const mappingPath = path.join(__dirname, '../public/audio/n5/mapping.json');
  fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
  fs.writeFileSync(mappingPath, JSON.stringify(scrapedExercises, null, 2));
  console.log(`Saved mapping.json to ${mappingPath}`);
  
  // 3. Download MP3 files
  console.log("Downloading audio files...");
  for (const ex of scrapedExercises) {
    for (let i = 0; i < ex.mp3s.length; i++) {
      const mp3Url = ex.mp3s[i];
      // File name format: n5_ex<exerciseNum>_q<index+1>.mp3
      const filename = `n5_ex${ex.exerciseNum}_q${i + 1}.mp3`;
      const dest = path.join(__dirname, '../public/audio/n5', filename);
      
      if (fs.existsSync(dest)) {
        console.log(`Skipping already downloaded: ${filename}`);
      } else {
        curlDownload(mp3Url, dest);
        await sleep(1000); // Throttled download
      }
    }
  }
  console.log("All audio files downloaded!");
}

main();
