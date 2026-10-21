const photos = new Map([...document.querySelectorAll('[data-photo]')].map((node) => [node.dataset.photo, node]));
const zones = document.querySelectorAll('[data-person]');
const heroInner = document.querySelector('.hero__inner');

function showPhoto(person) {
  for (const [name, photo] of photos) photo.classList.toggle('is-visible', name === person);
}

function positionPhoto(zone, event, firstPosition = false) {
  const photo = photos.get(zone.dataset.person);
  const bounds = heroInner.getBoundingClientRect();
  const zoneBounds = zone.getBoundingClientRect();
  const halfWidth = photo.offsetWidth / 2;
  const halfHeight = photo.offsetHeight / 2;
  const x = Math.max(zoneBounds.left + halfWidth, Math.min(zoneBounds.right - halfWidth, event.clientX)) - bounds.left;
  const y = Math.max(zoneBounds.top + halfHeight, Math.min(zoneBounds.bottom - halfHeight, event.clientY)) - bounds.top;
  if (firstPosition) photo.style.transition = 'none';
  photo.style.left = `${x}px`;
  photo.style.top = `${y}px`;
  if (firstPosition) {
    photo.getBoundingClientRect();
    photo.style.transition = '';
  }
}

for (const zone of zones) {
  zone.addEventListener('pointerenter', (event) => {
    positionPhoto(zone, event, true);
    showPhoto(zone.dataset.person);
  });
  zone.addEventListener('pointermove', (event) => positionPhoto(zone, event));
  zone.addEventListener('pointerleave', () => showPhoto(null));
}
window.addEventListener('blur', () => showPhoto(null));

const stageSection = document.querySelector('.stages');
const stageCards = document.querySelector('#stage-cards');
const cards = [...stageCards.querySelectorAll('.stage-card')];
const cardAngles = [5, -5, -10, 15, 5];
const desktopMotion = window.matchMedia('(min-width: 1140px) and (prefers-reduced-motion: no-preference)');
let scrollTicking = false;

function updateStages() {
  scrollTicking = false;
  if (!desktopMotion.matches) {
    for (const card of cards) card.style.transform = '';
    return;
  }
  const top = stageSection.getBoundingClientRect().top + window.scrollY;
  const distance = stageSection.offsetHeight - window.innerHeight;
  const hold = Math.min(100, distance * 0.2);
  const rawProgress = Math.max(0, Math.min(1, (window.scrollY - top - hold) / (distance - hold)));
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
  const originX = (stageCards.clientWidth - cards[0].offsetWidth) / 2;
  const originY = 12;
  for (const [index, card] of cards.entries()) {
    const remaining = 1 - progress;
    const x = originX - card.offsetLeft;
    const y = originY - card.offsetTop;
    card.style.transform = `translate(${(x * remaining).toFixed(2)}px, ${(y * remaining).toFixed(2)}px) rotate(${(cardAngles[index] * remaining).toFixed(2)}deg)`;
  }
}

function scheduleStages() {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(updateStages);
}

window.addEventListener('scroll', scheduleStages, { passive: true });
window.addEventListener('resize', scheduleStages);
desktopMotion.addEventListener('change', scheduleStages);
updateStages();

const form = document.querySelector('#application-form');
const nameInput = document.querySelector('#name');
const contactInput = document.querySelector('#contact');
const resumeInput = document.querySelector('#resume-url');
const fileInput = document.querySelector('#resume-file');
const removeFile = document.querySelector('#remove-file');
const coverInput = document.querySelector('#cover-letter');
const solutionInput = document.querySelector('#solution');
const consentInput = document.querySelector('#consent');
const submitButton = document.querySelector('#submit-button');
const status = document.querySelector('#form-status');
const MAX_FILE_BYTES = 10 * 1024 * 1024;
let sending = false;

function setStatus(message, state = '') {
  status.textContent = message;
  if (state) status.dataset.state = state;
  else delete status.dataset.state;
}

function hasValidValues() {
  return Boolean(
    nameInput.value.trim() &&
    contactInput.value.trim() &&
    (resumeInput.value.trim() || fileInput.files?.length) &&
    coverInput.value.trim() &&
    solutionInput.value.trim() &&
    consentInput.checked
  );
}

function syncForm() {
  const file = fileInput.files?.[0];
  resumeInput.disabled = Boolean(file);
  if (file) resumeInput.value = file.name;
  removeFile.hidden = !file;
  submitButton.disabled = sending || !hasValidValues();
}

for (const input of [nameInput, contactInput, resumeInput, coverInput, solutionInput]) {
  input.addEventListener('input', syncForm);
}
consentInput.addEventListener('change', syncForm);
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file && file.size > MAX_FILE_BYTES) {
    fileInput.value = '';
    setStatus('Файл резюме должен быть не больше 10 МБ.', 'error');
  } else {
    setStatus('');
  }
  syncForm();
});
removeFile.addEventListener('click', () => {
  fileInput.value = '';
  resumeInput.value = '';
  setStatus('');
  syncForm();
  resumeInput.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending || !hasValidValues()) return;
  sending = true;
  syncForm();
  setStatus('Отправляем отклик…');

  try {
    const data = new FormData(form);
    data.set('name', nameInput.value.trim());
    data.set('contact', contactInput.value.trim());
    data.set('cover_letter', coverInput.value.trim());
    data.set('solution', solutionInput.value.trim());
    data.set('resume_url', fileInput.files?.length ? '' : resumeInput.value.trim());
    const response = await fetch(form.action, { method: 'POST', body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Не удалось отправить отклик. Попробуйте ещё раз.');
    const local = result.storage === 'local';
    setStatus(local ? 'Отклик сохранён локально для проверки. После подключения Google Таблицы ответы будут записываться туда.' : 'Отклик отправлен. Спасибо за участие!', 'success');
    form.reset();
    resumeInput.disabled = false;
    syncForm();
  } catch (error) {
    setStatus(error.message || 'Не удалось отправить отклик. Попробуйте ещё раз.', 'error');
  } finally {
    sending = false;
    syncForm();
  }
});

syncForm();

const shortWordPattern = /(?<!\p{L})(?:перед|через|между|после|около|возле|вокруг|кроме|ради|вместо|из-за|из-под|при|для|без|над|под|про|от|до|за|по|на|из|во|ко|со|обо|об|не|ни|но|же|ли|или|что|как|в|к|с|у|о|и|а)[ \t]+(?=\S)/giu;
const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
  acceptNode(node) {
    if (!node.textContent.trim() || node.parentElement.closest('script,style,textarea,option,code')) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  },
});
while (textWalker.nextNode()) {
  const node = textWalker.currentNode;
  node.textContent = node.textContent.replace(shortWordPattern, (match) => `${match.trimEnd()}\u00a0`);
}
