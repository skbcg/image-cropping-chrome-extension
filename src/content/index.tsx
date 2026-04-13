import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { App, HOST_ID } from './App';
import overlayCss from './overlay.css?raw';
import editorCss from '../editor/CropEditor.css?raw';

const ROOT_ID = `${HOST_ID}-root`;

function init() {
  if (document.getElementById(ROOT_ID)) return;

  const host = document.createElement('div');
  host.id = ROOT_ID;
  host.style.setProperty('all', 'initial');
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${overlayCss}\n${editorCss}`;
  shadow.appendChild(style);

  const reactMount = document.createElement('div');
  shadow.appendChild(reactMount);

  const root = createRoot(reactMount);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

init();
