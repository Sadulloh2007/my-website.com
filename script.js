// Инициализация темы
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
}

// Переключатель темы
document.getElementById('theme-toggle').addEventListener('click', () => {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

// Конфигурация API (прямые URL)
const BINANCE_API = 'https://api.binance.com/api/v3';
const CBR_API     = 'https://www.cbr-xml-daily.ru/daily_json.js';
const NBT_API     = 'https://nbt.tj/api/exchange';

// Проверяем, что не запущено по file://
if (window.location.protocol === 'file:') {
  console.warn('Запустите проект через HTTP (например: python3 -m http.server), иначе CORS-блокировка для NBT API.');
}

// Получение курсов
async function fetchRates() {
  try {
    // Binance и ЦБ РФ
    const [binRes, cbrRes] = await Promise.all([
      fetch(`${BINANCE_API}/ticker/bookTicker?symbol=USDTRUB`),
      fetch(CBR_API)
    ]);

    if (!binRes.ok) throw new Error(`Binance: HTTP ${binRes.status}`);
    if (!cbrRes.ok) throw new Error(`CBR: HTTP ${cbrRes.status}`);

    console.log('Binance raw:', await binRes.clone().text());
    const { bidPrice: usdtBuy, askPrice: usdtSell } = await binRes.json();

    const cbrText = await cbrRes.text();
    console.log('CBR raw:', cbrText.slice(0,200));
    const cbr = JSON.parse(cbrText);

    // Прямая попытка получить NBT (может заблокировать CORS)
    let smnToUsd;
    try {
      const nbtRes = await fetch(NBT_API);
      if (!nbtRes.ok) throw new Error(`NBT: HTTP ${nbtRes.status}`);
      const nbtJson = await nbtRes.json();
      const nbtList = Array.isArray(nbtJson) ? nbtJson : (nbtJson.rates || []);
      smnToUsd = nbtList.find(c => c.code === 'USD')?.buy;
      if (!smnToUsd) throw new Error('NBT: USD не найден');
      console.log('NBT USD buy:', smnToUsd);
    } catch (e) {
      console.warn('Не удалось получить курс SMN из NBT API, используем запасной (10.5):', e);
      smnToUsd = 10.5;  // запасное значение
    }

    // Расчёт курсов
    const usdToRub = cbr.Valute.USD.Value;
    const smnToRub = (1 / smnToUsd) * usdToRub;

    return {
      USDT: { buy: parseFloat(usdtBuy), sell: parseFloat(usdtSell) },
      USD:  { buy: usdToRub * 1.02, sell: usdToRub * 0.98 },
      EUR:  { buy: cbr.Valute.EUR.Value * 1.02, sell: cbr.Valute.EUR.Value * 0.98 },
      SMN:  { buy: smnToRub * 0.97, sell: smnToRub * 1.03 }
    };

  } catch (error) {
    console.error('fetchRates failed:', error);
    showError(error.message);
    return null;
  }
}

// Показать ошибку (ставим «—» и красим)
function showError(message) {
  const errorElements = document.querySelectorAll('.rate');
  errorElements.forEach(el => {
    el.textContent = '—';
    el.style.color = '#ef4444';
  });
  console.error(message);
}

// Обновление курсов на странице
async function updateRates() {
  try {
    const rates = await fetchRates();
    if (!rates) return;

    Object.entries(rates).forEach(([currency, data]) => {
      const buyElem  = document.getElementById(`${currency.toLowerCase()}-buy`);
      const sellElem = document.getElementById(`${currency.toLowerCase()}-sell`);
      if (!buyElem || !sellElem) return;

      buyElem.textContent  = data.buy.toFixed(2);
      sellElem.textContent = data.sell.toFixed(2);
      buyElem.style.color  = '';
      sellElem.style.color = '';

      [buyElem, sellElem].forEach(el => {
        el.classList.add('updated');
        setTimeout(() => el.classList.remove('updated'), 500);
      });
    });

    convertCurrency();
  } catch (error) {
    showError(error.message);
  }
}

// Конвертация валют
function convertCurrency() {
  const rates = {
    USDT: parseFloat(document.getElementById('usdt-buy').textContent) || 0,
    USD:  parseFloat(document.getElementById('usd-buy').textContent) || 0,
    EUR:  parseFloat(document.getElementById('eur-buy').textContent) || 0,
    SMN:  parseFloat(document.getElementById('smn-buy').textContent) || 0,
    RUB: 1
  };
  const amount = parseFloat(document.getElementById('amount').value) || 0;
  const from   = document.getElementById('from-currency').value;
  const to     = document.getElementById('to-currency').value;

  if (rates[from] && rates[to] && amount > 0) {
    const result = (amount * rates[from]) / rates[to];
    document.getElementById('result').value = result.toLocaleString('ru-RU', {
      maximumFractionDigits: 2
    });
  }
}

// Обработчики событий
document.getElementById('swap-currencies').addEventListener('click', () => {
  const from = document.getElementById('from-currency');
  const to   = document.getElementById('to-currency');
  [from.value, to.value] = [to.value, from.value];
  convertCurrency();
  const btn = document.getElementById('swap-currencies');
  btn.classList.add('rotate');
  setTimeout(() => btn.classList.remove('rotate'), 600);
});
document.getElementById('amount').addEventListener('input', convertCurrency);
document.getElementById('from-currency').addEventListener('change', convertCurrency);
document.getElementById('to-currency').addEventListener('change', convertCurrency);
document.getElementById('refresh-btn').addEventListener('click', updateRates);

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateRates();
  setInterval(updateRates, 300000); // Обновление каждые 5 минут
});
