/* Boot: ambient FX, rooms, UI modules. */

import { initParticles } from './fx.js';
import { initRooms } from './rooms.js';
import { initCore } from './ui-core.js';
import { initLobby } from './ui-lobby.js';
import { initDuel } from './ui-duel.js';

initParticles();
initRooms();
initCore();
initLobby();
initDuel();
