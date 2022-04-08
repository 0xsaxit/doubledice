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
  Outcome as VfOutcome,
  OutcomeTimeslot as VfOutcomeTimeslot,
  OutcomeTimeslotTransfer as VfOutcomeTimeslotTransfer,
  PaymentToken,
  User,
  VirtualFloor as Vf,
  VirtualFloorsAggregate
} from '../../generated/schema';
import {
  ResultUpdateAction,
  VirtualFloorResolutionType
} from '../../lib/helpers/sol-enums';
import {
  CHALLENGE_WINDOW_DURATION,
  SET_WINDOW_DURATION,
  SINGLETON_AGGREGATE_ENTITY_ID
} from './constants';
import {
  assertCategoryEntity,
  assertSubcategoryEntity,
  assertUserEntity,
  assertVfOutcomeTimeslotEntity,
  assertVfOutcomeTimeslotUserEntity,
  assertVfOutcomeUserEntity,
  assertVfUserEntity,
  createNewEntity,
  createVfOpponentEntity,
  createVfOutcomeEntity,
  createVfResultSourceEntity,
  genVfEntityId,
  genVfOutcomeTimeslotEntityId,
  loadExistentEntity,
  loadExistentVfEntity,
  loadExistentVfOutcomeEntity,
  loadOrCreateEntity
} from './entities';
import {
  decodeMetadata
} from './metadata';
import {
  resultUpdateActionEnumToString,
  resultUpdateActionOrdinalToEnum
} from './result-update-action';
import {
  toBigDecimal
} from './utils';

// Manually mirrored from schema.graphql
const VirtualFloorState__Active_ResultChallenged = 'Active_ResultChallenged';
const VirtualFloorState__Active_ResultNone = 'Active_ResultNone';
const VirtualFloorState__Active_ResultSet = 'Active_ResultSet';
const VirtualFloorState__Claimable_Payouts = 'Claimable_Payouts';
const VirtualFloorState__Claimable_Refunds_Flagged = 'Claimable_Refunds_Flagged';
const VirtualFloorState__Claimable_Refunds_ResolvableNever = 'Claimable_Refunds_ResolvableNever';
const VirtualFloorState__Claimable_Refunds_ResolvedNoWinners = 'Claimable_Refunds_ResolvedNoWinners';

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
  // Although this is "info" or "debug", we log as "warning" as it is easier to find because there are less
  log.warning('Creating VirtualFloorCreation({})...', [event.params.virtualFloorId.toString()]);

  {
    const aggregate = loadOrCreateEntity<VirtualFloorsAggregate>(VirtualFloorsAggregate.load, SINGLETON_AGGREGATE_ENTITY_ID);
    aggregate.totalVirtualFloorsCreated += 1;
    aggregate.save();
  }

  const metadata = decodeMetadata(event.params.metadata);

  const vfId = genVfEntityId(event.params.virtualFloorId);

  const vf = createNewEntity<Vf>(Vf.load, vfId);

  const category = assertCategoryEntity(metadata.category);
  vf.category = category.id;

  const subcategory = assertSubcategoryEntity(category, metadata.subcategory);
  vf.subcategory = subcategory.id;

  vf.intId = event.params.virtualFloorId;
  vf.title = metadata.title;
  vf.description = metadata.description;
  vf.isListed = metadata.isListed;
  vf.discordChannelId = metadata.discordChannelId;

  const creator = assertUserEntity(event.params.creator);
  vf.creator = creator.id;
  vf.owner = creator.id; // Deprecated
  adjustUserConcurrentVirtualFloors(creator, +1);

  // Since the platform contract will reject VirtualFloors created with a PaymentToken that is not whitelisted,
  // we are sure that the PaymentToken entity referenced here will have always been created beforehand
  // when the token was originally whitelisted.
  vf.paymentToken = event.params.paymentToken.toHex();

  vf.betaOpen = toBigDecimal(event.params.betaOpen_e18);
  vf.creationFeeRate = toBigDecimal(event.params.creationFeeRate_e18);
  vf.platformFeeRate = toBigDecimal(event.params.platformFeeRate_e18);
  vf.tCreated = event.block.timestamp;
  vf.tOpen = event.params.tOpen;
  vf.tClose = event.params.tClose;
  vf.tResolve = event.params.tResolve;
  vf.tResultSetMin = event.params.tResolve;
  vf.tResultSetMax = event.params.tResolve.plus(SET_WINDOW_DURATION); // ToDo: Include this as event param tResultSetMax
  vf.state = VirtualFloorState__Active_ResultNone;

  const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, vf.paymentToken);

  const decimalBonusAmount = toBigDecimal(event.params.bonusAmount, paymentToken.decimals);
  vf.bonusAmount = decimalBonusAmount;
  vf.totalSupply = vf.totalSupply.plus(decimalBonusAmount);

  vf.minCommitmentAmount = toBigDecimal(event.params.minCommitmentAmount, paymentToken.decimals);
  vf.maxCommitmentAmount = toBigDecimal(event.params.maxCommitmentAmount, paymentToken.decimals);

  vf.save();

  for (let i = 0; i < metadata.opponents.length; i++) {
    createVfOpponentEntity(vf, i, metadata.opponents[i].title, metadata.opponents[i].image);
  }

  for (let i = 0; i < metadata.resultSources.length; i++) {
    createVfResultSourceEntity(vf, i, metadata.resultSources[i].title, metadata.resultSources[i].url);
  }

  assert(metadata.outcomes.length == event.params.nOutcomes, `metadata.outcomes.length = ${metadata.outcomes.length} != event.params.nOutcomes = ${event.params.nOutcomes}`);
  for (let i = 0; i < metadata.outcomes.length; i++) {
    createVfOutcomeEntity(vf, i, metadata.outcomes[i].title);
  }
}

