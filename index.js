import { Telegraf, Markup } from 'telegraf';
import fetch from 'node-fetch';
import { format } from 'date-fns';

// Загружаем админов из JSON
async function loadAdmins() {
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}/latest`, {
      headers: {
        'X-Master-Key': process.env.JSONBIN_API_KEY
      }
    });

    if (!res.ok) throw new Error('Не удалось загрузить админов');

    const json = await res.json();
    return json.record && Array.isArray(json.record.admins)
      ? json.record
      : { admins: [] };
  } catch (err) {
    console.error('Ошибка при загрузке админов:', err.message);
    return { admins: [] };
  }
}

async function saveAdmins(data) {
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_API_KEY
      },
      body: JSON.stringify(data, null, 2)
    });

    if (!res.ok) throw new Error('Ошибка при сохранении админов');
  } catch (err) {
    console.error('Ошибка при сохранении админов:', err.message);
  }
}

async function loadUsers() {
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${process.env.JSONBIN_USERS_BIN_ID}/latest`, {
      headers: {
        'X-Master-Key': process.env.JSONBIN_API_KEY
      }
    });

    if (!res.ok) throw new Error('Не удалось загрузить пользователей');

    const json = await res.json();
    return json.record && Array.isArray(json.record.users)
      ? json.record
      : { users: [] };
  } catch (err) {
    console.error('Ошибка загрузки пользователей:', err.message);
    return { users: [] };
  }
}

async function saveUsers(data) {
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${process.env.JSONBIN_USERS_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_API_KEY
      },
      body: JSON.stringify(data, null, 2)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Ошибка сохранения пользователей:', res.status, text);
    }
  } catch (err) {
    console.error('Ошибка в saveUsers:', err.message);
  }
}

async function getAdminLevel(userId) {
  const data = await loadAdmins();
  const admin = data.admins.find(a => a.id === userId);
  return admin ? admin.level : 0;
}

async function hasLevel(userId, level) {
  return (await getAdminLevel(userId)) >= level;
}

function getRemainingDays(buy) {
  if (!buy || !buy.start || buy.days <= 0) return 0;
  const startDate = new Date(buy.start);
  const now = new Date();
  const diff = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
  const remaining = buy.days - diff;
  return remaining > 0 ? remaining : 0;
}

function generateUniqueKey(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const userInSupport = new Set();
const userSupportMessages = new Map(); // userId → messageId

const SUPPORT_GROUP_ID = -1002756369611;

const cancelSupportKeyboard = Markup.keyboard([
  ['❌ Отменить вызов поддержки']
]).resize();
const mainKeyboard = Markup.keyboard([
  ['🧩 Купить активацию', '📦 Скачать лаунчер'],
  ['💬 Поддержка', '👤 Профиль']  // Добавили сюда
]).resize();

bot.start((ctx) => {
  ctx.reply(
    '👋 Вас приветствует команда SR\n\nМы создаем уникальные скрипты для комфортной игры .',
    mainKeyboard
  );
});

bot.use(async (ctx, next) => {
  if (!ctx.from || ctx.chat.type !== 'private') return next();

  const data = await loadUsers();
  const user = data.users.find(u => u.id === ctx.from.id);

  if (user?.ban?.status) {
    const now = new Date();
    const unbanDate = user.ban.until ? new Date(user.ban.until) : null;

    if (unbanDate && now > unbanDate) {
      user.ban = { status: false, reason: '', until: null };
      await saveUsers(data);
      return next();
    } else {
      const remaining = unbanDate
        ? `до ${format(unbanDate, 'yyyy-MM-dd')}`
        : 'навсегда';

      return ctx.reply(
        `⛔ Вы были заблокированы в данном боте ${remaining}.\n` +
        `Причина: ${user.ban.reason}\n\nДля обжалования наказания пишите в личные сообщения в DS @nedoxbin.`
      );
    }
  }

  return next();
});

bot.hears('👤 Профиль', async (ctx) => {
  const userId = ctx.from.id;
  const data = await loadUsers();
  let user = data.users.find(u => u.id === userId);

  if (!user) {
    const key = generateUniqueKey();
    user = {
      id: userId,
      login: ctx.from.username || '',
      key,
      buy1: { days: 0, start: null },
      buy2: { days: 0, start: null }
    };
    data.users.push(user);
    await saveUsers(data);
  }

  const cheatDays = getRemainingDays(user.buy1);
  const lovlaDays = getRemainingDays(user.buy2);

  ctx.reply(
    `👤 Ваш профиль:\n\n🔹 Логин: ${user.login}\n🔑 Ключ: <code>${user.key}</code>\n\n👑 Доступные подписки:\n` +
    `Multi-Cheat: ${cheatDays} дн\nMulti-Lovla: ${lovlaDays} дн`,
    { parse_mode: 'HTML' }
  );
});


// Обработка кнопки "Активацию"
bot.hears('🧩 Купить активацию', (ctx) => {
  ctx.reply(
    'Выберите товар:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Multi-Cheat', 'select_srm')]
    ])
  );
});

