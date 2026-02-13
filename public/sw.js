const CACHE_NAME = "accountability-tracker-v2";
const STATIC_ASSETS = ["/", "/manifest.json"];

// ─── Install — cache shell ──────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate — clean old caches + start scheduler ──────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
  // Start the background notification scheduler
  scheduleNextCheck();
});

// ─── Fetch — network first, fallback to cache ───────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.startsWith("chrome-extension://")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// ─── Push notification handler ──────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Accountability Tracker";
  const options = {
    body: data.body || "Time for a check-in!",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    tag: data.tag || "checkin",
    data: {
      url: data.url || "/checkin",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click — open the app ──────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/checkin";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// ─── Message handler — receive schedule + completion from app ─
let notifSchedule = null; // { morning: "07:00", midday: "13:00", evening: "21:00" }
let firedToday = {};      // { "morning:2025-02-11": true, ... }
let completionState = {   // Tracks which stacks are done today
  date: "",
  completedStacks: [],    // ["morning", "midday", "evening"]
  allDone: false,
};

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_SCHEDULE") {
    notifSchedule = event.data.schedule;
    // Reset fired tracking on new schedule
    firedToday = {};
    scheduleNextCheck();
  }

  if (event.data && event.data.type === "SET_COMPLETION") {
    completionState = {
      date: event.data.date,
      completedStacks: event.data.completedStacks || [],
      allDone: event.data.allDone || false,
    };
  }

  if (event.data && event.data.type === "PING") {
    // Keep-alive ping from the app — reschedule checks
    scheduleNextCheck();
  }
});

// ─── Background Notification Scheduler ──────────────────────
// Fallback schedule — only used before the app sends SET_SCHEDULE.
// Must match the defaults in store.ts UserSettings.checkinTimes.
// The app always syncs its real schedule on load, so this is
// just a safety net for the brief period before first sync.
const DEFAULT_SCHEDULE = {
  morning: "07:00",
  midday: "13:00",
  evening: "21:00",
};

// Stack-specific check-in messages
const CHECKIN_MESSAGES = {
  morning: {
    title: "Rise and execute \u{1F305}",
    body: "Morning stack is waiting. Prayer, Bible, Journal, Cold Exposure, Keystone Task. Let's go.",
  },
  midday: {
    title: "Afternoon check-in \u{2600}\u{FE0F}",
    body: "NSDR done? Deep work blocks logged? Tidy up? Quick update \u{1F4AA}",
  },
  evening: {
    title: "Evening wrap-up \u{1F319}",
    body: "Training, Reading, close out the day. Don't let it slip.",
  },
};

// Inspirational messages when all tasks are done
const CONGRATS_MESSAGES = [
  { title: "\u{1F3C6} Day conquered!", body: "All stacks done. You showed up and executed. Rest well tonight." },
  { title: "\u{2728} System held today", body: "Every habit logged. That's discipline, not motivation. Tomorrow, same energy." },
  { title: "\u{1F525} Perfect execution", body: "You did what you said you'd do. That's the person you're becoming." },
  { title: "\u{1F4AA} Nothing left undone", body: "The day is complete. You earned this moment of rest." },
  { title: "\u{1F31F} Identity shift in progress", body: "Another day of casting votes for who you want to be. Well done." },
  { title: "\u{1F3AF} All targets hit", body: "Tomorrow's a new challenge. Tonight, appreciate the discipline." },
];

const WARNING_11PM = {
  title: "\u{26A0}\u{FE0F} Day isn't logged yet",
  body: "It's 11 PM. Habits still unlogged. Don't let the day slip.",
};

let checkTimer = null;

function scheduleNextCheck() {
  if (checkTimer) clearTimeout(checkTimer);

  // Check every 55 seconds (just under 1 min to catch each minute)
  checkTimer = setTimeout(() => {
    checkAndNotify();
    scheduleNextCheck(); // Reschedule for next check
  }, 55 * 1000);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// Map schedule keys to stack names for completion checking
function getStackForTime(scheduleKey) {
  if (scheduleKey === "morning") return "morning";
  if (scheduleKey === "midday") return "midday";
  if (scheduleKey === "evening") return "evening";
  return scheduleKey;
}

function isStackComplete(stack) {
  const today = getToday();
  if (completionState.date !== today) return false;
  return completionState.completedStacks.includes(stack);
}

function isAllDoneToday() {
  const today = getToday();
  if (completionState.date !== today) return false;
  return completionState.allDone;
}

function getRandomCongrats() {
  return CONGRATS_MESSAGES[Math.floor(Math.random() * CONGRATS_MESSAGES.length)];
}

function checkAndNotify() {
  const schedule = notifSchedule || DEFAULT_SCHEDULE;
  const currentTime = getCurrentTime();
  const today = getToday();

  // Check each scheduled check-in
  for (const [stack, time] of Object.entries(schedule)) {
    const key = `${stack}:${today}`;

    // Fire if time matches and haven't fired yet today
    if (currentTime === time && !firedToday[key]) {
      const stackName = getStackForTime(stack);

      // If ALL stacks are done → send congratulatory message instead
      if (isAllDoneToday()) {
        const congrats = getRandomCongrats();
        self.registration.showNotification(congrats.title, {
          body: congrats.body,
          icon: "/icons/icon-192.svg",
          badge: "/icons/icon-192.svg",
          tag: `congrats-${stack}`,
          data: { url: "/" }, // Go to dashboard, not check-in
        });
        firedToday[key] = true;
        continue;
      }

      // If THIS stack is already complete → skip notification
      if (isStackComplete(stackName)) {
        firedToday[key] = true;
        continue;
      }

      // Stack not done → send normal check-in reminder
      const msg = CHECKIN_MESSAGES[stack];
      if (msg) {
        self.registration.showNotification(msg.title, {
          body: msg.body,
          icon: "/icons/icon-192.svg",
          badge: "/icons/icon-192.svg",
          tag: `checkin-${stack}`,
          data: { url: "/checkin" },
          requireInteraction: true,  // Stays visible until tapped
        });
        firedToday[key] = true;
      }
    }
  }

  // 11 PM warning — only if not all done
  const warningKey = `warning:${today}`;
  if (currentTime === "23:00" && !firedToday[warningKey]) {
    if (isAllDoneToday()) {
      // All done — send encouraging message instead of warning
      const congrats = getRandomCongrats();
      self.registration.showNotification(congrats.title, {
        body: congrats.body,
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
        tag: "end-of-day-congrats",
        data: { url: "/" },
      });
    } else {
      self.registration.showNotification(WARNING_11PM.title, {
        body: WARNING_11PM.body,
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
        tag: "end-of-day-warning",
        data: { url: "/checkin" },
        requireInteraction: true,
      });
    }
    firedToday[warningKey] = true;
  }

  // Clear fired tracking at midnight
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    firedToday = {};
    completionState = { date: "", completedStacks: [], allDone: false };
  }
}

// Start scheduler immediately on load
scheduleNextCheck();