function convertPaymentTokenAmountToDecimal(vf: Vf, amount: BigInt): BigDecimal {
  const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, vf.paymentToken);
  return toBigDecimal(amount, paymentToken.decimals);
}

export function handleUserCommitment(event: UserCommitmentEvent): void {
  const vfOutcome = loadExistentVfOutcomeEntity(event.params.virtualFloorId, event.params.outcomeIndex);

  const beta = toBigDecimal(event.params.beta_e18);
  assertVfOutcomeTimeslotEntity(vfOutcome, event.params.timeslot, event.params.tokenId, beta);

  const fromUser = Address.zero();

  // Note: We use an explicit `committer` param rather than relying on the underlying `event.transaction.from`
  // as if the transaction were being relayed by a 3rd party,
  // the commitment would be mistakenly attributed to the relayer.
  const toUser = event.params.committer;

  // Possibly this handler could simply instantiate the entities and exit at this point,
  // and then let the balances be updated in the handleTransferSingle executed
  // soon after during the same transaction.
  // But this would make the code depend on the ordering of events.
  // It might work, but it needs to be tested.
  // So instead, we update the balances right here,
  // and then during the handling of transfers, we skip mints.
  handleTransfers(event, fromUser, toUser, [event.params.tokenId], [event.params.amount]);
}

export function handleTransferSingle(event: TransferSingleEvent): void {
  // For mints, do not handle TransferSingle event itself, as this is already handled in handleUserCommitment
  if (event.params.from.equals(Address.zero())) {
    return;
  }
  handleTransfers(event, event.params.from, event.params.to, [event.params.id], [event.params.value]);
}

export function handleTransferBatch(event: TransferBatchEvent): void {
  // For mints, do not handle TransferBatch event itself, as this is already handled in handleUserCommitment
  if (event.params.from.equals(Address.zero())) {
    return;
  }
  handleTransfers(event, event.params.from, event.params.to, event.params.ids, event.params.values);
}