// Обработка выбора SRm
bot.action('select_srm', async (ctx) => {
  await ctx.answerCbQuery(); // убираем "часики" Telegram
  ctx.editMessageText(
    'Вы выбрали Multi-Cheat.\n\nСтоимость: ⭐250 навсегда / ⭐50 на месяц.',
    Markup.inlineKeyboard([
      [Markup.button.callback('Оплатить', 'pay_srm')],
      [Markup.button.callback('Назад', 'back_to_products')]
    ])
  );
});

// Оплата
bot.action('pay_srm', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText('💳 Платежная система скоро будет добавлена. Свяжитесь с поддержкой.');
});

// Назад
bot.action('back_to_products', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.editMessageText(
    'Выберите товар:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Multi-Cheat', 'select_srm')]
    ])
  );
});

// Остальные кнопки
bot.hears('📦 Скачать лаунчер', (ctx) => {
  ctx.reply('Лаунчер на стадии разработки.');
});

// Поддержка
bot.hears('💬 Поддержка', (ctx) => {
  userInSupport.add(ctx.from.id);
  ctx.reply(
    'Здравствуйте!\n\nНапишите Ваш вопрос, и мы ответим Вам в ближайшее время.',
    cancelSupportKeyboard
  );
});

// Нажал «Отменить вызов поддержки»
bot.hears('❌ Отменить вызов поддержки', async (ctx) => {
  const userId = ctx.from.id;
  userInSupport.delete(userId);

  const msgId = userSupportMessages.get(userId);

  if (msgId) {
    try {
      await bot.telegram.editMessageText(
        SUPPORT_GROUP_ID,
        msgId,
        undefined,
        `📩 Вопрос от @${ctx.from.username || 'БезUsername'} (ID: ${userId}):\n${ctx.message.text}\n\n🔒 Вопрос был закрыт`
      );
    } catch (e) {
      console.log('Не удалось отредактировать сообщение:', e.message);
    }

    userSupportMessages.delete(userId);
  }

  ctx.reply('🛑 Вызов поддержки отменён.', {
    reply_markup: mainKeyboard.reply_markup,
  });
});

function resolveId(input, users) {
  if (!isNaN(input)) return Number(input); // если число — это ID

  if (input.startsWith('@')) input = input.slice(1);
  const user = users.find(u => u.login === input);
  return user ? user.id : null;
}

bot.command('sub', async (ctx) => {
  if (!(await hasLevel(ctx.from.id, 3))) return ctx.reply('🚫 Нет доступа.');

  const args = ctx.message.text.split(' ');
  if (args.length < 4) return ctx.reply('Использование: /sub <@user/ID> <buy1|buy2> <дней>');

  const rawId = args[1];
  const field = args[2];
  const days = Number(args[3]);
  if (!['buy1', 'buy2'].includes(field) || isNaN(days)) return ctx.reply('❌ Некорректные данные.');

  const data = await loadUsers();
  const userId = resolveId(rawId, data.users);
  const user = data.users.find(u => u.id === userId);
  if (!user) return ctx.reply('❌ Пользователь не найден');

  user[field] = {
    days,
    start: new Date().toISOString().slice(0, 10),
    issuedBy: ctx.from.username || ctx.from.id,
  };

  await saveUsers(data);
  ctx.reply(`✅ Подписка ${field} пользователю ${user.login || user.id} выдана на ${days} дней.`);
});

bot.command('gsub', async (ctx) => {
  if (!(await hasLevel(ctx.from.id, 3))) return ctx.reply('🚫 Нет доступа.');
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /gsub <@user/ID>');

  const data = await loadUsers();
  const userId = resolveId(args[1], data.users);
  const user = data.users.find(u => u.id === userId);
  if (!user) return ctx.reply('❌ Пользователь не найден');

  const cheat = user.buy1;
  const lovla = user.buy2;
  let text = `🔍 Подписки пользователя @${user.login || user.id}:\n\n`;

  if (cheat?.days) {
    text += `📦 Multi-Cheat: ${getRemainingDays(cheat)} дн осталось\n`;
    text += `Выдано: ${cheat.days} дн от ${cheat.issuedBy || 'неизвестно'} (${cheat.start})\n\n`;
  }
  if (lovla?.days) {
    text += `📦 Multi-Lovla: ${getRemainingDays(lovla)} дн осталось\n`;
    text += `Выдано: ${lovla.days} дн от ${lovla.issuedBy || 'неизвестно'} (${lovla.start})\n\n`;
  }

  ctx.reply(text);
});

