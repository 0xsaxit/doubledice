/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import {
  Address,
  BigDecimal,
  BigInt,
  ethereum,
  log
} from '@graphprotocol/graph-ts';
import {
  CreationQuotaAdjustments as CreationQuotaAdjustmentsEvent,
  PaymentTokenWhitelistUpdate as PaymentTokenWhitelistUpdateEvent,
  ResultUpdate as ResultUpdateEvent,
  TransferBatch as TransferBatchEvent,
  TransferSingle as TransferSingleEvent,
  UserCommitment as UserCommitmentEvent,
  VirtualFloorCancellationFlagged as VirtualFloorCancellationFlaggedEvent,
  VirtualFloorCancellationUnresolvable as VirtualFloorCancellationUnresolvableEvent,
  VirtualFloorCreation as VirtualFloorCreationEvent,
  VirtualFloorResolution as VirtualFloorResolutionEvent
} from '../../generated/DoubleDice/DoubleDice';
import {
  IERC20Metadata
} from '../../generated/DoubleDice/IERC20Metadata';
import {
  Category,
  Opponent,
  Outcome,
  OutcomeTimeslot,
  OutcomeTimeslotTransfer,
  PaymentToken,
  ResultSource,
  Subcategory,
  User,
  UserOutcome,
  UserOutcomeTimeslot,
  VirtualFloor,
  VirtualFloorsAggregate
} from '../../generated/schema';
import {
  ResultUpdateAction,
  VirtualFloorResolutionType
} from '../../lib/helpers/sol-enums';
import { CHALLENGE_WINDOW_DURATION, SET_WINDOW_DURATION, SINGLETON_AGGREGATE_ENTITY_ID } from './constants';
import { createNewEntity, loadExistentEntity, loadOrCreateEntity } from './entities';
import { decodeMetadata } from './metadata';
import { paymentTokenAmountToBigDecimal, toDecimal } from './utils';

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
  log.warning('VirtualFloorCreation(id = {} = {})', [event.params.virtualFloorId.toString(), event.params.virtualFloorId.toHex()]);

  const aggregate = loadOrCreateEntity<VirtualFloorsAggregate>(VirtualFloorsAggregate.load, SINGLETON_AGGREGATE_ENTITY_ID);
  aggregate.totalVirtualFloorsCreated += 1;
  aggregate.save()

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

    // should only be done *after* User entity exists
    adjustUserConcurrentVirtualFloors($.owner, +1);

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
    $.tResultSetMax = event.params.tResolve.plus(SET_WINDOW_DURATION); // ToDo: Include this as event param tResultSetMax
    $.state = 'RUNNING_OR_CLOSED__RESULT_NONE';

    const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, $.paymentToken);

    const decimalBonusAmount = paymentTokenAmountToBigDecimal(event.params.bonusAmount, paymentToken.decimals);
    $.bonusAmount = decimalBonusAmount;
    $.totalSupply = $.totalSupply.plus(decimalBonusAmount);

    $.minCommitmentAmount = paymentTokenAmountToBigDecimal(event.params.minCommitmentAmount, paymentToken.decimals);
    $.maxCommitmentAmount = paymentTokenAmountToBigDecimal(event.params.maxCommitmentAmount, paymentToken.decimals);

    $.save();
  }

  {
    const opponents = metadata.opponents;
    for (let opponentIndex = 0; opponentIndex < opponents.length; opponentIndex++) {
      const opponent = opponents[opponentIndex];
      const title = opponent.title;
      const image = opponent.image;
      const opponentId = `${virtualFloorId}-${opponentIndex}`;
      {
        const $ = createNewEntity<Opponent>(Opponent.load, opponentId);
        $.virtualFloor = virtualFloorId;
        $.title = title;
        $.image = image;
        $.save();
      }
    }
  }

  {
    const resultSources = metadata.resultSources;
    for (let resultSourceIndex = 0; resultSourceIndex < resultSources.length; resultSourceIndex++) {
      const resultSource = resultSources[resultSourceIndex];
      const title = resultSource.title;
      const url = resultSource.url;
      const resultSourceId = `${virtualFloorId}-${resultSourceIndex}`;
      {
        const $ = createNewEntity<ResultSource>(ResultSource.load, resultSourceId);
        $.virtualFloor = virtualFloorId;
        $.title = title;
        $.url = url;
        $.save();
      }
    }
  }

  {
    const outcomes = metadata.outcomes;
    assert(
      outcomes.length == event.params.nOutcomes,
      'outcomeValues.length = ' + outcomes.length.toString()
      + ' != event.params.nOutcomes = ' + event.params.nOutcomes.toString());

    for (let outcomeIndex = 0; outcomeIndex < event.params.nOutcomes; outcomeIndex++) {
      const outcome = outcomes[outcomeIndex];
      const title = outcome.title;
      const outcomeId = `${virtualFloorId}-${outcomeIndex}`;
      {
        const $ = createNewEntity<Outcome>(Outcome.load, outcomeId);
        $.virtualFloor = virtualFloorId;
        $.title = title;
        $.index = outcomeIndex;
        $.save();
      }
    }
  }
}

