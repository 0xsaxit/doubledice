/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import {
  Address,
  BigDecimal,
  BigInt,
  log
} from '@graphprotocol/graph-ts';
import {
  PaymentTokenWhitelistUpdate as PaymentTokenWhitelistUpdateEvent,
  QuotaDecreases as QuotaDecreasesEvent,
  QuotaIncreases as QuotaIncreasesEvent,
  TransferSingle as TransferSingleEvent,
  UserCommitment as UserCommitmentEvent,
  VirtualFloorCancellationFlagged as VirtualFloorCancellationFlaggedEvent,
  VirtualFloorCancellationUnresolvable as VirtualFloorCancellationUnresolvableEvent,
  VirtualFloorCreation as VirtualFloorCreationEvent,
  VirtualFloorResolution as VirtualFloorResolutionEvent
} from '../generated/DoubleDice/DoubleDice';
import {
  IERC20Metadata
} from '../generated/DoubleDice/IERC20Metadata';
import {
  Category,
  Opponent,
  Outcome,
  OutcomeTimeslot,
  OutcomeTimeslotTransfer,
  PaymentToken,
  ResultSource,
  Subcategory,
  Timeslot,
  User,
  UserOutcome,
  UserOutcomeTimeslot,
  VirtualFloor,
  VirtualFloorTimeslot
} from '../generated/schema';
import { decodeMetadata } from './metadata';

const toDecimal = (wei: BigInt): BigDecimal => wei.divDecimal(new BigDecimal(BigInt.fromU32(10).pow(18)));

const paymentTokenAmountToBigDecimal = (wei: BigInt, decimals: i32): BigDecimal => wei.divDecimal(new BigDecimal(BigInt.fromU32(10).pow(u8(decimals))));

// Mirrors DoubleDice.sol#TIMESLOT_DURATION
const TIMESLOT_DURATION = 60;

interface Entity {
  save(): void
}

type LoadEntity<T> = (id: string) => T | null

function createNewEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  if (entity !== null) {
    throw new Error('createNewEntity: Was not expecting the entity to already exist');
  }
  entity = instantiate<T>(id);
  entity.save();
  return entity;
}

function loadExistentEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  const entity = load(id);
  if (entity === null) {
    throw new Error('loadExistentEntity: Was expecting entity to already exist');
  }
  return entity;
}

// ToDo: Ideally this would return { entity, isNew },
// so that caller could use isNew to run some code only the first time.
function loadOrCreateEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  if (entity === null) {
    entity = instantiate<T>(id);
    entity.save();
  }
  return entity;
}

/**
 * It doesn't matter whether this token is being enabled or disabled, we are only using it to discover
 * new ERC-20 payment tokens that might later be used in virtual-floors.
 */
export function handlePaymentTokenWhitelistUpdate(event: PaymentTokenWhitelistUpdateEvent): void {
  const paymentTokenId = event.params.token.toHex();
  {
    const $ = loadOrCreateEntity<PaymentToken>(PaymentToken.load, paymentTokenId);
    /* if (isNew) */ {
      const paymentTokenContract = IERC20Metadata.bind(event.params.token);
      $.address = event.params.token;
      $.name = paymentTokenContract.name();
      $.symbol = paymentTokenContract.symbol();
      $.decimals = paymentTokenContract.decimals();
      $.save();
    }
  }
}


