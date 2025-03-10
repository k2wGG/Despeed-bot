"use strict";

const fetch = require("node-fetch");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");
const readline = require("readline");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs").promises;
const kleur = require("kleur");

// ASCII-баннер (логотип)
const banner = `
███    ██  ██████  ██████  ██████  ██████  
████   ██ ██    ██ ██   ██      ██ ██   ██  
██ ██  ██ ██    ██ ██   ██  █████  ██████  
██  ██ ██ ██    ██ ██   ██      ██ ██   ██  
██   ████  ██████  ██████  ██████  ██   ██  

                TG: @nod3r
            DeSpeed Manager Bot
`;

// Имя файла, где будут храниться настройки
const CONFIG_FILE = "config.json";

// Начальные настройки по умолчанию
const config = {
  tokens: [],
  baseUrl: "https://app.despeed.net",
  checkInterval: 21600000, // интервал между тестами (6 часов)
  locationEnabled: false,
  uniqueIp: false,
  randomMode: false,      // Рандомный режим проверки (если true – интервалы случайные)
  minRandomDelay: 180 * 60000, // минимальная задержка в рандомном режиме (3 часа)
  maxRandomDelay: 540 * 60000, // максимальная задержка в рандомном режиме (9 часов)
  proxy: {
    enabled: false,
    urls: [],       // Массив прокси (каждая строка из proxy.txt)
    timeout: 10000,
    maxRetries: 3,
    testUrl: "https://api.ipify.org?format=json"
  }
};

// Флаг автоматического режима
let autoModeEnabled = false;

// Логгер для цветного вывода
const logger = {
  info: (msg, ...args) => console.log(kleur.blue("ℹ"), kleur.white(msg), ...args),
  success: (msg, ...args) => console.log(kleur.green("✔"), kleur.white(msg), ...args),
  warning: (msg, ...args) => console.log(kleur.yellow("⚠"), kleur.white(msg), ...args),
  error: (msg, ...args) => console.log(kleur.red("✖"), kleur.white(msg), ...args),
  speed: (msg, ...args) => console.log(kleur.cyan("↯"), kleur.white(msg), ...args),
  time: (msg, ...args) => console.log(kleur.magenta("⏰"), kleur.white(msg), ...args),
  location: (msg, ...args) => console.log(kleur.yellow("📍"), kleur.white(msg), ...args),
  network: (msg, ...args) => console.log(kleur.blue("🌐"), kleur.white(msg), ...args)
};

// ============ Функции сохранения/загрузки настроек ============
async function saveSettings() {
  try {
    const settingsToSave = {
      baseUrl: config.baseUrl,
      checkInterval: config.checkInterval,
      locationEnabled: config.locationEnabled,
      uniqueIp: config.uniqueIp,
      randomMode: config.randomMode,
      minRandomDelay: config.minRandomDelay,
      maxRandomDelay: config.maxRandomDelay,
      proxy: {
        enabled: config.proxy.enabled,
        urls: config.proxy.urls,
        timeout: config.proxy.timeout,
        maxRetries: config.proxy.maxRetries,
        testUrl: config.proxy.testUrl
      }
    };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(settingsToSave, null, 2), "utf8");
    logger.success("Настройки сохранены в config.json");
  } catch (error) {
    logger.error("Ошибка сохранения настроек:", error.message);
  }
}

async function loadSettings() {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf8");
    const loaded = JSON.parse(data);
    if (loaded.baseUrl) config.baseUrl = loaded.baseUrl;
    if (typeof loaded.checkInterval === "number") config.checkInterval = loaded.checkInterval;
    if (typeof loaded.locationEnabled === "boolean") config.locationEnabled = loaded.locationEnabled;
    if (typeof loaded.uniqueIp === "boolean") config.uniqueIp = loaded.uniqueIp;
    if (typeof loaded.randomMode === "boolean") config.randomMode = loaded.randomMode;
    if (typeof loaded.minRandomDelay === "number") config.minRandomDelay = loaded.minRandomDelay;
    if (typeof loaded.maxRandomDelay === "number") config.maxRandomDelay = loaded.maxRandomDelay;
    if (loaded.proxy) {
      config.proxy.enabled = !!loaded.proxy.enabled;
      config.proxy.urls = loaded.proxy.urls || [];
      config.proxy.timeout = loaded.proxy.timeout || config.proxy.timeout;
      config.proxy.maxRetries = loaded.proxy.maxRetries || config.proxy.maxRetries;
      config.proxy.testUrl = loaded.proxy.testUrl || config.proxy.testUrl;
    }
    logger.success("Настройки загружены из config.json");
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.warning("Файл config.json не найден, используются настройки по умолчанию");
    } else {
      logger.error("Ошибка загрузки настроек:", error.message);
    }
  }
}

