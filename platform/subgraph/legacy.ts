/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import { BigInt } from '@graphprotocol/graph-ts';
import {
  QuotaDecreases as LegacyQuotaDecreasesEvent,
  QuotaIncreases as LegacyQuotaIncreasesEvent,
  VirtualFloorCreation as LegacyVirtualFloorCreation
} from '../generated/DoubleDice/DoubleDice';
import {
  Category,
  Opponent,
  Outcome,
  ResultSource,
  Subcategory,
  User,
  VirtualFloor
} from '../generated/schema';
import { SET_WINDOW_DURATION } from './constants';
import {
  createNewEntity,
  loadExistentEntity,
  loadOrCreateEntity,
} from './entities';
import { decodeMetadata } from './metadata';
import { toDecimal } from './utils';

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


// Pre-bonusAmount
export function handleLegacyVirtualFloorCreation(event: LegacyVirtualFloorCreation): void {

  const metadata = decodeMetadata(event.params.metadata);

  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const category = metadata.category;
    const subcategory = metadata.subcategory;

    const categoryId = category;
    {
      const categoryEntity = loadOrCreateEntity<Category>(Category.load, categoryId);
      /* if (isNew) */ {
        categoryEntity.slug = category;
        categoryEntity.save();
      }
    }

    const subcategoryId = `${category}-${subcategory}`;
    {
      const subcategoryEntity = loadOrCreateEntity<Subcategory>(Subcategory.load, subcategoryId);
      /* if (isNew) */ {
        subcategoryEntity.category = categoryId;
        subcategoryEntity.slug = subcategory;
        subcategoryEntity.save();
      }
    }

    const $ = createNewEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);

    $.subcategory = subcategoryId;
    $.title = metadata.title;
    $.description = metadata.description;
    $.isListed = metadata.isListed;
    $.discordChannelId = metadata.discordChannelId;

    const userId = event.params.creator.toHex();
    {
      loadOrCreateEntity<User>(User.load, userId);
    }
    $.owner = userId;

    {
      const user = loadExistentEntity<User>(User.load, userId);
      user.concurrentVirtualFloors += BigInt.fromI32(+1);
      user.save();
    }

    // Since the platform contract will reject VirtualFloors created with a PaymentToken that is not whitelisted,
    // we are sure that the PaymentToken entity referenced here will have always been created beforehand
    // when the token was originally whitelisted.
    $.paymentToken = event.params.paymentToken.toHex();

    $.betaOpen = toDecimal(event.params.betaOpen_e18);
    $.creationFeeRate = toDecimal(event.params.creationFeeRate_e18);
    $.platformFeeRate = toDecimal(event.params.platformFeeRate_e18);
    $.tCreated = event.block.timestamp;
    $.tOpen = event.params.tOpen;
    $.tClose = event.params.tClose;
    $.tResolve = event.params.tResolve;
    $.tResultSetMin = event.params.tResolve;
    $.tResultSetMax = event.params.tResolve + SET_WINDOW_DURATION; // ToDo: Include this as event param tResultSetMax
    $.state = 'RUNNING_OR_CLOSED__RESULT_NONE';

    $.save();
  }

  {
    const opponents = metadata.opponents;
    for (let opponentIndex = 0; opponentIndex < opponents.titles.length; opponentIndex++) {
      const opponentId = `${virtualFloorId}-${opponentIndex}`;
      {
        const $ = createNewEntity<Opponent>(Opponent.load, opponentId);
        $.virtualFloor = virtualFloorId;
        $.title = opponents.titles[opponentIndex];
        $.image = opponents.images[opponentIndex];
        $.save();
      }
    }
  }

  {
    const resultSources = metadata.resultSources;
    for (let resultSourceIndex = 0; resultSourceIndex < resultSources.titles.length; resultSourceIndex++) {
      const resultSourceId = `${virtualFloorId}-${resultSourceIndex}`;
      {
        const $ = createNewEntity<ResultSource>(ResultSource.load, resultSourceId);
        $.virtualFloor = virtualFloorId;
        $.title = resultSources.titles[resultSourceIndex];
        $.url = resultSources.urls[resultSourceIndex];
        $.save();
      }
    }
  }

  {
    const outcomes = metadata.outcomes;
    assert(
      outcomes.titles.length == event.params.nOutcomes,
      `outcomeValues.length = ${outcomes.titles.length.toString()} != event.params.nOutcomes = ${event.params.nOutcomes.toString()}`
    );
    for (let outcomeIndex = 0; outcomeIndex < event.params.nOutcomes; outcomeIndex++) {
      const outcomeId = `${virtualFloorId}-${outcomeIndex}`;
      {
        const $ = createNewEntity<Outcome>(Outcome.load, outcomeId);
        $.virtualFloor = virtualFloorId;
        $.title = outcomes.titles[outcomeIndex];
        $.index = outcomeIndex;
        $.save();
      }
    }
  }
}
