import { AppState } from './app/AppState';
import { buildLayout } from './ui/layout/Layout';
import { SceneManager } from './engine/SceneManager';

const root = document.getElementById('app-root')!;
const state = new AppState();

const { viewportEl } = buildLayout(root, state);
new SceneManager(viewportEl, state);
