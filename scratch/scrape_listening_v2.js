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

  // Find all image urls
  const imgRegex = /src="(https:\/\/japanesetest4you.com\/image\/[^\s]*?\.(?:jpg|jpeg|png|gif))"/gi;
  const images = [];
  while ((match = imgRegex.exec(html)) !== null) {
    // Exclude generic site layout images if any, but choukai images are usually under /image/
    images.push(match[1]);
  }
  
  // Parse exercise number from url
  const numMatch = url.match(/listening-exercise-([0-9]+)/);
  const exerciseNum = numMatch ? parseInt(numMatch[1], 10) : null;

  // Try to parse the answers
  const answerRegex = /Question\s*([0-9]+)\s*:\s*([1-4])/gi;
  const answers = {};
  while ((match = answerRegex.exec(html)) !== null) {
    answers[match[1]] = parseInt(match[2], 10);
  }
  
  return {
    url,
    exerciseNum,
    mp3s,
    images,
    answers
  };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Nihongo Pro Audio Scraper V2 (Scraping Images & Answers) ===");
  
  // Gather all exercise links across pages 1 to 3
  const exerciseUrls = [];
  for (let page = 1; page <= 3; page++) {
    const urls = scrapeIndexPage(page);
    exerciseUrls.push(...urls);
    await sleep(1000);
  }
  
  const uniqueUrls = Array.from(new Set(exerciseUrls));
  console.log(`Found ${uniqueUrls.length} unique exercise pages.`);
  
  const scrapedExercises = [];
  for (const url of uniqueUrls) {
    const data = scrapeExercisePage(url);
    if (data && data.mp3s.length > 0) {
      scrapedExercises.push(data);
    }
    await sleep(1000);
  }
  
  console.log(`Successfully scraped ${scrapedExercises.length} exercise pages containing audio.`);
  
  // Save mapping_v2.json
  const mappingPath = path.join(__dirname, '../public/audio/n5/mapping_v2.json');
  fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
  fs.writeFileSync(mappingPath, JSON.stringify(scrapedExercises, null, 2));
  console.log(`Saved mapping_v2.json to ${mappingPath}`);
}

main();
