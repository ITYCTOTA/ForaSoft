const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
});

const COUNTERS = Object.freeze([
  "roomFull",
  "validationErrors",
  "socketConnects",
  "socketDisconnects",
  "relayErrors",
  "rateLimited",
]);

/** In-memory operational counters collected by Render from stdout/stderr. */
export class ServerObservability {
  constructor({
    registry,
    logLevel = "info",
    clock = () => new Date(),
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    stdout = console.info,
    stderr = console.error,
    intervalMs = 60_000,
  }) {
    this.registry = registry;
    this.logLevel = normalizeLevel(logLevel);
    this.clock = clock;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.stdout = stdout;
    this.stderr = stderr;
    this.intervalMs = intervalMs;
    this.counters = Object.fromEntries(COUNTERS.map((name) => [name, 0]));
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = this.setIntervalFn(
      () => this.writeSnapshot(),
      this.intervalMs,
    );
  }

  stop() {
    if (!this.timer) return;
    this.clearIntervalFn(this.timer);
    this.timer = null;
  }

  record(counter) {
    if (COUNTERS.includes(counter)) this.counters[counter] += 1;
  }

  error(code, counter) {
    if (counter) this.record(counter);
    this.#write("error", this.stderr, {
      event: "server_error",
      code: safeErrorCode(code),
    });
  }

  info(event) {
    this.#write("info", this.stdout, { event });
  }

  writeSnapshot() {
    this.#write("info", this.stdout, {
      event: "metrics",
      activeRooms: this.registry.roomCount,
      activeParticipants: this.registry.participantCount,
      counters: { ...this.counters },
    });
  }

  #write(level, output, fields) {
    if (LEVELS[level] < LEVELS[this.logLevel]) return;
    output(
      JSON.stringify({
        timestamp: this.clock().toISOString(),
        level,
        ...fields,
      }),
    );
  }
}

function normalizeLevel(value) {
  const level = typeof value === "string" ? value.toLowerCase() : "";
  return level in LEVELS ? level : "info";
}

function safeErrorCode(code) {
  return typeof code === "string" && /^[A-Z_]{1,64}$/.test(code)
    ? code
    : "INTERNAL_ERROR";
}
