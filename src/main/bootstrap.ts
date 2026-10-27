import { hostStartupTiming } from './core/host-startup-timing';

// Start before the main module's imports and synchronous settings load.
hostStartupTiming.phase('modules', () => require('./index'));
