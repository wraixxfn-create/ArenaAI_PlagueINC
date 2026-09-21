import assert from 'node:assert/strict';
import { AudioEngine } from '../src/ui/audio.js';
const nodes=[];
const param=()=>({value:0,events:[],setValueAtTime(...v){this.events.push(v)},setTargetAtTime(...v){this.events.push(v)},linearRampToValueAtTime(...v){this.events.push(v)},exponentialRampToValueAtTime(...v){this.events.push(v)},cancelScheduledValues(){}});
const node=()=>({gain:param(),frequency:param(),connect(){},disconnect(){this.disconnected=true},start(){},stop(){this.stopped=true;this.onended?.()}});
class AudioContext {
  constructor(){this.currentTime=1;this.state='running';this.destination=node();}
  createGain(){return node();}
  createOscillator(){const n=node();nodes.push(n);return n;}
  createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
  suspend(){this.state='suspended';return Promise.resolve();}
  resume(){this.state='running';return Promise.resolve();}
}
global.window={AudioContext};
const settings={master:.8,music:.22,sfx:.7,musicEnabled:true};
const audio=new AudioEngine(settings);audio.startMusic();
assert.equal(nodes.length,4);assert.ok(audio.started);
const old=[...audio.voices];
audio.setTension(.6);const eventCount=old[0].g.gain.events.length;
for(let i=0;i<500;i++)audio.setTension(.6);
assert.equal(old[0].g.gain.events.length,eventCount,'unchanged tension does not schedule automation');
settings.music=0;audio.applyVolumes();assert.ok(!audio.started);
assert.ok(old.every(({o,g})=>o.stopped && o.disconnected && g.disconnected));
settings.music=.22;audio.applyVolumes();assert.ok(audio.started);assert.equal(nodes.length,8);
assert.ok(audio.voices.every(({o})=>!o.stopped),'old nodes cannot stop new music');
settings.sfx=0;audio.applyVolumes();assert.equal(audio.sfxGain.gain.events.at(-1)[0],0);
assert.equal(audio.reverb,audio.sfxGain,'no effect send bypasses SFX volume');
audio.setHidden(true);assert.equal(audio.ctx.state,'suspended');audio.setHidden(false);assert.equal(audio.ctx.state,'running');
settings.musicEnabled=false;audio.applyVolumes();assert.ok(!audio.started);
audio.stopMusic();settings.musicEnabled=true;audio.applyVolumes();assert.ok(!audio.started,'quitting does not restart music');
console.log('Audio lifecycle passed: voice budget, deduplicated automation, mute, restart, routing, background suspension.');
