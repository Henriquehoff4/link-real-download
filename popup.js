const button = document.getElementById('select');
const error = document.getElementById('error');

button.addEventListener('click', async () => {
  button.disabled = true;
  error.textContent = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({ type: 'arm', tabId: tab.id });
    if (!response?.ok) throw new Error();
    window.close();
  } catch {
    error.textContent = 'Não é possível usar a extensão nesta página.';
    button.disabled = false;
  }
});
