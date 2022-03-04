/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import {
  QuotaDecreases as LegacyQuotaDecreasesEvent,
  QuotaIncreases as LegacyQuotaIncreasesEvent
} from '../generated/DoubleDice/DoubleDice';
import {
  User
} from '../generated/schema';
import { loadOrCreateEntity } from './entities';

// ToDo: Drop before public release
export function handleLegacyQuotaIncreases(event: LegacyQuotaIncreasesEvent): void {
  const quotaIncreases = event.params.increases;
  for (let i = 0; i < quotaIncreases.length; i++) {
    const userId = quotaIncreases[i].creator.toHex();
    const user = loadOrCreateEntity<User>(User.load, userId);
    user.maxConcurrentVirtualFloors += quotaIncreases[i].amount;
    user.save();
  }
}

// ToDo: Drop before public release
export function handleLegacyQuotaDecreases(event: LegacyQuotaDecreasesEvent): void {
  const quotaDecreases = event.params.decreases;
  for (let i = 0; i < quotaDecreases.length; i++) {
    const userId = quotaDecreases[i].creator.toHex();
    const user = loadOrCreateEntity<User>(User.load, userId);
    user.maxConcurrentVirtualFloors -= quotaDecreases[i].amount;
    user.save();
  }
}
