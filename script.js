const defaults = {
  salary: 0, workdays: 22, start: "09:00", end: "18:00",
  breakStart: "12:00", breakEnd: "13:00", weekdays: [1, 2, 3, 4, 5],
  payday: 10, overtimeRate: 0, itemName: "奶茶", itemPrice: 18, theme: "default"
};
const inputIds = ["salary", "workdays", "start", "end", "breakStart", "breakEnd", "payday", "overtimeRate", "itemName", "itemPrice"];
let settings = { ...defaults };
let slack = { date: "", accumulatedMs: 0, startedAt: null };
let overtime = { date: "", accumulatedMs: 0, startedAt: null };
let latestReport = null;
let privacyHidden = false;
const themes = ["default", "gold", "berry", "sky"];
const themeNames = { default: "牛马绿", gold: "发财金", berry: "周五粉", sky: "摸鱼蓝" };
const phraseStarts = ["今天的每一步，","你认真投入的时间，","看似普通的这一天，","此刻积累的每一点，","你完成的每件小事，","那些没有被看见的努力，","今天稳稳前进的你，","愿你忙碌的日子里，","别小看现在的坚持，","正在倒数的时间，","你对生活的认真，","今天做出的每个选择，","哪怕只是前进一点点，","你安静积攒的力量，","这段努力工作的时光，","愿此刻专注的你，","今天克服的小困难，","你踏实走过的路，","此刻账户增长的数字，","每一个认真收尾的今天，"];
const phraseEnds = ["都在为未来积攒底气。","终会变成属于你的收获。","会在合适的时候给你答案。","都值得被温柔地肯定。","正在把目标一点点拉近。","会让明天的你感谢今天。","也在悄悄拓宽人生的选择。","都会成为更好生活的伏笔。","终将汇成向前的力量。","正在见证你稳定地成长。","都算数，也都有意义。","会替你照亮下一段路。","正在兑换成真实的自由。","值得一个轻松自在的夜晚。","也别忘了给自己一点掌声。","会让好运更容易找到你。","都在证明你比想象中强大。","正带你靠近想要的生活。","都会成为未来的安全感。"];
function dailyPhrase(date) {
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000) - 1;
  const index = (day + date.getFullYear() * 73) % (phraseStarts.length * phraseEnds.length);
  return phraseStarts[index % phraseStarts.length] + phraseEnds[Math.floor(index / phraseStarts.length) % phraseEnds.length];
}

function storageGet(key) {
  try { return localStorage.getItem(key) || sessionStorage.getItem(key); } catch { try { return sessionStorage.getItem(key); } catch { return null; } }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
  try { sessionStorage.setItem(key, value); } catch {}
}
privacyHidden = storageGet("offwork-privacy") === "1";
const savedSettingsRaw = storageGet("offwork-settings");
try { settings = { ...defaults, ...JSON.parse(savedSettingsRaw || "{}") }; } catch {}
try { slack = { ...slack, ...JSON.parse(storageGet("offwork-slack") || "{}") }; } catch {}
try { overtime = { ...overtime, ...JSON.parse(storageGet("offwork-overtime") || "{}") }; } catch {}

const todayKey = date => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
if (slack.date !== todayKey(new Date())) slack = { date: todayKey(new Date()), accumulatedMs: 0, startedAt: null };
if (overtime.date !== todayKey(new Date())) overtime = { date: todayKey(new Date()), accumulatedMs: 0, startedAt: null };

for (const id of inputIds) {
  const input = document.getElementById(id);
  input.value = id === "salary" && !savedSettingsRaw ? "" : settings[id];
  input.addEventListener("input", () => {
    settings[id] = ["start", "end", "breakStart", "breakEnd", "itemName"].includes(id) ? input.value : Math.max(0, Number(input.value));
    saveSettings();
    update();
  });
}