export function handleUserCommitment(event: UserCommitmentEvent): void {
  let amount: BigDecimal;

  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, $.paymentToken);
    amount = paymentTokenAmountToBigDecimal(event.params.amount, paymentToken.decimals);

    $.totalSupply = $.totalSupply.plus(amount);
    $.save();
  }

  const beta = toDecimal(event.params.beta_e18);

  const amountTimesBeta = amount.times(beta);

  const outcomeId = `${virtualFloorId}-${event.params.outcomeIndex}`;
  {
    const $ = loadExistentEntity<Outcome>(Outcome.load, outcomeId);
    $.totalSupply = $.totalSupply.plus(amount);
    $.totalWeightedSupply = $.totalWeightedSupply.plus(amountTimesBeta);
    $.save();
  }

  const outcomeTimeslotId = event.params.tokenId.toHex(); // ToDo: To 32 bytes
  {
    const $ = loadOrCreateEntity<OutcomeTimeslot>(OutcomeTimeslot.load, outcomeTimeslotId);
    /* if (isNew) */ {
      $.outcome = outcomeId;
      $.timeslot = event.params.timeslot;
      $.beta = beta;
    }
    $.totalSupply = $.totalSupply.plus(amount);
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
    $.totalBalance = $.totalBalance.plus(amount);
    $.totalWeightedBalance = $.totalWeightedBalance.plus(amountTimesBeta);
    $.save();
  }

  const userOutcomeTimeslotId = `${outcomeTimeslotId}-${userId}`;
  {
    const $ = loadOrCreateEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, userOutcomeTimeslotId);
    /* if (isNew) */ {
      $.user = userId;
      $.outcome = outcomeId;
      $.timeslot = event.params.timeslot;
      $.outcomeTimeslot = outcomeTimeslotId;
    }
    $.balance = $.balance.plus(amount);
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
  if (event.params.from.equals(Address.zero()) || event.params.to.equals(Address.zero())) {
    log.warning(
      'Ignoring TransferSingle(from={}, to={}, id={}) because it is mint or burn',
      [event.params.from.toHex(), event.params.to.toHex(), event.params.id.toHex()]
    );
    return;
  }
  handleTransfers(event, event.params.from, event.params.to, [event.params.id], [event.params.value]);
}

export function handleTransferBatch(event: TransferBatchEvent): void {
  if (event.params.from.equals(Address.zero()) || event.params.to.equals(Address.zero())) {
    log.warning(
      'Ignoring TransferBatch(from={}, to={}) because it is mint or burn',
      [event.params.from.toHex(), event.params.to.toHex()]
    );
    return;
  }
  handleTransfers(event, event.params.from, event.params.to, event.params.ids, event.params.values);
}

function handleTransfers(event: ethereum.Event, from: Address, to: Address, ids: BigInt[], values: BigInt[]): void {
  assert(ids.length == values.length);

  const fromUserId = from.toHex();
  {
    loadOrCreateEntity<User>(User.load, fromUserId);
  }

  const toUserId = to.toHex();
  {
    loadOrCreateEntity<User>(User.load, toUserId);
  }

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const value = values[i];

    let amount: BigDecimal;

    let beta: BigDecimal;
    let outcomeId: string;
    const outcomeTimeslotId = id.toHex();
    {
      const outcomeTimeslot = loadExistentEntity<OutcomeTimeslot>(OutcomeTimeslot.load, outcomeTimeslotId);
      outcomeId = outcomeTimeslot.outcome;
      const outcome = loadExistentEntity<Outcome>(Outcome.load, outcomeId);
      const virtualFloor = loadExistentEntity<VirtualFloor>(VirtualFloor.load, outcome.virtualFloor);
      const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, virtualFloor.paymentToken);
      amount = paymentTokenAmountToBigDecimal(value, paymentToken.decimals);
      beta = outcomeTimeslot.beta;
    }

    const toUserOutcomeTimeslotId = `${outcomeTimeslotId}-${toUserId}`;
    {
      const $ = loadExistentEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, toUserOutcomeTimeslotId);
      $.balance = $.balance.minus(amount);
      $.save();
    }

    const fromUserOutcomeTimeslotId = `${outcomeTimeslotId}-${fromUserId}`;
    {
      const $ = loadExistentEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, fromUserOutcomeTimeslotId);
      $.balance = $.balance.plus(amount);
      $.save();
    }

    const posOfEventInTx = event.transactionLogIndex;
    const outcomeTimeslotTransferId = `${outcomeTimeslotId}-${event.transaction.hash.toHex()}-${posOfEventInTx}-${i}`;
    {
      const $ = createNewEntity<OutcomeTimeslotTransfer>(OutcomeTimeslotTransfer.load, outcomeTimeslotTransferId);
      $.outcomeTimeslot = outcomeTimeslotId;
      $.from = fromUserId;
      $.to = toUserId;
      $.timestamp = event.block.timestamp;
      $.amount = amount;
      $.save();
    }

    const amountTimesBeta = amount.times(beta);

    const fromUserOutcomeId = `${outcomeId}-${fromUserId}`;
    {
      const $ = loadExistentEntity<UserOutcome>(UserOutcome.load, fromUserOutcomeId);
      $.totalBalance = $.totalBalance.minus(amount);
      $.totalWeightedBalance = $.totalWeightedBalance.minus(amountTimesBeta);
      $.save();
    }

    const toUserOutcomeId = `${outcomeId}-${toUserId}`;
    {
      const $ = loadExistentEntity<UserOutcome>(UserOutcome.load, toUserOutcomeId);
      $.totalBalance = $.totalBalance.plus(amount);
      $.totalWeightedBalance = $.totalWeightedBalance.plus(amountTimesBeta);
      $.save();
    }

  }
}


