import { CUSTOM_ID, PRESETS, isValidTemplate, presetForSuggestUrl } from '../engines.js';
import { getEngineSetting, manifestSuggestUrl, setEngineSetting } from '../settings.js';

const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
const engineName = (preset) => t(`engine_${preset.id}`) || preset.name;

const form = document.getElementById('form');
const engines = document.getElementById('engines');
const custom = document.getElementById('custom');
const customSearch = document.getElementById('custom-search');
const status = document.getElementById('status');
const suggestSource = document.getElementById('suggest-source');

function localize() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.title = t('optionsTitle');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}

function renderEngines() {
  const choices = [
    ...PRESETS.map((p) => ({ id: p.id, name: engineName(p) })),
    { id: CUSTOM_ID, name: t('engineCustom') },
  ];
  for (const { id, name } of choices) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'engine';
    radio.value = id;
    label.append(radio, name);
    engines.append(label);
  }
}

// Suggestions are fixed by the package the user installed, not by the engine
// picked here, so say where they come from.
function renderSuggestSource() {
  const preset = presetForSuggestUrl(manifestSuggestUrl());
  suggestSource.textContent = preset ? t('suggestSource', [engineName(preset)]) : t('suggestOff');
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function load() {
  const setting = await getEngineSetting();
  const radio = engines.querySelector(`input[value="${CSS.escape(setting.id)}"]`);
  if (radio) radio.checked = true;
  if (setting.id === CUSTOM_ID) customSearch.value = setting.searchUrl ?? '';
  custom.hidden = setting.id !== CUSTOM_ID;
}

// Presets save as soon as they are picked; a custom engine saves on submit
// after validation.
engines.addEventListener('change', async (event) => {
  const id = event.target.value;
  custom.hidden = id !== CUSTOM_ID;
  showStatus('');
  if (id !== CUSTOM_ID) {
    await setEngineSetting({ id });
    showStatus(t('saved'));
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const searchUrl = customSearch.value.trim();
  if (!isValidTemplate(searchUrl)) {
    showStatus(t('errorTemplate'), true);
    return;
  }
  await setEngineSetting({ id: CUSTOM_ID, searchUrl });
  showStatus(t('saved'));
});

localize();
renderEngines();
renderSuggestSource();
load();
