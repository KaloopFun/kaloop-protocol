// Synthetic register for the "everything announced" gate build. None of these are real.
import { register as base } from '../src/js/register.js';

export const FIXTURE = {
  address: '0xA1b2C3d4E5f60718293a4B5c6D7e8F9012345678',
  x: 'https://x.com/fixture_handle',
  github: 'https://github.com/fixture-org/fixture-repo',
};

export const register = {
  ...base,
  contract: { state: 'stated', value: FIXTURE.address },
  x: { state: 'stated', url: FIXTURE.x },
  github: { state: 'stated', url: FIXTURE.github },
};