export function handleVirtualFloorCreation(event: VirtualFloorCreationEvent): void {

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
    $.state = 'RUNNING_OR_CLOSED';

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

export function handleUserCommitment(event: UserCommitmentEvent): void {
  let amount: BigDecimal;
  const timeslotMinTimestamp = event.params.timeslot;

  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, $.paymentToken);
    amount = paymentTokenAmountToBigDecimal(event.params.amount, paymentToken.decimals);

    $.totalSupply += amount;
    $.save();
  }

  const beta = toDecimal(event.params.beta_e18);

  const outcomeId = `${virtualFloorId}-${event.params.outcomeIndex}`;
  {
    const $ = loadExistentEntity<Outcome>(Outcome.load, outcomeId);
    $.totalSupply += amount;
    $.totalWeightedSupply += beta * amount;
    $.save();
  }

  const timeslotId = timeslotMinTimestamp.toHex(); // ToDo: To 32 bytes
  {
    const $ = loadOrCreateEntity<Timeslot>(Timeslot.load, timeslotId);
    /* if (isNew) */ {
      $.minTimestamp = timeslotMinTimestamp;
      $.maxTimestamp = timeslotMinTimestamp + BigInt.fromU32(TIMESLOT_DURATION - 1);
      $.save();
    }
  }

  const virtualFloorTimeslotId = `${virtualFloorId}-${timeslotId}`;
  {
    const $ = loadOrCreateEntity<VirtualFloorTimeslot>(VirtualFloorTimeslot.load, virtualFloorTimeslotId);
    /* if (isNew) */ {
      $.virtualFloor = virtualFloorId;
      $.timeslot = timeslotId;
      $.save();
    }
  }

  const outcomeTimeslotId = event.params.tokenId.toHex(); // ToDo: To 32 bytes
  {
    const $ = loadOrCreateEntity<OutcomeTimeslot>(OutcomeTimeslot.load, outcomeTimeslotId);
    /* if (isNew) */ {
      $.outcome = outcomeId;
      $.timeslot = timeslotId;
      $.beta = beta;
    }
    $.totalSupply += amount;
    $.save();
  }

  // ToDo: Is this necessary?
  const nobodyId = Address.zero().toHex();
  {
    loadOrCreateEntity<User>(User.load, nobodyId);
  }

  // Note: We use an explicit `committer` param rather than relying on the underlying `event.transaction.from`
  // as if the transaction were being relayed by a 3rd party,
  // the commitment would be mistakenly attributed to the relayer.
  const userId = event.params.committer.toHex();
  {
    loadOrCreateEntity<User>(User.load, userId);
  }

  const userOutcomeId = `${outcomeId}-${userId}`;
  {
    const $ = loadOrCreateEntity<UserOutcome>(UserOutcome.load, userOutcomeId);
    /* if (isNew) */ {
      $.user = userId;
      $.outcome = outcomeId;
    }
    $.totalBalance += amount;
    $.totalWeightedBalance += beta * amount;
    $.save();
  }

  const userOutcomeTimeslotId = `${outcomeTimeslotId}-${userId}`;
  {
    const $ = loadOrCreateEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, userOutcomeTimeslotId);
    /* if (isNew) */ {
      $.user = userId;
      $.outcome = outcomeId;
      $.timeslot = timeslotId;
      $.outcomeTimeslot = outcomeTimeslotId;
    }
    $.balance += amount;
    $.save();
  }

  const postOfEventInTx = event.transactionLogIndex;
  const outcomeTimeslotTransferId = `${outcomeTimeslotId}-${event.transaction.hash.toHex()}-${postOfEventInTx}`;
  {
    const $ = createNewEntity<OutcomeTimeslotTransfer>(OutcomeTimeslotTransfer.load, outcomeTimeslotTransferId);
    $.outcomeTimeslot = outcomeTimeslotId;
    $.from = nobodyId;
    $.to = userId;
    $.timestamp = event.block.timestamp;
    // $.logIndex = event.logIndex.toI32();
    $.amount = amount;
    $.save();
  }
}

