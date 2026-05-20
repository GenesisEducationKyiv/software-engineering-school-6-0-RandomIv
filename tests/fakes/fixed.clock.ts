import { ClockPort } from '../../src/application/ports/clock.port';
export class FixedClock implements ClockPort {
  constructor(private readonly value: Date = new Date('2026-01-01T00:00:00Z')) {}
  now(): Date { return this.value; }
}
