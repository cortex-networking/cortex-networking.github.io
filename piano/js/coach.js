// Adaptive coach (stub; full engine in progress). Modes call app.coach.record(type, info).
export class Coach {
  constructor(app) { this.app = app; this.log = []; }
  record(type, info = {}) { this.log.push({ type, ...info, at: Date.now() }); }
}
