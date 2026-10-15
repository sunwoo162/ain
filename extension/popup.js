const tokenInput = document.querySelector('#token');
const status = document.querySelector('#status');
async function refresh() {
  const [{ enabled, lastCapture, lastError }, { token }] = await Promise.all([
    chrome.storage.local.get({ enabled: false, lastCapture: '', lastError: '' }),
    chrome.storage.session.get('token'),
  ]);
  const paired = Boolean(token && token.length >= 12);
  status.textContent = (enabled && paired ? '관측 활성화' : '관측 꺼짐 / 연결 대기') +
    (lastCapture ? '\n마지막 저장: ' + new Date(lastCapture).toLocaleString() : '') +
    (lastError ? '\n' + lastError : '');
}
document.querySelector('#enable').addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (token.length < 12) {
    status.textContent = '수집기에서 사용하는 실제 Bearer 토큰을 입력해 줘.';
    return;
  }
  await chrome.storage.session.set({ token });
  await chrome.storage.local.set({ enabled: true, lastError: '' });
  tokenInput.value = '';
  await refresh();
});
document.querySelector('#disable').addEventListener('click', async () => {
  await chrome.storage.local.set({ enabled: false, lastError: '' });
  await chrome.storage.session.remove('token');
  await refresh();
});
refresh().catch(() => { status.textContent = '연결 상태를 읽을 수 없어요.'; });