bot.command('usersub', async (ctx) => {
  if (!(await hasLevel(ctx.from.id, 4))) return ctx.reply('🚫 Нет доступа.');
  const data = await loadUsers();
  const usersWithSubs = data.users.filter(u =>
    getRemainingDays(u.buy1) > 0 || getRemainingDays(u.buy2) > 0
  );

  if (usersWithSubs.length === 0) return ctx.reply('😐 Нет активных подписок.');

  const message = usersWithSubs.map(u => {
    const cheat = getRemainingDays(u.buy1);
    const lovla = getRemainingDays(u.buy2);
    return `• @${u.login || u.id}\n📦 Multi-Cheat: ${cheat} дн\n📦 Multi-Lovla: ${lovla} дн`;
  }).join('\n\n');

  ctx.reply(`📋 Активные подписки:\n\n${message}`);
});

// Команда /ban
bot.command('ban', async ctx => {
  if (!(await hasLevel(ctx.from.id, 3))) return ctx.reply('🚫 Нет доступа.');
  const args = ctx.message.text.split(' ');
  if (args.length < 3) return ctx.reply('Использование: /ban <ID или @user> <дни или -1> <причина>');

  const identifier = args[1];
  const days = Number(args[2]);
  const reason = args.slice(3).join(' ') || 'не указана';

  const data = await loadUsers();

  let user;
  if (identifier.startsWith('@')) {
    const login = identifier.slice(1).toLowerCase();
    user = data.users.find(u => u.login?.toLowerCase() === login);
  } else {
    const id = Number(identifier);
    user = data.users.find(u => u.id === id);
  }

  if (!user) return ctx.reply('❌ Пользователь не найден.');

  const untilDate = days === -1 ? null : Date.now() + days * 24 * 60 * 60 * 1000;

  user.ban = {
    status: true,
    until: untilDate,
    reason,
    by: {
      id: ctx.from.id,
      login: ctx.from.username || null
    }
  };

  await saveUsers(data);

  const duration = days === -1 ? 'навсегда' : `${days} дней`;

  // Сообщение пользователю
  try {
    await bot.telegram.sendMessage(user.id,
      `⛔ Вы были заблокированы в данном боте ${duration}.\nПричина: ${reason}\n\nДля обжалования наказания пишите в личные сообщения в DS @nedoxbin.`);
  } catch (e) {
    console.log('Не удалось отправить сообщение пользователю:', e.message);
  }

  ctx.reply(`✅ Пользователь ${user.login || user.id} заблокирован на ${duration}`);
});

// Команда /unban
bot.command('unban', async ctx => {
  if (!(await hasLevel(ctx.from.id, 5))) return ctx.reply('🚫 Нет доступа.');
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /unban <ID>');

  const userId = Number(args[1]);
  if (isNaN(userId)) return ctx.reply('❌ Неверный ID');

  const data = await loadUsers();
  const user = data.users.find(u => u.id === userId);
  if (!user || !user.ban?.status) return ctx.reply('Пользователь не заблокирован.');

  user.ban = { status: false, reason: '', until: null };
  await saveUsers(data);

  ctx.reply(`✅ Пользователь ${user.login || user.id} был разбанен.`);

  try {
    await ctx.telegram.sendMessage(userId, '✅ Вы были разблокированы. Добро пожаловать обратно!');
  } catch (err) {
    console.warn('Не удалось уведомить пользователя.');
  }
});

bot.command('setadm', async (ctx) => {
  if (!(await hasLevel(ctx.from.id, 4))) return ctx.reply('🚫 Нет доступа.');

  const args = ctx.message.text.split(' ');
  if (args.length < 4) return ctx.reply('Использование: /setadm <ID/@username> <уровень> <ник>');

  const rawId = args[1];
  const level = Number(args[2]);
  const nickname = args.slice(3).join(' ');

  if (isNaN(level) || level < 1 || level > 5) return ctx.reply('❌ Уровень должен быть от 1 до 5');

  const usersData = await loadUsers();
  const resolvedId = resolveId(rawId, usersData.users);

  if (!resolvedId) return ctx.reply('❌ Пользователь не найден по ID или username');

  const adminsData = await loadAdmins();
  const existing = adminsData.admins.find(a => a.id === resolvedId);

  if (existing) {
    existing.level = level;
    existing.nickname = nickname;
  } else {
    adminsData.admins.push({ id: resolvedId, level, nickname });
  }

  await saveAdmins(adminsData);
  ctx.reply(`✅ Пользователь ${nickname} (${resolvedId}) назначен уровнем ${level}`);
});

