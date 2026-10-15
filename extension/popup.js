const tokenInput = document.querySelector('#token');
const portInput = document.querySelector('#port');
portInput.addEventListener('input', () => { document.querySelector('#portLabel').textContent = portInput.value; });
const status = document.querySelector('#status');
async function refresh() {
  const [{ enabled, collectorPort, lastCapture, lastError }, { token }] = await Promise.all([
    chrome.storage.local.get({ enabled: false, collectorPort: 4319, lastCapture: '', lastError: '' }),
    chrome.storage.session.get('token'),
  ]);
  portInput.value = String(collectorPort);
  document.querySelector('#portLabel').textContent = String(collectorPort);
  const paired = Boolean(token && token.length >= 12);
  status.textContent = (enabled && paired ? '관측 활성화' : '관측 꺼짐 / 연결 대기') +
    (lastCapture ? '\n마지막 저장: ' + new Date(lastCapture).toLocaleString() : '') +
    (lastError ? '\n' + lastError : '');
}
document.querySelector('#enable').addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  const collectorPort = Number(portInput.value);
  if (!Number.isInteger(collectorPort) || collectorPort < 1024 || collectorPort > 65535) {
    status.textContent = '포트는 1024~65535 사이 정수여야 해.';
    return;
  }
  if (token.length < 12) {
    status.textContent = '수집기에서 사용하는 실제 Bearer 토큰을 입력해 줘.';
    return;
  }
  await chrome.storage.session.set({ token });
  await chrome.storage.local.set({ enabled: true, collectorPort, lastError: '' });
  tokenInput.value = '';
  await refresh();
});
document.querySelector('#disable').addEventListener('click', async () => {
  await chrome.storage.local.set({ enabled: false, lastError: '' });
  await chrome.storage.session.remove('token');
  await refresh();
});
refresh().catch(() => { status.textContent = '연결 상태를 읽을 수 없어요.'; });