document.querySelectorAll("#weekdayOptions input").forEach(input => {
  input.checked = settings.weekdays.includes(Number(input.value));
  input.addEventListener("change", () => {
    settings.weekdays = [...document.querySelectorAll("#weekdayOptions input:checked")].map(item => Number(item.value));
    saveSettings();
    update();
  });
});
document.getElementById("settings").addEventListener("submit", event => event.preventDefault());
document.getElementById("slackToggle").addEventListener("click", toggleSlack);
document.getElementById("slackReset").addEventListener("click", () => {
  slack = { date: todayKey(new Date()), accumulatedMs: 0, startedAt: null };
  saveSlack();
  update();
});
document.getElementById("overtimeToggle").addEventListener("click", toggleOvertime);
document.getElementById("overtimeReset").addEventListener("click", () => {
  overtime = { date: todayKey(new Date()), accumulatedMs: 0, startedAt: null };
  saveOvertime(); update();
});
document.getElementById("themeToggle").addEventListener("click", () => {
  settings.theme = themes[(themes.indexOf(settings.theme) + 1) % themes.length];
  applyTheme(); saveSettings();
});
document.getElementById("privacyToggle").addEventListener("click", togglePrivacy);
document.addEventListener("keydown", event => {
  if (event.altKey && event.key.toLowerCase() === "h") { event.preventDefault(); togglePrivacy(); }
});
document.getElementById("shareImage").addEventListener("click", saveReportImage);
document.getElementById("copyReport").addEventListener("click", copyReport);