bot.command('deladm', async (ctx) => {
  if (!(await hasLevel(ctx.from.id, 5))) return ctx.reply('🚫 Нет доступа.');

  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /deladm <ID/@username>');

  const rawId = args[1];
  const usersData = await loadUsers();
  const resolvedId = resolveId(rawId, usersData.users);

  if (!resolvedId) return ctx.reply('❌ Пользователь не найден по ID или username');

  const adminsData = await loadAdmins();
  const before = adminsData.admins.length;
  adminsData.admins = adminsData.admins.filter(a => a.id !== resolvedId);

  if (adminsData.admins.length === before) {
    return ctx.reply('❌ Админ не найден.');
  }

  await saveAdmins(adminsData);
  ctx.reply(`🗑 Админ с ID ${resolvedId} удалён.`);
});


bot.command('admins', async ctx => {
  if (!(await hasLevel(ctx.from.id, 3))) return ctx.reply('🚫 Нет доступа.');
  const data = await loadAdmins();
  if (data.admins.length === 0) return ctx.reply('Список пуст.');
  let list = '👥 <b>Список заместителей и админов:</b>\n\n';
  data.admins.forEach(a => {
    list += `• ID: <code>${a.id}</code> | Ник: ${a.nickname || 'неизвестно'} | Уровень: ${a.level}\n`;
  });
  ctx.replyWithHTML(list);
});



// 📌 /gban @user или /gban ID
bot.command('gban', async ctx => {
  if (!(await hasLevel(ctx.from.id, 3))) return ctx.reply('🚫 Нет доступа.');
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('Использование: /gban <@user или ID>');

  const input = args[1];
  const data = await loadUsers();

  let user;
  if (input.startsWith('@')) {
    const username = input.slice(1).toLowerCase();
    user = data.users.find(u => u.login?.toLowerCase() === username);
  } else {
    const id = Number(input);
    if (!isNaN(id)) {
      user = data.users.find(u => u.id === id);
    }
  }

  if (!user) return ctx.reply('❌ Пользователь не найден.');

  if (!user.ban?.status) return ctx.reply('✅ Пользователь не заблокирован.');

  const until = user.ban.until
    ? `до ${format(new Date(user.ban.until), 'yyyy-MM-dd')}`
    : 'навсегда';

  const byInfo = user.ban.by
    ? `Забанил: ${user.ban.by.login ? '@' + user.ban.by.login : user.ban.by.id}`
    : 'Забанил: неизвестно';

  ctx.reply(
    `🚫 Пользователь ${user.login || user.id} заблокирован.\n` +
    `Причина: ${user.ban.reason || 'не указана'}\n` +
    `Срок: ${until}\n` +
    `${byInfo}`
  );
});
// 📌 /userban — список всех заблокированных
bot.command('userban', async ctx => {
  if (!(await hasLevel(ctx.from.id, 3))) return ctx.reply('🚫 Нет доступа.');
  const data = await loadUsers();
  const banned = data.users.filter(u => u.ban?.status);

  if (banned.length === 0) return ctx.reply('✅ Список заблокированных пуст.');

  const lines = banned.map(u => {
    const until = u.ban.until
      ? `до ${format(new Date(u.ban.until), 'yyyy-MM-dd')}`
      : 'навсегда';
    return `• @${u.login || 'нет'} | ID: <code>${u.id}</code>\nПричина: ${u.ban.reason || 'не указана'}\nСрок: ${until}`;
  });

  ctx.replyWithHTML(`<b>📕 Заблокированные пользователи:</b>\n\n${lines.join('\n\n')}`);
});

async function fetchOnlineData() {
  const res = await fetch('http://launcher.hassle-games.com:3000/online.json');
  return await res.json();
}

function generateOnlineText(crmp) {
  let total = 0;
  let text = `S | R » Онлайн проекта "<a href="https://t.me/hassleonline"><b>RADMIR CR:MP</b></a>"\n\n`;
  for (const [id, server] of Object.entries(crmp)) {
    const sid = id.toString().padStart(2, '0');
    const players = server.players || 0;
    const bonus = server.bonus || 1;
    total += players;
    text += `${sid}. "<a href="https://t.me/hassleonline">SERVER ${sid}</a> <b>[x${bonus}]</b>", онлайн: <b>${players}</b>\n`;
  }
  text += `\n— Суммарный онлайн: <b>${total}</b>`;
  return text;
}

