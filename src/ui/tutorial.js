import { el } from './util.js';
import { t, getLang } from '../i18n/index.js';

/** Local, captioned MP4. No network service, narration or autoplay audio. */
export function briefingPlayer() {
  const node = el('section', 'briefing-player');
  const video = el('video', 'briefing-video');
  video.controls = true;
  video.playsInline = true;
  video.muted = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', t('intro.title'));
  video.poster = `/assets/tutorial/poster-${getLang()}.jpg`;
  video.src = `/assets/tutorial/briefing-${getLang()}.mp4`;
  const error = el('p', 'muted', t('intro.error'));
  error.hidden = true;
  video.addEventListener('error', () => { error.hidden = false; });
  const transcript = el('details', 'briefing-transcript');
  transcript.appendChild(el('summary', '', t('intro.transcript')));
  for (let i=1;i<=5;i++) {
    transcript.append(el('h3', '', t(`intro.${i}.title`)), el('p', '', t(`intro.${i}.body`)));
  }
  node.append(video, error, transcript);
  return {
    node, video,
    play: () => video.play()?.catch(() => { /* controls remain available */ }),
    destroy: () => {
      // Unload decoder and download when navigating away, not just the DOM node.
      video.pause(); video.removeAttribute('src'); video.load();
    },
  };
}

export function introOverlay(app, onClose) {
  const node = el('div', 'overlay briefing-overlay');
  node.setAttribute('role','dialog'); node.setAttribute('aria-modal','true');
  node.setAttribute('aria-labelledby','briefing-title');
  const panel = el('div', 'overlay-panel briefing-panel');
  const title = el('h2','',t('intro.title')); title.id='briefing-title';
  const player = briefingPlayer();
  const label = el('label','briefing-remember');
  const remember = el('input'); remember.type='checkbox';
  label.append(remember, document.createTextNode(t('intro.remember')));
  const row = el('div','row between');
  const skip = el('button','btn ghost',t('intro.skip'));
  const ready = el('button','btn primary',t('intro.begin'));
  const finish = () => {
    if (remember.checked) { app.settings.showIntro=false; app.saveSettings(); }
    onClose();
  };
  skip.onclick=ready.onclick=finish;
  row.append(skip,ready);
  panel.append(title, el('p','muted',t('intro.description')), player.node,label,row);
  node.appendChild(panel);
  const previous = document.activeElement;
  node.addEventListener('keydown', e => {
    if(e.key==='Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
    if(e.key==='Tab') {
      // DOM order, including the disclosure button.
      const targets=[...node.querySelectorAll('video, summary, input, button')];
      const first=targets[0],last=targets.at(-1);
      if(e.shiftKey && document.activeElement===first) { e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
    }
  });
  return {
    node,
    mounted: () => {
      skip.focus();
      if(app.settings.animations && !app.settings.reduceMotion) player.play();
    },
    destroy: () => { player.destroy(); previous?.focus?.(); },
  };
}
