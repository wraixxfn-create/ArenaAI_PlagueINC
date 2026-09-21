import { app } from './ui/app.js';
import { menuScreen, scenariosScreen, creditsScreen, achievementsScreen, tutorialScreen, savesScreen } from './ui/screens/menu.js';
import { setupScreen } from './ui/screens/setup.js';
import { settingsScreen } from './ui/screens/settings.js';
import { statsScreen } from './ui/screens/stats.js';
import { gameScreen } from './ui/screens/game.js';
import { hideTip } from './ui/util.js';

app.register('menu', menuScreen);
app.register('scenarios', scenariosScreen);
app.register('setup', setupScreen);
app.register('settings', settingsScreen);
app.register('stats', statsScreen);
app.register('achievements', achievementsScreen);
app.register('tutorial', tutorialScreen);
app.register('credits', creditsScreen);
app.register('saves', savesScreen);
app.register('game', gameScreen);

// Unlock audio on the first gesture (browser autoplay policy).
const unlock = () => { app.audio.ensure(); app.audio.resume(); window.removeEventListener('pointerdown', unlock); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('scroll', hideTip, true);

document.getElementById('boot')?.remove();
app.go('menu');
app.startLoop();

// expose for debugging / automated tests
window.VZ = app;