export function handleTransferSingle(event: TransferSingleEvent): void {

  if (event.params.id.bitAnd(BigInt.fromU64(0xffffffffff)).equals(BigInt.zero())) {
    log.warning(
      'Ignoring TransferSingle(id={}) because token is tracking virtual-floor ownership, and transfers of this token-type are not yet handled',
      [event.params.id.toHex()]
    );
    return;
  }

  if (event.params.from.equals(Address.zero()) || event.params.to.equals(Address.zero())) {
    log.warning(
      'Ignoring TransferSingle(id={}, from={}, to={}) because it is mint or burn',
      [event.params.id.toHex(), event.params.from.toHex(), event.params.to.toHex()]
    );
    return;
  }

  let amount: BigDecimal;

  let beta: BigDecimal;
  let outcomeId: string;
  const outcomeTimeslotId = event.params.id.toHex();
  {
    const outcomeTimeslot = loadExistentEntity<OutcomeTimeslot>(OutcomeTimeslot.load, outcomeTimeslotId);
    outcomeId = outcomeTimeslot.outcome;
    const outcome = loadExistentEntity<Outcome>(Outcome.load, outcomeId);
    const virtualFloor = loadExistentEntity<VirtualFloor>(VirtualFloor.load, outcome.virtualFloor);
    const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, virtualFloor.paymentToken);
    amount = paymentTokenAmountToBigDecimal(event.params.value, paymentToken.decimals);
    beta = outcomeTimeslot.beta;
  }

  const fromUserId = event.params.from.toHex();
  {
    loadOrCreateEntity<User>(User.load, fromUserId);
  }

  const toUserId = event.params.to.toHex();
  {
    loadOrCreateEntity<User>(User.load, toUserId);
  }

  const toUserOutcomeTimeslotId = `${outcomeTimeslotId}-${toUserId}`;
  {
    const $ = loadExistentEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, toUserOutcomeTimeslotId);
    $.balance -= amount;
    $.save();
  }

  const fromUserOutcomeTimeslotId = `${outcomeTimeslotId}-${fromUserId}`;
  {
    const $ = loadExistentEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, fromUserOutcomeTimeslotId);
    $.balance += amount;
    $.save();
  }

  const postOfEventInTx = event.transactionLogIndex;
  const outcomeTimeslotTransferId = `${outcomeTimeslotId}-${event.transaction.hash.toHex()}-${postOfEventInTx}`;
  {
    const $ = createNewEntity<OutcomeTimeslotTransfer>(OutcomeTimeslotTransfer.load, outcomeTimeslotTransferId);
    $.outcomeTimeslot = outcomeTimeslotId;
    $.from = event.params.from.toHex();
    $.to = event.params.to.toHex();
    $.timestamp = event.block.timestamp;
    // $.logIndex = event.logIndex.toI32();
    $.amount = amount;
    $.save();
  }


  const fromUserOutcomeId = `${outcomeId}-${fromUserId}`;
  {
    const $ = loadExistentEntity<UserOutcome>(UserOutcome.load, fromUserOutcomeId);
    $.totalBalance -= amount;
    $.totalWeightedBalance -= beta * amount;
    $.save();
  }

  const toUserOutcomeId = `${outcomeId}-${toUserId}`;
  {
    const $ = loadExistentEntity<UserOutcome>(UserOutcome.load, toUserOutcomeId);
    $.totalBalance += amount;
    $.totalWeightedBalance += beta * amount;
    $.save();
  }
}


export function handleVirtualFloorCancellationUnresolvable(event: VirtualFloorCancellationUnresolvableEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    $.state = 'CANCELLED_BECAUSE_UNRESOLVABLE';
    $.save();
  }
}

export function handleVirtualFloorCancellationFlagged(event: VirtualFloorCancellationFlaggedEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    $.state = 'CANCELLED_BECAUSE_FLAGGED';
    $.flaggingReason = event.params.reason;
    $.save();
  }
}

export function handleVirtualFloorResolution(event: VirtualFloorResolutionEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);

    // Map DoubleDice.sol#VirtualFloorResolutionType => schema.graphql#VirtualFloorState
    switch (event.params.resolutionType) {
      case 0: // VirtualFloorResolutionType.NoWinners
        $.state = 'CANCELLED_BECAUSE_RESOLVED_NO_WINNERS';
        break;
      case 1: // VirtualFloorResolutionType.SomeWinners
        $.state = 'RESOLVED_WINNERS';
        break;
    }

    const winningOutcomeId = `${virtualFloorId}-${event.params.winningOutcomeIndex}`;
    $.winningOutcome = winningOutcomeId;

    $.save();
  }
}

export function handleQuotaIncreases(event: QuotaIncreasesEvent): void {
  const quotaIncreases = event.params.increases;
  for (let i = 0; i < quotaIncreases.length; i++) {
    const userId = quotaIncreases[i].creator.toHex();
    const user = loadOrCreateEntity<User>(User.load, userId);
    user.maxConcurrentVirtualFloors += quotaIncreases[i].amount;
    user.save();
  }
}

export function handleQuotaDecreases(event: QuotaDecreasesEvent): void {
  const quotaDecreases = event.params.decreases;
  for (let i = 0; i < quotaDecreases.length; i++) {
    const userId = quotaDecreases[i].creator.toHex();
    const user = loadOrCreateEntity<User>(User.load, userId);
    user.maxConcurrentVirtualFloors -= quotaDecreases[i].amount;
    user.save();
  }
}