function handleTransfers(event: ethereum.Event, fromAddr: Address, toAddr: Address, ids: BigInt[], values: BigInt[]): void {
  assert(ids.length == values.length);

  const isMint = fromAddr.equals(Address.zero());

  const fromUser = assertUserEntity(fromAddr);
  const toUser = assertUserEntity(toAddr);

  for (let i = 0; i < ids.length; i++) {
    const tokenId = ids[i];
    const value = values[i];

    const vfOutcomeTimeslot = loadExistentEntity<VfOutcomeTimeslot>(VfOutcomeTimeslot.load, genVfOutcomeTimeslotEntityId(tokenId));
    const vfOutcome = loadExistentEntity<VfOutcome>(VfOutcome.load, vfOutcomeTimeslot.outcome);
    const vf = loadExistentEntity<Vf>(Vf.load, vfOutcome.virtualFloor);

    const amount = convertPaymentTokenAmountToDecimal(vf, value);

    // We debit (credit -amount) the "from" hierarchy, and credit the "to" hierarchy.

    if (!isMint) {
      creditEntityHierarchy(vfOutcomeTimeslot, fromUser, amount.neg());
    }

    // Credit `to` even if it is address(0) and this is an ERC-1155 balance-burn,
    // as like that the totals will still remain under the VirtualFloor, Outcome, OutcomeTimeslot, etc.
    // They will be credited to address(0), so this address will eventually accumulate a lot of balance,
    // but it doesn't matter!
    // Doing it this way keeps things simple: the balance doesn't perish, it simply "changes ownership" to address(0)
    creditEntityHierarchy(vfOutcomeTimeslot, toUser, amount);

    const posOfEventInTx = event.transactionLogIndex;
    const outcomeTimeslotTransferEntityId = `${vfOutcomeTimeslot.id}-${event.transaction.hash.toHex()}-${posOfEventInTx}-${i}`;
    const vfOutcomeTimeslotTransfer = createNewEntity<VfOutcomeTimeslotTransfer>(VfOutcomeTimeslotTransfer.load, outcomeTimeslotTransferEntityId);
    vfOutcomeTimeslotTransfer.outcomeTimeslot = vfOutcomeTimeslot.id;
    vfOutcomeTimeslotTransfer.from = fromUser.id;
    vfOutcomeTimeslotTransfer.to = toUser.id;
    vfOutcomeTimeslotTransfer.timestamp = event.block.timestamp;
    vfOutcomeTimeslotTransfer.amount = amount;
    vfOutcomeTimeslotTransfer.save();
  }
}

function creditEntityHierarchy(vfOutcomeTimeslot: VfOutcomeTimeslot, user: User, amount: BigDecimal): void {
  const amountTimesBeta = amount.times(vfOutcomeTimeslot.beta);

  vfOutcomeTimeslot.totalSupply = vfOutcomeTimeslot.totalSupply.plus(amount);
  vfOutcomeTimeslot.save();

  const vfOutcome = loadExistentEntity<VfOutcome>(VfOutcome.load, vfOutcomeTimeslot.outcome);
  vfOutcome.totalSupply = vfOutcome.totalSupply.plus(amount);
  vfOutcome.totalWeightedSupply = vfOutcome.totalWeightedSupply.plus(amountTimesBeta);
  vfOutcome.save();

  const vf = loadExistentEntity<Vf>(Vf.load, vfOutcome.virtualFloor);
  vf.totalSupply = vf.totalSupply.plus(amount);
  vf.save();

  const vfOutcomeUser = assertVfOutcomeUserEntity(vfOutcome, user);
  vfOutcomeUser.totalBalance = vfOutcomeUser.totalBalance.plus(amount);
  vfOutcomeUser.totalWeightedBalance = vfOutcomeUser.totalWeightedBalance.plus(amountTimesBeta);
  vfOutcomeUser.save();

  const vfOutcomeTimeslotUser = assertVfOutcomeTimeslotUserEntity(vfOutcome, user, vfOutcomeTimeslot, vfOutcomeUser);
  vfOutcomeTimeslotUser.balance = vfOutcomeTimeslotUser.balance.plus(amount);
  vfOutcomeTimeslotUser.save();

  const vfUser = assertVfUserEntity(vf, user);
  vfUser.totalBalance = vfUser.totalBalance.plus(amount);
  vfUser.save();
}

