import { inspectSeedListForTraps } from '../src/lib/discovery/trap-detector';
import { SEED_BLOGS } from '../src/lib/discovery/seed-data';

async function main() {
  console.log('🔍 Small Web Reader: Seed Trap Detector (Bonus Quest Bounty Tool)');
  console.log('------------------------------------------------------------------');

  // If command line arguments provided, use them; otherwise use default seed list
  const args = process.argv.slice(2);
  let urlsToInspect: string[] = [];

  if (args.length > 0) {
    console.log(`Scanning ${args.length} URLs passed via command line...`);
    urlsToInspect = args;
  } else {
    console.log(`No URLs passed; scanning default seed list (${SEED_BLOGS.length} blogs)...`);
    urlsToInspect = SEED_BLOGS.map((b) => b.originalUrl);
  }

  const report = await inspectSeedListForTraps(urlsToInspect);

  console.log('\n=================== SCAN REPORT ===================');
  console.log(`Total URLs Scanned: ${report.totalUrlsScanned}`);
  console.log(`Traps Detected:     ${report.trapsFound ? '⚠️ YES' : '✅ NO'}`);
  console.log(`Summary:            ${report.summary}\n`);

  if (report.trapsFound) {
    console.log('🚨 FINDINGS TO REPORT TO HACKATHON MENTORS:');
    report.findings.forEach((finding, idx) => {
      console.log(`\n[Trap #${idx + 1}] Type: ${finding.type} | Severity: ${finding.severity}`);
      console.log(`Description: ${finding.description}`);
      console.log(`Bounty Message:\n>>> "${finding.bountyReportMessage}" <<<`);
    });
  } else {
    console.log('🎉 No traps found in this list. Clean!');
  }
}

main().catch((err) => {
  console.error('Fatal error running Trap Detector:', err);
  process.exit(1);
});