// ============ Функции чтения токенов и прокси ============
async function loadTokensFromFile() {
  try {
    const content = await fs.readFile("token.txt", "utf8");
    const tokens = content.split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));
    if (tokens.length === 0) {
      throw new Error("В файле token.txt нет валидных токенов");
    }
    config.tokens = tokens;
    logger.success(`Загружено ${tokens.length} токен(ов) из token.txt`);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.error("Файл token.txt не найден");
    } else {
      logger.error(`Ошибка чтения token.txt: ${error.message}`);
    }
    return false;
  }
}

async function loadProxyFromFile() {
  try {
    const proxyContent = await fs.readFile("proxy.txt", "utf8");
    const lines = proxyContent.split("\n")
      .map(line => line.trim())
      .filter(line => line);
    if (lines.length === 0) return null;
    config.proxy.urls = lines;
    return true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.error(`Ошибка чтения proxy.txt: ${error.message}`);
    }
    return null;
  }
}

// ============ Функции работы с прокси ============
async function createProxyAgent() {
  if (!config.proxy.urls || config.proxy.urls.length === 0) return undefined;
  // Выбираем случайный прокси из массива
  const randomIndex = Math.floor(Math.random() * config.proxy.urls.length);
  const proxyUrl = config.proxy.urls[randomIndex];
  try {
    if (proxyUrl.startsWith("socks4://")) {
      return new SocksProxyAgent(proxyUrl);
    } else if (proxyUrl.startsWith("socks5://")) {
      return new SocksProxyAgent(proxyUrl);
    } else {
      return new HttpsProxyAgent(proxyUrl);
    }
  } catch (error) {
    logger.error(`Failed to create proxy agent: ${error.message}`);
    return undefined;
  }
}

