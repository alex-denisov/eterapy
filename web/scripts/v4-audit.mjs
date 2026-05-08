import { chromium } from 'playwright';

const urls = [
  'https://eterapy.com/',
  'https://eterapy.com/how-it-works',
  'https://eterapy.com/pricing',
  'https://eterapy.com/library',
  'https://eterapy.com/products/primary-answer',
  'https://eterapy.com/products/perspectives',
  'https://eterapy.com/products/seven-days',
  'https://eterapy.com/all-modalities',
  'https://eterapy.com/practitioners'
];

async function run() {
  const browser = await chromium.launch();
  
  for (const url of urls) {
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log(`\n--- Analyzing: ${url} ---`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      
      const analysis = await page.evaluate(() => {
        const violations = [];
        const elements = document.querySelectorAll('*');
        
        let hasV5 = false;
        let v5Classes = [];
        
        elements.forEach(el => {
          const className = el.className;
          if (typeof className === 'string') {
            if (className.includes('brand-') || className.includes('navy') || className.includes('surface-') || className.includes('halo-stage')) {
              hasV5 = true;
              const matches = className.match(/\b(brand-[a-z-]+|navy[^ ]*|surface-[a-z-]+|halo-stage)\b/g);
              if (matches) v5Classes.push(...matches);
            }
          }
          
          // Check for proper h1
          if (el.tagName === 'H1') {
            const style = window.getComputedStyle(el);
            // v4 requires font-heading (serif) and bordeaux color
            if (!className.includes('soft-h1') && !className.includes('h-display')) {
              violations.push(`H1 missing v4 typography classes (soft-h1). Found classes: ${className}`);
            }
          }
        });
        
        const uniqueV5 = [...new Set(v5Classes)];
        if (uniqueV5.length > 0) {
          violations.push(`v5 design system tokens found (should be strictly v4 Soft Clarity): ${uniqueV5.join(', ')}`);
        }
        
        return violations;
      });
      
      if (analysis.length > 0) {
        console.log('⚠️ РАСХОЖДЕНИЕ / ❌ КРИТИЧЕСКОЕ ОТЛИЧИЕ');
        analysis.forEach(v => console.log(' - ' + v));
      } else {
        console.log('✅ СОВПАДАЕТ');
      }
    } catch (e) {
      console.log('Error analyzing page:', e.message);
    }
    await context.close();
  }
  
  await browser.close();
}

run().catch(console.error);