export function handleVirtualFloorCancellationUnresolvable(event: VirtualFloorCancellationUnresolvableEvent): void {
  const vf = loadExistentVfEntity(event.params.virtualFloorId);
  const creator = loadExistentEntity<User>(User.load, vf.creator);
  adjustUserConcurrentVirtualFloors(creator, -1);
  vf.state = VirtualFloorState__Claimable_Refunds_ResolvableNever;
  vf.save();
}

export function handleVirtualFloorCancellationFlagged(event: VirtualFloorCancellationFlaggedEvent): void {
  const vf = loadExistentVfEntity(event.params.virtualFloorId);
  const creator = loadExistentEntity<User>(User.load, vf.creator);
  adjustUserConcurrentVirtualFloors(creator, -1);
  vf.state = VirtualFloorState__Claimable_Refunds_Flagged;
  vf.flaggingReason = event.params.reason;
  vf.save();
}

export function handleVirtualFloorResolution(event: VirtualFloorResolutionEvent): void {
  const vf = loadExistentVfEntity(event.params.virtualFloorId);
  const creator = loadExistentEntity<User>(User.load, vf.creator);
  adjustUserConcurrentVirtualFloors(creator, -1);
  switch (event.params.resolutionType) {
    case VirtualFloorResolutionType.NoWinners:
      vf.state = VirtualFloorState__Claimable_Refunds_ResolvedNoWinners;
      break;
    case VirtualFloorResolutionType.Winners:
      vf.state = VirtualFloorState__Claimable_Payouts;
      break;
  }
  vf.winningOutcome = loadExistentVfOutcomeEntity(event.params.virtualFloorId, event.params.winningOutcomeIndex).id;
  vf.winnerProfits = convertPaymentTokenAmountToDecimal(vf, event.params.winnerProfits);
  vf.save();
}

export function handleCreationQuotaAdjustments(event: CreationQuotaAdjustmentsEvent): void {
  const adjustments = event.params.adjustments;
  for (let i = 0; i < adjustments.length; i++) {
    const creator = assertUserEntity(adjustments[i].creator);
    creator.maxConcurrentVirtualFloors = creator.maxConcurrentVirtualFloors.plus(adjustments[i].relativeAmount);
    creator.save();
  }
}

function adjustUserConcurrentVirtualFloors(user: User, adjustment: i32): void {
  user.concurrentVirtualFloors = user.concurrentVirtualFloors.plus(BigInt.fromI32(adjustment));
  user.save();
}

export function handleResultUpdate(event: ResultUpdateEvent): void {
  const vf = loadExistentVfEntity(event.params.vfId);

  // ToDo: Overwrite this every time result is updated,
  // or write only final-result in it?
  // By overwriting every time, it is not possible to query Graph for history of what happened,
  // but only for latest result.
  vf.winningOutcome = loadExistentVfOutcomeEntity(event.params.vfId, event.params.outcomeIndex).id;

  const action = resultUpdateActionOrdinalToEnum(event.params.action);

  switch (action) {
    case ResultUpdateAction.CreatorSetResult:
      vf.state = VirtualFloorState__Active_ResultSet;
      vf.tResultChallengeMax = event.block.timestamp.plus(CHALLENGE_WINDOW_DURATION); // ToDo: Include this as event param tChallengeMax
      break;
    case ResultUpdateAction.SomeoneChallengedSetResult: {
      vf.state = VirtualFloorState__Active_ResultChallenged;
      vf.challenger = assertUserEntity(event.params.operator).id;
      break;
    }
    case ResultUpdateAction.AdminFinalizedUnsetResult:
    case ResultUpdateAction.SomeoneConfirmedUnchallengedResult:
    case ResultUpdateAction.AdminFinalizedChallenge:
      // No need to handle these, as these will all result in a separate `VirtualFloorResolution` event,
      // which will be handled by `handleVirtualFloorResultion`
      break;
  }

  vf.resultUpdateAction = resultUpdateActionEnumToString(action);

  vf.save();
}