async function isProxyAlive(proxyAgent) {
  try {
    const response = await fetch(config.proxy.testUrl, {
      agent: proxyAgent,
      timeout: config.proxy.timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getProxyAgent(retries = config.proxy.maxRetries) {
  if (!config.proxy.enabled) return undefined;
  for (let i = 0; i < retries; i++) {
    const agent = await createProxyAgent();
    if (!agent) return undefined;
    if (await isProxyAlive(agent)) {
      logger.success("Proxy connection established");
      return agent;
    }
    logger.warning(`Proxy check failed, attempt ${i + 1}/${retries}`);
    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
  }
  return undefined;
}

// ============ Функции для определения локации ============
async function getCurrentLocation(proxy) {
  try {
    const agent = proxy ? await getProxyAgent() : undefined;
    const response = await fetch("https://ipinfo.io/json", { agent });
    const data = await response.json();
    if (data.loc) {
      const [latitude, longitude] = data.loc.split(",").map(Number);
      return { latitude, longitude };
    }
    throw new Error("Нет данных о локации");
  } catch (error) {
    logger.warning("Не удалось получить реальные координаты, используется случайная локация");
    return generateRandomLocation();
  }
}

function generateRandomLocation() {
  const bounds = {
    minLat: 18.0,
    maxLat: 53.55,
    minLng: 73.66,
    maxLng: 135.05
  };
  const latitude = bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat);
  const longitude = bounds.minLng + Math.random() * (bounds.maxLng - bounds.minLng);
  return {
    latitude: Math.round(latitude * 1000000) / 1000000,
    longitude: Math.round(longitude * 1000000) / 1000000
  };
}

// ============ Инициализация конфигурации ============
async function initConfig() {
  logger.info("Начало настройки конфигурации...");

  await loadSettings();

  const tokensLoaded = await loadTokensFromFile();
  if (!tokensLoaded) {
    throw new Error("Не удалось загрузить токены из token.txt");
  }

  const proxyFileExists = await loadProxyFromFile();
  if (proxyFileExists) {
    logger.success("Прокси загружены из proxy.txt");
    config.proxy.enabled = true;
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (query) => new Promise(resolve => rl.question(query, resolve));
    const useProxy = (await question(kleur.cyan("Использовать прокси? (y/n): "))).toLowerCase() === "y";
    if (useProxy) {
      config.proxy.enabled = true;
      const proxyUrl = await question(kleur.cyan("Введите URL прокси (например, http://user:pass@ip:port или socks5://ip:port): "));
      config.proxy.urls = [proxyUrl.trim()];
    }
    rl.close();
  }

  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question2 = (query) => new Promise(resolve => rl2.question(query, resolve));
  const locResp = await question2(kleur.cyan("Включить геолокацию? (y/n): "));
  config.locationEnabled = locResp.trim().toLowerCase() === "y";
  const ipResp = await question2(kleur.cyan("Используете ли вы уникальный IP (не общий NAT)? (y/n): "));
  config.uniqueIp = ipResp.trim().toLowerCase() === "y";
  rl2.close();

  logger.success("Настройка завершена!");
  logger.info("Текущие настройки:");
  const safeConfig = { ...config, tokens: `${config.tokens.length} токен(ов) загружено` };
  console.log(kleur.gray(JSON.stringify(safeConfig, null, 2)));

  await saveSettings();
}

// ============ Заголовки для запросов ============
function getCommonHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Origin": "https://app.despeed.net",
    "Referer": "https://app.despeed.net/dashboard"
  };
}

// ============ Проверка валидности токена ============
async function validateToken(token) {
  if (!token) throw new Error("Токен не найден");
  try {
    const tokenData = JSON.parse(Buffer.from(token.split('.')[1], "base64").toString());
    if ((tokenData.exp - 90) * 1000 < Date.now()) {
      throw new Error("Токен истёк");
    }
    const proxyAgent = await getProxyAgent();
    const profileResponse = await fetch(`${config.baseUrl}/v1/api/auth/profile`, {
      headers: getCommonHeaders(token),
      agent: proxyAgent,
      timeout: 30000
    });
    if (!profileResponse.ok) {
      throw new Error("Токен недействителен");
    }
    return true;
  } catch (error) {
    logger.error(`Проверка токена не удалась: ${error.message}`);
    return false;
  }
}

// ============ Тест скорости (скачивание/загрузка) ============
async function performSpeedTest() {
  try {
    logger.network("Начало измерения скорости сети...");
    const metadata = {
      client_name: "speed-measurementlab-net-1",
      client_session_id: crypto.randomUUID()
    };
    const proxyAgent = await getProxyAgent();
    const locateUrl = new URL("https://locate.measurementlab.net/v2/nearest/ndt/ndt7");
    locateUrl.search = new URLSearchParams(metadata).toString();
    logger.info("Поиск сервера для теста скорости...");
    const locateResponse = await fetch(locateUrl, {
      agent: proxyAgent,
      timeout: 30000
    });
    if (!locateResponse.ok) {
      throw new Error(`Не удалось получить сервер теста скорости: ${locateResponse.status}`);
    }
    const serverData = await locateResponse.json();
    if (!serverData.results || !serverData.results[0]) {
      throw new Error("Нет доступного сервера для теста скорости");
    }
    const server = serverData.results[0];
    logger.success(`Выбран сервер: ${server.machine}`);
    const downloadUrl = server.urls["wss:///ndt/v7/download"];
    const uploadUrl = server.urls["wss:///ndt/v7/upload"];

    // Тест скачивания
    logger.network("Запуск теста скачивания...");
    let downloadSpeed = 0;
    await new Promise((resolve) => {
      const wsOptions = config.proxy.enabled ? { agent: proxyAgent } : undefined;
      const ws = new WebSocket(downloadUrl, "net.measurementlab.ndt.v7", wsOptions);
      let startTime = Date.now();
      let totalBytes = 0;
      ws.on("open", () => {
        startTime = Date.now();
        totalBytes = 0;
      });
      ws.on("message", (data) => {
        if (typeof data === "string") return;
        totalBytes += data.length;
        const duration = (Date.now() - startTime) / 1000;
        if (duration >= 10) {
          downloadSpeed = (totalBytes * 8) / (duration * 1000000);
          ws.close();
        }
      });
      ws.on("close", () => {
        logger.speed(`Скачивание: ${downloadSpeed.toFixed(2)} Mbps`);
        resolve();
      });
      ws.on("error", (error) => {
        logger.error(`Ошибка теста скачивания: ${error.message}`);
        resolve();
      });
    });

    // Тест загрузки
    logger.network("Запуск теста загрузки...");
    let uploadSpeed = 0;
    await new Promise((resolve) => {
      const wsOptions = config.proxy.enabled ? { agent: proxyAgent } : undefined;
      const ws = new WebSocket(uploadUrl, "net.measurementlab.ndt.v7", wsOptions);
      let startTime = null;
      let totalBytes = 0;
      let uploadInterval = null;
      const chunkSize = 16384;
      const uploadData = Buffer.alloc(chunkSize);
      crypto.randomFillSync(uploadData);
      ws.on("open", () => {
        startTime = Date.now();
        totalBytes = 0;
        uploadInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const duration = (Date.now() - startTime) / 1000;
            if (duration >= 10) {
              uploadSpeed = (totalBytes * 8) / (duration * 1000000);
              clearInterval(uploadInterval);
              ws.close();
              return;
            }
            if (ws.bufferedAmount < 1024 * 1024) {
              ws.send(uploadData);
              totalBytes += uploadData.length;
            }
          }
        }, 1);
      });
      ws.on("close", () => {
        if (uploadInterval) clearInterval(uploadInterval);
        if (uploadSpeed === 0 && startTime && totalBytes > 0) {
          const duration = (Date.now() - startTime) / 1000;
          uploadSpeed = (totalBytes * 8) / (duration * 1000000);
        }
        logger.speed(`Загрузка: ${uploadSpeed.toFixed(2)} Mbps`);
        resolve();
      });
      ws.on("error", (error) => {
        if (uploadInterval) clearInterval(uploadInterval);
        logger.error(`Ошибка теста загрузки: ${error.message}`);
        resolve();
      });
      setTimeout(() => {
        if (uploadInterval) clearInterval(uploadInterval);
        if (ws.readyState === WebSocket.OPEN) ws.close();
      }, 15000);
    });

    return { downloadSpeed, uploadSpeed };
  } catch (error) {
    logger.error(`Ошибка теста скорости: ${error.message}`);
    return { downloadSpeed: 0, uploadSpeed: 0 };
  }
}