bot.command('online', async ctx => {
  if (!(await hasLevel(ctx.from.id, 1))) return ctx.reply('🚫 Нет доступа.');
  try {
    const data = await fetchOnlineData();
    const crmp = data.crmp_new;
    const message = generateOnlineText(crmp);
    await ctx.reply(message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  } catch (e) {
    console.error(e);
    ctx.reply('❌ Не удалось получить онлайн.');
  }
});


bot.command('clearsub', async (ctx) => {
  if (!(await hasLevel(ctx.from.id, 4))) return ctx.reply('🚫 Нет доступа.');

  const args = ctx.message.text.split(' ');
  if (args.length < 3) return ctx.reply('Использование: /clearsub <ID> <buy1|buy2>');

  const userId = Number(args[1]);
  const field = args[2];

  if (isNaN(userId)) return ctx.reply('❌ ID должен быть числом.');
  if (!['buy1', 'buy2'].includes(field)) return ctx.reply('❌ Поле должно быть buy1 или buy2.');

  const data = await loadUsers();
  const user = data.users.find(u => u.id === userId);

  if (!user) return ctx.reply('❌ Пользователь не найден.');

  user[field] = 0;
  await saveUsers(data);

  ctx.reply(`♻️ Подписка ${field} у пользователя ${user.login || user.id} удалена.`);
});

bot.command('users', async (ctx) => {
  if (!(await hasLevel(ctx.from.id, 4))) return ctx.reply('🚫 Нет доступа.');
  await sendUserPage(ctx, 1);
});

async function sendUserPage(ctx, page) {
  const perPage = 10;
  const data = await loadUsers();
  const totalUsers = data.users.length;
  const totalPages = Math.ceil(totalUsers / perPage);
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const start = (currentPage - 1) * perPage;
  const usersToShow = data.users.slice(start, start + perPage);

  let message = `📋 <b>Список пользователей (стр. ${currentPage}/${totalPages}):</b>\n\n`;

  usersToShow.forEach((user, i) => {
    const cheatDays = getRemainingDays(user.buy1);
    const lovlaDays = getRemainingDays(user.buy2);

    message += `👤 <b>${start + i + 1}</b>\n`;
    message += `• @${user.login || '—'}\n`;
    message += `• ID: <code>${user.id}</code>\n`;
    message += `• 🔑 Ключ: <code>${user.key}</code>\n`;
    message += `• 📦 Multi-Cheat: <b>${cheatDays} дней</b>\n`;
    message += `• 📦 Multi-Lovla: <b>${lovlaDays} дней</b>\n\n`;
  });

  const buttons = [];
  if (currentPage > 1) buttons.push(Markup.button.callback('◀️ Назад', `users_page_${currentPage - 1}`));
  if (currentPage < totalPages) buttons.push(Markup.button.callback('▶️ Далее', `users_page_${currentPage + 1}`));

  const keyboard = Markup.inlineKeyboard([buttons]).reply_markup;

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    await ctx.answerCbQuery();
  } else {
    await ctx.replyWithHTML(message, Markup.inlineKeyboard([buttons]));
  }
}


// 📤 Пользователь пишет сообщение → отправляется в группу
// Ответ менеджера в группе → отправка в ЛС пользователя
bot.on('message', (ctx) => {
  const user = ctx.from;
  const text = ctx.message.text;

  // Если пользователь в режиме поддержки
  if (userInSupport.has(user.id) && text && ctx.chat.type === 'private') {
    bot.telegram.sendMessage(
      SUPPORT_GROUP_ID,
      `📩 Вопрос от @${user.username || 'БезUsername'} (ID: ${user.id}):\n${text}`
    ).then((sentMessage) => {
      userSupportMessages.set(user.id, sentMessage.message_id);
    });
  }

  // 📥 Ответ менеджера в группе (реплай на сообщение с ID)
  if (ctx.chat.id === SUPPORT_GROUP_ID && ctx.message.reply_to_message) {
    const replyText = ctx.message.reply_to_message.text;
    const match = replyText?.match(/ID: (\d+)/);
    const response = ctx.message.text;

    if (match && response) {
      const targetUserId = Number(match[1]);
      bot.telegram.sendMessage(
        targetUserId,
        `📨 Ответ поддержки:\n\n${response}`
      );
    }
  }
});

bot.launch();
console.log('🤖 Бот запущен!');