function saveSettings() { storageSet("offwork-settings", JSON.stringify(settings)); }
function saveSlack() { storageSet("offwork-slack", JSON.stringify(slack)); }
function saveOvertime() { storageSet("offwork-overtime", JSON.stringify(overtime)); }
function applyTheme() {
  if (settings.theme === "default") delete document.body.dataset.theme;
  else document.body.dataset.theme = settings.theme;
  document.getElementById("themeToggle").textContent = `主题：${themeNames[settings.theme] || themeNames.default}`;
}
function applyPrivacy() {
  document.body.classList.toggle("privacy-mode", privacyHidden);
  const button = document.getElementById("privacyToggle");
  button.textContent = privacyHidden ? "显示薪资" : "一键隐藏";
  button.title = "快捷键：Alt + H";
}
function togglePrivacy() {
  privacyHidden = !privacyHidden;
  storageSet("offwork-privacy", privacyHidden ? "1" : "0");
  applyPrivacy(); update();
}
const money = value => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const pad = value => String(Math.max(0, Math.floor(value))).padStart(2, "0");
const formatDuration = milliseconds => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${pad(seconds / 3600)}:${pad(seconds % 3600 / 60)}:${pad(seconds % 60)}`;
};

function timeToday(value, base) {
  const [hours, minutes] = value.split(":").map(Number);
  const result = new Date(base);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result;
}

function overlapMs(rangeStart, rangeEnd, pauseStart, pauseEnd) {
  return Math.max(0, Math.min(rangeEnd, pauseEnd) - Math.max(rangeStart, pauseStart));
}

function nextPayday(now) {
  const build = (year, month) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(Math.max(1, settings.payday), lastDay));
  };
  let target = build(now.getFullYear(), now.getMonth());
  target.setHours(23, 59, 59, 999);
  if (target < now) target = build(now.getFullYear(), now.getMonth() + 1);
  return Math.max(0, Math.ceil((target - now) / 86400000));
}

function completedWorkdays(now) {
  let count = 0;
  for (let day = 1; day < now.getDate(); day += 1) {
    if (settings.weekdays.includes(new Date(now.getFullYear(), now.getMonth(), day).getDay())) count += 1;
  }
  return count;
}

function toggleSlack() {
  const now = Date.now();
  if (slack.startedAt) {
    slack.accumulatedMs += Math.max(0, now - slack.startedAt);
    slack.startedAt = null;
  } else {
    slack.date = todayKey(new Date());
    slack.startedAt = now;
  }
  saveSlack();
  update();
}

function toggleOvertime() {
  const now = new Date();
  const end = timeToday(settings.end, now);
  if (now < end || !settings.weekdays.includes(now.getDay())) return;
  if (settings.overtimeRate <= 0) {
    settings.overtimeRate = 1.5;
    document.getElementById("overtimeRate").value = "1.5";
    saveSettings();
  }
  if (overtime.startedAt) {
    overtime.accumulatedMs += Math.max(0, Date.now() - overtime.startedAt);
    overtime.startedAt = null;
  } else {
    overtime.date = todayKey(now);
    overtime.startedAt = Date.now();
  }
  saveOvertime(); update();
}

function reportText() {
  if (!latestReport) return "";
  return `【薪动时刻】今日已赚 ${money(latestReport.earned)}，工作进度 ${latestReport.progress.toFixed(1)}%，相当于 ${latestReport.items.toFixed(1)} 个${settings.itemName || "小目标"}。${latestReport.timeText}。`;
}

async function copyReport() {
  const text = reportText();
  try { await navigator.clipboard.writeText(text); }
  catch {
    const area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
  }
  const button = document.getElementById("copyReport"); button.textContent = "已复制"; setTimeout(() => button.textContent = "复制文字", 1500);
}

function showReportPreview(url, filename) {
  const modal = document.createElement("div"); modal.className = "report-modal";
  const card = document.createElement("div"); card.className = "report-modal-card";
  const title = document.createElement("strong"); title.textContent = "战报已生成";
  const tip = document.createElement("p"); tip.textContent = "点击下载图片；手机也可以长按下方图片保存。";
  const image = document.createElement("img"); image.src = url; image.alt = "今日上班战报";
  const actions = document.createElement("div"); actions.className = "button-row";
  const download = document.createElement("a"); download.className = "download-button"; download.download = filename; download.href = url; download.target = "_blank"; download.textContent = "下载图片";
  const close = document.createElement("button"); close.type = "button"; close.className = "ghost"; close.textContent = "关闭";
  close.addEventListener("click", () => modal.remove());
  actions.append(download, close); card.append(title, tip, image, actions); modal.append(card); document.body.append(modal);
}

function saveReportImage() {
  if (!latestReport) return;
  const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#171913"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#d9ff43"; ctx.fillRect(70, 80, 940, 1190);
  ctx.fillStyle = "#ff6e9d"; ctx.fillRect(70, 80, 940, 32);
  ctx.fillStyle = "#171913"; ctx.font = "900 52px Microsoft YaHei"; ctx.fillText("薪动时刻 · 今日上班战报", 130, 220);
  ctx.font = "700 28px Microsoft YaHei"; ctx.fillText(new Date().toLocaleDateString("zh-CN", { year:"numeric", month:"long", day:"numeric", weekday:"long" }), 130, 280);
  ctx.font = "800 34px Microsoft YaHei"; ctx.fillText("今天已经赚到", 130, 430);
  ctx.font = "900 112px Arial"; ctx.fillText(money(latestReport.earned), 130, 565);
  ctx.fillStyle = "#ff6e9d"; ctx.fillRect(130, 640, Math.max(8, 820 * latestReport.progress / 100), 34);
  ctx.strokeStyle = "#171913"; ctx.lineWidth = 4; ctx.strokeRect(130, 640, 820, 34);
  ctx.fillStyle = "#171913"; ctx.font = "800 32px Microsoft YaHei"; ctx.fillText(`今日工作进度 ${latestReport.progress.toFixed(1)}%`, 130, 740);
  ctx.fillText(`≈ ${latestReport.items.toFixed(1)} 个${settings.itemName || "小目标"}`, 130, 815);
  ctx.fillText(`摸鱼收入 ${money(latestReport.slackPay)}`, 130, 890);
  ctx.font = "700 28px Microsoft YaHei"; ctx.fillText(dailyPhrase(new Date()), 130, 1060);
  ctx.font = "700 24px Arial"; ctx.fillText("salary-countdown · 数据仅保存在本机", 130, 1180);
  const filename = `薪动时刻-${todayKey(new Date())}.png`;
  showReportPreview(canvas.toDataURL("image/png"), filename);
}

function update() {
  const now = new Date();
  if (slack.date !== todayKey(now)) slack = { date: todayKey(now), accumulatedMs: 0, startedAt: null };
  if (overtime.date !== todayKey(now)) overtime = { date: todayKey(now), accumulatedMs: 0, startedAt: null };
  const start = timeToday(settings.start, now);
  const end = timeToday(settings.end, now);
  const breakStart = timeToday(settings.breakStart, now);
  const breakEnd = timeToday(settings.breakEnd, now);
  const validShift = end > start;
  const validBreak = validShift && breakEnd > breakStart && breakStart < end && breakEnd > start;
  const shiftMs = validShift ? end - start : 0;
  const breakMs = validBreak ? overlapMs(start, end, breakStart, breakEnd) : 0;
  const paidShiftMs = Math.max(1, shiftMs - breakMs);
  const isWorkday = settings.weekdays.includes(now.getDay());
  const rawElapsedMs = validShift ? Math.min(shiftMs, Math.max(0, now - start)) : 0;
  const elapsedBreakMs = validBreak ? overlapMs(start, new Date(Math.min(now, end)), breakStart, breakEnd) : 0;
  const paidElapsedMs = isWorkday ? Math.max(0, rawElapsedMs - elapsedBreakMs) : 0;
  const dayPay = settings.workdays > 0 ? settings.salary / settings.workdays : 0;
  const hourPay = validShift ? dayPay / (paidShiftMs / 3600000) : 0;
  const overtimeMs = isWorkday && validShift ? overtime.accumulatedMs + (overtime.startedAt ? Math.max(0, Date.now() - overtime.startedAt) : 0) : 0;
  const overtimePay = hourPay * settings.overtimeRate * overtimeMs / 3600000;
  const earnedBase = validShift && isWorkday ? (now >= end ? dayPay : dayPay * Math.min(1, paidElapsedMs / paidShiftMs)) : 0;
  const earned = earnedBase + overtimePay;
  const progress = validShift && isWorkday ? Math.min(100, paidElapsedMs / paidShiftMs * 100) : 0;
  const beforeWork = isWorkday && now < start;
  const afterWork = isWorkday && validShift && now >= end;
  const inBreak = isWorkday && validBreak && now >= breakStart && now < breakEnd;
  const countdownMs = beforeWork ? start - now : Math.max(0, end - now);
  const totalSeconds = Math.floor(countdownMs / 1000);
  const resting = !isWorkday;

  document.getElementById("today").textContent = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  document.getElementById("status").textContent = resting ? "今天不用上班" : afterWork ? (overtime.startedAt ? "加班正在计费" : "今天辛苦了，收工！") : beforeWork ? "距离上班还有" : inBreak ? "午休中，距离下班还有" : "距离下班还有";
  document.getElementById("hours").textContent = pad(totalSeconds / 3600);
  document.getElementById("minutes").textContent = pad(totalSeconds % 3600 / 60);
  document.getElementById("seconds").textContent = pad(totalSeconds % 60);
  document.getElementById("countdown").hidden = resting || afterWork;
  document.getElementById("done").hidden = !(resting || afterWork);
  document.getElementById("done").innerHTML = resting ? "DAY<br>OFF" : "OFF<br>WORK!";
  document.getElementById("progressText").textContent = progress.toFixed(1) + "%";
  document.getElementById("progressBar").style.width = progress + "%";
  document.getElementById("dailyPhrase").textContent = dailyPhrase(now);
  document.getElementById("pepTalk").textContent = resting ? "今天是休息日，好好享受自己的时间。" : afterWork ? (overtime.startedAt ? "加班也要记得照顾好自己。" : "下班后的时间，才真正属于你。") : beforeWork ? "先喝杯水，准备开启新的一天。" : inBreak ? "午休时间，先安心吃饭。" : "再坚持一下，每一秒都有回报。";
  document.getElementById("earned").textContent = money(earned);
  document.getElementById("perSecond").textContent = inBreak || resting || (afterWork && !overtime.startedAt) ? "当前暂停计薪" : "+ " + money((afterWork ? hourPay * settings.overtimeRate : hourPay) / 3600) + " / 秒";
  document.getElementById("hourPay").textContent = money(hourPay);
  document.getElementById("dayPay").textContent = money(dayPay);
  document.getElementById("overtimePay").textContent = money(overtimePay);

  const pastDays = completedWorkdays(now);
  const monthEarned = pastDays * dayPay + (isWorkday ? earned : 0);
  const monthProgress = settings.salary > 0 ? Math.min(100, monthEarned / settings.salary * 100) : 0;
  document.getElementById("monthName").textContent = `${now.getMonth() + 1} 月已经赚到`;
  document.getElementById("monthEarned").textContent = money(monthEarned);
  document.getElementById("monthProgressText").textContent = monthProgress.toFixed(1) + "%";
  document.getElementById("monthProgressBar").style.width = monthProgress + "%";
  document.getElementById("workedDays").textContent = `${pastDays + (isWorkday && progress >= 100 ? 1 : 0)} / ${settings.workdays} 天`;
  const daysToPayday = nextPayday(now);
  document.getElementById("paydayCountdown").textContent = daysToPayday === 0 ? "就是今天！" : `${daysToPayday} 天`;
  document.getElementById("monthForecast").textContent = money(settings.salary + overtimePay);

  document.getElementById("overtimeTime").textContent = formatDuration(overtimeMs);
  document.getElementById("overtimeRateText").textContent = settings.overtimeRate > 0 ? `${settings.overtimeRate} 倍` : "未开启";
  document.getElementById("overtimeHint").textContent = !afterWork ? "到下班时间后，点击按钮开始计算加班收入。" : overtime.startedAt ? `正在以 ${money(hourPay * settings.overtimeRate)} / 小时累计` : overtimeMs > 0 ? "本次加班已暂停，可以继续或清零。" : "基础日薪已经锁定，点击按钮开始记录加班。";
  document.getElementById("overtimeToggle").disabled = !afterWork;
  document.getElementById("overtimeToggle").textContent = !afterWork ? "下班后可开启" : overtime.startedAt ? "结束加班" : overtimeMs > 0 ? "继续加班" : "开始加班";

  const slackMs = slack.accumulatedMs + (slack.startedAt ? Math.max(0, Date.now() - slack.startedAt) : 0);
  document.getElementById("slackTime").textContent = formatDuration(slackMs);
  document.getElementById("slackPay").textContent = money(hourPay * slackMs / 3600000);
  document.getElementById("slackToggle").textContent = slack.startedAt ? "暂停摸鱼" : slackMs > 0 ? "继续摸鱼" : "开始摸鱼";

  const itemPrice = Math.max(0.01, Number(settings.itemPrice) || 0.01);
  const items = earned / itemPrice;
  document.getElementById("buyingPower").textContent = `${items.toFixed(1)} 个${settings.itemName || "小目标"}`;
  const itemRemainder = earned % itemPrice === 0 ? itemPrice : itemPrice - earned % itemPrice;
  document.getElementById("nextItemTime").textContent = hourPay > 0 ? formatDuration(itemRemainder / hourPay * 3600000) : "—";
  document.getElementById("buyingHint").textContent = `按每个 ${money(itemPrice)} 计算，把抽象的工资换成看得见的收获。`;
  const timeText = resting ? "今天是休息日" : afterWork ? (overtime.startedAt ? "加班收入正在累计" : "今天已经下班") : beforeWork ? `距离上班还有 ${formatDuration(start - now)}` : `距离下班还有 ${formatDuration(Math.max(0, end - now))}`;
  latestReport = { earned, progress, items, slackPay: hourPay * slackMs / 3600000, timeText };
  document.getElementById("sharePreview").textContent = `今日已赚 ${money(earned)} · 今日进度 ${progress.toFixed(1)}% · ${timeText}（实时更新）`;
}

applyTheme();
applyPrivacy();
update();
setInterval(update, 1000);

