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

// ─── Message handler — receive schedule from app ────────────
// The app sends schedule info via postMessage
let notifSchedule = null; // { morning: "07:00", midday: "13:00", evening: "21:00" }
let firedToday = {};      // { "morning:2025-02-11": true, ... }

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_SCHEDULE") {
    notifSchedule = event.data.schedule;
    // Reset fired tracking on new schedule
    firedToday = {};
    scheduleNextCheck();
  }

  if (event.data && event.data.type === "PING") {
    // Keep-alive ping from the app — reschedule checks
    scheduleNextCheck();
  }
});

// ─── Background Notification Scheduler ──────────────────────
// Default schedule if none received from app
const DEFAULT_SCHEDULE = {
  morning: "07:00",
  midday: "13:00",
  evening: "21:00",
};

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

function checkAndNotify() {
  const schedule = notifSchedule || DEFAULT_SCHEDULE;
  const currentTime = getCurrentTime();
  const today = getToday();

  // Check each scheduled check-in
  for (const [stack, time] of Object.entries(schedule)) {
    const key = `${stack}:${today}`;

    // Fire if time matches and haven't fired yet today
    if (currentTime === time && !firedToday[key]) {
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

  // 11 PM warning
  const warningKey = `warning:${today}`;
  if (currentTime === "23:00" && !firedToday[warningKey]) {
    self.registration.showNotification(WARNING_11PM.title, {
      body: WARNING_11PM.body,
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      tag: "end-of-day-warning",
      data: { url: "/checkin" },
      requireInteraction: true,
    });
    firedToday[warningKey] = true;
  }

  // Clear fired tracking at midnight
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    firedToday = {};
  }
}

// Start scheduler immediately on load
scheduleNextCheck();
