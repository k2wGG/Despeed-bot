# DeSpeed Manager Bot

DeSpeed Manager Bot — это консольное Node.js-приложение для автоматизированного тестирования скорости интернета и отправки результатов на платформу [DeSpeed](https://app.despeed.net/register?ref=X4ijbXsO2U3I). Проект поддерживает многопрофильное тестирование (несколько токенов/аккаунтов), работу через прокси, возможность выбора случайных интервалов между тестами и многое другое.

## Возможности

- **Многопрофильное тестирование:**  
  Используйте несколько токенов (аккаунтов), указанных в файле `token.txt`. Каждый токен обрабатывается отдельно с заданной паузой между тестами.

- **Работа с прокси:**  
  Поддержка HTTP/HTTPS, SOCKS4 и SOCKS5-прокси. Список прокси хранится в файле `proxy.txt` и используется для случайного выбора при каждом запросе.

- **Интерактивное меню:**  
  Приложение предоставляет удобное интерактивное меню для:
  - Запуска теста скорости вручную.
  - Запуска автоматического режима, где тесты проводятся с заданной (или случайной) задержкой.
  - Добавления новых токенов или прокси.
  - Просмотра и редактирования текущих настроек.
  - Завершения работы приложения.

- **Режим случайных задержек:**  
  При включённом рандомном режиме задержка между тестами выбирается случайным образом из диапазона, заданного параметрами `minRandomDelay` и `maxRandomDelay`. Это помогает имитировать «естественный» график тестирования (например, 4 проверки в сутки).

- **Сохранение настроек:**  
  Все настройки сохраняются в файле `config.json`, что позволяет сохранять выбранные параметры между запусками.

- **Геолокация и уникальный IP:**  
  Вы можете включить определение геолокации через API `ipinfo.io` или использовать случайные координаты. Дополнительно можно указать, что вы используете уникальный IP (не общий NAT) для корректного расчёта награды.


## Установка

1. **Клонируйте репозиторий или скачайте исходный код:**

   ```bash
   git clone https://github.com/k2wGG/Despeed-bot.git && cd Despeed-bot
   ```

2. **Установите Node.js** (версия 14.0.0 или выше) и npm.

3. **Установите зависимости:**

   ```bash
   npm install
   ```

4. **Настройте файлы:**
   - Создайте файл `token.txt` и добавьте токены (по одному на строке).
   - Создайте файл `proxy.txt` и добавьте прокси-URL (по одному на строке). Пример:
     ```
     http://user:pass@ip:port
     socks5://ip:port
     ```
   - Файл `config.json` можно не создавать — при первом запуске он будет создан автоматически.

## Использование

Запустите приложение командой:

```bash
npm start
```

При запуске отобразится интерактивное меню:

```
=== Главное Меню ===
1. Запустить тест скорости
2. Запустить автоматический режим
3. Добавить аккаунт (токен)
4. Добавить прокси
5. Показать текущие настройки
6. Изменить настройки
7. Выход
======================
```

### Пункты меню:

1. **Запустить тест скорости**  
   Запускает единичный цикл тестирования для всех токенов с паузой 6 секунд между аккаунтами.

2. **Запустить автоматический режим**  
   Запускает бесконечный цикл тестов. Вы можете задать интервал автоматического цикла (в минутах). Если включён режим случайных задержек, интервал выбирается случайным образом в заданном диапазоне.

3. **Добавить аккаунт (токен)**  
   Позволяет добавить новый токен в файл `token.txt`.

4. **Добавить прокси**  
   Позволяет добавить список прокси в файл `proxy.txt`.

5. **Показать текущие настройки**  
   Выводит основные параметры: количество токенов, список прокси, статус геолокации, уникальный IP, интервалы и режим рандомных задержек.

6. **Изменить настройки**  
   Позволяет редактировать:
   - Базовый URL
   - Интервал между тестами (в минутах)
   - Включение/выключение геолокации и уникального IP
   - Рандомный режим проверки (с возможностью задать минимальную и максимальную задержку)
   - Выбор прокси из доступного списка (можно выбрать несколько, введя номера через запятую)

7. **Выход**  
   Завершает работу приложения.

## Автоматический режим

В автоматическом режиме приложение выполняет тесты с заданным интервалом. Если включён рандомный режим проверки (`randomMode`), задержка между тестами выбирается случайным образом из диапазона, заданного параметрами `minRandomDelay` и `maxRandomDelay`. Это позволяет эмулировать реальное поведение (например, 4 проверки в сутки).

## Лицензия

Этот проект распространяется под лицензией [MIT](./LICENSE).
