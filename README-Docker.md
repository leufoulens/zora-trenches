# Развертывание Zora Trenches в Docker

## Быстрый запуск

### 1. Подготовка переменных окружения

Скопируйте файл с примером переменных окружения:
```bash
cp env.example .env
```

Отредактируйте `.env` файл и заполните все необходимые переменные:
- `TELEGRAM_BOT_TOKEN` - токен вашего Telegram бота
- `TELEGRAM_CHAT_GENERAL` - ID общего чата
- `TELEGRAM_CHAT_HIGH` - ID чата для уведомлений о популярных авторах
- `X_API_KEY` - ключ API для X (Twitter)
- `PROXY_HOST`, `PROXY_USERNAME`, `PROXY_PASSWORD` - настройки прокси

### 2. Запуск с Docker Compose (рекомендуется)

```bash
# Запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f zora-trenches

# Остановка сервисов
docker-compose down
```

### 3. Запуск только Docker контейнера

Если у вас уже есть Redis сервер:

```bash
# Сборка образа
docker build -t zora-trenches .

# Запуск контейнера
docker run -d \
  --name zora-trenches-app \
  --env-file .env \
  -e REDIS_URL=redis://your-redis-host:6379 \
  zora-trenches
```

## Полезные команды

```bash
# Просмотр статуса контейнеров
docker-compose ps

# Перезапуск приложения
docker-compose restart zora-trenches

# Очистка кэша Redis
docker-compose exec redis redis-cli FLUSHALL

# Подключение к Redis CLI
docker-compose exec redis redis-cli

# Просмотр логов конкретного сервиса
docker-compose logs -f zora-trenches
docker-compose logs -f redis

# Обновление и пересборка образа
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Структура

- **zora-trenches** - основное приложение на Node.js
- **redis** - база данных для кэширования обработанных адресов
- **redis_data** - том для постоянного хранения данных Redis

## Отладка

Если приложение не запускается, проверьте:

1. Все ли переменные окружения заполнены в `.env` файле
2. Доступность внешних API (Zora, X/Twitter)
3. Корректность токена Telegram бота
4. Подключение к Redis

```bash
# Проверка логов для диагностики
docker-compose logs zora-trenches
```

## Команды Alpha List

Бот поддерживает следующие команды для управления списком VIP пользователей:

### /add_alpha_list
Добавляет одного или несколько пользователей в alpha список. Если username из профиля присутствует в alpha списке, сообщение о новом профиле также отправляется в HIGH чат.

**Использование:**
```
/add_alpha_list username1 username2 username3
```

**Примеры:**
```
/add_alpha_list ufo
/add_alpha_list wakeupremember wethemniggas whatisiana
/add_alpha_list wils wilsoncusack willienorrisworkshop w1nt3r yitong yonfrula
```

### /alpha_list
Показывает всех пользователей, добавленных в alpha список.

**Использование:**
```
/alpha_list
```

### /remove_alpha_user
Удаляет пользователя из alpha списка.

**Использование:**
```
/remove_alpha_user username
```

**Пример:**
```
/remove_alpha_user ufo
```

## Логика работы Alpha List

1. При создании нового профиля на Zora проверяется, есть ли username профиля в alpha списке
2. Если пользователь найден в alpha списке, сообщение отправляется и в GENERAL, и в HIGH чат
3. В логах такие пользователи помечаются как "ALPHA USER"
4. Alpha список хранится в Redis и сохраняется между перезапусками 