export function handleVirtualFloorCancellationUnresolvable(event: VirtualFloorCancellationUnresolvableEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    adjustUserConcurrentVirtualFloors($.owner, -1);
    $.state = 'CANCELLED_BECAUSE_UNRESOLVABLE';
    $.save();
  }
}

export function handleVirtualFloorCancellationFlagged(event: VirtualFloorCancellationFlaggedEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    adjustUserConcurrentVirtualFloors($.owner, -1);
    $.state = 'CANCELLED_BECAUSE_FLAGGED';
    $.flaggingReason = event.params.reason;
    $.save();
  }
}

export function handleVirtualFloorResolution(event: VirtualFloorResolutionEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);

    adjustUserConcurrentVirtualFloors($.owner, -1);

    switch (event.params.resolutionType) {
      case VirtualFloorResolutionType.NoWinners:
        $.state = 'CANCELLED_BECAUSE_RESOLVED_NO_WINNERS';
        break;
      case VirtualFloorResolutionType.Winners:
        $.state = 'RESOLVED_WINNERS';
        break;
    }

    const winningOutcomeId = `${virtualFloorId}-${event.params.winningOutcomeIndex}`;
    $.winningOutcome = winningOutcomeId;

    $.save();
  }
}


export function handleCreationQuotaAdjustments(event: CreationQuotaAdjustmentsEvent): void {
  const adjustments = event.params.adjustments;
  for (let i = 0; i < adjustments.length; i++) {
    const userId = adjustments[i].creator.toHex();
    const user = loadOrCreateEntity<User>(User.load, userId);
    user.maxConcurrentVirtualFloors = user.maxConcurrentVirtualFloors.plus(adjustments[i].relativeAmount);
    user.save();
  }
}

function adjustUserConcurrentVirtualFloors(userId: string, adjustment: i32): void {
  const user = loadExistentEntity<User>(User.load, userId);
  user.concurrentVirtualFloors = user.concurrentVirtualFloors.plus(BigInt.fromI32(adjustment));
  user.save();
}

export function handleResultUpdate(event: ResultUpdateEvent): void {
  const vfEntityId = event.params.vfId.toHex();
  const vf = loadExistentEntity<VirtualFloor>(VirtualFloor.load, vfEntityId);
  const winningOutcomeId = `${vfEntityId}-${event.params.outcomeIndex}`;
  vf.winningOutcome = winningOutcomeId;

  switch (event.params.action) {
    case ResultUpdateAction.CreatorSetResult:
      vf.state = 'RUNNING_OR_CLOSED__RESULT_SET';
      vf.tResultChallengeMax = event.block.timestamp.plus(CHALLENGE_WINDOW_DURATION); // ToDo: Include this as event param tChallengeMax
      break;
    case ResultUpdateAction.SomeoneChallengedSetResult: {
      vf.state = 'RUNNING_OR_CLOSED__RESULT_CHALLENGED';

      const challengerUserId = event.params.operator.toHex();
      loadOrCreateEntity<User>(User.load, challengerUserId);
      vf.challenger = challengerUserId;

      break;
    }
    case ResultUpdateAction.AdminFinalizedUnsetResult:
    case ResultUpdateAction.SomeoneConfirmedUnchallengedResult:
    case ResultUpdateAction.AdminFinalizedChallenge:
      // No need to handle these, as these will all result in a separate `VirtualFloorResultion` event,
      // which will be handled by `handleVirtualFloorResultion`
      break;
  }
  vf.save();
}
