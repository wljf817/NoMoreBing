import { CUSTOM_ID, PRESETS, isValidTemplate } from '../engines.js';
import { getEngineSetting, setEngineSetting } from '../settings.js';

const t = (key) => chrome.i18n.getMessage(key);

const form = document.getElementById('form');
const engines = document.getElementById('engines');
const custom = document.getElementById('custom');
const customSearch = document.getElementById('custom-search');
const customSuggest = document.getElementById('custom-suggest');
const status = document.getElementById('status');

function localize() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.title = t('optionsTitle');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}

function renderEngines() {
  const choices = [
    ...PRESETS.map((p) => ({ id: p.id, name: t(`engine_${p.id}`) || p.name })),
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

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function load() {
  const setting = await getEngineSetting();
  const radio = engines.querySelector(`input[value="${CSS.escape(setting.id)}"]`);
  if (radio) radio.checked = true;
  if (setting.id === CUSTOM_ID) {
    customSearch.value = setting.searchUrl ?? '';
    customSuggest.value = setting.suggestUrl ?? '';
  }
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
  const suggestUrl = customSuggest.value.trim();
  if (!isValidTemplate(searchUrl) || (suggestUrl && !isValidTemplate(suggestUrl))) {
    showStatus(t('errorTemplate'), true);
    return;
  }
  await setEngineSetting({ id: CUSTOM_ID, searchUrl, suggestUrl: suggestUrl || null });
  showStatus(t('saved'));
});

localize();
renderEngines();
load();
