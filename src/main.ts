import { AppState } from './app/AppState';
import { buildLayout } from './ui/layout/Layout';
import { SceneManager } from './engine/SceneManager';

const root = document.getElementById('app-root')!;
const state = new AppState();

const { viewportEl } = buildLayout(root, state);
try {
  new SceneManager(viewportEl, state);
} catch (err) {
  console.error(err);
  const note = document.createElement('div');
  note.className = 'empty-state';
  note.innerHTML =
    '<div class="empty-title">WebGL is required</div><div class="empty-body">Open this workspace in a current desktop Chrome or Edge browser with hardware acceleration enabled.</div>';
  viewportEl.appendChild(note);
}