// ============ Отправка результатов и расчёт награды ============
async function reportResults(token, downloadSpeed, uploadSpeed, location) {
  try {
    logger.info("Отправка результатов теста...");
    const baseReward = 50;
    let multiplier = 1;
    if (config.locationEnabled && config.uniqueIp) {
      multiplier = 4;
    } else if (config.locationEnabled || config.uniqueIp) {
      multiplier = 2;
    }
    const reward = baseReward * multiplier;
    const body = JSON.stringify({
      download_speed: Math.round(downloadSpeed * 100) / 100,
      upload_speed: Math.round(uploadSpeed * 100) / 100,
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: new Date().toISOString(),
      base_reward: baseReward,
      multiplier,
      reward
    });
    const proxyAgent = await getProxyAgent();
    const response = await fetch(`${config.baseUrl}/v1/api/points`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getCommonHeaders(token)
      },
      agent: proxyAgent,
      timeout: 30000,
      body
    });
    if (!response.ok) {
      throw new Error(`Ошибка отправки: ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      logger.success("Результаты успешно отправлены");
      logger.info("Ответ сервера:", JSON.stringify(data));
      return data;
    } else {
      throw new Error(data.message || "Ошибка отправки результатов");
    }
  } catch (error) {
    logger.error(`Ошибка при отправке результатов: ${error.message}`);
    return null;
  }
}

// ============ Вывод информации об аккаунте ============
async function displayAccountInfo(token) {
  try {
    logger.info("\n=== Информация об аккаунте ===");
    const proxyAgent = await getProxyAgent();
    const profileResponse = await fetch(`${config.baseUrl}/v1/api/auth/profile`, {
      headers: getCommonHeaders(token),
      agent: proxyAgent,
      timeout: 30000
    });
    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      logger.info(`Имя пользователя: ${profile.data.username || "Не указано"}`);
      logger.info(`Email: ${profile.data.email || "Не указан"}`);
    }
    logger.info("=== ==================== ===\n");
  } catch (error) {
    logger.error(`Не удалось получить информацию об аккаунте: ${error.message}`);
  }
}

// ============ Обработка одного аккаунта ============
async function processAccount(token, accountIndex) {
  try {
    logger.info(`\n=== Обработка аккаунта ${accountIndex + 1} ===`);
    logger.time(`Время: ${new Date().toLocaleString()}`);
    const isValid = await validateToken(token);
    if (!isValid) {
      logger.error(`Токен ${accountIndex + 1} недействителен или истёк`);
      return false;
    }
    logger.success(`Токен ${accountIndex + 1} успешно прошёл проверку`);
    await displayAccountInfo(token);
    let location;
    if (config.locationEnabled) {
      location = await getCurrentLocation();
    } else {
      location = generateRandomLocation();
    }
    logger.location(`Локация теста: ${location.latitude}, ${location.longitude}`);
    logger.network("Запуск теста скорости...");
    const { downloadSpeed, uploadSpeed } = await performSpeedTest();
    logger.speed(`Итоговая скорость скачивания: ${downloadSpeed.toFixed(2)} Mbps`);
    logger.speed(`Итоговая скорость загрузки: ${uploadSpeed.toFixed(2)} Mbps`);
    const result = await reportResults(token, downloadSpeed, uploadSpeed, location);
    if (result && result.success) {
      logger.success("Тест скорости завершён и результаты отправлены");
      return true;
    } else {
      logger.error("Не удалось отправить результаты теста");
      if (result && result.message) {
        logger.error(`Причина: ${result.message}`);
      }
      return false;
    }
  } catch (error) {
    logger.error(`Ошибка обработки аккаунта ${accountIndex + 1}: ${error.message}`);
    return false;
  }
}

// ============ Основной цикл (один проход) ============
async function main() {
  try {
    logger.info("\n=== Запуск многопрофильного теста скорости ===");
    for (let i = 0; i < config.tokens.length; i++) {
      await processAccount(config.tokens[i], i);
      if (i < config.tokens.length - 1) {
        logger.info("Ожидание 30 секунд перед следующим аккаунтом...");
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
  } catch (error) {
    logger.error(`Ошибка в основном цикле: ${error.message}`);
  } finally {
    if (!autoModeEnabled) {
      const nextTime = new Date(Date.now() + config.checkInterval);
      logger.time(`Следующий цикл тестирования запланирован на: ${nextTime.toLocaleString()}`);
      logger.info(`Интервал: ${Math.round(config.checkInterval / 60000)} минут`);
      logger.info("=== Цикл тестирования завершён ===\n");
      setTimeout(main, config.checkInterval);
    }
  }
}

// ============ Меню и дополнительные функции ============
function askQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

function showMenu() {
  console.log(kleur.cyan("\n=== Главное Меню ==="));
  console.log("1. Запустить тест скорости");
  console.log("2. Запустить автоматический режим");
  console.log("3. Добавить аккаунт (токен)");
  console.log("4. Добавить прокси");
  console.log("5. Показать текущие настройки");
  console.log("6. Изменить настройки");
  console.log("7. Выход");
  console.log("======================\n");
}

async function handleMenuSelection() {
  showMenu();
  const choice = await askQuestion(kleur.cyan("Введите номер действия: "));
  switch (choice.trim()) {
    case "1":
      await main();
      break;
    case "2":
      autoModeEnabled = true;
      await autoMode();
      return;
    case "3":
      await addAccount();
      break;
    case "4":
      await addProxy();
      break;
    case "5":
      showSettings();
      break;
    case "6":
      await editSettings();
      break;
    case "7":
      console.log(kleur.yellow("Выход из программы..."));
      process.exit(0);
      break;
    default:
      console.log(kleur.red("Неверный выбор. Попробуйте снова."));
  }
  await handleMenuSelection();
}

async function addAccount() {
  const token = await askQuestion(kleur.cyan("Введите токен: "));
  if (token.trim() !== "") {
    config.tokens.push(token.trim());
    await fs.writeFile("token.txt", config.tokens.join("\n"), "utf8");
    console.log(kleur.green("Токен успешно добавлен!"));
    await saveSettings();
  } else {
    console.log(kleur.red("Пустой токен не добавлен."));
  }
}

async function addProxy() {
  const proxyInput = await askQuestion(kleur.cyan("Введите прокси (каждый URL с новой строки): "));
  const proxies = proxyInput.split("\n").map(line => line.trim()).filter(line => line);
  if (proxies.length > 0) {
    config.proxy.urls = proxies;
    config.proxy.enabled = true;
    await fs.writeFile("proxy.txt", proxies.join("\n"), "utf8");
    console.log(kleur.green("Прокси успешно добавлены!"));
    await saveSettings();
  } else {
    console.log(kleur.red("Пустой ввод. Прокси не добавлены."));
  }
}

function showSettings() {
  console.log(kleur.gray("\n=== Текущие настройки ==="));
  console.log(`Загружено токенов: ${config.tokens.length}`);
  if (config.proxy.enabled && config.proxy.urls.length > 0) {
    console.log("Прокси включены, список прокси:");
    config.proxy.urls.forEach((url, idx) => {
      console.log(`  ${idx + 1}. ${url}`);
    });
  } else {
    console.log("Прокси не настроены");
  }
  console.log(`Геолокация: ${config.locationEnabled ? "Включена" : "Отключена"}`);
  console.log(`Уникальный IP: ${config.uniqueIp ? "Да" : "Нет"}`);
  if (config.randomMode) {
    console.log(`Рандомный режим: Включён (задержка от ${Math.round(config.minRandomDelay / 60000)} до ${Math.round(config.maxRandomDelay / 60000)} минут)`);
  } else {
    console.log(`Интервал между тестами: ${Math.round(config.checkInterval / 60000)} минут`);
  }
  console.log("========================\n");
}

async function editSettings() {
  logger.info("Редактирование настроек...");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (query) => new Promise(resolve => rl.question(query, resolve));

  const baseUrl = await question(`Введите базовый URL (текущий: ${config.baseUrl}): `);
  if (baseUrl.trim()) config.baseUrl = baseUrl.trim();

  const intervalStr = await question(`Введите интервал между тестами (в минутах, текущий: ${Math.round(config.checkInterval / 60000)}): `);
  let intervalMinutes = parseInt(intervalStr);
  const maxMinutes = 1440;
  if (isNaN(intervalMinutes) || intervalMinutes <= 0) {
    intervalMinutes = Math.round(config.checkInterval / 60000);
  } else if (intervalMinutes > maxMinutes) {
    console.log(kleur.yellow(`Значение превышает максимально допустимое (${maxMinutes} минут). Используем ${maxMinutes} минут.`));
    intervalMinutes = maxMinutes;
  }
  config.checkInterval = intervalMinutes * 60000;

  const loc = await question(`Включить геолокацию? (y/n, текущий: ${config.locationEnabled ? "y" : "n"}): `);
  config.locationEnabled = (loc.trim().toLowerCase() === "y");

  const unique = await question(`Используете ли вы уникальный IP? (y/n, текущий: ${config.uniqueIp ? "y" : "n"}): `);
  config.uniqueIp = (unique.trim().toLowerCase() === "y");

  const randMode = await question(`Использовать случайный режим проверки? (y/n, текущий: ${config.randomMode ? "y" : "n"}): `);
  config.randomMode = (randMode.trim().toLowerCase() === "y");
  if (config.randomMode) {
    const minDelayStr = await question(`Введите минимальную задержку (в минутах, текущая: ${Math.round(config.minRandomDelay / 60000)}): `);
    const maxDelayStr = await question(`Введите максимальную задержку (в минутах, текущая: ${Math.round(config.maxRandomDelay / 60000)}): `);
    const minDelay = parseInt(minDelayStr) || Math.round(config.minRandomDelay / 60000);
    const maxDelay = parseInt(maxDelayStr) || Math.round(config.maxRandomDelay / 60000);
    if (minDelay > maxDelay) {
      console.log(kleur.red("Минимальная задержка не может быть больше максимальной. Значения не изменены."));
    } else {
      config.minRandomDelay = minDelay * 60000;
      config.maxRandomDelay = maxDelay * 60000;
    }
  }

  const useProxy = await question(`Использовать прокси? (y/n, текущий: ${config.proxy.enabled ? "y" : "n"}): `);
  config.proxy.enabled = (useProxy.trim().toLowerCase() === "y");
  if (config.proxy.enabled) {
    if (config.proxy.urls.length > 0) {
      console.log(kleur.gray("\nДоступные прокси:"));
      config.proxy.urls.forEach((url, idx) => {
        console.log(`  ${idx + 1}. ${url}`);
      });
      const choice = await question(`Введите номера прокси через запятую для выбора или оставьте пустым для сохранения текущего списка: `);
      if (choice.trim()) {
        const indices = choice.split(",")
          .map(s => parseInt(s.trim()) - 1)
          .filter(index => index >= 0 && index < config.proxy.urls.length);
        if (indices.length > 0) {
          config.proxy.urls = indices.map(index => config.proxy.urls[index]);
          console.log(kleur.green("Выбраны следующие прокси:"), config.proxy.urls.join(", "));
        } else {
          console.log(kleur.red("Неверный ввод, список прокси остаётся без изменений."));
        }
      } else {
        console.log(kleur.green("Список прокси остаётся без изменений."));
      }
    } else {
      const proxyUrl = await question(`Введите URL прокси: `);
      if (proxyUrl.trim()) {
        config.proxy.urls = [proxyUrl.trim()];
      }
    }
    const proxyTimeout = await question(`Введите таймаут прокси (мс, текущий: ${config.proxy.timeout}): `);
    config.proxy.timeout = parseInt(proxyTimeout) || config.proxy.timeout;
    const proxyRetries = await question(`Введите максимальное число попыток прокси (текущий: ${config.proxy.maxRetries}): `);
    config.proxy.maxRetries = parseInt(proxyRetries) || config.proxy.maxRetries;
    const proxyTestUrl = await question(`Введите test URL для прокси (текущий: ${config.proxy.testUrl}): `);
    if (proxyTestUrl.trim()) config.proxy.testUrl = proxyTestUrl.trim();
  }
  rl.close();
  logger.success("Настройки обновлены!");
  showSettings();
  await saveSettings();
}

async function autoMode() {
  const intervalStr = await askQuestion(kleur.cyan("Введите интервал автоматического цикла (в минутах): "));
  let intervalMinutes = parseInt(intervalStr) || 60;
  const maxMinutes = 1440;
  if (intervalMinutes > maxMinutes) {
    console.log(kleur.yellow(`Значение превышает максимально допустимое (${maxMinutes} минут). Используем ${maxMinutes} минут.`));
    intervalMinutes = maxMinutes;
  }
  // Если включён случайный режим, выбираем задержку случайным образом
  let delay;
  if (config.randomMode) {
    delay = Math.floor(Math.random() * (config.maxRandomDelay - config.minRandomDelay + 1)) + config.minRandomDelay;
    console.log(kleur.green(`Случайная задержка выбрана: ${Math.round(delay / 60000)} минут.`));
  } else {
    delay = intervalMinutes * 60000;
  }
  config.checkInterval = delay;
  logger.info(`Автоматический режим запущен с интервалом ${Math.round(delay / 60000)} минут.`);
  autoModeEnabled = true;
  while (true) {
    await main();
    await new Promise(resolve => setTimeout(resolve, config.checkInterval));
  }
}

process.on("SIGINT", () => {
  logger.warning("\nПолучен сигнал завершения. Выход...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.warning("\nПолучен сигнал остановки. Выход...");
  process.exit(0);
});

console.clear();
console.log(kleur.cyan(banner));
logger.info("Запуск клиента многопрофильного тестирования скорости (DeSpeed)...");
initConfig()
  .then(() => {
    handleMenuSelection();
  })
  .catch((error) => {
    logger.error(`Ошибка инициализации: ${error.message}`);
    process.exit(1);
  });
