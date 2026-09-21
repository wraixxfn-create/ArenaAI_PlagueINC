// Real-browser smoke/regression and a repeatable presentation benchmark.
// npm start, then npm run test:browser (npx playwright install chromium once).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.GAME_URL || 'http://localhost:3000';
try {
  await page.goto(base);
  await page.evaluate(()=>window.VZ.newGame({seed:123,pathogenId:'strand',startCountry:'ind'}));
  await page.locator('.briefing-video').waitFor();
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  assert.equal(await page.locator('video').evaluate(v=>Math.round(v.duration)),30);
  await page.locator('video').evaluate(v=>{v.pause();v.currentTime=18;});
  await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-18)<.5 && !document.querySelector('video').seeking);
  assert.equal(await page.evaluate(()=>window.VZ.sim.day),0,'tutorial pauses simulation');
  await page.locator('video').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.VZ.speed),0,'tutorial blocks game shortcuts');
  await page.locator('.briefing-remember input').check();
  await page.getByRole('button',{name:'Skip briefing',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.VZ.settings.showIntro),false);
  assert.equal(await page.locator('video').count(),0);
  await page.evaluate(()=>window.VZ.view.frame(33));
  assert.ok(!await page.locator('.hud-top').innerText().then(t=>t.includes('NaN')));

  // Revisit the game repeatedly: old key handlers must not survive navigation.
  await page.evaluate(()=>{for(let i=0;i<8;i++){VZ.go('settings');VZ.go('game');}VZ.setSpeed(0);});
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>VZ.speed),1,'one key press toggles once after navigation');
  await page.keyboard.press('Space');
  await page.keyboard.press('e');
  assert.equal(await page.locator('.overlay').count(),1,'one evolution overlay');
  await page.keyboard.press('4');
  assert.equal(await page.evaluate(()=>VZ.speed),0,'overlay cannot accidentally resume simulation');
  await page.keyboard.press('Escape');

  const mapResult=await page.evaluate(async()=>{
    const {WorldMap}=await import('/src/ui/map.js');
    const canvas=document.createElement('canvas');canvas.style='width:1000px;height:600px';document.body.append(canvas);
    const map=new WorldMap(canvas,{settings:{...VZ.settings,animations:false}});map.setSim(VZ.sim);
    map.draw(33); const first=map.renderCount;
    for(let i=0;i<120;i++)map.draw(33);
    const idle=map.renderCount-first;
    const origin=map.toScreen(...map.centroids.ind),r=canvas.getBoundingClientRect();
    const picked=map.pick({clientX:r.left+origin[0],clientY:r.top+origin[1]})?.id;
    VZ.sim.byId.ind.infected=VZ.sim.byId.ind.pop/2;VZ.sim.updateGlobals();map.draw(33);const tick=map.renderCount-first;
    map.setMode('healthcare');map.draw(33);const mode=map.renderCount-first;
    map.zoomAt(500,300,1.5);map.draw(33);const zoom=map.renderCount-first;
    map.destroy();canvas.remove();return {idle,picked,tick,mode,zoom};
  });
  assert.deepEqual(mapResult,{idle:0,picked:'ind',tick:1,mode:2,zoom:3});

  const media=await page.request.get(`${base}/assets/tutorial/briefing-en.mp4`,{headers:{Range:'bytes=0-127'}});
  assert.equal(media.status(),206);assert.equal((await media.body()).length,128);assert.match(media.headers()['content-type'],/video\/mp4/);
  const badRange=await page.request.get(`${base}/assets/tutorial/briefing-en.mp4`,{headers:{Range:'bytes=999999999-'}});
  assert.equal(badRange.status(),416);

  const benchmark=await page.evaluate(async()=>{
    const app=VZ;app.setSpeed(0);app.view.frame(33);
    const times=[];for(let i=0;i<120;i++){const t=performance.now();app.view.frame(16.67);times.push(performance.now()-t);}
    times.sort((a,b)=>a-b);
    for(let i=0;i<150;i++)app.sim.step();app.setSpeed(4);
    await new Promise(resolve=>setTimeout(resolve,5000));
    const startDay=app.sim.day;
    const live=[];const previous=app.view.frame;
    app.view.frame=dt=>{const t=performance.now();previous(dt);live.push(performance.now()-t);};
    await new Promise(resolve=>setTimeout(resolve,4000));
    app.setSpeed(0);app.view.frame=previous;live.sort((a,b)=>a-b);
    return {startDay,endDay:app.sim.day,finished:app.sim.finished,idleMeanMs:times.reduce((a,b)=>a+b)/times.length,idleP95Ms:times[114],runningFrames:live.length,runningP95Ms:live[Math.floor(live.length*.95)]};
  });
  console.log('Browser benchmark (CPU submission, not GPU/FPS guarantee):',benchmark);
  assert.ok(benchmark.endDay>benchmark.startDay && !benchmark.finished,'benchmark measures an active simulation');
  assert.ok(benchmark.runningFrames>0 && benchmark.runningP95Ms<100,'active presentation stays within a 100 ms CPU regression budget');

  // Italian video + reduced motion: no automatic playback, transcript remains.
  await page.evaluate(()=>{VZ.settings.showIntro=true;VZ.settings.reduceMotion=true;VZ.setLanguage('it');VZ.newGame({seed:4,pathogenId:'strand',startCountry:'jpn'});});
  assert.match(await page.locator('video').getAttribute('src'),/briefing-it/);
  assert.equal(await page.locator('video').evaluate(v=>v.paused),true);
  await page.locator('video').evaluate(v=>v.dispatchEvent(new Event('error')));
  assert.equal(await page.locator('.briefing-player > p').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.briefing-overlay').count(),0);
  // Narrow viewport keeps the briefing dismissible.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>VZ.view.showIntro());
  await page.getByRole('button',{name:'Salta il briefing',exact:true}).click();
  assert.equal(await page.locator('.briefing-overlay').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Browser regressions passed: playback/seek, localization, skip, motion preference, map caching/picking, navigation, overlays, 8x, byte ranges.');
} finally { await browser.close(); }
