// Rebuild original tutorial movies from real game screens. Run the game first.
// Needs Playwright Chromium and ffmpeg (or CHROMIUM_EXECUTABLE_PATH / FFMPEG).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import strings from '../src/i18n/strings.intro.js';
const work = '.arena/tutorial';
mkdirSync(work,{recursive:true}); mkdirSync('assets/tutorial',{recursive:true});
const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined, args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const compositor = await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const run = args => { const r=spawnSync(ffmpeg,['-y','-loglevel','error',...args],{encoding:'utf8'}); if(r.status!==0) throw new Error(r.stderr); };
try {
  for (const lang of ['en','it']) {
    await page.goto(process.env.GAME_URL || 'http://localhost:3000');
    await page.evaluate(lang=>{
      const app=window.VZ; app.settings.showIntro=false;app.settings.animations=false;app.settings.musicEnabled=false;
      app.setLanguage(lang);app.newGame({seed:442,pathogenId:'strand',startCountry:'ind'});
    },lang);
    const screenshots=[];
    for(let i=1;i<=5;i++) {
      if(i===2) await page.evaluate(()=>{const app=window.VZ;for(let i=0;i<230;i++)app.sim.step();app.view.frame(33);});
      if(i===3) await page.keyboard.press('e');
      if(i===4) { await page.keyboard.press('Escape'); await page.locator('.mode-btn').nth(5).click(); }
      if(i===5) { await page.locator('.mode-btn').first().click(); await page.keyboard.press('a'); }
      // Let the requestAnimationFrame loop update the presentation.
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      screenshots.push((await page.screenshot()).toString('base64'));
    }
    const chapters=[];
    for(let i=1;i<=5;i++) {
      // The clock chapter enlarges the actual top and bottom HUD strips so
      // captions never cover the controls being introduced.
      const clockDetail = i === 2 ? `<div style="position:absolute;inset:85px 0 150px;background:rgba(6,17,27,.86)"></div>${['top','bottom'].map((edge,j)=>`<div style="position:absolute;left:40px;top:${200+j*155}px;width:1200px;height:85px;border:2px solid #4fc3f7;border-radius:10px;background:#081420 url(data:image/png;base64,${screenshots[i-1]}) ${edge} center / 1200px 675px no-repeat"></div>`).join('')}` : '';
      await compositor.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#081420;color:#e7f3f9;font-family:Arial,sans-serif}img{position:absolute;inset:0;width:1280px;height:720px}header,footer{position:absolute;left:0;right:0;padding:24px 42px;background:rgba(6,17,27,.97)}header{top:0;border-bottom:2px solid #4fc3f7;display:flex;justify-content:space-between;align-items:center}footer{bottom:0;height:150px;border-top:1px solid #3a586c}h1{font-size:30px;margin:0}p{font-size:24px;line-height:1.45;margin:0;max-width:1160px}.brand{letter-spacing:3px;color:#4fc3f7;font-size:16px}.progress{height:3px;background:#4fc3f7;position:absolute;bottom:0;left:0;width:${i*20}%}</style><img src="data:image/png;base64,${screenshots[i-1]}">${clockDetail}<header><h1>${strings[`intro.${i}.title`][lang]}</h1><span class="brand">VECTOR ZERO</span></header><footer><p>${strings[`intro.${i}.body`][lang]}</p><div class="progress"></div></footer></html>`);
      await compositor.locator('img').evaluate(img=>img.decode());
      const image=`${work}/${lang}-${i}.png`;
      await compositor.screenshot({path:image});
      if(i===1) await compositor.screenshot({path:`assets/tutorial/poster-${lang}.jpg`,quality:85,type:'jpeg'});
      const clip=`${work}/${lang}-${i}.mp4`;
      // Six-second held chapter, with a subtle camera move. Captions are burned
      // in so mobile browsers, fullscreen playback and downloads retain them.
      run(['-i',image,'-vf',"zoompan=z='min(zoom+0.00008,1.006)':d=72:s=1280x720:fps=12",'-frames:v','72','-an','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p',clip]);
      chapters.push(`file '${lang}-${i}.mp4'`);
    }
    writeFileSync(`${work}/${lang}.txt`,chapters.join('\n'));
    run(['-f','concat','-safe','0','-i',`${work}/${lang}.txt`,'-c','copy','-movflags','+faststart',`assets/tutorial/briefing-${lang}.mp4`]);
  }
} finally { await browser.close(); }
console.log('Created 30-second English and Italian tutorial movies.');
